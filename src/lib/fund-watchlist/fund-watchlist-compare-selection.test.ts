import { describe, expect, it, vi, beforeEach } from "vitest";
import {
  compareSelectionSetsEqual,
  filterCompareSelectionToKnown,
  loadFundWatchlistCompareSelection,
  saveFundWatchlistCompareSelection,
} from "@/lib/fund-watchlist/fund-watchlist-compare-selection";

describe("fund-watchlist-compare-selection", () => {
  const storage = new Map<string, string>();

  beforeEach(() => {
    storage.clear();
    vi.stubGlobal("localStorage", {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => {
        storage.set(key, value);
      },
      removeItem: (key: string) => {
        storage.delete(key);
      },
      clear: () => {
        storage.clear();
      },
    });
  });

  it("persiste et recharge les ISIN sélectionnés", () => {
    saveFundWatchlistCompareSelection(["LU1861469051", "IE00BD1DJ122"]);
    expect(loadFundWatchlistCompareSelection()).toEqual(["LU1861469051", "IE00BD1DJ122"]);
  });

  it("filtre les ISIN inconnus et respecte le plafond", () => {
    const known = new Set(["A", "B", "C"]);
    const filtered = filterCompareSelectionToKnown(["A", "X", "B", "C"], known, 2);
    expect([...filtered]).toEqual(["A", "B"]);
  });

  it("compare deux sélections", () => {
    expect(compareSelectionSetsEqual(new Set(["A"]), new Set(["A"]))).toBe(true);
    expect(compareSelectionSetsEqual(new Set(["A"]), new Set(["B"]))).toBe(false);
  });
});
