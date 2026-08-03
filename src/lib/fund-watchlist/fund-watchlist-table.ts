import { textMatchesSearch } from "@/lib/search-utils";
import type { FundWatchlistEntry } from "@/lib/api/tauri-fund-watchlist";
import { fundWatchlistAnnualPerf } from "@/lib/fund-watchlist/fund-watchlist-annual-years";
import { computeFundWatchlistShortTermScore } from "@/lib/fund-watchlist/fund-watchlist-short-term-score";

export const FUND_WATCHLIST_ANNUAL_COLUMN_PREFIX = "annual:" as const;

export type FundWatchlistAnnualColumnKey = `${typeof FUND_WATCHLIST_ANNUAL_COLUMN_PREFIX}${string}`;

export type FundWatchlistColumnId =
  | "favorite"
  | "isin"
  | "nom"
  | "categorie"
  | "sri"
  | "score_ct"
  | "perf_ytd"
  | "perf_1semaine"
  | "perf_1mois"
  | "perf_3mois"
  | "perf_1an"
  | "perf_3ans"
  | "perf_5ans"
  | "vol_5ans"
  | "vol_3ans"
  | "vol_1an"
  | "sharpe_ratio"
  | "sfdr";

export type FundWatchlistTableColumnKey = FundWatchlistColumnId | FundWatchlistAnnualColumnKey;

export function fundWatchlistAnnualColumnKey(year: string): FundWatchlistAnnualColumnKey {
  return `${FUND_WATCHLIST_ANNUAL_COLUMN_PREFIX}${year}`;
}

export function parseFundWatchlistAnnualYear(
  column: FundWatchlistTableColumnKey
): string | null {
  if (!column.startsWith(FUND_WATCHLIST_ANNUAL_COLUMN_PREFIX)) return null;
  const year = column.slice(FUND_WATCHLIST_ANNUAL_COLUMN_PREFIX.length);
  return year.length > 0 ? year : null;
}

export function isFundWatchlistAnnualColumnKey(
  column: FundWatchlistTableColumnKey
): column is FundWatchlistAnnualColumnKey {
  return parseFundWatchlistAnnualYear(column) != null;
}

export type FundWatchlistSortDirection = "asc" | "desc";

export type FundWatchlistSort = {
  column: FundWatchlistTableColumnKey;
  direction: FundWatchlistSortDirection;
} | null;

export const FUND_WATCHLIST_DEFAULT_SORT: NonNullable<FundWatchlistSort> = {
  column: "score_ct",
  direction: "desc",
};

export type FundWatchlistColumnFilter = {
  text?: string;
  min?: string;
  max?: string;
  values?: string[];
};

export type FundWatchlistColumnFilters = Partial<
  Record<FundWatchlistTableColumnKey, FundWatchlistColumnFilter>
>;

export const FUND_WATCHLIST_COLUMN_LABELS: Record<FundWatchlistColumnId, string> = {
  favorite: "Favori",
  isin: "ISIN",
  nom: "Nom",
  categorie: "Catégorie",
  sri: "SRI",
  score_ct: "Score CT",
  perf_ytd: "YTD",
  perf_1semaine: "1 sem",
  perf_1mois: "1 mois",
  perf_3mois: "3 mois",
  perf_1an: "1 an",
  perf_3ans: "3 ans",
  perf_5ans: "5 ans",
  vol_5ans: "Vol. 5 ans",
  vol_3ans: "Vol. 3 ans",
  vol_1an: "Vol. 1 an",
  sharpe_ratio: "Sharpe",
  sfdr: "SFDR",
};

export const FUND_WATCHLIST_COLUMN_ALIGN: Record<
  FundWatchlistColumnId,
  "left" | "center" | "right"
> = {
  favorite: "center",
  isin: "left",
  nom: "left",
  categorie: "left",
  sri: "center",
  score_ct: "right",
  perf_ytd: "right",
  perf_1semaine: "right",
  perf_1mois: "right",
  perf_3mois: "right",
  perf_1an: "right",
  perf_3ans: "right",
  perf_5ans: "right",
  vol_5ans: "right",
  vol_3ans: "right",
  vol_1an: "right",
  sharpe_ratio: "right",
  sfdr: "left",
};

