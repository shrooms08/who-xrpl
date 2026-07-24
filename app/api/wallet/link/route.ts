import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getLedgerAdapter } from "@/lib/ledger";

// Create a Xaman sign-in request so the player can link their wallet.
export async function POST() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const req = await getLedgerAdapter().createWalletLinkRequest();
  return NextResponse.json(req);
}
