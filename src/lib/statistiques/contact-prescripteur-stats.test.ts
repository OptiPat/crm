import { describe, expect, it } from "vitest";
import type { Contact } from "@/lib/api/tauri-contacts";
import type { Investissement } from "@/lib/api/tauri-investissements";
import {
  computeContactPrescripteurConversionStats,
  computeContactPrescripteurStats,
  CONTACT_PRESCRIPTEUR_UNSET_KEY,
  filterContactsByPrescripteurKey,
  prescripteurGroupKeyFromContact,
} from "./contact-prescripteur-stats";

const SELF_ID = 99;

function contact(partial: Partial<Contact> & Pick<Contact, "id">): Contact {
  return {
    categorie: "CLIENT",
    nom: "DUPONT",
    prenom: "Jean",
    statut_suivi: "ACTIF",
    created_at: 0,
    updated_at: 0,
    ...partial,
  };
}

const opts = { selfContactId: SELF_ID };

function inv(partial: Partial<Investissement> & Pick<Investissement, "id">): Investissement {
  return {
    type_produit: "ASSURANCE_VIE",
    nom_produit: "Contrat test",
    versement_programme: false,
    reinvestissement_dividendes: false,
    origine: "MON_CONSEIL",
    created_at: 0,
    updated_at: 0,
    ...partial,
  };
}

describe("contact-prescripteur-stats", () => {
  it("regroupe les clients par prescripteur", () => {
    const prescripteur = contact({ id: 50, categorie: "PRESCRIPTEUR", nom: "BERNARD", prenom: "Luc" });
    const contacts = [
      prescripteur,
      contact({ id: 1, prescripteur_id: 50, source_lead: "Salon" }),
      contact({ id: 2, prescripteur_id: 50 }),
      contact({ id: 3 }),
    ];

    const stats = computeContactPrescripteurStats(contacts, opts, "client");
    expect(stats.total).toBe(3);
    expect(stats.rows).toHaveLength(2);

    const luc = stats.rows.find((row) => row.label === "Luc BERNARD");
    expect(luc?.count).toBe(2);

    const unset = stats.rows.find((row) => row.key === CONTACT_PRESCRIPTEUR_UNSET_KEY);
    expect(unset?.count).toBe(1);
  });

  it("exclut les memes categories que la lentille source client", () => {
    expect(
      computeContactPrescripteurStats(
        [contact({ id: 1, categorie: "SUSPECT_CLIENT", prescripteur_id: 50 })],
        opts,
        "client"
      ).total
    ).toBe(0);
    expect(
      computeContactPrescripteurStats(
        [contact({ id: 1, categorie: "PRESCRIPTEUR" })],
        opts,
        "client"
      ).total
    ).toBe(0);
  });

  it("calcule la conversion client par prescripteur", () => {
    const prescripteur = contact({ id: 50, categorie: "PRESCRIPTEUR", nom: "BERNARD", prenom: "Luc" });
    const contacts = [
      prescripteur,
      contact({ id: 1, prescripteur_id: 50 }),
      contact({ id: 2, prescripteur_id: 50 }),
      contact({ id: 3, prescripteur_id: 50 }),
    ];
    const investissements = [
      inv({ id: 10, contact_id: 1, montant_initial: 100_000 }),
      inv({ id: 11, contact_id: 2, montant_initial: 50_000 }),
    ];

    const stats = computeContactPrescripteurConversionStats(contacts, investissements, opts, "client");
    const luc = stats.rows.find((row) => row.label === "Luc BERNARD");
    expect(luc?.contactCount).toBe(3);
    expect(luc?.signedContactCount).toBe(2);
    expect(luc?.conversionPercent).toBeCloseTo(66.7, 1);
    expect(luc?.montantCentimes).toBe(150_000);
    expect(luc?.count).toBe(2);
  });

  it("calcule la conversion filleul par prescripteur", () => {
    const prescripteur = contact({ id: 50, categorie: "PRESCRIPTEUR", nom: "MARTIN", prenom: "Paul" });
    const contacts = [
      prescripteur,
      contact({
        id: 1,
        categorie: "AUCUN",
        filleul_categorie: "PROSPECT_FILLEUL",
        parrain_id: SELF_ID,
        prescripteur_id: 50,
      }),
      contact({
        id: 2,
        categorie: "AUCUN",
        filleul_categorie: "FILLEUL",
        parrain_id: SELF_ID,
        prescripteur_id: 50,
      }),
    ];

    const stats = computeContactPrescripteurConversionStats(contacts, [], opts, "filleul");
    const paul = stats.rows.find((row) => row.label === "Paul MARTIN");
    expect(paul?.contactCount).toBe(2);
    expect(paul?.signedContactCount).toBe(1);
    expect(paul?.conversionPercent).toBe(50);
    expect(paul?.montantCentimes).toBe(0);
  });

  it("filtre les contacts par clé prescripteur", () => {
    const contacts = [
      contact({ id: 1, prescripteur_id: 50 }),
      contact({ id: 2, prescripteur_id: 51 }),
      contact({ id: 3 }),
    ];
    const key = prescripteurGroupKeyFromContact(contacts[0]!);
    expect(filterContactsByPrescripteurKey(contacts, key, opts, "client").map((c) => c.id)).toEqual([
      1,
    ]);
    expect(
      filterContactsByPrescripteurKey(contacts, CONTACT_PRESCRIPTEUR_UNSET_KEY, opts, "client").map(
        (c) => c.id
      )
    ).toEqual([3]);
  });
});
