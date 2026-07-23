import { describe, expect, it } from "vitest";
import type { Contact } from "@/lib/api/tauri-contacts";
import type { FilleulDossier } from "@/lib/api/tauri-filleul-dossier";
import { fiscalYearStartUnix } from "@/lib/pipe/remuneration-fiscal-year";
import { wasConsultantInNetworkDuringExercice } from "./organisation-exercice-membership";

function contact(partial: Partial<Contact> & Pick<Contact, "id" | "nom" | "prenom">): Contact {
  return {
    categorie: "AUCUN",
    statut_suivi: "AUCUN",
    created_at: 0,
    updated_at: 0,
    ...partial,
  };
}

describe("wasConsultantInNetworkDuringExercice", () => {
  const exercice = "2024-2025";
  const beforeStart = (fiscalYearStartUnix(exercice) ?? 0) - 86_400;

  it("exclut un désinscrit sorti avant l'exercice", () => {
    const consultant = contact({
      id: 10,
      nom: "OUT",
      prenom: "Ancien",
      filleul_categorie: "FILLEUL_DESINSCRIT",
      date_inscription_filleul: beforeStart - 86_400 * 30,
    });
    const dossiersByContactId = new Map<number, FilleulDossier>([
      [
        10,
        {
          contactId: 10,
          dateInvitation: null,
          dateInscription: beforeStart - 86_400 * 30,
          dateDesinscription: beforeStart,
          datePremiereSouscriptionImo: null,
          datePremiereSouscriptionPlacement: null,
          datePremiereSouscriptionScpi: null,
          datePassageManager: null,
          dateHabilitationCif: null,
          datePremierVaaOuVa: null,
          notes: null,
          updatedAt: 1,
        },
      ],
    ]);

    expect(
      wasConsultantInNetworkDuringExercice(consultant, exercice, dossiersByContactId)
    ).toBe(false);
  });

  it("inclut un FILLEUL actif sans date de désinscription dossier", () => {
    const consultant = contact({
      id: 11,
      nom: "ACTIF",
      prenom: "Encore",
      filleul_categorie: "FILLEUL",
      date_inscription_filleul: beforeStart,
    });

    expect(wasConsultantInNetworkDuringExercice(consultant, exercice)).toBe(true);
  });
});
