import { describe, expect, it } from "vitest";
import {
  arbitrageDatesToUnix,
  dateInputAddMonthsUtc,
  defaultProchainArbitrageDateInput,
  isAlerteArbitrageAvPer,
  isArbitrageAutoTask,
  isArbitrageSuiviEligible,
} from "@/lib/alertes/arbitrage-alerte";

const NOW = Date.parse("2026-02-01T10:00:00Z");

describe("arbitrage-alerte", () => {
  it("identifie le type alerte arbitrage", () => {
    expect(isAlerteArbitrageAvPer("ARBITRAGE_AV_PER")).toBe(true);
    expect(isAlerteArbitrageAvPer("FIN_DEMEMBREMENT")).toBe(false);
  });

  it("identifie les tâches auto arbitrage", () => {
    expect(
      isArbitrageAutoTask({ titre: "Arbitrage assurance vie — DUPONT Jean — 123" })
    ).toBe(true);
    expect(isArbitrageAutoTask({ titre: "Envoyer Perf contrats" })).toBe(false);
  });

  it("calcule la prochaine échéance par défaut à +6 mois UTC", () => {
    expect(defaultProchainArbitrageDateInput("2026-02-01", NOW)).toBe("2026-08-01");
    expect(dateInputAddMonthsUtc("2026-02-01", 6, NOW)).toBe("2026-08-01");
  });

  it("convertit les dates input en timestamps", () => {
    const parsed = arbitrageDatesToUnix({
      dateDernier: "2026-02-01",
      dateProchain: "2026-08-01",
    });
    expect(parsed).not.toBeNull();
    expect(parsed!.dateProchain).toBeGreaterThan(parsed!.dateDernier);
  });

  it("rejette prochain < dernier", () => {
    expect(
      arbitrageDatesToUnix({ dateDernier: "2026-08-01", dateProchain: "2026-06-01" })
    ).toBeNull();
  });

  it("limite le suivi arbitrage aux AV/PER avec moi", () => {
    expect(isArbitrageSuiviEligible("ASSURANCE_VIE", "MON_CONSEIL")).toBe(true);
    expect(isArbitrageSuiviEligible("PER", "MON_CONSEIL")).toBe(true);
    expect(isArbitrageSuiviEligible("ASSURANCE_VIE", "EXISTANT_CLIENT")).toBe(false);
    expect(isArbitrageSuiviEligible("SCPI", "MON_CONSEIL")).toBe(false);
    expect(isArbitrageSuiviEligible("ASSURANCE_VIE", "MON_CONSEIL", "CLOTURE")).toBe(false);
  });
});
