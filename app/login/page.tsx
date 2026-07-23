import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import LoginForm from "./LoginForm";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: { next?: string };
}) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Already signed in → skip login.
  if (user) redirect(searchParams.next || "/");

  return (
    <main className="flex min-h-screen items-center justify-center p-6">
      <LoginForm next={searchParams.next ?? ""} />
    </main>
  );
}
