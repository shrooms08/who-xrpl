import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  startGame,
  loadGameState,
  persist,
  advanceIfDue,
  mutateGame,
} from "@/lib/game/orchestration";
import {
  submitClue,
  submitVote,
  closeVote,
  submitGuess,
  concludeRound,
  startVote,
  currentCluePlayer,
  livingIds,
  livingImposters,
  livingCrew,
  allLivingVoted,
  makeRng,
  type GameState,
} from "@/lib/game";

// Load .env.local into process.env for the service-role client.
const here = fileURLToPath(new URL(".", import.meta.url));
for (const line of readFileSync(resolve(here, "../../../.env.local"), "utf8").split("\n")) {
  const m = line.match(/^([A-Z_]+)=(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
}

type Admin = ReturnType<typeof createAdminClient>;
let admin: Admin;
const createdUsers: string[] = [];
const createdLobbies: string[] = [];

async function mkUsers(n: number): Promise<string[]> {
  const ids: string[] = [];
  for (let i = 0; i < n; i++) {
    const email = `e2e-${Date.now()}-${Math.floor(Math.random() * 1e6)}-${i}@test.local`;
    const { data, error } = await admin.auth.admin.createUser({
      email,
      email_confirm: true,
    });
    if (error || !data.user) throw new Error(`createUser: ${error?.message}`);
    ids.push(data.user.id);
    createdUsers.push(data.user.id);
    await admin.from("profiles").insert({ id: data.user.id, display_name: `P${i + 1}` });
  }
  return ids;
}

async function mkLobby(userIds: string[]): Promise<string> {
  const code = `E${Math.floor(Math.random() * 1e5)
    .toString()
    .padStart(5, "0")}`;
  const { data: lobby, error } = await admin
    .from("lobbies")
    .insert({ code, host_id: userIds[0], max_players: userIds.length, status: "waiting" })
    .select("id")
    .single();
  if (error || !lobby) throw new Error(`lobby: ${error?.message}`);
  createdLobbies.push(lobby.id);
  for (const uid of userIds) {
    await admin.from("lobby_players").insert({ lobby_id: lobby.id, player_id: uid });
  }
  return lobby.id;
}

/** Drive a game to completion the way the routes do: load → engine → persist.
 *  Crew coordinates to eject one living imposter each round; ejected imposters
 *  guess wrong → the game ends in a crew win. */
async function driveToCrewWin(gameId: string): Promise<GameState> {
  for (let guard = 0; guard < 200; guard++) {
    const loaded = await loadGameState(admin, gameId);
    if (!loaded) throw new Error("no state");
    const { state, version } = loaded;
    if (state.phase === "end") return state;

    let next: GameState;
    switch (state.phase) {
      case "clue": {
        const p = currentCluePlayer(state)!;
        next = submitClue(state, p, `clue-${p.slice(0, 4)}`);
        break;
      }
      case "discussion":
        next = startVote(state);
        break;
      case "vote": {
        const target = livingImposters(state)[0].id;
        let s = state;
        for (const v of livingIds(s)) s = submitVote(s, v, target);
        next = closeVote(s);
        break;
      }
      case "guess":
        next = submitGuess(state, "definitely-wrong");
        break;
      case "reveal":
        next = concludeRound(state, makeRng(guard + 1));
        break;
      default:
        throw new Error(`unexpected phase ${state.phase}`);
    }
    const v = await persist(admin, gameId, version, next);
    if (v === -1) continue; // raced; reload
  }
  throw new Error("game did not terminate");
}

beforeAll(() => {
  admin = createAdminClient();
});

afterAll(async () => {
  // delete lobbies first — cascades games/rounds so no round FK blocks the user
  // delete (rounds.ejected_player_id / current_turn_player_id lack ON DELETE).
  for (const lobbyId of createdLobbies) {
    await admin.from("lobbies").delete().eq("id", lobbyId);
  }
  for (const uid of createdUsers) {
    await admin.auth.admin.deleteUser(uid).catch(() => {});
  }
});

describe("game e2e (live DB, real orchestration)", () => {
  it("4 players / 1 imposter — full game to a crew win", async () => {
    const users = await mkUsers(4);
    const lobbyId = await mkLobby(users);
    const gameId = await startGame(admin, lobbyId, 4);

    const { data: gp } = await admin
      .from("game_players")
      .select("role")
      .eq("game_id", gameId);
    expect(gp?.filter((r) => r.role === "imposter")).toHaveLength(1);

    const final = await driveToCrewWin(gameId);
    expect(final.phase).toBe("end");
    expect(final.winner).toBe("crew");

    const { data: game } = await admin
      .from("games")
      .select("status, winner")
      .eq("id", gameId)
      .single();
    expect(game?.status).toBe("ended");
    expect(game?.winner).toBe("crew");
  });

  it("6 players / 2 imposters — full game (fellow-imposter data, 2-imposter vote math)", async () => {
    const users = await mkUsers(6);
    const lobbyId = await mkLobby(users);
    const gameId = await startGame(admin, lobbyId, 6);

    const { data: gp } = await admin
      .from("game_players")
      .select("player_id, role")
      .eq("game_id", gameId);
    const imposters = (gp ?? []).filter((r) => r.role === "imposter");
    expect(imposters).toHaveLength(2);

    // fellow-imposter data path (what get_my_role_card serves the UI chip):
    // each imposter has exactly one *other* imposter.
    for (const imp of imposters) {
      const others = imposters.filter((o) => o.player_id !== imp.player_id);
      expect(others).toHaveLength(1);
    }

    const final = await driveToCrewWin(gameId);
    expect(final.phase).toBe("end");
    expect(final.winner).toBe("crew");
    expect(livingImposters(final)).toHaveLength(0);
    // ejecting 2 imposters takes ≥2 rounds → exercises the loop + vote math
    expect(final.round).toBeGreaterThanOrEqual(2);
  });

  it("timeout paths — overdue clue advances (server inserts (no clue))", async () => {
    const users = await mkUsers(4);
    const lobbyId = await mkLobby(users);
    const gameId = await startGame(admin, lobbyId, 4);

    const before = await loadGameState(admin, gameId);
    expect(before?.state.phase).toBe("clue");
    const turnPlayer = before!.state.order[before!.state.turnIndex];

    // force the current clue turn overdue
    await admin
      .from("rounds")
      .update({ phase_ends_at: new Date(Date.now() - 1000).toISOString() })
      .eq("game_id", gameId)
      .eq("round_number", before!.state.round);

    await advanceIfDue(admin, gameId);

    const after = await loadGameState(admin, gameId);
    // the timed-out player got a "(no clue)" and the turn moved on
    expect(after!.state.clues.some((c) => c.playerId === turnPlayer && c.text === "(no clue)")).toBe(true);
    expect(after!.state.turnIndex).toBe(before!.state.turnIndex + 1);
  });

  it("parallel advance — two simultaneous calls net EXACTLY one transition", async () => {
    const users = await mkUsers(4);
    const lobbyId = await mkLobby(users);
    const gameId = await startGame(admin, lobbyId, 4);

    const loaded = await loadGameState(admin, gameId);
    const roundNo = loaded!.state.round;

    const { data: g0 } = await admin.from("games").select("version").eq("id", gameId).single();
    // make the current phase overdue, then fire two advances at once
    await admin
      .from("rounds")
      .update({ phase_ends_at: new Date(Date.now() - 1000).toISOString() })
      .eq("game_id", gameId)
      .eq("round_number", roundNo);

    await Promise.all([advanceIfDue(admin, gameId), advanceIfDue(admin, gameId)]);

    const { data: g1 } = await admin.from("games").select("version").eq("id", gameId).single();
    // exactly one transition persisted despite two concurrent callers
    expect((g1!.version as number) - (g0!.version as number)).toBe(1);
  });

  it("concurrent votes: naive single-persist DROPS all but one (reproduces the bug)", async () => {
    const users = await mkUsers(4);
    const gameId = await startGame(admin, await mkLobby(users), 4);
    await toVotePhase(gameId);

    // Simulate the old route: every voter loads the SAME version, then persists.
    const base = await loadGameState(admin, gameId);
    if (!base) throw new Error("no state");
    const living = livingIds(base.state);
    const target = living[0];
    const results = await Promise.all(
      living.map((v) => persist(admin, gameId, base.version, submitVote(base.state, v, target))),
    );
    const landed = results.filter((r) => r !== -1).length;
    expect(landed).toBe(1); // 3 of 4 votes silently dropped by the CAS
  });

  it("concurrent votes via mutateGame: ALL register → plurality ejected (the fix)", async () => {
    const users = await mkUsers(4);
    const gameId = await startGame(admin, await mkLobby(users), 4);
    await toVotePhase(gameId);

    const before = await loadGameState(admin, gameId);
    if (!before) throw new Error("no state");
    const voters = livingIds(before.state);
    const target = livingCrew(before.state)[0].id; // eject a crew member (no guess phase)

    // all four vote at once through the retrying mutate path
    const outcomes = await Promise.all(
      voters.map((voter) =>
        mutateGame(admin, gameId, (s) => {
          if (s.phase !== "vote") throw new Error("wrong_phase");
          let next = submitVote(s, voter, target);
          if (allLivingVoted(next)) next = closeVote(next);
          return next;
        }),
      ),
    );
    // no vote was dropped
    expect(outcomes.every((o) => "ok" in o)).toBe(true);

    const after = await loadGameState(admin, gameId);
    expect(after!.state.phase).toBe("reveal");
    expect(after!.state.ejectedThisRound).toBe(target); // 4/4 plurality ejected
  });
});

/** Drive a fresh game from the deal to the start of its vote phase. */
async function toVotePhase(gameId: string): Promise<void> {
  for (let guard = 0; guard < 30; guard++) {
    const l = await loadGameState(admin, gameId);
    if (!l) throw new Error("no state");
    if (l.state.phase === "vote") return;
    if (l.state.phase === "clue") {
      const p = currentCluePlayer(l.state)!;
      await persist(admin, gameId, l.version, submitClue(l.state, p, `c-${p.slice(0, 4)}`));
    } else if (l.state.phase === "discussion") {
      await persist(admin, gameId, l.version, startVote(l.state));
    } else {
      throw new Error(`unexpected phase ${l.state.phase}`);
    }
  }
  throw new Error("never reached vote phase");
}
