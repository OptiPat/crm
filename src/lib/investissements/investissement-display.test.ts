import { describe, expect, it } from "vitest";
import {
  formatEuroCentimes,
  formatNomProduit,
  getTypeProduitBgColor,
  getTypeProduitTextClass,
  isNumeroContratEligible,
  normalizeNumeroContrat,
  numeroContratMatchKey,
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

  it("libelle proprement les types RIO (accents, pas de code brut)", () => {
    expect(formatNomProduit("LOCATIF")).toBe("Locatif");
    expect(formatNomProduit("EPARGNE_BANCAIRE")).toBe("Épargne Bancaire");
    expect(formatNomProduit("LIVRET_A")).toBe("Livret A");
    expect(formatNomProduit("COMPTE_TITRE")).toBe("Compte-Titres");
    expect(formatNomProduit("RP")).toBe("Résidence Principale");
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

describe("isNumeroContratEligible", () => {
  it("AV, PER et contrat de capi uniquement", () => {
    expect(isNumeroContratEligible("ASSURANCE_VIE")).toBe(true);
    expect(isNumeroContratEligible("PER")).toBe(true);
    expect(isNumeroContratEligible("CONTRAT_CAPITALISATION")).toBe(true);
    expect(isNumeroContratEligible("EPARGNE_SALARIALE")).toBe(false);
    expect(isNumeroContratEligible("FIP_FCPI")).toBe(false);
    expect(isNumeroContratEligible("SCPI")).toBe(false);
  });
});

describe("normalizeNumeroContrat", () => {
  it("trim sans modifier les zéros", () => {
    expect(normalizeNumeroContrat(" 0123456 ")).toBe("0123456");
  });
});

describe("numeroContratMatchKey", () => {
  it("ignore les zéros en tête pour les n° numériques", () => {
    expect(numeroContratMatchKey("0123456")).toBe("123456");
    expect(numeroContratMatchKey("123456")).toBe("123456");
    expect(numeroContratMatchKey("000")).toBe("0");
  });

  it("conserve les n° alphanumériques tels quels", () => {
    expect(numeroContratMatchKey("AV-0012")).toBe("AV-0012");
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
