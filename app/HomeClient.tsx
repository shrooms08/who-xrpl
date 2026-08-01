"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { lobbyErrorMessage } from "@/lib/lobby-errors";
import { Logo } from "@/components/ui/Logo";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { CodeEntry } from "@/components/ui/CodeEntry";
import { InkUnderline } from "@/components/doodles/InkUnderline";
import { Face } from "@/components/faces/Face";
import type { FaceSpec } from "@/components/faces/spec";

type LobbyLite = {
  id: string;
  code: string;
  status: string;
  max_players: number;
  host_id: string;
};

export default function HomeClient({
  displayName,
  face,
  userId,
  lobbies,
}: {
  displayName: string;
  face: FaceSpec | null;
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
    <main className="mx-auto flex min-h-screen max-w-lg flex-col gap-8 p-6">
      <header className="flex items-start justify-between">
        <div className="flex flex-col gap-1">
          <Logo size={56} />
          <div className="font-body text-[17px] text-muted">
            find the imposter. win real XRP.
          </div>
          <InkUnderline width={150} className="-mt-0.5" />
        </div>
        <button
          onClick={signOut}
          className="wobble-1 border-2 border-ink px-3 py-1 font-utility text-[12px] text-ink hover:bg-ink hover:text-paper"
        >
          sign out
        </button>
      </header>

      <Link
        href="/profile"
        className="flex items-center gap-2 self-start font-utility text-[12px] text-muted hover:text-ink"
      >
        <Face spec={face} size={30} />
        <span>
          signed in as{" "}
          <span className="font-display text-ink">{displayName}</span> · edit face
        </span>
      </Link>

      {error && (
        <Card wobble={3} className="px-4 py-3">
          <p className="font-body text-[16px] text-ink">{error}</p>
        </Card>
      )}

      {/* create */}
      <Card wobble={1} className="flex flex-col gap-4 p-6">
        <div className="font-utility text-[11px] uppercase tracking-[0.08em] text-muted">
          new game
        </div>
        <div className="flex items-center justify-between">
          <span className="font-body text-[17px]">max players</span>
          <div className="flex items-center gap-3">
            <button
              onClick={() => setMaxPlayers((n) => Math.max(4, n - 1))}
              aria-label="fewer"
              className="wobble-2 flex h-9 w-9 items-center justify-center border-2 border-ink font-display text-[20px] leading-none hover:bg-ink hover:text-paper"
            >
              −
            </button>
            <span className="w-8 text-center font-display text-[30px] leading-none">
              {maxPlayers}
            </span>
            <button
              onClick={() => setMaxPlayers((n) => Math.min(10, n + 1))}
              aria-label="more"
              className="wobble-4 flex h-9 w-9 items-center justify-center border-2 border-ink font-display text-[20px] leading-none hover:bg-ink hover:text-paper"
            >
              +
            </button>
          </div>
        </div>
        <Button
          variant="primary"
          onClick={createLobby}
          disabled={busy !== null}
          className="w-full"
        >
          {busy === "create" ? "creating…" : "create game"}
        </Button>
      </Card>

      {/* join */}
      <Card wobble={3} className="flex flex-col gap-4 p-6">
        <div className="font-utility text-[11px] uppercase tracking-[0.08em] text-muted">
          join by code
        </div>
        <form onSubmit={joinLobby} className="flex flex-col items-center gap-4">
          <CodeEntry value={code} editable onChange={setCode} length={6} />
          <Button
            variant="ghost"
            type="submit"
            disabled={busy !== null || code.trim().length < 6}
            className="w-full"
          >
            {busy === "join" ? "joining…" : "join game"}
          </Button>
        </form>
      </Card>

      {lobbies.length > 0 && (
        <section className="flex flex-col gap-3">
          <div className="font-utility text-[11px] uppercase tracking-[0.08em] text-muted">
            your open lobbies
          </div>
          <ul className="flex flex-col gap-2">
            {lobbies.map((l, i) => (
              <li key={l.id}>
                <Link href={`/lobby/${l.id}`}>
                  <Card
                    wobble={((i % 4) + 1) as 1 | 2 | 3 | 4}
                    className="flex items-center justify-between px-4 py-3 hover:shadow-hero"
                  >
                    <span className="font-display text-[22px] tracking-[0.15em]">
                      {l.code}
                    </span>
                    <span className="font-utility text-[11px] text-muted">
                      {l.host_id === userId ? "host" : "member"} · max{" "}
                      {l.max_players}
                    </span>
                  </Card>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
    </main>
  );
}
