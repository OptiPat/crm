import type { FundWatchlistCoachProgressEvent } from "@/lib/fund-watchlist/fund-watchlist-coach-events";

function truncateLabel(value: string, max = 42): string {
  const trimmed = value.trim();
  if (trimmed.length <= max) return trimmed;
  return `${trimmed.slice(0, max - 1).trimEnd()}…`;
}

export function formatCoachProgressLabel(progress: FundWatchlistCoachProgressEvent): string {
  if (progress.phase === "llm") {
    return "Analyse IA en cours…";
  }
  if (progress.total <= 0) {
    return "Collecte en cours…";
  }
  const base = `Collecte ${progress.current}/${progress.total}`;
  if (progress.fundName?.trim()) {
    return `${base} — ${truncateLabel(progress.fundName)}`;
  }
  return base;
}

export function formatCoachProgressToast(progress: FundWatchlistCoachProgressEvent): string {
  if (progress.phase === "llm") {
    return `Analyse IA (${progress.total} fonds)…`;
  }
  return formatCoachProgressLabel(progress);
}
