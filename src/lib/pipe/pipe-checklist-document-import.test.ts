import { describe, expect, it, vi, beforeEach } from "vitest";
import { importPipeChecklistDocument, suggestedDocumentTypeForChecklistItem } from "./pipe-checklist-document-import";

const uploadDocument = vi.fn();
const createDocument = vi.fn();

vi.mock("@/lib/api/tauri-documents", () => ({
  uploadDocument: (...args: unknown[]) => uploadDocument(...args),
  createDocument: (...args: unknown[]) => createDocument(...args),
}));

describe("importPipeChecklistDocument", () => {
  beforeEach(() => {
    uploadDocument.mockReset();
    createDocument.mockReset();
  });

  it("retourne null si l'utilisateur annule le sélecteur", async () => {
    uploadDocument.mockResolvedValue(null);
    await expect(importPipeChecklistDocument({ contactId: 1 })).resolves.toBeNull();
    expect(createDocument).not.toHaveBeenCalled();
  });

  it("crée le document sur le contact après sélection du fichier", async () => {
    uploadDocument.mockResolvedValue({
      path: "C:/app/documents/1_test.pdf",
      name: "test.pdf",
      size: 42,
    });
    createDocument.mockResolvedValue({ document: { id: 9, nom_fichier: "test.pdf" } });

    const doc = await importPipeChecklistDocument({
      contactId: 3,
      typeDocument: "CNI",
      notes: "checklist",
    });

    expect(doc).toEqual({ id: 9, nom_fichier: "test.pdf" });
    expect(createDocument).toHaveBeenCalledWith(
      expect.objectContaining({
        contact_id: 3,
        type_document: "CNI",
        nom_fichier: "test.pdf",
        notes: "checklist",
      })
    );
  });

  it("refuse un contact invalide", async () => {
    await expect(importPipeChecklistDocument({ contactId: 0 })).rejects.toThrow(
      /Contact invalide/
    );
  });

  it("suggère un type document selon l'id checklist", () => {
    expect(suggestedDocumentTypeForChecklistItem("cni")).toBe("IDENTITE");
    expect(suggestedDocumentTypeForChecklistItem("avis_imposition")).toBe("FISCAL");
    expect(suggestedDocumentTypeForChecklistItem("custom_xyz")).toBeUndefined();
  });
});
