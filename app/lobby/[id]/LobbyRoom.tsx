"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/client";
import { lobbyErrorMessage } from "@/lib/lobby-errors";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Chip } from "@/components/ui/Chip";
import { CodeEntry } from "@/components/ui/CodeEntry";
import { Toast } from "@/components/ui/Toast";
import { AvatarChip } from "@/components/ui/AvatarChip";
import { SeatClaimButton, WalletLinkButton } from "./SeatClaim";
import {
  DISCUSSION_OPTIONS,
  CLUE_ROUNDS_OPTIONS,
  TOPIC_CATEGORIES,
} from "@/lib/game";

export type Member = {
  playerId: string;
  joinedAt: string;
  displayName: string;
};

type Mode = "casual" | "onchain";

const topicLabel = (t: string | null) => t ?? "random";

/** One segmented control in the host settings panel. Non-host lobbies render a
 *  read-only summary instead, so these are only ever shown to the host. */
function SegButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={[
        "border-2 px-2.5 py-1 font-utility text-[12px] lowercase transition-colors",
        active
          ? "border-ink bg-ink text-paper"
          : "border-faded text-muted hover:border-ink hover:text-ink",
      ].join(" ")}
    >
      {children}
    </button>
  );
}

function SettingRow({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="font-utility text-[10px] uppercase tracking-[0.08em] text-faded">
        {label}
      </span>
      <div className="flex flex-wrap gap-1.5">{children}</div>
    </div>
  );
}

const MIN_PLAYERS = 4;

