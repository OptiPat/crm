import { describe, expect, it } from "vitest";
import type { FundWatchlistEntry } from "@/lib/api/tauri-fund-watchlist";
import {
  buildFundWatchlistDiagnostics,
  computeFundDiagnostic,
  sortEntriesByDiagnosticPriority,
} from "@/lib/fund-watchlist/fund-watchlist-diagnostic";

function entry(
  partial: Partial<FundWatchlistEntry> & Pick<FundWatchlistEntry, "isin" | "nom">
): FundWatchlistEntry {
  return {
    id: 1,
    categorie: "Actions Europe",
    sri: null,
    notation_morningstar: null,
    vl_previous: null,
    vl_recent: null,
    vl_date: null,
    perf_ytd: 5,
    perf_1semaine: 1,
    perf_1mois: 2,
    perf_3mois: 4,
    perf_1an: 10,
    perf_3ans: 20,
    perf_5ans: 30,
    vol_5ans: null,
    vol_3ans: null,
    vol_1an: null,
    sharpe_ratio: 0.5,
    perf_annual: {},
    frais_gestion: null,
    sfdr: null,
    source_label: "test",
    is_favorite: false,
    created_at: 0,
    updated_at: 0,
    ...partial,
  };
}

describe("fund-watchlist-diagnostic", () => {
  it("marque inconnu sans catégorie ou perf 1 an", () => {
    const all = [entry({ isin: "A", nom: "A", categorie: null })];
    expect(computeFundDiagnostic(all[0], all).status).toBe("inconnu");
    const all2 = [entry({ isin: "B", nom: "B", perf_1an: null })];
    expect(computeFundDiagnostic(all2[0], all2).status).toBe("inconnu");
  });

  it("conserve un fonds proche de la médiane catégorie", () => {
    const all = [
      entry({ isin: "A", nom: "A", perf_1an: 10 }),
      entry({ isin: "B", nom: "B", perf_1an: 11 }),
      entry({ isin: "C", nom: "C", perf_1an: 9 }),
    ];
    expect(computeFundDiagnostic(all[0], all).status).toBe("conserver");
  });

  it("passe en surveillance si écart catégorie <= -2 pt", () => {
    const all = [
      entry({ isin: "A", nom: "Leader", perf_1an: 20 }),
      entry({ isin: "B", nom: "Mid", perf_1an: 15 }),
      entry({ isin: "C", nom: "Laggard", perf_1an: 5 }),
    ];
    const diag = computeFundDiagnostic(all[2], all);
    expect(diag.status).toBe("sous_surveillance");
    expect(diag.delta_1an_vs_category).toBeLessThanOrEqual(-2);
  });

  it("signale arbitrage si écart fort et faiblesse multi-horizons", () => {
    const all = [
      entry({ isin: "A", nom: "Leader", perf_1an: 25 }),
      entry({ isin: "B", nom: "Mid", perf_1an: 20 }),
      entry({
        isin: "C",
        nom: "Laggard",
        perf_1an: -2,
        perf_1mois: -6,
        perf_3mois: -5,
        perf_ytd: -4,
        sharpe_ratio: -0.2,
      }),
    ];
    expect(computeFundDiagnostic(all[2], all).status).toBe("signal_arbitrage");
  });

  it("compte 3 ans et 5 ans dans la faiblesse multi-horizons", () => {
    const all = [
      entry({ isin: "A", nom: "Leader", perf_1an: 20 }),
      entry({ isin: "B", nom: "Mid", perf_1an: 18 }),
      entry({
        isin: "C",
        nom: "Long weak",
        perf_1an: 16,
        perf_3ans: -8,
        perf_5ans: -6,
        perf_1mois: 1,
        perf_3mois: 2,
        perf_ytd: 3,
      }),
    ];
    const diag = computeFundDiagnostic(all[2], all);
    expect(diag.status).toBe("sous_surveillance");
    expect(diag.reasons.some((r) => r.includes("3 ans"))).toBe(true);
  });

  it("recalcule le statut quand un pair améliore la médiane", () => {
    const weak = entry({ isin: "W", nom: "Weak", perf_1an: 5 });
    const peers = [
      entry({ isin: "A", nom: "A", perf_1an: 20 }),
      entry({ isin: "B", nom: "B", perf_1an: 18 }),
      weak,
    ];
    expect(computeFundDiagnostic(weak, peers).status).toBe("sous_surveillance");

    const peersAfter = [
      ...peers,
      entry({ isin: "D", nom: "D", perf_1an: 4 }),
      entry({ isin: "E", nom: "E", perf_1an: 3 }),
    ];
    const after = computeFundDiagnostic(weak, peersAfter);
    expect(after.status).not.toBe("signal_arbitrage");
  });

  it("trie par priorité diagnostic", () => {
    const all = [
      entry({ isin: "OK", nom: "OK", perf_1an: 15 }),
      entry({ isin: "A", nom: "A", perf_1an: 20 }),
      entry({ isin: "B", nom: "B", perf_1an: 18 }),
      entry({ isin: "BAD", nom: "BAD", perf_1an: -5, perf_1mois: -8, perf_3mois: -6, perf_ytd: -5 }),
    ];
    const diagnostics = buildFundWatchlistDiagnostics(all);
    const sorted = sortEntriesByDiagnosticPriority(all, diagnostics);
    expect(sorted[0].isin).toBe("BAD");
  });

  it("utilise la catégorie Boursorama pour le delta 1 an quand disponible", () => {
    const all = [
      entry({ isin: "A", nom: "Leader", perf_1an: 20 }),
      entry({ isin: "B", nom: "Mid", perf_1an: 18 }),
      entry({ isin: "C", nom: "Fund", perf_1an: 5 }),
    ];
    const diag = computeFundDiagnostic(all[2], all, {
      category_perf_1an: 12,
      label: "Catégorie Boursorama",
    });
    expect(diag.delta_1an_vs_category).toBe(-7);
    expect(diag.delta_reference_label).toBe("Catégorie Boursorama");
  });

  it("applique des seuils plus serrés pour les obligations", () => {
    const all = [
      entry({ isin: "A", nom: "Leader", categorie: "Obligations Euro", perf_1an: 5 }),
      entry({ isin: "B", nom: "Mid", categorie: "Obligations Euro", perf_1an: 4.5 }),
      entry({ isin: "C", nom: "Laggard", categorie: "Obligations Euro", perf_1an: 3.5 }),
    ];
    const diag = computeFundDiagnostic(all[2], all);
    expect(diag.volatility_class).toBe("rates");
    expect(diag.status).toBe("sous_surveillance");
    // Médiane des deux vrais pairs (5 et 4,5) = 4,75 : le fonds observé n'entre plus dans le calcul.
    expect(diag.delta_1an_vs_category).toBe(-1.2);
  });

  it("regroupe les pairs par méta-catégorie", () => {
    const all = [
      entry({ isin: "A", nom: "Asia 1", categorie: "Actions Asie Pacifique", perf_1an: 20 }),
      entry({ isin: "B", nom: "Asia 2", categorie: "Actions Marchés Emergents Asie", perf_1an: 18 }),
      entry({ isin: "C", nom: "Laggard", categorie: "Actions Asie Discovery", perf_1an: 8 }),
    ];
    const diag = computeFundDiagnostic(all[2], all);
    expect(diag.peer_count).toBe(2);
    expect(diag.status).toBe("sous_surveillance");
  });

  it("ne se compare pas à lui-même quand il est seul dans sa catégorie", () => {
    const all = [entry({ isin: "SOLO", nom: "Solo", categorie: "Actions Inde", perf_1an: 10 })];
    const diag = computeFundDiagnostic(all[0], all);
    expect(diag.status).toBe("inconnu");
    expect(diag.peer_count).toBe(0);
    expect(diag.delta_1an_vs_category).toBeNull();
    expect(diag.delta_reference_label).toBeNull();
    expect(diag.reasons.join(" ")).toContain("Pas de référence catégorie");
  });

  it("refuse la médiane watchlist avec un seul pair", () => {
    const all = [
      entry({ isin: "A", nom: "A", categorie: "Actions Inde", perf_1an: 10 }),
      entry({ isin: "B", nom: "B", categorie: "Actions Inde", perf_1an: 30 }),
    ];
    const diag = computeFundDiagnostic(all[0], all);
    expect(diag.status).toBe("inconnu");
    expect(diag.peer_count).toBe(1);
  });

  it("utilise la référence Boursorama même sans pair dans la watchlist", () => {
    const all = [entry({ isin: "SOLO", nom: "Solo", categorie: "Actions Inde", perf_1an: 10 })];
    const diag = computeFundDiagnostic(all[0], all, {
      category_perf_1an: 18,
      label: "Catégorie Boursorama",
    });
    expect(diag.status).not.toBe("inconnu");
    expect(diag.delta_1an_vs_category).toBe(-8);
    expect(diag.peer_count).toBe(0);
  });

  it("annonce un Δ nul au niveau de la référence, sans « légèrement sous »", () => {
    const all = [
      entry({ isin: "A", nom: "A", perf_1an: 12 }),
      entry({ isin: "B", nom: "B", perf_1an: 8 }),
      entry({ isin: "C", nom: "Pile", perf_1an: 10 }),
    ];
    const diag = computeFundDiagnostic(all[2], all);
    expect(diag.delta_1an_vs_category).toBe(0);
    expect(diag.context_reasons).toContain("1 an au niveau de la référence");
    expect(diag.context_reasons.some((r) => r.includes("Légèrement sous"))).toBe(false);
  });

  it("n'affiche pas « au-dessus » pour un léger écart négatif sous le seuil", () => {
    const all = [
      entry({ isin: "A", nom: "Peer A", categorie: "Fonds diversifié", perf_1an: 10 }),
      entry({ isin: "B", nom: "Peer B", categorie: "Fonds diversifié", perf_1an: 11 }),
      entry({
        isin: "C",
        nom: "Near",
        categorie: "Fonds diversifié",
        perf_1an: 10.3,
        perf_1semaine: 1,
        perf_1mois: 1,
        perf_3mois: 1,
        perf_ytd: 1,
      }),
    ];
    const diag = computeFundDiagnostic(all[2], all);
    expect(diag.context_reasons.some((r) => r.includes("au-dessus"))).toBe(false);
    expect(diag.context_reasons.some((r) => r.includes("Légèrement sous"))).toBe(true);
  });

  it("conserve avec score CT négatif seul (respiration court terme, option B)", () => {
    const all = [
      entry({ isin: "A", nom: "Peer A", perf_1an: 20 }),
      entry({ isin: "B", nom: "Peer B", perf_1an: 18 }),
      entry({
        isin: "C",
        nom: "Strong year",
        perf_1an: 25,
        perf_1semaine: -2,
        perf_1mois: -4,
        perf_3mois: 2,
        perf_ytd: 15,
        sharpe_ratio: 0.4,
      }),
    ];
    const diag = computeFundDiagnostic(all[2], all);
    expect(diag.status).toBe("conserver");
    expect(diag.short_term_respiration).toBe(true);
    expect(diag.trigger_reasons).toHaveLength(0);
    expect(diag.context_reasons).toContain("Respiration court terme (score CT négatif)");
  });

  it("conserve si Sharpe ≤ 0 seul (amplificateur, pas déclencheur)", () => {
    const all = [
      entry({ isin: "A", nom: "Peer A", perf_1an: 20 }),
      entry({ isin: "B", nom: "Peer B", perf_1an: 18 }),
      entry({
        isin: "C",
        nom: "Low sharpe",
        perf_1an: 22,
        sharpe_ratio: -0.3,
      }),
    ];
    const diag = computeFundDiagnostic(all[2], all);
    expect(diag.status).toBe("conserver");
    expect(diag.trigger_reasons).not.toContain("Sharpe ≤ 0");
  });

  it("ajoute Sharpe en amplificateur si déjà sous surveillance", () => {
    const all = [
      entry({ isin: "A", nom: "Leader", perf_1an: 20 }),
      entry({ isin: "B", nom: "Mid", perf_1an: 15 }),
      entry({
        isin: "C",
        nom: "Laggard",
        perf_1an: 5,
        sharpe_ratio: -0.2,
      }),
    ];
    const diag = computeFundDiagnostic(all[2], all);
    expect(diag.status).toBe("sous_surveillance");
    expect(diag.trigger_reasons.some((r) => r.includes("Écart vs"))).toBe(true);
    expect(diag.trigger_reasons).toContain("Sharpe ≤ 0");
  });
});
