import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { Logo } from "@/components/ui/Logo";
import { Card } from "@/components/ui/Card";
import { Chip } from "@/components/ui/Chip";

export const dynamic = "force-dynamic";

// Ledger listing (verified seat claims), read via the service role. Gated to an
// ADMIN_EMAILS allowlist in production; any signed-in user may view it in dev.
export default async function AdminLedgerPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/admin/ledger");

  const allow = (process.env.ADMIN_EMAILS ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
  const isAdmin =
    process.env.NODE_ENV !== "production" ||
    allow.includes((user.email ?? "").toLowerCase());
  if (!isAdmin) notFound();

  const admin = createAdminClient();
  const { data: events } = await admin
    .from("ledger_events")
    .select(
      "id, event_type, player_id, lobby_id, tx_hash, delivered_amount, memo, verified, created_at",
    )
    .order("created_at", { ascending: false })
    .limit(200);
  const { data: payouts } = await admin
    .from("payouts")
    .select("id, game_id, player_id, address, amount_drops, status, tx_hash, error, created_at")
    .order("created_at", { ascending: false })
    .limit(200);

  const payoutChip = (s: string) =>
    s === "sent" ? "verified" : s === "failed" ? "hot" : s === "skipped" ? "unclaimed" : "pending";

  return (
    <main className="mx-auto flex min-h-screen max-w-3xl flex-col gap-6 p-6">
      <header className="flex items-center gap-3">
        <Logo size={30} />
        <span className="font-utility text-[12px] uppercase tracking-[0.08em] text-muted">
          admin · ledger events
        </span>
      </header>

      <section className="flex flex-col gap-2">
        <div className="font-utility text-[12px] uppercase tracking-[0.08em] text-muted">
          payouts ({payouts?.length ?? 0})
        </div>
        {!payouts || payouts.length === 0 ? (
          <Card wobble={2} className="p-4">
            <p className="font-body text-[15px] text-muted">
              no payouts yet — winners of on-chain games are paid here.
            </p>
          </Card>
        ) : (
          <ul className="flex flex-col gap-2">
            {payouts.map((p, i) => (
              <li key={p.id}>
                <Card wobble={((i % 4) + 1) as 1 | 2 | 3 | 4} className="flex flex-col gap-1 p-4">
                  <div className="flex items-center justify-between">
                    <span className="font-display text-[18px]">
                      {(p.amount_drops / 1_000_000).toString()} XRP
                    </span>
                    <Chip variant={payoutChip(p.status)}>{p.status}</Chip>
                  </div>
                  <div className="break-all font-utility text-[11px] text-muted">
                    → {p.address || "—"}
                  </div>
                  <div className="break-all font-utility text-[11px] text-muted">
                    tx: {p.tx_hash ?? "—"}
                    {p.error ? ` · error: ${p.error}` : ""}
                  </div>
                  <div className="font-utility text-[10px] text-faded">
                    game {p.game_id.slice(0, 8)} · player {p.player_id.slice(0, 8)} ·{" "}
                    {new Date(p.created_at).toISOString()}
                  </div>
                </Card>
              </li>
            ))}
          </ul>
        )}
      </section>

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
