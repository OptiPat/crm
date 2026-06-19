import { describe, expect, it } from "vitest";
import type { Contact } from "@/lib/api/tauri-contacts";
import type { Foyer } from "@/lib/api/tauri-foyers";
import {
  findExistingFoyerByFamilleName,
  formatFoyerMemberLabel,
  getContactsForFoyer,
  sumPatrimoineCentimes,
  buildFoyerNomFromMembers,
  countEnfantsFoyer,
  mergeFoyerMembers,
} from "./foyer-utils";

function contact(partial: Partial<Contact> & Pick<Contact, "id">): Contact {
  return {
    categorie: "CLIENT",
    nom: "TEST",
    prenom: "A",
    statut_suivi: "ACTIF",
    created_at: 0,
    updated_at: 0,
    ...partial,
  };
}

describe("getContactsForFoyer", () => {
  it("filtre par foyer_id (string ou number)", () => {
    const contacts = [
      contact({ id: 1, foyer_id: 10 }),
      contact({ id: 2, foyer_id: 20 }),
      contact({ id: 3, foyer_id: "10" as unknown as number }),
    ];
    expect(getContactsForFoyer(contacts, 10).map((c) => c.id)).toEqual([1, 3]);
  });
});

describe("buildFoyerNomFromMembers", () => {
  it("compose un nom unique ou hyphené", () => {
    expect(
      buildFoyerNomFromMembers([
        contact({ id: 1, nom: "Dupont" }),
        contact({ id: 2, nom: "Martin" }),
      ])
    ).toBe("Foyer DUPONT - MARTIN");
    expect(
      buildFoyerNomFromMembers([contact({ id: 1, nom: "Dupont" })])
    ).toBe("Foyer DUPONT");
  });
});

describe("findExistingFoyerByFamilleName", () => {
  const foyers: Foyer[] = [
    {
      id: 1,
      nom: "Foyer A",
      type_foyer: "COUPLE",
      created_at: 0,
      updated_at: 0,
    },
    {
      id: 2,
      nom: "Famille B",
      type_foyer: "FAMILLE",
      created_at: 0,
      updated_at: 0,
    },
  ];

  it("match exact", () => {
    expect(findExistingFoyerByFamilleName(foyers, "A")?.id).toBe(1);
  });

  it("match par nom nu", () => {
    expect(findExistingFoyerByFamilleName(foyers, "B")?.id).toBe(2);
  });
});

describe("countEnfantsFoyer", () => {
  it("compte les membres avec rôle ENFANT", () => {
    const members = [
      contact({ id: 1, role_foyer: "DECLARANT_1" }),
      contact({ id: 2, role_foyer: "ENFANT" }),
      contact({ id: 3, role_foyer: "ENFANT" }),
    ];
    expect(countEnfantsFoyer(members)).toBe(2);
  });
});

describe("mergeFoyerMembers", () => {
  it("inclut le contact courant sans doublon", () => {
    const self = contact({ id: 1, role_foyer: "DECLARANT_1" });
    const others = [
      contact({ id: 1, role_foyer: "DECLARANT_1" }),
      contact({ id: 2, role_foyer: "ENFANT" }),
    ];
    expect(mergeFoyerMembers(self, others).map((m) => m.id)).toEqual([1, 2]);
  });
});

describe("formatFoyerMemberLabel", () => {
  it("affiche le rôle foyer", () => {
    expect(
      formatFoyerMemberLabel(
        contact({ id: 1, prenom: "Jean", nom: "NOM1" }),
        "DECLARANT_1"
      )
    ).toBe("Jean NOM1 · Déclarant 1");
  });
});

describe("sumPatrimoineCentimes", () => {
  const invs = [
    { montant_initial: 100_00, origine: "MON_CONSEIL" as const },
    { montant_initial: 50_00, origine: "EXISTANT_CLIENT" as const },
  ];

  it("total ou avec moi seulement", () => {
    expect(sumPatrimoineCentimes(invs)).toBe(150_00);
    expect(sumPatrimoineCentimes(invs, { avecMoiOnly: true })).toBe(100_00);
  });
});
