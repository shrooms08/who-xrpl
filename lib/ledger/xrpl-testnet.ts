import { Client, Wallet } from "xrpl";
import { XummSdk } from "xumm-sdk";
import {
  SEAT_CLAIM_DROPS,
  seatMemo,
  type AccountInfo,
  type LedgerAdapter,
  type PayoutResult,
  type SeatClaimResolution,
  type SeatClaimVerification,
  type SignRequest,
} from "./adapter";

const toHex = (s: string) => Buffer.from(s, "utf8").toString("hex").toUpperCase();
const fromHex = (h: string) => Buffer.from(h, "hex").toString("utf8");

/** Read a tx field whether the `tx` response puts it at top level or under
 *  `tx_json` (varies across xrpl.js request shapes). */
function txField(result: Record<string, unknown>, key: string): unknown {
  if (result[key] !== undefined) return result[key];
  const inner = result["tx_json"] as Record<string, unknown> | undefined;
  return inner?.[key];
}

// Real testnet adapter: Xaman (Xumm) for signing, xrpl.js for ledger reads.
export class XrplTestnetAdapter implements LedgerAdapter {
  readonly kind = "xrpl-testnet" as const;
  private readonly network: string;
  private readonly appAddress: string;
  private readonly xumm: XummSdk;
  // Payout (hot) wallet — SEND side. Optional at construction so seat-claim /
  // wallet-link keep working even before a payout wallet is provisioned; payout()
  // returns a clean failure if it is missing rather than throwing at startup.
  private readonly payoutSeed: string | null;
  private readonly payoutAddress: string | null;

  constructor() {
    const apiKey = process.env.XUMM_API_KEY;
    const apiSecret = process.env.XUMM_API_SECRET;
    this.network = process.env.XRPL_NETWORK ?? "wss://s.altnet.rippletest.net:51233";
    this.appAddress = process.env.XRPL_APP_ADDRESS ?? "";
    if (!apiKey || !apiSecret) throw new Error("XUMM_API_KEY / XUMM_API_SECRET not set");
    if (!this.appAddress) throw new Error("XRPL_APP_ADDRESS not set");
    this.xumm = new XummSdk(apiKey, apiSecret);
    this.payoutSeed = process.env.XRPL_PAYOUT_SEED ?? null;
    this.payoutAddress = process.env.XRPL_PAYOUT_ADDRESS ?? null;
  }

  async createSeatClaimRequest(
    lobbyId: string,
    playerId: string,
  ): Promise<SignRequest> {
    const payload = await this.xumm.payload.create({
      txjson: {
        TransactionType: "Payment",
        Destination: this.appAddress,
        Amount: SEAT_CLAIM_DROPS, // drops, as a string
        Memos: [{ Memo: { MemoData: toHex(seatMemo(lobbyId, playerId)) } }],
      },
    });
    if (!payload) throw new Error("xumm payload creation failed");
    return {
      id: payload.uuid,
      qrPng: payload.refs.qr_png,
      deeplink: payload.next.always,
      wsStatus: payload.refs.websocket_status,
    };
  }

  async resolveSeatClaim(requestId: string): Promise<SeatClaimResolution> {
    const payload = await this.xumm.payload.get(requestId);
    if (!payload) return { state: "expired" }; // unknown/gone payload
    const meta = payload.meta;
    if (meta.signed && payload.response.txid) {
      return { state: "signed", txHash: payload.response.txid };
    }
    if (meta.expired) return { state: "expired" };
    // resolved-but-not-signed (or explicitly cancelled) = the user declined.
    if (meta.cancelled || (meta.resolved && !meta.signed)) return { state: "rejected" };
    return { state: "pending" }; // still awaiting action in Xaman
  }

  async verifySeatClaim(txHash: string): Promise<SeatClaimVerification> {
    const client = new Client(this.network);
    try {
      await client.connect();
      const resp = await client.request({ command: "tx", transaction: txHash });
      const result = resp.result as unknown as Record<string, unknown>;

      if (result.validated !== true) return { verified: false, reason: "not_validated" };
      if (txField(result, "TransactionType") !== "Payment")
        return { verified: false, reason: "not_payment" };
      if (txField(result, "Destination") !== this.appAddress)
        return { verified: false, reason: "wrong_destination" };

      // ── PARTIAL-PAYMENT SAFETY ──────────────────────────────────────────
      // ALWAYS trust meta.delivered_amount, NEVER the tx `Amount`. With the
      // tfPartialPayment flag a sender can specify a large `Amount` but actually
      // deliver far less; `delivered_amount` is what truly arrived at the app.
      const meta = result.meta as Record<string, unknown> | undefined;
      const delivered = meta?.delivered_amount ?? meta?.["DeliveredAmount"];
      if (typeof delivered !== "string")
        return { verified: false, reason: "no_delivered_amount" };
      if (BigInt(delivered) < BigInt(SEAT_CLAIM_DROPS))
        return { verified: false, reason: "insufficient_amount" };

      const memos = (txField(result, "Memos") as
        | { Memo: { MemoData?: string } }[]
        | undefined) ?? [];
      const memoHex = memos[0]?.Memo?.MemoData;
      const memo = memoHex ? fromHex(memoHex) : undefined;

      return {
        verified: true,
        txHash,
        account: txField(result, "Account") as string,
        deliveredDrops: delivered,
        memo,
      };
    } catch (e) {
      return { verified: false, reason: (e as Error).message };
    } finally {
      if (client.isConnected()) await client.disconnect();
    }
  }

