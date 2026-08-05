import { describe, expect, it } from "vitest";
import type { CompareResponse } from "@/lib/api/tauri-uc-comparator";
import {
  buildUcComparisonNarrative,
  effectiveCriterionWeight,
  formatCriterionRawValue,
  formatCriterionWeightLabel,
  formatNonDiscriminantNotice,
  isCriterionDiscriminant,
  nonDiscriminantCriteria,
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
  exposition: [],
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

  it("affiche la valeur brute des critères du barème v2", () => {
    // Sans ces cas, le tableau montrait un score sur trois critères et un tiret à la place
    // de la mesure qui le justifie.
    const metrics = {
      isin: "LU1279334210",
      vol_3ans: 17.42,
      worst_year_perf: -28.6,
      category_rank_avg: 23.4,
    };
    expect(formatCriterionRawValue("vol_3ans", metrics)).toBe("17,4 %");
    expect(formatCriterionRawValue("worst_year", metrics)).toContain("28,6");
    expect(formatCriterionRawValue("rang_categorie", metrics)).toBe("23/100");
    expect(formatCriterionRawValue("vol_3ans", { isin: "X" })).toBe("—");
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

  it("dit si le gagnant bat sa catégorie ou seulement ses concurrents", () => {
    const withAlpha = (alpha: number | null): CompareResponse => ({
      ...pictetFidelityResponse,
      results: [
        { ...pictetFidelityResponse.results[0], category_alpha_avg: alpha },
        pictetFidelityResponse.results[1],
      ],
    });

    expect(buildUcComparisonNarrative(withAlpha(2.4))).toContain(
      "devance sa catégorie de 2.4 point par an"
    );
    const behind = buildUcComparisonNarrative(withAlpha(-3.1));
    expect(behind).toContain("en retard de 3.1 point par an");
    expect(behind).toContain("sans battre son marché");
    // Écart négligeable ou donnée absente : aucune phrase, pas de faux signal.
    expect(buildUcComparisonNarrative(withAlpha(0.1))).not.toContain("sa catégorie de");
    expect(buildUcComparisonNarrative(withAlpha(null))).not.toContain("sa catégorie de");
  });

  it("traite un comparatif archivé sans le champ discriminant comme discriminant", () => {
    for (const criterion of pictetFidelityResponse.criteria) {
      expect(isCriterionDiscriminant(criterion)).toBe(true);
    }
    expect(nonDiscriminantCriteria(pictetFidelityResponse.criteria)).toEqual([]);
    expect(formatNonDiscriminantNotice(pictetFidelityResponse.criteria)).toBeNull();
  });

  it("signale les critères disponibles qui ne départagent pas les fonds", () => {
    const flattened: CompareResponse = {
      ...pictetFidelityResponse,
      criteria: pictetFidelityResponse.criteria.map((c) =>
        c.key === "perf_1an" || c.key === "perf_3ans"
          ? { ...c, scores: [50, 50], discriminant: false }
          : c
      ),
    };

    const flat = nonDiscriminantCriteria(flattened.criteria);
    expect(flat.map((c) => c.key)).toEqual(["perf_1an", "perf_3ans"]);

    const notice = formatNonDiscriminantNotice(flattened.criteria);
    expect(notice).toContain("Perf. 1 an");
    expect(notice).toContain("Perf. 3 ans");
    expect(notice).toContain("24 %");
  });

  it("n'attribue aucun gagnant sur un critère non discriminant", () => {
    const flattened: CompareResponse = {
      ...pictetFidelityResponse,
      criteria: pictetFidelityResponse.criteria.map((c) =>
        c.key === "perf_1an" ? { ...c, scores: [50, 50], discriminant: false } : c
      ),
    };

    const perf1an = resolveCriterionWinners(flattened).find(
      (w) => w.criterion.key === "perf_1an"
    );
    expect(perf1an?.winnerIsin).toBeNull();
    expect(perf1an?.tie).toBe(true);
  });

  it("ignore un critère indisponible dans l'avertissement", () => {
    const notice = formatNonDiscriminantNotice([
      { key: "top10", label: "Concentration Top 10", weight_global: 0.15, scores: [0, 0], available: false },
    ]);
    expect(notice).toBeNull();
  });
});
