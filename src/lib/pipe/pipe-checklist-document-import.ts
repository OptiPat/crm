import {
  createDocument,
  uploadDocument,
  type Document,
} from "@/lib/api/tauri-documents";
import { getMimeType } from "@/lib/documents/file-mime";

export interface ImportPipeChecklistDocumentInput {
  contactId: number;
  typeDocument?: string;
  notes?: string;
}

/** Ouvre le sélecteur de fichier, enregistre le document sur le contact, retourne null si annulé. */
export async function importPipeChecklistDocument(
  input: ImportPipeChecklistDocumentInput
): Promise<Document | null> {
  if (input.contactId <= 0) {
    throw new Error("Contact invalide pour importer une pièce jointe.");
  }

  const file = await uploadDocument();
  if (!file) return null;

  const result = await createDocument({
    contact_id: input.contactId,
    type_document: input.typeDocument ?? "AUTRE",
    nom_fichier: file.name,
    chemin_fichier: file.path,
    taille_fichier: file.size,
    mime_type: getMimeType(file.name),
    notes: input.notes,
  });
  return result.document;
}

/** Type document suggéré selon l'id de pièce checklist (optionnel à l'import). */
export function suggestedDocumentTypeForChecklistItem(itemId: string): string | undefined {
  if (itemId === "cni") return "IDENTITE";
  if (itemId === "qpi_a_signer") return "QPI";
  if (itemId === "rio" || itemId === "der") return "PATRIMOINE";
  if (itemId.includes("avis") || itemId.includes("impot")) return "FISCAL";
  if (itemId.includes("releve") || itemId.includes("situation")) return "PATRIMOINE";
  if (itemId.includes("bulletin") || itemId.includes("salaire")) return "FISCAL";
  if (itemId.includes("bilan")) return "FISCAL";
  return undefined;
}
