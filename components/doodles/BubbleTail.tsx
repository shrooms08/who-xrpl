// Speech-bubble tail — the rotated/skewed square trick (canonical §1d).
// Position it with `className` (absolute + offsets) on the bubble container.

export function BubbleTail({
  fill = "var(--card)",
  line = "var(--ink)",
  className,
}: {
  fill?: string;
  line?: string;
  className?: string;
}) {
  return (
    <span
      aria-hidden="true"
      className={`absolute ${className ?? ""}`}
      style={{
        width: 14,
        height: 14,
        background: fill,
        borderRight: `2px solid ${line}`,
        borderBottom: `2px solid ${line}`,
        transform: "rotate(55deg) skewX(20deg)",
      }}
    />
  );
}
