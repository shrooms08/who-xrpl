"use client";

import { useState, type ReactNode } from "react";
import { Logo } from "@/components/ui/Logo";
import { Button } from "@/components/ui/Button";
import { Chip } from "@/components/ui/Chip";
import { Card } from "@/components/ui/Card";
import { CodeEntry } from "@/components/ui/CodeEntry";
import { Toast } from "@/components/ui/Toast";
import { AvatarChip } from "@/components/ui/AvatarChip";
import { PhaseTimer } from "@/components/ui/PhaseTimer";
import { RoleCard } from "@/components/ui/RoleCard";
import { ScribbleCircle } from "@/components/doodles/ScribbleCircle";
import { InkUnderline } from "@/components/doodles/InkUnderline";
import { Splat } from "@/components/doodles/Splat";
import { BubbleTail } from "@/components/doodles/BubbleTail";

function Eyebrow({ children }: { children: ReactNode }) {
  return (
    <div className="font-utility text-[11px] uppercase tracking-[0.08em] text-muted">
      {children}
    </div>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <section className="flex flex-col gap-4">
      <Eyebrow>{title}</Eyebrow>
      <div className="flex flex-wrap items-start gap-6">{children}</div>
    </section>
  );
}

const SWATCHES: [string, string, string][] = [
  ["paper", "F6F0E2", "bg-paper"],
  ["card", "FBF7EC", "bg-card"],
  ["ink", "201D18", "bg-ink"],
  ["muted", "5C554A", "bg-muted"],
  ["faded", "8A8272", "bg-faded"],
  ["hot", "D93B25", "bg-hot"],
  ["calm", "1F7A5A", "bg-calm"],
];

const WOBBLES = ["wobble-1", "wobble-2", "wobble-3", "wobble-4"];
const TILTS = ["tilt-1", "tilt-2", "tilt-3", "tilt-4"];

