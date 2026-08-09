import { describe, expect, it } from "vitest";
import { getPatrimoineCategorie } from "./categories";

describe("getPatrimoineCategorie", () => {
  it("classe l'immobilier", () => {
    expect(getPatrimoineCategorie("LMNP")).toBe("Immobilier");
    expect(getPatrimoineCategorie("PINEL")).toBe("Immobilier");
  });

  it("classe les SCPI", () => {
    expect(getPatrimoineCategorie("SCPI")).toBe("SCPI");
    expect(getPatrimoineCategorie("SCPI_DEMEMBREMENT")).toBe("SCPI");
  });

  it("classe retraite avec les placements financiers", () => {
    expect(getPatrimoineCategorie("PER")).toBe("Placements financiers");
    expect(getPatrimoineCategorie("PEE")).toBe("Placements financiers");
    expect(getPatrimoineCategorie("PREVOYANCE")).toBe("Prévoyance");
  });

  it("classe l'épargne bancaire à part", () => {
    expect(getPatrimoineCategorie("COMPTE_COURANT")).toBe("Épargne bancaire");
    expect(getPatrimoineCategorie("EPARGNE_BANCAIRE")).toBe("Épargne bancaire");
    expect(getPatrimoineCategorie("LIVRET_A")).toBe("Épargne bancaire");
    expect(getPatrimoineCategorie("PEL")).toBe("Épargne bancaire");
  });

  it("classe les placements financiers", () => {
    expect(getPatrimoineCategorie("ASSURANCE_VIE")).toBe("Placements financiers");
    expect(getPatrimoineCategorie("PEA")).toBe("Placements financiers");
  });
});
