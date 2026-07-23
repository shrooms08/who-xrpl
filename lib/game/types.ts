// Pure game-engine types. No I/O, no framework, no ledger.

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
}

export interface Vote {
  voterId: string;
  targetId: string | null; // null = explicit skip
}

export interface GameState {
  phase: Phase;
  word: string;
  category: string; // public to all players (crew + imposters)
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
