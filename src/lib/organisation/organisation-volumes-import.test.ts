import { describe, expect, it } from "vitest";
import {
  buildOrganisationVolumeColumnMap,
  buildOrganisationVolumesImportPreview,
  flattenOrganisationVolumesImportEntries,
  parseOrganisationVolumesRows,
} from "@/lib/organisation/organisation-volumes-import";
import type { Contact } from "@/lib/api/tauri-contacts";

const sampleRow = {
  "Nom prénom du Consultant": "/__ (01) DUPONT Jean",
  "VA + VAA VC Perso 2022-2023": 120_000,
  "VA + VAA VC Perso 2023-2024": 180_000,
  "VA VC Perso 2024-2025": 90_000,
  "VAA VC Perso 2024-2025": 10_000,
  "VAVC Perso 2024-2025 vs 2023-2024 (%)": "12 %",
};

describe("organisation-volumes-import", () => {
  it("détecte les colonnes volume par exercice", () => {
    const map = buildOrganisationVolumeColumnMap(Object.keys(sampleRow));
    expect(map.get("2022-2023")?.combined).toBe("VA + VAA VC Perso 2022-2023");
    expect(map.get("2024-2025")?.va).toBe("VA VC Perso 2024-2025");
    expect(map.get("2024-2025")?.vaa).toBe("VAA VC Perso 2024-2025");
  });

  it("parse les lignes et additionne VA + VAA sur l'exercice courant", () => {
    const rows = parseOrganisationVolumesRows([sampleRow]);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.nom).toBe("DUPONT");
    expect(rows[0]?.prenom).toBe("Jean");
    const y2024 = rows[0]?.cells.find((c) => c.exerciceLabel === "2024-2025");
    expect(y2024?.volumePropre).toBe(100_000);
  });

  it("parse les montants formatés Excel (virgule = séparateur de milliers)", () => {
    const rows = parseOrganisationVolumesRows([
      {
        "Nom prénom du Consultant": "DUPONT Jean",
        "VA + VAA VC Perso 2018-2019": "159,500",
        "VA + VAA VC Perso 2019-2020": "159 500,00",
      },
    ]);
    const y2018 = rows[0]?.cells.find((c) => c.exerciceLabel === "2018-2019");
    const y2019 = rows[0]?.cells.find((c) => c.exerciceLabel === "2019-2020");
    expect(y2018?.volumePropre).toBe(159_500);
    expect(y2019?.volumePropre).toBe(159_500);
  });

  it("associe les contacts CRM et aplatit les entrées", () => {
    const rows = parseOrganisationVolumesRows([sampleRow]);
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
    expect(entries).toHaveLength(3);
    expect(entries[0]?.contactId).toBe(42);
  });
});
