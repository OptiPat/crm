import type { FundWatchlistEntry } from "@/lib/api/tauri-fund-watchlist";

/** Pénalité sur l'écart max−min entre les 4 horizons court terme. */
export const FUND_WATCHLIST_SHORT_TERM_SPREAD_PENALTY = 0.4;

/** Pénalité par horizon strictement négatif. */
export const FUND_WATCHLIST_SHORT_TERM_NEGATIVE_PENALTY = 0.5;

export const FUND_WATCHLIST_SHORT_TERM_HORIZON_COUNT = 4;

export function getFundWatchlistShortTermPerfs(
  entry: FundWatchlistEntry
): [number, number, number, number] | null {
  const values = [
    entry.perf_1semaine,
    entry.perf_1mois,
    entry.perf_3mois,
    entry.perf_ytd,
  ];
  if (values.some((value) => value == null || !Number.isFinite(value))) {
    return null;
  }
  return values as [number, number, number, number];
}

export function hasCompleteFundWatchlistShortTermPerfs(entry: FundWatchlistEntry): boolean {
  return getFundWatchlistShortTermPerfs(entry) != null;
}

/**
 * Score court terme cohérent (1 sem, 1 mois, 3 mois, YTD).
 * Retourne null si un des 4 horizons manque.
 */
export function computeFundWatchlistShortTermScore(entry: FundWatchlistEntry): number | null {
  const perfs = getFundWatchlistShortTermPerfs(entry);
  if (!perfs) return null;

  const mean = perfs.reduce((sum, value) => sum + value, 0) / perfs.length;
  const spread = Math.max(...perfs) - Math.min(...perfs);
  const negativeCount = perfs.filter((value) => value < 0).length;

  return (
    mean -
    FUND_WATCHLIST_SHORT_TERM_SPREAD_PENALTY * spread -
    FUND_WATCHLIST_SHORT_TERM_NEGATIVE_PENALTY * negativeCount
  );
}
