import { describe, expect, it } from "vitest";
import type { Contact } from "@/lib/api/tauri-contacts";
import type { Investissement } from "@/lib/api/tauri-investissements";
import {
  computeClientScpiReinvestStats,
  filterContactsForClientScpiReinvestList,
} from "./contact-client-scpi-reinvest-stats";

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
    type_produit: "SCPI",
    nom_produit: "Comète",
    versement_programme: false,
    reinvestissement_dividendes: false,
    origine: "MON_CONSEIL",
    statut: "ACTIF",
    created_at: 0,
    updated_at: 0,
    ...overrides,
  } as Investissement;
}

describe("contact-client-scpi-reinvest-stats", () => {
  it("calcule le % de clients avec SCPI pleine propriété ayant le réinvestissement actif", () => {
    const contacts = [
      contact({ id: 1 }),
      contact({ id: 2 }),
      contact({ id: 3 }),
      contact({ id: 4, statut_suivi: "EN_PAUSE" }),
    ];
    const investissements = [
      inv({ id: 1, contact_id: 1, reinvestissement_dividendes: true }),
      inv({ id: 2, contact_id: 2, reinvestissement_dividendes: false }),
      inv({ id: 3, contact_id: 3, type_produit: "SCPI_DEMEMBREMENT", reinvestissement_dividendes: true }),
      inv({ id: 4, contact_id: 4, reinvestissement_dividendes: true }),
    ];

    const stats = computeClientScpiReinvestStats(contacts, investissements);
    expect(stats.totalCount).toBe(2);
    expect(stats.withReinvestCount).toBe(1);
    expect(stats.withReinvestPercent).toBe(50);
    expect(
      filterContactsForClientScpiReinvestList(contacts, "withReinvest", investissements).map(
        (c) => c.id
      )
    ).toEqual([1]);
  });
});
