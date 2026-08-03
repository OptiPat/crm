import { describe, expect, it } from "vitest";
import type { FundWatchlistEntry } from "@/lib/api/tauri-fund-watchlist";
import {
  computeFundWatchlistShortTermScore,
  hasCompleteFundWatchlistShortTermPerfs,
} from "./fund-watchlist-short-term-score";

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

describe("computeFundWatchlistShortTermScore", () => {
  it("retourne null si un horizon manque", () => {
    const incomplete = entry({
      id: 1,
      isin: "FR001",
      nom: "A",
      perf_1semaine: 1,
      perf_1mois: 1,
      perf_3mois: 1,
    });
    expect(hasCompleteFundWatchlistShortTermPerfs(incomplete)).toBe(false);
    expect(computeFundWatchlistShortTermScore(incomplete)).toBeNull();
  });

  it("favorise un profil régulier face à un profil flashy", () => {
    const steady = entry({
      id: 1,
      isin: "FR001",
      nom: "Steady",
      perf_1semaine: 2,
      perf_1mois: 1.8,
      perf_3mois: 2.1,
      perf_ytd: 2.5,
    });
    const flashy = entry({
      id: 2,
      isin: "FR002",
      nom: "Flashy",
      perf_1semaine: 5,
      perf_1mois: -4,
      perf_3mois: 1,
      perf_ytd: 2,
    });

    const steadyScore = computeFundWatchlistShortTermScore(steady)!;
    const flashyScore = computeFundWatchlistShortTermScore(flashy)!;

    expect(steadyScore).toBeCloseTo(1.82, 2);
    expect(flashyScore).toBeLessThan(0);
    expect(steadyScore).toBeGreaterThan(flashyScore);
  });

  it("pénalise légèrement un horizon négatif isolé", () => {
    const mostlyGood = entry({
      id: 1,
      isin: "FR001",
      nom: "Mostly",
      perf_1semaine: 3,
      perf_1mois: 3,
      perf_3mois: 3,
      perf_ytd: -0.2,
    });
    const allGood = entry({
      id: 2,
      isin: "FR002",
      nom: "AllGood",
      perf_1semaine: 3,
      perf_1mois: 3,
      perf_3mois: 3,
      perf_ytd: 3,
    });

    expect(computeFundWatchlistShortTermScore(mostlyGood)!).toBeLessThan(
      computeFundWatchlistShortTermScore(allGood)!
    );
  });
});
