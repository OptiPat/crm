import { describe, expect, it } from "vitest";
import type { Document } from "@/lib/api/tauri-documents";
import type { Contact } from "@/lib/api/tauri-contacts";
import {
  buildClientDocumentFolders,
  documentsInFolder,
  getDocumentFolderKey,
  getFolderLabel,
  parseContactFolderKey,
} from "@/lib/documents/documents-folder-utils";

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

const contacts: Record<number, Contact> = {
  1: { id: 1, nom: "DUPONT", prenom: "Jean", categorie: "CLIENT" } as Contact,
  2: { id: 2, nom: "MARTIN", prenom: "Paul", categorie: "CLIENT" } as Contact,
};

describe("documents-folder-utils", () => {
  it("dérive la clé dossier depuis le contact", () => {
    expect(getDocumentFolderKey(doc({ contact_id: 1 }))).toBe("contact:1");
    expect(getDocumentFolderKey(doc())).toBe("sans-client");
  });

  it("construit un dossier par client", () => {
    const folders = buildClientDocumentFolders({
      visibleDocuments: [
        doc({ id: 1, contact_id: 1 }),
        doc({ id: 2, contact_id: 2 }),
        doc({ id: 3 }),
      ],
      allDocuments: [
        doc({ id: 1, contact_id: 1 }),
        doc({ id: 2, contact_id: 2 }),
        doc({ id: 3 }),
      ],
      contactsById: contacts,
    });
    expect(folders).toHaveLength(3);
    expect(folders[0]?.key).toBe("contact:1");
    expect(folders[1]?.key).toBe("contact:2");
    expect(folders[2]?.key).toBe("sans-client");
  });

  it("calcule la conformité sur tous les documents du client", () => {
    const allDocuments = [
      doc({
        id: 1,
        contact_id: 1,
        type_document: "PATRIMOINE",
        date_document: "2024-01-15",
      }),
      doc({
        id: 2,
        contact_id: 1,
        type_document: "QPI",
        date_document: "2025-08-01",
      }),
    ];
    const visibleDocuments = [allDocuments[0]!];

    const folders = buildClientDocumentFolders({
      visibleDocuments,
      allDocuments,
      contactsById: contacts,
    });

    const dupont = folders.find((folder) => folder.key === "contact:1");
    expect(dupont?.documentCount).toBe(1);
    expect(dupont?.alerts.map((alert) => alert.id)).not.toContain("qpi_missing");
  });

  it("filtre les documents d'un dossier", () => {
    const items = [
      doc({ id: 1, contact_id: 1 }),
      doc({ id: 2, contact_id: 2 }),
    ];
    expect(documentsInFolder(items, "contact:1")).toHaveLength(1);
    expect(documentsInFolder(items, "contact:1")[0]?.id).toBe(1);
  });

  it("libellé dossier depuis la fiche contact", () => {
    expect(getFolderLabel("contact:1", contacts)).toBe("DUPONT Jean");
    expect(getFolderLabel("sans-client", contacts)).toBe("Sans client lié");
  });

  it("parseContactFolderKey valide les clés dossier", () => {
    expect(parseContactFolderKey("contact:12")).toBe("contact:12");
    expect(parseContactFolderKey("sans-client")).toBe("sans-client");
    expect(parseContactFolderKey("invalid")).toBeNull();
    expect(parseContactFolderKey(null)).toBeNull();
  });
});
