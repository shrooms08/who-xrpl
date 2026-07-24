import "server-only"; // constructs the payout wallet + uses the service-role client
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";
import type { Role } from "@/lib/game";
import { GAME_POT_DROPS, PAYOUT_RESERVE_DROPS } from "@/lib/game/config";
import { advanceIfDue } from "@/lib/game/orchestration";
import { getLedgerAdapter, payoutMemo, type LedgerAdapter } from ".";
import { splitPot } from "./split";

type Admin = SupabaseClient<Database>;

export interface PayoutRunSummary {
  ran: boolean; // false when payouts don't apply (casual / not ended / no winner)
  reason?:
    | "not_ended"
    | "no_winner"
    | "not_onchain"
    | "no_winners"
    | "already_settled"
    | "insufficient_pot";
  sent: number;
  failed: number;
  total: number;
}

const NONE: Omit<PayoutRunSummary, "reason" | "ran"> = {
  sent: 0,
  failed: 0,
  total: 0,
};

/**
 * Run payouts if — and only if — `gameId` is an ended, on-chain game. Safe to
 * call repeatedly and concurrently (every trigger site does): idempotent by the
 * payouts.(game_id, player_id) UNIQUE key plus a per-row status CAS, so a retried
 * or double-invoked game-end never double-pays. Never throws into the caller —
 * game-end must not crash on a ledger hiccup.
 */
export async function settleGameIfEnded(
  admin: Admin,
  gameId: string,
  adapter: LedgerAdapter = getLedgerAdapter(),
): Promise<PayoutRunSummary> {
  try {
    const { data: game } = await admin
      .from("games")
      .select("id, lobby_id, status, winner")
      .eq("id", gameId)
      .maybeSingle();
    if (!game) return { ran: false, reason: "not_ended", ...NONE };
    if (game.status !== "ended") return { ran: false, reason: "not_ended", ...NONE };
    if (!game.winner) return { ran: false, reason: "no_winner", ...NONE };

    const { data: lobby } = await admin
      .from("lobbies")
      .select("mode")
      .eq("id", game.lobby_id)
      .maybeSingle();
    if (lobby?.mode !== "onchain") return { ran: false, reason: "not_onchain", ...NONE };

    // Cheap short-circuit: if payout rows already exist and none are still
    // in-flight, we're settled — skip the balance call and the whole runner.
    const { data: existing } = await admin
      .from("payouts")
      .select("status")
      .eq("game_id", gameId);
    if (
      existing &&
      existing.length > 0 &&
      existing.every((r) => r.status === "sent" || r.status === "failed" || r.status === "skipped")
    ) {
      return {
        ran: true,
        reason: "already_settled",
        sent: existing.filter((r) => r.status === "sent").length,
        failed: existing.filter((r) => r.status === "failed").length,
        total: existing.length,
      };
    }

    return await runPayouts(admin, gameId, game.winner as Role, adapter);
  } catch (e) {
    // Best-effort: log server-side, never propagate into the game-end flow.
    console.error(`[payouts] settle failed for ${gameId}:`, (e as Error).message);
    return { ran: false, ...NONE };
  }
}

/**
 * The payout runner. Determines the winning side, splits the pot, guards the pot
 * balance, and pays each winner exactly once. Assumes the game is ended+on-chain
 * (settleGameIfEnded checks that). Exported for the e2e idempotency test.
 */
