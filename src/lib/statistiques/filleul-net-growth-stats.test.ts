import { describe, expect, it } from "vitest";
import type { Contact } from "@/lib/api/tauri-contacts";
import type { FilleulDossier } from "@/lib/api/tauri-filleul-dossier";
import { fiscalYearStartUnix } from "@/lib/pipe/remuneration-fiscal-year";
import {
  computeFilleulNetGrowthExerciceStats,
  formatFilleulNetGrowthPercent,
} from "./filleul-net-growth-stats";

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

describe("filleul-net-growth-stats", () => {
  const exercice = "2024-2025";
  const previous = "2023-2024";
  const prevStart = fiscalYearStartUnix(previous) ?? 0;
  const currStart = fiscalYearStartUnix(exercice) ?? 0;
  const beforePrev = prevStart - 86_400 * 30;
  const inCurrent = currStart + 86_400 * 30;

  it("calcule la croissance % entre consultants présents sur deux exercices", () => {
    const contacts = [
      contact({
        id: 10,
        filleul_categorie: "FILLEUL",
        date_inscription_filleul: beforePrev,
      }),
      contact({
        id: 11,
        filleul_categorie: "FILLEUL",
        date_inscription_filleul: beforePrev,
      }),
      contact({
        id: 20,
        filleul_categorie: "FILLEUL",
        date_inscription_filleul: inCurrent,
      }),
    ];
    const dossiersByContactId = new Map([
      [10, dossier(10, { dateInscription: beforePrev })],
      [11, dossier(11, { dateInscription: beforePrev })],
      [20, dossier(20, { dateInscription: inCurrent })],
    ]);

    const stats = computeFilleulNetGrowthExerciceStats(contacts, exercice, {
      dossiersByContactId,
    });
    expect(stats.previousExerciceLabel).toBe(previous);
    expect(stats.previousCount).toBe(2);
    expect(stats.currentCount).toBe(3);
    expect(stats.netGrowth).toBe(1);
    expect(stats.growthPercent).toBe(50);
    expect(formatFilleulNetGrowthPercent(stats.growthPercent!)).toBe("+50 %");
  });

  it("exclut les consultants désinscrits pendant l'exercice du comptage actif", () => {
    const start = fiscalYearStartUnix(exercice) ?? 0;
    const duringExercice = start + 86_400 * 60;
    const contacts = [
      contact({
        id: 10,
        filleul_categorie: "FILLEUL",
        date_inscription_filleul: start - 86_400 * 30,
      }),
      contact({
        id: 11,
        filleul_categorie: "FILLEUL_DESINSCRIT",
        date_inscription_filleul: start - 86_400 * 30,
      }),
    ];
    const dossiersByContactId = new Map([
      [10, dossier(10, { dateInscription: start - 86_400 * 30 })],
      [
        11,
        dossier(11, {
          dateInscription: start - 86_400 * 30,
          dateDesinscription: duringExercice,
        }),
      ],
    ]);

    const stats = computeFilleulNetGrowthExerciceStats(contacts, exercice, {
      dossiersByContactId,
    });
    expect(stats.currentCount).toBe(1);
    expect(stats.currentContactIds).toEqual([10]);
  });

  it("retourne null si aucun consultant sur l'exercice précédent", () => {
    const contacts = [
      contact({
        id: 20,
        filleul_categorie: "FILLEUL",
        date_inscription_filleul: inCurrent,
      }),
    ];
    const dossiersByContactId = new Map([[20, dossier(20, { dateInscription: inCurrent })]]);

    const stats = computeFilleulNetGrowthExerciceStats(contacts, exercice, {
      dossiersByContactId,
    });
    expect(stats.previousCount).toBe(0);
    expect(stats.currentCount).toBe(1);
    expect(stats.growthPercent).toBeNull();
  });
});
