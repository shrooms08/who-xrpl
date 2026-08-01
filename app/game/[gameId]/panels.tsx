"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Chip } from "@/components/ui/Chip";
import { AvatarChip } from "@/components/ui/AvatarChip";
import { RoleCard } from "@/components/ui/RoleCard";
import { PhaseTimer } from "@/components/ui/PhaseTimer";
import { Splat } from "@/components/doodles/Splat";
import {
  nameOf,
  initialOf,
  dropsToXrp,
  txExplorerUrl,
  type ChatView,
  type ClueView,
  type PayoutView,
  type RoleCard as RoleCardT,
  type RosterPlayer,
  type RoundView,
} from "./types";

const WOBBLE = ["wobble-1", "wobble-2", "wobble-3", "wobble-4"];

export function DealOverlay({
  roleCard,
  onReady,
}: {
  roleCard: RoleCardT;
  onReady: () => void;
}) {
  const fellows =
    roleCard.fellow_imposters?.map((f) => f.display_name ?? "Player") ?? [];
  return (
    <div
      className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-6 overflow-y-auto bg-paper p-6"
      style={{
        backgroundImage: "radial-gradient(rgba(0,0,0,0.0625) 1px, transparent 1px)",
        backgroundSize: "22px 22px",
      }}
    >
      <div className="font-utility text-[13px] text-muted">the cards are dealt…</div>
      <RoleCard
        role={roleCard.role}
        word={roleCard.word ?? undefined}
        category={roleCard.category}
        fellowImposters={fellows}
      />
      <Button variant="primary" onClick={onReady}>
        I&apos;M READY
      </Button>
    </div>
  );
}

export function RolePeek({ roleCard }: { roleCard: RoleCardT }) {
  const [peek, setPeek] = useState(false);
  return (
    <div className="flex flex-wrap items-center gap-3">
      <button
        onPointerDown={() => setPeek(true)}
        onPointerUp={() => setPeek(false)}
        onPointerLeave={() => setPeek(false)}
        className="wobble-2 select-none touch-none border-2 border-ink px-3 py-2 font-utility text-[12px] hover:bg-ink hover:text-paper"
      >
        hold to peek your role
      </button>
      {peek &&
        (roleCard.role === "crew" ? (
          <Card wobble={3} className="px-3 py-2">
            <span className="font-body text-[15px]">
              you are <span className="font-display text-calm">CREW</span> · word:{" "}
              <span className="font-display">{roleCard.word}</span>{" "}
              <span className="text-muted">({roleCard.category})</span>
            </span>
          </Card>
        ) : (
          <Card wobble={3} className="px-3 py-2">
            <span className="font-body text-[15px]">
              you are the <span className="font-display text-hot">IMPOSTER</span> ·
              category: {roleCard.category}
              {roleCard.fellow_imposters && roleCard.fellow_imposters.length > 0 && (
                <>
                  {" "}
                  · with:{" "}
                  {roleCard.fellow_imposters
                    .map((f) => (f.display_name ?? "?").toUpperCase())
                    .join(", ")}
                </>
              )}
            </span>
          </Card>
        ))}
    </div>
  );
}

export function TurnStrip({
  roster,
  currentTurnPlayerId,
  order,
}: {
  roster: RosterPlayer[];
  currentTurnPlayerId: string | null;
  order: string[] | null;
}) {
  const ids = order && order.length ? order : roster.map((r) => r.player_id);
  return (
    <div className="flex gap-2 overflow-x-auto pb-2">
      {ids.map((id) => {
        const p = roster.find((r) => r.player_id === id);
        if (!p) return null;
        const state = !p.alive
          ? "dead"
          : id === currentTurnPlayerId
            ? "current"
            : "alive";
        return (
          <AvatarChip
            key={id}
            initial={(p.display_name?.[0] ?? "?").toUpperCase()}
            name={(p.display_name ?? "?").toUpperCase()}
            state={state}
          />
        );
      })}
    </div>
  );
}

