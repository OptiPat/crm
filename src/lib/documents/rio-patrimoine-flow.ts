import type { NewDocument } from "@/lib/api/tauri-documents";
import type { ExtractedData } from "@/lib/pdf";
import { getMimeType } from "@/lib/documents/file-mime";
import { extractPatrimoineItemsFromRio } from "./extract-patrimoine-items";
export function hasPatrimoineToTri(data: ExtractedData): boolean {
  const items = extractPatrimoineItemsFromRio(data);
  return items.some((item) => {
    if (["EPARGNE_BANCAIRE", "LIVRET_A", "LDDS", "PEL", "CEL", "CSL"].includes(item.type)) {
      return false;
    }
    return item.montant > 0;
  });
}

export function convertRioDateToISO(dateStr: string): string {
  const match = dateStr.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!match) return dateStr;
  const [, day, month, year] = match;
  return `${year}-${month}-${day}`;
}

export function buildRioPatrimoineDocument(options: {
  data: ExtractedData;
  finalContactId: number;
  resolvedFoyerId?: number;
  uploadedFile: { path: string; name: string; size: number };
  formTypeDocument?: string;
  formDateDocument?: string;
  formNotes?: string;
}): NewDocument {
  const { data, finalContactId, resolvedFoyerId, uploadedFile, formTypeDocument, formDateDocument, formNotes } =
    options;

  return {
    contact_id: finalContactId,
    foyer_id: resolvedFoyerId,
    type_document: data.typeDocument === "RIO" ? "PATRIMOINE" : formTypeDocument || "AUTRE",
    nom_fichier: uploadedFile.name,
    chemin_fichier: uploadedFile.path,
    taille_fichier: uploadedFile.size,
    mime_type: getMimeType(uploadedFile.name),
    date_document: data.dateSignature
      ? convertRioDateToISO(data.dateSignature)
      : data.dateDocument
        ? convertRioDateToISO(data.dateDocument)
        : formDateDocument || undefined,
    notes: formNotes,
  };
}
