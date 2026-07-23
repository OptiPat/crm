import { describe, expect, it } from "vitest";
import type { Contact } from "@/lib/api/tauri-contacts";
import {
  buildOrganisationTree,
  collectOrganisationDossierContactIds,
  groupDesinscritsByParrain,
  isOrganisationDownlineMember,
  resolveOrganisationSelfContact,
} from "./organisation-tree";
import { fiscalYearStartUnix } from "@/lib/pipe/remuneration-fiscal-year";

function contact(partial: Partial<Contact> & Pick<Contact, "id" | "nom" | "prenom">): Contact {
  return {
    categorie: "AUCUN",
    statut_suivi: "AUCUN",
    created_at: 0,
    updated_at: 0,
    ...partial,
  };
}

describe("organisation-tree", () => {
  it("isOrganisationDownlineMember exclut prospects et suspects", () => {
    expect(
      isOrganisationDownlineMember(
        contact({ id: 1, nom: "A", prenom: "B", filleul_categorie: "FILLEUL" })
      )
    ).toBe(true);
    expect(
      isOrganisationDownlineMember(
        contact({ id: 2, nom: "A", prenom: "B", filleul_categorie: "FILLEUL_DESINSCRIT" })
      )
    ).toBe(true);
    expect(
      isOrganisationDownlineMember(
        contact({ id: 3, nom: "A", prenom: "B", filleul_categorie: "PROSPECT_FILLEUL" })
      )
    ).toBe(false);
  });

  it("resolveOrganisationSelfContact matche le profil CGP", () => {
    const contacts = [
      contact({ id: 10, nom: "DUPONT", prenom: "Jean" }),
      contact({ id: 11, nom: "MARTIN", prenom: "Sophie" }),
    ];
    expect(
      resolveOrganisationSelfContact(contacts, { nom: "Dupont", prenom: "Jean" })?.id
    ).toBe(10);
  });

  it("buildOrganisationTree sépare générations actives et désinscrits", () => {
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
        id: 6,
        nom: "Y",
        prenom: "Prospect",
        filleul_categorie: "PROSPECT_FILLEUL",
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

    expect(tree.selfContact?.id).toBe(2);
    expect(tree.upline).toHaveLength(1);
    expect(tree.generations).toHaveLength(2);
    expect(tree.generations[0]?.map((n) => n.contact.prenom).sort()).toEqual([
      "Bruno",
      "Melanie",
    ]);
    expect(tree.generations[1]?.map((n) => n.contact.id)).toEqual([7]);
    expect(tree.generations[1]?.[0]?.parrainLabel).toBe("Bruno MARTIN");
    expect(tree.generations[1]?.[0]?.parrainId).toBe(3);
    expect(tree.desinscrits).toHaveLength(1);
    expect(tree.desinscrits[0]?.contact.id).toBe(5);
    expect(tree.desinscrits[0]?.parrainId).toBe(2);
    expect(tree.desinscrits[0]?.parrainLabel).toBe("Moi");
    expect(tree.stats).toEqual({ actifs: 3, desinscrits: 1, total: 4 });
  });

  it("intègre les désinscrits de l'exercice dans l'arbre", () => {
    const exercice = "2024-2025";
    const inExercice = (fiscalYearStartUnix(exercice) ?? 0) + 86_400 * 30;
    const contacts = [
      contact({ id: 2, nom: "CGP", prenom: "Moi", filleul_categorie: "FILLEUL" }),
      contact({
        id: 3,
        nom: "MARTIN",
        prenom: "Bruno",
        filleul_categorie: "FILLEUL",
        parrain_id: 2,
        date_inscription_filleul: inExercice - 86_400 * 400,
      }),
      contact({
        id: 5,
        nom: "X",
        prenom: "Out",
        filleul_categorie: "FILLEUL_DESINSCRIT",
        parrain_id: 2,
        date_inscription_filleul: inExercice - 86_400 * 200,
      }),
    ];
    const dossiers = new Map([
      [
        5,
        {
          contactId: 5,
          dateInvitation: null,
          dateInscription: inExercice - 86_400 * 200,
          dateDesinscription: inExercice,
          datePremiereSouscriptionImo: null,
          datePremiereSouscriptionPlacement: null,
          datePremiereSouscriptionScpi: null,
          datePassageManager: null,
          dateHabilitationCif: null,
          datePremierVaaOuVa: null,
          notes: null,
          updatedAt: 0,
        },
      ],
    ]);

    const tree = buildOrganisationTree(contacts, { nom: "CGP", prenom: "Moi" }, {
      exerciceLabel: exercice,
      dossiersByContactId: dossiers,
    });

    expect(tree.desinscrits).toHaveLength(0);
    expect(tree.generations[0]?.map((n) => n.contact.id).sort()).toEqual([3, 5]);
    expect(tree.generations[0]?.find((n) => n.contact.id === 5)?.isDesinscrit).toBe(true);
    expect(tree.stats).toEqual({ actifs: 1, desinscrits: 1, total: 2 });
  });

  it("garde le compteur désinscrits quand hideDesinscrits masque l'affichage", () => {
    const exercice = "2024-2025";
    const inExercice = (fiscalYearStartUnix(exercice) ?? 0) + 86_400 * 30;
    const contacts = [
      contact({ id: 2, nom: "CGP", prenom: "Moi", filleul_categorie: "FILLEUL" }),
      contact({
        id: 5,
        nom: "X",
        prenom: "Out",
        filleul_categorie: "FILLEUL_DESINSCRIT",
        parrain_id: 2,
        date_inscription_filleul: inExercice - 86_400 * 200,
      }),
    ];
    const dossiers = new Map([
      [
        5,
        {
          contactId: 5,
          dateInvitation: null,
          dateInscription: inExercice - 86_400 * 200,
          dateDesinscription: inExercice,
          datePremiereSouscriptionImo: null,
          datePremiereSouscriptionPlacement: null,
          datePremiereSouscriptionScpi: null,
          datePassageManager: null,
          dateHabilitationCif: null,
          datePremierVaaOuVa: null,
          notes: null,
          updatedAt: 0,
        },
      ],
    ]);
    const options = {
      exerciceLabel: exercice,
      dossiersByContactId: dossiers,
    };
    const visible = buildOrganisationTree(contacts, { nom: "CGP", prenom: "Moi" }, options);
    const hidden = buildOrganisationTree(contacts, { nom: "CGP", prenom: "Moi" }, {
      ...options,
      hideDesinscrits: true,
    });
    expect(hidden.stats.desinscrits).toBe(visible.stats.desinscrits);
    expect(hidden.generations.flat().some((node) => node.isDesinscrit)).toBe(false);
  });

  it("promote un filleul au parrain visible quand le parrain direct est absent de l'exercice", () => {
    const exercice = "2024-2025";
    const beforeExercice = (fiscalYearStartUnix(exercice) ?? 0) - 86_400;
    const inExercice = (fiscalYearStartUnix(exercice) ?? 0) + 86_400 * 30;
    const contacts = [
      contact({ id: 2, nom: "CGP", prenom: "Moi", filleul_categorie: "FILLEUL" }),
      contact({
        id: 3,
        nom: "PARRAIN",
        prenom: "Actif",
        filleul_categorie: "FILLEUL",
        parrain_id: 2,
        date_inscription_filleul: beforeExercice - 86_400 * 200,
      }),
      contact({
        id: 4,
        nom: "GHOST",
        prenom: "Out",
        filleul_categorie: "FILLEUL_DESINSCRIT",
        parrain_id: 3,
        date_inscription_filleul: beforeExercice - 86_400 * 100,
      }),
      contact({
        id: 5,
        nom: "ENFANT",
        prenom: "Actif",
        filleul_categorie: "FILLEUL",
        parrain_id: 4,
        date_inscription_filleul: inExercice,
      }),
    ];
    const dossiers = new Map([
      [
        4,
        {
          contactId: 4,
          dateInvitation: null,
          dateInscription: beforeExercice - 86_400 * 100,
          dateDesinscription: beforeExercice,
          datePremiereSouscriptionImo: null,
          datePremiereSouscriptionPlacement: null,
          datePremiereSouscriptionScpi: null,
          datePassageManager: null,
          dateHabilitationCif: null,
          datePremierVaaOuVa: null,
          notes: null,
          updatedAt: 0,
        },
      ],
    ]);

    const tree = buildOrganisationTree(contacts, { nom: "CGP", prenom: "Moi" }, {
      exerciceLabel: exercice,
      dossiersByContactId: dossiers,
    });

    const child = tree.generations.flat().find((node) => node.contact.id === 5);
    expect(child).toBeDefined();
    expect(child?.generation).toBe(2);
    expect(child?.parrainId).toBe(3);
    expect(tree.generations[0]?.some((node) => node.contact.id === 3)).toBe(true);
  });

  it("collectOrganisationDossierContactIds inclut tout le downline", () => {
    const contacts = [
      contact({ id: 2, nom: "CGP", prenom: "Moi", filleul_categorie: "FILLEUL" }),
      contact({
        id: 5,
        nom: "X",
        prenom: "Out",
        filleul_categorie: "FILLEUL_DESINSCRIT",
        parrain_id: 2,
      }),
    ];
    const self = resolveOrganisationSelfContact(contacts, { nom: "CGP", prenom: "Moi" });
    expect(collectOrganisationDossierContactIds(contacts, self)).toEqual([2, 5]);
  });

  it("groupDesinscritsByParrain distingue Moi et filleuls actifs parrain", () => {
    const contacts = [
      contact({ id: 2, nom: "CGP", prenom: "Moi", filleul_categorie: "FILLEUL" }),
      contact({
        id: 3,
        nom: "MARTIN",
        prenom: "Bruno",
        filleul_categorie: "FILLEUL",
        parrain_id: 2,
      }),
      contact({
        id: 5,
        nom: "X",
        prenom: "Direct",
        filleul_categorie: "FILLEUL_DESINSCRIT",
        parrain_id: 2,
      }),
      contact({
        id: 8,
        nom: "Y",
        prenom: "SousBruno",
        filleul_categorie: "FILLEUL_DESINSCRIT",
        parrain_id: 3,
      }),
    ];
    const tree = buildOrganisationTree(contacts, { nom: "CGP", prenom: "Moi" });
    const groups = groupDesinscritsByParrain(tree.desinscrits);
    expect(groups).toHaveLength(2);
    expect(groups[0]?.parrainLabel).toBe("Moi");
    expect(groups[0]?.entries.map((e) => e.contact.id)).toEqual([5]);
    expect(groups[1]?.parrainLabel).toBe("Bruno MARTIN");
    expect(groups[1]?.parrainId).toBe(3);
  });
});
