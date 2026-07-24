import { Client } from "xrpl";
import { XummSdk } from "xumm-sdk";
import {
  SEAT_CLAIM_DROPS,
  seatMemo,
  type AccountInfo,
  type LedgerAdapter,
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

  constructor() {
    const apiKey = process.env.XUMM_API_KEY;
    const apiSecret = process.env.XUMM_API_SECRET;
    this.network = process.env.XRPL_NETWORK ?? "wss://s.altnet.rippletest.net:51233";
    this.appAddress = process.env.XRPL_APP_ADDRESS ?? "";
    if (!apiKey || !apiSecret) throw new Error("XUMM_API_KEY / XUMM_API_SECRET not set");
    if (!this.appAddress) throw new Error("XRPL_APP_ADDRESS not set");
    this.xumm = new XummSdk(apiKey, apiSecret);
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

  async resolveSeatClaim(requestId: string): Promise<{ txHash: string } | null> {
    const payload = await this.xumm.payload.get(requestId);
    if (!payload || !payload.meta.signed || !payload.response.txid) return null;
    return { txHash: payload.response.txid };
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
}
