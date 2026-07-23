import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { authGameMember } from "@/lib/game/api-auth";
import { loadGameState, persist, advanceIfDue } from "@/lib/game/orchestration";
import { submitVote, closeVote, allLivingVoted, livingIds } from "@/lib/game";

export async function POST(
  req: Request,
  { params }: { params: { gameId: string } },
) {
  const { gameId } = params;
  const auth = await authGameMember(gameId);
  if ("error" in auth) return auth.error;

  const body = await req.json().catch(() => ({}));
  const targetId = typeof body.targetId === "string" ? body.targetId : null;

  const admin = createAdminClient();
  await advanceIfDue(admin, gameId);
  const loaded = await loadGameState(admin, gameId);
  if (!loaded) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const { state, version } = loaded;
  if (state.phase !== "vote")
    return NextResponse.json({ error: "wrong_phase" }, { status: 409 });
  if (!livingIds(state).includes(auth.user.id))
    return NextResponse.json({ error: "not_living" }, { status: 403 });

  let next;
  try {
    next = submitVote(state, auth.user.id, targetId);
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
  // close the vote early once everyone living has voted
  if (allLivingVoted(next)) next = closeVote(next);
  await persist(admin, gameId, version, next);
  return NextResponse.json({ ok: true });
}
