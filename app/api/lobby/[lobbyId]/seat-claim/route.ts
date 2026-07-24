import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getLedgerAdapter } from "@/lib/ledger";

// Create a seat-claim sign request (12-drop payment + memo) for the caller.
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

  const req = await getLedgerAdapter().createSeatClaimRequest(lobbyId, user.id);
  return NextResponse.json(req);
}