export function fundWatchlistCellAlignClass(
  column: FundWatchlistColumnId
): string {
  const align = FUND_WATCHLIST_COLUMN_ALIGN[column];
  if (align === "right") return "text-right";
  if (align === "center") return "text-center";
  return "text-left";
}

function parseOptionalNumber(value: string | undefined): number | null {
  const raw = value?.trim().replace(",", ".");
  if (!raw) return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

function entryTextValue(
  entry: FundWatchlistEntry,
  column: FundWatchlistColumnId
): string {
  switch (column) {
    case "favorite":
      return entry.is_favorite ? "oui" : "non";
    case "isin":
      return entry.isin;
    case "nom":
      return entry.nom;
    case "categorie":
      return entry.categorie ?? "";
    case "sri":
      return entry.sri != null ? String(entry.sri) : "";
    case "sfdr":
      return entry.sfdr ?? "";
    default:
      return "";
  }
}

function entryNumericValue(
  entry: FundWatchlistEntry,
  column: FundWatchlistTableColumnKey
): number | null {
  const annualYear = parseFundWatchlistAnnualYear(column);
  if (annualYear) {
    const value = fundWatchlistAnnualPerf(entry, annualYear);
    return value ?? null;
  }

  switch (column) {
    case "sri":
      return entry.sri ?? null;
    case "score_ct":
      return computeFundWatchlistShortTermScore(entry);
    case "perf_ytd":
      return entry.perf_ytd ?? null;
    case "perf_1semaine":
      return entry.perf_1semaine ?? null;
    case "perf_1mois":
      return entry.perf_1mois ?? null;
    case "perf_3mois":
      return entry.perf_3mois ?? null;
    case "perf_1an":
      return entry.perf_1an ?? null;
    case "perf_3ans":
      return entry.perf_3ans ?? null;
    case "perf_5ans":
      return entry.perf_5ans ?? null;
    case "vol_5ans":
      return entry.vol_5ans ?? null;
    case "vol_3ans":
      return entry.vol_3ans ?? null;
    case "vol_1an":
      return entry.vol_1an ?? null;
    case "sharpe_ratio":
      return entry.sharpe_ratio ?? null;
    case "favorite":
      return entry.is_favorite ? 1 : 0;
    default:
      return null;
  }
}

function isNumericColumn(column: FundWatchlistTableColumnKey): boolean {
  if (isFundWatchlistAnnualColumnKey(column)) return true;
  return (
    column === "sri" ||
    column === "favorite" ||
    column === "score_ct" ||
    column === "sharpe_ratio" ||
    column.startsWith("perf_") ||
    column.startsWith("vol_")
  );
}

function isTextColumn(column: FundWatchlistTableColumnKey): boolean {
  if (isFundWatchlistAnnualColumnKey(column)) return false;
  return column === "isin" || column === "nom" || column === "categorie" || column === "sfdr";
}

export function columnFilterIsActive(filter: FundWatchlistColumnFilter | undefined): boolean {
  if (!filter) return false;
  if (filter.text?.trim()) return true;
  if (filter.min?.trim() || filter.max?.trim()) return true;
  if (filter.values && filter.values.length > 0) return true;
  return false;
}

export function matchesFundWatchlistColumnFilter(
  entry: FundWatchlistEntry,
  column: FundWatchlistTableColumnKey,
  filter: FundWatchlistColumnFilter | undefined
): boolean {
  if (!filter || !columnFilterIsActive(filter)) return true;

  if (filter.text?.trim() && isTextColumn(column)) {
    if (!textMatchesSearch(filter.text, entryTextValue(entry, column))) return false;
  }

  if (filter.values && filter.values.length > 0) {
    if (filter.values.length === 1 && filter.values[0] === "__none__") {
      return false;
    }
    const value = entryTextValue(entry, column) || "—";
    if (!filter.values.includes(value)) return false;
  }

  if ((filter.min?.trim() || filter.max?.trim()) && isNumericColumn(column)) {
    const value = entryNumericValue(entry, column);
    const min = parseOptionalNumber(filter.min);
    const max = parseOptionalNumber(filter.max);
    if (value == null) return false;
    if (min != null && value < min) return false;
    if (max != null && value > max) return false;
  }

  return true;
}

export function matchesFundWatchlistSearch(
  entry: FundWatchlistEntry,
  query: string
): boolean {
  return textMatchesSearch(
    query,
    entry.isin,
    entry.nom,
    entry.categorie,
    entry.sfdr,
    entry.sri != null ? String(entry.sri) : undefined
  );
}

export function filterFundWatchlistEntries(
  entries: FundWatchlistEntry[],
  options: {
    search: string;
    favoritesOnly: boolean;
    columnFilters: FundWatchlistColumnFilters;
  }
): FundWatchlistEntry[] {
  return entries.filter((entry) => {
    if (options.favoritesOnly && !entry.is_favorite) return false;
    if (!matchesFundWatchlistSearch(entry, options.search)) return false;
    for (const [column, filter] of Object.entries(options.columnFilters) as [
      FundWatchlistTableColumnKey,
      FundWatchlistColumnFilter,
    ][]) {
      if (!matchesFundWatchlistColumnFilter(entry, column, filter)) return false;
    }
    return true;
  });
}

function compareNullableNumber(
  left: number | null,
  right: number | null,
  direction: FundWatchlistSortDirection
): number {
  const leftMissing = left == null || !Number.isFinite(left);
  const rightMissing = right == null || !Number.isFinite(right);
  if (leftMissing && rightMissing) return 0;
  if (leftMissing) return 1;
  if (rightMissing) return -1;
  return direction === "asc" ? left - right : right - left;
}

function compareText(
  left: string,
  right: string,
  direction: FundWatchlistSortDirection
): number {
  const result = left.localeCompare(right, "fr", { sensitivity: "base" });
  return direction === "asc" ? result : -result;
}

export function compareFundWatchlistEntries(
  left: FundWatchlistEntry,
  right: FundWatchlistEntry,
  sort: FundWatchlistSort
): number {
  if (!sort) return 0;
  const { column, direction } = sort;

  if (column === "score_ct") {
    const leftScore = computeFundWatchlistShortTermScore(left);
    const rightScore = computeFundWatchlistShortTermScore(right);
    const leftMissing = leftScore == null;
    const rightMissing = rightScore == null;
    if (leftMissing && rightMissing) {
      return compareText(left.nom, right.nom, "asc");
    }
    if (leftMissing) return 1;
    if (rightMissing) return -1;
    const byScore = compareNullableNumber(leftScore, rightScore, direction);
    if (byScore !== 0) return byScore;
    return compareText(left.nom, right.nom, "asc");
  }

  if (isFundWatchlistAnnualColumnKey(column) || isNumericColumn(column)) {
    return compareNullableNumber(
      entryNumericValue(left, column),
      entryNumericValue(right, column),
      direction
    );
  }

  return compareText(
    entryTextValue(left, column as FundWatchlistColumnId),
    entryTextValue(right, column as FundWatchlistColumnId),
    direction
  );
}

export function sortFundWatchlistEntries(
  entries: FundWatchlistEntry[],
  sort: FundWatchlistSort
): FundWatchlistEntry[] {
  const effectiveSort = sort ?? FUND_WATCHLIST_DEFAULT_SORT;
  if (!effectiveSort) return entries;
  return [...entries].sort((a, b) => compareFundWatchlistEntries(a, b, effectiveSort));
}

export function applyFundWatchlistTable(
  entries: FundWatchlistEntry[],
  options: {
    search: string;
    favoritesOnly: boolean;
    columnFilters: FundWatchlistColumnFilters;
    sort: FundWatchlistSort;
  }
): FundWatchlistEntry[] {
  const filtered = filterFundWatchlistEntries(entries, options);
  return sortFundWatchlistEntries(filtered, options.sort);
}

export function collectFundWatchlistDistinctValues(
  entries: FundWatchlistEntry[],
  column: FundWatchlistColumnId
): string[] {
  const values = new Set<string>();
  for (const entry of entries) {
    const text = entryTextValue(entry, column).trim();
    values.add(text || "—");
  }
  return [...values].sort((a, b) => a.localeCompare(b, "fr", { sensitivity: "base" }));
}

export function cycleFundWatchlistSort(
  current: FundWatchlistSort,
  column: FundWatchlistTableColumnKey
): FundWatchlistSort {
  if (!current || current.column !== column) {
    return { column, direction: "asc" };
  }
  if (current.direction === "asc") {
    return { column, direction: "desc" };
  }
  return null;
}
