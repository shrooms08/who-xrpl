// Wavy hand-drawn underline stroke (canonical §1a / §1c).

type Props = {
  width?: number;
  height?: number;
  color?: string;
  strokeWidth?: number;
  className?: string;
};

export function InkUnderline({
  width = 130,
  height = 12,
  color = "var(--ink)",
  strokeWidth = 2.5,
  className,
}: Props) {
  return (
    <svg
      width={width}
      height={height}
      viewBox="0 0 130 12"
      className={className}
      aria-hidden="true"
    >
      <path
        d="M3 7c22-6 38 5 60-2 20-6 40 4 64-1"
        fill="none"
        stroke={color}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
      />
    </svg>
  );
}
