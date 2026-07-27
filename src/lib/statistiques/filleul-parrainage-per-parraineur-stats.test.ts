import { describe, expect, it } from "vitest";
import type { Contact } from "@/lib/api/tauri-contacts";
import type { FilleulDossier } from "@/lib/api/tauri-filleul-dossier";
import { fiscalYearStartUnix } from "@/lib/pipe/remuneration-fiscal-year";
import {
  computeFilleulParrainagePerParraineurExerciceStats,
  computeFilleulParrainagePerParraineurStats,
  filterContactsForFilleulParrainagesExerciceList,
} from "./filleul-parrainage-per-parraineur-stats";

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

describe("filleul-parrainage-per-parraineur-stats", () => {
  const exercice = "2024-2025";
  const start = fiscalYearStartUnix(exercice) ?? 0;
  const beforeExercice = start - 86_400 * 30;

  it("calcule la moyenne de parrainages par parraineur (cumul)", () => {
    const jan1 = Math.floor(Date.parse("2023-01-01T00:00:00Z") / 1000);
    const contacts = [
      contact({ id: 10, filleul_categorie: "FILLEUL", date_inscription_filleul: jan1 }),
      contact({ id: 11, filleul_categorie: "FILLEUL", date_inscription_filleul: jan1 }),
      contact({ id: 20, filleul_categorie: "FILLEUL", parrain_id: 10, date_inscription_filleul: jan1 }),
      contact({ id: 21, filleul_categorie: "FILLEUL", parrain_id: 10, date_inscription_filleul: jan1 }),
      contact({ id: 22, filleul_categorie: "FILLEUL", parrain_id: 11, date_inscription_filleul: jan1 }),
    ];

    const stats = computeFilleulParrainagePerParraineurStats(contacts);
    expect(stats.totalParrainages).toBe(3);
    expect(stats.parraineurCount).toBe(2);
    expect(stats.averagePerParraineur).toBe(1.5);
    expect(stats.totalEligible).toBe(5);
    expect(stats.otherContactIds).toEqual([20, 21, 22]);
  });

  it("filtre les parrainages par exercice sur la date d'affiliation du filleul", () => {
    const inscription = Math.floor(Date.parse("2024-09-01T00:00:00Z") / 1000);
    const parrainage = Math.floor(Date.parse("2024-12-01T00:00:00Z") / 1000);
    const contacts = [
      contact({
        id: 10,
        filleul_categorie: "FILLEUL",
        date_inscription_filleul: inscription,
      }),
      contact({
        id: 11,
        filleul_categorie: "FILLEUL",
        date_inscription_filleul: beforeExercice,
      }),
      contact({
        id: 20,
        filleul_categorie: "FILLEUL",
        parrain_id: 10,
        date_inscription_filleul: parrainage,
      }),
      contact({
        id: 21,
        filleul_categorie: "PROSPECT_FILLEUL",
        parrain_id: 10,
        date_invitation_filleul: parrainage,
      }),
      contact({
        id: 22,
        filleul_categorie: "FILLEUL",
        parrain_id: 11,
        date_inscription_filleul: beforeExercice,
      }),
    ];
    const dossiersByContactId = new Map([
      [10, dossier(10, { dateInscription: inscription })],
      [11, dossier(11, { dateInscription: beforeExercice })],
      [20, dossier(20, { dateInscription: parrainage })],
      [21, dossier(21, { dateInvitation: parrainage })],
    ]);

    const stats = computeFilleulParrainagePerParraineurExerciceStats(contacts, exercice, {
      dossiersByContactId,
    });
    expect(stats.totalParrainages).toBe(1);
    expect(stats.parraineurCount).toBe(1);
    expect(stats.averagePerParraineur).toBe(1);
    expect(stats.totalEligible).toBe(4);
    expect(stats.otherContactIds).toEqual([11, 20, 22]);
  });

  it("attribue les parrainages orphelins au contact Moi sur l'exercice", () => {
    const parrainage = Math.floor(Date.parse("2024-12-01T00:00:00Z") / 1000);
    const selfId = 1;
    const contacts = [
      contact({
        id: selfId,
        categorie: "CGP",
        filleul_categorie: null,
        date_inscription_filleul: beforeExercice,
      }),
      contact({
        id: 20,
        filleul_categorie: "FILLEUL",
        date_inscription_filleul: parrainage,
      }),
    ];
    const dossiersByContactId = new Map([
      [selfId, dossier(selfId, { dateInscription: beforeExercice })],
      [20, dossier(20, { dateInscription: parrainage })],
    ]);

    const stats = computeFilleulParrainagePerParraineurExerciceStats(contacts, exercice, {
      dossiersByContactId,
      organisationSelfContactId: selfId,
    });
    expect(stats.totalParrainages).toBe(1);
    expect(stats.parraineurCount).toBe(0);
    expect(stats.averagePerParraineur).toBeNull();
  });

  it("liste aussi les parrainages orphelins rattachés au contact Moi (cohérence avec le total)", () => {
    const parrainage = Math.floor(Date.parse("2024-12-01T00:00:00Z") / 1000);
    const selfId = 1;
    const contacts = [
      contact({
        id: selfId,
        categorie: "CGP",
        filleul_categorie: null,
        date_inscription_filleul: beforeExercice,
      }),
      contact({
        id: 20,
        filleul_categorie: "FILLEUL",
        date_inscription_filleul: parrainage,
      }),
    ];
    const dossiersByContactId = new Map([
      [selfId, dossier(selfId, { dateInscription: beforeExercice })],
      [20, dossier(20, { dateInscription: parrainage })],
    ]);

    const parraines = filterContactsForFilleulParrainagesExerciceList(contacts, exercice, {
      dossiersByContactId,
      organisationSelfContactId: selfId,
    });
    expect(parraines.map((c) => c.id)).toEqual([20]);
  });

  it("liste les filleuls parrainés sur l'exercice (affiliations)", () => {
    const inscription = Math.floor(Date.parse("2024-09-01T00:00:00Z") / 1000);
    const parrainage = Math.floor(Date.parse("2024-12-01T00:00:00Z") / 1000);
    const contacts = [
      contact({
        id: 10,
        filleul_categorie: "FILLEUL",
        date_inscription_filleul: inscription,
      }),
      contact({
        id: 20,
        filleul_categorie: "FILLEUL",
        parrain_id: 10,
        date_inscription_filleul: parrainage,
      }),
      contact({
        id: 21,
        filleul_categorie: "PROSPECT_FILLEUL",
        parrain_id: 10,
        date_invitation_filleul: parrainage,
      }),
      contact({
        id: 22,
        filleul_categorie: "FILLEUL",
        parrain_id: 10,
        date_inscription_filleul: beforeExercice,
      }),
    ];
    const dossiersByContactId = new Map([
      [10, dossier(10, { dateInscription: inscription })],
      [20, dossier(20, { dateInscription: parrainage })],
      [21, dossier(21, { dateInvitation: parrainage })],
    ]);

    const parraines = filterContactsForFilleulParrainagesExerciceList(contacts, exercice, {
      dossiersByContactId,
    });
    expect(parraines.map((c) => c.id)).toEqual([20]);
  });
});
