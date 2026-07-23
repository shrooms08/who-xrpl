import type { ReactNode } from "react";

// Paper card: --card bg, 2px ink border, wobble radius, hard shadow.

const WOBBLE = ["wobble-1", "wobble-2", "wobble-3", "wobble-4"] as const;
const TILT = { none: "", 1: "tilt-1", 2: "tilt-2", 3: "tilt-3", 4: "tilt-4" };
const SHADOW = { ink: "shadow-ink", hero: "shadow-hero", hot: "shadow-hot", none: "" };

export function Card({
  children,
  wobble = 1,
  tilt = "none",
  shadow = "ink",
  className,
}: {
  children?: ReactNode;
  wobble?: 1 | 2 | 3 | 4;
  tilt?: keyof typeof TILT;
  shadow?: keyof typeof SHADOW;
  className?: string;
}) {
  return (
    <div
      className={`bg-card border-2 border-ink ${WOBBLE[wobble - 1]} ${TILT[tilt]} ${SHADOW[shadow]} ${className ?? ""}`}
    >
      {children}
    </div>
  );
}
