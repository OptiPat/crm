import { describe, expect, it } from "vitest";
import type { Document } from "@/lib/api/tauri-documents";
import {
  computeClientDocumentCompliance,
  isIdentityExpired,
  isSignatureAtLeastOneYearOld,
} from "@/lib/documents/client-document-compliance";

function doc(overrides: Partial<Document> = {}): Document {
  return {
    id: 1,
    type_document: "AUTRE",
    nom_fichier: "a.pdf",
    chemin_fichier: "/a.pdf",
    taille_fichier: 1000,
    created_at: 100,
    updated_at: 100,
    ...overrides,
  };
}

const ref = new Date("2026-07-19T12:00:00");

describe("client-document-compliance", () => {
  it("détecte RIO signé depuis au moins 1 an", () => {
    expect(isSignatureAtLeastOneYearOld("2025-07-19", ref)).toBe(true);
    expect(isSignatureAtLeastOneYearOld("2025-07-20", ref)).toBe(false);
  });

  it("détecte CNI expirée via date_document (validité)", () => {
    expect(isIdentityExpired("2026-07-18", ref)).toBe(true);
    expect(isIdentityExpired("2026-07-19", ref)).toBe(false);
    expect(isIdentityExpired("2027-01-01", ref)).toBe(false);
  });

  it("signale manquants et ancienneté pour un dossier client", () => {
    const result = computeClientDocumentCompliance(
      [
        doc({
          id: 1,
          type_document: "PATRIMOINE",
          date_document: "2024-01-15",
        }),
        doc({ id: 2, type_document: "IDENTITE", date_document: "2028-12-31" }),
      ],
      { referenceDate: ref }
    );
    expect(result.typeBadges).toEqual(["rio", "identite"]);
    expect(result.alerts.map((a) => a.id)).toEqual(["rio_stale", "qpi_missing"]);
  });

  it("prend le document le plus récent par type", () => {
    const result = computeClientDocumentCompliance(
      [
        doc({
          id: 1,
          type_document: "QPI",
          date_document: "2020-01-01",
        }),
        doc({
          id: 2,
          type_document: "QPI",
          date_document: "2025-08-01",
        }),
      ],
      { referenceDate: ref }
    );
    expect(result.alerts.some((a) => a.id === "qpi_stale")).toBe(false);
  });

  it("sans-client : pas d'alertes manquantes", () => {
    const result = computeClientDocumentCompliance([doc()], {
      checkMissing: false,
    });
    expect(result.alerts).toEqual([]);
  });
});
