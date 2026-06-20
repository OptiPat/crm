import { describe, expect, it } from "vitest";
import type { Investissement } from "@/lib/api/tauri-investissements";
import {
  computePatrimoineStats,
  filterByOrigine,
  groupPatrimoineByCategory,
  investissementMatchesSearch,
  isImmobilierType,
  matchesInvestissementTypeFilter,
  matchesAnyInvestissementTypeFilter,
  matchesOrigineFilters,
  mergeContactPatrimoineRows,
} from "@/lib/investissements/patrimoine-tab-utils";

const base = (overrides: Partial<Investissement>): Investissement =>
  ({
    id: 1,
    contact_id: 1,
    type_produit: "SCPI",
    origine: "MON_CONSEIL",
    montant_initial: 100_00,
    ...overrides,
  }) as Investissement;

describe("patrimoine-tab-utils", () => {
  it("calcule les totaux avec moi / à côté", () => {
    const stats = computePatrimoineStats([
      base({ montant_initial: 100_00, origine: "MON_CONSEIL" }),
      base({ id: 2, montant_initial: 50_00, origine: "EXISTANT_CLIENT" }),
    ]);
    expect(stats.avecMoiCentimes).toBe(100_00);
    expect(stats.aCoteCentimes).toBe(50_00);
    expect(stats.count).toBe(2);
  });

  it("filtre par origine", () => {
    const list = [
      base({ origine: "MON_CONSEIL" }),
      base({ id: 2, origine: "EXISTANT_CLIENT" }),
    ];
    expect(filterByOrigine(list, "avec_moi")).toHaveLength(1);
    expect(filterByOrigine(list, "a_cote")).toHaveLength(1);
  });

  it("fusionne sans doublon en privilégiant le contact courant", () => {
    const merged = mergeContactPatrimoineRows(
      1,
      "Jean DUPONT",
      [base({ id: 10 })],
      [base({ id: 10, nom_produit: "Foyer dup" })],
      []
    );
    expect(merged).toHaveLength(1);
    expect(merged[0]._proprietaireId).toBe(1);
  });

  it("groupe immobilier et financier", () => {
    const { immobilier, financier } = groupPatrimoineByCategory([
      base({ type_produit: "SCPI" }),
      base({ id: 2, type_produit: "PINEL" }),
    ]);
    expect(immobilier).toHaveLength(1);
    expect(financier).toHaveLength(1);
    expect(isImmobilierType("SCPI")).toBe(false);
    expect(isImmobilierType("PINEL")).toBe(true);
  });

  it("filtre le type Immobilier (Pinel, Malraux, etc.)", () => {
    expect(matchesInvestissementTypeFilter("PINEL", "IMMOBILIER")).toBe(true);
    expect(matchesInvestissementTypeFilter("MALRAUX", "IMMOBILIER")).toBe(true);
    expect(matchesInvestissementTypeFilter("SCPI", "IMMOBILIER")).toBe(false);
    expect(matchesInvestissementTypeFilter("SCPI", "SCPI")).toBe(true);
  });

  it("recherche par libellé de type (Malraux, Pinel)", () => {
    const inv = base({ type_produit: "MALRAUX", nom_produit: "Appartement Paris" });
    expect(investissementMatchesSearch("malraux", inv)).toBe(true);
    expect(investissementMatchesSearch("pinel", inv)).toBe(false);

    const pinel = base({ id: 2, type_produit: "PINEL", nom_produit: "Lyon T3" });
    expect(investissementMatchesSearch("pinel", pinel)).toBe(true);
  });

  it("filtre plusieurs types (OU logique)", () => {
    expect(matchesAnyInvestissementTypeFilter("SCPI", ["SCPI", "PER"])).toBe(true);
    expect(matchesAnyInvestissementTypeFilter("ASSURANCE_VIE", ["SCPI", "PER"])).toBe(false);
    expect(matchesAnyInvestissementTypeFilter("PINEL", ["IMMOBILIER"])).toBe(true);
    expect(matchesAnyInvestissementTypeFilter("SCPI", [])).toBe(true);
  });

  it("filtre origines multiples (OU logique)", () => {
    expect(matchesOrigineFilters("MON_CONSEIL", ["avec_moi"])).toBe(true);
    expect(matchesOrigineFilters("EXISTANT_CLIENT", ["avec_moi"])).toBe(false);
    expect(matchesOrigineFilters("EXISTANT_CLIENT", ["a_cote"])).toBe(true);
    expect(matchesOrigineFilters("MON_CONSEIL", ["avec_moi", "a_cote"])).toBe(true);
    expect(matchesOrigineFilters("MON_CONSEIL", [])).toBe(true);
  });
});
