import { describe, expect, it } from "vitest";
import {
  formatEuroCentimes,
  formatNomProduit,
  getTypeProduitBgColor,
  getTypeProduitTextClass,
} from "./investissement-display";

describe("formatNomProduit", () => {
  it("corrige les sigles isolés", () => {
    expect(formatNomProduit("Fip")).toBe("FIP");
    expect(formatNomProduit("scpi")).toBe("SCPI");
  });

  it("ne modifie pas les noms commerciaux", () => {
    expect(formatNomProduit("Comete & Partners")).toBe("Comete & Partners");
  });

  it("formate les codes techniques", () => {
    expect(formatNomProduit("ASSURANCE_VIE")).toBe("Assurance Vie");
  });
});

describe("getTypeProduitBgColor", () => {
  it("vert immobilier, rose financier, gris à côté", () => {
    expect(getTypeProduitBgColor("IMMOBILIER")).toBe("#85ad39");
    expect(getTypeProduitBgColor("SCPI")).toBe("#dc216e");
    expect(getTypeProduitBgColor("SCPI", "EXISTANT_CLIENT")).toBe("#9ca3af");
  });
});

describe("getTypeProduitTextClass", () => {
  it("texte gris si existant client", () => {
    expect(getTypeProduitTextClass("SCPI", "EXISTANT_CLIENT")).toContain("gray");
    expect(getTypeProduitTextClass("SCPI")).toBe("text-white");
  });
});

describe("formatEuroCentimes", () => {
  it("masque les centimes nulles", () => {
    expect(formatEuroCentimes(2_000_000)).toBe("20\u202f000\u00a0€");
    expect(formatEuroCentimes(100)).toBe("1\u00a0€");
  });

  it("affiche les centimes non nulles", () => {
    expect(formatEuroCentimes(2_000_056)).toBe("20\u202f000,56\u00a0€");
    expect(formatEuroCentimes(150)).toBe("1,50\u00a0€");
  });

  it("retourne un tiret si absent ou nul", () => {
    expect(formatEuroCentimes(undefined)).toBe("-");
    expect(formatEuroCentimes(0)).toBe("-");
  });
});
