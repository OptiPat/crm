import { describe, expect, it } from "vitest";
import {
  computeDocumentsPageStats,
  isPatrimoineDocument,
  matchesDocumentsStatFilter,
} from "@/lib/documents/documents-page-stats";
import type { Document } from "@/lib/api/tauri-documents";

function doc(overrides: Partial<Document> = {}): Document {
  return {
    id: 1,
    type_document: "AUTRE",
    nom_fichier: "f.pdf",
    chemin_fichier: "/tmp/f.pdf",
    taille_fichier: 1000,
    created_at: 0,
    updated_at: 0,
    ...overrides,
  };
}

describe("documents-page-stats", () => {
  it("agrège les compteurs synthèse", () => {
    const stats = computeDocumentsPageStats([
      doc({ id: 1, type_document: "PATRIMOINE", contact_id: 1 }),
      doc({ id: 2, type_document: "QPI", contact_id: 2 }),
      doc({ id: 3, type_document: "IDENTITE" }),
      doc({ id: 4, contact_id: undefined }),
    ]);
    expect(stats.total).toBe(4);
    expect(stats.patrimoine).toBe(2);
    expect(stats.identite).toBe(1);
    expect(stats.sansClient).toBe(2);
  });

  it("filtre patrimoine RIO et QPI", () => {
    expect(isPatrimoineDocument(doc({ type_document: "PATRIMOINE" }))).toBe(true);
    expect(isPatrimoineDocument(doc({ type_document: "QPI" }))).toBe(true);
    expect(isPatrimoineDocument(doc({ type_document: "FISCAL" }))).toBe(false);
    expect(
      matchesDocumentsStatFilter(doc({ type_document: "QPI" }), "patrimoine")
    ).toBe(true);
    expect(
      matchesDocumentsStatFilter(doc({ type_document: "FISCAL" }), "patrimoine")
    ).toBe(false);
  });
});
