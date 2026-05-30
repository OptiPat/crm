import { describe, expect, it } from "vitest";
import {
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
