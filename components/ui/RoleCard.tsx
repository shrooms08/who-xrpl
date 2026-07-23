"use client";

import { useState, type ReactNode } from "react";
import { ScribbleCircle } from "@/components/doodles/ScribbleCircle";
import { Splat } from "@/components/doodles/Splat";
import { BubbleTail } from "@/components/doodles/BubbleTail";
import { Chip } from "@/components/ui/Chip";

// THE signature — comic panel (canonical §1d), 250×370. Hold-to-peek: pointer
// down flips to the role face (rotateY, perspective), release flips back.

function SpeechBubble({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`relative bg-card border-2 border-ink px-4 py-[10px] text-[16px] leading-tight ${className ?? ""}`}
      style={{ borderRadius: "18px 22px 20px 19px" }}
    >
      {children}
      <BubbleTail className="-bottom-[9px] left-[26px]" />
    </div>
  );
}

function Halftone() {
  return (
    <div
      aria-hidden="true"
      className="absolute inset-x-0 top-0 h-16"
      style={{
        backgroundImage:
          "radial-gradient(rgba(32,29,24,0.13) 1.5px, transparent 1.5px)",
        backgroundSize: "8px 8px",
      }}
    />
  );
}

export function RoleCard({
  role,
  word,
  category,
  fellowImposters = [],
  issue = "ISSUE #01 — YOUR ROLE",
}: {
  role: "crew" | "imposter";
  word?: string;
  category?: string;
  fellowImposters?: string[];
  issue?: string;
}) {
  const [peek, setPeek] = useState(false);

  const face =
    "absolute inset-0 flex flex-col items-center gap-[10px] overflow-hidden bg-card border-[3px] border-ink p-5 [backface-visibility:hidden]";
  const faceStyle = { borderRadius: "6px 10px 7px 9px" } as const;

  return (
    <div
      className="relative h-[370px] w-[250px] cursor-pointer select-none touch-none shadow-hero"
      style={{ perspective: 1000, borderRadius: "6px 10px 7px 9px" }}
      onPointerDown={() => setPeek(true)}
      onPointerUp={() => setPeek(false)}
      onPointerLeave={() => setPeek(false)}
      role="button"
      aria-label="hold to peek at your role"
    >
      <div
        className="relative h-full w-full [transform-style:preserve-3d]"
        style={{
          transform: peek ? "rotateY(0deg)" : "rotateY(180deg)",
          transition: "transform .55s ease",
        }}
      >
        {/* FRONT — the role */}
        <div className={face} style={{ ...faceStyle, transform: "rotateY(0deg)" }}>
          <Halftone />
          <div className="z-[1] tilt-3 border-[1.5px] border-ink bg-card px-2 py-[2px] font-utility text-[11px] text-muted">
            {issue}
          </div>

          {role === "crew" ? (
            <>
              <div className="mt-[10px] font-utility text-[11px] text-muted">
                your role:
              </div>
              <div
                className="font-display text-[44px] text-calm"
                style={{ transform: "rotate(-2deg)" }}
              >
                CREW
              </div>
              <div className="font-utility text-[11px] text-muted">
                the word is
              </div>
              <div className="relative px-3 py-1">
                <div className="font-display text-[34px]">{word ?? "—"}</div>
                <ScribbleCircle
                  width={150}
                  height={64}
                  className="pointer-events-none absolute -left-[10px] -top-[8px]"
                />
              </div>
              <div className="font-utility text-[11px] text-muted">
                category: {category ?? "—"}
              </div>
              <div className="flex-1" />
              <SpeechBubble className="tilt-2">
                give a clue. do <span className="font-display">NOT</span> say it.
              </SpeechBubble>
            </>
          ) : (
            <>
              <div className="relative mt-8">
                <Splat>
                  <span
                    className="font-display text-[38px] text-card"
                    style={{ transform: "rotate(-3deg)" }}
                  >
                    IMPOSTER
                  </span>
                </Splat>
              </div>
              <div className="mt-7 w-full">
                <SpeechBubble className="tilt-2">
                  Blend in. There&apos;s a word.
                  <br />
                  You don&apos;t know it.
                </SpeechBubble>
              </div>
              <div className="flex-1" />
              {fellowImposters.length > 0 && (
                <Chip variant="hot">
                  with you: {fellowImposters.join(", ").toUpperCase()}
                </Chip>
              )}
            </>
          )}
        </div>

        {/* BACK — hold to peek */}
        <div
          className={`${face} items-center justify-center`}
          style={{ ...faceStyle, transform: "rotateY(180deg)" }}
        >
          <div className="font-display text-[120px] leading-none text-hot">?</div>
          <div className="font-utility text-[13px] text-muted">hold to peek</div>
        </div>
      </div>
    </div>
  );
}
