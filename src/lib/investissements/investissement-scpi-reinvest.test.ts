import { describe, expect, it } from "vitest";
import {
  computeScpiReinvestissementCoverageStats,
  filterScpiSansReinvestissementDividendes,
  compareInvestissementsScpiCreditFirst,
  formatScpiCreditLabel,
  hasScpiCredit,
  isScpiCreditEligibleType,
  isScpiPleineProprieteType,
} from "./investissement-scpi-reinvest";

describe("investissement-scpi-reinvest", () => {
  it("identifie la SCPI pleine propriété", () => {
    expect(isScpiPleineProprieteType("SCPI")).toBe(true);
    expect(isScpiPleineProprieteType("SCPI_DEMEMBREMENT")).toBe(false);
    expect(isScpiPleineProprieteType("SCPI_FISCALE")).toBe(false);
  });

  it("calcule la couverture réinvestissement sur SCPI avec moi", () => {
    const stats = computeScpiReinvestissementCoverageStats([
      {
        id: 1,
        origine: "MON_CONSEIL",
        type_produit: "SCPI",
        reinvestissement_dividendes: true,
      },
      {
        id: 2,
        origine: "MON_CONSEIL",
        type_produit: "SCPI",
        reinvestissement_dividendes: false,
      },
      {
        id: 3,
        origine: "MON_CONSEIL",
        type_produit: "SCPI_DEMEMBREMENT",
        reinvestissement_dividendes: true,
      },
      {
        id: 4,
        origine: "EXISTANT_CLIENT",
        type_produit: "SCPI",
        reinvestissement_dividendes: false,
      },
    ]);
    expect(stats.total).toBe(2);
    expect(stats.withReinvest).toBe(1);
    expect(stats.withoutReinvest).toBe(1);
    expect(stats.withCredit).toBe(0);
    expect(stats.percentWithReinvest).toBe(50);
  });

  it("compte les SCPI avec crédit", () => {
    const stats = computeScpiReinvestissementCoverageStats([
      {
        id: 1,
        origine: "MON_CONSEIL",
        type_produit: "SCPI",
        date_fin_pret: 1_900_000_000,
      },
      {
        id: 2,
        origine: "MON_CONSEIL",
        type_produit: "SCPI",
        credit_crd: 50_000_00,
      },
    ]);
    expect(stats.total).toBe(2);
    expect(stats.withCredit).toBe(2);
  });

  it("détecte et formate un crédit SCPI", () => {
    expect(hasScpiCredit({ date_fin_pret: 1_900_000_000 })).toBe(true);
    expect(hasScpiCredit({})).toBe(false);
    expect(isScpiCreditEligibleType("SCPI")).toBe(true);
    expect(isScpiCreditEligibleType("PER")).toBe(false);
    const label = formatScpiCreditLabel(
      { credit_crd: 45_000_00, date_fin_pret: 1_900_000_000 },
      (c) => `${(c ?? 0) / 100} €`,
      () => "2030"
    );
    expect(label).toContain("Crédit");
    expect(label).toContain("CRD");
    expect(label).toContain("2030");
  });

  it("filtre les SCPI avec moi sans réinvestissement actif", () => {
    const list = filterScpiSansReinvestissementDividendes([
      {
        id: 1,
        origine: "MON_CONSEIL",
        type_produit: "SCPI",
        reinvestissement_dividendes: false,
      },
      {
        id: 2,
        origine: "MON_CONSEIL",
        type_produit: "SCPI",
        reinvestissement_dividendes: true,
      },
      {
        id: 3,
        origine: "MON_CONSEIL",
        type_produit: "SCPI_FISCALE",
        reinvestissement_dividendes: false,
      },
    ]);
    expect(list.map((i) => i.id)).toEqual([1]);
  });

  it("trie les crédits SCPI en premier", () => {
    const sorted = [
      { credit_crd: undefined },
      { credit_crd: 10_000_00 },
      { date_fin_pret: 1_900_000_000 },
    ].sort(compareInvestissementsScpiCreditFirst);
    expect(hasScpiCredit(sorted[0])).toBe(true);
    expect(hasScpiCredit(sorted[1])).toBe(true);
    expect(hasScpiCredit(sorted[2])).toBe(false);
  });
});
