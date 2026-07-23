import { ScribbleCircle } from "@/components/doodles/ScribbleCircle";

// Utility-face countdown inside a ScribbleCircle ring. Under 10s the ring +
// number go --hot and pulse (canonical §1f).

export function PhaseTimer({
  seconds,
  size = 66,
}: {
  seconds: number;
  size?: number;
}) {
  const hot = seconds < 10;
  const mm = Math.floor(seconds / 60);
  const ss = seconds % 60;
  const label = `${mm}:${ss.toString().padStart(2, "0")}`;

  return (
    <div
      className="relative flex items-center justify-center"
      style={{ width: size, height: size }}
    >
      <ScribbleCircle
        variant="ring"
        width={size}
        height={size}
        color={hot ? "var(--hot)" : "var(--ink)"}
        className="absolute inset-0"
      />
      <span
        className={`font-utility leading-none ${hot ? "text-hot animate-tickpulse" : "text-ink"}`}
        style={{ fontSize: Math.round(size * 0.29) }}
      >
        {label}
      </span>
    </div>
  );
}
