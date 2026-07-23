import "server-only"; // uses the service-role client — never bundle to the client
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "@/lib/database.types";
import {
  deal,
  submitClue,
  startVote,
  closeVote,
  submitGuess,
  concludeRound,
  currentCluePlayer,
  makeRng,
  pickWord,
  NO_CLUE,
  TIMERS,
  MIN_PLAYERS,
  type GameState,
} from "@/lib/game";

type Admin = SupabaseClient<Database>;

export interface LoadedGame {
  state: GameState;
  version: number;
  lobbyId: string;
  roundId: string;
  phaseEndsAt: string | null;
}

/** Seconds a phase is allowed to run; null = untimed (terminal). */
export function durationFor(phase: GameState["phase"]): number | null {
  switch (phase) {
    case "clue":
      return TIMERS.clueTurn;
    case "discussion":
      return TIMERS.discussion;
    case "vote":
      return TIMERS.vote;
    case "guess":
      return TIMERS.guess;
    case "reveal":
      return TIMERS.reveal;
    default:
      return null; // end
  }
}

/** Stable 32-bit seed from a string (FNV-1a) — deterministic per game. */
function seedFrom(str: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < str.length; i++) {
    h = Math.imul(h ^ str.charCodeAt(i), 16777619);
  }
  return h >>> 0;
}

/** Rebuild the engine GameState from the persisted rows (latest round). */
export async function loadGameState(
  admin: Admin,
  gameId: string,
): Promise<LoadedGame | null> {
  const { data: game } = await admin
    .from("games")
    .select("id, lobby_id, status, current_round, version, winner")
    .eq("id", gameId)
    .maybeSingle();
  if (!game) return null;

  const { data: secret } = await admin
    .from("game_secrets")
    .select("word, category")
    .eq("game_id", gameId)
    .maybeSingle();

  const { data: gps } = await admin
    .from("game_players")
    .select("player_id, role, alive")
    .eq("game_id", gameId);

  const { data: round } = await admin
    .from("rounds")
    .select("*")
    .eq("game_id", gameId)
    .order("round_number", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!secret || !round) return null;

  const { data: clues } = await admin
    .from("clues")
    .select("player_id, text, created_at")
    .eq("round_id", round.id)
    .order("created_at", { ascending: true });

  const { data: votes } = await admin
    .from("votes")
    .select("voter_id, target_id")
    .eq("round_id", round.id);

  const state: GameState = {
    phase: round.phase as GameState["phase"],
    word: secret.word,
    category: secret.category,
    round: round.round_number,
    players: (gps ?? []).map((p) => ({
      id: p.player_id,
      role: p.role,
      alive: p.alive,
    })),
    order: round.turn_order ?? [],
    turnIndex: round.turn_index,
    clues: (clues ?? []).map((c) => ({ playerId: c.player_id, text: c.text })),
    votes: (votes ?? []).map((v) => ({
      voterId: v.voter_id,
      targetId: v.target_id,
    })),
    ejectedThisRound: round.ejected_player_id,
    ejectedRole: round.ejected_role,
    awaitingGuess: round.awaiting_guess,
    guessWasCorrect: round.guess_correct,
    winner: game.winner,
  };

  return {
    state,
    version: game.version,
    lobbyId: game.lobby_id,
    roundId: round.id,
    phaseEndsAt: round.phase_ends_at,
  };
}

function serialize(state: GameState): Json {
  return {
    phase: state.phase,
    round: state.round,
    word: state.word,
    category: state.category,
    winner: state.winner,
    players: state.players.map((p) => ({
      id: p.id,
      role: p.role,
      alive: p.alive,
    })),
    order: state.order,
    turnIndex: state.turnIndex,
    currentTurnPlayerId: currentCluePlayer(state),
    clues: state.clues.map((c) => ({ playerId: c.playerId, text: c.text })),
    votes: state.votes.map((v) => ({ voterId: v.voterId, targetId: v.targetId })),
    ejectedThisRound: state.ejectedThisRound,
    ejectedRole: state.ejectedRole,
    awaitingGuess: state.awaitingGuess,
    guessWasCorrect: state.guessWasCorrect,
    phaseDurationSeconds: durationFor(state.phase),
  } as Json;
}

/** Atomically persist via the version-CAS RPC. Returns the new version, or -1
 *  if another writer advanced first (caller should treat as a no-op). */
export async function persist(
  admin: Admin,
  gameId: string,
  expectedVersion: number,
  state: GameState,
  isDeal = false,
): Promise<number> {
  const { data, error } = await admin.rpc("apply_game_state", {
    p_game: gameId,
    p_expected_version: expectedVersion,
    p_state: serialize(state),
    p_is_deal: isDeal,
  });
  if (error) throw new Error(error.message);
  return data as number;
}

/** Host-validated start: atomically claim the lobby, deal roles + word, persist. */
export async function startGame(
  admin: Admin,
  lobbyId: string,
  maxPlayers: number,
): Promise<string> {
  // atomic claim: only one starter flips waiting → in_game
  const { data: claimed } = await admin
    .from("lobbies")
    .update({ status: "in_game" })
    .eq("id", lobbyId)
    .eq("status", "waiting")
    .select("id");
  if (!claimed || claimed.length === 0) throw new Error("already_started");

  const { data: gps } = await admin
    .from("lobby_players")
    .select("player_id")
    .eq("lobby_id", lobbyId)
    .order("joined_at", { ascending: true });
  const playerIds = (gps ?? []).map((r) => r.player_id);

  if (playerIds.length < MIN_PLAYERS || playerIds.length > maxPlayers) {
    await admin.from("lobbies").update({ status: "waiting" }).eq("id", lobbyId);
    throw new Error("bad_player_count");
  }

  const { data: game, error } = await admin
    .from("games")
    .insert({ lobby_id: lobbyId, status: "active", current_round: 0, version: 0 })
    .select("id")
    .single();
  if (error || !game) {
    await admin.from("lobbies").update({ status: "waiting" }).eq("id", lobbyId);
    throw new Error("game_create_failed");
  }

  const rng = makeRng(seedFrom(game.id));
  const choice = pickWord(rng);
  const state = deal({ playerIds, word: choice.word, category: choice.category, rng });
  await persist(admin, game.id, 0, state, true);
  return game.id;
}

/**
 * Opportunistic, server-authoritative timer advance. Any authed request touching
 * a game may call this; it advances overdue phases (idempotent via the version
 * CAS — concurrent calls net exactly one advance). The loop lets a game that
 * sat overdue catch up a chain of immediately-due transitions on next contact.
 */
export async function advanceIfDue(admin: Admin, gameId: string): Promise<void> {
  for (let i = 0; i < 40; i++) {
    const loaded = await loadGameState(admin, gameId);
    if (!loaded) return;
    const { state, version, phaseEndsAt } = loaded;
    if (state.phase === "end" || !phaseEndsAt) return;
    if (new Date(phaseEndsAt).getTime() > Date.now()) return; // not due yet

    let next: GameState;
    switch (state.phase) {
      case "clue": {
        const p = currentCluePlayer(state);
        if (!p) return;
        next = submitClue(state, p, NO_CLUE);
        break;
      }
      case "discussion":
        next = startVote(state);
        break;
      case "vote":
        next = closeVote(state);
        break;
      case "guess":
        next = submitGuess(state, null);
        break;
      case "reveal":
        next = concludeRound(state, makeRng(seedFrom(`${gameId}:${state.round}`)));
        break;
      default:
        return;
    }

    const v = await persist(admin, gameId, version, next);
    if (v === -1) continue; // another writer advanced; reload and re-check
  }
}
