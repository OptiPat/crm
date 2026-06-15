import {
  findContactByEmail,
  findContactByName,
  createContact,
  updateContact,
  getContactById,
  type Contact,
} from "@/lib/api/tauri-contacts";
import { getInvestissementsByContact } from "@/lib/api/tauri-investissements";
import type { ExtractedData } from "@/lib/pdf";
import { contactToUpdatePayload } from "@/lib/contacts/contact-form-utils";
import {
  formatIdentityLine,
  getPairIdentityConflictMessages,
} from "@/lib/contacts/duplicate-identity";
import { mapExtractedDataToContact } from "@/lib/contacts/rio-import-map";

export interface RioSoloApplyResult {
  finalContactId: number;
  resolvedFoyerId?: number;
  successMessage: string;
  hasExistingInvestments: boolean;
  displayNom: string;
}

export interface RioSoloApplyContext {
  effectiveContactId?: number;
  foyerId?: number;
  onMissingIdentity: (message: string) => void;
  confirmIdentityMerge: (message: string) => boolean;
}

export async function resolveExistingContactForRio(
  data: ExtractedData,
  effectiveContactId?: number
): Promise<Contact | null> {
  if (effectiveContactId) {
    try {
      return await getContactById(effectiveContactId);
    } catch {
      // Fiche introuvable : retomber sur email / nom comme pour un import libre
    }
  }
  if (data.email?.trim()) {
    const byEmail = await findContactByEmail(data.email.trim());
    if (byEmail) return byEmail;
  }
  const nom = data.nom?.trim();
  const prenom = data.prenom?.trim();
  if (nom && prenom) {
    return await findContactByName(nom, prenom);
  }
  return null;
}

export async function applySoloRioImport(
  data: ExtractedData,
  ctx: RioSoloApplyContext
): Promise<RioSoloApplyResult | null> {
  let existingContact = await resolveExistingContactForRio(data, ctx.effectiveContactId);

  const identityConflicts =
    existingContact &&
    getPairIdentityConflictMessages(
      { email: data.email, telephone: data.telephone },
      existingContact
    );

  if (existingContact && identityConflicts && identityConflicts.length > 0) {
    const confirmMerge = ctx.confirmIdentityMerge(
      [
        "Même nom/prénom mais coordonnées différentes :",
        identityConflicts.join(", "),
        "",
        "Fiche en base :",
        formatIdentityLine(existingContact),
        "Document :",
        formatIdentityLine({ email: data.email, telephone: data.telephone }),
        "",
        "Fusionner sur la fiche existante ?",
        "(Annuler = créer une nouvelle fiche)",
      ].join("\n")
    );
    if (!confirmMerge) {
      existingContact = null;
    }
  }

  if (existingContact) {
    const newData = mapExtractedDataToContact(data);
    await updateContact(
      existingContact.id,
      contactToUpdatePayload(existingContact, {
        nom: newData.nom || existingContact.nom,
        prenom: newData.prenom || existingContact.prenom,
        email: newData.email || existingContact.email,
        telephone: newData.telephone || existingContact.telephone,
        adresse: newData.adresse || existingContact.adresse,
        code_postal: newData.code_postal || existingContact.code_postal,
        ville: newData.ville || existingContact.ville,
        date_naissance: newData.date_naissance || undefined,
        profession: newData.profession || existingContact.profession,
        notes: newData.notes || existingContact.notes,
      })
    );

    let hasExistingInvestments = false;
    try {
      const invs = await getInvestissementsByContact(existingContact.id);
      hasExistingInvestments = invs.length > 0;
    } catch {
      hasExistingInvestments = false;
    }

    return {
      finalContactId: existingContact.id,
      resolvedFoyerId: ctx.foyerId,
      successMessage: `✅ Contact mis à jour: ${data.prenom} ${data.nom}`,
      hasExistingInvestments,
      displayNom: `${existingContact.prenom} ${existingContact.nom}`,
    };
  }

  const contactData = mapExtractedDataToContact(data);
  if (!contactData.nom?.trim() || !contactData.prenom?.trim()) {
    ctx.onMissingIdentity(
      "Impossible de créer le contact : nom et prénom manquants. Pour une CNI/passeport, importez depuis la fiche client (Patrimoine → Importer un document)."
    );
    return null;
  }

  const newContact = await createContact(contactData);
  const sansEmail = !data.email?.trim();
  const successMessage = sansEmail
    ? `✅ Nouveau contact créé: ${data.prenom} ${data.nom} (sans email)`
    : `✅ Nouveau contact créé: ${data.prenom} ${data.nom}`;

  return {
    finalContactId: newContact.id,
    resolvedFoyerId: ctx.foyerId,
    successMessage,
    hasExistingInvestments: false,
    displayNom: `${data.prenom} ${data.nom}`,
  };
}
