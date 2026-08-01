// Canonical face-spec contract. Server-safe (no DOM / no "use client"): imported
// by the composer, the <Face> renderer, onboarding, and server-side validation.
// The valid id sets mirror the parts in parts.generated.ts (see extract-faces.mjs).

export interface FaceSpec {
  eyes: string; // eyes-01 … eyes-10
  mouth: string; // mouth-01 … mouth-10
  mark: string; // mark-00 (none) … mark-08
  color: string; // a FACE_COLORS key
}

const pad = (n: number) => String(n).padStart(2, "0");

export const EYES_IDS = Array.from({ length: 10 }, (_, i) => `eyes-${pad(i + 1)}`);
export const MOUTH_IDS = Array.from({ length: 10 }, (_, i) => `mouth-${pad(i + 1)}`);
export const MARK_IDS = Array.from({ length: 9 }, (_, i) => `mark-${pad(i)}`); // 00 = none

// Head-tint palette (key → CSS token). `paper` is the default (reuses --card);
// no key reads red or green — those stay reserved for imposter / crew. The raw
// hexes live once in app/globals.css (:root --face-*), never inline here.
export const FACE_COLORS: Record<string, string> = {
  paper: "var(--card)",
  butter: "var(--face-butter)",
  peach: "var(--face-peach)",
  blush: "var(--face-blush)",
  lilac: "var(--face-lilac)",
  sky: "var(--face-sky)",
  mint: "var(--face-mint)",
  sand: "var(--face-sand)",
  clay: "var(--face-clay)",
};
export const FACE_COLOR_KEYS = Object.keys(FACE_COLORS);

export const DEFAULT_FACE: FaceSpec = {
  eyes: "eyes-01",
  mouth: "mouth-01",
  mark: "mark-00",
  color: "paper",
};

/** True iff every field of `v` is a known part id / color key. */
export function isValidFaceSpec(v: unknown): v is FaceSpec {
  if (!v || typeof v !== "object") return false;
  const f = v as Record<string, unknown>;
  return (
    typeof f.eyes === "string" && EYES_IDS.includes(f.eyes) &&
    typeof f.mouth === "string" && MOUTH_IDS.includes(f.mouth) &&
    typeof f.mark === "string" && MARK_IDS.includes(f.mark) &&
    typeof f.color === "string" && f.color in FACE_COLORS
  );
}

/** Coerce arbitrary input into a complete FaceSpec, per-field fallback to the
 *  default. Never throws — used at the render boundary so a bad row can't crash. */
export function sanitizeFaceSpec(v: unknown): FaceSpec {
  const f = (v && typeof v === "object" ? v : {}) as Record<string, unknown>;
  const pick = (val: unknown, ids: string[], dflt: string) =>
    typeof val === "string" && ids.includes(val) ? val : dflt;
  return {
    eyes: pick(f.eyes, EYES_IDS, DEFAULT_FACE.eyes),
    mouth: pick(f.mouth, MOUTH_IDS, DEFAULT_FACE.mouth),
    mark: pick(f.mark, MARK_IDS, DEFAULT_FACE.mark),
    color:
      typeof f.color === "string" && f.color in FACE_COLORS
        ? f.color
        : DEFAULT_FACE.color,
  };
}

const at = <T>(arr: T[], rand: () => number) => arr[Math.floor(rand() * arr.length)];

/** A random, always-valid face. `rand` is injectable for tests. */
export function randomFace(rand: () => number = Math.random): FaceSpec {
  return {
    eyes: at(EYES_IDS, rand),
    mouth: at(MOUTH_IDS, rand),
    mark: at(MARK_IDS, rand),
    color: at(FACE_COLOR_KEYS, rand),
  };
}
