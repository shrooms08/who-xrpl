"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Logo } from "@/components/ui/Logo";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { CodeEntry } from "@/components/ui/CodeEntry";

// Some providers (e.g. Resend test mode) fail the send with an empty body, so
// error.message arrives as "" or "{}". Coerce those to readable copy.
function cleanErr(error: { message?: string } | null, fallback: string): string {
  const m = (error?.message ?? "").trim();
  return !m || m === "{}" ? fallback : m;
}

export default function LoginForm({ next }: { next: string }) {
  const router = useRouter();
  const supabase = createClient();
  const [step, setStep] = useState<"email" | "code">("email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function sendCode(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const { error } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: { shouldCreateUser: true },
    });
    setBusy(false);
    if (error) {
      return setError(
        cleanErr(
          error,
          "couldn't send a code to that email. if you already have one, use “enter a code”.",
        ),
      );
    }
    setStep("code");
  }

  async function verify(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    // The same 6-digit code is issued under different OTP types depending on the
    // account: "email"/"magiclink" for a returning user (and admin-issued codes),
    // but "signup" for a BRAND-NEW account's "Confirm signup" email. GoTrue matches
    // the token AND the type, so a wrong-type attempt just returns invalid and
    // leaves the code usable — we try each in turn until one lands.
    const otpTypes = ["email", "magiclink", "signup"] as const;
    let error: Awaited<ReturnType<typeof supabase.auth.verifyOtp>>["error"] = null;
    for (const type of otpTypes) {
      ({ error } = await supabase.auth.verifyOtp({
        email: email.trim(),
        token: code.trim(),
        type,
      }));
      if (!error) break;
    }
    setBusy(false);
    if (error) {
      return setError(cleanErr(error, "that code didn't work — double-check it and try again."));
    }
    router.replace(next || "/");
    router.refresh();
  }

  return (
    <Card wobble={1} className="w-full max-w-sm p-7">
      <div className="mb-1">
        <Logo size={40} />
      </div>
      <p className="mb-6 font-body text-[16px] text-muted">
        {step === "email"
          ? "we'll email you a one-time code."
          : `enter the code for ${email}.`}
      </p>

      {step === "email" ? (
        <form onSubmit={sendCode} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1">
            <label className="font-utility text-[11px] uppercase tracking-[0.08em] text-muted">
              email
            </label>
            <input
              type="email"
              required
              autoFocus
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              className="wobble-2 w-full border-2 border-ink bg-card px-4 py-3 font-body text-[17px] outline-none placeholder:text-faded"
            />
          </div>
          <Button type="submit" variant="primary" disabled={busy} className="w-full">
            {busy ? "sending…" : "send code"}
          </Button>
          <button
            type="button"
            onClick={() => {
              if (!email.trim()) {
                setError("enter your email first, then choose “enter a code”.");
                return;
              }
              setError(null);
              setStep("code");
            }}
            className="font-utility text-[12px] text-muted hover:text-ink"
          >
            already have a code? enter it →
          </button>
        </form>
      ) : (
        <form onSubmit={verify} className="flex flex-col items-center gap-4">
          <CodeEntry value={code} editable onChange={setCode} length={6} autoFocus />
          <Button type="submit" variant="primary" disabled={busy} className="w-full">
            {busy ? "verifying…" : "verify & continue"}
          </Button>
          <button
            type="button"
            onClick={() => {
              setStep("email");
              setCode("");
              setError(null);
            }}
            className="font-utility text-[12px] text-muted hover:text-ink"
          >
            use a different email
          </button>
        </form>
      )}

      {error && <p className="mt-4 font-body text-[15px] text-muted">{error}</p>}
    </Card>
  );
}
