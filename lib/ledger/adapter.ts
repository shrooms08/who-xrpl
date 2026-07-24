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

export interface AccountInfo {
  address: string;
  exists: boolean;
  balanceDrops?: string;
}

export interface LedgerAdapter {
  readonly kind: LedgerKind;

  // --- seat claim (spec core) ---------------------------------------------
  createSeatClaimRequest(gameId: string, playerId: string): Promise<SignRequest>;
  /** Resolve a sign request into the on-ledger tx hash once the user has
   *  signed in Xaman (null if not yet signed). */
  resolveSeatClaim(requestId: string): Promise<{ txHash: string } | null>;
  verifySeatClaim(txHash: string): Promise<SeatClaimVerification>;
  getAccountInfo(address: string): Promise<AccountInfo>;

  // --- wallet link (Xaman sign-in) ----------------------------------------
  createWalletLinkRequest(): Promise<SignRequest>;
  resolveWalletLink(requestId: string): Promise<{ address: string } | null>;
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
