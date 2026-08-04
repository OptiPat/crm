import { describe, expect, it } from "vitest";
import {
  getFundDiagnosticDeltaThresholds,
  isSameFundWatchlistPeerCategory,
  resolveFundDiagnosticVolatilityClass,
} from "@/lib/fund-watchlist/fund-watchlist-diagnostic-thresholds";

describe("fund-watchlist-diagnostic-thresholds", () => {
  it("classe Actions Europe en volatilité actions", () => {
    expect(resolveFundDiagnosticVolatilityClass("Actions Europe")).toBe("actions");
    expect(getFundDiagnosticDeltaThresholds("Actions Europe").surveillance).toBe(-2);
    expect(getFundDiagnosticDeltaThresholds("Actions Europe").arbitrage).toBe(-4);
  });

  it("classe obligations en volatilité faible", () => {
    expect(resolveFundDiagnosticVolatilityClass("Obligations Euro")).toBe("rates");
    expect(getFundDiagnosticDeltaThresholds("Obligations Euro").surveillance).toBe(-0.8);
    expect(getFundDiagnosticDeltaThresholds("Obligations Euro").arbitrage).toBe(-1.5);
  });

  it("classe diversifié en volatilité moyenne", () => {
    expect(resolveFundDiagnosticVolatilityClass("Fonds diversifié")).toBe("diversified");
    expect(getFundDiagnosticDeltaThresholds("Fonds diversifié").surveillance).toBe(-1.5);
    expect(getFundDiagnosticDeltaThresholds("Fonds diversifié").arbitrage).toBe(-3);
  });

  it("associe Japon Morningstar (Growth / Blend) et Asie en méta-catégorie", () => {
    expect(
      isSameFundWatchlistPeerCategory(
        "Japan Large-Cap Growth Equity",
        "Japan Large-Cap Blend Equity"
      )
    ).toBe(true);
    expect(
      isSameFundWatchlistPeerCategory(
        "Japan Large-Cap Blend Equity",
        "Actions Asie Pacifique"
      )
    ).toBe(true);
    expect(
      isSameFundWatchlistPeerCategory(
        "Actions Asie Pacifique",
        "Actions Marchés Emergents Asie"
      )
    ).toBe(true);
  });
});
