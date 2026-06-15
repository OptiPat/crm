import { describe, expect, it } from "vitest";
import { DEFAULT_MES_PRECONISATIONS_TEXT } from "@/lib/souscription-cif/build-default-annexes-fields";
import {
  buildAnnexesScpiCostsRows,
  computeQuotePartCifPercent,
  formatEuroAmountCif,
  formatPercentCif,
  parseEuroInput,
  parseMontantSouscritFromMesPreconisations,
} from "@/lib/souscription-cif/build-annexes-scpi-costs";
import { defaultSouscriptionDossierFields } from "@/lib/souscription-cif/dossier-fields";

describe("parseMontantSouscritFromMesPreconisations", () => {
  it("extrait le montant souscrit du texte type", () => {
    expect(parseMontantSouscritFromMesPreconisations(DEFAULT_MES_PRECONISATIONS_TEXT)).toBe(
      30_000
    );
  });
});

describe("computeQuotePartCifPercent", () => {
  it("calcule quote-part / montant souscrit", () => {
    expect(computeQuotePartCifPercent(900, 30_000)).toBeCloseTo(0.03);
  });
});

describe("buildAnnexesScpiCostsRows", () => {
  it("remplit la ligne paiement tiers CIF avec quote-part et pourcentage", () => {
    const rows = buildAnnexesScpiCostsRows({
      ...defaultSouscriptionDossierFields(),
      mesPreconisations: DEFAULT_MES_PRECONISATIONS_TEXT,
      quotePartPercueConsultantCifEur: "900",
    });

    const tiersRow = rows.find((r) => r.label.includes("Paiement reçu de tiers"));
    expect(tiersRow?.amount).toBe(formatEuroAmountCif(900));
    expect(tiersRow?.percent).toBe(formatPercentCif(900 / 30_000));
  });

  it("laisse vide si quote-part ou montant souscrit absent", () => {
    const rows = buildAnnexesScpiCostsRows(defaultSouscriptionDossierFields());
    const tiersRow = rows.find((r) => r.label.includes("Paiement reçu de tiers"));
    expect(tiersRow?.amount).toBe("");
    expect(tiersRow?.percent).toBe("");
  });
});

describe("parseEuroInput", () => {
  it("accepte espaces et virgule", () => {
    expect(parseEuroInput("1 200,50")).toBe(1200.5);
  });
});
