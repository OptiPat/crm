import { describe, expect, it } from "vitest";
import type { FundWatchlistEntry } from "@/lib/api/tauri-fund-watchlist";
import {
  buildFundWatchlistDiagnostics,
  computeFundDiagnostic,
  FUND_DIAGNOSTIC_MIN_PEERS,
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

/**
 * Watchlist d'un scénario : le fonds observé et ses pairs, ces derniers dupliqués pour atteindre
 * FUND_DIAGNOSTIC_MIN_PEERS. Doubler un ensemble ne déplace pas sa médiane, seul le nombre de
 * pairs change — les écarts vérifiés par chaque test restent donc ceux écrits en clair ici.
 */
function watchlist(
  target: FundWatchlistEntry,
  peers: FundWatchlistEntry[]
): FundWatchlistEntry[] {
  const clones = peers.map((peer) => ({ ...peer, isin: `${peer.isin}-bis` }));
  return [target, ...peers, ...clones];
}

describe("fund-watchlist-diagnostic", () => {
  it("marque inconnu sans catégorie ou perf 1 an", () => {
    const all = [entry({ isin: "A", nom: "A", categorie: null })];
    expect(computeFundDiagnostic(all[0], all).status).toBe("inconnu");
    const all2 = [entry({ isin: "B", nom: "B", perf_1an: null })];
    expect(computeFundDiagnostic(all2[0], all2).status).toBe("inconnu");
  });

  it("conserve un fonds proche de la médiane catégorie", () => {
    const target = entry({ isin: "A", nom: "A", perf_1an: 10 });
    const all = watchlist(target, [
      entry({ isin: "B", nom: "B", perf_1an: 11 }),
      entry({ isin: "C", nom: "C", perf_1an: 9 }),
    ]);
    expect(computeFundDiagnostic(target, all).status).toBe("conserver");
  });

  it("n'attribue aucun diagnostic à une catégorie exclue", () => {
    const all = [
      entry({ isin: "A", nom: "A", categorie: "FCPR", perf_1an: -20 }),
      entry({ isin: "B", nom: "B", categorie: "FCPR", perf_1an: 5 }),
      entry({ isin: "C", nom: "C", categorie: "FCPR", perf_1an: 6 }),
      entry({ isin: "D", nom: "D", perf_1an: 10 }),
    ];
    const diagnostics = buildFundWatchlistDiagnostics(all);
    expect(diagnostics.has("A")).toBe(false);
    expect(diagnostics.has("B")).toBe(false);
    expect(diagnostics.has("D")).toBe(true);
  });

  it("resserre les seuils d'un fonds peu volatil, à écart identique", () => {
    const peers = [
      entry({ isin: "B", nom: "B", perf_1an: 10 }),
      entry({ isin: "C", nom: "C", perf_1an: 10 }),
    ];
    // 1 point sous la médiane : anodin pour un fonds actions…
    const equity = entry({ isin: "A", nom: "A", perf_1an: 9 });
    expect(computeFundDiagnostic(equity, watchlist(equity, peers)).status).toBe("conserver");
    // …mais significatif pour un fonds dont la volatilité mesurée est de 2 %.
    const lowVol = entry({ isin: "A", nom: "A", perf_1an: 9, vol_3ans: 2 });
    const diag = computeFundDiagnostic(lowVol, watchlist(lowVol, peers));
    expect(diag.status).toBe("sous_surveillance");
    expect(diag.volatility_class).toBe("rates");
  });

  it("indexe le seuil de faiblesse absolue sur la volatilité du fonds", () => {
    const peers = [
      entry({ isin: "B", nom: "B", perf_1an: 10 }),
      entry({ isin: "C", nom: "C", perf_1an: 10 }),
    ];
    // −4 % sur deux horizons : bruit ordinaire pour un fonds actions…
    const equity = entry({
      isin: "A",
      nom: "A",
      perf_1an: 9.5,
      perf_1mois: -4,
      perf_3mois: -4,
    });
    expect(computeFundDiagnostic(equity, watchlist(equity, peers)).status).toBe("conserver");
    // …accident pour un fonds dont la volatilité mesurée est de 2 %.
    const lowVol = entry({
      isin: "A",
      nom: "A",
      perf_1an: 9.5,
      perf_1mois: -4,
      perf_3mois: -4,
      vol_3ans: 2,
    });
    const diag = computeFundDiagnostic(lowVol, watchlist(lowVol, peers));
    expect(diag.status).toBe("sous_surveillance");
    expect(diag.trigger_reasons.some((r) => r.includes("Faiblesse sur 2 horizons"))).toBe(true);
  });

  it("laisse en conserver un fonds en recul mais devant sa référence", () => {
    const target = entry({
      isin: "C",
      nom: "Devant",
      perf_1an: 20,
      perf_1mois: -8,
      perf_3mois: -7,
      perf_ytd: 12,
    });
    const all = watchlist(target, [
      entry({ isin: "A", nom: "A", perf_1an: 10 }),
      entry({ isin: "B", nom: "B", perf_1an: 10 }),
    ]);
    const diag = computeFundDiagnostic(target, all);
    // Le marché recule, pas le fonds : le signaler diluerait les vraies alertes.
    expect(diag.status).toBe("conserver");
    expect(diag.trigger_reasons).toHaveLength(0);
    expect(diag.context_reasons.some((r) => r.includes("au-dessus de sa référence"))).toBe(true);
    expect(diag.context_reasons).toContain("Correction 1 mois avec YTD encore solide");
  });

  it("passe en surveillance si écart catégorie <= -2 pt", () => {
    const target = entry({ isin: "C", nom: "Laggard", perf_1an: 5 });
    const all = watchlist(target, [
      entry({ isin: "A", nom: "Leader", perf_1an: 20 }),
      entry({ isin: "B", nom: "Mid", perf_1an: 15 }),
    ]);
    const diag = computeFundDiagnostic(target, all);
    expect(diag.status).toBe("sous_surveillance");
    expect(diag.delta_1an_vs_category).toBeLessThanOrEqual(-2);
  });

  it("signale arbitrage si écart fort et faiblesse multi-horizons", () => {
    const target = entry({
      isin: "C",
      nom: "Laggard",
      perf_1an: -2,
      perf_1mois: -6,
      perf_3mois: -5,
      perf_ytd: -4,
      sharpe_ratio: -0.2,
    });
    const all = watchlist(target, [
      entry({ isin: "A", nom: "Leader", perf_1an: 25 }),
      entry({ isin: "B", nom: "Mid", perf_1an: 20 }),
    ]);
    expect(computeFundDiagnostic(target, all).status).toBe("signal_arbitrage");
  });

  it("compte 3 ans et 5 ans dans la faiblesse multi-horizons", () => {
    const target = entry({
      isin: "C",
      nom: "Long weak",
      perf_1an: 16,
      perf_3ans: -8,
      perf_5ans: -6,
      perf_1mois: 1,
      perf_3mois: 2,
      perf_ytd: 3,
    });
    const all = watchlist(target, [
      entry({ isin: "A", nom: "Leader", perf_1an: 20 }),
      entry({ isin: "B", nom: "Mid", perf_1an: 18 }),
    ]);
    const diag = computeFundDiagnostic(target, all);
    expect(diag.status).toBe("sous_surveillance");
    expect(diag.reasons.some((r) => r.includes("3 ans"))).toBe(true);
  });

  it("recalcule le statut quand un pair améliore la médiane", () => {
    const weak = entry({ isin: "W", nom: "Weak", perf_1an: 5 });
    const leaders = [
      entry({ isin: "A", nom: "A", perf_1an: 20 }),
      entry({ isin: "B", nom: "B", perf_1an: 18 }),
    ];
    expect(computeFundDiagnostic(weak, watchlist(weak, leaders)).status).toBe("sous_surveillance");

    const peersAfter = [
      weak,
      ...leaders,
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
      entry({ isin: "C", nom: "C", perf_1an: 19 }),
      entry({ isin: "D", nom: "D", perf_1an: 17 }),
      entry({
        isin: "BAD",
        nom: "BAD",
        perf_1an: -5,
        perf_1mois: -8,
        perf_3mois: -6,
        perf_ytd: -5,
      }),
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
    const target = entry({
      isin: "C",
      nom: "Laggard",
      categorie: "Obligations Euro",
      perf_1an: 3.5,
    });
    const all = watchlist(target, [
      entry({ isin: "A", nom: "Leader", categorie: "Obligations Euro", perf_1an: 5 }),
      entry({ isin: "B", nom: "Mid", categorie: "Obligations Euro", perf_1an: 4.5 }),
    ]);
    const diag = computeFundDiagnostic(target, all);
    expect(diag.volatility_class).toBe("rates");
    expect(diag.status).toBe("sous_surveillance");
    // Médiane des vrais pairs (5 et 4,5) = 4,75 : le fonds observé n'entre plus dans le calcul.
    expect(diag.delta_1an_vs_category).toBe(-1.2);
  });

  it("regroupe les pairs par méta-catégorie", () => {
    const target = entry({
      isin: "C",
      nom: "Laggard",
      categorie: "Actions Asie Discovery",
      perf_1an: 8,
    });
    const all = watchlist(target, [
      entry({ isin: "A", nom: "Asia 1", categorie: "Actions Asie Pacifique", perf_1an: 20 }),
      entry({
        isin: "B",
        nom: "Asia 2",
        categorie: "Actions Marchés Emergents Asie",
        perf_1an: 18,
      }),
    ]);
    const diag = computeFundDiagnostic(target, all);
    expect(diag.peer_count).toBe(4);
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

  it("refuse la médiane watchlist sous le minimum de pairs", () => {
    const peers = Array.from({ length: FUND_DIAGNOSTIC_MIN_PEERS }, (_, i) =>
      entry({ isin: `P${i}`, nom: `P${i}`, categorie: "Actions Inde", perf_1an: 30 })
    );
    const target = entry({ isin: "A", nom: "A", categorie: "Actions Inde", perf_1an: 10 });

    // Un pair de moins que le minimum : mieux vaut ne rien dire qu'annoncer un écart fragile.
    const tooFew = computeFundDiagnostic(target, [target, ...peers.slice(0, -1)]);
    expect(tooFew.status).toBe("inconnu");
    expect(tooFew.delta_1an_vs_category).toBeNull();

    const enough = computeFundDiagnostic(target, [target, ...peers]);
    expect(enough.status).not.toBe("inconnu");
    expect(enough.peer_count).toBe(FUND_DIAGNOSTIC_MIN_PEERS);
  });

  it("annonce le nombre de fonds derrière la médiane watchlist", () => {
    const target = entry({ isin: "A", nom: "A", perf_1an: 4 });
    const all = watchlist(target, [
      entry({ isin: "B", nom: "B", perf_1an: 20 }),
      entry({ isin: "C", nom: "C", perf_1an: 18 }),
      entry({ isin: "D", nom: "D", perf_1an: 19 }),
    ]);
    const diag = computeFundDiagnostic(target, all);
    // Le lecteur doit pouvoir juger du poids de l'écart : 6 pairs ou 4, ce n'est pas la même chose.
    expect(diag.delta_reference_label).toBe("médiane catégorie (watchlist, 6 fonds)");
    expect(diag.trigger_reasons.some((r) => r.includes("watchlist, 6 fonds"))).toBe(true);
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
    const target = entry({ isin: "C", nom: "Pile", perf_1an: 10 });
    const all = watchlist(target, [
      entry({ isin: "A", nom: "A", perf_1an: 12 }),
      entry({ isin: "B", nom: "B", perf_1an: 8 }),
    ]);
    const diag = computeFundDiagnostic(target, all);
    expect(diag.delta_1an_vs_category).toBe(0);
    expect(diag.context_reasons).toContain("1 an au niveau de la référence");
    expect(diag.context_reasons.some((r) => r.includes("Légèrement sous"))).toBe(false);
  });

  it("n'affiche pas « au-dessus » pour un léger écart négatif sous le seuil", () => {
    const target = entry({
      isin: "C",
      nom: "Near",
      categorie: "Fonds diversifié",
      perf_1an: 10.3,
      perf_1semaine: 1,
      perf_1mois: 1,
      perf_3mois: 1,
      perf_ytd: 1,
    });
    const all = watchlist(target, [
      entry({ isin: "A", nom: "Peer A", categorie: "Fonds diversifié", perf_1an: 10 }),
      entry({ isin: "B", nom: "Peer B", categorie: "Fonds diversifié", perf_1an: 11 }),
    ]);
    const diag = computeFundDiagnostic(target, all);
    expect(diag.context_reasons.some((r) => r.includes("au-dessus"))).toBe(false);
    expect(diag.context_reasons.some((r) => r.includes("Légèrement sous"))).toBe(true);
  });

  it("conserve avec score CT négatif seul (respiration court terme, option B)", () => {
    const target = entry({
      isin: "C",
      nom: "Strong year",
      perf_1an: 25,
      perf_1semaine: -2,
      perf_1mois: -4,
      perf_3mois: 2,
      perf_ytd: 15,
      sharpe_ratio: 0.4,
    });
    const all = watchlist(target, [
      entry({ isin: "A", nom: "Peer A", perf_1an: 20 }),
      entry({ isin: "B", nom: "Peer B", perf_1an: 18 }),
    ]);
    const diag = computeFundDiagnostic(target, all);
    expect(diag.status).toBe("conserver");
    expect(diag.short_term_respiration).toBe(true);
    expect(diag.trigger_reasons).toHaveLength(0);
    expect(diag.context_reasons).toContain("Respiration court terme (score CT négatif)");
  });

  it("conserve si Sharpe ≤ 0 seul (amplificateur, pas déclencheur)", () => {
    const target = entry({ isin: "C", nom: "Low sharpe", perf_1an: 22, sharpe_ratio: -0.3 });
    const all = watchlist(target, [
      entry({ isin: "A", nom: "Peer A", perf_1an: 20 }),
      entry({ isin: "B", nom: "Peer B", perf_1an: 18 }),
    ]);
    const diag = computeFundDiagnostic(target, all);
    expect(diag.status).toBe("conserver");
    expect(diag.trigger_reasons).not.toContain("Sharpe ≤ 0");
  });

  it("ajoute Sharpe en amplificateur si déjà sous surveillance", () => {
    const target = entry({ isin: "C", nom: "Laggard", perf_1an: 5, sharpe_ratio: -0.2 });
    const all = watchlist(target, [
      entry({ isin: "A", nom: "Leader", perf_1an: 20 }),
      entry({ isin: "B", nom: "Mid", perf_1an: 15 }),
    ]);
    const diag = computeFundDiagnostic(target, all);
    expect(diag.status).toBe("sous_surveillance");
    expect(diag.trigger_reasons.some((r) => r.includes("Écart vs"))).toBe(true);
    expect(diag.trigger_reasons).toContain("Sharpe ≤ 0");
  });
});
