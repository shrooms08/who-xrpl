"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

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
    if (error) return setError(error.message);
    setStep("code");
  }

  async function verify(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const { error } = await supabase.auth.verifyOtp({
      email: email.trim(),
      token: code.trim(),
      type: "email",
    });
    setBusy(false);
    if (error) return setError(error.message);
    // Session cookie is set; let the server decide onboarding vs. destination.
    router.replace(next || "/");
    router.refresh();
  }

  return (
    <div className="w-full max-w-sm rounded-2xl border border-neutral-800 bg-neutral-900/60 p-6">
      <h1 className="mb-1 text-2xl font-bold">Sign in to WHO?</h1>
      <p className="mb-6 text-sm text-neutral-400">
        {step === "email"
          ? "We'll email you a one-time code."
          : `Enter the code sent to ${email}.`}
      </p>

      {step === "email" ? (
        <form onSubmit={sendCode} className="space-y-3">
          <input
            type="email"
            required
            autoFocus
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            className="w-full rounded-lg border border-neutral-700 bg-neutral-950 px-3 py-2 outline-none focus:border-neutral-500"
          />
          <button
            disabled={busy}
            className="w-full rounded-lg bg-white px-3 py-2 font-medium text-black disabled:opacity-50"
          >
            {busy ? "Sending…" : "Send code"}
          </button>
        </form>
      ) : (
        <form onSubmit={verify} className="space-y-3">
          <input
            inputMode="numeric"
            autoComplete="one-time-code"
            required
            autoFocus
            value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder="6-digit code"
            className="w-full rounded-lg border border-neutral-700 bg-neutral-950 px-3 py-2 tracking-widest outline-none focus:border-neutral-500"
          />
          <button
            disabled={busy}
            className="w-full rounded-lg bg-white px-3 py-2 font-medium text-black disabled:opacity-50"
          >
            {busy ? "Verifying…" : "Verify & continue"}
          </button>
          <button
            type="button"
            onClick={() => {
              setStep("email");
              setCode("");
              setError(null);
            }}
            className="w-full text-sm text-neutral-400 hover:text-neutral-200"
          >
            Use a different email
          </button>
        </form>
      )}

      {error && <p className="mt-4 text-sm text-red-400">{error}</p>}
    </div>
  );
}
