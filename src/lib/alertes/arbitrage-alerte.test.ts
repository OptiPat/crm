import { describe, expect, it } from "vitest";
import {
  isAlerteArbitrageAvPer,
  isArbitrageSuiviEligible,
} from "@/lib/alertes/arbitrage-alerte";

describe("arbitrage-alerte", () => {
  it("identifie le type alerte arbitrage", () => {
    expect(isAlerteArbitrageAvPer("ARBITRAGE_AV_PER")).toBe(true);
    expect(isAlerteArbitrageAvPer("FIN_DEMEMBREMENT")).toBe(false);
  });

  it("limite le suivi arbitrage aux AV/PER avec moi", () => {
    expect(isArbitrageSuiviEligible("ASSURANCE_VIE", "MON_CONSEIL")).toBe(true);
    expect(isArbitrageSuiviEligible("PER", "MON_CONSEIL")).toBe(true);
    expect(isArbitrageSuiviEligible("ASSURANCE_VIE", "EXISTANT_CLIENT")).toBe(false);
    expect(isArbitrageSuiviEligible("SCPI", "MON_CONSEIL")).toBe(false);
    expect(isArbitrageSuiviEligible("ASSURANCE_VIE", "MON_CONSEIL", "CLOTURE")).toBe(false);
  });
});
