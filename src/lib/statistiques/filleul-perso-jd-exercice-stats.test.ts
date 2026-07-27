import { describe, expect, it } from "vitest";
import type { Contact } from "@/lib/api/tauri-contacts";
import type { FilleulDossier } from "@/lib/api/tauri-filleul-dossier";
import { fiscalYearStartUnix } from "@/lib/pipe/remuneration-fiscal-year";
import {
  computeFilleulPersoJdExerciceStats,
  computeFilleulPersoJdExerciceSummary,
  FILLEUL_PERSO_JD_EXERCICE_SUMMARY_METRICS,
  formatFilleulPersoJdConversionRate,
} from "./filleul-perso-jd-exercice-stats";

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

describe("filleul-perso-jd-exercice-stats", () => {
  const selfId = 1;
  const exercice = "2024-2025";
  const invitation = Math.floor(Date.parse("2024-09-15T00:00:00Z") / 1000);
  const inscription = Math.floor(Date.parse("2025-02-10T00:00:00Z") / 1000);
  const beforeExercice = (fiscalYearStartUnix(exercice) ?? 0) - 86_400 * 30;

  it("compte invitations JD, présents et inscrits parrainés par moi sur l'exercice", () => {
    const contacts = [
      contact({
        id: 10,
        filleul_categorie: "PROSPECT_FILLEUL",
        parrain_id: selfId,
        type_invitation_filleul: "JD",
        date_invitation_filleul: invitation,
        presence_invitation_filleul: 1,
      }),
      contact({
        id: 11,
        filleul_categorie: "FILLEUL",
        parrain_id: selfId,
        type_invitation_filleul: "JD",
        date_invitation_filleul: invitation,
        presence_invitation_filleul: 1,
        date_inscription_filleul: inscription,
      }),
      contact({
        id: 12,
        filleul_categorie: "PROSPECT_FILLEUL",
        parrain_id: 99,
        type_invitation_filleul: "JD",
        date_invitation_filleul: invitation,
        presence_invitation_filleul: 1,
      }),
      contact({
        id: 13,
        filleul_categorie: "PROSPECT_FILLEUL",
        parrain_id: selfId,
        type_invitation_filleul: "PO",
        date_invitation_filleul: invitation,
        presence_invitation_filleul: 1,
      }),
    ];
    const dossiersByContactId = new Map([
      [10, dossier(10, { dateInvitation: invitation })],
      [11, dossier(11, { dateInvitation: invitation, dateInscription: inscription })],
      [12, dossier(12, { dateInvitation: invitation })],
      [13, dossier(13, { dateInvitation: invitation })],
    ]);

    const stats = computeFilleulPersoJdExerciceStats(contacts, exercice, {
      organisationSelfContactId: selfId,
      dossiersByContactId,
    });
    expect(stats.jdInvitationCount).toBe(2);
    expect(stats.jdPresenceCount).toBe(2);
    expect(stats.inscribedCount).toBe(1);
  });

  it("compte un filleul inscrit sans parrain explicite (orphelin rattaché à Moi)", () => {
    const contacts = [
      contact({
        id: 20,
        filleul_categorie: "FILLEUL",
        parrain_id: undefined,
        type_invitation_filleul: "JD",
        date_invitation_filleul: invitation,
        presence_invitation_filleul: 1,
        date_inscription_filleul: inscription,
      }),
    ];
    const dossiersByContactId = new Map([
      [20, dossier(20, { dateInvitation: invitation, dateInscription: inscription })],
    ]);

    const stats = computeFilleulPersoJdExerciceStats(contacts, exercice, {
      organisationSelfContactId: selfId,
      dossiersByContactId,
    });
    expect(stats.inscribedCount).toBe(1);
  });

  it("inscrits sur la date d'inscription, pas seulement l'invitation", () => {
    const nextExercice = "2025-2026";
    const nextInscription = Math.floor(Date.parse("2025-10-01T00:00:00Z") / 1000);
    const contacts = [
      contact({
        id: 30,
        filleul_categorie: "FILLEUL",
        parrain_id: selfId,
        type_invitation_filleul: "JD",
        date_invitation_filleul: invitation,
        presence_invitation_filleul: 1,
        date_inscription_filleul: nextInscription,
      }),
    ];
    const dossiersByContactId = new Map([
      [30, dossier(30, { dateInvitation: invitation, dateInscription: nextInscription })],
    ]);
    const options = {
      organisationSelfContactId: selfId,
      dossiersByContactId,
    };

    expect(computeFilleulPersoJdExerciceStats(contacts, exercice, options).inscribedCount).toBe(0);
    expect(
      computeFilleulPersoJdExerciceStats(contacts, nextExercice, options).inscribedCount
    ).toBe(1);
  });

  it("compte un filleul désinscrit (inscrit à un moment donné)", () => {
    const inscription2019 = Math.floor(Date.parse("2019-01-24T12:00:00") / 1000);
    const exercice2018 = "2018-2019";
    const contacts = [
      contact({
        id: 50,
        filleul_categorie: "FILLEUL_DESINSCRIT",
        parrain_id: selfId,
        type_invitation_filleul: "JD",
        date_invitation_filleul: inscription2019,
        presence_invitation_filleul: 1,
        date_inscription_filleul: inscription2019,
      }),
    ];
    const dossiersByContactId = new Map([
      [
        50,
        dossier(50, {
          dateInvitation: inscription2019,
          dateInscription: inscription2019,
          dateDesinscription: Math.floor(Date.parse("2020-01-24T12:00:00") / 1000),
        }),
      ],
    ]);

    const stats = computeFilleulPersoJdExerciceStats(contacts, exercice2018, {
      organisationSelfContactId: selfId,
      dossiersByContactId,
    });
    expect(stats.inscribedCount).toBe(1);
  });

  it("calcule le taux de conversion inscrits / invitations JD", () => {
    const contacts = [
      contact({
        id: 60,
        filleul_categorie: "FILLEUL",
        parrain_id: selfId,
        type_invitation_filleul: "JD",
        date_invitation_filleul: invitation,
        presence_invitation_filleul: 1,
        date_inscription_filleul: inscription,
      }),
      contact({
        id: 61,
        filleul_categorie: "PROSPECT_FILLEUL",
        parrain_id: selfId,
        type_invitation_filleul: "JD",
        date_invitation_filleul: invitation,
        presence_invitation_filleul: 1,
      }),
    ];
    const dossiersByContactId = new Map([
      [60, dossier(60, { dateInvitation: invitation, dateInscription: inscription })],
      [61, dossier(61, { dateInvitation: invitation })],
    ]);

    const stats = computeFilleulPersoJdExerciceStats(contacts, exercice, {
      organisationSelfContactId: selfId,
      dossiersByContactId,
    });
    expect(stats.jdInvitationCount).toBe(2);
    expect(stats.inscribedCount).toBe(1);

    const summary = computeFilleulPersoJdExerciceSummary([exercice], contacts, {
      organisationSelfContactId: selfId,
      dossiersByContactId,
    });
    expect(summary[0].conversionRate).toBe(50);
    expect(formatFilleulPersoJdConversionRate(1, 0)).toBe("—");
  });

  it("agrège les totaux sur les exercices affichés", () => {
    const exerciceA = "2023-2024";
    const exerciceB = "2024-2025";
    const invitationA = Math.floor(Date.parse("2023-09-15T00:00:00Z") / 1000);
    const invitationB = Math.floor(Date.parse("2024-09-15T00:00:00Z") / 1000);
    const inscriptionA = Math.floor(Date.parse("2024-01-10T00:00:00Z") / 1000);
    const contacts = [
      contact({
        id: 70,
        filleul_categorie: "FILLEUL",
        parrain_id: selfId,
        type_invitation_filleul: "JD",
        date_invitation_filleul: invitationA,
        presence_invitation_filleul: 1,
        date_inscription_filleul: inscriptionA,
      }),
      contact({
        id: 71,
        filleul_categorie: "PROSPECT_FILLEUL",
        parrain_id: selfId,
        type_invitation_filleul: "JD",
        date_invitation_filleul: invitationB,
        presence_invitation_filleul: 1,
      }),
    ];
    const dossiersByContactId = new Map([
      [70, dossier(70, { dateInvitation: invitationA, dateInscription: inscriptionA })],
      [71, dossier(71, { dateInvitation: invitationB })],
    ]);
    const options = {
      organisationSelfContactId: selfId,
      dossiersByContactId,
    };
    const summary = computeFilleulPersoJdExerciceSummary([exerciceA, exerciceB], contacts, options);
    const invitationsMetric = FILLEUL_PERSO_JD_EXERCICE_SUMMARY_METRICS.find(
      (m) => m.id === "jdInvitationCount"
    )!;
    const conversionMetric = FILLEUL_PERSO_JD_EXERCICE_SUMMARY_METRICS.find(
      (m) => m.id === "conversionRate"
    )!;

    expect(invitationsMetric.formatTotal(summary)).toBe("2");
    expect(conversionMetric.formatTotal(summary)).toBe("50 %");
  });

  it("ignore une invitation hors exercice", () => {
    const contacts = [
      contact({
        id: 40,
        filleul_categorie: "PROSPECT_FILLEUL",
        parrain_id: selfId,
        type_invitation_filleul: "JD",
        date_invitation_filleul: beforeExercice,
        presence_invitation_filleul: 1,
      }),
    ];

    const stats = computeFilleulPersoJdExerciceStats(contacts, exercice, {
      organisationSelfContactId: selfId,
    });
    expect(stats.jdInvitationCount).toBe(0);
  });
});
