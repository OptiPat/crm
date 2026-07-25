import { describe, expect, it } from "vitest";
import type { Contact } from "@/lib/api/tauri-contacts";
import type { FilleulDossier } from "@/lib/api/tauri-filleul-dossier";
import { fiscalYearStartUnix } from "@/lib/pipe/remuneration-fiscal-year";
import {
  computeFilleulParrainageDurationExerciceStats,
  computeFilleulParrainageDurationStats,
  resolveFilleulInscriptionToParrainageDurationMonths,
  resolveFirstParrainageInscriptionUnix,
} from "./filleul-parrainage-duration-stats";

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

describe("filleul-parrainage-duration-stats", () => {
  const exercice = "2024-2025";
  const start = fiscalYearStartUnix(exercice) ?? 0;
  const beforeExercice = start - 86_400 * 30;

  it("calcule les mois entre inscription et premier parrainage", () => {
    const jan1 = Math.floor(Date.parse("2024-01-01T00:00:00Z") / 1000);
    const jul1 = Math.floor(Date.parse("2024-07-01T00:00:00Z") / 1000);
    const contacts = [
      contact({
        id: 10,
        filleul_categorie: "FILLEUL",
        date_inscription_filleul: jan1,
      }),
      contact({
        id: 20,
        filleul_categorie: "FILLEUL",
        parrain_id: 10,
        date_inscription_filleul: jul1,
      }),
    ];
    const dossiersByContactId = new Map([
      [10, dossier(10, { dateInscription: jan1 })],
      [20, dossier(20, { dateInscription: jul1 })],
    ]);

    expect(
      resolveFirstParrainageInscriptionUnix(10, contacts, dossiersByContactId)
    ).toBe(jul1);
    expect(
      resolveFilleulInscriptionToParrainageDurationMonths(
        contacts[0],
        contacts,
        dossiersByContactId
      )
    ).toBe(6);
  });

  it("ignore un premier parrainage antérieur à l'inscription du parrain", () => {
    const jan1 = Math.floor(Date.parse("2024-01-01T00:00:00Z") / 1000);
    const beforeInscription = Math.floor(Date.parse("2023-06-01T00:00:00Z") / 1000);
    const contacts = [
      contact({
        id: 10,
        filleul_categorie: "FILLEUL",
        date_inscription_filleul: jan1,
      }),
      contact({
        id: 20,
        filleul_categorie: "FILLEUL",
        parrain_id: 10,
        date_inscription_filleul: beforeInscription,
      }),
    ];
    const dossiersByContactId = new Map([
      [10, dossier(10, { dateInscription: jan1 })],
      [20, dossier(20, { dateInscription: beforeInscription })],
    ]);

    expect(
      resolveFilleulInscriptionToParrainageDurationMonths(
        contacts[0],
        contacts,
        dossiersByContactId
      )
    ).toBeNull();
  });

  it("exclut les consultants sans parrainage du calcul de moyenne", () => {
    const jan1 = Math.floor(Date.parse("2023-01-01T00:00:00Z") / 1000);
    const sep1 = Math.floor(Date.parse("2023-09-01T00:00:00Z") / 1000);
    const contacts = [
      contact({ id: 10, filleul_categorie: "FILLEUL", date_inscription_filleul: jan1 }),
      contact({ id: 11, filleul_categorie: "FILLEUL", date_inscription_filleul: jan1 }),
      contact({
        id: 20,
        filleul_categorie: "PROSPECT_FILLEUL",
        parrain_id: 10,
        date_inscription_filleul: sep1,
      }),
    ];
    const dossiersByContactId = new Map([
      [10, dossier(10, { dateInscription: jan1 })],
      [20, dossier(20, { dateInscription: sep1 })],
    ]);

    const stats = computeFilleulParrainageDurationStats(contacts, { dossiersByContactId });
    expect(stats.totalEligible).toBe(2);
    expect(stats.countedCount).toBe(1);
    expect(stats.missingParrainageCount).toBe(1);
    expect(stats.averageMonths).toBe(8);
  });

  it("filtre par exercice sur la date d'inscription du consultant", () => {
    const inscription = Math.floor(Date.parse("2024-09-01T00:00:00Z") / 1000);
    const parrainage = Math.floor(Date.parse("2024-12-01T00:00:00Z") / 1000);
    const contacts = [
      contact({
        id: 10,
        filleul_categorie: "FILLEUL_DESINSCRIT",
        date_inscription_filleul: inscription,
      }),
      contact({
        id: 11,
        filleul_categorie: "FILLEUL",
        date_inscription_filleul: beforeExercice,
      }),
      contact({
        id: 20,
        filleul_categorie: "PROSPECT_FILLEUL",
        parrain_id: 10,
        date_inscription_filleul: parrainage,
      }),
    ];
    const dossiersByContactId = new Map([
      [10, dossier(10, { dateInscription: inscription })],
      [20, dossier(20, { dateInscription: parrainage })],
    ]);

    const stats = computeFilleulParrainageDurationExerciceStats(contacts, exercice, {
      dossiersByContactId,
    });
    expect(stats.totalEligible).toBe(1);
    expect(stats.countedCount).toBe(1);
    expect(stats.averageMonths).toBe(3);
  });

  it("ignore un prospect parrainé sans date d'inscription", () => {
    const jan1 = Math.floor(Date.parse("2024-01-01T00:00:00Z") / 1000);
    const invitation = Math.floor(Date.parse("2024-06-01T00:00:00Z") / 1000);
    const contacts = [
      contact({ id: 10, filleul_categorie: "FILLEUL", date_inscription_filleul: jan1 }),
      contact({
        id: 20,
        filleul_categorie: "PROSPECT_FILLEUL",
        parrain_id: 10,
        date_invitation_filleul: invitation,
      }),
    ];
    const dossiersByContactId = new Map([
      [10, dossier(10, { dateInscription: jan1 })],
      [20, dossier(20, { dateInvitation: invitation })],
    ]);

    expect(
      resolveFilleulInscriptionToParrainageDurationMonths(
        contacts[0],
        contacts,
        dossiersByContactId
      )
    ).toBeNull();
  });
});
