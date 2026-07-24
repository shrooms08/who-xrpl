// Pure pot-split math — no I/O, no server-only, no ledger. Kept separate from the
// runner so the split rule is unit-testable without touching the DB or adapter.

export interface PayoutShare {
  playerId: string;
  drops: string; // integer drops, as a decimal string
}

/**
 * Split `potDrops` equally among `winnerIds` (which MUST already be in the
 * canonical winner order). Every winner gets floor(pot / n) drops; the remainder
 * (pot mod n) is added to the FIRST winner deterministically, so the shares
 * always sum back to exactly the pot. Returns [] for no winners.
 */
export function splitPot(
  potDrops: number | bigint,
  winnerIds: readonly string[],
): PayoutShare[] {
  const n = winnerIds.length;
  if (n === 0) return [];
  const pot = BigInt(potDrops);
  const base = pot / BigInt(n);
  const remainder = pot % BigInt(n);
  return winnerIds.map((playerId, i) => ({
    playerId,
    drops: (base + (i === 0 ? remainder : 0n)).toString(),
  }));
}
