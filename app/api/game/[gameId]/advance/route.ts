import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { authGameMember } from "@/lib/game/api-auth";
import { advanceAndSettle } from "@/lib/ledger/payouts";

// Client-triggered, server-validated timer advance. Idempotent (version CAS).
// advanceAndSettle also runs payouts when this call is the one that transitions
// the game to `end` (the timeout / reveal→conclude path).
export async function POST(
  _req: Request,
  { params }: { params: { gameId: string } },
) {
  const { gameId } = params;
  const auth = await authGameMember(gameId);
  if ("error" in auth) return auth.error;

  const admin = createAdminClient();
  await advanceAndSettle(admin, gameId);
  return NextResponse.json({ ok: true });
}
