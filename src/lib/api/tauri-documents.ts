import { invoke } from "@tauri-apps/api/core";
import { notifyDocumentsChanged } from "@/lib/documents/document-events";
import { open } from "@tauri-apps/plugin-dialog";
import { copyFile, exists, mkdir, stat } from "@tauri-apps/plugin-fs";
import { appDataDir, join } from "@tauri-apps/api/path";

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

export async function createDocument(newDocument: NewDocument): Promise<Document> {
  const created = await invoke<Document>("create_document", { newDocument });
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

async function copyFileIntoDocumentsDir(
  sourcePath: string
): Promise<{ path: string; name: string; size: number }> {
  const appData = await appDataDir();
  const documentsDir = await join(appData, "documents");

  const dirExists = await exists(documentsDir);
  if (!dirExists) {
    await mkdir(documentsDir, { recursive: true });
  }

  const fileName = sourcePath.split(/[\\/]/).pop() || "document";
  const destinationPath = await join(documentsDir, `${Date.now()}_${fileName}`);

  await copyFile(sourcePath, destinationPath);

  const fileStats = await stat(destinationPath);
  return {
    path: destinationPath,
    name: fileName,
    size: fileStats.size,
  };
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
