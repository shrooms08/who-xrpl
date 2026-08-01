import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getLedgerAdapter, seatMemo } from "@/lib/ledger";

// Reasons from verifySeatClaim that are genuinely terminal (the payment is wrong
// and re-polling will never fix it). Everything else — not_validated, txnNotFound,
// no_delivered_amount, transient network errors — is an INTERIM state during the
// ledger-close window and must be reported as "pending", never as a failure.
const TERMINAL_REASONS = new Set([
  "not_payment",
  "wrong_destination",
  "insufficient_amount",
]);

// Resolve a signed seat-claim request → verify on-ledger → record the claim.
// Returns a lifecycle status the client polls on:
//   validated — the seat is claimed (chip flips ✓)
//   pending   — signed/validating (reason: not_signed | not_validated) → keep polling
//   rejected  — the user declined the signature (terminal)
//   expired   — the payload expired unsigned (terminal)
//   failed    — the payment itself is invalid (terminal; reason for logging)
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
  if (already) return NextResponse.json({ status: "validated" });

  const body = await req.json().catch(() => ({}));
  const requestId = typeof body.requestId === "string" ? body.requestId : "";
  if (!requestId) return NextResponse.json({ error: "requestId required" }, { status: 400 });

  const adapter = getLedgerAdapter();
  const resolved = await adapter.resolveSeatClaim(requestId);
  if (resolved.state === "pending") {
    return NextResponse.json({ status: "pending", reason: "not_signed" });
  }
  if (resolved.state === "rejected") return NextResponse.json({ status: "rejected" });
  if (resolved.state === "expired") return NextResponse.json({ status: "expired" });

  // resolved.state === "signed": we have a tx hash, but it may not be validated
  // yet. Record a PENDING claim row NOW (keyed on tx_hash) so a refresh mid-confirm
  // can find and resume this exact tx instead of prompting another signature.
  const txHash = resolved.txHash;
  const admin = createAdminClient();
  await admin.from("ledger_events").upsert(
    {
      lobby_id: lobbyId,
      player_id: user.id,
      event_type: "seat_claim",
      tx_hash: txHash,
      verified: false,
    },
    { onConflict: "tx_hash", ignoreDuplicates: true },
  );

  const v = await adapter.verifySeatClaim(txHash);
  if (!v.verified) {
    if (v.reason && TERMINAL_REASONS.has(v.reason)) {
      return NextResponse.json({ status: "failed", reason: v.reason });
    }
    // still validating (or a transient read error) — keep watching.
    return NextResponse.json({ status: "pending", reason: "not_validated" });
  }

  // Bind the claim to THIS lobby+player via the memo so a player can't submit
  // someone else's (or another lobby's) payment.
  if (adapter.kind === "xrpl-testnet" && v.memo !== seatMemo(lobbyId, user.id)) {
    return NextResponse.json({ status: "failed", reason: "memo_mismatch" });
  }

  await admin.from("ledger_events").upsert(
    {
      lobby_id: lobbyId,
      player_id: user.id,
      event_type: "seat_claim",
      tx_hash: v.txHash ?? txHash,
      delivered_amount: v.deliveredDrops ?? null,
      memo: v.memo ?? null,
      verified: true,
    },
    { onConflict: "tx_hash" },
  );
  return NextResponse.json({ status: "validated" });
}
