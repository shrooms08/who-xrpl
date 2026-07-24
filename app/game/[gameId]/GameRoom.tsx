"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/client";
import { Logo } from "@/components/ui/Logo";
import { Button } from "@/components/ui/Button";
import { PhaseTimer } from "@/components/ui/PhaseTimer";
import {
  DealOverlay,
  RolePeek,
  TurnStrip,
  ClueFeed,
  ChatPanel,
  VotePanel,
  RevealScreen,
  GuessPanel,
  EndScreen,
} from "./panels";
import type {
  RoleCard,
  RosterPlayer,
  RoundView,
  ClueView,
  ChatView,
  PayoutView,
  Role,
} from "./types";

export type { RoleCard, RosterPlayer, RoundView, ClueView, ChatView, PayoutView } from "./types";

const PHASE_LABEL: Record<string, string> = {
  clue: "CLUE TIME",
  discussion: "DISCUSSION",
  vote: "VOTE",
  reveal: "REVEAL",
  guess: "GUESS",
};

function actionError(code: string): string {
  const map: Record<string, string> = {
    too_long: "clue is too long (max 60).",
    empty: "type a clue first.",
    contains_word: "your clue can't contain the secret word.",
    not_your_turn: "it's not your turn.",
    wrong_phase: "too late — the phase changed.",
    not_living: "you've been ejected — spectating only.",
  };
  return map[code] ?? code;
}

