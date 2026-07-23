export type Role = "crew" | "imposter";
export type Phase =
  | "deal"
  | "clue"
  | "discussion"
  | "vote"
  | "reveal"
  | "guess"
  | "end";

export type RoleCard = {
  role: Role;
  category: string;
  word: string | null;
  fellow_imposters: { player_id: string; display_name: string | null }[] | null;
};

export type RosterPlayer = {
  player_id: string;
  display_name: string | null;
  alive: boolean;
  turn_order: number;
  role: Role | null;
};

export type RoundView = {
  id: string;
  round_number: number;
  phase: Phase;
  phase_ends_at: string | null;
  current_turn_player_id: string | null;
  turn_order: string[] | null;
  ejected_player_id: string | null;
  ejected_role: Role | null;
  awaiting_guess: boolean;
  guess_correct: boolean | null;
};

export type ClueView = { player_id: string; text: string };
export type ChatView = { id: string; player_id: string; content: string };

export const nameOf = (
  roster: RosterPlayer[],
  id: string | null,
): string => {
  if (!id) return "—";
  const p = roster.find((r) => r.player_id === id);
  return (p?.display_name ?? "Player").toUpperCase();
};

export const initialOf = (
  roster: RosterPlayer[],
  id: string | null,
): string => {
  const n = nameOf(roster, id);
  return n === "—" ? "?" : n[0];
};
