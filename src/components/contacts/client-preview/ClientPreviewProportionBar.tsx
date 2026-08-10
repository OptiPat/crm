export interface ProportionBarSlice {
  key: string;
  value: number;
  color: string;
  label: string;
}

export function ClientPreviewProportionBar({
  slices,
  total,
  ariaLabel,
  className = "mt-4",
}: {
  slices: ProportionBarSlice[];
  total: number;
  ariaLabel: string;
  className?: string;
}) {
  if (total <= 0 || slices.length === 0) return null;

  return (
    <div
      className={`cp-perimetre-bar flex h-2 w-full overflow-hidden rounded-full bg-[var(--cp-line-soft)] ${className}`}
      role="img"
      aria-label={ariaLabel}
    >
      {slices.map((slice) => {
        const widthPct = (slice.value / total) * 100;
        if (widthPct <= 0) return null;
        return (
          <div
            key={slice.key}
            className="h-full min-w-0 transition-[width] duration-300"
            style={{
              width: `${widthPct}%`,
              backgroundColor: slice.color,
            }}
            title={`${slice.label} : ${Math.round(widthPct)} %`}
          />
        );
      })}
    </div>
  );
}
