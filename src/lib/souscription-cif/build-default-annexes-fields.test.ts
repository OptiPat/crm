import { describe, expect, it } from "vitest";
import {
  buildDefaultConseil,
  DEFAULT_CONSEIL_CAPITAL_INVEST_TEXT,
  DEFAULT_CONSEIL_TEXT,
} from "@/lib/souscription-cif/build-default-annexes-fields";
import {
  buildMesPreconisationsFromSouscriptions,
} from "@/lib/souscription-cif/scpi-annexe-souscriptions";

const cometeRow = {
  productKey: "comete",
  montantSouscritEur: "30000",
  partPriceEur: "250",
  reinvestissementDividendesPct: "100",
  vpMontantEur: "50",
  vpFrequence: "mois" as const,
};

describe("buildDefaultAnnexesFields", () => {
  it("retourne le texte type Conseil SCPI", () => {
    expect(buildDefaultConseil()).toBe(DEFAULT_CONSEIL_TEXT);
    expect(buildDefaultConseil("scpi")).toBe(DEFAULT_CONSEIL_TEXT);
  });

  it("retourne le texte type Conseil Capital investissement", () => {
    expect(buildDefaultConseil("capital-investissement")).toBe(DEFAULT_CONSEIL_CAPITAL_INVEST_TEXT);
  });

  it("génère Mes préconisations depuis une souscription Comète type (réinvest. + VP)", () => {
    const text = buildMesPreconisationsFromSouscriptions([cometeRow]);
    expect(text).toMatch(/30[\s\u202f]?000/);
    expect(text).toContain("Comète");
    expect(text).toContain("250 € la part x 120 parts");
    expect(text).toContain("réinvestissement automatique de 100% des dividendes");
    expect(text).toContain("50 €/mois de versements programmés");
  });
});
