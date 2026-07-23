import "server-only"; // hard guard: importing this into a client bundle fails the build
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";

/**
 * Service-role Supabase client. Bypasses RLS — construct ONLY in server code
 * (route handlers, server components). The `server-only` import above makes any
 * accidental client-component import a build error. Authorization is therefore
 * NOT provided by RLS here: every caller must re-authenticate and authorize
 * explicitly before using this client.
 */
let cached: ReturnType<typeof createClient<Database>> | null = null;

export function createAdminClient() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) throw new Error("SUPABASE_SERVICE_ROLE_KEY is not set");
  if (!cached) {
    cached = createClient<Database>(process.env.NEXT_PUBLIC_SUPABASE_URL!, key, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }
  return cached;
}
