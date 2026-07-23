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

export type Member = {
  playerId: string;
  joinedAt: string;
  displayName: string;
};

const MIN_PLAYERS = 4;

export default function LobbyRoom({
  lobbyId,
  code,
  maxPlayers,
  initialHostId,
  initialStatus,
  userId,
  initialMembers,
}: {
  lobbyId: string;
  code: string;
  maxPlayers: number;
  initialHostId: string;
  initialStatus: string;
  userId: string;
  initialMembers: Member[];
}) {
  const router = useRouter();
  const supabase = createClient();

  const [members, setMembers] = useState<Member[]>(initialMembers);
  const [hostId, setHostId] = useState(initialHostId);
  const [status, setStatus] = useState(initialStatus);
  const [online, setOnline] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [inviteUrl, setInviteUrl] = useState("");
  // Gate-1 visual only: On-chain seat-claim is wired in Gate 3.
  const [mode, setMode] = useState<"casual" | "onchain">("casual");

  const membersRef = useRef(initialMembers);
  const hostIdRef = useRef(initialHostId);
  const onlineRef = useRef<Set<string>>(new Set());
  const leavingRef = useRef(false);

  const isHost = hostId === userId;

  useEffect(() => {
    setInviteUrl(`${window.location.origin}/join/${code}`);
  }, [code]);

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

    const handleLeave = async (leftPresences: Array<{ player_id?: string }>) => {
      for (const p of leftPresences) {
        const leftId = p.player_id;
        if (!leftId) continue;

        if (hostIdRef.current === userId && leftId !== hostIdRef.current) {
          await supabase
            .from("lobby_players")
            .delete()
            .eq("lobby_id", lobbyId)
            .eq("player_id", leftId);
        }

        if (leftId === hostIdRef.current && leftId !== userId) {
          const absent = leftId;
          setTimeout(() => {
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
          }, 2000);
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
          const row = payload.new as { host_id: string; status: string };
          hostIdRef.current = row.host_id;
          setHostId(row.host_id);
          setStatus(row.status);
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
          await channel?.track({ player_id: userId, online_at: Date.now() });
        }
      });

    return () => {
      if (channel) supabase.removeChannel(channel);
    };
  }, [supabase, lobbyId, userId, fetchMembers, isDesignatedReaper, router]);

  async function copyInvite() {
    try {
      await navigator.clipboard.writeText(inviteUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      /* clipboard blocked — the code is still shown */
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

  function start() {
    setError("game start (deal → clue → …) arrives in Gate 2.");
  }

  const canStart = isHost && members.length >= MIN_PLAYERS;
  const needed = Math.max(0, MIN_PLAYERS - members.length);
  const emptySlots = Math.max(0, maxPlayers - members.length);

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

      {/* invite */}
      <Card wobble={1} className="flex flex-col gap-3 p-5">
        <div className="font-utility text-[11px] uppercase tracking-[0.08em] text-muted">
          invite code
        </div>
        <div className="flex items-center justify-between gap-3">
          <CodeEntry value={code} length={6} />
          <button
            onClick={copyInvite}
            className="wobble-3 shrink-0 border-2 border-ink px-3 py-2 font-utility text-[12px] hover:bg-ink hover:text-paper"
          >
            copy link
          </button>
        </div>
        {copied && <Toast>code copied ✓</Toast>}
      </Card>

      {/* mode toggle (host) — On-chain seat claims land in Gate 3 */}
      {isHost && (
        <div className="flex items-center gap-3">
          <span className="font-utility text-[11px] uppercase tracking-[0.08em] text-muted">
            mode
          </span>
          <button onClick={() => setMode("casual")} aria-pressed={mode === "casual"}>
            <Chip variant={mode === "casual" ? "solid" : "pending"}>casual</Chip>
          </button>
          <button onClick={() => setMode("onchain")} aria-pressed={mode === "onchain"}>
            <Chip variant={mode === "onchain" ? "solid" : "pending"}>on-chain</Chip>
          </button>
        </div>
      )}
      {mode === "onchain" && (
        <p className="font-body text-[15px] text-muted">
          on-chain seat claims are wired in Gate 3 — casual for now.
        </p>
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
            return (
              <li
                key={m.playerId}
                className={`flex items-center gap-3 ${isOnline ? "" : "opacity-45"}`}
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
                  <Chip variant="unclaimed">unclaimed</Chip>
                )}
                {!isOnline && (
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
                need {needed} more to start
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
