import { describe, it, expect, beforeAll, afterEach } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";

// Load .env.local (service-role + anon key + url).
const here = fileURLToPath(new URL(".", import.meta.url));
for (const line of readFileSync(resolve(here, "../../../.env.local"), "utf8").split("\n")) {
  const m = line.match(/^([A-Z_]+)=(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
}

let admin: ReturnType<typeof createAdminClient>;
const createdUsers: string[] = [];

/** A public (anon-key) client — the same key the browser LoginForm uses. */
function anonClient(): SupabaseClient {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
}

const freshEmail = () =>
  `signup-otp-${Date.now()}-${Math.floor(Math.random() * 1e6)}@test.local`;

/** Create a brand-new, unconfirmed account and return the exact OTP GoTrue puts
 *  in its "Confirm signup" email ({{ .Token }}) — the first-time-account token. */
async function newSignupOtp(email: string): Promise<string> {
  const { data, error } = await admin.auth.admin.generateLink({
    type: "signup",
    email,
    password: `Pw-${Math.random().toString(36).slice(2)}-${Date.now()}`,
  });
  if (error || !data?.properties?.email_otp) {
    throw new Error(`generateLink(signup): ${error?.message}`);
  }
  if (data.user) createdUsers.push(data.user.id);
  return data.properties.email_otp;
}

/** The exact fallback chain LoginForm.verify() runs. Returns the winning type. */
async function verifyChain(client: SupabaseClient, email: string, token: string) {
  const types = ["email", "magiclink", "signup"] as const;
  let error: { message: string } | null = null;
  for (const type of types) {
    const r = await client.auth.verifyOtp({ email, token, type });
    error = r.error;
    if (!error) return { ok: true as const, used: type, data: r.data };
  }
  return { ok: false as const, used: null, error };
}

beforeAll(() => {
  admin = createAdminClient();
});
afterEach(async () => {
  for (const uid of createdUsers.splice(0)) {
    await admin.auth.admin.deleteUser(uid).catch(() => {});
  }
});

describe("fresh-signup OTP verification", () => {
  // Diagnostic: does the OLD chain (email → magiclink) cover a signup token?
  it("reports whether 'email'/'magiclink' alone verify a first-time signup code", async () => {
    const email = freshEmail();
    const otp = await newSignupOtp(email);
    const emailOnly = await anonClient().auth.verifyOtp({ email, token: otp, type: "email" });
    // token is unconsumed if that failed — try magiclink on the same code
    const magicOnly = emailOnly.error
      ? await anonClient().auth.verifyOtp({ email, token: otp, type: "magiclink" })
      : { error: { message: "n/a — 'email' already consumed it" } };
    console.log(
      `[signup-otp] fresh signup code — type 'email': ${emailOnly.error ? "REJECTED (" + emailOnly.error.message + ")" : "ACCEPTED"}; ` +
        `type 'magiclink': ${magicOnly.error ? "REJECTED (" + magicOnly.error.message + ")" : "ACCEPTED"}`,
    );
    // Whatever the GoTrue version does, this documents it in the run output.
    expect(true).toBe(true);
  });

  it("type 'signup' verifies a fresh 'Confirm signup' code (the canonical path)", async () => {
    const email = freshEmail();
    const otp = await newSignupOtp(email);
    const { data, error } = await anonClient().auth.verifyOtp({
      email,
      token: otp,
      type: "signup",
    });
    expect(error).toBeNull();
    expect(data.session).toBeTruthy();
    expect(data.user?.email).toBe(email);
  });

  it("the LoginForm fallback chain authenticates a NEW account → onboarding state", async () => {
    const email = freshEmail();
    const otp = await newSignupOtp(email);
    const res = await verifyChain(anonClient(), email, otp);

    if (!res.ok) throw new Error(`chain failed: ${res.error?.message}`);
    expect(res.data.session).toBeTruthy();
    console.log(`[signup-otp] fallback chain verified a fresh signup via type '${res.used}'`);

    // "lands in onboarding": authenticated, but no display_name profile yet
    // (app/page.tsx redirects display_name-less users to /onboarding).
    const uid = res.data.session!.user.id;
    const { data: prof } = await admin
      .from("profiles")
      .select("display_name")
      .eq("id", uid)
      .maybeSingle();
    expect(prof?.display_name ?? null).toBeNull();
  });
});
