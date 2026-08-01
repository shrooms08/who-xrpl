import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import LobbyRoom, { type Member } from "./LobbyRoom";
import type { FaceSpec } from "@/components/faces/spec";

export const dynamic = "force-dynamic";

export default async function LobbyPage({
  params,
}: {
  params: { id: string };
}) {
  const lobbyId = params.id;
  const supabase = createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(`/login?next=/lobby/${lobbyId}`);

  const { data: profile } = await supabase
    .from("profiles")
    .select("display_name, xrpl_address")
    .eq("id", user.id)
    .maybeSingle();
  if (!profile?.display_name) redirect(`/onboarding?next=/lobby/${lobbyId}`);

  // RLS: only members/host can read the lobby. No row → not a member.
  const { data: lobby } = await supabase
    .from("lobbies")
    .select("id, code, status, max_players, host_id, mode, discussion_seconds, clue_rounds, topic")
    .eq("id", lobbyId)
    .maybeSingle();
  if (!lobby) redirect("/?notmember=1");

  // If the game is already running, send participants straight into it. Covers
  // refresh/reconnect and the initial render race where the game row exists.
  if (lobby.status === "in_game") {
    const { data: game } = await supabase
      .from("games")
      .select("id")
      .eq("lobby_id", lobbyId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (game) {
      const { data: isMember } = await supabase.rpc("is_game_member", {
        p_game: game.id,
      });
      if (isMember) redirect(`/game/${game.id}`);
    }
  }

  const { data: memberRows } = await supabase
    .from("lobby_players")
    .select("player_id, joined_at")
    .eq("lobby_id", lobbyId)
    .order("joined_at", { ascending: true });

  const ids = (memberRows ?? []).map((r) => r.player_id);
  const { data: profs } = ids.length
    ? await supabase.from("profiles").select("id, display_name, face").in("id", ids)
    : { data: [] as { id: string; display_name: string | null; face: unknown }[] };

  const members: Member[] = (memberRows ?? []).map((r) => {
    const prof = profs?.find((p) => p.id === r.player_id);
    return {
      playerId: r.player_id,
      joinedAt: r.joined_at,
      displayName: prof?.display_name ?? "Player",
      face: (prof?.face as FaceSpec | null) ?? null,
    };
  });

  // on-chain: which players hold a live seat claim (a verified seat_claim not
  // superseded by a later seat_unclaim / wallet disconnect) + my wallet.
  const { data: claimRows } = await supabase
    .from("ledger_events")
    .select("player_id, event_type, verified, created_at")
    .eq("lobby_id", lobbyId)
    .in("event_type", ["seat_claim", "seat_unclaim"]);
  const claimAt = new Map<string, number>();
  const unclaimAt = new Map<string, number>();
  for (const r of claimRows ?? []) {
    if (!r.player_id) continue;
    const t = Date.parse(r.created_at);
    if (r.event_type === "seat_claim" && r.verified) {
      claimAt.set(r.player_id, Math.max(claimAt.get(r.player_id) ?? 0, t));
    } else if (r.event_type === "seat_unclaim") {
      unclaimAt.set(r.player_id, Math.max(unclaimAt.get(r.player_id) ?? 0, t));
    }
  }
  const initialClaims = [...claimAt.entries()]
    .filter(([pid, ct]) => (unclaimAt.get(pid) ?? -1) < ct)
    .map(([pid]) => pid);
  const linkedAddress = profile.xrpl_address ?? null;

  return (
    <LobbyRoom
      lobbyId={lobby.id}
      code={lobby.code}
      maxPlayers={lobby.max_players}
      initialHostId={lobby.host_id}
      initialStatus={lobby.status}
      initialMode={lobby.mode}
      userId={user.id}
      initialMembers={members}
      initialClaims={initialClaims}
      linkedAddress={linkedAddress}
      initialDiscussionSeconds={lobby.discussion_seconds}
      initialClueRounds={lobby.clue_rounds}
      initialTopic={lobby.topic}
    />
  );
}
