import { describe, expect, it } from "vitest";
import type { FundWatchlistEntry } from "@/lib/api/tauri-fund-watchlist";
import {
  applyFundWatchlistTable,
  cycleFundWatchlistSort,
  FUND_WATCHLIST_DEFAULT_SORT,
  matchesFundWatchlistColumnFilter,
} from "./fund-watchlist-table";

function entry(
  partial: Partial<FundWatchlistEntry> & Pick<FundWatchlistEntry, "id" | "isin" | "nom">
): FundWatchlistEntry {
  return {
    source_label: "test",
    is_favorite: false,
    created_at: 0,
    updated_at: 0,
    ...partial,
  };
}

describe("fund-watchlist-table", () => {
  const rows = [
    entry({ id: 1, isin: "FR001", nom: "Alpha Actions", perf_ytd: 5, sri: 4, sfdr: "Article 8" }),
    entry({ id: 2, isin: "FR002", nom: "Beta Oblig", perf_ytd: 2, sri: 2, sfdr: "Article 6" }),
    entry({ id: 3, isin: "LU003", nom: "Gamma Europe", perf_ytd: 8, sri: 5, is_favorite: true }),
  ];

  it("filtre par recherche globale et favoris", () => {
    const result = applyFundWatchlistTable(rows, {
      search: "beta",
      favoritesOnly: false,
      columnFilters: {},
      sort: null,
    });
    expect(result.map((r) => r.id)).toEqual([2]);
  });

  it("filtre numérique min/max sur une colonne perf", () => {
    expect(
      matchesFundWatchlistColumnFilter(rows[0]!, "perf_ytd", { min: "4" })
    ).toBe(true);
    expect(
      matchesFundWatchlistColumnFilter(rows[1]!, "perf_ytd", { min: "4" })
    ).toBe(false);
  });

  it("trie par performance YTD décroissante", () => {
    const result = applyFundWatchlistTable(rows, {
      search: "",
      favoritesOnly: false,
      columnFilters: {},
      sort: { column: "perf_ytd", direction: "desc" },
    });
    expect(result.map((r) => r.id)).toEqual([3, 1, 2]);
  });

  it("trie par score court terme et relègue les fonds incomplets", () => {
    const scored = [
      entry({
        id: 1,
        isin: "FR001",
        nom: "Steady",
        perf_1semaine: 2,
        perf_1mois: 1.8,
        perf_3mois: 2.1,
        perf_ytd: 2.5,
      }),
      entry({
        id: 2,
        isin: "FR002",
        nom: "Flashy",
        perf_1semaine: 5,
        perf_1mois: -4,
        perf_3mois: 1,
        perf_ytd: 2,
      }),
      entry({
        id: 3,
        isin: "LU003",
        nom: "Incomplete",
        perf_ytd: 8,
      }),
    ];
    const result = applyFundWatchlistTable(scored, {
      search: "",
      favoritesOnly: false,
      columnFilters: {},
      sort: FUND_WATCHLIST_DEFAULT_SORT,
    });
    expect(result.map((r) => r.id)).toEqual([1, 2, 3]);
  });

  it("cycle le tri asc → desc → aucun", () => {
    expect(cycleFundWatchlistSort(null, "nom")).toEqual({
      column: "nom",
      direction: "asc",
    });
    expect(
      cycleFundWatchlistSort({ column: "nom", direction: "asc" }, "nom")
    ).toEqual({ column: "nom", direction: "desc" });
    expect(
      cycleFundWatchlistSort({ column: "nom", direction: "desc" }, "nom")
    ).toBeNull();
  });
});
