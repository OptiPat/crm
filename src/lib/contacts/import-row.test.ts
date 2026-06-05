import { describe, it, expect } from "vitest";
import { getMostRecentDate, markImportRowsCancelled, type ImportRow } from "./import-row";

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
