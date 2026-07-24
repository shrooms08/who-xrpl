import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import { createAdminClient } from "@/lib/supabase/admin";
import { settleGameIfEnded } from "@/lib/ledger/payouts";
import { MockLedgerAdapter } from "@/lib/ledger/mock";
import type { PayoutResult } from "@/lib/ledger/adapter";
import { GAME_POT_DROPS, imposterCount } from "@/lib/game";

// Load .env.local for the service-role client (same as the game e2e).
const here = fileURLToPath(new URL(".", import.meta.url));
for (const line of readFileSync(resolve(here, "../../../.env.local"), "utf8").split("\n")) {
  const m = line.match(/^([A-Z_]+)=(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
}

type Admin = ReturnType<typeof createAdminClient>;
let admin: Admin;
const createdUsers: string[] = [];
const createdLobbies: string[] = [];
const createdGames: string[] = [];

/** Counting mock adapter: tallies payout() calls (across concurrent runners) and
 *  lets the test dial the pot balance. A tiny delay widens the race window so a
 *  concurrent double-settle genuinely overlaps at the claim CAS. */
class CountingAdapter extends MockLedgerAdapter {
  payoutCalls = 0;
  constructor(private readonly balance: bigint | null = 100_000_000n) {
    super();
  }
  async payoutPotBalanceDrops(): Promise<bigint | null> {
    return this.balance;
  }
  async payout(to: string, drops: string, memo: string): Promise<PayoutResult> {
    this.payoutCalls++;
    await new Promise((r) => setTimeout(r, 5));
    return super.payout(to, drops, memo);
  }
}

async function mkUsers(n: number): Promise<string[]> {
  const ids: string[] = [];
  for (let i = 0; i < n; i++) {
    const email = `e2e-payout-${Date.now()}-${Math.floor(Math.random() * 1e6)}-${i}@test.local`;
    const { data, error } = await admin.auth.admin.createUser({ email, email_confirm: true });
    if (error || !data.user) throw new Error(`createUser: ${error?.message}`);
    ids.push(data.user.id);
    createdUsers.push(data.user.id);
    await admin.from("profiles").insert({
      id: data.user.id,
      display_name: `P${i + 1}`,
      xrpl_address: `rTEST${data.user.id.replace(/-/g, "").slice(0, 25)}`,
    });
  }
  return ids;
}

/** Build an ended game directly (roles + winner set), skipping gameplay — the
 *  payout runner only reads games/lobbies/game_players/profiles. Imposters are
 *  the first imposterCount(players) users; the rest are crew. */
async function mkEndedGame(opts: {
  players: number;
  winner: "crew" | "imposter";
  mode?: "onchain" | "casual";
}): Promise<{ gameId: string; winnerIds: string[] }> {
  const { players, winner, mode = "onchain" } = opts;
  const userIds = await mkUsers(players);

  const code = `PZ${Math.floor(Math.random() * 1e4).toString().padStart(4, "0")}`;
  const { data: lobby, error: le } = await admin
    .from("lobbies")
    .insert({ code, host_id: userIds[0], max_players: players, status: "ended", mode })
    .select("id")
    .single();
  if (le || !lobby) throw new Error(`lobby: ${le?.message}`);
  createdLobbies.push(lobby.id);
  for (const uid of userIds) {
    await admin.from("lobby_players").insert({ lobby_id: lobby.id, player_id: uid });
  }

  const { data: game, error: ge } = await admin
    .from("games")
    .insert({ lobby_id: lobby.id, status: "ended", winner, current_round: 1, version: 1 })
    .select("id")
    .single();
  if (ge || !game) throw new Error(`game: ${ge?.message}`);
  createdGames.push(game.id);

  const imp = imposterCount(players);
  const roleAt = (i: number): "crew" | "imposter" => (i < imp ? "imposter" : "crew");
  for (let i = 0; i < players; i++) {
    await admin.from("game_players").insert({
      game_id: game.id,
      player_id: userIds[i],
      role: roleAt(i),
      alive: true,
      turn_order: i,
    });
  }
  const winnerIds = userIds.filter((_, i) => roleAt(i) === winner);
  return { gameId: game.id, winnerIds };
}

beforeAll(() => {
  admin = createAdminClient();
});

afterAll(async () => {
  for (const gid of createdGames) await admin.from("ledger_events").delete().eq("game_id", gid);
  for (const lid of createdLobbies) await admin.from("lobbies").delete().eq("id", lid); // cascades games/payouts/players
  for (const uid of createdUsers) await admin.auth.admin.deleteUser(uid).catch(() => {}); // cascades profiles
});

describe("payout runner (live DB)", () => {
  it("pays each winner exactly once under a concurrent double game-end", async () => {
    const { gameId, winnerIds } = await mkEndedGame({ players: 4, winner: "crew" });
    expect(winnerIds).toHaveLength(3); // 4p → 1 imposter, 3 crew

    const adapter = new CountingAdapter();
    // Fire the settlement TWICE concurrently — the retry/CAS discipline must
    // still submit exactly one tx per winner.
    await Promise.all([
      settleGameIfEnded(admin, gameId, adapter),
      settleGameIfEnded(admin, gameId, adapter),
    ]);

    expect(adapter.payoutCalls).toBe(winnerIds.length); // NO double-pay

    const { data: rows } = await admin
      .from("payouts")
      .select("player_id, status, tx_hash, amount_drops")
      .eq("game_id", gameId);
    expect(rows).toHaveLength(winnerIds.length);
    expect(rows!.every((r) => r.status === "sent")).toBe(true);
    // distinct tx hashes + shares conserve the pot
    expect(new Set(rows!.map((r) => r.tx_hash)).size).toBe(winnerIds.length);
    expect(rows!.reduce((s, r) => s + r.amount_drops, 0)).toBe(GAME_POT_DROPS);

    // exactly one 'payout' ledger event per winner (mirror is idempotent too)
    const { data: le } = await admin
      .from("ledger_events")
      .select("id")
      .eq("game_id", gameId)
      .eq("event_type", "payout");
    expect(le).toHaveLength(winnerIds.length);
  });

  it("re-settling an already-paid game adds nothing", async () => {
    const { gameId } = await mkEndedGame({ players: 4, winner: "crew" });
    const adapter = new CountingAdapter();
    await settleGameIfEnded(admin, gameId, adapter);
    expect(adapter.payoutCalls).toBe(3);
    // hit the end path again (refresh-spam) — no further submissions
    const again = await settleGameIfEnded(admin, gameId, adapter);
    expect(adapter.payoutCalls).toBe(3);
    expect(again.reason).toBe("already_settled");
  });

  it("awards the whole pot to a single imposter-side winner", async () => {
    const { gameId, winnerIds } = await mkEndedGame({ players: 4, winner: "imposter" });
    expect(winnerIds).toHaveLength(1);
    const adapter = new CountingAdapter();
    await settleGameIfEnded(admin, gameId, adapter);
    const { data: rows } = await admin
      .from("payouts")
      .select("amount_drops, status")
      .eq("game_id", gameId);
    expect(rows).toHaveLength(1);
    expect(rows![0].amount_drops).toBe(GAME_POT_DROPS);
    expect(rows![0].status).toBe("sent");
  });

  it("skips all payouts (never crashes) when the pot can't cover pot+reserve", async () => {
    const { gameId, winnerIds } = await mkEndedGame({ players: 4, winner: "crew" });
    const adapter = new CountingAdapter(1_000n); // 0.001 XRP — far below required
    const res = await settleGameIfEnded(admin, gameId, adapter);

    expect(res.reason).toBe("insufficient_pot");
    expect(adapter.payoutCalls).toBe(0);
    const { data: rows } = await admin
      .from("payouts")
      .select("status")
      .eq("game_id", gameId);
    expect(rows).toHaveLength(winnerIds.length);
    expect(rows!.every((r) => r.status === "skipped")).toBe(true);
    const { data: le } = await admin
      .from("ledger_events")
      .select("id")
      .eq("game_id", gameId)
      .eq("event_type", "payout_skipped_insufficient_pot");
    expect(le).toHaveLength(1);
  });

  it("does nothing for a casual game (zero ledger activity)", async () => {
    const { gameId } = await mkEndedGame({ players: 4, winner: "crew", mode: "casual" });
    const adapter = new CountingAdapter();
    const res = await settleGameIfEnded(admin, gameId, adapter);
    expect(res.reason).toBe("not_onchain");
    expect(adapter.payoutCalls).toBe(0);
    const { data: rows } = await admin.from("payouts").select("id").eq("game_id", gameId);
    expect(rows).toHaveLength(0);
  });
});
