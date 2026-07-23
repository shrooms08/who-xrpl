"use client";

import { useId } from "react";

// Per-character boxes 34×42, distinct wobble per box, display-face chars; empty
// boxes dashed --faded (canonical §1h). Read-only by default; pass `editable`
// + `onChange` to capture typing via an invisible overlaid input.

const RADII = [
  "6px 9px 7px 8px",
  "8px 6px 9px 7px",
  "7px 8px 6px 9px",
  "9px 7px 8px 6px",
  "6px 8px 7px 9px",
  "8px 7px 9px 6px",
];

export function CodeEntry({
  value,
  length = 6,
  editable = false,
  onChange,
  autoFocus,
}: {
  value: string;
  length?: number;
  editable?: boolean;
  onChange?: (v: string) => void;
  autoFocus?: boolean;
}) {
  const id = useId();
  return (
    <div className="relative inline-flex gap-[5px]">
      {editable && (
        <input
          id={id}
          value={value}
          onChange={(e) =>
            onChange?.(e.target.value.toUpperCase().slice(0, length))
          }
          maxLength={length}
          autoFocus={autoFocus}
          inputMode="text"
          autoComplete="one-time-code"
          aria-label="code"
          className="absolute inset-0 z-10 w-full cursor-text bg-transparent text-transparent caret-transparent outline-none"
        />
      )}
      {Array.from({ length }).map((_, i) => {
        const ch = value[i];
        return (
          <div
            key={i}
            style={{ borderRadius: RADII[i % RADII.length] }}
            className={`flex h-[42px] w-[34px] items-center justify-center bg-card font-display text-[20px] ${
              ch ? "border-2 border-ink" : "border-2 border-dashed border-faded"
            }`}
          >
            {ch ?? ""}
          </div>
        );
      })}
    </div>
  );
}
