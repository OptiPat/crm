import { describe, expect, it } from "vitest";
import type { FundWatchlistEntry } from "@/lib/api/tauri-fund-watchlist";
import { buildFundCoachDiagnosticPayload } from "@/lib/fund-watchlist/fund-watchlist-coach-diagnostic-payload";
import {
  buildFundWatchlistDiagnostics,
  type FundDiagnostic,
} from "@/lib/fund-watchlist/fund-watchlist-diagnostic";

function entry(partial: Partial<FundWatchlistEntry>): FundWatchlistEntry {
  return {
    id: 1,
    isin: "FR0000000001",
    nom: "Fonds",
    categorie: "Actions Europe Gdes Cap. Mixte",
    source_label: "test",
    is_favorite: true,
    created_at: 0,
    updated_at: 0,
    ...partial,
  } as FundWatchlistEntry;
}

function diagnostic(partial: Partial<FundDiagnostic>): FundDiagnostic {
  return {
    status: "conserver",
    delta_1an_vs_category: null,
    delta_reference_label: null,
    peer_count: 0,
    volatility_class: "actions",
    trigger_reasons: [],
    context_reasons: [],
    reasons: [],
    short_term_respiration: false,
    ...partial,
  };
}

describe("buildFundCoachDiagnosticPayload", () => {
  it("transmet le statut, l'écart, la référence et les déclencheurs", () => {
    const favorites = [entry({ isin: "A", nom: "A" })];
    const diagnostics = new Map([
      [
        "A",
        diagnostic({
          status: "signal_arbitrage",
          delta_1an_vs_category: -6.2,
          delta_reference_label: "Actions Europe (Boursorama)",
          trigger_reasons: ["Écart vs Actions Europe (Boursorama) 1 an : -6.2 pt"],
          context_reasons: ["Correction 1 mois avec YTD encore solide"],
        }),
      ],
    ]);
    expect(buildFundCoachDiagnosticPayload(favorites, diagnostics)).toEqual([
      {
        isin: "A",
        status: "signal_arbitrage",
        delta_1an_vs_category: -6.2,
        delta_reference_label: "Actions Europe (Boursorama)",
        trigger_reasons: ["Écart vs Actions Europe (Boursorama) 1 an : -6.2 pt"],
        reasons: [],
        // Les nuances du badge suivent le statut : sans elles le coach durcissait son verdict.
        context_reasons: ["Correction 1 mois avec YTD encore solide"],
      },
    ]);
  });

  it("transmet le motif d'abstention d'un fonds sans référence de catégorie", () => {
    const favorites = [entry({ isin: "A", nom: "A", perf_1an: 4 })];
    const diagnostics = buildFundWatchlistDiagnostics(favorites);
    const payload = buildFundCoachDiagnosticPayload(favorites, diagnostics);
    // Sans ce motif, le coach reçoit « données insuffisantes » sans savoir ce qui manque.
    expect(payload[0].status).toBe("inconnu");
    expect(payload[0].reasons.join(" ")).toContain("Pas de référence catégorie");
  });

  it("omet les favoris sans diagnostic plutôt que d'envoyer un statut inventé", () => {
    const favorites = [
      entry({ isin: "A", nom: "A", categorie: "FCPR" }),
      entry({ isin: "B", nom: "B" }),
    ];
    const diagnostics = new Map([["B", diagnostic({ status: "conserver" })]]);
    const payload = buildFundCoachDiagnosticPayload(favorites, diagnostics);
    expect(payload.map((p) => p.isin)).toEqual(["B"]);
  });

  it("n'envoie rien pour un favori exclu du diagnostic (FCPR)", () => {
    const favorites = [entry({ isin: "A", nom: "A", categorie: "FCPR", perf_1an: -20 })];
    const diagnostics = buildFundWatchlistDiagnostics(favorites);
    expect(buildFundCoachDiagnosticPayload(favorites, diagnostics)).toEqual([]);
  });
});
