// "WHO" in ink + "?" in --hot, slightly oversized. Display face.

export function Logo({
  size = 44,
  className,
}: {
  size?: number;
  className?: string;
}) {
  return (
    <span
      className={`font-display leading-none tracking-tight ${className ?? ""}`}
      style={{ fontSize: size }}
    >
      WHO
      <span className="text-hot" style={{ fontSize: Math.round(size * 1.2) }}>
        ?
      </span>
    </span>
  );
}
