import { describe, expect, it } from "vitest";
import {
  FUND_DIAGNOSTIC_STATUS_USER_LABELS,
  formatDiagnosticInlineForUser,
  humanizeDiagnosticReason,
} from "@/lib/fund-watchlist/fund-watchlist-diagnostic-labels";
import type { FundDiagnostic } from "@/lib/fund-watchlist/fund-watchlist-diagnostic";

function diagnostic(partial: Partial<FundDiagnostic>): FundDiagnostic {
  return {
    status: "sous_surveillance",
    delta_1an_vs_category: -3,
    delta_reference_label: "médiane catégorie (watchlist)",
    peer_count: 5,
    volatility_class: "actions",
    trigger_reasons: ["Sharpe ≤ 0"],
    context_reasons: ["Respiration court terme (score CT négatif)"],
    reasons: ["Sharpe ≤ 0", "Respiration court terme (score CT négatif)"],
    short_term_respiration: true,
    ...partial,
  };
}

describe("fund-watchlist-diagnostic-labels", () => {
  it("traduit Sharpe et respiration CT en langage CGP", () => {
    expect(humanizeDiagnosticReason("Sharpe ≤ 0")).toContain("Sharpe");
    expect(humanizeDiagnosticReason("Respiration court terme (score CT négatif)")).toContain(
      "Respiration"
    );
  });

  it("formate un bloc lecture patrimoniale lisible", () => {
    const block = formatDiagnosticInlineForUser(diagnostic({}));
    expect(block).toContain("**Lecture patrimoniale — À suivre**");
    expect(block).toContain("Risque mal rémunéré");
    expect(block).toContain("Bon à savoir");
  });

  it("n'affiche pas de bloc pour conserver", () => {
    expect(
      formatDiagnosticInlineForUser(diagnostic({ status: "conserver", trigger_reasons: [] }))
    ).toBeNull();
  });

  it("expose des libellés statut orientés conseiller", () => {
    expect(FUND_DIAGNOSTIC_STATUS_USER_LABELS.sous_surveillance).toBe("À suivre");
    expect(FUND_DIAGNOSTIC_STATUS_USER_LABELS.signal_arbitrage).toBe("Arbitrage à étudier");
  });
});
