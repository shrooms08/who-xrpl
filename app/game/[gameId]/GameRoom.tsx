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
  Role,
} from "./types";

export type { RoleCard, RosterPlayer, RoundView, ClueView, ChatView } from "./types";

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
  const [error, setError] = useState<string | null>(null);
  const [clueText, setClueText] = useState("");
  const [vote, setVote] = useState<{ round: number; target: string | null } | null>(null);

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

  // --- refreshers -----------------------------------------------------------
  const refreshRound = useCallback(async () => {
    const { data: r } = await supabase
      .from("rounds")
      .select(
        "id, round_number, phase, phase_ends_at, current_turn_player_id, turn_order, ejected_player_id, ejected_role, awaiting_guess, guess_correct",
      )
      .eq("game_id", gameId)
      .order("round_number", { ascending: false })
      .limit(1)
      .maybeSingle();
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

  // --- realtime -------------------------------------------------------------
  useEffect(() => {
    let channel: RealtimeChannel | null = null;
    channel = supabase
      .channel(`game:${gameId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "rounds", filter: `game_id=eq.${gameId}` }, () => {
        refreshRound();
        refreshRoster();
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
        }
      })
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "lobbies", filter: `id=eq.${lobbyId}` }, (payload) => {
        const row = payload.new as { status: string };
        if (row.status === "waiting") router.replace(`/lobby/${lobbyId}`); // play-again
      })
      .subscribe();
    return () => {
      if (channel) supabase.removeChannel(channel);
    };
  }, [supabase, gameId, lobbyId, refreshRound, refreshRoster, refreshChat, refreshRoleCard, router]);

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
    async (path: string, body: unknown) => {
      const r = await fetch(`/api/game/${gameId}/${path}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body ?? {}),
      });
      if (!r.ok) {
        const j = await r.json().catch(() => ({}));
        setError(actionError(String(j.error ?? "error")));
      } else {
        setError(null);
      }
    },
    [gameId],
  );

  const submitClue = () => {
    postAction("clue", { text: clueText });
    setClueText("");
  };
  const doVote = (target: string | null) => {
    if (round) setVote({ round: round.round_number, target });
    postAction("vote", { targetId: target });
  };
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
                myVote={vote && vote.round === round?.round_number ? vote.target : undefined}
                onVote={doVote}
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
