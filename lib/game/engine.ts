// ============================================================================
// WHO? — pure game engine. Deterministic, side-effect free, no I/O, no ledger.
// Every transition is a pure function: (state, action) -> new state. Randomness
// enters ONLY through an injected Rng (deal + turn order), so a given seed
// always produces the same game. The server orchestrator owns timers/persistence
// and calls these functions; it must never trust the client for any of this.
// ============================================================================

import {
  MAX_CLUE_LEN,
  MIN_PLAYERS,
  MAX_PLAYERS,
  imposterCount,
} from "./config";
import { shuffle, type Rng } from "./rng";
import type { ClueError, GameState, Player, Role, Vote } from "./types";

// --- selectors --------------------------------------------------------------

export const livingPlayers = (s: GameState): Player[] =>
  s.players.filter((p) => p.alive);
export const livingIds = (s: GameState): string[] =>
  livingPlayers(s).map((p) => p.id);
export const livingCrew = (s: GameState): Player[] =>
  s.players.filter((p) => p.alive && p.role === "crew");
export const livingImposters = (s: GameState): Player[] =>
  s.players.filter((p) => p.alive && p.role === "imposter");
export const imposterIds = (s: GameState): string[] =>
  s.players.filter((p) => p.role === "imposter").map((p) => p.id);
export const roleOf = (s: GameState, id: string): Role | undefined =>
  s.players.find((p) => p.id === id)?.role;
export const currentCluePlayer = (s: GameState): string | null =>
  s.phase === "clue" ? (s.order[s.turnIndex] ?? null) : null;

const normalize = (t: string) => t.trim().toLowerCase();

// --- role assignment --------------------------------------------------------

/** Assign `imposterCount(n)` imposters uniformly at random; crew otherwise. */
export function assignRoles(playerIds: readonly string[], rng: Rng): Player[] {
  const k = imposterCount(playerIds.length);
  const impostersSet = new Set(shuffle(playerIds, rng).slice(0, k));
  return playerIds.map((id) => ({
    id,
    role: impostersSet.has(id) ? "imposter" : "crew",
    alive: true,
  }));
}

// --- clue validation --------------------------------------------------------

/** Server-side clue check: non-empty, ≤60 chars, must not contain the word. */
export function clueError(text: string, word: string): ClueError {
  const t = text.trim();
  if (t.length === 0) return "empty";
  if (t.length > MAX_CLUE_LEN) return "too_long";
  if (t.toLowerCase().includes(word.toLowerCase())) return "contains_word";
  return "ok";
}

// --- vote tally -------------------------------------------------------------

/**
 * Plurality among votes for LIVING targets. Skips (null) are ignored. A unique
 * strict maximum is ejected; any tie for the top (or all-skips) → no ejection.
 */
export function tally(
  votes: readonly Vote[],
  living: readonly string[],
): { ejected: string | null; counts: Record<string, number> } {
  const livingSet = new Set(living);
  const counts: Record<string, number> = {};
  for (const v of votes) {
    if (v.targetId && livingSet.has(v.targetId)) {
      counts[v.targetId] = (counts[v.targetId] ?? 0) + 1;
    }
  }
  let max = 0;
  let leaders: string[] = [];
  for (const [id, n] of Object.entries(counts)) {
    if (n > max) {
      max = n;
      leaders = [id];
    } else if (n === max) {
      leaders.push(id);
    }
  }
  const ejected = max > 0 && leaders.length === 1 ? leaders[0] : null;
  return { ejected, counts };
}

// --- win check --------------------------------------------------------------

/** Crew win = no imposters left. Imposter win = imposters ≥ living crew. */
export function checkWinner(s: GameState): Role | null {
  const imps = livingImposters(s).length;
  const crew = livingCrew(s).length;
  if (imps === 0) return "crew";
  if (imps >= crew) return "imposter";
  return null;
}

// --- transitions ------------------------------------------------------------

export function deal(input: {
  playerIds: string[];
  word: string;
  category: string;
  rng: Rng;
}): GameState {
  const { playerIds, word, category, rng } = input;
  if (playerIds.length < MIN_PLAYERS || playerIds.length > MAX_PLAYERS) {
    throw new Error(`unsupported player count: ${playerIds.length}`);
  }
  if (new Set(playerIds).size !== playerIds.length) {
    throw new Error("duplicate player ids");
  }
  const players = assignRoles(playerIds, rng);
  const order = shuffle(playerIds, rng);
  return {
    phase: "clue",
    word,
    category,
    round: 1,
    players,
    order,
    turnIndex: 0,
    clues: [],
    votes: [],
    ejectedThisRound: null,
    ejectedRole: null,
    awaitingGuess: false,
    guessWasCorrect: null,
    winner: null,
  };
}

