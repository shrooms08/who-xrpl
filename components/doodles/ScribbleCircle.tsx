// Hand-drawn ellipse. `variant="circle"` = the open scribble that rings the
// secret word (canonical §1c). `variant="ring"` = the near-closed loop used as
// the countdown ring on timers / the live guess (§1f, §1g).

type Props = {
  variant?: "circle" | "ring";
  width?: number;
  height?: number;
  color?: string;
  strokeWidth?: number;
  className?: string;
};

export function ScribbleCircle({
  variant = "circle",
  width,
  height,
  color = "var(--hot)",
  strokeWidth = 2.5,
  className,
}: Props) {
  const isRing = variant === "ring";
  const vb = isRing ? "0 0 66 66" : "0 0 150 64";
  const d = isRing
    ? "M33 4c16-2 29 12 28 28S48 62 32 61 4 48 5 32 16 6 30 4"
    : "M75 6C30 4 8 16 10 32c2 17 38 26 72 24 32-2 60-11 58-27C138 13 108 4 68 8";
  return (
    <svg
      width={width ?? (isRing ? 66 : 150)}
      height={height ?? (isRing ? 66 : 64)}
      viewBox={vb}
      className={className}
      aria-hidden="true"
    >
      <path
        d={d}
        fill="none"
        stroke={color}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
      />
    </svg>
  );
}
