// Pure game-engine types. No I/O, no framework, no ledger.

import type { GameConfig } from "./config";

export type Role = "crew" | "imposter";

export type Phase =
  | "clue"
  | "discussion"
  | "vote"
  | "reveal"
  | "guess"
  | "end";

export interface Player {
  id: string;
  role: Role;
  alive: boolean;
}

export interface Clue {
  playerId: string;
  text: string;
  pass: number; // which clue pass (0-based) over the turn order; 0 for single-round
}

export interface Vote {
  voterId: string;
  targetId: string | null; // null = explicit skip
}

export interface GameState {
  phase: Phase;
  word: string;
  category: string; // public to all players (crew + imposters)
  config: GameConfig; // per-game timings + clue rounds (immutable after deal)
  round: number;
  players: Player[];

  // clue phase
  order: string[]; // living players' turn order this round
  turnIndex: number; // pointer into `order`
  clues: Clue[]; // clues submitted this round

  // vote phase
  votes: Vote[];

  // reveal / guess
  ejectedThisRound: string | null;
  ejectedRole: Role | null;
  awaitingGuess: boolean; // an ejected imposter still owes a guess
  guessWasCorrect: boolean | null;

  // terminal
  winner: Role | null;
}

export type ClueError = "ok" | "too_long" | "empty" | "contains_word";
