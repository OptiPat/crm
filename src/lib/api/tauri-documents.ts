import { invoke } from "@tauri-apps/api/core";
import { notifyDocumentsChanged } from "@/lib/documents/document-events";
import { open } from "@tauri-apps/plugin-dialog";
import { stageDocumentFile } from "@/lib/api/tauri-secure-files";

export interface Document {
  id: number;
  contact_id?: number;
  foyer_id?: number;
  type_document: string;
  nom_fichier: string;
  chemin_fichier: string;
  taille_fichier: number;
  mime_type?: string;
  date_document?: string;
  notes?: string;
  /** Résumé durabilité / ESG extrait du QPI. */
  sensibilite_extra_financiere?: string;
  /** Niveau QPI extrait du document (Novice, Informé, Expérimenté). */
  experience_investissement?: string;
  created_at: number;
  updated_at: number;
}

export interface NewDocument {
  contact_id?: number;
  foyer_id?: number;
  type_document: string;
  nom_fichier: string;
  chemin_fichier: string;
  taille_fichier: number;
  mime_type?: string;
  date_document?: string;
  notes?: string;
  sensibilite_extra_financiere?: string;
  experience_investissement?: string;
}

export async function getAllDocuments(): Promise<Document[]> {
  return await invoke<Document[]>("get_all_documents");
}

export async function getDocumentsByContact(contactId: number): Promise<Document[]> {
  return await invoke<Document[]>("get_documents_by_contact", { contactId });
}

export async function getDocumentById(id: number): Promise<Document> {
  return await invoke<Document>("get_document_by_id", { id });
}

export interface CreateDocumentResult {
  document: Document;
  onedriveMessage?: string | null;
}

export async function createDocument(newDocument: NewDocument): Promise<CreateDocumentResult> {
  const created = await invoke<CreateDocumentResult>("create_document", { newDocument });
  notifyDocumentsChanged();
  return created;
}

export async function updateDocument(id: number, document: NewDocument): Promise<Document> {
  const updated = await invoke<Document>("update_document", { id, document });
  notifyDocumentsChanged();
  return updated;
}

export async function deleteDocument(id: number): Promise<void> {
  await invoke<void>("delete_document", { id });
  notifyDocumentsChanged();
}

export async function discardStagedDocument(filePath: string): Promise<void> {
  if (!filePath.trim()) return;
  try {
    await invoke<void>("discard_staged_document", { filePath });
  } catch (error) {
    console.warn("discardStagedDocument:", error);
  }
}

async function copyFileIntoDocumentsDir(
  sourcePath: string
): Promise<{ path: string; name: string; size: number }> {
  return stageDocumentFile(sourcePath);
}

/** Copie un fichier déposé (drag & drop Tauri) dans le dossier documents de l'app. */
export async function stageDocumentFromPath(
  sourcePath: string
): Promise<{ path: string; name: string; size: number }> {
  try {
    return await copyFileIntoDocumentsDir(sourcePath);
  } catch (error) {
    console.error("Error staging document:", error);
    throw error;
  }
}

// Fonction pour uploader un fichier
export async function uploadDocument(): Promise<{ path: string; name: string; size: number } | null> {
  try {
    const selected = await open({
      multiple: false,
      filters: [
        {
          name: "Documents",
          extensions: ["pdf", "doc", "docx", "xls", "xlsx", "txt", "jpg", "jpeg", "png", "webp"],
        },
      ],
    });

    if (!selected || typeof selected !== "string") {
      return null;
    }

    return await copyFileIntoDocumentsDir(selected);
  } catch (error) {
    console.error("Error uploading document:", error);
    throw error;
  }
}
