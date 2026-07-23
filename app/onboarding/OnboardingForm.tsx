"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";

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
      setError("pick a name with at least 2 characters.");
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
    <Card wobble={1} className="w-full max-w-sm p-7">
      <form onSubmit={save} className="flex flex-col gap-4">
        <div>
          <h1 className="font-display text-[30px] leading-tight">
            what should we call you?
          </h1>
          <p className="font-body text-[16px] text-muted">
            this is how other players will see you.
          </p>
        </div>
        <div className="flex flex-col gap-1">
          <label className="font-utility text-[11px] uppercase tracking-[0.08em] text-muted">
            display name
          </label>
          <input
            required
            autoFocus
            maxLength={24}
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. rukevwe"
            className="wobble-2 w-full border-2 border-ink bg-card px-4 py-3 font-body text-[17px] outline-none placeholder:text-faded"
          />
        </div>
        <Button type="submit" variant="primary" disabled={busy} className="w-full">
          {busy ? "saving…" : "continue"}
        </Button>
        {error && <p className="font-body text-[15px] text-muted">{error}</p>}
      </form>
    </Card>
  );
}
