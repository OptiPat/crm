import { describe, expect, it } from "vitest";
import type { Contact } from "@/lib/api/tauri-contacts";
import type { Investissement } from "@/lib/api/tauri-investissements";
import {
  computeClientVpCoverageStats,
  filterContactsForClientVpCoverageList,
} from "./contact-client-vp-coverage-stats";

function contact(overrides: Partial<Contact> & Pick<Contact, "id">): Contact {
  return {
    nom: "DUPONT",
    prenom: "Jean",
    categorie: "CLIENT",
    ...overrides,
  } as Contact;
}

function inv(overrides: Partial<Investissement>): Investissement {
  return {
    id: 1,
    type_produit: "ASSURANCE_VIE",
    nom_produit: "Contrat",
    versement_programme: false,
    reinvestissement_dividendes: false,
    origine: "MON_CONSEIL",
    statut: "ACTIF",
    created_at: 0,
    updated_at: 0,
    ...overrides,
  } as Investissement;
}

describe("contact-client-vp-coverage-stats", () => {
  it("calcule le % de contrats AV/PER avec VP actif (aligné Patrimoine)", () => {
    const contacts = [contact({ id: 1 }), contact({ id: 2 })];
    const investissements = [
      inv({
        id: 1,
        contact_id: 1,
        versement_programme: true,
        montant_versement_programme: 100_00,
      }),
      inv({ id: 2, contact_id: 1, versement_programme: false }),
      inv({ id: 3, contact_id: 2, type_produit: "PER", versement_programme: false }),
      inv({
        id: 4,
        contact_id: 2,
        type_produit: "SCPI",
        versement_programme: true,
        montant_versement_programme: 200_00,
      }),
    ];

    const stats = computeClientVpCoverageStats(contacts, investissements);
    expect(stats.totalCount).toBe(3);
    expect(stats.withVpCount).toBe(1);
    expect(stats.withoutVpCount).toBe(2);
    expect(stats.withVpPercent).toBeCloseTo(33.333, 2);
    expect(stats.withVpContactIds).toEqual([1]);
    expect(stats.withoutVpContactIds.sort()).toEqual([1, 2]);
  });

  it("liste les clients par AV/PER avec ou sans VP", () => {
    const contacts = [contact({ id: 1 }), contact({ id: 2 })];
    const investissements = [
      inv({
        id: 1,
        contact_id: 1,
        versement_programme: true,
        montant_versement_programme: 100_00,
      }),
      inv({ id: 2, contact_id: 1, versement_programme: false }),
      inv({ id: 3, contact_id: 2, versement_programme: false }),
    ];

    expect(
      filterContactsForClientVpCoverageList(contacts, "withVp", investissements).map((c) => c.id)
    ).toEqual([1]);
    expect(
      filterContactsForClientVpCoverageList(contacts, "withoutVp", investissements).map(
        (c) => c.id
      )
    ).toEqual([1, 2]);
  });
});