export function ClueFeed({
  clues,
  roster,
}: {
  clues: ClueView[];
  roster: RosterPlayer[];
}) {
  if (!clues.length) return null;
  // Group by clue pass. With 2 clue rounds a player clues twice, so we show a
  // "round N" header per pass; with a single round there's just one group.
  const passes = [...new Set(clues.map((c) => c.pass))].sort((a, b) => a - b);
  const multi = passes.length > 1;
  return (
    <section className="flex flex-col gap-2">
      <div className="font-utility text-[11px] uppercase tracking-[0.08em] text-muted">
        clues so far
      </div>
      {passes.map((p) => (
        <div key={p} className="flex flex-col gap-1.5">
          {multi && (
            <div className="font-utility text-[10px] uppercase tracking-[0.08em] text-faded">
              round {p + 1}
            </div>
          )}
          <div className="flex gap-2 overflow-x-auto pb-1">
            {clues
              .filter((c) => c.pass === p)
              .map((c, i) => (
                <div
                  key={i}
                  className={`min-w-[128px] border-[1.5px] border-ink bg-card ${WOBBLE[i % 4]} ${i % 2 ? "tilt-2" : "tilt-1"} shadow-ink px-3 py-2`}
                >
                  <div className="font-utility text-[11px] text-muted">
                    {nameOf(roster, c.player_id)}
                  </div>
                  <div className="font-body text-[15px] leading-tight">{c.text}</div>
                </div>
              ))}
          </div>
        </div>
      ))}
    </section>
  );
}

export function ChatPanel({
  chat,
  roster,
  userId,
  canChat,
  note,
  onSend,
}: {
  chat: ChatView[];
  roster: RosterPlayer[];
  userId: string;
  canChat: boolean;
  note: string;
  onSend: (t: string) => void;
}) {
  const [text, setText] = useState("");
  return (
    <section className="flex min-h-[180px] flex-1 flex-col gap-2">
      <div className="font-utility text-[11px] uppercase tracking-[0.08em] text-muted">
        chat
      </div>
      <div className="flex flex-1 flex-col gap-2 overflow-y-auto">
        {chat.map((m) => {
          const mine = m.player_id === userId;
          return (
            <div
              key={m.id}
              className={`flex flex-col ${mine ? "items-end" : "items-start"}`}
            >
              <div className="px-1 font-utility text-[10px] text-muted">
                {nameOf(roster, m.player_id)}
              </div>
              <div
                className={`max-w-[75%] border-2 border-ink px-3 py-2 font-body text-[16px] ${mine ? "bg-ink text-paper" : "bg-card"}`}
                style={{
                  borderRadius: mine
                    ? "18px 16px 4px 20px"
                    : "16px 20px 18px 4px",
                }}
              >
                {m.content}
              </div>
            </div>
          );
        })}
      </div>
      {canChat ? (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (text.trim()) {
              onSend(text.trim());
              setText("");
            }
          }}
          className="flex gap-2"
        >
          <input
            value={text}
            onChange={(e) => setText(e.target.value)}
            maxLength={500}
            placeholder="say something…"
            className="wobble-1 flex-1 border-2 border-ink bg-card px-3 py-2 font-body text-[16px] outline-none placeholder:text-faded"
          />
          <button className="wobble-2 border-2 border-ink bg-ink px-4 py-2 font-display text-[17px] text-paper">
            send
          </button>
        </form>
      ) : (
        <div className="font-utility text-[11px] text-faded">{note}</div>
      )}
    </section>
  );
}

