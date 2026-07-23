import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { lobbyErrorMessage } from "@/lib/lobby-errors";

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
      <div className="w-full max-w-sm rounded-2xl border border-neutral-800 bg-neutral-900/60 p-6 text-center">
        <h1 className="mb-2 text-xl font-bold">Couldn&apos;t join lobby</h1>
        <p className="mb-6 text-sm text-neutral-400">
          {lobbyErrorMessage(error ?? "lobby_not_found")}
        </p>
        <Link
          href="/"
          className="inline-block rounded-lg bg-white px-4 py-2 font-medium text-black"
        >
          Back home
        </Link>
      </div>
    </main>
  );
}
