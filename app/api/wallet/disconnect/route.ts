import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

// Disconnect the caller's wallet. Clears profiles.xrpl_address (next claim
// re-links fresh). When called from an on-chain lobby, ALSO drops the caller's
// seat claim there — additively: a 'seat_unclaim' tombstone supersedes the
// verified claim (see has_verified_seat_claim / migration 0014), so the on-chain
// payment record in ledger_events is left untouched. Unverified in-flight rows
// (a claim still confirming) are cleared so they can't be re-adopted.
export async function POST(req: Request) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const lobbyId = typeof body.lobbyId === "string" ? body.lobbyId : "";

  // Clear the linked address (RLS profiles_update_self permits self-update).
  await supabase.from("profiles").update({ xrpl_address: null }).eq("id", user.id);

  if (lobbyId) {
    const { data: isMember } = await supabase.rpc("is_lobby_member", { p_lobby: lobbyId });
    const { data: lobby } = await supabase
      .from("lobbies")
      .select("mode")
      .eq("id", lobbyId)
      .maybeSingle();

    if (isMember && lobby?.mode === "onchain") {
      const admin = createAdminClient();
      // tombstone: supersedes any verified claim without touching its row.
      await admin.from("ledger_events").insert({
        lobby_id: lobbyId,
        player_id: user.id,
        event_type: "seat_unclaim",
        verified: false,
      });
      // drop unverified, still-confirming claim rows so reconcile can't re-adopt.
      await admin
        .from("ledger_events")
        .delete()
        .eq("lobby_id", lobbyId)
        .eq("player_id", user.id)
        .eq("event_type", "seat_claim")
        .eq("verified", false);
    }
  }

  return NextResponse.json({ disconnected: true });
}
