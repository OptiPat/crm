import { describe, expect, it } from "vitest";
import type { Contact } from "@/lib/api/tauri-contacts";
import {
  buildPrescripteurTree,
  computePrescripteursRacines,
} from "@/lib/prescripteurs/prescripteur-tree";
import {
  expandPathForContact,
  findPrescripteurRacineId,
  getPrescripteurRacineIds,
  searchPrescripteurRoots,
} from "@/lib/prescripteurs/prescripteur-search";
import {
  collectAllTreeContactIds,
  findPathInPrescripteurTree,
  treeContainsContact,
} from "@/lib/prescripteurs/prescripteur-tree-nav";

function contact(
  partial: Partial<Contact> & Pick<Contact, "id" | "nom" | "prenom">
): Contact {
  return {
    categorie: "CLIENT",
    statut_suivi: "ACTIF",
    created_at: 0,
    updated_at: 0,
    ...partial,
  } as Contact;
}

describe("prescripteur-tree-nav", () => {
  const root = contact({
    id: 1,
    nom: "RACINE",
    prenom: "Paul",
    categorie: "PRESCRIPTEUR",
  });
  const child = contact({ id: 2, nom: "ENFANT", prenom: "Luc", prescripteur_id: 1 });
  const grand = contact({ id: 3, nom: "PETIT", prenom: "Jean", prescripteur_id: 2 });
  const contacts = [root, child, grand];
  const tree = buildPrescripteurTree(root, {
    contacts,
    investissementsByContact: {},
    investissementsByFoyer: {},
    foyersInfo: {},
  });

  it("findPathInPrescripteurTree remonte depuis un petit-enfant", () => {
    expect(findPathInPrescripteurTree(tree, 3)).toEqual([1, 2, 3]);
  });

  it("treeContainsContact détecte un membre", () => {
    expect(treeContainsContact(tree, 2)).toBe(true);
    expect(treeContainsContact(tree, 99)).toBe(false);
  });

  it("collectAllTreeContactIds liste tous les ids", () => {
    expect(collectAllTreeContactIds(tree).sort()).toEqual([1, 2, 3]);
  });
});

describe("prescripteur-search", () => {
  const rootA = contact({
    id: 10,
    nom: "ALPHA",
    prenom: "Anne",
    categorie: "PRESCRIPTEUR",
  });
  const rootB = contact({ id: 20, nom: "BETA", prenom: "Bob", categorie: "PRESCRIPTEUR" });
  const clientA = contact({ id: 11, nom: "CLIENT", prenom: "Zorro", prescripteur_id: 10 });
  const contacts = [rootA, rootB, clientA];
  const racines = computePrescripteursRacines(contacts, {}, {});

  it("findPrescripteurRacineId remonte à la racine", () => {
    const ids = getPrescripteurRacineIds(racines);
    expect(findPrescripteurRacineId(11, contacts, ids)).toBe(10);
  });

  it("searchPrescripteurRoots trouve une racine via un client profond", () => {
    const result = searchPrescripteurRoots("Zorro", racines, contacts, {});
    expect(result.roots.map((r) => r.contact.id)).toEqual([10]);
    expect(result.focusContactId).toBe(11);
  });

  it("expandPathForContact déplie le chemin", () => {
    const tree = buildPrescripteurTree(rootA, {
      contacts,
      investissementsByContact: {},
      investissementsByFoyer: {},
      foyersInfo: {},
    });
    expect(expandPathForContact(tree, 11)).toEqual([10, 11]);
  });
});
