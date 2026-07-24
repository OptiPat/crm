import { describe, expect, it } from "vitest";
import type { Contact } from "@/lib/api/tauri-contacts";
import { fiscalYearStartUnix } from "@/lib/pipe/remuneration-fiscal-year";
import {
  calendarMonthsBetweenUnix,
  calendarMonthsFromInscriptionToEvent,
  computeFilleulVaaDurationExerciceStats,
  computeFilleulVaaDurationStats,
  filterContactsForFilleulVaaDurationExerciceList,
  resolveFilleulInscriptionToVaaDurationMonths,
} from "./filleul-vaa-duration-stats";

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

describe("filleul-vaa-duration-stats", () => {
  const exercice = "2024-2025";
  const start = fiscalYearStartUnix(exercice) ?? 0;
  const beforeExercice = start - 86_400 * 30;

  it("calcule les mois calendaires entre inscription et 1er VAA/VA", () => {
    const jan1 = Math.floor(Date.parse("2024-01-01T00:00:00Z") / 1000);
    const mar15 = Math.floor(Date.parse("2024-03-15T00:00:00Z") / 1000);
    expect(calendarMonthsBetweenUnix(jan1, mar15)).toBe(2);
    expect(resolveFilleulInscriptionToVaaDurationMonths(
      contact({ id: 1, date_inscription_filleul: jan1 }),
      new Map([
        [
          1,
          {
            contactId: 1,
            dateInvitation: null,
            dateInscription: jan1,
            dateDesinscription: null,
            datePremiereSouscriptionImo: null,
            datePremiereSouscriptionPlacement: null,
            datePremiereSouscriptionScpi: null,
            datePassageManager: null,
            dateHabilitationCif: null,
            datePremierVaaOuVa: mar15,
            notes: null,
            updatedAt: 1,
          },
        ],
      ])
    )).toBe(2);
  });

  it("ignore une date 1er VAA/VA antérieure à l'inscription", () => {
    const jan1 = Math.floor(Date.parse("2024-01-01T00:00:00Z") / 1000);
    const beforeInscription = Math.floor(Date.parse("2023-06-01T00:00:00Z") / 1000);
    expect(calendarMonthsFromInscriptionToEvent(jan1, beforeInscription)).toBeNull();
    expect(
      resolveFilleulInscriptionToVaaDurationMonths(
        contact({ id: 1, date_inscription_filleul: jan1 }),
        new Map([
          [
            1,
            {
              contactId: 1,
              dateInvitation: null,
              dateInscription: jan1,
              dateDesinscription: null,
              datePremiereSouscriptionImo: null,
              datePremiereSouscriptionPlacement: null,
              datePremiereSouscriptionScpi: null,
              datePassageManager: null,
              dateHabilitationCif: null,
              datePremierVaaOuVa: beforeInscription,
              notes: null,
              updatedAt: 1,
            },
          ],
        ])
      )
    ).toBeNull();

    const stats = computeFilleulVaaDurationStats(
      [contact({ id: 1, filleul_categorie: "FILLEUL", date_inscription_filleul: jan1 })],
      {
        dossiersByContactId: new Map([
          [
            1,
            {
              contactId: 1,
              dateInvitation: null,
              dateInscription: jan1,
              dateDesinscription: null,
              datePremiereSouscriptionImo: null,
              datePremiereSouscriptionPlacement: null,
              datePremiereSouscriptionScpi: null,
              datePassageManager: null,
              dateHabilitationCif: null,
              datePremierVaaOuVa: beforeInscription,
              notes: null,
              updatedAt: 1,
            },
          ],
        ]),
      }
    );
    expect(stats.countedCount).toBe(0);
    expect(stats.missingVaaCount).toBe(1);
    expect(stats.averageMonths).toBeNull();
  });

  it("exclut les consultants sans date 1er VAA/VA du calcul de moyenne", () => {
    const jan1 = Math.floor(Date.parse("2023-01-01T00:00:00Z") / 1000);
    const mar1 = Math.floor(Date.parse("2023-03-01T00:00:00Z") / 1000);
    const dossiersByContactId = new Map([
      [
        1,
        {
          contactId: 1,
          dateInvitation: null,
          dateInscription: jan1,
          dateDesinscription: null,
          datePremiereSouscriptionImo: null,
          datePremiereSouscriptionPlacement: null,
          datePremiereSouscriptionScpi: null,
          datePassageManager: null,
          dateHabilitationCif: null,
          datePremierVaaOuVa: mar1,
          notes: null,
          updatedAt: 1,
        },
      ],
    ]);
    const contacts = [
      contact({ id: 1, filleul_categorie: "FILLEUL", date_inscription_filleul: jan1 }),
      contact({ id: 2, filleul_categorie: "FILLEUL", date_inscription_filleul: jan1 }),
    ];

    const stats = computeFilleulVaaDurationStats(contacts, { dossiersByContactId });
    expect(stats.totalEligible).toBe(2);
    expect(stats.countedCount).toBe(1);
    expect(stats.missingVaaCount).toBe(1);
    expect(stats.averageMonths).toBe(2);
  });

  it("filtre par exercice sur la date d'inscription (désinscrit inclus)", () => {
    const inscription = Math.floor(Date.parse("2024-09-01T00:00:00Z") / 1000);
    const premierVaa = Math.floor(Date.parse("2024-12-01T00:00:00Z") / 1000);
    const dossiersByContactId = new Map([
      [
        10,
        {
          contactId: 10,
          dateInvitation: null,
          dateInscription: inscription,
          dateDesinscription: Math.floor(Date.parse("2025-02-01T00:00:00Z") / 1000),
          datePremiereSouscriptionImo: null,
          datePremiereSouscriptionPlacement: null,
          datePremiereSouscriptionScpi: null,
          datePassageManager: null,
          dateHabilitationCif: null,
          datePremierVaaOuVa: premierVaa,
          notes: null,
          updatedAt: 1,
        },
      ],
      [
        11,
        {
          contactId: 11,
          dateInvitation: null,
          dateInscription: beforeExercice,
          dateDesinscription: null,
          datePremiereSouscriptionImo: null,
          datePremiereSouscriptionPlacement: null,
          datePremiereSouscriptionScpi: null,
          datePassageManager: null,
          dateHabilitationCif: null,
          datePremierVaaOuVa: beforeExercice + 86_400 * 90,
          notes: null,
          updatedAt: 1,
        },
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

    const stats = computeFilleulVaaDurationExerciceStats(contacts, exercice, { dossiersByContactId });
    expect(stats.totalEligible).toBe(1);
    expect(stats.countedCount).toBe(1);
    expect(stats.averageMonths).toBe(3);

    const withDuration = filterContactsForFilleulVaaDurationExerciceList(
      contacts,
      "withDuration",
      exercice,
      { dossiersByContactId }
    );
    expect(withDuration.map((row) => row.id)).toEqual([10]);
  });
});