export default function GameRoom({
  gameId,
  lobbyId,
  hostId,
  userId,
  initialStatus,
  initialWinner,
  initialRoleCard,
  initialRoster,
  initialRound,
  initialClues,
  initialChat,
  initialPayouts,
  serverNowIso,
}: {
  gameId: string;
  lobbyId: string;
  hostId: string;
  userId: string;
  initialStatus: string;
  initialWinner: Role | null;
  initialRoleCard: RoleCard;
  initialRoster: RosterPlayer[];
  initialRound: RoundView | null;
  initialClues: ClueView[];
  initialChat: ChatView[];
  initialPayouts: PayoutView[];
  serverNowIso: string;
}) {
  const router = useRouter();
  const supabase = createClient();

  const [roleCard, setRoleCard] = useState(initialRoleCard);
  const [roster, setRoster] = useState(initialRoster);
  const [round, setRound] = useState(initialRound);
  const [clues, setClues] = useState(initialClues);
  const [chat, setChat] = useState(initialChat);
  const [status, setStatus] = useState(initialStatus);
  const [winner, setWinner] = useState(initialWinner);
  const [payouts, setPayouts] = useState(initialPayouts);
  const [error, setError] = useState<string | null>(null);
  const [clueText, setClueText] = useState("");
  const [selected, setSelected] = useState<{ round: number; target: string | null } | null>(null);
  const [voted, setVoted] = useState<{ round: number; target: string | null } | null>(null);
  const [voteBusy, setVoteBusy] = useState(false);
  const [voteProgress, setVoteProgress] = useState<{ voted: number; living: number } | null>(null);
  const [channelDown, setChannelDown] = useState(false);
  const [fetchFailing, setFetchFailing] = useState(false);

  const [ready, setReady] = useState<boolean>(
    () => typeof window !== "undefined" && !!sessionStorage.getItem(`dealt:${gameId}`),
  );

  // server-time skew (measured once at mount) → countdowns track server clock
  const skewRef = useRef(Date.parse(serverNowIso) - Date.now());
  const [nowTick, setNowTick] = useState(Date.now());
  useEffect(() => {
    const i = setInterval(() => setNowTick(Date.now()), 500);
    return () => clearInterval(i);
  }, []);
  const serverNow = nowTick + skewRef.current;
  const secondsLeft = round?.phase_ends_at
    ? Math.max(0, Math.ceil((Date.parse(round.phase_ends_at) - serverNow) / 1000))
    : 0;
  // We're behind if the channel errored OR our phase has been overdue for a
  // while (realtime silently stalled — Brave/Safari). Drives the indicator.
  const overdueMs =
    round?.phase_ends_at && round.phase !== "end"
      ? serverNow - Date.parse(round.phase_ends_at)
      : 0;
  const reconnecting = channelDown || fetchFailing || overdueMs > 3000;

  // --- refreshers -----------------------------------------------------------
  const refreshRound = useCallback(async () => {
    const { data: r, error } = await supabase
      .from("rounds")
      .select(
        "id, round_number, phase, phase_ends_at, current_turn_player_id, turn_order, ejected_player_id, ejected_role, awaiting_guess, guess_correct",
      )
      .eq("game_id", gameId)
      .order("round_number", { ascending: false })
      .limit(1)
      .maybeSingle();
    setFetchFailing(!!error); // surface REST failures instead of silently no-op'ing
    if (r) {
      setRound(r as RoundView);
      const { data: c } = await supabase
        .from("clues")
        .select("player_id, text")
        .eq("round_id", r.id)
        .order("created_at", { ascending: true });
      setClues(c ?? []);
    }
  }, [supabase, gameId]);

  const refreshRoster = useCallback(async () => {
    const { data } = await supabase.rpc("get_game_roster", { p_game: gameId });
    if (data) setRoster(data as RosterPlayer[]);
  }, [supabase, gameId]);

  const refreshChat = useCallback(async () => {
    const { data } = await supabase
      .from("chat_messages")
      .select("id, player_id, content")
      .eq("game_id", gameId)
      .order("created_at", { ascending: true });
    setChat((data ?? []) as ChatView[]);
  }, [supabase, gameId]);

  const refreshRoleCard = useCallback(async () => {
    const { data } = await supabase.rpc("get_my_role_card", { p_game: gameId });
    if (data) setRoleCard(data as unknown as RoleCard);
  }, [supabase, gameId]);

  const refreshVoteProgress = useCallback(async () => {
    const { data } = await supabase.rpc("get_vote_progress", { p_game: gameId });
    if (data) setVoteProgress(data as unknown as { voted: number; living: number });
  }, [supabase, gameId]);

  const refreshGame = useCallback(async () => {
    const { data } = await supabase
      .from("games")
      .select("status, winner")
      .eq("id", gameId)
      .maybeSingle();
    if (data) {
      setStatus(data.status);
      setWinner(data.winner as Role | null);
    }
  }, [supabase, gameId]);

  // Payouts land a few seconds after game-end (async settlement) — the poll
  // below refetches so the paid chips flip pending → paid on their own.
  const refreshPayouts = useCallback(async () => {
    const { data } = await supabase
      .from("payouts")
      .select("player_id, amount_drops, status, tx_hash")
      .eq("game_id", gameId);
    if (data) setPayouts(data as PayoutView[]);
  }, [supabase, gameId]);

  /** Pull the entire current server state. The single recovery primitive used
   *  by every self-heal path (reconnect, focus, bfcache restore, watchdog). */
  const refetchAll = useCallback(async () => {
    await Promise.all([
      refreshRound(),
      refreshRoster(),
      refreshChat(),
      refreshGame(),
      refreshRoleCard(),
      refreshVoteProgress(),
      refreshPayouts(),
    ]);
  }, [refreshRound, refreshRoster, refreshChat, refreshGame, refreshRoleCard, refreshVoteProgress, refreshPayouts]);

  // --- realtime -------------------------------------------------------------
  useEffect(() => {
    let channel: RealtimeChannel | null = null;
    channel = supabase
      .channel(`game:${gameId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "rounds", filter: `game_id=eq.${gameId}` }, () => {
        refreshRound();
        refreshRoster();
        refreshVoteProgress(); // each vote rewrites the round row → live counter
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "clues" }, () => refreshRound())
      .on("postgres_changes", { event: "*", schema: "public", table: "chat_messages", filter: `game_id=eq.${gameId}` }, () => refreshChat())
      .on("postgres_changes", { event: "*", schema: "public", table: "games", filter: `id=eq.${gameId}` }, (payload) => {
        const row = payload.new as { status: string; winner: Role | null };
        setStatus(row.status);
        setWinner(row.winner);
        if (row.status === "ended") {
          refreshRoster();
          refreshRoleCard();
          refreshPayouts();
        }
      })
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "lobbies", filter: `id=eq.${lobbyId}` }, (payload) => {
        const row = payload.new as { status: string };
        if (row.status === "waiting") router.replace(`/lobby/${lobbyId}`); // play-again
      })
      .subscribe((s) => {
        if (s === "SUBSCRIBED") {
          // (re)connected — reconcile with the server immediately
          setChannelDown(false);
          refetchAll();
        } else if (s === "CHANNEL_ERROR" || s === "TIMED_OUT" || s === "CLOSED") {
          setChannelDown(true);
        }
      });
    return () => {
      if (channel) supabase.removeChannel(channel);
    };
  }, [supabase, gameId, lobbyId, refreshRound, refreshRoster, refreshChat, refreshRoleCard, refreshVoteProgress, refetchAll, router]);

  // Self-heal on tab focus / visibility (Safari throttles background sockets)
  // and on bfcache restore (Safari can serve a stale page without a server hit).
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === "visible") refetchAll();
    };
    const onFocus = () => refetchAll();
    const onPageShow = (e: PageTransitionEvent) => {
      if (e.persisted) refetchAll(); // restored from bfcache → refetch current state
    };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onFocus);
    window.addEventListener("pageshow", onPageShow);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onFocus);
      window.removeEventListener("pageshow", onPageShow);
    };
  }, [refetchAll]);

  // Backstop poll — runs UNCONDITIONALLY, independent of channel status or the
  // phase deadline. Realtime can connect yet silently deliver nothing (Brave
  // Shields blocking the socket, Safari background throttling) with NO error to
  // key off, so the reconnect callback is not a sufficient staleness signal, and
  // a deadline-gated check does nothing while a stale view's deadline is still in
  // the future (the round-start freeze). Every 3s we pull the whole server state
  // — refetchAll() calls setState, which actually replaces what's rendered — and,
  // if our deadline is overdue, also nudge the idempotent advance endpoint.
  const roundRef = useRef(round);
  useEffect(() => {
    roundRef.current = round;
  }, [round]);
  useEffect(() => {
    const tick = () => {
      if (document.visibilityState === "hidden") return; // focus/visibility cover wake
      refetchAll();
      const r = roundRef.current;
      if (r && r.phase_ends_at && r.phase !== "end") {
        const overdueMs = Date.now() + skewRef.current - Date.parse(r.phase_ends_at);
        if (overdueMs > 1500) {
          fetch(`/api/game/${gameId}/advance`, { method: "POST" }).catch(() => {});
        }
      }
    };
    const i = setInterval(tick, 3000);
    return () => clearInterval(i);
  }, [gameId, refetchAll]);

  // fetch the vote counter on entering the vote phase (realtime keeps it live)
  useEffect(() => {
    if (round?.phase === "vote") refreshVoteProgress();
  }, [round?.phase, round?.round_number, refreshVoteProgress]);

  // --- server-authoritative timer trigger (idempotent on the server) --------
  const advancedForRef = useRef<string | null>(null);
  useEffect(() => {
    if (!round || !round.phase_ends_at || round.phase === "end") return;
    if (secondsLeft > 0) return;
    const key = `${round.round_number}:${round.phase}:${round.phase_ends_at}`;
    if (advancedForRef.current === key) return;
    advancedForRef.current = key;
    fetch(`/api/game/${gameId}/advance`, { method: "POST" }).catch(() => {});
  }, [secondsLeft, round, gameId]);

  // --- actions --------------------------------------------------------------
  const postAction = useCallback(
    async (path: string, body: unknown): Promise<boolean> => {
      const r = await fetch(`/api/game/${gameId}/${path}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body ?? {}),
      });
      if (!r.ok) {
        const j = await r.json().catch(() => ({}));
        setError(actionError(String(j.error ?? "error")));
        return false;
      }
      setError(null);
      return true;
    },
    [gameId],
  );

  const submitClue = () => {
    postAction("clue", { text: clueText });
    setClueText("");
  };
  const selectTarget = (target: string | null) => {
    if (round) setSelected({ round: round.round_number, target });
  };
  const confirmVote = async () => {
    if (!round || !selected || selected.round !== round.round_number) return;
    setVoteBusy(true);
    const ok = await postAction("vote", { targetId: selected.target });
    setVoteBusy(false);
    if (ok) {
      setVoted({ round: round.round_number, target: selected.target });
      refreshVoteProgress();
    }
  };
  const changeVote = () => setVoted(null);
  const doGuess = (text: string) => postAction("guess", { text });
  const sendChat = (text: string) =>
    supabase.rpc("send_chat", { p_game: gameId, p_content: text }).then(({ error }) => {
      if (error) setError(error.message.replace(/^.*muted.*$/i, "you're muted."));
    });
  const playAgain = async () => {
    await supabase.from("lobbies").update({ status: "waiting" }).eq("id", lobbyId);
    router.replace(`/lobby/${lobbyId}`);
  };

  // --- derived --------------------------------------------------------------
  const me = roster.find((r) => r.player_id === userId);
  const amAlive = me?.alive ?? true;
  const isHost = hostId === userId;
  const phase = round?.phase;
  const myTurn = phase === "clue" && round?.current_turn_player_id === userId;
  const isEnded = status === "ended" || phase === "end";

  // deal overlay (once per game session)
  if (!isEnded && !ready) {
    return (
      <DealOverlay
        roleCard={roleCard}
        onReady={() => {
          sessionStorage.setItem(`dealt:${gameId}`, "1");
          setReady(true);
        }}
      />
    );
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col gap-4 p-5">
      <header className="flex items-center justify-between">
        <Logo size={30} />
        {round && !isEnded && (
          <div className="flex items-center gap-3">
            <div className="text-right">
              <div className="font-display text-[22px] leading-none">
                {PHASE_LABEL[round.phase] ?? ""}
              </div>
              <div className="font-utility text-[11px] text-muted">
                round {round.round_number}
              </div>
            </div>
            {round.phase_ends_at && round.phase !== "reveal" && (
              <PhaseTimer seconds={secondsLeft} size={56} />
            )}
          </div>
        )}
      </header>

      {reconnecting && (
        <div className="wobble-1 flex items-center gap-2 border-2 border-dashed border-faded bg-card px-3 py-1.5 font-utility text-[12px] text-muted">
          <span className="h-2 w-2 animate-tickpulse rounded-full bg-faded" />
          {channelDown ? "reconnecting… hold on" : "catching up…"}
        </div>
      )}

      {error && (
        <div className="wobble-2 border-2 border-ink bg-card px-3 py-2 font-body text-[15px] text-ink">
          {error}
        </div>
      )}

      {isEnded ? (
        <EndScreen
          roster={roster}
          winner={winner}
          word={roleCard.word}
          payouts={payouts}
          isHost={isHost}
          onPlayAgain={playAgain}
        />
      ) : (
        <>
          <RolePeek roleCard={roleCard} />

          {round && (phase === "clue" || phase === "discussion" || phase === "vote") && (
            <TurnStrip
              roster={roster}
              currentTurnPlayerId={round.current_turn_player_id}
              order={round.turn_order}
            />
          )}

          {(phase === "clue" || phase === "discussion" || phase === "vote") && (
            <ClueFeed clues={clues} roster={roster} />
          )}

          {phase === "clue" && (
            myTurn ? (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  submitClue();
                }}
                className="flex flex-col gap-2"
              >
                <div className="font-utility text-[11px] uppercase tracking-[0.08em] text-muted">
                  your clue — one line, max 60
                </div>
                <div className="flex gap-2">
                  <input
                    autoFocus
                    maxLength={60}
                    value={clueText}
                    onChange={(e) => setClueText(e.target.value)}
                    placeholder="give a clue…"
                    className="wobble-1 flex-1 border-2 border-ink bg-card px-3 py-2 font-body text-[16px] outline-none placeholder:text-faded"
                  />
                  <Button variant="primary" type="submit">
                    send
                  </Button>
                </div>
              </form>
            ) : (
              <div className="py-4 text-center font-body text-[16px] text-muted">
                waiting for{" "}
                <span className="font-display">
                  {roster.find((r) => r.player_id === round?.current_turn_player_id)
                    ?.display_name ?? "…"}
                </span>{" "}
                to give a clue…
              </div>
            )
          )}

          {phase === "discussion" && (
            <ChatPanel
              chat={chat}
              roster={roster}
              userId={userId}
              canChat={amAlive}
              note="spectators are muted."
              onSend={sendChat}
            />
          )}

          {phase === "vote" &&
            (amAlive ? (
              <VotePanel
                roster={roster}
                userId={userId}
                selectedTarget={
                  selected && selected.round === round?.round_number
                    ? selected.target
                    : undefined
                }
                votedTarget={
                  voted && voted.round === round?.round_number
                    ? voted.target
                    : undefined
                }
                progress={voteProgress}
                busy={voteBusy}
                onSelect={selectTarget}
                onConfirm={confirmVote}
                onChange={changeVote}
              />
            ) : (
              <div className="py-4 text-center font-body text-[16px] text-muted">
                you&apos;re spectating — you can&apos;t vote.
              </div>
            ))}

          {phase === "reveal" && round && (
            <RevealScreen round={round} roster={roster} />
          )}

          {phase === "guess" && round && (
            <GuessPanel
              round={round}
              roster={roster}
              isGuesser={round.ejected_player_id === userId}
              secondsLeft={secondsLeft}
              onGuess={doGuess}
            />
          )}
        </>
      )}
    </main>
  );
}