export function VotePanel({
  roster,
  userId,
  selectedTarget, // undefined = nothing picked, null = skip picked, id = target
  votedTarget, // undefined = not registered yet, null = skipped, id = target
  progress,
  busy,
  onSelect,
  onConfirm,
  onChange,
}: {
  roster: RosterPlayer[];
  userId: string;
  selectedTarget: string | null | undefined;
  votedTarget: string | null | undefined;
  progress: { voted: number; living: number } | null;
  busy: boolean;
  onSelect: (targetId: string | null) => void;
  onConfirm: () => void;
  onChange: () => void;
}) {
  const living = roster.filter((r) => r.alive);
  const registered = votedTarget !== undefined;
  const votedLabel =
    votedTarget === null ? "SKIP" : nameOf(roster, votedTarget ?? null);

  return (
    <section className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <div className="font-utility text-[11px] uppercase tracking-[0.08em] text-muted">
          vote to eject
        </div>
        {progress && (
          <div className="font-utility text-[11px] text-ink">
            {progress.voted}/{progress.living} voted
          </div>
        )}
      </div>

      {registered ? (
        // REGISTERED — visually distinct from a mere selection (solid ink + ✓)
        <div className="flex flex-col gap-2">
          <div className="wobble-sketch flex items-center justify-center gap-2 border-[2.5px] border-ink bg-ink px-3 py-3 font-display text-[18px] text-paper">
            ✓ voted: {votedLabel}
          </div>
          <button
            onClick={onChange}
            className="wobble-1 self-center border-2 border-ink px-3 py-1.5 font-utility text-[12px] hover:bg-ink hover:text-paper"
          >
            change vote
          </button>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-2">
            {living
              .filter((p) => p.player_id !== userId)
              .map((p) => {
                const sel = selectedTarget === p.player_id;
                return (
                  <button
                    key={p.player_id}
                    onClick={() => onSelect(p.player_id)}
                    className={`wobble-sketch border-[2.5px] px-3 py-3 font-display text-[18px] ${sel ? "border-dashed border-hot bg-card text-hot" : "border-ink bg-card"}`}
                  >
                    {(p.display_name ?? "?").toUpperCase()}
                  </button>
                );
              })}
          </div>
          <button
            onClick={() => onSelect(null)}
            className={`wobble-1 border-2 px-3 py-2 font-utility text-[13px] ${selectedTarget === null ? "border-dashed border-hot text-hot" : "border-ink"}`}
          >
            skip
          </button>
          <Button
            variant="accuse"
            disabled={selectedTarget === undefined || busy}
            onClick={onConfirm}
          >
            {busy ? "voting…" : "confirm vote"}
          </Button>
        </>
      )}
    </section>
  );
}

export function RevealScreen({
  round,
  roster,
}: {
  round: RoundView;
  roster: RosterPlayer[];
}) {
  const ejected = round.ejected_player_id;
  if (!ejected) {
    return (
      <div className="flex flex-col items-center gap-3 py-8">
        <div className="font-utility text-[13px] text-muted">the group has decided</div>
        <div className="font-display text-[30px]">nobody was ejected</div>
        <div className="font-body text-[15px] text-muted">the vote was tied.</div>
      </div>
    );
  }
  const isImp = round.ejected_role === "imposter";
  return (
    <div className="relative flex flex-col items-center gap-4 py-8">
      <div className="font-utility text-[13px] text-muted">the group has decided</div>
      <AvatarChip initial={initialOf(roster, ejected)} state="dead" size={54} />
      <div className="font-utility text-[13px]">{nameOf(roster, ejected)} was…</div>
      {isImp ? (
        <Splat>
          <span
            className="font-display text-[34px] text-card"
            style={{ transform: "rotate(-2deg)" }}
          >
            IMPOSTER
          </span>
        </Splat>
      ) : (
        <div className="font-display text-[34px] text-calm">CREW</div>
      )}
      {isImp && (
        <div
          className="absolute bottom-1 right-2 border-[3px] border-hot px-3 py-1 font-display text-[22px] text-hot"
          style={{ borderRadius: "8px 12px 9px 11px", transform: "rotate(-9deg)" }}
        >
          GUILTY!!
        </div>
      )}
    </div>
  );
}

export function GuessPanel({
  round,
  roster,
  isGuesser,
  secondsLeft,
  onGuess,
}: {
  round: RoundView;
  roster: RosterPlayer[];
  isGuesser: boolean;
  secondsLeft: number;
  onGuess: (text: string) => void;
}) {
  const [text, setText] = useState("");
  if (round.guess_correct !== null) {
    return (
      <div className="flex flex-col items-center gap-2 py-6">
        <div className="font-display text-[24px] text-hot">
          {round.guess_correct ? "CORRECT — imposters win!" : "wrong guess"}
        </div>
      </div>
    );
  }
  return (
    <div className="flex flex-col items-center gap-4 py-6">
      <div className="flex items-center gap-3">
        <div className="font-utility text-[13px] text-hot">ONE GUESS TO WIN —</div>
        <PhaseTimer seconds={secondsLeft} size={46} />
      </div>
      {isGuesser ? (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            onGuess(text.trim());
          }}
          className="flex flex-col items-center gap-3"
        >
          <div className="wobble-3 w-[250px] border-[2.5px] border-ink bg-card px-4 py-3 text-center">
            <input
              autoFocus
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="type the word"
              className="w-full bg-transparent text-center font-utility text-[22px] tracking-[0.14em] outline-none placeholder:text-faded"
            />
          </div>
          <Button variant="accuse" type="submit">
            guess
          </Button>
        </form>
      ) : (
        <div className="flex flex-col items-center gap-2">
          <div className="w-[250px] border-[2.5px] border-ink bg-card px-4 py-3 text-center font-utility text-[22px] tracking-[0.14em]">
            ???<span className="animate-blink text-hot">_</span>
          </div>
          <div className="font-body text-[15px] text-muted">
            everyone&apos;s watching {nameOf(roster, round.ejected_player_id)} type.
            no pressure.
          </div>
        </div>
      )}
    </div>
  );
}

