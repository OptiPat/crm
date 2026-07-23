import { describe, expect, it } from "vitest";
import {
  buildOrganisationVolumeBrancheColumnMap,
  buildOrganisationVolumeColumnMap,
  buildOrganisationVolumePropreColumnMap,
  buildOrganisationVolumesImportPreview,
  detectOrganisationVolumeSheetKind,
  flattenOrganisationVolumesImportEntries,
  mergeOrganisationVolumeImportRows,
  parseOrganisationVolumesRows,
  parseOrganisationVolumesWorkbookSheets,
} from "@/lib/organisation/organisation-volumes-import";
import type { Contact } from "@/lib/api/tauri-contacts";

const samplePropreRow = {
  "Nom prénom du Consultant": "/__ (01) DUPONT Jean",
  "VA + VAA VC Perso 2022-2023": 120_000,
  "VA + VAA VC Perso 2023-2024": 180_000,
  "VA VC Perso 2024-2025": 90_000,
  "VAA VC Perso 2024-2025": 10_000,
  "VAVC Perso 2024-2025 vs 2023-2024 (%)": "12 %",
};

const sampleBrancheRow = {
  "Nom prénom du Consultant": "/__ (01) DUPONT Jean",
  "VAVC 4 niveaux 2022-2023": 500_000,
  "VAVC 4 niveaux 2023-2024": 800_000,
  "dont VAA VC 4 niveaux 2024-2025": 10_000,
  "VAVC 4 Niveaux 2024-2025": 1_200_000,
  "VAVC 4 Niveaux 2024-2025 vs 2023-2024 (%)": "50 %",
};

describe("organisation-volumes-import", () => {
  it("détecte les colonnes volume perso par exercice", () => {
    const map = buildOrganisationVolumePropreColumnMap(Object.keys(samplePropreRow));
    expect(map.get("2022-2023")?.combined).toBe("VA + VAA VC Perso 2022-2023");
    expect(map.get("2024-2025")?.va).toBe("VA VC Perso 2024-2025");
    expect(map.get("2024-2025")?.vaa).toBe("VAA VC Perso 2024-2025");
    expect(buildOrganisationVolumeColumnMap(Object.keys(samplePropreRow)).size).toBe(3);
  });

  it("détecte les colonnes VAVC 4 niveaux", () => {
    const map = buildOrganisationVolumeBrancheColumnMap(Object.keys(sampleBrancheRow));
    expect(map.get("2022-2023")).toBe("VAVC 4 niveaux 2022-2023");
    expect(map.get("2024-2025")).toBe("VAVC 4 Niveaux 2024-2025");
    expect(map.has("2024-2025")).toBe(true);
    expect([...map.keys()]).not.toContain("dont");
  });

  it("détecte le type de feuille Perso vs 4 niveaux", () => {
    expect(
      detectOrganisationVolumeSheetKind("Historique des VAVC Perso", Object.keys(samplePropreRow))
    ).toBe("propre");
    expect(
      detectOrganisationVolumeSheetKind(
        "Historique des VAVC 4 niveaux",
        Object.keys(sampleBrancheRow)
      )
    ).toBe("branche");
  });

  it("parse les lignes perso et additionne VA + VAA", () => {
    const rows = parseOrganisationVolumesRows([samplePropreRow], "propre");
    expect(rows).toHaveLength(1);
    expect(rows[0]?.nom).toBe("DUPONT");
    expect(rows[0]?.prenom).toBe("Jean");
    const y2024 = rows[0]?.cells.find((c) => c.exerciceLabel === "2024-2025");
    expect(y2024?.volumePropre).toBe(100_000);
    expect(y2024?.volumeBranche).toBeUndefined();
  });

  it("parse les lignes 4 niveaux en volume organisation", () => {
    const rows = parseOrganisationVolumesRows([sampleBrancheRow], "branche");
    const y2024 = rows[0]?.cells.find((c) => c.exerciceLabel === "2024-2025");
    expect(y2024?.volumeBranche).toBe(1_200_000);
    expect(y2024?.volumePropre).toBeUndefined();
  });

  it("fusionne perso et branche pour un même consultant", () => {
    const merged = mergeOrganisationVolumeImportRows([
      parseOrganisationVolumesRows([samplePropreRow], "propre"),
      parseOrganisationVolumesRows([sampleBrancheRow], "branche"),
    ]);
    const y2024 = merged[0]?.cells.find((c) => c.exerciceLabel === "2024-2025");
    expect(y2024?.volumePropre).toBe(100_000);
    expect(y2024?.volumeBranche).toBe(1_200_000);
  });

  it("parse un classeur multi-feuilles", () => {
    const rows = parseOrganisationVolumesWorkbookSheets([
      { sheetName: "Historique des VAVC Perso", rawRows: [samplePropreRow] },
      { sheetName: "Historique des VAVC 4 niveaux", rawRows: [sampleBrancheRow] },
    ]);
    const y2024 = rows[0]?.cells.find((c) => c.exerciceLabel === "2024-2025");
    expect(y2024?.volumePropre).toBe(100_000);
    expect(y2024?.volumeBranche).toBe(1_200_000);
  });

  it("parse les montants formatés Excel (virgule = séparateur de milliers)", () => {
    const rows = parseOrganisationVolumesRows(
      [
        {
          "Nom prénom du Consultant": "DUPONT Jean",
          "VA + VAA VC Perso 2018-2019": "159,500",
          "VA + VAA VC Perso 2019-2020": "159 500,00",
        },
      ],
      "propre"
    );
    const y2018 = rows[0]?.cells.find((c) => c.exerciceLabel === "2018-2019");
    const y2019 = rows[0]?.cells.find((c) => c.exerciceLabel === "2019-2020");
    expect(y2018?.volumePropre).toBe(159_500);
    expect(y2019?.volumePropre).toBe(159_500);
  });

  it("associe les contacts CRM et aplatit les entrées", () => {
    const rows = mergeOrganisationVolumeImportRows([
      parseOrganisationVolumesRows([samplePropreRow], "propre"),
      parseOrganisationVolumesRows([sampleBrancheRow], "branche"),
    ]);
    const contacts = [
      {
        id: 42,
        nom: "DUPONT",
        prenom: "Jean",
        categorie: "AUCUN",
        statut_suivi: "ACTIF",
        created_at: 0,
        updated_at: 0,
      },
    ] as Contact[];
    const preview = buildOrganisationVolumesImportPreview(rows, contacts);
    expect(preview[0]?.status).toBe("ready");
    const entries = flattenOrganisationVolumesImportEntries(
      preview,
      new Set(preview.map((line) => line.lineKey))
    );
    expect(entries.length).toBeGreaterThanOrEqual(3);
    expect(entries[0]?.contactId).toBe(42);
    const y2024 = entries.filter((e) => e.exerciceLabel === "2024-2025");
    expect(y2024.some((e) => e.volumePropre === 100_000)).toBe(true);
    expect(y2024.some((e) => e.volumeBranche === 1_200_000)).toBe(true);
  });
});
