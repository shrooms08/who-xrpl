"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Face } from "@/components/faces/Face";
import {
  EYES_IDS,
  MOUTH_IDS,
  MARK_IDS,
  FACE_COLORS,
  FACE_COLOR_KEYS,
  sanitizeFaceSpec,
  randomFace,
  type FaceSpec,
} from "@/components/faces/spec";

function PartRow({
  label,
  ids,
  active,
  preview,
  onPick,
}: {
  label: string;
  ids: string[];
  active: string;
  preview: (id: string) => FaceSpec; // face to render in the thumbnail
  onPick: (id: string) => void;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <div className="font-utility text-[11px] uppercase tracking-[0.08em] text-muted">
        {label}
      </div>
      <div className="flex gap-2 overflow-x-auto pb-1">
        {ids.map((id) => {
          const on = id === active;
          return (
            <button
              key={id}
              type="button"
              aria-pressed={on}
              onClick={() => onPick(id)}
              className={`flex-shrink-0 border-2 bg-card p-0.5 transition-colors ${on ? "border-hot" : "border-faded hover:border-ink"}`}
              style={{ borderRadius: "52% 48% 45% 55% / 45% 52% 48% 55%" }}
            >
              <Face spec={preview(id)} size={52} />
            </button>
          );
        })}
      </div>
    </div>
  );
}

export default function ProfileComposer({
  userId,
  displayName,
  initialFace,
  children,
}: {
  userId: string;
  displayName: string;
  initialFace: FaceSpec | null;
  children?: React.ReactNode;
}) {
  const router = useRouter();
  const supabase = createClient();
  const [face, setFace] = useState<FaceSpec>(sanitizeFaceSpec(initialFace));
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const set = (patch: Partial<FaceSpec>) => {
    setFace((f) => ({ ...f, ...patch }));
    setSaved(false);
  };

  async function save() {
    setBusy(true);
    setError(null);
    const { error } = await supabase
      .from("profiles")
      .update({ face: face as unknown as Record<string, string> })
      .eq("id", userId);
    setBusy(false);
    if (error) {
      setError("couldn't save — try again.");
      return;
    }
    setSaved(true);
    router.refresh();
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col gap-5 p-5">
      <header className="flex items-center justify-between">
        <div className="font-display text-[26px] leading-none">your face</div>
        <Link
          href="/"
          className="wobble-1 border-2 border-ink px-3 py-1 font-utility text-[12px] hover:bg-ink hover:text-paper"
        >
          done
        </Link>
      </header>

      {/* live preview + how-others-see-you */}
      <div className="flex items-end gap-4">
        <Face spec={face} size={150} />
        <div className="flex flex-col items-center gap-1 pb-2">
          <Face spec={face} size={32} />
          <div className="text-center font-utility text-[9px] leading-tight text-muted">
            how others
            <br />
            see you
          </div>
        </div>
        <div className="flex-1" />
        <div className="pb-2 text-right font-utility text-[11px] text-muted">
          {displayName}
        </div>
      </div>

      <PartRow
        label="eyes"
        ids={EYES_IDS}
        active={face.eyes}
        preview={(id) => ({ ...face, eyes: id })}
        onPick={(id) => set({ eyes: id })}
      />
      <PartRow
        label="mouth"
        ids={MOUTH_IDS}
        active={face.mouth}
        preview={(id) => ({ ...face, mouth: id })}
        onPick={(id) => set({ mouth: id })}
      />
      <PartRow
        label="mark (optional)"
        ids={MARK_IDS}
        active={face.mark}
        preview={(id) => ({ ...face, mark: id })}
        onPick={(id) => set({ mark: id })}
      />

      <div className="flex flex-col gap-1.5">
        <div className="font-utility text-[11px] uppercase tracking-[0.08em] text-muted">
          paper
        </div>
        <div className="flex gap-2 overflow-x-auto pb-1">
          {FACE_COLOR_KEYS.map((key) => {
            const on = key === face.color;
            return (
              <button
                key={key}
                type="button"
                aria-pressed={on}
                onClick={() => set({ color: key })}
                className={`h-[46px] w-[46px] flex-shrink-0 border-2 ${on ? "border-hot" : "border-ink"}`}
                style={{
                  background: FACE_COLORS[key],
                  borderRadius: "50% 50% 46% 54% / 54% 46% 50% 50%",
                }}
                aria-label={key}
              />
            );
          })}
        </div>
      </div>

      {error && (
        <div className="font-body text-[14px] text-hot">{error}</div>
      )}

      <div className="mt-2 flex items-center gap-2">
        <button
          type="button"
          onClick={() => set(randomFace())}
          aria-label="randomize"
          className="wobble-2 flex h-[46px] w-[54px] items-center justify-center border-2 border-ink bg-card font-display text-[20px] hover:bg-ink hover:text-paper"
        >
          🎲
        </button>
        <button
          type="button"
          onClick={save}
          disabled={busy}
          className="wobble-sketch flex-1 border-[2.5px] border-ink bg-ink px-4 py-3 font-display text-[20px] text-paper disabled:opacity-50"
        >
          {busy ? "saving…" : saved ? "saved ✓" : "save face"}
        </button>
      </div>

      {children}
    </main>
  );
}
