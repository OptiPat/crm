import { discardStagedDocument, getAllDocuments } from "@/lib/api/tauri-documents";
import { normalizeDocumentPath } from "@/lib/documents/document-import-queue";

/**
 * Supprime des copies temporaires d'import abandonné, sauf si un document en
 * base pointe encore sur le chemin (un fichier importé n'est jamais supprimé,
 * même si la fermeture arrive avant la confirmation de l'import).
 * Côté Rust, seuls les fichiers « plats » de `documents/` sont supprimables.
 */
export async function discardUnreferencedStagedFiles(
  paths: readonly (string | null | undefined)[]
): Promise<void> {
  const unique = [...new Set(paths.filter((p): p is string => !!p?.trim()))];
  if (unique.length === 0) return;

  let referenced: Set<string>;
  try {
    const documents = await getAllDocuments();
    referenced = new Set(documents.map((d) => normalizeDocumentPath(d.chemin_fichier)));
  } catch (error) {
    // Impossible de vérifier : on garde le fichier (le nettoyage au démarrage s'en charge).
    console.warn("discardUnreferencedStagedFiles:", error);
    return;
  }

  for (const path of unique) {
    if (referenced.has(normalizeDocumentPath(path))) continue;
    await discardStagedDocument(path);
  }
}
