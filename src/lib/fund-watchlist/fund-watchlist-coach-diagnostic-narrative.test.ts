import { describe, expect, it } from "vitest";
import type { FundWatchlistEntry } from "@/lib/api/tauri-fund-watchlist";
import {
  formatDiagnosticInlineForCoachSection,
  injectDiagnosticIntoCoachReport,
  mergeCoachReportWithDiagnosticNarrative,
} from "@/lib/fund-watchlist/fund-watchlist-coach-diagnostic-narrative";
import { buildFundWatchlistDiagnostics } from "@/lib/fund-watchlist/fund-watchlist-diagnostic";

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
    is_favorite: true,
    created_at: 0,
    updated_at: 0,
    ...partial,
  };
}

describe("fund-watchlist-coach-diagnostic-narrative", () => {
  it("injecte le diagnostic sous l'en-tête fonds", () => {
    const favorites = [
      entry({ isin: "FR0000284689", nom: "Laggard", perf_1an: 5, perf_1mois: -6, perf_3mois: -5 }),
    ];
    const all = [
      entry({ isin: "FR0000000001", nom: "Leader", perf_1an: 20 }),
      entry({ isin: "FR0000000002", nom: "Mid", perf_1an: 18 }),
      ...favorites,
    ];
    const diagnostics = buildFundWatchlistDiagnostics(all);
    const injected = injectDiagnosticIntoCoachReport(
      "FR0000284689 — Laggard\n\n#### Pourquoi le fonds monte ou baisse ?",
      diagnostics
    );
    expect(injected).toContain("**Lecture patrimoniale");
    expect(injected).toContain("FR0000284689 — Laggard");
    expect(injected.indexOf("**Lecture patrimoniale")).toBeGreaterThan(
      injected.indexOf("FR0000284689 — Laggard")
    );
  });

  it("conserve un fonds fort sur 1 an malgré CT négatif (pas de bloc surveillance)", () => {
    const favorites = [
      entry({
        isin: "LU0171296949",
        nom: "US Flexible",
        perf_1an: 25,
        perf_1semaine: -2,
        perf_1mois: -4,
        perf_3mois: -1,
        perf_ytd: 15,
        sharpe_ratio: 0.4,
      }),
    ];
    const all = [
      entry({ isin: "FR0000000001", nom: "Peer A", perf_1an: 10 }),
      entry({ isin: "FR0000000002", nom: "Peer B", perf_1an: 11 }),
      ...favorites,
    ];
    const diagnostics = buildFundWatchlistDiagnostics(all);
    const diagnostic = diagnostics.get("LU0171296949");
    expect(diagnostic?.status).toBe("conserver");
    expect(diagnostic?.short_term_respiration).toBe(true);
    expect(formatDiagnosticInlineForCoachSection(diagnostic!)).toBeNull();
  });

  it("fusionne le rapport Coach avec synthèse et injection sans dupliquer", () => {
    const favorites = [entry({ isin: "FR0000284689", nom: "Weak", perf_1an: 2 })];
    const all = [
      entry({ isin: "FR0000000001", nom: "Leader", perf_1an: 20 }),
      entry({ isin: "FR0000000002", nom: "Mid", perf_1an: 18 }),
      ...favorites,
    ];
    const diagnostics = buildFundWatchlistDiagnostics(all);
    const merged = mergeCoachReportWithDiagnosticNarrative(
      {
        markdown: "FR0000284689 — Weak\n\n## Synthèse\n\nContenu LLM",
        generated_at: 1,
        favorite_count: 1,
        warnings: [],
      },
      favorites,
      diagnostics
    );
    expect(merged.markdown).toContain("## Lecture patrimoniale — favoris");
    expect(merged.markdown).toContain("**Lecture patrimoniale");
    expect(merged.markdown).not.toContain("## Diagnostic favoris");
    const again = mergeCoachReportWithDiagnosticNarrative(merged, favorites, diagnostics);
    expect(again.markdown.match(/\*\*Lecture patrimoniale/g)?.length).toBe(1);
  });
});
