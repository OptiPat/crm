import { describe, expect, it } from "vitest";
import {
  computeEncoursPlacementsStats,
  getEffectiveEncoursCentimes,
  isPlacementEncoursEligible,
  listEncoursPlacementsAvecMoi,
} from "@/lib/investissements/investissement-encours";
import type { Investissement } from "@/lib/api/tauri-investissements";

function sampleInv(
  overrides: Partial<Investissement> = {}
): Investissement {
  return {
    id: 1,
    type_produit: "ASSURANCE_VIE",
    nom_produit: "AV",
    versement_programme: false,
    reinvestissement_dividendes: false,
    origine: "MON_CONSEIL",
    statut: "ACTIF",
    created_at: 0,
    updated_at: 0,
    ...overrides,
  };
}

describe("investissement-encours", () => {
  it("identifie les produits éligibles", () => {
    expect(isPlacementEncoursEligible("ASSURANCE_VIE")).toBe(true);
    expect(isPlacementEncoursEligible("SCPI")).toBe(false);
  });

  it("utilise encours_actuel sinon montant_initial", () => {
    expect(
      getEffectiveEncoursCentimes({
        encours_actuel: 2_500_000,
        montant_initial: 2_000_000,
      })
    ).toBe(2_500_000);
    expect(
      getEffectiveEncoursCentimes({
        encours_actuel: undefined,
        montant_initial: 2_000_000,
      })
    ).toBe(2_000_000);
  });

  it("agrège l'encours placements avec moi (hors à côté et SCPI)", () => {
    const stats = computeEncoursPlacementsStats([
      sampleInv({ montant_initial: 1_000_000, encours_actuel: 1_200_000 }),
      sampleInv({ id: 2, type_produit: "PER", montant_initial: 500_000 }),
      sampleInv({
        id: 3,
        type_produit: "ASSURANCE_VIE",
        montant_initial: 300_000,
        origine: "EXISTANT_CLIENT",
      }),
      sampleInv({ id: 4, type_produit: "SCPI", montant_initial: 900_000 }),
    ]);
    expect(stats.encoursCentimes).toBe(1_200_000 + 500_000);
    expect(stats.count).toBe(2);
  });

  it("ne compte pas deux fois le même id", () => {
    const inv = sampleInv({ id: 42, montant_initial: 1_500_000 });
    const stats = computeEncoursPlacementsStats([inv, { ...inv }]);
    expect(stats.encoursCentimes).toBe(1_500_000);
    expect(stats.count).toBe(1);
  });

  it("exclut les investissements clôturés de l'encours", () => {
    const stats = computeEncoursPlacementsStats([
      sampleInv({ id: 1, montant_initial: 1_000_000 }),
      sampleInv({ id: 2, statut: "CLOTURE", montant_initial: 2_000_000 }),
    ]);
    expect(stats.encoursCentimes).toBe(1_000_000);
    expect(stats.count).toBe(1);
  });

  it("liste les placements encours avec moi triés par montant", () => {
    const list = listEncoursPlacementsAvecMoi([
      sampleInv({ id: 1, montant_initial: 100_000 }),
      sampleInv({ id: 2, type_produit: "PER", montant_initial: 500_000 }),
      sampleInv({ id: 3, type_produit: "SCPI", montant_initial: 900_000 }),
      sampleInv({
        id: 4,
        type_produit: "FIP_FCPI",
        montant_initial: 200_000,
        origine: "EXISTANT_CLIENT",
      }),
    ]);
    expect(list.map((i) => i.id)).toEqual([2, 1]);
  });
});
