import { Star } from "lucide-react";
import type { RankIconKind } from "@/lib/organisation/filleul-ranks";
import { cn } from "@/lib/utils";

/** Inuksuk stylisé — empilement de pierres (silhouette humaine). */
function InuksukIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={cn("h-3.5 w-3.5 shrink-0", className)}
      fill="currentColor"
      aria-hidden
    >
      <rect x="7" y="18.5" width="3.2" height="3.5" rx="0.6" />
      <rect x="13.8" y="18.5" width="3.2" height="3.5" rx="0.6" />
      <rect x="10.2" y="12.5" width="3.6" height="6" rx="0.6" />
      <rect x="4.5" y="11.5" width="5.2" height="2.4" rx="0.6" />
      <rect x="14.3" y="11.5" width="5.2" height="2.4" rx="0.6" />
      <rect x="9.5" y="7" width="5" height="4" rx="0.6" />
    </svg>
  );
}

const INUKSUK_COLORS: Partial<Record<RankIconKind, string>> = {
  "inuksuk-red": "text-red-600",
  "inuksuk-dark": "text-stone-700",
  "inuksuk-copper": "text-amber-700",
  "inuksuk-silver": "text-slate-400",
  "inuksuk-gold": "text-yellow-500",
};

export function RankIcon({
  kind,
  className,
}: {
  kind: RankIconKind;
  className?: string;
}) {
  if (kind === "none") return null;

  const inuksukColor = INUKSUK_COLORS[kind];
  if (inuksukColor) {
    return <InuksukIcon className={cn(inuksukColor, className)} />;
  }

  if (kind === "star-copper") {
    return <Star className={cn("h-3.5 w-3.5 fill-amber-700 text-amber-700", className)} />;
  }

  if (kind === "stars-2-silver") {
    return (
      <span className={cn("inline-flex items-center gap-0.5", className)}>
        <Star className="h-3 w-3 fill-slate-400 text-slate-400" />
        <Star className="h-3 w-3 fill-slate-400 text-slate-400" />
      </span>
    );
  }

  if (kind === "stars-3-gold") {
    return (
      <span className={cn("inline-flex items-center gap-0.5", className)}>
        <Star className="h-3 w-3 fill-yellow-500 text-yellow-500" />
        <Star className="h-3 w-3 fill-yellow-500 text-yellow-500" />
        <Star className="h-3 w-3 fill-yellow-500 text-yellow-500" />
      </span>
    );
  }

  return null;
}
