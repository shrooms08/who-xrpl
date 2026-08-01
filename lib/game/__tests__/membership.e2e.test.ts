import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";
import { createAdminClient } from "@/lib/supabase/admin";
import { startGame } from "@/lib/game/orchestration";

// Load .env.local into process.env for the service-role + anon clients.
const here = fileURLToPath(new URL(".", import.meta.url));
for (const line of readFileSync(resolve(here, "../../../.env.local"), "utf8").split("\n")) {
  const m = line.match(/^([A-Z_]+)=(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
}
const SB_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SB_ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

type Admin = ReturnType<typeof createAdminClient>;
let admin: Admin;
const createdUsers: string[] = [];
const createdLobbies: string[] = [];

async function mkUser(i: number) {
  const email = `mem-${Date.now()}-${Math.floor(Math.random() * 1e6)}-${i}@test.local`;
  const password = `Pw!${Math.random().toString(36).slice(2)}Aa1`;
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (error || !data.user) throw new Error(`createUser: ${error?.message}`);
  createdUsers.push(data.user.id);
  await admin.from("profiles").insert({ id: data.user.id, display_name: `M${i + 1}` });
  return { id: data.user.id, email, password };
}

/** A Supabase client authenticated AS the given user (RLS applies as them). */
async function asUser(email: string, password: string): Promise<SupabaseClient<Database>> {
  const c = createClient<Database>(SB_URL, SB_ANON, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { error } = await c.auth.signInWithPassword({ email, password });
  if (error) throw new Error(`signIn: ${error.message}`);
  return c;
}

beforeAll(() => {
  admin = createAdminClient();
});
afterAll(async () => {
  for (const lid of createdLobbies) await admin.from("lobbies").delete().eq("id", lid);
  for (const uid of createdUsers) await admin.auth.admin.deleteUser(uid).catch(() => {});
});

// Gate 6 invariant: a player dealt into a game is a game member until game end,
// regardless of live lobby membership. The tonight-bug was is_game_member keying
// off lobby_players, so a presence-driven lobby_players delete 403'd every call.
describe("game membership survives lobby_players deletion (Gate 6)", () => {
  it("is_game_member stays true and state stays readable after the lobby row is deleted", async () => {
    const users = await Promise.all([0, 1, 2, 3].map(mkUser));
    const code = `M${Math.floor(Math.random() * 1e5).toString().padStart(5, "0")}`;
    const { data: lobby } = await admin
      .from("lobbies")
      .insert({ code, host_id: users[0].id, max_players: 4, status: "waiting" })
      .select("id")
      .single();
    if (!lobby) throw new Error("lobby create failed");
    createdLobbies.push(lobby.id);
    for (const u of users) {
      await admin.from("lobby_players").insert({ lobby_id: lobby.id, player_id: u.id });
    }
    const gameId = await startGame(admin, lobby.id, 4);

    // A NON-host dealt player, acting as themselves.
    const victim = users[1];
    const vc = await asUser(victim.email, victim.password);

    // sanity: a game member while still in the lobby
    expect((await vc.rpc("is_game_member", { p_game: gameId })).data).toBe(true);

    // simulate the OLD reaper deleting their lobby membership mid-game
    const del = await admin
      .from("lobby_players")
      .delete()
      .eq("lobby_id", lobby.id)
      .eq("player_id", victim.id);
    expect(del.error).toBeNull();

    // INVARIANT: still a game member (authGameMember gates every game route on this)
    expect((await vc.rpc("is_game_member", { p_game: gameId })).data).toBe(true);

    // and RLS still lets them READ game state (the refetch/poll path)
    const rounds = await vc.from("rounds").select("id, phase").eq("game_id", gameId);
    expect(rounds.error).toBeNull();
    expect((rounds.data ?? []).length).toBeGreaterThan(0);

    // and their role card (SECURITY DEFINER, gated on is_game_member) still resolves
    const rc = await vc.rpc("get_my_role_card", { p_game: gameId });
    expect(rc.error).toBeNull();
    expect(rc.data).toBeTruthy();

    // contrast: they are NOT a live lobby member anymore (deletion really happened)
    expect((await vc.rpc("is_lobby_member", { p_lobby: lobby.id })).data).toBe(false);

    await vc.auth.signOut();
  });
});
