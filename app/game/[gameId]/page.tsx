import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { advanceIfDue } from "@/lib/game/orchestration";
import GameRoom, {
  type RoleCard,
  type RosterPlayer,
  type RoundView,
  type ClueView,
  type ChatView,
  type PayoutView,
} from "./GameRoom";

export const dynamic = "force-dynamic";

export default async function GamePage({
  params,
}: {
  params: { gameId: string };
}) {
  const gameId = params.gameId;
  const supabase = createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(`/login?next=/game/${gameId}`);

  const { data: isMember } = await supabase.rpc("is_game_member", {
    p_game: gameId,
  });
  if (!isMember) redirect("/?notmember=1");

  // Opportunistic, server-authoritative advance before we read (lazy sweep).
  const admin = createAdminClient();
  await advanceIfDue(admin, gameId);

  const { data: game } = await supabase
    .from("games")
    .select("id, lobby_id, status, winner, current_round")
    .eq("id", gameId)
    .maybeSingle();
  if (!game) redirect("/?nogame=1");

  const { data: lobby } = await supabase
    .from("lobbies")
    .select("host_id")
    .eq("id", game.lobby_id)
    .maybeSingle();

  const { data: roleCardJson } = await supabase.rpc("get_my_role_card", {
    p_game: gameId,
  });
  const { data: roster } = await supabase.rpc("get_game_roster", {
    p_game: gameId,
  });
  const { data: round } = await supabase
    .from("rounds")
    .select(
      "id, round_number, phase, phase_ends_at, current_turn_player_id, turn_order, ejected_player_id, ejected_role, awaiting_guess, guess_correct",
    )
    .eq("game_id", gameId)
    .order("round_number", { ascending: false })
    .limit(1)
    .maybeSingle();

  let clues: ClueView[] = [];
  if (round) {
    const { data: c } = await supabase
      .from("clues")
      .select("player_id, text")
      .eq("round_id", round.id)
      .order("created_at", { ascending: true });
    clues = c ?? [];
  }

  const { data: chat } = await supabase
    .from("chat_messages")
    .select("id, player_id, content")
    .eq("game_id", gameId)
    .order("created_at", { ascending: true });

  // payouts (empty until an on-chain game ends + settles); RLS lets members read.
  const { data: payouts } = await supabase
    .from("payouts")
    .select("player_id, amount_drops, status, tx_hash")
    .eq("game_id", gameId);

  return (
    <GameRoom
      gameId={gameId}
      lobbyId={game.lobby_id}
      hostId={lobby?.host_id ?? ""}
      userId={user.id}
      initialStatus={game.status}
      initialWinner={game.winner}
      initialRoleCard={roleCardJson as unknown as RoleCard}
      initialRoster={(roster ?? []) as RosterPlayer[]}
      initialRound={(round ?? null) as RoundView | null}
      initialClues={clues}
      initialChat={(chat ?? []) as ChatView[]}
      initialPayouts={(payouts ?? []) as PayoutView[]}
      serverNowIso={new Date().toISOString()}
    />
  );
}
