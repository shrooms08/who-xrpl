import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { authGameMember, errorStatus } from "@/lib/game/api-auth";
import { advanceIfDue, mutateGame } from "@/lib/game/orchestration";
import { settleGameIfEnded } from "@/lib/ledger/payouts";
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

  const result = await mutateGame(admin, gameId, (state) => {
    if (state.phase !== "guess") throw new Error("wrong_phase");
    if (state.ejectedThisRound !== auth.user.id) throw new Error("not_guesser");
    return submitGuess(state, text);
  });

  if ("error" in result) {
    return NextResponse.json({ error: result.error }, { status: errorStatus(result.error) });
  }
  // A correct guess ends the game immediately — settle payouts now (idempotent).
  await settleGameIfEnded(admin, gameId);
  return NextResponse.json({ ok: true });
}
