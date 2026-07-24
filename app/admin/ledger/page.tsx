import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { Logo } from "@/components/ui/Logo";
import { Card } from "@/components/ui/Card";
import { Chip } from "@/components/ui/Chip";

export const dynamic = "force-dynamic";

// Simple ledger listing (verified seat claims). Auth-gated to signed-in users;
// reads via the service role. (Week-1 testnet — proper admin gating is later.)
export default async function AdminLedgerPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/admin/ledger");

  const admin = createAdminClient();
  const { data: events } = await admin
    .from("ledger_events")
    .select(
      "id, event_type, player_id, lobby_id, tx_hash, delivered_amount, memo, verified, created_at",
    )
    .order("created_at", { ascending: false })
    .limit(200);

  return (
    <main className="mx-auto flex min-h-screen max-w-3xl flex-col gap-6 p-6">
      <header className="flex items-center gap-3">
        <Logo size={30} />
        <span className="font-utility text-[12px] uppercase tracking-[0.08em] text-muted">
          admin · ledger events
        </span>
      </header>

      {!events || events.length === 0 ? (
        <Card wobble={1} className="p-6">
          <p className="font-body text-[16px] text-muted">
            no ledger events yet — verified seat claims appear here.
          </p>
        </Card>
      ) : (
        <ul className="flex flex-col gap-2">
          {events.map((e, i) => (
            <li key={e.id}>
              <Card
                wobble={((i % 4) + 1) as 1 | 2 | 3 | 4}
                className="flex flex-col gap-1 p-4"
              >
                <div className="flex items-center justify-between">
                  <span className="font-display text-[18px]">{e.event_type}</span>
                  <Chip variant={e.verified ? "verified" : "pending"}>
                    {e.verified ? "✓ verified" : "pending"}
                  </Chip>
                </div>
                <div className="break-all font-utility text-[11px] text-muted">
                  tx: {e.tx_hash ?? "—"}
                </div>
                <div className="font-utility text-[11px] text-muted">
                  delivered: {e.delivered_amount ?? "—"} drops
                  {e.memo ? ` · ${e.memo}` : ""}
                </div>
                <div className="font-utility text-[10px] text-faded">
                  {new Date(e.created_at).toISOString()}
                </div>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
