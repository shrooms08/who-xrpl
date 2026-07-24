import {
  SEAT_CLAIM_DROPS,
  seatMemo,
  type AccountInfo,
  type LedgerAdapter,
  type SeatClaimVerification,
  type SignRequest,
} from "./adapter";

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
}