/** Record the current player's clue and advance. When the last living player
 *  has clued, the phase moves to discussion. Timeout → pass text = NO_CLUE. */
export function submitClue(
  s: GameState,
  playerId: string,
  text: string,
): GameState {
  if (s.phase !== "clue") throw new Error("not_clue_phase");
  if (currentCluePlayer(s) !== playerId) throw new Error("not_your_turn");
  const err = clueError(text, s.word);
  if (err !== "ok") throw new Error(err);

  const clues = [...s.clues, { playerId, text: text.trim() }];
  const turnIndex = s.turnIndex + 1;
  const done = turnIndex >= s.order.length;
  return { ...s, clues, turnIndex, phase: done ? "discussion" : "clue" };
}

/** Discussion timer elapsed → open the vote. */
export function startVote(s: GameState): GameState {
  if (s.phase !== "discussion") throw new Error("not_discussion_phase");
  return { ...s, phase: "vote", votes: [] };
}

/** Record/replace one living player's vote (targetId null = skip). */
export function submitVote(
  s: GameState,
  voterId: string,
  targetId: string | null,
): GameState {
  if (s.phase !== "vote") throw new Error("not_vote_phase");
  const living = new Set(livingIds(s));
  if (!living.has(voterId)) throw new Error("voter_not_living");
  if (targetId !== null && !living.has(targetId)) {
    throw new Error("target_not_living");
  }
  const votes = s.votes.filter((v) => v.voterId !== voterId);
  votes.push({ voterId, targetId });
  return { ...s, votes };
}

export const allLivingVoted = (s: GameState): boolean => {
  const voters = new Set(s.votes.map((v) => v.voterId));
  return livingIds(s).every((id) => voters.has(id));
};

/** Vote timer elapsed or all voted → tally, eject, and enter reveal/guess. */
export function closeVote(s: GameState, rng?: Rng): GameState {
  if (s.phase !== "vote") throw new Error("not_vote_phase");
  void rng;
  const { ejected } = tally(s.votes, livingIds(s));

  let players = s.players;
  let ejectedRole: Role | null = null;
  let awaitingGuess = false;

  if (ejected) {
    ejectedRole = roleOf(s, ejected) ?? null;
    awaitingGuess = ejectedRole === "imposter";
    players = players.map((p) =>
      p.id === ejected ? { ...p, alive: false } : p,
    );
  }

  return {
    ...s,
    players,
    ejectedThisRound: ejected,
    ejectedRole,
    awaitingGuess,
    guessWasCorrect: null,
    phase: awaitingGuess ? "guess" : "reveal",
  };
}

/** The ejected imposter's single guess (or timeout → text null). Correct guess
 *  ends the game for the imposters immediately; otherwise fall through to the
 *  reveal, where the round is concluded. */
export function submitGuess(s: GameState, text: string | null): GameState {
  if (s.phase !== "guess") throw new Error("not_guess_phase");
  const correct = text !== null && normalize(text) === normalize(s.word);
  if (correct) {
    return {
      ...s,
      phase: "end",
      winner: "imposter",
      awaitingGuess: false,
      guessWasCorrect: true,
    };
  }
  return { ...s, phase: "reveal", awaitingGuess: false, guessWasCorrect: false };
}

/** After the reveal, decide the game: a winner ends it; otherwise loop back to
 *  a fresh clue phase with the remaining players (same word). */
export function concludeRound(s: GameState, rng: Rng): GameState {
  if (s.phase !== "reveal") throw new Error("not_reveal_phase");
  const winner = checkWinner(s);
  if (winner) return { ...s, phase: "end", winner };

  const order = shuffle(livingIds(s), rng);
  return {
    ...s,
    phase: "clue",
    round: s.round + 1,
    order,
    turnIndex: 0,
    clues: [],
    votes: [],
    ejectedThisRound: null,
    ejectedRole: null,
    awaitingGuess: false,
    guessWasCorrect: null,
  };
}
