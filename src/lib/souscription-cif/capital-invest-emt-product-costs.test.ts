import { describe, expect, it } from "vitest";
import { newCapitalInvestAnnexeSouscription } from "@/lib/souscription-cif/capital-invest-annexe-souscriptions";
import {
  computeCapitalInvestProductCostsPercentRatio,
  getCapitalInvestEmtProductCostRate,
  parseEmtCoefficientInput,
  sumCapitalInvestProductCostsFromSouscriptions,
} from "@/lib/souscription-cif/capital-invest-emt-product-costs";

describe("parseEmtCoefficientInput", () => {
  it("accepte le coefficient fichier EMT tel quel (0,005 = 0,5 %)", () => {
    expect(parseEmtCoefficientInput("0.005")).toBe(0.005);
    expect(parseEmtCoefficientInput("0,005")).toBe(0.005);
  });
});

describe("getCapitalInvestEmtProductCostRate", () => {
  it("additionne les coefficients EMT (convention SCPI / fichier EMT)", () => {
    const row = newCapitalInvestAnnexeSouscription({
      emtLine07110Pct: "0,0066",
      emtLine07130Pct: "0,0267",
      emtLine07140Pct: "0",
    });
    expect(getCapitalInvestEmtProductCostRate(row)).toBeCloseTo(0.0333);
  });

  it("retourne null si aucune ligne EMT", () => {
    expect(getCapitalInvestEmtProductCostRate(newCapitalInvestAnnexeSouscription({}))).toBeNull();
  });
});

describe("sumCapitalInvestProductCostsFromSouscriptions", () => {
  it("calcule montant × coefficient EMT (Comète : 10 000 × 0,0333 = 333 €)", () => {
    expect(
      sumCapitalInvestProductCostsFromSouscriptions([
        newCapitalInvestAnnexeSouscription({
          nbParts: "100",
          partPriceEur: "100",
          emtLine07110Pct: "0,0066",
          emtLine07130Pct: "0,0267",
        }),
      ])
    ).toBeCloseTo(333);
  });

  it("accepte 0,005 du fichier EMT (= 0,5 % sur 10 000 € → 50 €)", () => {
    expect(
      sumCapitalInvestProductCostsFromSouscriptions([
        newCapitalInvestAnnexeSouscription({
          nbParts: "100",
          partPriceEur: "100",
          emtLine07110Pct: "0.005",
        }),
      ])
    ).toBeCloseTo(50);
  });

  it("pondère plusieurs fonds", () => {
    const total = sumCapitalInvestProductCostsFromSouscriptions([
      newCapitalInvestAnnexeSouscription({
        nbParts: "100",
        partPriceEur: "100",
        emtLine07110Pct: "0.01",
        emtLine07130Pct: "0.02",
      }),
      newCapitalInvestAnnexeSouscription({
        nbParts: "50",
        partPriceEur: "100",
        emtLine07130Pct: "0.04",
      }),
    ]);
    expect(total).toBeCloseTo(10_000 * 0.03 + 5_000 * 0.04);
  });
});

describe("computeCapitalInvestProductCostsPercentRatio", () => {
  it("calcule le % pondéré sur les montants souscrits EMT", () => {
    expect(
      computeCapitalInvestProductCostsPercentRatio([
        newCapitalInvestAnnexeSouscription({
          nbParts: "100",
          partPriceEur: "100",
          emtLine07110Pct: "0,0066",
          emtLine07130Pct: "0,0267",
        }),
      ])
    ).toBeCloseTo(0.0333);
  });
});
