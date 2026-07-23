// Ink blob + two satellite droplets behind its children (canonical §1d / §1g).
// RESERVED for imposter reveals only. Irregular-radius divs, no image texture.

import type { ReactNode } from "react";

export function Splat({
  children,
  color = "var(--hot)",
  className,
}: {
  children: ReactNode;
  color?: string;
  className?: string;
}) {
  return (
    <span className={`relative inline-flex ${className ?? ""}`}>
      <span
        aria-hidden="true"
        className="absolute"
        style={{
          inset: "-18px -26px",
          background: color,
          borderRadius: "60% 40% 55% 45% / 50% 60% 40% 55%",
          transform: "rotate(-4deg)",
        }}
      />
      <span
        aria-hidden="true"
        className="absolute"
        style={{
          top: "-26px",
          right: "-34px",
          width: 14,
          height: 14,
          background: color,
          borderRadius: "55% 45% 60% 40%",
        }}
      />
      <span
        aria-hidden="true"
        className="absolute"
        style={{
          bottom: "-22px",
          left: "-36px",
          width: 9,
          height: 9,
          background: color,
          borderRadius: "45% 55% 40% 60%",
        }}
      />
      <span className="relative">{children}</span>
    </span>
  );
}
