import { describe, expect, it } from "vitest";
import type { Contact } from "@/lib/api/tauri-contacts";
import type { FilleulVolumeExercice } from "@/lib/api/tauri-filleul-volumes";
import type { CgpConfig } from "@/lib/api/tauri-settings";
import {
  currentFiscalYearLabel,
  listSelectableFiscalYearLabels,
} from "@/lib/pipe/remuneration-fiscal-year";
import { buildOrganisationTree } from "@/lib/organisation/organisation-tree";
import {
  buildOrganisationVolumeRowsForExercice,
  buildOrganisationExerciceOptions,
  ORGANISATION_CURRENT_EXERCICE,
  resolveOrganisationExerciceLabel,
} from "@/lib/organisation/organisation-volume-history";

const baseContacts = [
  {
    id: 1,
    nom: "MOI",
    prenom: "CGP",
    categorie: "AUCUN",
    filleul_categorie: "FILLEUL",
    filleul_volume: 50_000,
    statut_suivi: "ACTIF",
    created_at: 0,
    updated_at: 0,
  },
  {
    id: 2,
    nom: "FILLEUL",
    prenom: "Direct",
    categorie: "AUCUN",
    filleul_categorie: "FILLEUL",
    parrain_id: 1,
    filleul_volume: 200_000,
    statut_suivi: "ACTIF",
    created_at: 0,
    updated_at: 0,
  },
] as Contact[];

describe("organisation-volume-history", () => {
  const tree = buildOrganisationTree(baseContacts, {
    prenom: "CGP",
    nom: "MOI",
  } as CgpConfig);

  it("propose l'exercice courant et les exercices clôturés", () => {
    const options = buildOrganisationExerciceOptions(["2023-2024", "2024-2025"]);
    expect(options[0]?.value).toBe(ORGANISATION_CURRENT_EXERCICE);
    expect(options.some((o) => o.value === "2023-2024")).toBe(true);
  });

  it("reconstruit les lignes historiques avec volume branche calculé", () => {
    const rows = buildOrganisationVolumeRowsForExercice(tree, baseContacts, {
      mode: "history",
      recordsByContactId: new Map<number, FilleulVolumeExercice>([
        [
          2,
          {
            contactId: 2,
            exerciceLabel: "2023-2024",
            volumePropre: 180_000,
            volumeBranche: 600_000,
            volumeManager: 900_000,
            closedAt: 1,
            source: "cloture",
          },
        ],
      ]),
    });
    const filleul = rows.find((row) => row.contactId === 2);
    expect(filleul?.ownVolume).toBe(180_000);
    expect(filleul?.branchVolume).toBe(180_000);
    expect(filleul?.managerVolume).toBe(900_000);
  });

  it("calcule le volume branche historique comme somme propre + descendance", () => {
    const contacts = [
      ...baseContacts,
      {
        id: 3,
        nom: "PETIT",
        prenom: "Fils",
        categorie: "AUCUN",
        filleul_categorie: "FILLEUL",
        parrain_id: 2,
        filleul_volume: 0,
        statut_suivi: "ACTIF",
        created_at: 0,
        updated_at: 0,
      },
    ] as Contact[];
    const treeWithDepth = buildOrganisationTree(contacts, {
      prenom: "CGP",
      nom: "MOI",
    } as CgpConfig);
    const rows = buildOrganisationVolumeRowsForExercice(treeWithDepth, contacts, {
      mode: "history",
      recordsByContactId: new Map<number, FilleulVolumeExercice>([
        [
          2,
          {
            contactId: 2,
            exerciceLabel: "2023-2024",
            volumePropre: 100_000,
            volumeBranche: 999_999,
            volumeManager: null,
            closedAt: 1,
            source: "cloture",
          },
        ],
        [
          3,
          {
            contactId: 3,
            exerciceLabel: "2023-2024",
            volumePropre: 50_000,
            volumeBranche: 50_000,
            volumeManager: null,
            closedAt: 1,
            source: "cloture",
          },
        ],
      ]),
    });
    const filleul = rows.find((row) => row.contactId === 2);
    expect(filleul?.branchVolume).toBe(150_000);
  });

  it("résout le label courant", () => {
    const now = new Date(2026, 5, 1);
    expect(resolveOrganisationExerciceLabel(ORGANISATION_CURRENT_EXERCICE, now)).toBe("2025-2026");
    expect(listSelectableFiscalYearLabels(now)).toContain("2025-2026");
    expect(currentFiscalYearLabel(now)).toBe("2025-2026");
  });
});
