import { describe, expect, it } from "vitest";
import type { Contact } from "@/lib/api/tauri-contacts";
import { buildFamilleGroups } from "@/lib/familles/build-famille-groups";
import {
  coreMemberCount,
  filterFamilleGroupsByStat,
  findFamilleKeyForContact,
  searchFamilleGroups,
  sortFamilleGroups,
} from "@/lib/familles/familles-search";

function contact(
  partial: Partial<Contact> & Pick<Contact, "id" | "nom" | "prenom">
): Contact {
  return {
    categorie: "CLIENT",
    statut_suivi: "ACTIF",
    created_at: 0,
    updated_at: 0,
    ...partial,
  };
}

describe("familles-search", () => {
  const contacts = [
    contact({ id: 1, nom: "Martin", prenom: "Paul" }),
    contact({ id: 2, nom: "Martin", prenom: "Jacques" }),
    contact({ id: 10, nom: "Dupont", prenom: "Anne", famille_id: 5 }),
    contact({ id: 11, nom: "Dupont", prenom: "Luc", famille_id: 5 }),
  ];
  const groups = buildFamilleGroups(
    contacts,
    [],
    [{ id: 5, nom: "Dupont", notes: null, created_at: 0, updated_at: 0 }],
    {},
    {}
  );

  it("searchFamilleGroups trouve un membre par prénom", () => {
    const result = searchFamilleGroups("Jacques", groups);
    expect(result.groups.map((g) => g.key)).toEqual(["auto:MARTIN"]);
    expect(result.focusContactId).toBe(2);
  });

  it("findFamilleKeyForContact retrouve la clé", () => {
    expect(findFamilleKeyForContact(11, groups)).toBe("manual:5");
  });

  it("filterFamilleGroupsByStat sépare manuel et auto", () => {
    expect(filterFamilleGroupsByStat(groups, "manual")).toHaveLength(1);
    expect(filterFamilleGroupsByStat(groups, "auto")).toHaveLength(1);
  });

  it("sortFamilleGroups trie par nom", () => {
    const sorted = sortFamilleGroups(groups, "name_asc");
    expect(sorted[0].nom <= sorted[1].nom).toBe(true);
  });

  it("coreMemberCount ignore conjoints et enfants affichés via le foyer", () => {
    const contacts = [
      contact({
        id: 1,
        nom: "VIRE",
        prenom: "Rachel",
        role_famille: "MERE",
        foyer_id: 100,
        famille_id: 20,
      }),
      contact({
        id: 2,
        nom: "ARAMENDIA",
        prenom: "Lison",
        role_famille: "FILLE",
        role_foyer: "ENFANT",
        foyer_id: 100,
        famille_id: 20,
      }),
      contact({
        id: 3,
        nom: "ARAMENDIA",
        prenom: "Lucas",
        role_famille: "FILS",
        role_foyer: "ENFANT",
        foyer_id: 100,
      }),
    ];
    const groups = buildFamilleGroups(
      contacts,
      [],
      [{ id: 20, nom: "VIRE", notes: null, created_at: 0, updated_at: 0 }],
      {},
      {}
    );
    const manual = groups.find((g) => g.isManual);
    expect(coreMemberCount(manual!)).toBe(2);
  });
});
