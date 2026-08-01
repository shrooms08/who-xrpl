import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import ProfileComposer from "./ProfileComposer";
import MatchHistory, {
  type CareerStats,
  type MatchRow,
} from "./MatchHistory";
import type { FaceSpec } from "@/components/faces/spec";

export const dynamic = "force-dynamic";

export default async function ProfilePage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/profile");

  const { data: profile } = await supabase
    .from("profiles")
    .select("display_name, face")
    .eq("id", user.id)
    .maybeSingle();
  if (!profile?.display_name) redirect("/onboarding?next=/profile");

  const [{ data: statsRows }, { data: history }] = await Promise.all([
    supabase.rpc("get_career_stats"),
    supabase.rpc("get_match_history", { p_limit: 20, p_offset: 0 }),
  ]);
  const stats: CareerStats = statsRows?.[0] ?? {
    games: 0,
    wins: 0,
    imposter_games: 0,
    imposter_wins: 0,
    earned_drops: 0,
  };

  return (
    <ProfileComposer
      userId={user.id}
      displayName={profile.display_name}
      initialFace={(profile.face as FaceSpec | null) ?? null}
    >
      <MatchHistory
        initialStats={stats}
        initialGames={(history ?? []) as MatchRow[]}
      />
    </ProfileComposer>
  );
}
