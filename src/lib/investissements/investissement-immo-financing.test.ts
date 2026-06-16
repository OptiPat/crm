import { describe, expect, it } from "vitest";
import {
  euroToFinancingCentimes,
  financingCentimesToEuro,
  isImmobilierFinancingType,
} from "./investissement-immo-financing";

describe("investissement-immo-financing", () => {
  it("cible uniquement les types patrimoine immobilier", () => {
    expect(isImmobilierFinancingType("RP")).toBe(true);
    expect(isImmobilierFinancingType("PINEL")).toBe(true);
    expect(isImmobilierFinancingType("ASSURANCE_VIE")).toBe(false);
    expect(isImmobilierFinancingType("SCPI")).toBe(false);
  });

  it("convertit euros ↔ centimes", () => {
    expect(euroToFinancingCentimes("1500")).toBe(150_000);
    expect(financingCentimesToEuro(150_000)).toBe("1500");
  });
});
