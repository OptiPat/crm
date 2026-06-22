import { describe, expect, it } from "vitest";
import { buildAnnexesCapitalInvestCostsRows } from "@/lib/souscription-cif/build-annexes-capital-invest-costs";
import { formatEuroAmountCif, formatPercentCif } from "@/lib/souscription-cif/build-annexes-scpi-costs";
import { newCapitalInvestAnnexeSouscription } from "@/lib/souscription-cif/capital-invest-annexe-souscriptions";
import { defaultSouscriptionDossierFields } from "@/lib/souscription-cif/dossier-fields";

describe("buildAnnexesCapitalInvestCostsRows", () => {
  it("remplit coûts produits EMT et le total", () => {
    const rows = buildAnnexesCapitalInvestCostsRows({
      ...defaultSouscriptionDossierFields(),
      capitalInvestAnnexeSouscriptions: [
        newCapitalInvestAnnexeSouscription({
          nbParts: "100",
          partPriceEur: "100",
          emtLine07110Pct: "0,0066",
          emtLine07130Pct: "0,0267",
        }),
      ],
      quotePartPercueConsultantCifEur: "300",
    });

    const tiersRow = rows.find((r) => r.label.includes("Paiement reçu de tiers"));
    expect(tiersRow?.amount).toBe(formatEuroAmountCif(300));
    expect(tiersRow?.percent).toBe(formatPercentCif(300 / 10_000));

    const productsRow = rows.find((r) => r.label === "Coûts liés aux produits");
    expect(productsRow?.amount).toBe(formatEuroAmountCif(333));
    expect(productsRow?.percent).toBe(formatPercentCif(333 / 10_000));

    const totalRow = rows.find((r) => r.label === "TOTAL COÛTS ET FRAIS");
    expect(totalRow?.amount).toBe(formatEuroAmountCif(633));
    expect(totalRow?.percent).toBe(formatPercentCif(633 / 10_000));
  });

  it("laisse produits vides sans taux EMT", () => {
    const rows = buildAnnexesCapitalInvestCostsRows({
      ...defaultSouscriptionDossierFields(),
      capitalInvestAnnexeSouscriptions: [
        newCapitalInvestAnnexeSouscription({ nbParts: "10", partPriceEur: "100" }),
      ],
    });
    const productsRow = rows.find((r) => r.label === "Coûts liés aux produits");
    expect(productsRow?.amount).toBe("");
  });

  it("affiche la quote-part CIF même sans taux EMT produit", () => {
    const rows = buildAnnexesCapitalInvestCostsRows({
      ...defaultSouscriptionDossierFields(),
      capitalInvestAnnexeSouscriptions: [
        newCapitalInvestAnnexeSouscription({ nbParts: "10", partPriceEur: "100" }),
      ],
      quotePartPercueConsultantCifEur: "100",
    });
    const tiersRow = rows.find((r) => r.label.includes("Paiement reçu de tiers"));
    expect(tiersRow?.amount).toBe(formatEuroAmountCif(100));
    expect(tiersRow?.percent).toBe(formatPercentCif(0.1));
    const totalRow = rows.find((r) => r.label === "TOTAL COÛTS ET FRAIS");
    expect(totalRow?.amount).toBe(formatEuroAmountCif(100));
  });
});
