import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getLedgerAdapter } from "@/lib/ledger";

// Resolve a wallet-link request; on success store the address on the profile.
export async function POST(req: Request) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const requestId = typeof body.requestId === "string" ? body.requestId : "";
  if (!requestId) return NextResponse.json({ error: "requestId required" }, { status: 400 });

  const res = await getLedgerAdapter().resolveWalletLink(requestId);
  if (!res) return NextResponse.json({ linked: false });

  // RLS profiles_update_self lets the user set their own address.
  await supabase.from("profiles").update({ xrpl_address: res.address }).eq("id", user.id);
  return NextResponse.json({ linked: true, address: res.address });
}
