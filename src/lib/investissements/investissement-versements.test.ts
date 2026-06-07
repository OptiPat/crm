import { describe, expect, it } from "vitest";
import { isVersementComplementaireEligible } from "./investissement-versements";

describe("investissement-versements", () => {
  it("autorise AV, PER et contrat de capitalisation", () => {
    expect(isVersementComplementaireEligible("ASSURANCE_VIE")).toBe(true);
    expect(isVersementComplementaireEligible("PER")).toBe(true);
    expect(isVersementComplementaireEligible("CONTRAT_CAPITALISATION")).toBe(true);
    expect(isVersementComplementaireEligible("SCPI")).toBe(false);
  });
});
