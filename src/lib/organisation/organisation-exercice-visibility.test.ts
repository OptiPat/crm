import { describe, expect, it } from "vitest";
import type { Contact } from "@/lib/api/tauri-contacts";
import type { FilleulDossier } from "@/lib/api/tauri-filleul-dossier";
import { fiscalYearStartUnix } from "@/lib/pipe/remuneration-fiscal-year";
import {
  isDownlineVisibleInExercice,
  resolveVisibleDownlineParrainId,
} from "@/lib/organisation/organisation-exercice-visibility";
import { indexContactsById } from "@/lib/organisation/organisation-tree";

function contact(partial: Partial<Contact> & Pick<Contact, "id" | "nom" | "prenom">): Contact {
  return {
    categorie: "AUCUN",
    statut_suivi: "AUCUN",
    created_at: 0,
    updated_at: 0,
    ...partial,
  };
}

describe("organisation-exercice-visibility", () => {
  const exercice = "2024-2025";
  const inExercice = (fiscalYearStartUnix(exercice) ?? 0) + 86_400 * 30;
  const beforeExercice = (fiscalYearStartUnix(exercice) ?? 0) - 86_400;

  it("masque un désinscrit sorti avant l'exercice", () => {
    const c = contact({
      id: 5,
      nom: "OUT",
      prenom: "Ancien",
      filleul_categorie: "FILLEUL_DESINSCRIT",
      date_inscription_filleul: beforeExercice - 86_400 * 100,
      parrain_id: 2,
    });
    const dossiers = new Map<number, FilleulDossier>([
      [
        5,
        {
          contactId: 5,
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

    expect(
      isDownlineVisibleInExercice(c, { exerciceLabel: exercice, dossiersByContactId: dossiers })
    ).toBe(false);
  });

  it("affiche un désinscrit sorti pendant l'exercice", () => {
    const c = contact({
      id: 6,
      nom: "OUT",
      prenom: "Recent",
      filleul_categorie: "FILLEUL_DESINSCRIT",
      date_inscription_filleul: beforeExercice,
      parrain_id: 2,
    });
    const dossiers = new Map<number, FilleulDossier>([
      [
        6,
        {
          contactId: 6,
          dateInvitation: null,
          dateInscription: beforeExercice,
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

    expect(
      isDownlineVisibleInExercice(c, { exerciceLabel: exercice, dossiersByContactId: dossiers })
    ).toBe(true);
  });

  it("remonte au parrain visible si le parrain direct est absent de l'exercice", () => {
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
    const dossiers = new Map<number, FilleulDossier>([
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
    const byId = indexContactsById(contacts);
    const child = contacts[3]!;

    expect(
      resolveVisibleDownlineParrainId(child, 2, byId, {
        exerciceLabel: exercice,
        dossiersByContactId: dossiers,
      })
    ).toBe(3);
  });
});
