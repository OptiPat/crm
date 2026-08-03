import type { FundWatchlistEntry } from "@/lib/api/tauri-fund-watchlist";

const YEAR_RE = /^(19|20)\d{2}$/;

export function collectFundWatchlistAnnualYears(entries: FundWatchlistEntry[]): string[] {
  const years = new Set<string>();
  for (const entry of entries) {
    if (!entry.perf_annual) continue;
    for (const year of Object.keys(entry.perf_annual)) {
      if (YEAR_RE.test(year)) years.add(year);
    }
  }
  return [...years].sort((a, b) => Number(b) - Number(a));
}

export function fundWatchlistAnnualPerf(
  entry: FundWatchlistEntry,
  year: string
): number | null | undefined {
  return entry.perf_annual?.[year];
}
