import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { authGameMember } from "@/lib/game/api-auth";
import { loadGameState, persist, advanceIfDue } from "@/lib/game/orchestration";
import { submitClue, currentCluePlayer } from "@/lib/game";

export async function POST(
  req: Request,
  { params }: { params: { gameId: string } },
) {
  const { gameId } = params;
  const auth = await authGameMember(gameId);
  if ("error" in auth) return auth.error;

  const body = await req.json().catch(() => ({}));
  const text = typeof body.text === "string" ? body.text : "";

  const admin = createAdminClient();
  await advanceIfDue(admin, gameId); // opportunistic timer advance
  const loaded = await loadGameState(admin, gameId);
  if (!loaded) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const { state, version } = loaded;
  if (state.phase !== "clue")
    return NextResponse.json({ error: "wrong_phase" }, { status: 409 });
  if (currentCluePlayer(state) !== auth.user.id)
    return NextResponse.json({ error: "not_your_turn" }, { status: 403 });

  let next;
  try {
    next = submitClue(state, auth.user.id, text);
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
  await persist(admin, gameId, version, next);
  return NextResponse.json({ ok: true });
}
