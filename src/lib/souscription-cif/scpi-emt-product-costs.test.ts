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

  it("additionne les lignes EMT pour NCAP Régions", () => {
    expect(getScpiEmtProductCostRate("ncap_regions")).toBeCloseTo(0.020401398);
  });

  it("additionne les lignes EMT pour Épargne Pierre", () => {
    expect(getScpiEmtProductCostRate("epargne_pierre")).toBeCloseTo(0.0217);
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

  it("pondère Comète et NCAP dans le % coûts produits", () => {
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
    ).toBeCloseTo((999 + 10_000 * 0.020401398) / 40_000);
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

  it("10 000 € NCAP × (0,005901398 + 0,0145) ≈ 204 €", () => {
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
    ).toBeCloseTo(204.01398);
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