  // Reconcile against the ledger: scan the payer's recent txns for a validated
  // Payment to the app address carrying THIS seat memo. Best-effort — any error
  // (unreachable node, unfunded payer) degrades to null so the caller falls back
  // to the create→sign path. Never throws.
  async findSeatClaim(
    lobbyId: string,
    playerId: string,
    payerAddress: string | null,
  ): Promise<SeatClaimVerification | null> {
    if (!payerAddress) return null;
    const wantMemo = seatMemo(lobbyId, playerId);
    const client = new Client(this.network);
    try {
      await client.connect();
      const resp = await client.request({
        command: "account_tx",
        account: payerAddress,
        ledger_index_min: -1,
        ledger_index_max: -1,
        limit: 50,
        forward: false, // most recent first
      });
      const txns =
        ((resp.result as unknown as { transactions?: unknown[] }).transactions ??
          []) as Record<string, unknown>[];
      const matches: SeatClaimVerification[] = [];
      for (const entry of txns) {
        if (entry.validated !== true) continue;
        const tx = (entry.tx ?? entry.tx_json ?? {}) as Record<string, unknown>;
        const meta = entry.meta as Record<string, unknown> | undefined;
        if (tx.TransactionType !== "Payment") continue;
        if (tx.Destination !== this.appAddress) continue;
        const memos = (tx.Memos as { Memo: { MemoData?: string } }[] | undefined) ?? [];
        const memoHex = memos[0]?.Memo?.MemoData;
        const memo = memoHex ? fromHex(memoHex) : undefined;
        if (memo !== wantMemo) continue;
        const delivered = meta?.delivered_amount ?? meta?.["DeliveredAmount"];
        if (typeof delivered !== "string" || BigInt(delivered) < BigInt(SEAT_CLAIM_DROPS)) {
          continue;
        }
        const hash = (entry.hash ?? tx.hash) as string | undefined;
        if (!hash) continue;
        matches.push({
          verified: true,
          txHash: hash,
          account: payerAddress,
          deliveredDrops: delivered,
          memo,
        });
      }
      if (matches.length === 0) return null;
      if (matches.length > 1) {
        // Duplicates from repeated signing: adopt the first, log the extras.
        console.warn(
          `[seat-claim] ${matches.length} matching payments for ${wantMemo}; adopting first, ignoring extras`,
        );
      }
      return matches[0];
    } catch (e) {
      console.warn(`[seat-claim] findSeatClaim failed: ${(e as Error).message}`);
      return null;
    } finally {
      if (client.isConnected()) await client.disconnect();
    }
  }

  async getAccountInfo(address: string): Promise<AccountInfo> {
    const client = new Client(this.network);
    try {
      await client.connect();
      const resp = await client.request({
        command: "account_info",
        account: address,
        ledger_index: "validated",
      });
      return {
        address,
        exists: true,
        balanceDrops: resp.result.account_data.Balance,
      };
    } catch {
      return { address, exists: false };
    } finally {
      if (client.isConnected()) await client.disconnect();
    }
  }

  async createWalletLinkRequest(): Promise<SignRequest> {
    const payload = await this.xumm.payload.create({
      txjson: { TransactionType: "SignIn" },
    });
    if (!payload) throw new Error("xumm sign-in payload creation failed");
    return {
      id: payload.uuid,
      qrPng: payload.refs.qr_png,
      deeplink: payload.next.always,
      wsStatus: payload.refs.websocket_status,
    };
  }

  async resolveWalletLink(requestId: string): Promise<{ address: string } | null> {
    const payload = await this.xumm.payload.get(requestId);
    if (!payload || !payload.meta.signed || !payload.response.account) return null;
    return { address: payload.response.account };
  }

  async payoutPotBalanceDrops(): Promise<bigint | null> {
    if (!this.payoutAddress) return null;
    const info = await this.getAccountInfo(this.payoutAddress);
    if (!info.exists || !info.balanceDrops) return null;
    return BigInt(info.balanceDrops);
  }

  // Sign + submit a Payment from the payout wallet. The seed is read here and
  // NOWHERE else; it is never logged and never placed in a returned `reason`.
  async payout(to: string, drops: string, memo: string): Promise<PayoutResult> {
    if (!this.payoutSeed || !this.payoutAddress) {
      return { ok: false, reason: "payout_wallet_not_configured" };
    }
    const client = new Client(this.network);
    try {
      await client.connect();
      const wallet = Wallet.fromSeed(this.payoutSeed);
      if (wallet.classicAddress !== this.payoutAddress) {
        // Misconfiguration guard: refuse rather than pay from an unexpected key.
        return { ok: false, reason: "payout_seed_address_mismatch" };
      }
      const prepared = await client.autofill({
        TransactionType: "Payment",
        Account: this.payoutAddress,
        Destination: to,
        Amount: drops, // drops, as a string
        Memos: [{ Memo: { MemoData: toHex(memo) } }],
      });
      const signed = wallet.sign(prepared);
      const res = await client.submitAndWait(signed.tx_blob);
      const meta = res.result.meta;
      const code =
        meta && typeof meta === "object"
          ? (meta as { TransactionResult?: string }).TransactionResult
          : undefined;
      if (code !== "tesSUCCESS") {
        return { ok: false, reason: code ?? "submit_failed" };
      }
      const delivered =
        meta && typeof meta === "object"
          ? (meta as { delivered_amount?: unknown }).delivered_amount
          : undefined;
      return {
        ok: true,
        txHash: res.result.hash,
        deliveredDrops: typeof delivered === "string" ? delivered : drops,
      };
    } catch (e) {
      // Guard against the (unlikely) case of a secret surfacing in a driver
      // error string — strip anything resembling the configured seed.
      const raw = (e as Error).message ?? "payout_error";
      const clean = this.payoutSeed ? raw.split(this.payoutSeed).join("«redacted»") : raw;
      return { ok: false, reason: clean.slice(0, 200) };
    } finally {
      if (client.isConnected()) await client.disconnect();
    }
  }
}
