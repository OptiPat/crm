import { describe, expect, it } from "vitest";
import type { Contact } from "@/lib/api/tauri-contacts";
import type { FilleulDossier } from "@/lib/api/tauri-filleul-dossier";
import { fiscalYearStartUnix } from "@/lib/pipe/remuneration-fiscal-year";
import { computeOrganisationObjectifObservedStats } from "./organisation-objectif-observed-stats";

function contact(partial: Partial<Contact> & Pick<Contact, "id">): Contact {
  return {
    categorie: "AUCUN",
    nom: "DUPONT",
    prenom: "Jean",
    statut_suivi: "ACTIF",
    created_at: 0,
    updated_at: 0,
    ...partial,
  };
}

function dossier(
  contactId: number,
  partial: Partial<FilleulDossier> = {}
): FilleulDossier {
  return {
    contactId,
    dateInvitation: null,
    dateInscription: null,
    dateDesinscription: null,
    datePremiereSouscriptionImo: null,
    datePremiereSouscriptionPlacement: null,
    datePremiereSouscriptionScpi: null,
    datePassageManager: null,
    dateHabilitationCif: null,
    datePremierVaaOuVa: null,
    notes: null,
    updatedAt: 1,
    ...partial,
  };
}

describe("computeOrganisationObjectifObservedStats", () => {
  const objectifExercice = "2025-2026";
  const observedExercice = "2024-2025";
  const prevPrev = "2023-2024";
  const prevPrevStart = fiscalYearStartUnix(prevPrev) ?? 0;
  const observedStart = fiscalYearStartUnix(observedExercice) ?? 0;
  const objectifStart = fiscalYearStartUnix(objectifExercice) ?? 0;
  const beforePrevPrev = prevPrevStart - 86_400 * 30;
  const inObserved = observedStart + 86_400 * 30;
  const inObjectif = objectifStart + 86_400 * 30;

  it("retourne les stats de l'exercice n-1 (croissance, attrition, taux)", () => {
    const contacts = [
      contact({
        id: 1,
        filleul_categorie: "FILLEUL",
        date_inscription_filleul: beforePrevPrev,
        filleul_volume: 100_000,
      }),
      contact({
        id: 2,
        filleul_categorie: "FILLEUL",
        date_inscription_filleul: beforePrevPrev,
        filleul_volume: 200_000,
      }),
      contact({
        id: 21,
        filleul_categorie: "FILLEUL",
        parrain_id: 2,
        date_inscription_filleul: inObserved,
        filleul_volume: 0,
      }),
      contact({
        id: 3,
        filleul_categorie: "FILLEUL",
        date_inscription_filleul: inObserved,
        filleul_volume: 50_000,
      }),
      contact({
        id: 4,
        filleul_categorie: "FILLEUL",
        date_inscription_filleul: inObjectif,
        filleul_volume: 10_000,
      }),
    ];
    const dossiersByContactId = new Map([
      [1, dossier(1, { dateInscription: beforePrevPrev })],
      [2, dossier(2, { dateInscription: beforePrevPrev })],
      [21, dossier(21, { dateInscription: inObserved })],
      [3, dossier(3, { dateInscription: inObserved })],
      [4, dossier(4, { dateInscription: inObjectif })],
    ]);

    const stats = computeOrganisationObjectifObservedStats(contacts, objectifExercice, {
      closedExerciceLabels: [],
      dossiersByContactId,
      organisationSelfContactId: 1,
      historyRecordsByLabel: new Map(),
    });

    expect(stats.exerciceLabel).toBe(observedExercice);
    expect(stats.targetGrowthPercent).toBe(100);
    expect(stats.attritionPercent).toBe(0);
    expect(stats.sponsorsRatePercent).toBe(50);
    expect(stats.teamActiveRatePercent).toBe(66.7);
    expect(stats.personalVolume).toBe(100_000);
    expect(stats.teamAverageVolume).toBe(125_000);
  });

  it("retourne null si aucun exercice précédent", () => {
    const stats = computeOrganisationObjectifObservedStats([], "invalide", {
      closedExerciceLabels: [],
      historyRecordsByLabel: new Map(),
    });
    expect(stats.exerciceLabel).toBeNull();
    expect(stats.targetGrowthPercent).toBeNull();
  });
});