export default function DesignShowcase() {
  const [code, setCode] = useState("KX4");
  const [copied, setCopied] = useState(false);

  return (
    <main className="mx-auto flex max-w-4xl flex-col gap-12 p-8">
      {/* header */}
      <header className="flex items-baseline gap-4">
        <Logo size={56} />
        <span className="font-body text-[17px] text-muted">
          ink system — /design reference
        </span>
      </header>

      <Section title="Ink palette">
        <div className="grid grid-cols-4 gap-3 sm:grid-cols-7">
          {SWATCHES.map(([name, hex, bg]) => (
            <div key={name}>
              <div className={`h-12 w-full border-2 border-ink wobble-2 ${bg}`} />
              <div className="mt-1 font-utility text-[10px]">
                --{name} {hex}
              </div>
            </div>
          ))}
        </div>
      </Section>

      <Section title="Type roles">
        <div className="flex flex-col gap-2">
          <div className="font-display text-[44px] leading-none">
            Display — Permanent Marker{" "}
            <span className="text-[16px] text-faded">44·30·22</span>
          </div>
          <div className="font-body text-[18px]">
            Body &amp; chat — Patrick Hand · 16–18px, never below 15
          </div>
          <div className="font-utility text-[14px]">
            Utility — Special Elite · labels, codes, timers, names
          </div>
        </div>
      </Section>

      <Section title="Wobble (4 sets · rotate through them) + sketch">
        {WOBBLES.map((w, i) => (
          <div key={w} className="flex flex-col items-center gap-1">
            <div className={`h-16 w-16 border-2 border-ink bg-card ${w}`} />
            <span className="font-utility text-[11px]">{w}</span>
            <span className="sr-only">{`wobble-${i + 1}`}</span>
          </div>
        ))}
        <div className="flex flex-col items-center gap-1">
          <div className="wobble-sketch h-16 w-24 border-[2.5px] border-ink bg-card" />
          <span className="font-utility text-[11px]">wobble-sketch</span>
        </div>
        <div className="flex flex-col items-center gap-1">
          <div className="wobble-sketch-alt h-16 w-24 border-[2.5px] border-ink bg-card" />
          <span className="font-utility text-[11px]">sketch-alt</span>
        </div>
      </Section>

      <Section title="Tilt (max ±2°)">
        {TILTS.map((t) => (
          <div
            key={t}
            className={`flex h-14 w-24 items-center justify-center border-2 border-ink bg-card wobble-1 font-utility text-[11px] ${t}`}
          >
            {t}
          </div>
        ))}
      </Section>

      <Section title="Hard shadows">
        <div className="wobble-1 flex h-14 w-28 items-center justify-center border-2 border-ink bg-card shadow-ink font-utility text-[11px]">
          shadow-ink
        </div>
        <div className="wobble-1 flex h-14 w-28 items-center justify-center border-[3px] border-ink bg-card shadow-hero font-utility text-[11px]">
          shadow-hero
        </div>
        <div className="wobble-1 flex h-14 w-28 items-center justify-center border-[3px] border-hot bg-card shadow-hot font-utility text-[11px]">
          shadow-hot
        </div>
      </Section>

      <Section title="Doodles (max 2 per screen in real use)">
        <div className="flex flex-col items-center gap-1">
          <ScribbleCircle variant="circle" />
          <span className="font-utility text-[11px]">ScribbleCircle</span>
        </div>
        <div className="flex flex-col items-center gap-1">
          <ScribbleCircle variant="ring" />
          <span className="font-utility text-[11px]">…ring</span>
        </div>
        <div className="flex flex-col items-center gap-1">
          <InkUnderline />
          <span className="font-utility text-[11px]">InkUnderline</span>
        </div>
        <div className="flex flex-col items-center gap-3 px-8 py-3">
          <Splat>
            <span className="font-display text-[24px] text-card">SPLAT</span>
          </Splat>
          <span className="font-utility text-[11px]">Splat (imposter only)</span>
        </div>
        <div className="flex flex-col items-center gap-1">
          <div
            className="relative bg-card border-2 border-ink px-4 py-2 font-body text-[16px]"
            style={{ borderRadius: "18px 22px 20px 19px" }}
          >
            speech bubble
            <BubbleTail className="-bottom-[9px] left-[24px]" />
          </div>
          <span className="mt-2 font-utility text-[11px]">BubbleTail</span>
        </div>
      </Section>

      <Section title="Logo">
        <Logo size={32} />
        <Logo size={44} />
        <Logo size={56} />
      </Section>

      <Section title="Buttons (press to see the paper-press)">
        <Button variant="primary">I&apos;M READY</Button>
        <Button variant="accuse">ACCUSE!</Button>
        <Button variant="ghost">ghost</Button>
        <Button disabled>disabled</Button>
      </Section>

      <Section title="Chips (seat-claim + tags)">
        <Chip variant="unclaimed">unclaimed</Chip>
        <Chip variant="pending">pending — xaman…</Chip>
        <Chip variant="verified">✓ verified</Chip>
        <Chip variant="hot">with you: TAO</Chip>
      </Section>

      <Section title="Toggle chips (selected = ink-filled)">
        <Chip variant="solid">casual</Chip>
        <Chip variant="pending">on-chain</Chip>
      </Section>

      <Section title="Card">
        <Card wobble={1} className="p-5">
          <div className="font-display text-[22px]">a paper card</div>
          <div className="font-body text-[16px] text-muted">
            --card bg, 2px ink, wobble, hard shadow
          </div>
        </Card>
      </Section>

      <Section title="Code entry · Toast">
        <div className="flex flex-col items-start gap-2">
          <CodeEntry value="KX4M2" />
          <span className="font-utility text-[11px] text-muted">
            read-only (filled + one empty)
          </span>
        </div>
        <div className="flex flex-col items-start gap-2">
          <CodeEntry value={code} editable onChange={setCode} />
          <span className="font-utility text-[11px] text-muted">
            editable — type here
          </span>
        </div>
        <div className="flex flex-col items-start gap-2">
          <button onClick={() => setCopied((c) => !c)}>
            <Toast>code copied ✓</Toast>
          </button>
          <span className="font-utility text-[11px] text-muted">
            Toast {copied ? "(tapped)" : ""}
          </span>
        </div>
      </Section>

      <Section title="Avatar chips">
        <AvatarChip initial="Y" name="YOU" state="alive" host />
        <AvatarChip initial="M" name="MIRA" state="current" />
        <AvatarChip initial="K" name="KOFI" state="dead" />
        <AvatarChip initial="Z" name="ZARA" state="alive" />
      </Section>

      <Section title="Phase timer (turns hot + pulses under 10s)">
        <PhaseTimer seconds={45} />
        <PhaseTimer seconds={8} />
      </Section>

      <Section title="Role card — hold to peek (crew / imposter)">
        <RoleCard role="crew" word="MANGO" category="FRUIT" />
        <RoleCard role="imposter" fellowImposters={["TAO"]} />
      </Section>

      <div className="h-16" />
    </main>
  );
}
