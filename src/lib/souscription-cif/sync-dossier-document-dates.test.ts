import { describe, expect, it } from "vitest";
import type { Document } from "@/lib/api/tauri-documents";
import {
  dossierDatePatchFromDocuments,
  latestDocumentDateIso,
} from "@/lib/souscription-cif/sync-dossier-document-dates";

function doc(partial: Pick<Document, "type_document" | "date_document" | "created_at">): Document {
  return {
    id: partial.created_at,
    type_document: partial.type_document,
    nom_fichier: "test.pdf",
    chemin_fichier: "/tmp/test.pdf",
    taille_fichier: 1,
    date_document: partial.date_document,
    created_at: partial.created_at,
    updated_at: partial.created_at,
  };
}

describe("latestDocumentDateIso", () => {
  it("retourne la date du document le plus récent du type demandé", () => {
    const documents = [
      doc({ type_document: "PATRIMOINE", date_document: "2026-01-10", created_at: 100 }),
      doc({ type_document: "PATRIMOINE", date_document: "2026-06-15", created_at: 200 }),
      doc({ type_document: "QPI", date_document: "2026-03-01", created_at: 150 }),
    ];
    expect(latestDocumentDateIso(documents, "PATRIMOINE")).toBe("2026-06-15");
    expect(latestDocumentDateIso(documents, "QPI")).toBe("2026-03-01");
  });

  it("ignore les documents sans date_document", () => {
    const documents = [
      {
        ...doc({ type_document: "PATRIMOINE", date_document: "2026-02-01", created_at: 50 }),
        date_document: undefined,
      },
      doc({ type_document: "PATRIMOINE", date_document: "2026-02-01", created_at: 50 }),
    ];
    expect(latestDocumentDateIso(documents, "PATRIMOINE")).toBe("2026-02-01");
  });
});

describe("dossierDatePatchFromDocuments", () => {
  const documents = [
    doc({ type_document: "PATRIMOINE", date_document: "2026-06-15", created_at: 200 }),
    doc({ type_document: "QPI", date_document: "2026-06-20", created_at: 300 }),
  ];

  it("préremplit les deux dates si le dossier est vide", () => {
    expect(dossierDatePatchFromDocuments({ dateRio: "", dateQpi: "" }, documents)).toEqual({
      dateRio: "2026-06-15",
      dateQpi: "2026-06-20",
    });
  });

  it("ne remplace pas une date déjà saisie", () => {
    expect(
      dossierDatePatchFromDocuments({ dateRio: "2025-12-01", dateQpi: "" }, documents)
    ).toEqual({ dateQpi: "2026-06-20" });
  });

  it("retourne un patch vide si aucun document daté", () => {
    expect(dossierDatePatchFromDocuments({ dateRio: "", dateQpi: "" }, [])).toEqual({});
  });
});