export default function LobbyRoom({
  lobbyId,
  code,
  maxPlayers,
  initialHostId,
  initialStatus,
  initialMode,
  userId,
  initialMembers,
  initialClaims,
  linkedAddress,
  initialDiscussionSeconds,
  initialClueRounds,
  initialTopic,
}: {
  lobbyId: string;
  code: string;
  maxPlayers: number;
  initialHostId: string;
  initialStatus: string;
  initialMode: Mode;
  userId: string;
  initialMembers: Member[];
  initialClaims: string[];
  linkedAddress: string | null;
  initialDiscussionSeconds: number;
  initialClueRounds: number;
  initialTopic: string | null;
}) {
  const router = useRouter();
  const supabase = createClient();

  const [members, setMembers] = useState<Member[]>(initialMembers);
  const [hostId, setHostId] = useState(initialHostId);
  const [status, setStatus] = useState(initialStatus);
  const [online, setOnline] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const [channelDown, setChannelDown] = useState(false);
  const [inviteUrl, setInviteUrl] = useState("");
  // On-chain seat-claim (Gate 3). `mode` is persisted on the lobby.
  const [mode, setMode] = useState<Mode>(initialMode);
  const [claims, setClaims] = useState<Set<string>>(new Set(initialClaims));
  const [walletAddress, setWalletAddress] = useState<string | null>(linkedAddress);
  // Host settings (persisted on the lobby; locked at start; shown to all players).
  const [discussionSeconds, setDiscussionSeconds] = useState(initialDiscussionSeconds);
  const [clueRounds, setClueRounds] = useState(initialClueRounds);
  const [topic, setTopic] = useState<string | null>(initialTopic);

  const membersRef = useRef(initialMembers);
  const hostIdRef = useRef(initialHostId);
  const onlineRef = useRef<Set<string>>(new Set());
  const leavingRef = useRef(false);
  const channelRef = useRef<RealtimeChannel | null>(null);

  const isHost = hostId === userId;

  useEffect(() => {
    setInviteUrl(`${window.location.origin}/join/${code}`);
  }, [code]);

  // Presence heartbeat → keeps last_seen fresh so a live host is never reaped.
  useEffect(() => {
    const beat = () => {
      supabase.rpc("touch_lobby_presence", { p_lobby: lobbyId });
    };
    beat();
    const i = setInterval(beat, 8000);
    return () => clearInterval(i);
  }, [supabase, lobbyId]);

  const applyMembers = useCallback(
    (next: Member[]) => {
      membersRef.current = next;
      setMembers(next);
      if (!leavingRef.current && !next.some((m) => m.playerId === userId)) {
        leavingRef.current = true;
        router.replace("/?removed=1");
      }
    },
    [router, userId],
  );

  const fetchMembers = useCallback(async () => {
    const { data: rows } = await supabase
      .from("lobby_players")
      .select("player_id, joined_at")
      .eq("lobby_id", lobbyId)
      .order("joined_at", { ascending: true });
    const ids = (rows ?? []).map((r) => r.player_id);
    const { data: profs } = ids.length
      ? await supabase.from("profiles").select("id, display_name").in("id", ids)
      : { data: [] as { id: string; display_name: string | null }[] };
    applyMembers(
      (rows ?? []).map((r) => ({
        playerId: r.player_id,
        joinedAt: r.joined_at,
        displayName:
          profs?.find((p) => p.id === r.player_id)?.display_name ?? "Player",
      })),
    );
  }, [supabase, lobbyId, applyMembers]);

  const isDesignatedReaper = useCallback(
    (absentId: string) => {
      const candidates = membersRef.current
        .filter((m) => m.playerId !== absentId && onlineRef.current.has(m.playerId))
        .sort(
          (a, b) =>
            a.joinedAt.localeCompare(b.joinedAt) ||
            a.playerId.localeCompare(b.playerId),
        );
      return candidates.length > 0 && candidates[0].playerId === userId;
    },
    [userId],
  );

  /** Full lobby resync — used on reconnect / focus / bfcache restore. Also
   *  catches a missed in_game flip and forwards the player into the game. */
  const refetchClaims = useCallback(async () => {
    // Latest-event-wins: a verified seat_claim counts only if no seat_unclaim
    // (wallet disconnect) is at-or-after it — mirrors has_verified_seat_claim.
    const { data } = await supabase
      .from("ledger_events")
      .select("player_id, event_type, verified, created_at")
      .eq("lobby_id", lobbyId)
      .in("event_type", ["seat_claim", "seat_unclaim"]);
    const claimAt = new Map<string, number>();
    const unclaimAt = new Map<string, number>();
    for (const r of data ?? []) {
      if (!r.player_id) continue;
      const t = Date.parse(r.created_at);
      if (r.event_type === "seat_claim" && r.verified) {
        claimAt.set(r.player_id, Math.max(claimAt.get(r.player_id) ?? 0, t));
      } else if (r.event_type === "seat_unclaim") {
        unclaimAt.set(r.player_id, Math.max(unclaimAt.get(r.player_id) ?? 0, t));
      }
    }
    const set = new Set<string>();
    for (const [pid, ct] of claimAt) {
      if ((unclaimAt.get(pid) ?? -1) < ct) set.add(pid);
    }
    setClaims(set);
  }, [supabase, lobbyId]);

  const refetchLobby = useCallback(async () => {
    const { data: l } = await supabase
      .from("lobbies")
      .select("status, host_id, mode, discussion_seconds, clue_rounds, topic")
      .eq("id", lobbyId)
      .maybeSingle();
    if (l) {
      hostIdRef.current = l.host_id;
      setHostId(l.host_id);
      setStatus(l.status);
      setDiscussionSeconds(l.discussion_seconds);
      setClueRounds(l.clue_rounds);
      setTopic(l.topic);
      setMode(l.mode);
      if (l.status === "in_game") {
        const { data: g } = await supabase
          .from("games")
          .select("id")
          .eq("lobby_id", lobbyId)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        if (g) {
          router.replace(`/game/${g.id}`);
          return;
        }
      }
    }
    await Promise.all([fetchMembers(), refetchClaims()]);
  }, [supabase, lobbyId, fetchMembers, refetchClaims, router]);

  useEffect(() => {
    let channel: RealtimeChannel | null = null;

    const updateOnline = (ch: RealtimeChannel) => {
      const state = ch.presenceState<{ player_id: string }>();
      const set = new Set<string>();
      for (const key of Object.keys(state)) {
        for (const p of state[key]) set.add(p.player_id);
      }
      onlineRef.current = set;
      setOnline(set);
    };

    const handleLeave = (leftPresences: Array<{ player_id?: string }>) => {
      // Presence loss NEVER removes membership — it only dims the roster and,
      // for a vanished HOST, provides host-migration timing. Leaving is explicit
      // (leave button / host kick) only. (Bug 1: the host used to delete any
      // non-host who dropped from presence, ejecting throttled/away phones.)
      for (const p of leftPresences) {
        const leftId = p.player_id;
        if (!leftId) continue;

        if (leftId === hostIdRef.current && leftId !== userId) {
          // A vanished host MAY trigger role migration — but the RPC gates on
          // 60s+ staleness and a claim-grace window, and never deletes the
          // host's membership. Best-effort: re-probe while the host stays away.
          const absent = leftId;
          const probe = () => {
            if (
              hostIdRef.current === absent &&
              !onlineRef.current.has(absent) &&
              isDesignatedReaper(absent)
            ) {
              supabase.rpc("reap_and_migrate_host", {
                p_lobby: lobbyId,
                p_absent_host: absent,
              });
            }
          };
          setTimeout(probe, 2000);
          setTimeout(probe, 65000); // clears the 60s staleness gate if still gone
        }
      }
    };

    channel = supabase
      .channel(`lobby:${lobbyId}`, { config: { presence: { key: userId } } })
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "lobby_players",
          filter: `lobby_id=eq.${lobbyId}`,
        },
        () => fetchMembers(),
      )
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "lobbies",
          filter: `id=eq.${lobbyId}`,
        },
        (payload) => {
          const row = payload.new as {
            host_id: string;
            status: string;
            mode: Mode;
            discussion_seconds?: number;
            clue_rounds?: number;
            topic?: string | null;
          };
          hostIdRef.current = row.host_id;
          setHostId(row.host_id);
          setStatus(row.status);
          if (row.mode) setMode(row.mode);
          if (typeof row.discussion_seconds === "number") setDiscussionSeconds(row.discussion_seconds);
          if (typeof row.clue_rounds === "number") setClueRounds(row.clue_rounds);
          if (row.topic !== undefined) setTopic(row.topic);
          if (row.status === "in_game") {
            // the game started — send every player into it
            supabase
              .from("games")
              .select("id")
              .eq("lobby_id", lobbyId)
              .eq("status", "active")
              .order("created_at", { ascending: false })
              .limit(1)
              .maybeSingle()
              .then(({ data }) => {
                if (data) router.replace(`/game/${data.id}`);
              });
          }
        },
      )
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "games",
          filter: `lobby_id=eq.${lobbyId}`,
        },
        (payload) => {
          // Reliable start trigger: the game row now EXISTS (the lobby-status
          // flip fires before the insert, so querying on it can race). Send
          // every member into the game.
          const g = payload.new as { id: string };
          router.replace(`/game/${g.id}`);
        },
      )
      .on(
        "postgres_changes",
        {
          event: "DELETE",
          schema: "public",
          table: "lobbies",
          filter: `id=eq.${lobbyId}`,
        },
        () => {
          if (!leavingRef.current) {
            leavingRef.current = true;
            router.replace("/?closed=1");
          }
        },
      )
      .on("presence", { event: "sync" }, () => channel && updateOnline(channel))
      .on("presence", { event: "leave" }, ({ leftPresences }) =>
        handleLeave(leftPresences as Array<{ player_id?: string }>),
      )
      .subscribe(async (s) => {
        if (s === "SUBSCRIBED") {
          setChannelDown(false);
          await channel?.track({ player_id: userId, online_at: Date.now() });
          refetchLobby(); // reconcile on (re)connect
        } else if (s === "CHANNEL_ERROR" || s === "TIMED_OUT" || s === "CLOSED") {
          setChannelDown(true);
        }
      });
    channelRef.current = channel;

    return () => {
      if (channel) supabase.removeChannel(channel);
    };
  }, [supabase, lobbyId, userId, fetchMembers, isDesignatedReaper, refetchLobby, router]);

  // Self-heal on focus / visibility / bfcache restore. Returning from Xaman
  // (or any backgrounding) must RE-REGISTER PRESENCE, not just refetch state:
  // re-track on the channel and refresh last_seen so a returned player is shown
  // present again and can't be treated as stale for host-migration timing.
  useEffect(() => {
    const reregister = () => {
      channelRef.current
        ?.track({ player_id: userId, online_at: Date.now() })
        .catch(() => {});
      supabase.rpc("touch_lobby_presence", { p_lobby: lobbyId });
      refetchLobby();
    };
    const onVisible = () => {
      if (document.visibilityState === "visible") reregister();
    };
    const onFocus = () => reregister();
    const onPageShow = (e: PageTransitionEvent) => {
      if (e.persisted) reregister();
    };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onFocus);
    window.addEventListener("pageshow", onPageShow);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onFocus);
      window.removeEventListener("pageshow", onPageShow);
    };
  }, [supabase, lobbyId, userId, refetchLobby]);

  // Unconditional backstop poll: realtime can connect yet silently deliver
  // nothing, which would miss the in_game flip — so resync every 4s regardless.
  useEffect(() => {
    const i = setInterval(() => {
      if (document.visibilityState !== "hidden") refetchLobby();
    }, 4000);
    return () => clearInterval(i);
  }, [refetchLobby]);

  async function copyText(text: string, message: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(message);
      setTimeout(() => setCopied(null), 1600);
    } catch {
      /* clipboard blocked — the value is still shown on screen */
    }
  }

  async function kick(targetId: string) {
    setError(null);
    const { error } = await supabase
      .from("lobby_players")
      .delete()
      .eq("lobby_id", lobbyId)
      .eq("player_id", targetId);
    if (error) setError(lobbyErrorMessage(error));
  }

  async function leave() {
    leavingRef.current = true;
    await supabase.rpc("leave_lobby", { p_lobby: lobbyId });
    router.replace("/");
    router.refresh();
  }

  async function start() {
    setError(null);
    const r = await fetch("/api/game/start", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ lobbyId }),
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) {
      setError(
        j?.error === "seat_claims_incomplete"
          ? "everyone needs a verified seat claim first."
          : j?.error
            ? String(j.error)
            : "could not start the game.",
      );
      return;
    }
    if (j?.gameId) router.push(`/game/${j.gameId}`);
  }

  async function changeMode(m: Mode) {
    setMode(m); // optimistic; RLS lets only the host update
    const { error } = await supabase.from("lobbies").update({ mode: m }).eq("id", lobbyId);
    if (error) setError(lobbyErrorMessage(error));
  }

  // Host-only, pre-game. Optimistic; RLS lets only the host update, and the
  // realtime lobbies-UPDATE broadcast mirrors the change to every player.
  async function changeSettings(patch: {
    discussion_seconds?: number;
    clue_rounds?: number;
    topic?: string | null;
  }) {
    if (patch.discussion_seconds !== undefined) setDiscussionSeconds(patch.discussion_seconds);
    if (patch.clue_rounds !== undefined) setClueRounds(patch.clue_rounds);
    if (patch.topic !== undefined) setTopic(patch.topic);
    const { error } = await supabase.from("lobbies").update(patch).eq("id", lobbyId);
    if (error) setError(lobbyErrorMessage(error));
  }

  const enoughPlayers = members.length >= MIN_PLAYERS;
  const allClaimed =
    mode === "casual" || members.every((m) => claims.has(m.playerId));
  const canStart = isHost && enoughPlayers && allClaimed;
  const needed = Math.max(0, MIN_PLAYERS - members.length);
  const emptySlots = Math.max(0, maxPlayers - members.length);
  const myClaimed = claims.has(userId);

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col gap-6 p-6">
      <header className="flex items-start justify-between">
        <div>
          <h1 className="font-display text-[30px] leading-none">lobby</h1>
          <div className="mt-1 font-utility text-[12px] text-muted">
            {members.length}/{maxPlayers} players
            {status !== "waiting" && ` · ${status}`}
          </div>
        </div>
        <button
          onClick={leave}
          className="wobble-1 border-2 border-ink px-3 py-1 font-utility text-[12px] text-ink hover:bg-ink hover:text-paper"
        >
          leave
        </button>
      </header>

      {channelDown && (
        <div className="wobble-1 flex items-center gap-2 border-2 border-dashed border-faded bg-card px-3 py-1.5 font-utility text-[12px] text-muted">
          <span className="h-2 w-2 animate-tickpulse rounded-full bg-faded" />
          reconnecting… hold on
        </div>
      )}

      {/* invite */}
      <Card wobble={1} className="flex flex-col gap-3 p-5">
        <div className="font-utility text-[11px] uppercase tracking-[0.08em] text-muted">
          invite code
        </div>
        <div className="flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={() => copyText(code, "code copied ✓")}
            title="click to copy the code"
            className="cursor-pointer"
            aria-label={`copy invite code ${code}`}
          >
            <CodeEntry value={code} length={6} />
          </button>
          <button
            onClick={() => copyText(inviteUrl, "link copied ✓")}
            className="wobble-3 shrink-0 border-2 border-ink px-3 py-2 font-utility text-[12px] hover:bg-ink hover:text-paper"
          >
            copy link
          </button>
        </div>
        <div className="font-utility text-[10px] text-faded">
          tap the code to copy it
        </div>
        {copied && <Toast>{copied}</Toast>}
      </Card>

      {/* mode toggle (host only; persisted on the lobby) */}
      {isHost && (
        <div className="flex items-center gap-3">
          <span className="font-utility text-[11px] uppercase tracking-[0.08em] text-muted">
            mode
          </span>
          <button onClick={() => changeMode("casual")} aria-pressed={mode === "casual"}>
            <Chip variant={mode === "casual" ? "solid" : "pending"}>casual</Chip>
          </button>
          <button onClick={() => changeMode("onchain")} aria-pressed={mode === "onchain"}>
            <Chip variant={mode === "onchain" ? "solid" : "pending"}>on-chain</Chip>
          </button>
        </div>
      )}

      {/* host settings (pre-game only; locked at start; visible to all players) */}
      {status === "waiting" &&
        (isHost ? (
          <Card wobble={2} className="flex flex-col gap-4 p-5">
            <span className="font-utility text-[11px] uppercase tracking-[0.08em] text-muted">
              game settings
            </span>
            <SettingRow label="discussion time">
              {DISCUSSION_OPTIONS.map((s) => (
                <SegButton
                  key={s}
                  active={discussionSeconds === s}
                  onClick={() => changeSettings({ discussion_seconds: s })}
                >
                  {s}s
                </SegButton>
              ))}
            </SettingRow>
            <SettingRow label="clue rounds before discussion">
              {CLUE_ROUNDS_OPTIONS.map((n) => (
                <SegButton
                  key={n}
                  active={clueRounds === n}
                  onClick={() => changeSettings({ clue_rounds: n })}
                >
                  {n === 1 ? "1 round" : "2 rounds"}
                </SegButton>
              ))}
            </SettingRow>
            <SettingRow label="topic">
              <SegButton active={topic === null} onClick={() => changeSettings({ topic: null })}>
                random
              </SegButton>
              {TOPIC_CATEGORIES.map((c) => (
                <SegButton
                  key={c}
                  active={topic === c}
                  onClick={() => changeSettings({ topic: c })}
                >
                  {c}
                </SegButton>
              ))}
            </SettingRow>
          </Card>
        ) : (
          <Card wobble={2} className="flex flex-col gap-1 p-4">
            <span className="font-utility text-[11px] uppercase tracking-[0.08em] text-muted">
              game settings · set by host
            </span>
            <span className="font-body text-[15px] text-ink">
              discussion {discussionSeconds}s ·{" "}
              {clueRounds === 2 ? "2 clue rounds" : "1 clue round"} · topic{" "}
              {topicLabel(topic)}
            </span>
          </Card>
        ))}

      {/* on-chain: link a wallet, then claim your seat (12 drops) */}
      {mode === "onchain" && (
        <Card wobble={3} className="flex flex-col gap-3 p-5">
          <div className="flex items-center justify-between">
            <span className="font-utility text-[11px] uppercase tracking-[0.08em] text-muted">
              your seat
            </span>
            {myClaimed ? (
              <Chip variant="verified">✓ seat claimed</Chip>
            ) : (
              <Chip variant="unclaimed">unclaimed</Chip>
            )}
          </div>
          <WalletLinkButton
            linkedAddress={walletAddress}
            lobbyId={lobbyId}
            onLinked={(a) => setWalletAddress(a)}
            onDisconnected={() => {
              setWalletAddress(null);
              setClaims((c) => {
                const n = new Set(c);
                n.delete(userId);
                return n;
              });
            }}
          />
          {!myClaimed && (
            <SeatClaimButton
              lobbyId={lobbyId}
              onVerified={() => setClaims((c) => new Set(c).add(userId))}
            />
          )}
        </Card>
      )}

      {error && (
        <Card wobble={2} className="px-4 py-3">
          <p className="font-body text-[16px] text-ink">{error}</p>
        </Card>
      )}

      {/* roster */}
      <section className="flex flex-col gap-2">
        <div className="font-utility text-[11px] uppercase tracking-[0.08em] text-muted">
          players
        </div>
        <ul className="flex flex-col gap-2">
          {members.map((m) => {
            const isOnline = online.has(m.playerId);
            // Presence is page-scoped: once in-game, players have navigated to
            // the game, so their lobby "offline" is meaningless — suppress it.
            const showOffline = !isOnline && status === "waiting";
            return (
              <li
                key={m.playerId}
                className={`flex items-center gap-3 ${showOffline ? "opacity-45" : ""}`}
              >
                <AvatarChip
                  initial={(m.displayName[0] ?? "?").toUpperCase()}
                  size={40}
                />
                <span className="font-utility text-[13px]">
                  {m.displayName.toUpperCase()}
                  {m.playerId === userId && (
                    <span className="text-muted"> (you)</span>
                  )}
                </span>
                {m.playerId === hostId && <Chip variant="pending">host</Chip>}
                {mode === "onchain" && (
                  <Chip variant={claims.has(m.playerId) ? "verified" : "unclaimed"}>
                    {claims.has(m.playerId) ? "✓ seat" : "unclaimed"}
                  </Chip>
                )}
                {showOffline && (
                  <span className="font-utility text-[11px] text-faded">
                    offline
                  </span>
                )}
                {isHost && m.playerId !== userId && (
                  <button
                    onClick={() => kick(m.playerId)}
                    className="ml-auto wobble-2 border-2 border-ink px-2 py-1 font-utility text-[11px] hover:bg-hot hover:border-hot hover:text-paper"
                  >
                    kick
                  </button>
                )}
              </li>
            );
          })}

          {/* empty slots */}
          {Array.from({ length: emptySlots }).map((_, i) => (
            <li key={`empty-${i}`} className="flex items-center gap-3">
              <div
                className="flex h-10 w-10 items-center justify-center border-[2px] border-dashed border-faded"
                style={{ borderRadius: "55% 45% 50% 50% / 50% 55% 45% 50%" }}
                aria-hidden="true"
              />
              <span className="font-utility text-[12px] text-faded">
                waiting…
              </span>
            </li>
          ))}
        </ul>
      </section>

      {/* start */}
      <section className="mt-auto">
        {isHost ? (
          <>
            <Button
              variant="primary"
              onClick={start}
              disabled={!canStart}
              className="w-full"
            >
              start game
            </Button>
            {!canStart && (
              <p className="mt-2 text-center font-utility text-[12px] text-muted">
                {!enoughPlayers
                  ? `need ${needed} more to start`
                  : "waiting for every seat to be claimed"}
              </p>
            )}
          </>
        ) : (
          <p className="text-center font-body text-[16px] text-muted">
            waiting for the host to start…
          </p>
        )}
      </section>
    </main>
  );
}
