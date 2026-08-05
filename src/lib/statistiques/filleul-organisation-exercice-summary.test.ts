import { describe, expect, it } from "vitest";
import type { Contact } from "@/lib/api/tauri-contacts";
import { fiscalYearStartUnix } from "@/lib/pipe/remuneration-fiscal-year";
import {
  buildFilleulOrganisationExerciceLabels,
  computeAverageOrganisationVolumePerConsultant,
  computeFilleulOrganisationExerciceSummaryRow,
  isLiveFilleulExerciceVolumes,
  pickFilleulOrganisationExerciceLabelsForDisplay,
} from "@/lib/statistiques/filleul-organisation-exercice-summary";

function contact(partial: Partial<Contact> & { id: number }): Contact {
  return {
    id: partial.id,
    nom: partial.nom ?? "NOM",
    prenom: partial.prenom ?? "Prenom",
    categorie: partial.categorie ?? "FILLEUL",
    filleul_categorie: partial.filleul_categorie ?? "FILLEUL",
    parrain_id: partial.parrain_id,
    date_inscription_filleul: partial.date_inscription_filleul,
    filleul_volume: partial.filleul_volume,
    filleul_volume_manager: partial.filleul_volume_manager,
    filleul_titre: partial.filleul_titre,
    filleul_qualification: partial.filleul_qualification,
  } as Contact;
}

describe("filleul-organisation-exercice-summary", () => {
  const now = new Date("2026-07-15T12:00:00Z");

  it("liste les exercices récents en premier, sans exercices futurs", () => {
    const labels = buildFilleulOrganisationExerciceLabels(["2023-2024", "2024-2025"], now);
    expect(labels[0]).toBe("2025-2026");
    expect(labels).toContain("2024-2025");
    expect(labels).toContain("2023-2024");
    expect(labels).not.toContain("2026-2027");
    expect(labels).not.toContain("2027-2028");
  });

  it("affiche 5 exercices récents par défaut, chronologique pour le tableau", () => {
    const labels = buildFilleulOrganisationExerciceLabels(
      ["2020-2021", "2021-2022", "2022-2023", "2023-2024", "2024-2025"],
      now
    );
    const displayed = pickFilleulOrganisationExerciceLabelsForDisplay(labels, false);
    expect(displayed).toHaveLength(5);
    expect(displayed[0]).toBe("2021-2022");
    expect(displayed[4]).toBe("2025-2026");
    expect(displayed).not.toContain("2026-2027");
  });

  it("détecte live vs historique selon clôture", () => {
    expect(isLiveFilleulExerciceVolumes("2025-2026", [], now)).toBe(true);
    expect(isLiveFilleulExerciceVolumes("2025-2026", ["2025-2026"], now)).toBe(false);
    expect(isLiveFilleulExerciceVolumes("2024-2025", [], now)).toBe(false);
  });

  it("compte les consultants actifs sur l'exercice (non désinscrits avant la fin)", () => {
    const exercice = "2024-2025";
    const previous = "2023-2024";
    const prevStart = fiscalYearStartUnix(previous) ?? 0;
    const currStart = fiscalYearStartUnix(exercice) ?? 0;
    const beforePrev = prevStart - 86_400 * 30;
    const inCurrent = currStart + 86_400 * 30;

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
    const dossiersByContactId = new Map(
      contacts.map((c) => [
        c.id,
        {
          contactId: c.id,
          dateInvitation: null,
          dateInscription: c.date_inscription_filleul ?? null,
          dateDesinscription: null,
          datePremiereSouscriptionImo: null,
          datePremiereSouscriptionPlacement: null,
          datePremiereSouscriptionScpi: null,
          datePassageManager: null,
          dateHabilitationCif: null,
          datePremierVaaOuVa: null,
          notes: null,
          updatedAt: 1,
        },
      ])
    );

    const previousRow = computeFilleulOrganisationExerciceSummaryRow(previous, {
      contacts,
      closedExerciceLabels: [],
      dossiersByContactId,
      historyRecordsByLabel: new Map(),
      now,
    });
    const currentRow = computeFilleulOrganisationExerciceSummaryRow(exercice, {
      contacts,
      closedExerciceLabels: [],
      dossiersByContactId,
      historyRecordsByLabel: new Map(),
      now,
    });

    expect(previousRow.inscribedConsultantCount).toBe(2);
    expect(currentRow.inscribedConsultantCount).toBe(3);
    expect(currentRow.netGrowthPercent).toBe(50);
    expect(currentRow.parrainageCount).toBe(0);
  });

  it("calcule le volume moyen / consultant comme volume org. ÷ effectif net", () => {
    expect(computeAverageOrganisationVolumePerConsultant(1_894_732, 12)).toBeCloseTo(157_894.33, 1);
    expect(computeAverageOrganisationVolumePerConsultant(null, 12)).toBeNull();
    expect(computeAverageOrganisationVolumePerConsultant(100_000, 0)).toBeNull();
  });

  it("calcule volume organisation (branche CGP) sur exercice courant", () => {
    const selfId = 1;
    const contacts = [
      contact({
        id: selfId,
        nom: "Dupont",
        prenom: "Jean",
        categorie: "CGP",
        filleul_categorie: null,
        filleul_volume: 100_000,
      }),
      contact({
        id: 2,
        parrain_id: selfId,
        filleul_volume: 200_000,
        date_inscription_filleul: Math.floor(new Date("2025-09-01").getTime() / 1000),
      }),
      contact({
        id: 3,
        parrain_id: selfId,
        filleul_volume: 50_000,
        date_inscription_filleul: Math.floor(new Date("2025-10-01").getTime() / 1000),
      }),
    ];

    const row = computeFilleulOrganisationExerciceSummaryRow("2025-2026", {
      contacts,
      closedExerciceLabels: [],
      historyRecordsByLabel: new Map(),
      cgp: { nom: "Dupont", prenom: "Jean" },
      now,
    });

    expect(row.organisationBranchVolume).toBe(350_000);
    expect(row.averageVolume).toBeCloseTo(116_666.67, 1);
    expect(row.averageVolumePerConsultant).toBeCloseTo(116_666.67, 1);
    expect(row.activePercent).toBe(100);
    expect(row.parrainageCount).toBe(2);
  });

  it("affiche — pour les volumes sans snapshot sur exercice passé", () => {
    const contacts = [
      contact({
        id: 2,
        filleul_volume: 500_000,
        date_inscription_filleul: Math.floor(new Date("2024-09-01").getTime() / 1000),
      }),
    ];

    const row = computeFilleulOrganisationExerciceSummaryRow("2024-2025", {
      contacts,
      closedExerciceLabels: [],
      historyRecordsByLabel: new Map(),
      now,
    });

    expect(row.organisationBranchVolume).toBeNull();
    expect(row.averageVolume).toBeNull();
    expect(row.averageVolumePerConsultant).toBeNull();
  });
});
