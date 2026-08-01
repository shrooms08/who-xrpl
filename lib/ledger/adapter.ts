// ============================================================================
// WHO? — Ledger adapter boundary. ALL XRPL / Xaman interaction lives behind this
// interface; game code depends only on the interface, never on xrpl.js/xumm.
// The concrete adapter is chosen by env var (see ./index).
// ============================================================================

export type LedgerKind = "mock" | "xrpl-testnet";

/** A sign request the client presents to the user (Xaman QR / deeplink). */
export interface SignRequest {
  id: string; // opaque request id (Xumm payload uuid, or a mock id)
  qrPng?: string; // QR image URL to scan with Xaman
  deeplink?: string; // deeplink to open Xaman directly
  wsStatus?: string; // websocket URL to observe resolution (Xumm)
  expiresAt?: string;
}

export interface SeatClaimVerification {
  verified: boolean;
  txHash?: string;
  account?: string; // the payer's address
  deliveredDrops?: string; // ALWAYS from meta.delivered_amount (see adapter)
  memo?: string;
  reason?: string; // populated when verified === false
}

/** The lifecycle of a sign request, resolved from the signing provider. A signed
 *  payload's tx still needs a few ledger closes to VALIDATE — "signed" is not yet
 *  "verified"; the caller must then verifySeatClaim(txHash) until it validates. */
export type SeatClaimResolution =
  | { state: "pending" } // not yet acted on in Xaman
  | { state: "signed"; txHash: string } // signed + submitted (may not be validated yet)
  | { state: "rejected" } // user declined the signature
  | { state: "expired" }; // payload expired unsigned

export interface AccountInfo {
  address: string;
  exists: boolean;
  balanceDrops?: string;
}

/** Result of a payout submission. `reason` (on failure) must NEVER carry a
 *  secret — it is persisted to the payouts table and shown in the admin view. */
export interface PayoutResult {
  ok: boolean;
  txHash?: string;
  deliveredDrops?: string; // from meta.delivered_amount on success
  reason?: string;
}

export interface LedgerAdapter {
  readonly kind: LedgerKind;

  // --- seat claim (spec core) ---------------------------------------------
  createSeatClaimRequest(gameId: string, playerId: string): Promise<SignRequest>;
  /** Resolve a sign request's lifecycle. A "signed" result carries the tx hash
   *  but does NOT mean validated — signed ≠ verified (see SeatClaimResolution). */
  resolveSeatClaim(requestId: string): Promise<SeatClaimResolution>;
  verifySeatClaim(txHash: string): Promise<SeatClaimVerification>;
  /** Reconcile against the ledger: find an already-submitted seat-claim payment
   *  carrying this lobby+player memo, so past/duplicate signs (or a claim made
   *  before a client crash) are adopted instead of re-signed. `payerAddress`
   *  scopes the search to the player's linked wallet; null → no search. Returns
   *  the first validated match, or null when none is found. */
  findSeatClaim(
    lobbyId: string,
    playerId: string,
    payerAddress: string | null,
  ): Promise<SeatClaimVerification | null>;
  getAccountInfo(address: string): Promise<AccountInfo>;

  // --- wallet link (Xaman sign-in) ----------------------------------------
  createWalletLinkRequest(): Promise<SignRequest>;
  resolveWalletLink(requestId: string): Promise<{ address: string } | null>;

  // --- payouts (Gate 4, SEND side) ----------------------------------------
  /** Current balance of the payout (sponsor pot) wallet, in drops. null when
   *  it cannot be determined (wallet unconfigured / unfunded / unreachable) —
   *  the runner treats null as "insufficient" and skips gracefully. */
  payoutPotBalanceDrops(): Promise<bigint | null>;
  /** Send `drops` from the payout wallet to `to`, tagged with `memo`. The seed
   *  and all signing stay INSIDE the adapter (server-only); game code only ever
   *  sees this interface. Returns the validated tx hash on success. */
  payout(to: string, drops: string, memo: string): Promise<PayoutResult>;
}

/** Minimal seat-claim payment: 12 drops = 0.000012 XRP. */
export const SEAT_CLAIM_DROPS = "12";

/** Memo tying a seat claim to a lobby + player (pre-game, so the id is the
 *  lobby id — there is no game row until the host starts). */
export function seatMemo(lobbyId: string, playerId: string): string {
  return `WHO?:seat:${lobbyId}:${playerId}`;
}

export function parseSeatMemo(
  memo: string,
): { lobbyId: string; playerId: string } | null {
  const m = memo.match(/^WHO\?:seat:([^:]+):([^:]+)$/);
  return m ? { lobbyId: m[1], playerId: m[2] } : null;
}

/** Memo tying a payout tx to the game + winning player. */
export function payoutMemo(gameId: string, playerId: string): string {
  return `WHO?:payout:${gameId}:${playerId}`;
}

export function parsePayoutMemo(
  memo: string,
): { gameId: string; playerId: string } | null {
  const m = memo.match(/^WHO\?:payout:([^:]+):([^:]+)$/);
  return m ? { gameId: m[1], playerId: m[2] } : null;
}
