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
  buildCloseFilleulExerciceSnapshotsFromHistory,
  isLiveFilleulExerciceVolumes,
  ORGANISATION_CURRENT_EXERCICE,
  resolveOrganisationExerciceLabel,
  shouldUseHistoricalFilleulExerciceVolumes,
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
    const options = buildOrganisationExerciceOptions(
      ["2023-2024", "2024-2025"],
      ["2023-2024", "2024-2025"]
    );
    expect(options[0]?.value).toBe(ORGANISATION_CURRENT_EXERCICE);
    expect(options.some((o) => o.value === "2023-2024")).toBe(true);
  });

  it("n'affiche pas deux entrées pour un import non clôturé", () => {
    const options = buildOrganisationExerciceOptions(
      ["2023-2024", "2024-2025"],
      []
    );
    const labels2024 = options.filter((o) => o.value === "2024-2025");
    expect(labels2024).toHaveLength(1);
    expect(labels2024[0]?.label).toBe("2024-2025 (non clôturé)");
    const labels2023 = options.filter((o) => o.value === "2023-2024");
    expect(labels2023).toHaveLength(1);
    expect(labels2023[0]?.label).toBe("2023-2024 (non clôturé)");
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
    expect(filleul?.branchVolume).toBe(600_000);
    expect(filleul?.managerVolume).toBe(900_000);
  });

  it("privilégie le volume branche stocké sur l'historique importé", () => {
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
    expect(filleul?.branchVolume).toBe(999_999);
  });

  it("résout le label courant", () => {
    const now = new Date(2026, 5, 1);
    expect(resolveOrganisationExerciceLabel(ORGANISATION_CURRENT_EXERCICE, now)).toBe("2025-2026");
    expect(listSelectableFiscalYearLabels(now)).toContain("2025-2026");
    expect(currentFiscalYearLabel(now)).toBe("2025-2026");
  });

  it("buildCloseFilleulExerciceSnapshotsFromHistory reprend l'import sans live", () => {
    const snapshots = buildCloseFilleulExerciceSnapshotsFromHistory([
      {
        contactId: 2,
        exerciceLabel: "2024-2025",
        volumePropre: 150_000,
        volumeBranche: 420_000,
        volumeManager: 800_000,
        closedAt: null,
        source: "import",
      },
    ]);
    expect(snapshots).toEqual([
      {
        contactId: 2,
        volumePropre: 150_000,
        volumeBranche: 420_000,
        volumeManager: 800_000,
      },
    ]);
  });

  it("isLiveFilleulExerciceVolumes : live si en cours et non clôturé", () => {
    const now = new Date(2026, 5, 1);
    expect(isLiveFilleulExerciceVolumes("2025-2026", [], now)).toBe(true);
    expect(isLiveFilleulExerciceVolumes("2025-2026", ["2025-2026"], now)).toBe(false);
    expect(isLiveFilleulExerciceVolumes("2024-2025", [], now)).toBe(false);
  });

  it("shouldUseHistoricalFilleulExerciceVolumes : historique seulement si snapshot", () => {
    const now = new Date(2026, 5, 1);
    const empty = new Map<string, FilleulVolumeExercice[]>([["2024-2025", []]]);
    const withData = new Map<string, FilleulVolumeExercice[]>([
      [
        "2024-2025",
        [
          {
            contactId: 1,
            exerciceLabel: "2024-2025",
            volumePropre: 100,
            volumeBranche: 100,
            volumeManager: null,
            closedAt: 1,
            source: "cloture",
          },
        ],
      ],
    ]);
    expect(
      shouldUseHistoricalFilleulExerciceVolumes("2025-2026", [], empty, now)
    ).toBe(false);
    expect(
      shouldUseHistoricalFilleulExerciceVolumes("2024-2025", [], empty, now)
    ).toBe(false);
    expect(
      shouldUseHistoricalFilleulExerciceVolumes("2024-2025", [], withData, now)
    ).toBe(true);
  });
});
