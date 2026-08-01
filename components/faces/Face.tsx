import { HEAD_PATH, EYES, MOUTHS, MARKS } from "./parts.generated";
import { FACE_COLORS, sanitizeFaceSpec, type FaceSpec } from "./spec";

// Composed WHO? face: head (tinted circle) → mark → eyes → mouth, all on the
// shared 200×200 grid at a single size. Pure & deterministic (no hooks), so it
// renders identically on the server and at any size from 32px chips to the big
// reveal card. Part markup is our own static SVG (see parts.generated.ts).
export function Face({
  spec,
  size = 40,
  className,
  title,
}: {
  spec: FaceSpec | null | undefined;
  size?: number;
  className?: string;
  title?: string;
}) {
  const s = sanitizeFaceSpec(spec);
  const fill = FACE_COLORS[s.color] ?? FACE_COLORS.paper;
  return (
    <svg
      viewBox="0 0 200 200"
      width={size}
      height={size}
      className={className}
      role={title ? "img" : undefined}
      aria-label={title}
      aria-hidden={title ? undefined : true}
      style={{ display: "block" }}
    >
      <path
        d={HEAD_PATH}
        fill={fill}
        stroke="var(--ink)"
        strokeWidth={10}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {MARKS[s.mark] ? <g dangerouslySetInnerHTML={{ __html: MARKS[s.mark] }} /> : null}
      <g dangerouslySetInnerHTML={{ __html: EYES[s.eyes] }} />
      <g dangerouslySetInnerHTML={{ __html: MOUTHS[s.mouth] }} />
    </svg>
  );
}
