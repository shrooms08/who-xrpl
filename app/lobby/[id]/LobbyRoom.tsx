"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/client";
import { lobbyErrorMessage } from "@/lib/lobby-errors";

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

  // Refs mirror state so realtime callbacks never read stale closures.
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
      // If I'm no longer a member and I didn't leave on purpose → kicked/closed.
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

  // Designated reaper = earliest-joined *online* member (excluding the absentee).
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

    const handleLeave = async (
      leftPresences: Array<{ player_id?: string }>,
    ) => {
      for (const p of leftPresences) {
        const leftId = p.player_id;
        if (!leftId) continue;

        // A non-host dropped and I'm the host → prune their membership row.
        if (hostIdRef.current === userId && leftId !== hostIdRef.current) {
          await supabase
            .from("lobby_players")
            .delete()
            .eq("lobby_id", lobbyId)
            .eq("player_id", leftId);
        }

        // The host dropped → after a grace period, the designated reaper
        // removes the absent host and triggers migration.
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
      .channel(`lobby:${lobbyId}`, {
        config: { presence: { key: userId } },
      })
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
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard blocked — the link is still shown */
    }
  }

  async function kick(targetId: string) {
    setError(null);
    const { error } = await supabase
      .from("lobby_players")
      .delete()
      .eq("lobby_id", lobbyId)
      .eq("player_id", targetId);
    if (error) setError(error.message);
  }

  async function leave() {
    leavingRef.current = true;
    await supabase.rpc("leave_lobby", { p_lobby: lobbyId });
    router.replace("/");
    router.refresh();
  }

  function start() {
    // Gate 1 stub: enablement is the deliverable; the actual deal/loop is Gate 2.
    setError("Game start (deal → clue → …) arrives in Gate 2.");
  }

  const canStart = isHost && members.length >= MIN_PLAYERS;

  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col gap-6 p-6">
      <header className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Lobby</h1>
          <p className="text-sm text-neutral-400">
            {members.length}/{maxPlayers} players
            {status !== "waiting" && ` · ${status}`}
          </p>
        </div>
        <button
          onClick={leave}
          className="rounded-lg border border-neutral-700 px-3 py-1.5 text-sm text-neutral-300 hover:bg-neutral-800"
        >
          Leave
        </button>
      </header>

      <section className="rounded-2xl border border-neutral-800 bg-neutral-900/60 p-5">
        <div className="mb-1 text-xs uppercase tracking-wide text-neutral-500">
          Invite code
        </div>
        <div className="mb-3 flex items-center gap-3">
          <span className="font-mono text-3xl tracking-[0.3em]">{code}</span>
          <button
            onClick={copyInvite}
            className="ml-auto rounded-lg border border-neutral-700 px-3 py-1.5 text-sm hover:bg-neutral-800"
          >
            {copied ? "Copied!" : "Copy link"}
          </button>
        </div>
        {inviteUrl && (
          <p className="truncate font-mono text-xs text-neutral-500">
            {inviteUrl}
          </p>
        )}
      </section>

      {error && (
        <p className="rounded-lg border border-amber-900 bg-amber-950/40 px-3 py-2 text-sm text-amber-300">
          {error}
        </p>
      )}

      <section>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-neutral-500">
          Players
        </h2>
        <ul className="space-y-2">
          {members.map((m) => {
            const isOnline = online.has(m.playerId);
            return (
              <li
                key={m.playerId}
                className="flex items-center gap-3 rounded-lg border border-neutral-800 bg-neutral-900/40 px-4 py-3"
              >
                <span
                  className={`h-2.5 w-2.5 rounded-full ${
                    isOnline ? "bg-green-500" : "bg-neutral-600"
                  }`}
                  title={isOnline ? "online" : "offline"}
                />
                <span className="font-medium">
                  {m.displayName}
                  {m.playerId === userId && (
                    <span className="text-neutral-500"> (you)</span>
                  )}
                </span>
                {m.playerId === hostId && (
                  <span className="rounded bg-neutral-700 px-1.5 py-0.5 text-xs">
                    Host
                  </span>
                )}
                {isHost && m.playerId !== userId && (
                  <button
                    onClick={() => kick(m.playerId)}
                    className="ml-auto rounded border border-neutral-700 px-2 py-1 text-xs text-neutral-400 hover:bg-neutral-800 hover:text-red-300"
                  >
                    Kick
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      </section>

      <section className="mt-auto">
        {isHost ? (
          <>
            <button
              onClick={start}
              disabled={!canStart}
              className="w-full rounded-lg bg-white px-3 py-3 font-semibold text-black disabled:cursor-not-allowed disabled:opacity-40"
            >
              Start game
            </button>
            {!canStart && (
              <p className="mt-2 text-center text-sm text-neutral-500">
                Need at least {MIN_PLAYERS} players to start (
                {members.length}/{MIN_PLAYERS}).
              </p>
            )}
          </>
        ) : (
          <p className="text-center text-sm text-neutral-500">
            Waiting for the host to start the game…
          </p>
        )}
      </section>
    </main>
  );
}
