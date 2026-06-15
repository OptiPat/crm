import type { NewDocument } from "@/lib/api/tauri-documents";
import type { ExtractedData } from "@/lib/pdf";
import { getMimeType } from "@/lib/documents/file-mime";

export function hasPatrimoineToTri(data: ExtractedData): boolean {
  return Boolean(
    data.assuranceVie ||
      data.per ||
      data.scpi ||
      data.residencePrincipale?.valeur ||
      data.residenceSecondaire?.valeur ||
      data.immobilierLocatif?.valeur ||
      (data.biensImmobiliers && data.biensImmobiliers.length > 0) ||
      data.livretA ||
      data.ldd ||
      data.compteCourant
  );
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
    date_document: data.dateDocument
      ? convertRioDateToISO(data.dateDocument)
      : formDateDocument || undefined,
    notes: formNotes,
  };
}
