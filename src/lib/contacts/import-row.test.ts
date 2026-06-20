import { describe, it, expect } from "vitest";
import {
  getMostRecentDate,
  markImportRowsCancelled,
  unwrapImportCell,
  type ImportRow,
} from "./import-row";

describe("unwrapImportCell", () => {
  it("retire le wrapper texte Excel =\"...\" (téléphone forcé en texte)", () => {
    expect(unwrapImportCell('="+33600000001"')).toBe("+33600000001");
    expect(unwrapImportCell('="0612345678"')).toBe("0612345678");
  });

  it("gère le contenu vide entre guillemets", () => {
    expect(unwrapImportCell('=""')).toBe("");
  });

  it("laisse les chaînes normales inchangées", () => {
    expect(unwrapImportCell("DUPONT")).toBe("DUPONT");
    expect(unwrapImportCell("a@b.fr")).toBe("a@b.fr");
    expect(unwrapImportCell("08/04/1992")).toBe("08/04/1992");
    expect(unwrapImportCell("=SOMME(A1)")).toBe("=SOMME(A1)");
  });

  it("laisse les valeurs non chaîne inchangées", () => {
    expect(unwrapImportCell(42)).toBe(42);
    expect(unwrapImportCell(null)).toBeNull();
    expect(unwrapImportCell(undefined)).toBeUndefined();
  });
});

describe("getMostRecentDate", () => {
  it("renvoie undefined si aucune date", () => {
    expect(getMostRecentDate(undefined, undefined)).toBeUndefined();
  });

  it("renvoie la date ISO si pas de timestamp existant", () => {
    expect(getMostRecentDate("2024-01-15T00:00:00.000Z", undefined)).toBe(
      "2024-01-15T00:00:00.000Z"
    );
  });

  it("renvoie l'existant converti si pas de nouvelle date", () => {
    const ts = Math.floor(Date.UTC(2023, 0, 1) / 1000);
    expect(getMostRecentDate(undefined, ts)).toBe("2023-01-01T00:00:00.000Z");
  });

  it("garde la plus récente des deux", () => {
    const tsAncien = Math.floor(Date.UTC(2020, 0, 1) / 1000);
    expect(getMostRecentDate("2024-06-01T00:00:00.000Z", tsAncien)).toBe(
      "2024-06-01T00:00:00.000Z"
    );

    const tsRecent = Math.floor(Date.UTC(2025, 0, 1) / 1000);
    expect(getMostRecentDate("2020-01-01T00:00:00.000Z", tsRecent)).toBe(
      "2025-01-01T00:00:00.000Z"
    );
  });
});

describe("markImportRowsCancelled", () => {
  it("requalifie les lignes succès en erreur, laisse les autres", () => {
    const rows: ImportRow[] = [
      { data: {}, status: "success" },
      { data: {}, status: "duplicate" },
      { data: {}, status: "error", message: "déjà en erreur" },
    ];
    const out = markImportRowsCancelled(rows);
    expect(out[0].status).toBe("error");
    expect(out[0].message).toContain("annulé");
    expect(out[1].status).toBe("duplicate");
    expect(out[2].message).toBe("déjà en erreur");
  });
});
