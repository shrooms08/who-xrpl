import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import HomeClient from "./HomeClient";

export const dynamic = "force-dynamic";

export default async function Home() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("display_name")
    .eq("id", user.id)
    .maybeSingle();

  if (!profile?.display_name) redirect("/onboarding");

  // Lobbies the player currently belongs to (for quick re-entry).
  const { data: memberRows } = await supabase
    .from("lobby_players")
    .select("lobby_id")
    .eq("player_id", user.id);

  const lobbyIds = (memberRows ?? []).map((r) => r.lobby_id);
  const { data: lobbies } = lobbyIds.length
    ? await supabase
        .from("lobbies")
        .select("id, code, status, max_players, host_id")
        .in("id", lobbyIds)
        .eq("status", "waiting")
    : { data: [] };

  return (
    <HomeClient
      displayName={profile.display_name}
      userId={user.id}
      lobbies={lobbies ?? []}
    />
  );
}
