import { invoke } from "@tauri-apps/api/core";
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
}

export async function getAllDocuments(): Promise<Document[]> {
  return await invoke<Document[]>("get_all_documents");
}

export async function getDocumentById(id: number): Promise<Document> {
  return await invoke<Document>("get_document_by_id", { id });
}

export async function createDocument(newDocument: NewDocument): Promise<Document> {
  return await invoke<Document>("create_document", { newDocument });
}

export async function updateDocument(id: number, document: NewDocument): Promise<Document> {
  return await invoke<Document>("update_document", { id, document });
}

export async function deleteDocument(id: number): Promise<void> {
  return await invoke<void>("delete_document", { id });
}

// Fonction pour uploader un fichier
export async function uploadDocument(): Promise<{ path: string; name: string; size: number } | null> {
  try {
    // Ouvrir le sélecteur de fichiers
    const selected = await open({
      multiple: false,
      filters: [
        {
          name: "Documents",
          extensions: ["pdf", "doc", "docx", "xls", "xlsx", "txt", "jpg", "jpeg", "png"],
        },
      ],
    });

    if (!selected || typeof selected !== "string") {
      return null;
    }

    // Créer le dossier documents dans appData si nécessaire
    const appData = await appDataDir();
    const documentsDir = await join(appData, "documents");
    
    // Vérifier si le dossier existe, sinon le créer
    const dirExists = await exists(documentsDir);
    if (!dirExists) {
      await mkdir(documentsDir, { recursive: true });
    }

    // Extraire le nom du fichier
    const fileName = selected.split(/[\\/]/).pop() || "document";
    const destinationPath = await join(documentsDir, `${Date.now()}_${fileName}`);

    // Copier le fichier
    await copyFile(selected, destinationPath);

    // Obtenir la taille du fichier après copie
    const fileStats = await stat(destinationPath);
    const size = fileStats.size;

    return {
      path: destinationPath,
      name: fileName,
      size,
    };
  } catch (error) {
    console.error("Error uploading document:", error);
    throw error;
  }
}
