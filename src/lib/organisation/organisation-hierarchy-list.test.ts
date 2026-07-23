import { describe, expect, it } from "vitest";
import type { Contact } from "@/lib/api/tauri-contacts";
import { buildOrganisationTree } from "@/lib/organisation/organisation-tree";
import { buildOrganisationVolumeRows } from "@/lib/organisation/organisation-branch-volumes";
import {
  buildOrganisationHierarchyList,
  collectHierarchyExpandIdsToContact,
  defaultHierarchyExpandedIds,
  expandHierarchyToGeneration,
  resolveHierarchyFocusZone,
} from "@/lib/organisation/organisation-hierarchy-list";

function contact(partial: Partial<Contact> & Pick<Contact, "id" | "nom" | "prenom">): Contact {
  return {
    categorie: "AUCUN",
    statut_suivi: "AUCUN",
    created_at: 0,
    updated_at: 0,
    ...partial,
  };
}

describe("organisation-hierarchy-list", () => {
  const contacts = [
    contact({ id: 1, nom: "ROOT", prenom: "Top", filleul_categorie: "FILLEUL" }),
    contact({
      id: 2,
      nom: "CGP",
      prenom: "Moi",
      filleul_categorie: "FILLEUL",
      parrain_id: 1,
    }),
    contact({
      id: 3,
      nom: "MARTIN",
      prenom: "Bruno",
      filleul_categorie: "FILLEUL",
      parrain_id: 2,
      filleul_volume: 50_000,
    }),
    contact({
      id: 4,
      nom: "DURAND",
      prenom: "Melanie",
      filleul_categorie: "FILLEUL",
      parrain_id: 2,
    }),
    contact({
      id: 5,
      nom: "X",
      prenom: "Out",
      filleul_categorie: "FILLEUL_DESINSCRIT",
      parrain_id: 2,
    }),
    contact({
      id: 7,
      nom: "PETIT",
      prenom: "Alexandre",
      filleul_categorie: "FILLEUL",
      parrain_id: 3,
    }),
  ];

  const tree = buildOrganisationTree(contacts, { nom: "CGP", prenom: "Moi" });
  const volumeRows = buildOrganisationVolumeRows(tree, contacts);
  const list = buildOrganisationHierarchyList(tree, contacts, volumeRows);

  it("construit une arborescence active sous le CGP", () => {
    expect(list.root?.contact.id).toBe(2);
    expect(list.root?.children.map((n) => n.contact.id).sort()).toEqual([3, 4]);
    expect(list.root?.children[0]?.children[0]?.contact.id).toBe(7);
    expect(list.upline).toHaveLength(1);
    expect(list.desinscrits).toHaveLength(1);
    expect(list.desinscrits[0]?.contact.id).toBe(5);
  });

  it("compte les descendants actifs", () => {
    expect(list.root?.descendantCount).toBe(3);
    expect(list.root?.children.find((n) => n.contact.id === 3)?.descendantCount).toBe(1);
  });

  it("déplie par défaut vous + niveau 1", () => {
    const expanded = defaultHierarchyExpandedIds(list);
    expect(expanded.has(2)).toBe(true);
    expect(expanded.has(3)).toBe(true);
    expect(expanded.has(4)).toBe(true);
    expect(expanded.has(7)).toBe(false);
  });

  it("calcule le chemin de dépliage vers un contact profond", () => {
    const path = collectHierarchyExpandIdsToContact(7, 2, contacts);
    expect(path).toEqual(expect.arrayContaining([2, 3]));
    expect(path).toHaveLength(2);
  });

  it("déplie jusqu'à un niveau de génération", () => {
    const expanded = expandHierarchyToGeneration(list.root, 2);
    expect(expanded.has(2)).toBe(true);
    expect(expanded.has(3)).toBe(true);
    expect(expanded.has(7)).toBe(true);
  });

  it("résout la zone de focus pour actifs, upline et désinscrits", () => {
    expect(resolveHierarchyFocusZone(7, list)).toBe("active");
    expect(resolveHierarchyFocusZone(1, list)).toBe("upline");
    expect(resolveHierarchyFocusZone(5, list)).toBe("desinscrit");
    expect(resolveHierarchyFocusZone(999, list)).toBeNull();
  });
});
