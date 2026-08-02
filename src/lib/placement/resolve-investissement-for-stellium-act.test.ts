import { describe, expect, it } from "vitest";
import type { Investissement } from "@/lib/api/tauri-investissements";
import {
  findInvestissementsMatchingStelliumProduct,
  resolveUnambiguousInvestissementIdForStelliumProduct,
} from "@/lib/placement/resolve-investissement-for-stellium-act";

function inv(overrides: Partial<Investissement> = {}): Investissement {
  return {
    id: 1,
    contact_id: 10,
    type_produit: "ASSURANCE_VIE",
    nom_produit: "Vie Plus",
    numero_contrat: "AV-1",
    prevoyance_perso: false,
    prevoyance_pro: false,
    versement_programme: false,
    reinvestissement_dividendes: false,
    origine: "MON_CONSEIL",
    statut: "ACTIF",
    created_at: 0,
    updated_at: 0,
    ...overrides,
  };
}

describe("resolve-investissement-for-stellium-act", () => {
  const partenaireNoms = new Map<number, string>([
    [100, "Suravenir"],
    [200, "Apicil"],
  ]);

  it("trouve le contrat unique pour un produit Stellium AV", () => {
    const investissements = [
      inv({ id: 1, partenaire_id: 100 }),
      inv({ id: 2, nom_produit: "Cristalliance Evoluvie", partenaire_id: 200 }),
    ];
    const matches = findInvestissementsMatchingStelliumProduct(
      investissements,
      partenaireNoms,
      "Cristalliance Avenir"
    );
    expect(matches).toHaveLength(1);
    expect(matches[0].id).toBe(1);
    expect(
      resolveUnambiguousInvestissementIdForStelliumProduct(
        investissements,
        partenaireNoms,
        "Cristalliance Avenir"
      )
    ).toBe(1);
  });

  it("retourne null si plusieurs contrats correspondent au même produit Stellium", () => {
    const investissements = [
      inv({ id: 1, numero_contrat: "AV-1", partenaire_id: 100 }),
      inv({ id: 2, numero_contrat: "AV-2", partenaire_id: 100 }),
    ];
    expect(
      resolveUnambiguousInvestissementIdForStelliumProduct(
        investissements,
        partenaireNoms,
        "Cristalliance Avenir"
      )
    ).toBeNull();
  });

  it("retourne null si aucun contrat ne correspond", () => {
    const investissements = [inv({ id: 1, partenaire_id: 200, nom_produit: "Evoluvie" })];
    expect(
      resolveUnambiguousInvestissementIdForStelliumProduct(
        investissements,
        partenaireNoms,
        "Cristalliance Avenir"
      )
    ).toBeNull();
  });
});
