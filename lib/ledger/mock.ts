import {
  SEAT_CLAIM_DROPS,
  seatMemo,
  type AccountInfo,
  type LedgerAdapter,
  type PayoutResult,
  type SeatClaimVerification,
  type SignRequest,
} from "./adapter";

const toHex = (s: string) => Buffer.from(s, "utf8").toString("hex").toUpperCase();

// Instant-success adapter for dev/tests. No network, no signing — every request
// resolves immediately as "verified". Selected when LEDGER_ADAPTER !== "xrpl-testnet"
// (the Week-1 default), so casual play and the test suite need no XRPL access.
export class MockLedgerAdapter implements LedgerAdapter {
  readonly kind = "mock" as const;

  async createSeatClaimRequest(
    lobbyId: string,
    playerId: string,
  ): Promise<SignRequest> {
    return { id: `mock-seat-${lobbyId}-${playerId}` };
  }

  async resolveSeatClaim(requestId: string): Promise<{ txHash: string } | null> {
    return { txHash: `MOCKTX-${requestId}` };
  }

  async verifySeatClaim(txHash: string): Promise<SeatClaimVerification> {
    return {
      verified: true,
      txHash,
      account: "rMockPayerXXXXXXXXXXXXXXXXXXXXXXXX",
      deliveredDrops: SEAT_CLAIM_DROPS,
      memo: seatMemo("mock", "mock"),
    };
  }

  async getAccountInfo(address: string): Promise<AccountInfo> {
    return { address, exists: true, balanceDrops: "100000000" };
  }

  async createWalletLinkRequest(): Promise<SignRequest> {
    return { id: `mock-link-${Date.now()}` };
  }

  async resolveWalletLink(): Promise<{ address: string } | null> {
    return { address: "rMockWalletXXXXXXXXXXXXXXXXXXXXXXX" };
  }

  // Pot is always flush in mock so casual play + the test suite never skip.
  async payoutPotBalanceDrops(): Promise<bigint | null> {
    return 100_000_000n; // 100 XRP
  }

  // Deterministic, unique-per-payout hash: the memo (WHO?:payout:gameId:playerId)
  // is unique per payout, and hex-encoding it is a bijection, so the hash is
  // distinct per winner and satisfies ledger_events.tx_hash UNIQUE — with no
  // clock/random dependency, so tests stay repeatable.
  async payout(
    _to: string,
    drops: string,
    memo: string,
  ): Promise<PayoutResult> {
    return {
      ok: true,
      txHash: `MOCKPAYOUT-${toHex(memo)}`,
      deliveredDrops: drops,
    };
  }
}
