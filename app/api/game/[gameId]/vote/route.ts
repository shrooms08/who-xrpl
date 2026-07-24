import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { authGameMember, errorStatus } from "@/lib/game/api-auth";
import { advanceIfDue, mutateGame } from "@/lib/game/orchestration";
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

  const result = await mutateGame(admin, gameId, (state) => {
    if (state.phase !== "vote") throw new Error("wrong_phase");
    if (!livingIds(state).includes(auth.user.id)) throw new Error("not_living");
    let next = submitVote(state, auth.user.id, targetId);
    if (allLivingVoted(next)) next = closeVote(next); // close early when all in
    return next;
  });

  if ("error" in result) {
    return NextResponse.json({ error: result.error }, { status: errorStatus(result.error) });
  }
  return NextResponse.json({ ok: true });
}
