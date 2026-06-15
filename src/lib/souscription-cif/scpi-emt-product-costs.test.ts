import { describe, expect, it } from "vitest";
import {
  computeProductCostsPercentRatio,
  getScpiEmtProductCostRate,
  sumProductCostsFromSouscriptions,
} from "@/lib/souscription-cif/scpi-emt-product-costs";

describe("getScpiEmtProductCostRate", () => {
  it("additionne les lignes EMT pour Comète", () => {
    expect(getScpiEmtProductCostRate("comete")).toBeCloseTo(0.0333);
  });

  it("retourne null pour NCAP Régions (données absentes)", () => {
    expect(getScpiEmtProductCostRate("ncap_regions")).toBeNull();
  });
});

describe("computeProductCostsPercentRatio", () => {
  it("Comète : % = 0,0066 + 0,0267", () => {
    expect(
      computeProductCostsPercentRatio([
        {
          productKey: "comete",
          montantSouscritEur: "10000",
          partPriceEur: "250",
          reinvestissementDividendesPct: "",
          vpMontantEur: "",
          vpFrequence: "mois",
        },
      ])
    ).toBeCloseTo(0.0333);
  });

  it("exclut NCAP du dénominateur (pas de taux EMT)", () => {
    expect(
      computeProductCostsPercentRatio([
        {
          productKey: "comete",
          montantSouscritEur: "30000",
          partPriceEur: "250",
          reinvestissementDividendesPct: "",
          vpMontantEur: "",
          vpFrequence: "mois",
        },
        {
          productKey: "ncap_regions",
          montantSouscritEur: "10000",
          partPriceEur: "682",
          reinvestissementDividendesPct: "",
          vpMontantEur: "",
          vpFrequence: "mois",
        },
      ])
    ).toBeCloseTo(0.0333);
  });
});

describe("sumProductCostsFromSouscriptions", () => {
  it("10 000 € Comète × (0,0066 + 0,0267) = 333 €", () => {
    expect(
      sumProductCostsFromSouscriptions([
        {
          productKey: "comete",
          montantSouscritEur: "10000",
          partPriceEur: "250",
          reinvestissementDividendesPct: "",
          vpMontantEur: "",
          vpFrequence: "mois",
        },
      ])
    ).toBeCloseTo(333);
  });

  it("calcule montant × taux EMT par SCPI", () => {
    expect(
      sumProductCostsFromSouscriptions([
        {
          productKey: "comete",
          montantSouscritEur: "30000",
          partPriceEur: "250",
          reinvestissementDividendesPct: "",
          vpMontantEur: "",
          vpFrequence: "mois",
        },
      ])
    ).toBeCloseTo(999);
  });

  it("ignore NCAP sans coefficients EMT", () => {
    expect(
      sumProductCostsFromSouscriptions([
        {
          productKey: "ncap_regions",
          montantSouscritEur: "10000",
          partPriceEur: "682",
          reinvestissementDividendesPct: "",
          vpMontantEur: "",
          vpFrequence: "mois",
        },
      ])
    ).toBeNull();
  });

  it("additionne plusieurs SCPI connues", () => {
    const total = sumProductCostsFromSouscriptions([
      {
        productKey: "comete",
        montantSouscritEur: "30000",
        partPriceEur: "250",
        reinvestissementDividendesPct: "",
        vpMontantEur: "",
        vpFrequence: "mois",
      },
      {
        productKey: "alta_convictions",
        montantSouscritEur: "10000",
        partPriceEur: "308",
        reinvestissementDividendesPct: "",
        vpMontantEur: "",
        vpFrequence: "mois",
      },
    ]);
    expect(total).toBeCloseTo(999 + 60);
  });
});
