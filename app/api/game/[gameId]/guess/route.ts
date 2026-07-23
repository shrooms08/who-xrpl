import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { authGameMember } from "@/lib/game/api-auth";
import { loadGameState, persist, advanceIfDue } from "@/lib/game/orchestration";
import { submitGuess } from "@/lib/game";

export async function POST(
  req: Request,
  { params }: { params: { gameId: string } },
) {
  const { gameId } = params;
  const auth = await authGameMember(gameId);
  if ("error" in auth) return auth.error;

  const body = await req.json().catch(() => ({}));
  const text = typeof body.text === "string" ? body.text : null;

  const admin = createAdminClient();
  await advanceIfDue(admin, gameId);
  const loaded = await loadGameState(admin, gameId);
  if (!loaded) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const { state, version } = loaded;
  if (state.phase !== "guess")
    return NextResponse.json({ error: "wrong_phase" }, { status: 409 });
  // only the ejected imposter may guess
  if (state.ejectedThisRound !== auth.user.id)
    return NextResponse.json({ error: "not_guesser" }, { status: 403 });

  const next = submitGuess(state, text);
  await persist(admin, gameId, version, next);
  return NextResponse.json({ ok: true });
}
