import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import ProfileComposer from "./ProfileComposer";
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

  return (
    <ProfileComposer
      userId={user.id}
      displayName={profile.display_name}
      initialFace={(profile.face as FaceSpec | null) ?? null}
    />
  );
}
