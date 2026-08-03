import { describe, expect, it } from "vitest";
import type { CompareResponse } from "@/lib/api/tauri-uc-comparator";
import {
  buildUcComparisonNarrative,
  effectiveCriterionWeight,
  formatCriterionWeightLabel,
  resolveCriterionWinners,
  sharedFundAlerts,
} from "@/lib/fund-watchlist/uc-comparator-summary";

const pictetFidelityResponse: CompareResponse = {
  comparatif_id: "test",
  scoring_version: "v1",
  confidence_index: 0.85,
  verdict: "WINNER_DECLARED",
  winner_isin: "LU1279334210",
  is_category_matched: true,
  category: "Actions Secteur Technologies",
  score_gap: 62.36,
  fund_order: ["LU0099574567", "LU1279334210"],
  criteria: [
    {
      key: "perf_1an",
      label: "Perf. 1 an",
      weight_global: 0.08,
      scores: [0, 100],
      available: true,
    },
    {
      key: "perf_3ans",
      label: "Perf. 3 ans",
      weight_global: 0.16,
      scores: [0, 100],
      available: true,
    },
    {
      key: "perf_5ans",
      label: "Perf. 5 ans",
      weight_global: 0.16,
      scores: [100, 0],
      available: true,
    },
    {
      key: "sharpe_3y",
      label: "Sharpe 3 ans",
      weight_global: 0.45,
      scores: [97.6, 100],
      available: true,
    },
    {
      key: "top10",
      label: "Concentration Top 10",
      weight_global: 0.15,
      scores: [0, 0],
      available: false,
    },
  ],
  metrics: [],
  results: [
    {
      isin: "LU1279334210",
      nom: "Pictet - Robotics P EUR",
      rank: 1,
      score_relative_total: 81.18,
      pilier_scores: { performance: 60, risque: 100, structure: null },
      criterion_scores: [100, 100, 0, 100, 0],
      alerts: ["⚠️ Momentum YTD en décrochage"],
    },
    {
      isin: "LU0099574567",
      nom: "Fidelity Funds - Global Technology Fund A-DIST-EUR",
      rank: 2,
      score_relative_total: 18.82,
      pilier_scores: { performance: 40, risque: 0, structure: null },
      criterion_scores: [0, 0, 100, 0, 0],
      alerts: ["⚠️ Momentum YTD en décrochage"],
    },
  ],
  raw_json_payload: "",
};

describe("uc-comparator-summary", () => {
  it("calcule le poids effectif après redistribution", () => {
    const sharpe = pictetFidelityResponse.criteria.find((c) => c.key === "sharpe_3y")!;
    expect(effectiveCriterionWeight(sharpe, pictetFidelityResponse.criteria)).toBeCloseTo(
      0.45 / 0.85,
      4
    );
    expect(formatCriterionWeightLabel(sharpe, pictetFidelityResponse.criteria)).toContain(
      "effectif"
    );
  });

  it("identifie le gagnant par critère", () => {
    const winners = resolveCriterionWinners(pictetFidelityResponse);
    expect(winners.find((w) => w.criterion.key === "sharpe_3y")?.winnerIsin).toBe(
      "LU1279334210"
    );
    expect(winners.find((w) => w.criterion.key === "perf_5ans")?.winnerIsin).toBe(
      "LU0099574567"
    );
  });

  it("ne garde que les alertes vraiment communes", () => {
    const alerts = sharedFundAlerts(pictetFidelityResponse.results);
    expect(alerts).toEqual(["⚠️ Momentum YTD en décrochage"]);
    const mixed = [
      { ...pictetFidelityResponse.results[0], alerts: ["A", "B"] },
      { ...pictetFidelityResponse.results[1], alerts: ["A"] },
    ];
    expect(sharedFundAlerts(mixed)).toEqual(["A"]);
  });

  it("exclut les alertes propres à un seul fonds du résumé", () => {
    const withSextantAlert: CompareResponse = {
      ...pictetFidelityResponse,
      results: [
        pictetFidelityResponse.results[0],
        {
          ...pictetFidelityResponse.results[1],
          alerts: ["⚠️ Momentum YTD en décrochage", "ℹ️ Efficience négative"],
        },
      ],
    };
    const text = buildUcComparisonNarrative(withSextantAlert);
    expect(text).toContain("Momentum YTD");
    expect(text).not.toContain("Efficience négative");
  });

  it("produit une synthèse lisible avec redistribution top 10", () => {
    const text = buildUcComparisonNarrative(pictetFidelityResponse);
    expect(text).toContain("Pictet - Robotics P EUR");
    expect(text).toContain("redistribué");
    expect(text).toContain("Concentration Top 10");
  });
});
