import { describe, expect, it } from "vitest";
import {
  buildAnnexesScpiCostsRows,
  computeQuotePartCifPercent,
  formatEuroAmountCif,
  formatPercentCif,
  parseEuroInput,
} from "@/lib/souscription-cif/build-annexes-scpi-costs";
import { defaultSouscriptionDossierFields } from "@/lib/souscription-cif/dossier-fields";

const cometeRow = {
  productKey: "comete",
  montantSouscritEur: "30000",
  partPriceEur: "250",
  reinvestissementDividendesPct: "100",
  vpMontantEur: "50",
  vpFrequence: "mois" as const,
};

describe("computeQuotePartCifPercent", () => {
  it("calcule quote-part / montant souscrit", () => {
    expect(computeQuotePartCifPercent(900, 30_000)).toBeCloseTo(0.03);
  });
});

describe("buildAnnexesScpiCostsRows", () => {
  it("remplit coûts produits EMT et le total pour Comète 30 000 €", () => {
    const rows = buildAnnexesScpiCostsRows({
      ...defaultSouscriptionDossierFields(),
      scpiAnnexeSouscriptions: [cometeRow],
      quotePartPercueConsultantCifEur: "900",
    });

    const tiersRow = rows.find((r) => r.label.includes("Paiement reçu de tiers"));
    expect(tiersRow?.amount).toBe(formatEuroAmountCif(900));
    expect(tiersRow?.percent).toBe(formatPercentCif(900 / 30_000));

    const productsRow = rows.find((r) => r.label === "Coûts liés aux produits");
    expect(productsRow?.amount).toBe(formatEuroAmountCif(999));
    expect(productsRow?.percent).toBe(formatPercentCif(999 / 30_000));

    const totalRow = rows.find((r) => r.label === "TOTAL COÛTS ET FRAIS");
    expect(totalRow?.amount).toBe(formatEuroAmountCif(1899));
    expect(totalRow?.percent).toBe(formatPercentCif(1899 / 30_000));
  });

  it("calcule le % total sur l’investissement global (pas la somme des % partiels)", () => {
    const rows = buildAnnexesScpiCostsRows({
      ...defaultSouscriptionDossierFields(),
      scpiAnnexeSouscriptions: [
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
      ],
      quotePartPercueConsultantCifEur: "900",
    });

    const productsRow = rows.find((r) => r.label === "Coûts liés aux produits");
    const ncapProductCosts = 10_000 * 0.020401398;
    expect(productsRow?.amount).toBe(formatEuroAmountCif(999 + ncapProductCosts));

    const totalRow = rows.find((r) => r.label === "TOTAL COÛTS ET FRAIS");
    expect(totalRow?.amount).toBe(formatEuroAmountCif(999 + ncapProductCosts + 900));
    expect(totalRow?.percent).toBe(formatPercentCif((999 + ncapProductCosts + 900) / 40_000));
  });

  it("laisse produits et total vides si quote-part ou montant souscrit absent", () => {
    const rows = buildAnnexesScpiCostsRows(defaultSouscriptionDossierFields());
    const tiersRow = rows.find((r) => r.label.includes("Paiement reçu de tiers"));
    expect(tiersRow?.amount).toBe("");
    expect(tiersRow?.percent).toBe("");
    const productsRow = rows.find((r) => r.label === "Coûts liés aux produits");
    expect(productsRow?.amount).toBe("");
  });
});

describe("parseEuroInput", () => {
  it("accepte espaces et virgule", () => {
    expect(parseEuroInput("1 200,50")).toBe(1200.5);
  });
});
