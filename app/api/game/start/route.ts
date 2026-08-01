import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { startGame } from "@/lib/game/orchestration";
import { MIN_PLAYERS } from "@/lib/game";

// Host-only game start with server-side enforcement (host, ≥4, ≤max, waiting).
export async function POST(req: Request) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const lobbyId = typeof body.lobbyId === "string" ? body.lobbyId : "";
  if (!lobbyId) return NextResponse.json({ error: "lobbyId required" }, { status: 400 });

  const { data: lobby } = await supabase
    .from("lobbies")
    .select("id, host_id, max_players, status, mode, discussion_seconds, clue_rounds, topic")
    .eq("id", lobbyId)
    .maybeSingle();
  if (!lobby) return NextResponse.json({ error: "not_found" }, { status: 404 });
  if (lobby.host_id !== user.id)
    return NextResponse.json({ error: "not_host" }, { status: 403 });
  if (lobby.status !== "waiting")
    return NextResponse.json({ error: "already_started" }, { status: 409 });

  const admin = createAdminClient();
  const { data: members } = await admin
    .from("lobby_players")
    .select("player_id")
    .eq("lobby_id", lobbyId);
  const n = members?.length ?? 0;
  if (n < MIN_PLAYERS || n > lobby.max_players)
    return NextResponse.json({ error: "bad_player_count" }, { status: 409 });

  // On-chain lobbies: every starting player must hold a LIVE seat claim — a
  // verified seat_claim not superseded by a later seat_unclaim (wallet disconnect).
  if (lobby.mode === "onchain") {
    const { data: events } = await admin
      .from("ledger_events")
      .select("player_id, event_type, verified, created_at")
      .eq("lobby_id", lobbyId)
      .in("event_type", ["seat_claim", "seat_unclaim"]);
    const claimAt = new Map<string, number>();
    const unclaimAt = new Map<string, number>();
    for (const r of events ?? []) {
      if (!r.player_id) continue;
      const t = Date.parse(r.created_at);
      if (r.event_type === "seat_claim" && r.verified) {
        claimAt.set(r.player_id, Math.max(claimAt.get(r.player_id) ?? 0, t));
      } else if (r.event_type === "seat_unclaim") {
        unclaimAt.set(r.player_id, Math.max(unclaimAt.get(r.player_id) ?? 0, t));
      }
    }
    const claimed = new Set(
      [...claimAt.entries()]
        .filter(([pid, ct]) => (unclaimAt.get(pid) ?? -1) < ct)
        .map(([pid]) => pid),
    );
    const unclaimed = (members ?? []).some((m) => !claimed.has(m.player_id));
    if (unclaimed)
      return NextResponse.json({ error: "seat_claims_incomplete" }, { status: 409 });
  }

  try {
    const gameId = await startGame(admin, lobbyId, lobby.max_players, {
      discussionSeconds: lobby.discussion_seconds,
      clueRounds: lobby.clue_rounds,
      topic: lobby.topic,
    });
    return NextResponse.json({ gameId });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 409 });
  }
}
