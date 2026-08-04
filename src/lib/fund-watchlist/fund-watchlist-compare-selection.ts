const STORAGE_KEY = "crm_fund_watchlist_compare_isins_v1";

export function loadFundWatchlistCompareSelection(): string[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((item): item is string => typeof item === "string" && item.trim().length > 0);
  } catch {
    return [];
  }
}

export function saveFundWatchlistCompareSelection(isins: Iterable<string>): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify([...isins]));
  } catch {
    /* quota / mode privé */
  }
}

export function filterCompareSelectionToKnown(
  selection: Iterable<string>,
  knownIsins: ReadonlySet<string>,
  maxCount: number
): Set<string> {
  const next = new Set<string>();
  for (const isin of selection) {
    if (!knownIsins.has(isin)) continue;
    next.add(isin);
    if (next.size >= maxCount) break;
  }
  return next;
}

export function compareSelectionSetsEqual(a: ReadonlySet<string>, b: ReadonlySet<string>): boolean {
  if (a.size !== b.size) return false;
  for (const isin of a) {
    if (!b.has(isin)) return false;
  }
  return true;
}
