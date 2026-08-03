import type { FundWatchlistColumnId } from "@/lib/fund-watchlist/fund-watchlist-table";

export type FundWatchlistOptionalColumnGroup = "volatility" | "sharpe" | "sfdr";

export const FUND_WATCHLIST_OPTIONAL_GROUPS: Record<
  FundWatchlistOptionalColumnGroup,
  { label: string; columns: FundWatchlistColumnId[] }
> = {
  volatility: {
    label: "Volatilités",
    columns: ["vol_5ans", "vol_3ans", "vol_1an"],
  },
  sharpe: {
    label: "Sharpe",
    columns: ["sharpe_ratio"],
  },
  sfdr: {
    label: "SFDR",
    columns: ["sfdr"],
  },
};

export const FUND_WATCHLIST_CORE_COLUMNS: FundWatchlistColumnId[] = [
  "favorite",
  "isin",
  "nom",
  "categorie",
  "sri",
  "score_ct",
  "perf_ytd",
  "perf_1semaine",
  "perf_1mois",
  "perf_3mois",
  "perf_1an",
  "perf_3ans",
  "perf_5ans",
];

/** Largeur fixe du nom : texte intégral sur plusieurs lignes, sans étirer le tableau. */
export const FUND_WATCHLIST_NOM_COLUMN_WIDTH = "200px";

export const FUND_WATCHLIST_COLUMN_MIN_WIDTH: Partial<Record<FundWatchlistColumnId, string>> = {
  favorite: "40px",
  isin: "92px",
  nom: FUND_WATCHLIST_NOM_COLUMN_WIDTH,
  categorie: "1%",
  sri: "32px",
  score_ct: "56px",
  perf_ytd: "54px",
  perf_1semaine: "54px",
  perf_1mois: "54px",
  perf_3mois: "54px",
  perf_1an: "54px",
  perf_3ans: "54px",
  perf_5ans: "54px",
  vol_5ans: "58px",
  vol_3ans: "58px",
  vol_1an: "58px",
  sharpe_ratio: "56px",
  sfdr: "96px",
};

export const FUND_WATCHLIST_ANNUAL_YEAR_MIN_WIDTH = "52px";

export function fundWatchlistOptionalColumns(
  expanded: Record<FundWatchlistOptionalColumnGroup, boolean>
): FundWatchlistColumnId[] {
  return (Object.keys(FUND_WATCHLIST_OPTIONAL_GROUPS) as FundWatchlistOptionalColumnGroup[])
    .filter((group) => expanded[group])
    .flatMap((group) => FUND_WATCHLIST_OPTIONAL_GROUPS[group].columns);
}

export const FUND_WATCHLIST_CATEGORIE_COLUMN_MAX_WIDTH = "132px";

export function fundWatchlistColumnStyle(
  column: FundWatchlistColumnId
): { minWidth?: string; maxWidth?: string; width?: string } {
  const minWidth = FUND_WATCHLIST_COLUMN_MIN_WIDTH[column];
  if (!minWidth) return {};
  if (column === "nom") {
    return {
      minWidth,
      maxWidth: minWidth,
      width: minWidth,
    };
  }
  if (column === "categorie") {
    return {
      width: minWidth,
      maxWidth: FUND_WATCHLIST_CATEGORIE_COLUMN_MAX_WIDTH,
    };
  }
  return { minWidth, width: minWidth };
}
