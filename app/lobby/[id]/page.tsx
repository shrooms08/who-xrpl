import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import LobbyRoom, { type Member } from "./LobbyRoom";

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
    .select("display_name")
    .eq("id", user.id)
    .maybeSingle();
  if (!profile?.display_name) redirect(`/onboarding?next=/lobby/${lobbyId}`);

  // RLS: only members/host can read the lobby. No row → not a member.
  const { data: lobby } = await supabase
    .from("lobbies")
    .select("id, code, status, max_players, host_id")
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
    ? await supabase.from("profiles").select("id, display_name").in("id", ids)
    : { data: [] as { id: string; display_name: string | null }[] };

  const members: Member[] = (memberRows ?? []).map((r) => ({
    playerId: r.player_id,
    joinedAt: r.joined_at,
    displayName:
      profs?.find((p) => p.id === r.player_id)?.display_name ?? "Player",
  }));

  return (
    <LobbyRoom
      lobbyId={lobby.id}
      code={lobby.code}
      maxPlayers={lobby.max_players}
      initialHostId={lobby.host_id}
      initialStatus={lobby.status}
      userId={user.id}
      initialMembers={members}
    />
  );
}
