import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getLedgerAdapter, seatMemo } from "@/lib/ledger";

// Reconcile a player's seat claim WITHOUT creating a new signature. Called on
// claim-press and on lobby load, so a claim that already exists (validated, or
// signed-and-still-validating, or on-ledger-but-unrecorded) is adopted instead
// of prompting a duplicate sign. Returns the same lifecycle status as verify:
//   validated | pending | none
export async function POST(
  _req: Request,
  { params }: { params: { lobbyId: string } },
) {
  const { lobbyId } = params;
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { data: isMember } = await supabase.rpc("is_lobby_member", { p_lobby: lobbyId });
  if (!isMember) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  // 1) already have a verified claim → done.
  const { data: already } = await supabase.rpc("has_verified_seat_claim", {
    p_lobby: lobbyId,
    p_player: user.id,
  });
  if (already) return NextResponse.json({ status: "validated" });

  const adapter = getLedgerAdapter();
  const admin = createAdminClient();

  const recordVerified = (v: {
    txHash?: string;
    deliveredDrops?: string;
    memo?: string;
  }) =>
    admin.from("ledger_events").upsert(
      {
        lobby_id: lobbyId,
        player_id: user.id,
        event_type: "seat_claim",
        tx_hash: v.txHash ?? null,
        delivered_amount: v.deliveredDrops ?? null,
        memo: v.memo ?? null,
        verified: true,
      },
      { onConflict: "tx_hash" },
    );

  const memoOk = (memo?: string) =>
    adapter.kind !== "xrpl-testnet" || memo === seatMemo(lobbyId, user.id);

  // 2) an in-flight (pending) claim row → re-check its tx on-ledger.
  const { data: pending } = await admin
    .from("ledger_events")
    .select("tx_hash")
    .eq("lobby_id", lobbyId)
    .eq("player_id", user.id)
    .eq("event_type", "seat_claim")
    .eq("verified", false)
    .not("tx_hash", "is", null)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (pending?.tx_hash) {
    const v = await adapter.verifySeatClaim(pending.tx_hash);
    if (v.verified && memoOk(v.memo)) {
      await recordVerified(v);
      return NextResponse.json({ status: "validated" });
    }
    // signed but not yet validated → keep watching, do NOT re-sign.
    return NextResponse.json({ status: "pending", reason: "not_validated" });
  }

  // 3) scan the ledger for an already-submitted payment (past/duplicate signs
  //    that were never recorded). Adopt the first validated match.
  const { data: profile } = await supabase
    .from("profiles")
    .select("xrpl_address")
    .eq("id", user.id)
    .maybeSingle();

  const found = await adapter.findSeatClaim(
    lobbyId,
    user.id,
    profile?.xrpl_address ?? null,
  );
  if (found?.verified && memoOk(found.memo)) {
    await recordVerified(found);
    return NextResponse.json({ status: "validated" });
  }

  return NextResponse.json({ status: "none" });
}
