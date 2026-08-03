import type { CompareResponse } from "@/lib/api/tauri-uc-comparator";
import { cn } from "@/lib/utils";

export const UC_TOP_HOLDINGS_DISPLAY = 6;

export function verdictVisual(verdict: CompareResponse["verdict"]) {
  switch (verdict) {
    case "WINNER_DECLARED":
      return {
        badge: "bg-emerald-600 hover:bg-emerald-600 text-white",
        panel: "border-emerald-200 bg-emerald-50/60 dark:border-emerald-900/50 dark:bg-emerald-950/30",
        accent: "text-emerald-700 dark:text-emerald-300",
      };
    case "TIE":
      return {
        badge: "bg-amber-500 hover:bg-amber-500 text-white",
        panel: "border-amber-200 bg-amber-50/60 dark:border-amber-900/50 dark:bg-amber-950/30",
        accent: "text-amber-800 dark:text-amber-300",
      };
    case "INSUFFICIENT_DATA":
      return {
        badge: "bg-slate-500 hover:bg-slate-500 text-white",
        panel: "border-slate-200 bg-slate-50/70 dark:border-slate-800 dark:bg-slate-900/40",
        accent: "text-slate-700 dark:text-slate-300",
      };
    case "CATEGORY_MISMATCH":
      return {
        badge: "bg-rose-600 hover:bg-rose-600 text-white",
        panel: "border-rose-200 bg-rose-50/60 dark:border-rose-900/50 dark:bg-rose-950/30",
        accent: "text-rose-700 dark:text-rose-300",
      };
    default:
      return {
        badge: "",
        panel: "border-border bg-muted/20",
        accent: "text-muted-foreground",
      };
  }
}

export function rankCardClass(rank: number, isWinner: boolean): string {
  if (isWinner) {
    return "border-emerald-300/80 bg-gradient-to-r from-emerald-50/90 to-transparent dark:from-emerald-950/40 dark:border-emerald-800/60";
  }
  if (rank === 1) {
    return "border-amber-300/70 bg-gradient-to-r from-amber-50/80 to-transparent dark:from-amber-950/30 dark:border-amber-800/50";
  }
  if (rank === 2) {
    return "border-slate-300/70 bg-gradient-to-r from-slate-50/80 to-transparent dark:from-slate-900/40 dark:border-slate-700/50";
  }
  if (rank === 3) {
    return "border-orange-200/70 bg-gradient-to-r from-orange-50/50 to-transparent dark:from-orange-950/20 dark:border-orange-900/40";
  }
  return "border-border bg-card";
}

export function rankBadgeClass(rank: number): string {
  if (rank === 1) return "bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200";
  if (rank === 2) return "bg-slate-100 text-slate-800 dark:bg-slate-800 dark:text-slate-200";
  if (rank === 3) return "bg-orange-100 text-orange-900 dark:bg-orange-950 dark:text-orange-200";
  return "bg-muted text-muted-foreground";
}

export function scoreTextClass(score: number): string {
  if (score >= 75) return "text-emerald-700 dark:text-emerald-300";
  if (score >= 55) return "text-amber-700 dark:text-amber-300";
  return "text-rose-700 dark:text-rose-300";
}

export function scoreBarClass(score: number): string {
  if (score >= 75) return "bg-emerald-500";
  if (score >= 55) return "bg-amber-500";
  return "bg-rose-400";
}

export function criterionScoreClass(score: number): string {
  if (score >= 80) return "text-emerald-700 dark:text-emerald-300";
  if (score >= 40) return "text-foreground";
  return "text-muted-foreground";
}

export function exposureHeatClass(weight: number | null, maxWeight: number): string {
  if (weight == null || maxWeight <= 0) return "";
  const ratio = weight / maxWeight;
  if (ratio >= 0.75) {
    return "bg-primary/15 font-medium text-primary dark:bg-primary/25";
  }
  if (ratio >= 0.45) {
    return "bg-primary/8 dark:bg-primary/15";
  }
  if (ratio >= 0.2) {
    return "bg-muted/40";
  }
  return "";
}

export function ScoreBar({ score, className }: { score: number; className?: string }) {
  return (
    <div className={cn("mt-1.5 h-1.5 w-full max-w-[120px] rounded-full bg-muted/80 ml-auto", className)}>
      <div
        className={cn("h-full rounded-full transition-all", scoreBarClass(score))}
        style={{ width: `${Math.max(4, Math.min(100, score))}%` }}
      />
    </div>
  );
}

export function MiniWeightBar({
  weight,
  maxWeight,
  className,
}: {
  weight: number;
  maxWeight: number;
  className?: string;
}) {
  const pct = maxWeight > 0 ? (weight / maxWeight) * 100 : 0;
  return (
    <div className={cn("h-1 w-full min-w-[36px] rounded-full bg-muted/70", className)}>
      <div
        className="h-full rounded-full bg-primary/70"
        style={{ width: `${Math.max(6, Math.min(100, pct))}%` }}
      />
    </div>
  );
}