/** Per-winner payout affordance: calm amount chip (links the validated tx),
 *  or a pending / failed / skipped state. Utility face, unobtrusive. */
function PayoutChip({ payout }: { payout: PayoutView }) {
  if (payout.status === "sent") {
    const label = `◈ ${dropsToXrp(payout.amount_drops)} XRP`;
    return payout.tx_hash ? (
      <a
        href={txExplorerUrl(payout.tx_hash)}
        target="_blank"
        rel="noreferrer"
        title="view payout on the testnet explorer"
      >
        <Chip variant="verified" wobble={2}>
          {label} ↗
        </Chip>
      </a>
    ) : (
      <Chip variant="verified" wobble={2}>
        {label}
      </Chip>
    );
  }
  if (payout.status === "pending" || payout.status === "sending") {
    return (
      <Chip variant="pending" wobble={2}>
        payout pending…
      </Chip>
    );
  }
  if (payout.status === "failed") {
    return (
      <Chip variant="hot" wobble={2}>
        payout failed
      </Chip>
    );
  }
  return (
    <Chip variant="unclaimed" wobble={2}>
      payout skipped
    </Chip>
  );
}

export function EndScreen({
  roster,
  winner,
  word,
  payouts,
  isHost,
  onPlayAgain,
}: {
  roster: RosterPlayer[];
  winner: "crew" | "imposter" | null;
  word: string | null;
  payouts: PayoutView[];
  isHost: boolean;
  onPlayAgain: () => void;
}) {
  const payoutOf = new Map(payouts.map((p) => [p.player_id, p]));
  const onChain = payouts.length > 0;
  const allSkipped = onChain && payouts.every((p) => p.status === "skipped");
  return (
    <div className="flex flex-col items-center gap-5 py-8">
      <div className="font-utility text-[13px] text-muted">game over</div>
      <div
        className={`font-display text-[40px] ${winner === "imposter" ? "text-hot" : "text-calm"}`}
      >
        {winner === "imposter" ? "IMPOSTERS WIN" : "CREW WINS"}
      </div>
      <div className="font-body text-[16px]">
        the word was <span className="font-display">{word ?? "—"}</span>
      </div>
      <section className="flex w-full max-w-sm flex-col gap-2">
        <div className="flex items-center justify-between">
          <div className="font-utility text-[11px] uppercase tracking-[0.08em] text-muted">
            full reveal
          </div>
          {allSkipped && (
            <div className="font-utility text-[10px] text-faded">
              payouts skipped — pot empty
            </div>
          )}
        </div>
        {roster.map((p) => {
          const payout = payoutOf.get(p.player_id);
          return (
            <div key={p.player_id} className="flex flex-col gap-1">
              <div className="flex items-center gap-3">
                <AvatarChip
                  initial={(p.display_name?.[0] ?? "?").toUpperCase()}
                  state={p.alive ? "alive" : "dead"}
                  size={36}
                />
                <span className="flex-1 font-utility text-[13px]">
                  {(p.display_name ?? "?").toUpperCase()}
                </span>
                <Chip variant={p.role === "imposter" ? "hot" : "verified"}>
                  {p.role === "imposter" ? "imposter" : "crew"}
                </Chip>
              </div>
              {payout && (
                <div className="flex items-center gap-2 pl-[48px]">
                  <PayoutChip payout={payout} />
                </div>
              )}
            </div>
          );
        })}
      </section>
      {isHost ? (
        <Button variant="primary" onClick={onPlayAgain}>
          play again
        </Button>
      ) : (
        <div className="font-body text-[15px] text-muted">
          waiting for the host to restart…
        </div>
      )}
    </div>
  );
}
