import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { lobbyErrorMessage } from "@/lib/lobby-errors";
import { Card } from "@/components/ui/Card";

export const dynamic = "force-dynamic";

export default async function JoinPage({
  params,
}: {
  params: { code: string };
}) {
  const code = params.code;
  const supabase = createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(`/login?next=/join/${encodeURIComponent(code)}`);

  const { data: profile } = await supabase
    .from("profiles")
    .select("display_name")
    .eq("id", user.id)
    .maybeSingle();
  if (!profile?.display_name)
    redirect(`/onboarding?next=/join/${encodeURIComponent(code)}`);

  const { data, error } = await supabase.rpc("join_lobby", { p_code: code });

  if (!error && data) redirect(`/lobby/${data}`);

  return (
    <main className="flex min-h-screen items-center justify-center p-6">
      <Card wobble={1} className="w-full max-w-sm p-7 text-center">
        <h1 className="font-display text-[26px] leading-tight">
          couldn&apos;t join lobby
        </h1>
        <p className="mb-6 mt-2 font-body text-[16px] text-muted">
          {lobbyErrorMessage(error ?? "lobby_not_found")}
        </p>
        <Link
          href="/"
          className="wobble-sketch-alt inline-flex w-full items-center justify-center bg-ink px-[22px] py-[10px] font-display text-[18px] text-paper shadow-ink"
        >
          back home
        </Link>
      </Card>
    </main>
  );
}
