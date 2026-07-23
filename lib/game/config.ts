// ============================================================================
// WHO? — game configuration. The ONE place tunables live (spec: "Centralize
// this scaling in one config constant — it will be tuned after playtesting").
// ============================================================================

export const MIN_PLAYERS = 4;
export const MAX_PLAYERS = 10;

export const MAX_CLUE_LEN = 60;
export const NO_CLUE = "(no clue)";

/** Imposter count by lobby size. Brackets are inclusive and cover 4..10. */
export const IMPOSTER_SCALING: ReadonlyArray<{
  min: number;
  max: number;
  imposters: number;
}> = [
  { min: 4, max: 5, imposters: 1 },
  { min: 6, max: 7, imposters: 2 },
  { min: 8, max: 10, imposters: 3 },
];

/** Phase timers, in seconds (spec §round structure). */
export const TIMERS = {
  clueTurn: 45, // per living player's clue turn
  discussion: 120, // open chat
  vote: 30, // ejection vote
  guess: 15, // ejected imposter's single word guess
  reveal: 6, // ejection/guess result display before the round concludes
} as const;

/** Imposters for a game of `n` players. Throws outside the supported range. */
export function imposterCount(n: number): number {
  const bracket = IMPOSTER_SCALING.find((b) => n >= b.min && n <= b.max);
  if (!bracket) {
    throw new Error(`unsupported player count: ${n} (must be ${MIN_PLAYERS}–${MAX_PLAYERS})`);
  }
  return bracket.imposters;
}
