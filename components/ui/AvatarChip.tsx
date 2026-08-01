import { ScribbleCircle } from "@/components/doodles/ScribbleCircle";
import { Face } from "@/components/faces/Face";
import type { FaceSpec } from "@/components/faces/spec";

// Wobbly avatar with a composed WHO? face (or a single display initial as the
// no-face fallback). States: alive (default) · current (hot ring) · dead (faded
// + grayscale + ink X strike). `host` adds a tiny utility-face tag.

type State = "alive" | "current" | "dead";

function XStrike({ size }: { size: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 40 40"
      className="absolute inset-0"
      aria-hidden="true"
    >
      <path
        d="M7 8l26 25M33 7L8 32"
        stroke="var(--ink)"
        strokeWidth={3}
        strokeLinecap="round"
        fill="none"
      />
    </svg>
  );
}

export function AvatarChip({
  initial,
  name,
  state = "alive",
  host = false,
  size = 42,
  face,
}: {
  initial: string;
  name?: string;
  state?: State;
  host?: boolean;
  size?: number;
  face?: FaceSpec | null;
}) {
  const border =
    state === "current"
      ? "border-hot text-hot"
      : state === "dead"
        ? "border-faded text-faded"
        : "border-ink text-ink";

  return (
    <div className="flex flex-col items-center gap-[3px]">
      <div className="relative">
        {face ? (
          <div
            className={`relative ${state === "dead" ? "opacity-45 grayscale" : ""}`}
            style={{ width: size, height: size }}
          >
            <Face spec={face} size={size} />
            {state === "dead" && <XStrike size={size} />}
          </div>
        ) : (
          <div
            className={`relative flex items-center justify-center bg-card border-[2.5px] font-display ${border} ${state === "dead" ? "opacity-45 grayscale" : ""}`}
            style={{
              width: size,
              height: size,
              fontSize: Math.round(size * 0.4),
              borderRadius: "55% 45% 50% 50% / 50% 55% 45% 50%",
            }}
          >
            {initial}
            {state === "dead" && <XStrike size={size} />}
          </div>
        )}
        {state === "current" && (
          <ScribbleCircle
            variant="ring"
            width={size + 12}
            height={size + 12}
            className="pointer-events-none absolute -left-[6px] -top-[6px]"
          />
        )}
      </div>
      {name && (
        <div
          className={`font-utility text-[11px] leading-none ${state === "current" ? "text-hot" : state === "dead" ? "text-faded" : "text-ink"}`}
        >
          {name}
        </div>
      )}
      {host && <div className="font-utility text-[10px] text-muted">host</div>}
    </div>
  );
}
