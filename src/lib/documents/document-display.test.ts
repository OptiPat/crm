import { describe, expect, it } from "vitest";
import {
  documentTimelineSortDate,
  getDocumentMetaLines,
  getStelliumReimportActionLabel,
  isDocumentPreviewable,
} from "./document-display";
import type { Document } from "@/lib/api/tauri-documents";

function baseDoc(overrides: Partial<Document> = {}): Document {
  return {
    id: 1,
    type_document: "RELEVE",
    nom_fichier: "doc.pdf",
    chemin_fichier: "/x/doc.pdf",
    taille_fichier: 100,
    created_at: 1_700_000_000,
    updated_at: 1_700_000_000,
    ...overrides,
  };
}

describe("getDocumentMetaLines", () => {
  it("IDENTITE : validité uniquement, pas de date d'import", () => {
    const lines = getDocumentMetaLines(
      baseDoc({
        type_document: "IDENTITE",
        date_document: "2030-06-15",
      })
    );
    expect(lines).toEqual([{ label: "Validité", value: "15/06/2030" }]);
  });

  it("RELEVE : date du document + ajouté le", () => {
    const lines = getDocumentMetaLines(
      baseDoc({
        type_document: "RELEVE",
        date_document: "2025-12-31",
        created_at: 1_700_000_000,
      })
    );
    expect(lines).toHaveLength(2);
    expect(lines[0]).toEqual({ label: "Date du document", value: "31/12/2025" });
    expect(lines[1]?.label).toBe("Ajouté le");
  });

  it("sans date_document : ajouté le seulement", () => {
    const lines = getDocumentMetaLines(baseDoc({ type_document: "FISCAL" }));
    expect(lines).toEqual([{ label: "Ajouté le", value: expect.any(String) }]);
  });
});

describe("document display helpers", () => {
  it("isDocumentPreviewable — PDF et images", () => {
    expect(
      isDocumentPreviewable({ nom_fichier: "a.pdf", mime_type: "application/pdf" })
    ).toBe(true);
    expect(isDocumentPreviewable({ nom_fichier: "scan.jpg" })).toBe(true);
    expect(isDocumentPreviewable({ nom_fichier: "doc.docx" })).toBe(false);
  });

  it("getStelliumReimportActionLabel — RIO vs QPI", () => {
    expect(getStelliumReimportActionLabel("PATRIMOINE")).toContain("RIO");
    expect(getStelliumReimportActionLabel("QPI")).toContain("QPI");
  });
});

describe("documentTimelineSortDate", () => {
  it("IDENTITE : tri par created_at, pas par validité", () => {
    const sort = documentTimelineSortDate(
      baseDoc({
        type_document: "IDENTITE",
        date_document: "2030-01-01",
        created_at: 1_600_000_000,
      })
    );
    expect(sort).toBe(1_600_000_000);
  });

  it("RELEVE : tri par date_document si présente", () => {
    const sort = documentTimelineSortDate(
      baseDoc({
        type_document: "RELEVE",
        date_document: "2026-01-10",
        created_at: 1_600_000_000,
      })
    );
    expect(sort).toBe(Math.floor(Date.parse("2026-01-10") / 1000));
  });
});
