import type { ReactNode } from "react";

// Small confirmation card — body face, tilt, hard shadow (canonical §1h).

export function Toast({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`inline-flex items-center bg-card border-2 border-ink wobble-3 tilt-1 shadow-ink font-body text-[15px] px-[14px] py-2 ${className ?? ""}`}
    >
      {children}
    </div>
  );
}
