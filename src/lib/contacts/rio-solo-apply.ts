import {
  findContactByEmail,
  findContactByName,
  createContact,
  updateContact,
  getContactById,
  type Contact,
} from "@/lib/api/tauri-contacts";
import {
  getInvestissementsByContact,
  getInvestissementsByFoyer,
} from "@/lib/api/tauri-investissements";
import type { ExtractedData } from "@/lib/pdf";
import { contactToUpdatePayload } from "@/lib/contacts/contact-form-utils";
import {
  formatIdentityLine,
  getPairIdentityConflictMessages,
} from "@/lib/contacts/duplicate-identity";
import {
  buildSoloRioContactFields,
  mergeRioFieldsOntoContact,
} from "@/lib/contacts/rio-contact-fields";
import { syncRioEnfants } from "@/lib/contacts/rio-enfants-apply";
import { ensureDeclarantFoyer } from "@/lib/contacts/rio-foyer-ensure";
import { applyRioFiscaliteToFoyer } from "@/lib/contacts/rio-foyer-fiscal-apply";

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
  confirmIdentityMerge: (message: string) => boolean | Promise<boolean>;
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

async function finalizeSoloContact(
  contact: Contact,
  data: ExtractedData,
  ctx: RioSoloApplyContext,
  created: boolean
): Promise<RioSoloApplyResult> {
  const hasEnfants = (data.enfants?.length ?? 0) > 0;
  const hasFiscalData = Boolean(
    data.trancheImposition?.trim() ||
      data.nombrePartsFiscales != null ||
      data.revenuBrutGlobal != null ||
      data.irNetAPayer != null
  );
  let resolvedContact = contact;
  let resolvedFoyerId = ctx.foyerId ?? contact.foyer_id;

  if (hasEnfants || ctx.foyerId || hasFiscalData) {
    try {
      const foyerLink = await ensureDeclarantFoyer(resolvedContact, {
        explicitFoyerId: ctx.foyerId,
        hasEnfants,
        hasFiscalData,
      });
      resolvedContact = foyerLink.contact;
      resolvedFoyerId = foyerLink.foyerId;
    } catch {
      // pas de foyer requis
    }
  }

  if (hasEnfants && resolvedFoyerId) {
    await syncRioEnfants({ enfants: data.enfants, foyerId: resolvedFoyerId });
  }

  if (resolvedFoyerId) {
    await applyRioFiscaliteToFoyer(resolvedFoyerId, data).catch(() => undefined);
  }

  let hasExistingInvestments = false;
  try {
    const invs = await getInvestissementsByContact(resolvedContact.id);
    hasExistingInvestments = invs.length > 0;
    if (!hasExistingInvestments && resolvedFoyerId) {
      const foyerInvs = await getInvestissementsByFoyer(resolvedFoyerId);
      hasExistingInvestments = foyerInvs.length > 0;
    }
  } catch {
    hasExistingInvestments = false;
  }

  const displayNom = `${resolvedContact.prenom} ${resolvedContact.nom}`;
  const successMessage = created
    ? `✅ Nouveau contact créé: ${displayNom}`
    : `✅ Contact mis à jour: ${displayNom}`;

  return {
    finalContactId: resolvedContact.id,
    resolvedFoyerId,
    successMessage,
    hasExistingInvestments,
    displayNom,
  };
}

export async function applySoloRioImport(
  data: ExtractedData,
  ctx: RioSoloApplyContext,
  options?: { deferFinancialFields?: boolean }
): Promise<RioSoloApplyResult | null> {
  let existingContact = await resolveExistingContactForRio(data, ctx.effectiveContactId);

  const identityConflicts =
    existingContact &&
    getPairIdentityConflictMessages(
      {
        email: data.email,
        telephone: data.telephone,
        nom: data.nom,
        prenom: data.prenom,
      },
      existingContact
    );

  if (existingContact && identityConflicts && identityConflicts.length > 0) {
    const confirmMerge = await Promise.resolve(
      ctx.confirmIdentityMerge(
      [
        "Conflit d'identité :",
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
      )
    );
    if (!confirmMerge) {
      existingContact = null;
    }
  }

  const rioFields = buildSoloRioContactFields(data, {
    includeFinancial: !options?.deferFinancialFields,
  });

  if (existingContact) {
    await updateContact(
      existingContact.id,
      contactToUpdatePayload(
        existingContact,
        mergeRioFieldsOntoContact(existingContact, rioFields, {
          identityFillEmptyOnly: true,
        })
      )
    );
    const refreshed = await getContactById(existingContact.id);
    return finalizeSoloContact(refreshed, data, ctx, false);
  }

  if (!rioFields.nom?.trim() || !rioFields.prenom?.trim()) {
    ctx.onMissingIdentity(
      "Impossible de créer le contact : nom et prénom manquants. Pour une CNI/passeport, importez depuis la fiche client (Patrimoine → Importer un document)."
    );
    return null;
  }

  const newContact = await createContact({
    nom: rioFields.nom,
    prenom: rioFields.prenom,
    categorie: rioFields.categorie || "SUSPECT_CLIENT",
    statut_suivi: rioFields.statut_suivi || "ACTIF",
    ...rioFields,
  });

  return finalizeSoloContact(newContact, data, ctx, true);
}