export async function runPayouts(
  admin: Admin,
  gameId: string,
  winner: Role,
  adapter: LedgerAdapter = getLedgerAdapter(),
): Promise<PayoutRunSummary> {
  // 1. winning side = every player whose role is the winning role (alive or not),
  //    in canonical order (player_id asc) so the remainder is assigned stably.
  const { data: gps } = await admin
    .from("game_players")
    .select("player_id")
    .eq("game_id", gameId)
    .eq("role", winner);
  const winnerIds = (gps ?? []).map((g) => g.player_id).sort();
  if (winnerIds.length === 0) return { ran: true, reason: "no_winners", ...NONE };

  // addresses (snapshot of each winner's linked wallet)
  const { data: profs } = await admin
    .from("profiles")
    .select("id, xrpl_address")
    .in("id", winnerIds);
  const addrOf = new Map((profs ?? []).map((p) => [p.id, p.xrpl_address]));

  // 2. split the pot (integer drops; remainder to the first winner)
  const shares = splitPot(GAME_POT_DROPS, winnerIds);
  const dropsOf = new Map(shares.map((s) => [s.playerId, s.drops]));

  // 3. balance guard — all-or-nothing. If the pot can't cover pot+reserve, skip
  //    every payout gracefully and record a single ledger event.
  const balance = await adapter.payoutPotBalanceDrops();
  const required = BigInt(GAME_POT_DROPS) + BigInt(PAYOUT_RESERVE_DROPS);
  if (balance === null || balance < required) {
    await admin.from("payouts").upsert(
      winnerIds.map((pid) => ({
        game_id: gameId,
        player_id: pid,
        address: addrOf.get(pid) ?? "",
        amount_drops: Number(dropsOf.get(pid)),
        status: "skipped",
        error: "insufficient_pot",
      })),
      { onConflict: "game_id,player_id", ignoreDuplicates: true },
    );
    await admin.from("ledger_events").insert({
      game_id: gameId,
      event_type: "payout_skipped_insufficient_pot",
      verified: false,
      memo: `pot=${balance ?? "unknown"};required=${required}`,
    });
    return { ran: true, reason: "insufficient_pot", sent: 0, failed: 0, total: winnerIds.length };
  }

  // 4. create the payout obligations EXACTLY ONCE. ignoreDuplicates => a retried
  //    settlement leaves already-created rows (incl. already-sent) untouched.
  await admin.from("payouts").upsert(
    winnerIds.map((pid) => ({
      game_id: gameId,
      player_id: pid,
      address: addrOf.get(pid) ?? "",
      amount_drops: Number(dropsOf.get(pid)),
      status: addrOf.get(pid) ? "pending" : "failed",
      error: addrOf.get(pid) ? null : "no_wallet",
    })),
    { onConflict: "game_id,player_id", ignoreDuplicates: true },
  );

  // 5. pay each pending row. The status CAS (pending -> sending) is the claim:
  //    only ONE concurrent runner wins it, so the tx is submitted at most once.
  const { data: rows } = await admin
    .from("payouts")
    .select("id, player_id, address, amount_drops, status")
    .eq("game_id", gameId);

  let sent = 0;
  let failed = 0;
  for (const row of rows ?? []) {
    if (row.status === "sent") { sent++; continue; }
    if (row.status === "failed") { failed++; continue; }
    if (row.status !== "pending") continue; // sending/skipped — leave alone

    const { data: claimed } = await admin
      .from("payouts")
      .update({ status: "sending", updated_at: new Date().toISOString() })
      .eq("id", row.id)
      .eq("status", "pending")
      .select("id");
    if (!claimed || claimed.length === 0) continue; // another runner claimed it

    const memo = payoutMemo(gameId, row.player_id);
    const res = await adapter.payout(row.address, String(row.amount_drops), memo);

    if (res.ok && res.txHash) {
      await admin
        .from("payouts")
        .update({ status: "sent", tx_hash: res.txHash, error: null, updated_at: new Date().toISOString() })
        .eq("id", row.id);
      // Mirror to the ledger feed (admin view). ignoreDuplicates guards the rare
      // double-insert on the unique tx_hash.
      await admin.from("ledger_events").upsert(
        {
          game_id: gameId,
          player_id: row.player_id,
          event_type: "payout",
          tx_hash: res.txHash,
          delivered_amount: res.deliveredDrops ?? String(row.amount_drops),
          memo,
          verified: true,
        },
        { onConflict: "tx_hash", ignoreDuplicates: true },
      );
      sent++;
    } else {
      await admin
        .from("payouts")
        .update({ status: "failed", error: res.reason ?? "submit_failed", updated_at: new Date().toISOString() })
        .eq("id", row.id);
      failed++;
    }
  }

  return { ran: true, sent, failed, total: (rows ?? []).length };
}

/**
 * Advance overdue phases, then settle payouts if the game just ended. The single
 * entry point route handlers use in place of advanceIfDue: the request that
 * transitions a game to `end` is the one that triggers its payouts.
 */
export async function advanceAndSettle(admin: Admin, gameId: string): Promise<void> {
  await advanceIfDue(admin, gameId);
  await settleGameIfEnded(admin, gameId);
}
