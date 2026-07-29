import { describe, expect, it } from "vitest";
import type { Contact } from "@/lib/api/tauri-contacts";
import type { FilleulDossier } from "@/lib/api/tauri-filleul-dossier";
import { fiscalYearStartUnix } from "@/lib/pipe/remuneration-fiscal-year";
import { wasActifConsultantDuringExercice, wasConsultantInNetworkDuringExercice, wasInscribedConsultantDuringExercice } from "./organisation-exercice-membership";

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

  it("wasActifConsultantDuringExercice exclut un désinscrit pendant l'exercice", () => {
    const start = fiscalYearStartUnix(exercice) ?? 0;
    const duringExercice = start + 86_400 * 60;
    const consultant = contact({
      id: 12,
      nom: "PARTI",
      prenom: "Mi",
      filleul_categorie: "FILLEUL_DESINSCRIT",
      date_inscription_filleul: start - 86_400 * 30,
    });
    const dossiersByContactId = new Map<number, FilleulDossier>([
      [
        12,
        {
          contactId: 12,
          dateInvitation: null,
          dateInscription: start - 86_400 * 30,
          dateDesinscription: duringExercice,
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
    ).toBe(true);
    expect(
      wasActifConsultantDuringExercice(consultant, exercice, { dossiersByContactId })
    ).toBe(false);
  });

  it("inclut un FILLEUL même si son statut client est Prescripteur (double rôle légitime)", () => {
    const consultant = contact({
      id: 13,
      nom: "DOUBLE",
      prenom: "Role",
      categorie: "PRESCRIPTEUR",
      filleul_categorie: "FILLEUL",
      date_inscription_filleul: beforeStart,
    });

    expect(wasConsultantInNetworkDuringExercice(consultant, exercice)).toBe(true);
  });

  it("wasInscribedConsultantDuringExercice inclut le contact Moi (CGP)", () => {
    const cgp = contact({
      id: 1,
      nom: "Dupont",
      prenom: "Jean",
      categorie: "CGP",
      filleul_categorie: null,
    });
    expect(
      wasInscribedConsultantDuringExercice(cgp, exercice, {
        organisationSelfContactId: 1,
      })
    ).toBe(true);
    expect(wasConsultantInNetworkDuringExercice(cgp, exercice)).toBe(false);
  });
});
