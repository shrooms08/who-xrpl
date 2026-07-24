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
    .select("id, host_id, max_players, status, mode")
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

  // On-chain lobbies: every starting player must hold a verified seat claim.
  if (lobby.mode === "onchain") {
    const { data: claims } = await admin
      .from("ledger_events")
      .select("player_id")
      .eq("lobby_id", lobbyId)
      .eq("event_type", "seat_claim")
      .eq("verified", true);
    const claimed = new Set((claims ?? []).map((c) => c.player_id));
    const unclaimed = (members ?? []).some((m) => !claimed.has(m.player_id));
    if (unclaimed)
      return NextResponse.json({ error: "seat_claims_incomplete" }, { status: 409 });
  }

  try {
    const gameId = await startGame(admin, lobbyId, lobby.max_players);
    return NextResponse.json({ gameId });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 409 });
  }
}
