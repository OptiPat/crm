import { describe, expect, it } from "vitest";
import type { CompareResponse } from "@/lib/api/tauri-uc-comparator";
import { buildUcTechnicalAnalystNote } from "@/lib/fund-watchlist/uc-comparator-analyst-note";

const pictetEchiquierTieResponse: CompareResponse = {
  comparatif_id: "test-tie",
  scoring_version: "v1",
  confidence_index: 0.85,
  verdict: "TIE",
  winner_isin: null,
  is_category_matched: true,
  category: "Actions Secteur Technologies",
  score_gap: 1.4,
  fund_order: [
    "LU1279334210",
    "LU2466448532",
    "LU0099574567",
    "LU1819480192",
  ],
  criteria: [
    {
      key: "perf_1an",
      label: "Perf. 1 an",
      weight_global: 0.08,
      scores: [100, 0, 40, 6],
      available: true,
    },
    {
      key: "perf_3ans",
      label: "Perf. 3 ans",
      weight_global: 0.16,
      scores: [14, 100, 0, 37],
      available: true,
    },
    {
      key: "perf_5ans",
      label: "Perf. 5 ans",
      weight_global: 0.16,
      scores: [82, 64, 100, 0],
      available: true,
    },
    {
      key: "sharpe_3y",
      label: "Sharpe 3 ans",
      weight_global: 0.45,
      scores: [95, 88, 92, 100],
      available: true,
    },
    {
      key: "top10",
      label: "Concentration Top 10",
      weight_global: 0.15,
      scores: [48, 37, 50, 35],
      available: true,
    },
  ],
  metrics: [
    {
      isin: "LU1279334210",
      perf_1an: 28.6,
      perf_3ans: 74.4,
      perf_5ans: 78.3,
      sharpe_3y: 1.23,
      top10_percent: 45.7,
    },
    {
      isin: "LU2466448532",
      perf_1an: 14.4,
      perf_3ans: 119.3,
      perf_5ans: 67.5,
      sharpe_3y: 1.15,
      top10_percent: 48.8,
    },
    {
      isin: "LU0099574567",
      perf_1an: 20,
      perf_3ans: 67,
      perf_5ans: 88.9,
      sharpe_3y: 1.2,
      top10_percent: 45.1,
    },
    {
      isin: "LU1819480192",
      perf_1an: 15.3,
      perf_3ans: 86.2,
      perf_5ans: 28.8,
      sharpe_3y: 1.3,
      top10_percent: 49.5,
    },
  ],
  exposition: [
    {
      isin: "LU1279334210",
      geo: [
        { label: "Etats-Unis", weight_percent: 72.3 },
        { label: "Allemagne", weight_percent: 6.4 },
      ],
      sectors: [
        { label: "Technologie", weight_percent: 83.7 },
        { label: "Santé", weight_percent: 4.8 },
      ],
      style_box: { cap: "large_cap", style: "growth", label_fr: "Grandes cap. / Croissance" },
      complete: true,
    },
    {
      isin: "LU2466448532",
      geo: [
        { label: "Etats-Unis", weight_percent: 65.7 },
        { label: "France", weight_percent: 6.1 },
      ],
      sectors: [
        { label: "Industriels", weight_percent: 60.3 },
        { label: "Technologie", weight_percent: 25 },
      ],
      style_box: { cap: "mid_cap", style: "growth", label_fr: "Moyennes cap. / Croissance" },
      complete: true,
    },
    {
      isin: "LU1819480192",
      geo: [
        { label: "Etats-Unis", weight_percent: 68.8 },
        { label: "Corée du Sud", weight_percent: 11.1 },
        { label: "Taiwan", weight_percent: 10.3 },
      ],
      sectors: [{ label: "Technologie", weight_percent: 76.6 }],
      style_box: { cap: "large_cap", style: "growth", label_fr: "Grandes cap. / Croissance" },
      complete: true,
    },
  ],
  results: [
    {
      isin: "LU1279334210",
      nom: "Pictet - Robotics P EUR",
      rank: 1,
      score_relative_total: 73.1,
      pilier_scores: {},
      criterion_scores: [],
      alerts: [],
    },
    {
      isin: "LU2466448532",
      nom: "Echiquier Space B",
      rank: 2,
      score_relative_total: 71.7,
      pilier_scores: {},
      criterion_scores: [],
      alerts: [],
    },
    {
      isin: "LU0099574567",
      nom: "Fidelity Funds - Global Technology Fund A-DIST-EUR",
      rank: 3,
      score_relative_total: 68.2,
      pilier_scores: {},
      criterion_scores: [],
      alerts: [],
    },
    {
      isin: "LU1819480192",
      nom: "Echiquier Artificial Intelligence B EUR",
      rank: 4,
      score_relative_total: 56.6,
      pilier_scores: {},
      criterion_scores: [],
      alerts: [],
    },
  ],
  raw_json_payload: "",
};

