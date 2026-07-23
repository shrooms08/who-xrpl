import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { authGameMember } from "@/lib/game/api-auth";
import { advanceIfDue } from "@/lib/game/orchestration";

// Client-triggered, server-validated timer advance. Idempotent (version CAS).
export async function POST(
  _req: Request,
  { params }: { params: { gameId: string } },
) {
  const { gameId } = params;
  const auth = await authGameMember(gameId);
  if ("error" in auth) return auth.error;

  const admin = createAdminClient();
  await advanceIfDue(admin, gameId);
  return NextResponse.json({ ok: true });
}
