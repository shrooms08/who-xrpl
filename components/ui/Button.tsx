"use client";

import { useState, type ReactNode } from "react";

// Display-face button. Variants per canonical §1h. Press state = translate
// down-right 2px + drop the shadow ("pressed onto paper"). Transform is
// composed inline so the accuse tilt and the press translate coexist.

type Variant = "primary" | "accuse" | "ghost";

const VARIANT_CLASS: Record<Variant, string> = {
  primary: "bg-ink text-paper wobble-sketch-alt",
  accuse: "bg-hot text-card wobble-sketch",
  ghost: "bg-transparent text-ink border-2 border-ink wobble-1",
};

export function Button({
  children,
  variant = "primary",
  disabled = false,
  onClick,
  type = "button",
  className,
}: {
  children: ReactNode;
  variant?: Variant;
  disabled?: boolean;
  onClick?: () => void;
  type?: "button" | "submit";
  className?: string;
}) {
  const [pressed, setPressed] = useState(false);

  const rot = variant === "accuse" ? "rotate(-1deg) " : "";
  const shift = pressed && !disabled ? "translate(2px, 2px)" : "";
  const transform = `${rot}${shift}`.trim() || undefined;
  const boxShadow = disabled || pressed ? "none" : "var(--shadow-ink)";

  const base =
    "inline-flex items-center justify-center select-none font-display text-[18px] px-[22px] py-[10px] leading-none";
  const look = disabled
    ? "bg-transparent text-faded border-2 border-faded wobble-1 cursor-not-allowed"
    : VARIANT_CLASS[variant];

  return (
    <button
      type={type}
      disabled={disabled}
      onClick={onClick}
      onPointerDown={() => setPressed(true)}
      onPointerUp={() => setPressed(false)}
      onPointerLeave={() => setPressed(false)}
      style={{ transform, boxShadow }}
      className={`${base} ${look} ${className ?? ""}`}
    >
      {children}
    </button>
  );
}
