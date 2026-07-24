import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getLedgerAdapter, seatMemo } from "@/lib/ledger";

// Resolve a signed seat-claim request → verify on-ledger → record the claim.
export async function POST(
  req: Request,
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

  // idempotent: already claimed
  const { data: already } = await supabase.rpc("has_verified_seat_claim", {
    p_lobby: lobbyId,
    p_player: user.id,
  });
  if (already) return NextResponse.json({ verified: true });

  const body = await req.json().catch(() => ({}));
  const requestId = typeof body.requestId === "string" ? body.requestId : "";
  if (!requestId) return NextResponse.json({ error: "requestId required" }, { status: 400 });

  const adapter = getLedgerAdapter();
  const resolved = await adapter.resolveSeatClaim(requestId);
  if (!resolved) return NextResponse.json({ verified: false, reason: "not_signed" });

  const v = await adapter.verifySeatClaim(resolved.txHash);
  if (!v.verified) return NextResponse.json({ verified: false, reason: v.reason });

  // On the real ledger, bind the claim to THIS lobby+player via the memo so a
  // player can't submit someone else's (or another lobby's) payment.
  if (adapter.kind === "xrpl-testnet" && v.memo !== seatMemo(lobbyId, user.id)) {
    return NextResponse.json({ verified: false, reason: "memo_mismatch" });
  }

  const admin = createAdminClient();
  await admin.from("ledger_events").insert({
    lobby_id: lobbyId,
    player_id: user.id,
    event_type: "seat_claim",
    tx_hash: v.txHash ?? null,
    delivered_amount: v.deliveredDrops ?? null,
    memo: v.memo ?? null,
    verified: true,
  });
  return NextResponse.json({ verified: true });
}
