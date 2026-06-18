import {
  getContactById,
  updateContact,
  createContact,
  findContactByEmail,
  findContactByName,
} from "@/lib/api/tauri-contacts";
import { createDocument, type NewDocument } from "@/lib/api/tauri-documents";
import type { ExtractedData } from "@/lib/pdf";
import { contactToUpdatePayload } from "@/lib/contacts/contact-form-utils";
import {
  buildSoloRioIdentityContactFields,
  mergeRioFieldsOntoContact,
} from "@/lib/contacts/rio-contact-fields";
import { getMimeType } from "@/lib/documents/file-mime";
import { convertRioDateToISO } from "@/lib/documents/rio-patrimoine-flow";
import { formatSriLabel, PROFIL_RISQUE_MAX, PROFIL_RISQUE_SRI_FIELD_LABEL } from "@/lib/contacts/investisseur-sri";

export interface QpiApplyResult {
  finalContactId: number;
  successMessage: string;
}

export async function applyQpiImport(
  data: ExtractedData,
  options: {
    effectiveContactId?: number;
    uploadedFile?: { path: string; name: string; size: number };
    formNotes?: string;
  }
): Promise<QpiApplyResult | null> {
  if (data.profilRisque == null || data.profilRisque < 1 || data.profilRisque > PROFIL_RISQUE_MAX) {
    return null;
  }

  let contactId = options.effectiveContactId;
  if (!contactId && data.email?.trim()) {
    const byEmail = await findContactByEmail(data.email.trim());
    if (byEmail) contactId = byEmail.id;
  }
  if (!contactId && data.nom?.trim() && data.prenom?.trim()) {
    const byName = await findContactByName(data.nom.trim(), data.prenom.trim());
    if (byName) contactId = byName.id;
  }

  const identity = buildSoloRioIdentityContactFields(data);
  const { categorie: _c, statut_suivi: _s, ...identityFields } = identity;

  if (contactId) {
    const existing = await getContactById(contactId);
    await updateContact(
      contactId,
      contactToUpdatePayload(
        existing,
        mergeRioFieldsOntoContact(
          existing,
          { ...identityFields, profil_risque_sri: data.profilRisque },
          { identityFillEmptyOnly: true }
        )
      )
    );
  } else {
    if (!identity.nom?.trim() || !identity.prenom?.trim()) return null;
    const created = await createContact({
      ...identity,
      nom: identity.nom,
      prenom: identity.prenom,
      profil_risque_sri: data.profilRisque,
    });
    contactId = created.id;
  }

  if (options.uploadedFile && contactId) {
    const doc: NewDocument = {
      contact_id: contactId,
      type_document: "QPI",
      nom_fichier: options.uploadedFile.name,
      chemin_fichier: options.uploadedFile.path,
      taille_fichier: options.uploadedFile.size,
      mime_type: getMimeType(options.uploadedFile.name),
      date_document: data.dateSignature
        ? convertRioDateToISO(data.dateSignature)
        : data.dateDocument
          ? convertRioDateToISO(data.dateDocument)
          : undefined,
      notes: options.formNotes,
      sensibilite_extra_financiere: data.sensibiliteExtraFinanciere?.trim() || undefined,
      experience_investissement: data.experienceInvestissement?.trim() || undefined,
    };
    await createDocument(doc);
  }

  return {
    finalContactId: contactId!,
    successMessage: `✅ ${PROFIL_RISQUE_SRI_FIELD_LABEL} enregistré (${formatSriLabel(data.profilRisque) ?? `SRI ${data.profilRisque}`})`,
  };
}
