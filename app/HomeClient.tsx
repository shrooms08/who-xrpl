"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { lobbyErrorMessage } from "@/lib/lobby-errors";

type LobbyLite = {
  id: string;
  code: string;
  status: string;
  max_players: number;
  host_id: string;
};

export default function HomeClient({
  displayName,
  userId,
  lobbies,
}: {
  displayName: string;
  userId: string;
  lobbies: LobbyLite[];
}) {
  const router = useRouter();
  const supabase = createClient();
  const [maxPlayers, setMaxPlayers] = useState(6);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState<"create" | "join" | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function createLobby() {
    setBusy("create");
    setError(null);
    const { data, error } = await supabase.rpc("create_lobby", {
      p_max_players: maxPlayers,
    });
    if (error || !data?.[0]) {
      setBusy(null);
      return setError(lobbyErrorMessage(error ?? "create_failed"));
    }
    router.push(`/lobby/${data[0].id}`);
  }

  async function joinLobby(e: React.FormEvent) {
    e.preventDefault();
    setBusy("join");
    setError(null);
    const { data, error } = await supabase.rpc("join_lobby", {
      p_code: code.trim(),
    });
    if (error || !data) {
      setBusy(null);
      return setError(lobbyErrorMessage(error ?? "lobby_not_found"));
    }
    router.push(`/lobby/${data}`);
  }

  async function signOut() {
    await supabase.auth.signOut();
    router.replace("/login");
    router.refresh();
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col gap-8 p-6">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">WHO?</h1>
          <p className="text-sm text-neutral-400">
            Signed in as {displayName}
          </p>
        </div>
        <button
          onClick={signOut}
          className="rounded-lg border border-neutral-700 px-3 py-1.5 text-sm text-neutral-300 hover:bg-neutral-800"
        >
          Sign out
        </button>
      </header>

      {error && (
        <p className="rounded-lg border border-red-900 bg-red-950/50 px-3 py-2 text-sm text-red-300">
          {error}
        </p>
      )}

      <section className="rounded-2xl border border-neutral-800 bg-neutral-900/60 p-6">
        <h2 className="mb-4 text-lg font-semibold">Create a lobby</h2>
        <label className="mb-2 block text-sm text-neutral-400">
          Max players: <span className="font-mono text-neutral-200">{maxPlayers}</span>
        </label>
        <input
          type="range"
          min={4}
          max={10}
          value={maxPlayers}
          onChange={(e) => setMaxPlayers(Number(e.target.value))}
          className="mb-4 w-full accent-white"
        />
        <button
          onClick={createLobby}
          disabled={busy !== null}
          className="w-full rounded-lg bg-white px-3 py-2 font-medium text-black disabled:opacity-50"
        >
          {busy === "create" ? "Creating…" : "Create lobby"}
        </button>
      </section>

      <section className="rounded-2xl border border-neutral-800 bg-neutral-900/60 p-6">
        <h2 className="mb-4 text-lg font-semibold">Join by code</h2>
        <form onSubmit={joinLobby} className="flex gap-2">
          <input
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            placeholder="6-char code"
            maxLength={6}
            className="flex-1 rounded-lg border border-neutral-700 bg-neutral-950 px-3 py-2 font-mono uppercase tracking-widest outline-none focus:border-neutral-500"
          />
          <button
            disabled={busy !== null || code.trim().length === 0}
            className="rounded-lg bg-white px-4 py-2 font-medium text-black disabled:opacity-50"
          >
            {busy === "join" ? "Joining…" : "Join"}
          </button>
        </form>
      </section>

      {lobbies.length > 0 && (
        <section>
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-neutral-500">
            Your open lobbies
          </h2>
          <ul className="space-y-2">
            {lobbies.map((l) => (
              <li key={l.id}>
                <Link
                  href={`/lobby/${l.id}`}
                  className="flex items-center justify-between rounded-lg border border-neutral-800 bg-neutral-900/40 px-4 py-3 hover:bg-neutral-800/60"
                >
                  <span className="font-mono tracking-widest">{l.code}</span>
                  <span className="text-sm text-neutral-400">
                    {l.host_id === userId ? "Host" : "Member"} · max{" "}
                    {l.max_players}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
    </main>
  );
}
