import { createDocument } from "@/lib/api/tauri-documents";
import { updateContact, type Contact } from "@/lib/api/tauri-contacts";
import type { IdentityPreviewValues } from "@/components/documents/IdentityExtractPreviewDialog";
import { contactToUpdatePayload } from "@/lib/contacts/contact-form-utils";
import { getMimeType } from "@/lib/documents/file-mime";
import {
  buildIdentityMergePatch,
  identityExpirationToDocumentDate,
} from "@/lib/identity/merge-identity-fields";
import { identityDateFrToIso } from "@/lib/identity/parse-identity-document";
import type { IdentityExtractResult } from "@/lib/identity";

export type IdentityPickedFile = { path: string; name: string; size: number };
export type IdentityImportMode = "single" | "two_files";

export function buildIdentityExtractFromPreview(
  values: IdentityPreviewValues,
  base?: IdentityExtractResult | null
): IdentityExtractResult {
  return {
    source: base?.source ?? "visual",
    confidence: base?.confidence ?? 0,
    rawText: base?.rawText ?? "",
    mrzVerified: base?.mrzVerified ?? false,
    provenance: base?.provenance ?? {
      dateNaissance: values.dateNaissanceFr ? "visual_suggestion" : "none",
      dateExpiration: values.dateExpirationFr ? "visual_suggestion" : "none",
      lieuNaissance: values.lieuNaissance ? "visual_suggestion" : "none",
      nom: values.nom ? "visual_suggestion" : "none",
      prenom: values.prenom ? "visual_suggestion" : "none",
    },
    nom: values.nom || undefined,
    prenom: values.prenom || undefined,
    lieuNaissance: values.lieuNaissance || undefined,
    dateNaissanceFr: values.dateNaissanceFr || undefined,
    dateNaissance: values.dateNaissanceFr
      ? identityDateFrToIso(values.dateNaissanceFr)
      : undefined,
    dateExpirationFr: values.dateExpirationFr || undefined,
    dateExpiration: values.dateExpirationFr
      ? identityDateFrToIso(values.dateExpirationFr)
      : undefined,
    sex: base?.sex,
    layout: base?.layout,
    documentKind: base?.documentKind,
  };
}

export interface IdentityApplyResult {
  filledFields: string[];
  skippedFields: string[];
}

export async function applyIdentityDocumentImport(options: {
  contact: Contact;
  contactId: number;
  foyerId?: number;
  values: IdentityPreviewValues;
  identityExtracted?: IdentityExtractResult | null;
  uploadedFile: IdentityPickedFile;
  uploadedVersoFile?: IdentityPickedFile | null;
  identityImportMode: IdentityImportMode;
  formNotes?: string;
  formDateDocument?: string;
}): Promise<IdentityApplyResult> {
  const extracted = buildIdentityExtractFromPreview(options.values, options.identityExtracted);
  const { patch, filledFields, skippedFields } = buildIdentityMergePatch(options.contact, extracted);

  if (Object.keys(patch).length > 0) {
    await updateContact(options.contactId, contactToUpdatePayload(options.contact, patch));
  }

  const documentExpiryDate =
    identityExpirationToDocumentDate(options.values.dateExpirationFr) ||
    options.formDateDocument ||
    undefined;

  await createDocument({
    contact_id: options.contactId,
    foyer_id: options.foyerId,
    type_document: "IDENTITE",
    nom_fichier: options.uploadedFile.name,
    chemin_fichier: options.uploadedFile.path,
    taille_fichier: options.uploadedFile.size,
    mime_type: getMimeType(options.uploadedFile.name),
    date_document: documentExpiryDate,
    notes: options.formNotes
      ? `${options.formNotes}${options.identityImportMode === "two_files" ? " (recto)" : ""}`
      : options.identityImportMode === "two_files"
        ? "Recto"
        : options.formNotes,
  });

  if (options.uploadedVersoFile) {
    await createDocument({
      contact_id: options.contactId,
      foyer_id: options.foyerId,
      type_document: "IDENTITE",
      nom_fichier: options.uploadedVersoFile.name,
      chemin_fichier: options.uploadedVersoFile.path,
      taille_fichier: options.uploadedVersoFile.size,
      mime_type: getMimeType(options.uploadedVersoFile.name),
      date_document: documentExpiryDate,
      notes: options.formNotes ? `${options.formNotes} (verso)` : "Verso",
    });
  }

  return { filledFields, skippedFields };
}
