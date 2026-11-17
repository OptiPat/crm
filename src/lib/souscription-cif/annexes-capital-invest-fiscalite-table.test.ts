import { describe, expect, it } from "vitest";
import {
  CAPITAL_INVEST_FISCALITE_FCPI_HEADER,
  CAPITAL_INVEST_FISCALITE_TABLE_ROWS,
  formatCapitalInvestFiscaliteCheck,
} from "@/lib/souscription-cif/annexes-capital-invest-fiscalite-table";

function row(label: string) {
  const found = CAPITAL_INVEST_FISCALITE_TABLE_ROWS.find((r) => r.label === label);
  if (!found) throw new Error(`Ligne absente : ${label}`);
  return found;
}

describe("annexes-capital-invest-fiscalite-table", () => {
  it("compare FCPI JEI et FIP Outre-Mer", () => {
    expect(CAPITAL_INVEST_FISCALITE_FCPI_HEADER).toBe("FCPI JEI");
    expect(row("Versement maximum — célibataire")).toMatchObject({ fcpi: "75 000 €", fipOm: "12 000 €" });
    expect(row("Versement maximum — couple")).toMatchObject({ fcpi: "150 000 €", fipOm: "24 000 €" });
    expect(row("Plafond de réduction — célibataire")).toMatchObject({ fcpi: "22 500 €", fipOm: "3 600 €" });
    expect(row("Plafond de réduction — couple")).toMatchObject({ fcpi: "45 000 €", fipOm: "7 200 €" });
  });

  it("place le FCPI JEI hors niches mais sous le plafond JEI de 50 000 €", () => {
    expect(row("Plafond niches fiscales 10 000 €")).toMatchObject({ fcpi: false, fipOm: true });
    expect(row("Plafond spécifique JEI 50 000 € (2024–2028)")).toMatchObject({ fcpi: true, fipOm: false });
  });

  it("indique la fiscalité de sortie de chaque fonds", () => {
    expect(row("Produits et plus-values à la sortie")).toMatchObject({
      fcpi: "Flat-tax",
      fipOm: "0 % d'IR (prélèvements sociaux uniquement)",
    });
  });

  it("affiche ✓ ou Non dans les cases", () => {
    expect(formatCapitalInvestFiscaliteCheck(true)).toBe("✓");
    expect(formatCapitalInvestFiscaliteCheck(false)).toBe("Non");
  });
});
