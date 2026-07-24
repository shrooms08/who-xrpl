import "server-only";
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * Re-authenticate the caller and confirm game membership. Because the route
 * handlers write with the RLS-bypassing service role, authorization must be
 * explicit here — never assume the DB will reject an unauthorized transition.
 */
export async function authGameMember(gameId: string) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return {
      error: NextResponse.json({ error: "unauthorized" }, { status: 401 }),
    } as const;
  }
  const { data: isMember } = await supabase.rpc("is_game_member", {
    p_game: gameId,
  });
  if (!isMember) {
    return {
      error: NextResponse.json({ error: "forbidden" }, { status: 403 }),
    } as const;
  }
  return { user, supabase } as const;
}

/** Map an engine/orchestration error code to an HTTP status. */
export function errorStatus(code: string): number {
  if (code === "not_found") return 404;
  if (code === "not_your_turn" || code === "not_living" || code === "not_guesser")
    return 403;
  if (code === "wrong_phase" || code === "conflict") return 409;
  return 400; // clue errors (too_long / empty / contains_word) etc.
}
