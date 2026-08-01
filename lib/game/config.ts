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

/** Phase timers, in seconds (spec §round structure). These are the DEFAULTS —
 *  each game snapshots them into its own GameConfig at start (host may override
 *  the discussion time), so the running game never reads these constants. */
export const TIMERS = {
  clueTurn: 45, // per living player's clue turn
  discussion: 120, // open chat
  vote: 30, // ejection vote
  guess: 15, // ejected imposter's single word guess
  reveal: 6, // ejection/guess result display before the round concludes
} as const;

// --- host-settable lobby settings (Gate 5 Part 3) ---------------------------

/** Discussion-time options the host can pick (seconds). Default 120. */
export const DISCUSSION_OPTIONS = [60, 90, 120, 180] as const;

/** Clue passes over the turn order before discussion opens. Default 1. */
export const CLUE_ROUNDS_OPTIONS = [1, 2] as const;

/** Selectable word-bank topics. `null` = Random (draw from the whole bank). */
export const TOPIC_CATEGORIES = [
  "food",
  "places",
  "objects",
  "animals",
  "occupations",
  "football",
] as const;
export type TopicCategory = (typeof TOPIC_CATEGORIES)[number];

/** Per-game configuration. Snapshotted from lobby settings (+ TIMERS defaults)
 *  at start and carried in GameState, so the pure engine stays deterministic:
 *  timings and clue-rounds are inputs, not ambient constants. */
export interface GameConfig {
  clueTurnSeconds: number;
  discussionSeconds: number;
  voteSeconds: number;
  guessSeconds: number;
  revealSeconds: number;
  clueRounds: number; // 1 or 2 — full passes over the turn order before discussion
}

/** Default config: current TIMERS + single clue round. */
export function defaultConfig(): GameConfig {
  return {
    clueTurnSeconds: TIMERS.clueTurn,
    discussionSeconds: TIMERS.discussion,
    voteSeconds: TIMERS.vote,
    guessSeconds: TIMERS.guess,
    revealSeconds: TIMERS.reveal,
    clueRounds: 1,
  };
}

/** Coerce raw/partial config (e.g. a persisted jsonb, possibly empty on older
 *  games) into a complete GameConfig, filling any missing field with its
 *  default. Never throws. */
export function sanitizeConfig(raw: unknown): GameConfig {
  const d = defaultConfig();
  if (!raw || typeof raw !== "object") return d;
  const r = raw as Record<string, unknown>;
  const num = (v: unknown, fallback: number) =>
    typeof v === "number" && Number.isFinite(v) ? v : fallback;
  return {
    clueTurnSeconds: num(r.clueTurnSeconds, d.clueTurnSeconds),
    discussionSeconds: num(r.discussionSeconds, d.discussionSeconds),
    voteSeconds: num(r.voteSeconds, d.voteSeconds),
    guessSeconds: num(r.guessSeconds, d.guessSeconds),
    revealSeconds: num(r.revealSeconds, d.revealSeconds),
    clueRounds: r.clueRounds === 2 ? 2 : 1,
  };
}

/** Build a game config from host lobby settings, clamping to allowed values so
 *  a bad DB value can never produce an out-of-range timer. */
export function configFromSettings(settings: {
  discussionSeconds?: number | null;
  clueRounds?: number | null;
}): GameConfig {
  const cfg = defaultConfig();
  const disc = settings.discussionSeconds;
  if (disc != null && (DISCUSSION_OPTIONS as readonly number[]).includes(disc)) {
    cfg.discussionSeconds = disc;
  }
  cfg.clueRounds = settings.clueRounds === 2 ? 2 : 1;
  return cfg;
}

// --- rewards (Gate 4, on-chain games only) ----------------------------------

/** Reward pot per on-chain game, in drops (1 XRP = 1_000_000 drops on testnet).
 *  Split equally among the winning side; the remainder (pot mod winners) goes to
 *  the first winner deterministically. Casual games pay nothing. */
export const GAME_POT_DROPS = 1_000_000;

/** Balance the payout (sponsor pot) wallet must retain on top of the pot before
 *  any payout runs — covers the XRPL account reserve + per-tx fees. If the pot
 *  balance < GAME_POT_DROPS + this, payouts are skipped gracefully (the game-end
 *  flow never crashes on a dry pot). */
export const PAYOUT_RESERVE_DROPS = 2_000_000;

/** Imposters for a game of `n` players. Throws outside the supported range. */
export function imposterCount(n: number): number {
  const bracket = IMPOSTER_SCALING.find((b) => n >= b.min && n <= b.max);
  if (!bracket) {
    throw new Error(`unsupported player count: ${n} (must be ${MIN_PLAYERS}–${MAX_PLAYERS})`);
  }
  return bracket.imposters;
}
