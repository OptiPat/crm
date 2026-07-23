import { describe, expect, it } from "vitest";
import type { Contact } from "@/lib/api/tauri-contacts";
import {
  computeClientAttritionStats,
  computeFilleulAttritionStats,
  computeFilleulAttritionExerciceStats,
  filterContactsForClientAttritionLens,
  filterContactsForFilleulAttritionLens,
  filterContactsForFilleulAttritionExerciceLens,
  isContactEligibleForClientAttritionStats,
  isContactEligibleForFilleulAttritionStats,
} from "./contact-attrition-stats";
import { fiscalYearStartUnix } from "@/lib/pipe/remuneration-fiscal-year";

function contact(partial: Partial<Contact> & Pick<Contact, "id">): Contact {
  return {
    categorie: "CLIENT",
    nom: "DUPONT",
    prenom: "Jean",
    statut_suivi: "ACTIF",
    created_at: 0,
    updated_at: 0,
    ...partial,
  };
}

describe("contact-attrition-stats", () => {
  it("calcule l'attrition client (anciens / clients actifs + anciens)", () => {
    const contacts = [
      contact({ id: 1, categorie: "CLIENT", statut_suivi: "ACTIF" }),
      contact({ id: 2, categorie: "CLIENT", statut_suivi: "ACTIF" }),
      contact({ id: 3, categorie: "CLIENT", statut_suivi: "EN_PAUSE" }),
      contact({ id: 4, categorie: "PROSPECT_CLIENT" }),
      contact({ id: 5, categorie: "SUSPECT_CLIENT" }),
    ];

    const stats = computeClientAttritionStats(contacts);
    expect(stats.totalCount).toBe(3);
    expect(stats.activeCount).toBe(2);
    expect(stats.attritedCount).toBe(1);
    expect(stats.attritionPercent).toBeCloseTo(33.3, 1);
  });

  it("exclut les suspects clients de l'attrition client", () => {
    expect(isContactEligibleForClientAttritionStats({ categorie: "SUSPECT_CLIENT" })).toBe(false);
    expect(isContactEligibleForClientAttritionStats({ categorie: "PROSPECT_CLIENT" })).toBe(false);
    expect(isContactEligibleForClientAttritionStats({ categorie: "CLIENT" })).toBe(true);
  });

  it("calcule l'attrition filleul tous parrains confondus", () => {
    const contacts = [
      contact({
        id: 1,
        categorie: "AUCUN",
        filleul_categorie: "FILLEUL",
        parrain_id: 99,
      }),
      contact({
        id: 2,
        categorie: "AUCUN",
        filleul_categorie: "FILLEUL",
        parrain_id: 12,
      }),
      contact({
        id: 3,
        categorie: "AUCUN",
        filleul_categorie: "FILLEUL_DESINSCRIT",
        parrain_id: 12,
      }),
      contact({
        id: 4,
        categorie: "AUCUN",
        filleul_categorie: "PROSPECT_FILLEUL",
        parrain_id: 99,
      }),
      contact({
        id: 5,
        categorie: "AUCUN",
        filleul_categorie: "SUSPECT_FILLEUL",
        parrain_id: 99,
      }),
    ];

    const stats = computeFilleulAttritionStats(contacts);
    expect(stats.totalCount).toBe(3);
    expect(stats.activeCount).toBe(2);
    expect(stats.attritedCount).toBe(1);
    expect(stats.attritionPercent).toBeCloseTo(33.3, 1);
  });

  it("calcule l'attrition filleul sur l'exercice (désinscriptions / cohorte au 01/08)", () => {
    const exercice = "2025-2026";
    const start = fiscalYearStartUnix(exercice) ?? 0;
    const inExercice = start + 86_400 * 30;
    const beforeStart = start - 86_400 * 30;

    const contacts = [
      contact({
        id: 1,
        categorie: "AUCUN",
        filleul_categorie: "FILLEUL",
        date_inscription_filleul: beforeStart,
      }),
      contact({
        id: 2,
        categorie: "AUCUN",
        filleul_categorie: "FILLEUL_DESINSCRIT",
        date_inscription_filleul: beforeStart,
      }),
      contact({
        id: 3,
        categorie: "AUCUN",
        filleul_categorie: "FILLEUL_DESINSCRIT",
        date_inscription_filleul: beforeStart,
      }),
      contact({
        id: 4,
        categorie: "AUCUN",
        filleul_categorie: "FILLEUL",
        date_inscription_filleul: start + 86_400 * 10,
      }),
    ];

    const dossiersByContactId = new Map([
      [
        2,
        {
          contactId: 2,
          dateInvitation: null,
          dateInscription: beforeStart,
          dateDesinscription: inExercice,
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
      [
        3,
        {
          contactId: 3,
          dateInvitation: null,
          dateInscription: beforeStart,
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

    const stats = computeFilleulAttritionExerciceStats(contacts, exercice, {
      dossiersByContactId,
    });
    expect(stats.totalCount).toBe(2);
    expect(stats.attritedCount).toBe(1);
    expect(stats.activeCount).toBe(1);
    expect(stats.attritionPercent).toBe(50);

    expect(
      filterContactsForFilleulAttritionExerciceLens(contacts, "attrited", exercice, {
        dossiersByContactId,
      }).map((c) => c.id)
    ).toEqual([2]);
  });

  it("inclut un client aussi filleul inscrit dans les deux lentilles", () => {
    const dual = contact({
      id: 10,
      categorie: "CLIENT",
      statut_suivi: "ACTIF",
      filleul_categorie: "FILLEUL",
      parrain_id: 99,
    });
    expect(isContactEligibleForClientAttritionStats(dual)).toBe(true);
    expect(isContactEligibleForFilleulAttritionStats(dual)).toBe(true);
  });

  it("filtre les contacts actifs et attrités", () => {
    const contacts = [
      contact({ id: 1, categorie: "CLIENT", statut_suivi: "ACTIF" }),
      contact({ id: 2, categorie: "CLIENT", statut_suivi: "EN_PAUSE" }),
      contact({
        id: 3,
        categorie: "AUCUN",
        filleul_categorie: "FILLEUL",
      }),
      contact({
        id: 4,
        categorie: "AUCUN",
        filleul_categorie: "FILLEUL_DESINSCRIT",
      }),
    ];

    expect(filterContactsForClientAttritionLens(contacts, "active").map((c) => c.id)).toEqual([1]);
    expect(filterContactsForClientAttritionLens(contacts, "attrited").map((c) => c.id)).toEqual([2]);
    expect(filterContactsForFilleulAttritionLens(contacts, "active").map((c) => c.id)).toEqual([3]);
    expect(filterContactsForFilleulAttritionLens(contacts, "attrited").map((c) => c.id)).toEqual([4]);
  });
});