describe("uc-comparator-analyst-note", () => {
  it("produit une note structurée en 3 sections pour une égalité technique", () => {
    const note = buildUcTechnicalAnalystNote(pictetEchiquierTieResponse);
    expect(note?.sections).toHaveLength(3);
    const text = note?.sections.flatMap((s) => s.paragraphs).join(" ") ?? "";
    expect(text).toContain("Égalité technique");
    expect(text).toContain("Pictet - Robotics");
    expect(text).toContain("Echiquier Space");
    expect(text).toContain("Industriel");
    expect(text).toMatch(/fausse corrélation/i);
    expect(text).toContain("Arbitrage non automatique");
  });

  it("mentionne l'exposition Asie des fonds hors du duo d'égalité", () => {
    const note = buildUcTechnicalAnalystNote(pictetEchiquierTieResponse);
    const exposure = note?.sections[1].paragraphs.join(" ") ?? "";
    expect(exposure).toMatch(/Corée|Taiwan|Asie/i);
  });

  it("adapte la section 1 pour un gagnant déclaré", () => {
    const note = buildUcTechnicalAnalystNote({
      ...pictetEchiquierTieResponse,
      verdict: "WINNER_DECLARED",
      winner_isin: "LU1279334210",
      score_gap: 8.8,
    });
    const verdict = note?.sections[0].paragraphs.join(" ") ?? "";
    expect(verdict).toContain("désigné");
    expect(verdict).not.toContain("Égalité technique");
  });

  it("signale le secteur qu'un seul fonds porte, même s'il est dernier du classement", () => {
    // Trois fonds « or » : tous ont « Matières premières de base » en secteur dominant, donc la
    // détection par secteur dominant restait muette sur le tiers d'énergie du troisième.
    const goldResponse: CompareResponse = {
      ...pictetEchiquierTieResponse,
      verdict: "WINNER_DECLARED",
      winner_isin: "FR0007390174",
      category: "Actions Secteur Ressources Naturelles & Métaux Précieux",
      score_gap: 2.4,
      fund_order: ["FR0007390174", "FR0010664086", "FR0010011171"],
      metrics: [],
      exposition: [
        {
          isin: "FR0007390174",
          geo: [{ label: "Canada", weight_percent: 65.7 }],
          sectors: [{ label: "Matières premières de base", weight_percent: 85.8 }],
          style_box: { cap: "mid_cap", style: "growth", label_fr: "Moyennes cap. / Croissance" },
          complete: true,
        },
        {
          isin: "FR0010664086",
          geo: [{ label: "Canada", weight_percent: 74.6 }],
          sectors: [{ label: "Matières premières de base", weight_percent: 99.2 }],
          style_box: { cap: "mid_cap", style: "growth", label_fr: "Moyennes cap. / Croissance" },
          complete: true,
        },
        {
          isin: "FR0010011171",
          geo: [{ label: "Canada", weight_percent: 39.7 }],
          sectors: [
            { label: "Matières premières de base", weight_percent: 65.8 },
            { label: "Énergie", weight_percent: 33.7 },
          ],
          style_box: null,
          complete: true,
        },
      ],
      results: [
        { ...pictetEchiquierTieResponse.results[0], isin: "FR0007390174", nom: "CM-AM Global Gold RC", rank: 1 },
        { ...pictetEchiquierTieResponse.results[1], isin: "FR0010664086", nom: "EdR Goldsphere A EUR", rank: 2 },
        { ...pictetEchiquierTieResponse.results[2], isin: "FR0010011171", nom: "AXA Or et Matières Premières C", rank: 3 },
      ],
    };

    const exposure =
      buildUcTechnicalAnalystNote(goldResponse)?.sections[1].paragraphs.join(" ") ?? "";
    expect(exposure).toContain("Divergence sectorielle");
    expect(exposure).toContain("AXA Or et Matières Premières C porte 33.7 % Énergie");
    // Le secteur commun aux trois ne doit pas produire de fausse divergence.
    expect(exposure).not.toContain("porte 99.2 %");
  });

  it("signale la zone qu'un seul fonds porte, que le cumul Asie masquait", () => {
    // Famille « Asie / Japon » : elle réunit volontairement « avec Japon » et « hors Japon ».
    // Le cumul Asie affichait 72,6 % et 74,6 %, deux profils presque identiques en apparence,
    // alors qu'un seul des deux fonds détient du Japon.
    const asiaResponse: CompareResponse = {
      ...pictetEchiquierTieResponse,
      verdict: "WINNER_DECLARED",
      winner_isin: "LU1670618187",
      category: "Actions Asie / Japon",
      fund_order: ["LU1670618187", "LU0368678339"],
      metrics: [],
      exposition: [
        {
          isin: "LU1670618187",
          geo: [
            { label: "Corée du Sud", weight_percent: 24.1 },
            { label: "Chine", weight_percent: 21.7 },
          ],
          sectors: [{ label: "Technologie", weight_percent: 35.5 }],
          style_box: { cap: "large_cap", style: "blend", label_fr: "Grandes cap. / Mixte" },
          complete: true,
        },
        {
          isin: "LU0368678339",
          geo: [
            { label: "Japon", weight_percent: 21.2 },
            { label: "Corée du Sud", weight_percent: 20.3 },
          ],
          sectors: [{ label: "Technologie", weight_percent: 35.5 }],
          style_box: { cap: "large_cap", style: "blend", label_fr: "Grandes cap. / Mixte" },
          complete: true,
        },
      ],
      results: [
        { ...pictetEchiquierTieResponse.results[0], isin: "LU1670618187", nom: "M&G Asian Fund", rank: 1 },
        { ...pictetEchiquierTieResponse.results[1], isin: "LU0368678339", nom: "Fidelity Pacific", rank: 2 },
      ],
    };

    const exposure =
      buildUcTechnicalAnalystNote(asiaResponse)?.sections[1].paragraphs.join(" ") ?? "";
    expect(exposure).toContain("Divergence géographique");
    expect(exposure).toContain("Fidelity Pacific porte 21.2 % Japon");
    // La Corée est détenue par les deux : ce n'est pas une divergence.
    expect(exposure).not.toContain("Corée du Sud,");
  });

  it("adapte la recommandation pour données insuffisantes", () => {
    const note = buildUcTechnicalAnalystNote({
      ...pictetEchiquierTieResponse,
      verdict: "INSUFFICIENT_DATA",
      confidence_index: 0.55,
      criteria: pictetEchiquierTieResponse.criteria.map((c) =>
        c.key === "perf_3ans" || c.key === "perf_5ans"
          ? { ...c, available: false, scores: [0, 0, 0, 0] }
          : c
      ),
    });
    const arb = note?.sections[2].paragraphs.join(" ") ?? "";
    expect(arb).toContain("compléter");
  });
});
