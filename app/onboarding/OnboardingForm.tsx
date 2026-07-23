"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default function OnboardingForm({
  userId,
  next,
  initialName,
}: {
  userId: string;
  next: string;
  initialName: string;
}) {
  const router = useRouter();
  const supabase = createClient();
  const [name, setName] = useState(initialName);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = name.trim();
    if (trimmed.length < 2) {
      setError("Pick a name with at least 2 characters.");
      return;
    }
    setBusy(true);
    setError(null);
    const { error } = await supabase
      .from("profiles")
      .upsert({ id: userId, display_name: trimmed });
    setBusy(false);
    if (error) return setError(error.message);
    router.replace(next || "/");
    router.refresh();
  }

  return (
    <form
      onSubmit={save}
      className="w-full max-w-sm rounded-2xl border border-neutral-800 bg-neutral-900/60 p-6"
    >
      <h1 className="mb-1 text-2xl font-bold">Choose a display name</h1>
      <p className="mb-6 text-sm text-neutral-400">
        This is how other players will see you.
      </p>
      <input
        required
        autoFocus
        maxLength={24}
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="e.g. Rukevwe"
        className="mb-3 w-full rounded-lg border border-neutral-700 bg-neutral-950 px-3 py-2 outline-none focus:border-neutral-500"
      />
      <button
        disabled={busy}
        className="w-full rounded-lg bg-white px-3 py-2 font-medium text-black disabled:opacity-50"
      >
        {busy ? "Saving…" : "Continue"}
      </button>
      {error && <p className="mt-4 text-sm text-red-400">{error}</p>}
    </form>
  );
}
