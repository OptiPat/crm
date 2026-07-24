import { describe, expect, it } from "vitest";
import type { Contact } from "@/lib/api/tauri-contacts";
import type { FilleulDossier } from "@/lib/api/tauri-filleul-dossier";
import { fiscalYearStartUnix } from "@/lib/pipe/remuneration-fiscal-year";
import { resolveFilleulPremiereHabilitationTimestamp } from "@/lib/organisation/organisation-filleul-dossier";
import {
  computeFilleulHabilitationDurationExerciceStats,
  computeFilleulHabilitationDurationStats,
  resolveFilleulInscriptionToHabilitationDurationMonths,
} from "./filleul-habilitation-duration-stats";

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

describe("filleul-habilitation-duration-stats", () => {
  const exercice = "2024-2025";
  const start = fiscalYearStartUnix(exercice) ?? 0;
  const beforeExercice = start - 86_400 * 30;

  it("prend la habilitation renseignée la plus proche de l'inscription", () => {
    const jan1 = Math.floor(Date.parse("2024-01-01T00:00:00Z") / 1000);
    const feb1 = Math.floor(Date.parse("2024-02-01T00:00:00Z") / 1000);
    const jun1 = Math.floor(Date.parse("2024-06-01T00:00:00Z") / 1000);
    const row = dossier(1, {
      dateInscription: jan1,
      datePremiereSouscriptionImo: jun1,
      datePremiereSouscriptionPlacement: feb1,
      datePremiereSouscriptionScpi: null,
      dateHabilitationCif: Math.floor(Date.parse("2024-03-01T00:00:00Z") / 1000),
    });

    expect(resolveFilleulPremiereHabilitationTimestamp(jan1, row)).toBe(feb1);
    expect(
      resolveFilleulInscriptionToHabilitationDurationMonths(
        contact({ id: 1, date_inscription_filleul: jan1 }),
        new Map([[1, row]])
      )
    ).toBe(1);
  });

  it("ignore une habilitation antérieure à l'inscription", () => {
    const jan1 = Math.floor(Date.parse("2024-01-01T00:00:00Z") / 1000);
    const beforeInscription = Math.floor(Date.parse("2023-06-01T00:00:00Z") / 1000);
    const row = dossier(1, {
      dateInscription: jan1,
      datePremiereSouscriptionPlacement: beforeInscription,
    });

    expect(
      resolveFilleulInscriptionToHabilitationDurationMonths(
        contact({ id: 1, date_inscription_filleul: jan1 }),
        new Map([[1, row]])
      )
    ).toBeNull();
  });

  it("exclut les consultants sans habilitation MIOBSP / MIA / Agent Lié", () => {
    const jan1 = Math.floor(Date.parse("2023-01-01T00:00:00Z") / 1000);
    const mar1 = Math.floor(Date.parse("2023-03-01T00:00:00Z") / 1000);
    const dossiersByContactId = new Map([
      [1, dossier(1, { dateInscription: jan1, datePremiereSouscriptionPlacement: mar1 })],
    ]);
    const contacts = [
      contact({ id: 1, filleul_categorie: "FILLEUL", date_inscription_filleul: jan1 }),
      contact({ id: 2, filleul_categorie: "FILLEUL", date_inscription_filleul: jan1 }),
    ];

    const stats = computeFilleulHabilitationDurationStats(contacts, { dossiersByContactId });
    expect(stats.totalEligible).toBe(2);
    expect(stats.countedCount).toBe(1);
    expect(stats.missingHabilitationCount).toBe(1);
    expect(stats.averageMonths).toBe(2);
  });

  it("filtre par exercice sur la date d'inscription", () => {
    const inscription = Math.floor(Date.parse("2024-09-01T00:00:00Z") / 1000);
    const habilitation = Math.floor(Date.parse("2024-12-01T00:00:00Z") / 1000);
    const dossiersByContactId = new Map([
      [
        10,
        dossier(10, {
          dateInscription: inscription,
          datePremiereSouscriptionImo: habilitation,
        }),
      ],
      [
        11,
        dossier(11, {
          dateInscription: beforeExercice,
          datePremiereSouscriptionScpi: beforeExercice + 86_400 * 90,
        }),
      ],
    ]);
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
    ];

    const stats = computeFilleulHabilitationDurationExerciceStats(contacts, exercice, {
      dossiersByContactId,
    });
    expect(stats.totalEligible).toBe(1);
    expect(stats.averageMonths).toBe(3);
  });
});
