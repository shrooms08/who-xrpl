"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

export type CareerStats = {
  games: number;
  wins: number;
  imposter_games: number;
  imposter_wins: number;
  earned_drops: number;
};

export type MatchRow = {
  game_id: string;
  ended_at: string | null;
  topic: string | null;
  player_count: number;
  my_role: "crew" | "imposter";
  winner: "crew" | "imposter" | null;
  won: boolean;
  payout_drops: number | null;
  payout_tx: string | null;
};

const PAGE = 20;
const xrp = (drops: number) =>
  (drops / 1_000_000).toFixed(6).replace(/\.?0+$/, "");
const explorer = (hash: string) =>
  `https://testnet.xrpl.org/transactions/${hash}`;
const fmtDate = (iso: string | null) =>
  iso
    ? new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" })
    : "—";

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col items-center gap-0.5 border-2 border-ink bg-card px-2 py-2">
      <div className="font-display text-[22px] leading-none">{value}</div>
      <div className="text-center font-utility text-[9px] uppercase tracking-[0.06em] text-muted">
        {label}
      </div>
    </div>
  );
}

export default function MatchHistory({
  initialStats,
  initialGames,
}: {
  initialStats: CareerStats;
  initialGames: MatchRow[];
}) {
  const supabase = createClient();
  const [games, setGames] = useState<MatchRow[]>(initialGames);
  const [hasMore, setHasMore] = useState(initialGames.length >= PAGE);
  const [busy, setBusy] = useState(false);

  async function loadMore() {
    setBusy(true);
    const { data } = await supabase.rpc("get_match_history", {
      p_limit: PAGE,
      p_offset: games.length,
    });
    const next = (data ?? []) as MatchRow[];
    setGames((g) => [...g, ...next]);
    setHasMore(next.length >= PAGE);
    setBusy(false);
  }

  return (
    <section className="flex flex-col gap-4 border-t-2 border-dashed border-faded pt-6">
      {/* career counters */}
      <div className="font-utility text-[11px] uppercase tracking-[0.08em] text-muted">
        your record
      </div>
      <div className="grid grid-cols-5 gap-1.5">
        <Stat label="games" value={String(initialStats.games)} />
        <Stat label="wins" value={String(initialStats.wins)} />
        <Stat label="as imp" value={String(initialStats.imposter_games)} />
        <Stat label="imp wins" value={String(initialStats.imposter_wins)} />
        <Stat label="XRP won" value={xrp(initialStats.earned_drops)} />
      </div>

      {/* match history */}
      <div className="mt-2 font-utility text-[11px] uppercase tracking-[0.08em] text-muted">
        past games
      </div>
      {games.length === 0 ? (
        <div className="flex flex-col items-center gap-1 py-8 text-center">
          <div className="font-display text-[22px]">no games yet</div>
          <div className="font-body text-[15px] text-muted">
            you haven&apos;t hunted an imposter yet. start a game.
          </div>
        </div>
      ) : (
        <ul className="flex flex-col gap-2">
          {games.map((m, i) => (
            <li
              key={m.game_id}
              className={`flex items-center gap-3 border-2 border-ink bg-card px-3 py-2 ${i % 2 ? "wobble-2" : "wobble-1"}`}
            >
              <div className="flex flex-col">
                <span className="font-utility text-[11px] text-muted">
                  {fmtDate(m.ended_at)}
                </span>
                <span className="font-display text-[15px] leading-tight">
                  {m.topic ?? "mixed"}
                </span>
                <span className="font-utility text-[10px] text-faded">
                  {m.player_count} players
                </span>
              </div>
              <div className="flex-1" />
              <div className="flex flex-col items-end gap-1">
                <div className="flex items-center gap-1.5">
                  <span
                    className="border-2 px-1.5 py-0.5 font-utility text-[10px] uppercase"
                    style={{
                      borderColor:
                        m.my_role === "imposter" ? "var(--hot)" : "var(--calm)",
                      color:
                        m.my_role === "imposter" ? "var(--hot)" : "var(--calm)",
                    }}
                  >
                    {m.my_role}
                  </span>
                  <span
                    className="font-display text-[15px]"
                    style={{ color: m.won ? "var(--calm)" : "var(--hot)" }}
                  >
                    {m.won ? "won" : "lost"}
                  </span>
                </div>
                {m.payout_drops != null && (
                  <span className="font-utility text-[11px] text-calm">
                    +{xrp(m.payout_drops)} XRP
                    {m.payout_tx && (
                      <>
                        {" · "}
                        <a
                          href={explorer(m.payout_tx)}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="underline"
                        >
                          tx
                        </a>
                      </>
                    )}
                  </span>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}

      {hasMore && (
        <button
          type="button"
          onClick={loadMore}
          disabled={busy}
          className="wobble-1 self-center border-2 border-ink px-4 py-1.5 font-utility text-[12px] hover:bg-ink hover:text-paper disabled:opacity-50"
        >
          {busy ? "loading…" : "load more"}
        </button>
      )}
    </section>
  );
}
