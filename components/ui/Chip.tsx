import type { ReactNode } from "react";

// Seat-claim + tag chip. Utility face, wobble radius. Variants per canonical §1h.

const VARIANTS = {
  unclaimed: "border-[1.5px] border-dashed border-faded text-faded",
  pending: "border-[1.5px] border-ink text-ink",
  verified: "border-2 border-calm text-calm",
  hot: "border-[1.5px] border-dashed border-hot text-hot",
  // selected state of a two-chip toggle (e.g. Casual / On-chain)
  solid: "border-2 border-ink bg-ink text-paper",
} as const;

const WOBBLE = ["wobble-1", "wobble-2", "wobble-3", "wobble-4"] as const;

export function Chip({
  variant = "pending",
  children,
  wobble = 3,
  className,
}: {
  variant?: keyof typeof VARIANTS;
  children: ReactNode;
  wobble?: 1 | 2 | 3 | 4;
  className?: string;
}) {
  return (
    <span
      className={`inline-flex items-center font-utility text-[11px] leading-none px-3 py-[5px] ${WOBBLE[wobble - 1]} ${VARIANTS[variant]} ${className ?? ""}`}
    >
      {children}
    </span>
  );
}
