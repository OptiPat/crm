import {
  findContactByEmail,
  findContactByName,
  getContactById,
  getContactsByFoyer,
  createContact,
  updateContact,
  type Contact,
} from "@/lib/api/tauri-contacts";
import { createFoyer } from "@/lib/api/tauri-foyers";
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
  buildCoupleApplySummary,
  contactMatchesCoupleMember,
  mapCoupleMemberToNewContact,
  pickPreferredContactForCouple,
  resolveCoupleMemberInContacts,
  toPerson1Extract,
  toPerson2Extract,
  type RioCoupleMemberExtract,
} from "@/lib/contacts/rio-couple-import";
import {
  buildFoyerNomFromMembers,
  linkContactToFoyer,
} from "@/lib/foyers/foyer-utils";

export interface RioCoupleApplyResult {
  finalContactId: number;
  foyerId: number;
  memberContactIds: [number, number];
  successMessage: string;
  hasExistingInvestments: boolean;
  displayNom: string;
}

export interface RioCoupleApplyContext {
  effectiveContactId?: number;
  explicitFoyerId?: number;
  importContacts: Contact[];
  onMissingIdentity: (message: string) => void;
  confirmIdentityMerge: (message: string) => boolean;
}

async function resolveCoupleMember(
  member: RioCoupleMemberExtract,
  importContacts: Contact[],
  options?: {
    preferredContact?: Contact | null;
    spouseContact?: Contact | null;
    excludeContactId?: number;
  }
): Promise<Contact | null> {
  const fromCache = resolveCoupleMemberInContacts(member, importContacts, options);
  if (fromCache) return fromCache;

  const preferred = options?.preferredContact;
  if (preferred && contactMatchesCoupleMember(preferred, member)) {
    return preferred;
  }

  if (member.email?.trim()) {
    const byEmail = await findContactByEmail(member.email.trim());
    if (byEmail && byEmail.id !== options?.excludeContactId) return byEmail;
  }

  const nom = member.nom?.trim();
  const prenom = member.prenom?.trim();
  if (nom && prenom) {
    const byName = await findContactByName(nom, prenom);
    if (byName && byName.id !== options?.excludeContactId) return byName;
  }

  if (options?.spouseContact?.foyer_id) {
    const peers = await getContactsByFoyer(options.spouseContact.foyer_id);
    const inFoyer = resolveCoupleMemberInContacts(member, peers, {
      excludeContactId: options?.excludeContactId,
    });
    if (inFoyer) return inFoyer;
  }

  return null;
}

async function upsertCoupleMember(
  member: RioCoupleMemberExtract,
  ctx: RioCoupleApplyContext,
  options?: {
    situationFamiliale?: string;
    preferredContact?: Contact | null;
    spouseContact?: Contact | null;
    excludeContactId?: number;
  }
): Promise<{ contact: Contact; created: boolean } | null> {
  let existing = await resolveCoupleMember(member, ctx.importContacts, options);

  const identityConflicts =
    existing &&
    getPairIdentityConflictMessages(
      { email: member.email, telephone: member.telephone },
      existing
    );

  if (existing && identityConflicts && identityConflicts.length > 0) {
    const confirmMerge = ctx.confirmIdentityMerge(
      [
        "Même nom/prénom mais coordonnées différentes :",
        identityConflicts.join(", "),
        "",
        "Fiche en base :",
        formatIdentityLine(existing),
        "Document :",
        formatIdentityLine({ email: member.email, telephone: member.telephone }),
        "",
        "Fusionner sur la fiche existante ?",
        "(Annuler = créer une nouvelle fiche)",
      ].join("\n")
    );
    if (!confirmMerge) {
      existing = null;
    }
  }

  const newData = mapCoupleMemberToNewContact(member, {
    situationFamiliale: options?.situationFamiliale,
  });

  if (existing) {
    await updateContact(
      existing.id,
      contactToUpdatePayload(existing, {
        nom: newData.nom || existing.nom,
        prenom: newData.prenom || existing.prenom,
        civilite: newData.civilite || existing.civilite,
        email: newData.email || existing.email,
        telephone: newData.telephone || existing.telephone,
        adresse: newData.adresse || existing.adresse,
        code_postal: newData.code_postal || existing.code_postal,
        ville: newData.ville || existing.ville,
        date_naissance: newData.date_naissance || undefined,
        profession: newData.profession || existing.profession,
        situation_familiale: newData.situation_familiale || existing.situation_familiale,
      })
    );
    return { contact: existing, created: false };
  }

  if (!newData.nom?.trim() || !newData.prenom?.trim()) {
    ctx.onMissingIdentity("Impossible de créer le contact : nom et prénom manquants.");
    return null;
  }

  const created = await createContact(newData);
  return { contact: created, created: true };
}

export async function ensureCoupleFoyer(
  contact1: Contact,
  contact2: Contact,
  explicitFoyerId?: number
): Promise<{ foyerId: number; contact1: Contact; contact2: Contact }> {
  let foyerIdToUse = explicitFoyerId;

  if (!foyerIdToUse) {
    if (
      contact1.foyer_id &&
      contact2.foyer_id &&
      Number(contact1.foyer_id) === Number(contact2.foyer_id)
    ) {
      foyerIdToUse = contact1.foyer_id;
    } else if (contact1.foyer_id && !contact2.foyer_id) {
      foyerIdToUse = contact1.foyer_id;
    } else if (contact2.foyer_id && !contact1.foyer_id) {
      foyerIdToUse = contact2.foyer_id;
    }
  }

  let updated1 = contact1;
  let updated2 = contact2;

  if (!foyerIdToUse) {
    const foyer = await createFoyer({
      nom: buildFoyerNomFromMembers([contact1, contact2]),
      type_foyer: "COUPLE",
      notes: "Créé depuis import RIO couple",
    });
    foyerIdToUse = foyer.id;
  }

  if (Number(updated1.foyer_id) !== Number(foyerIdToUse)) {
    updated1 = await linkContactToFoyer(updated1, foyerIdToUse, "DECLARANT_1");
  }
  if (Number(updated2.foyer_id) !== Number(foyerIdToUse)) {
    updated2 = await linkContactToFoyer(updated2, foyerIdToUse, "DECLARANT_2");
  }

  return { foyerId: foyerIdToUse, contact1: updated1, contact2: updated2 };
}

export async function applyCoupleRioImport(
  data: ExtractedData,
  ctx: RioCoupleApplyContext
): Promise<RioCoupleApplyResult | null> {
  const person1Extract = toPerson1Extract(data);
  const person2Extract = toPerson2Extract(data);
  if (!person2Extract) {
    ctx.onMissingIdentity("Couple RIO : identité du second investisseur incomplète.");
    return null;
  }

  let openedContact: Contact | null = null;
  if (ctx.effectiveContactId) {
    try {
      openedContact = await getContactById(ctx.effectiveContactId);
    } catch {
      openedContact = null;
    }
  }

  const { person1Preferred, person2Preferred } = pickPreferredContactForCouple(
    openedContact,
    person1Extract,
    person2Extract
  );

  const person1Result = await upsertCoupleMember(person1Extract, ctx, {
    situationFamiliale: data.situationFamiliale,
    preferredContact: person1Preferred,
  });
  if (!person1Result) return null;

  const person2Result = await upsertCoupleMember(person2Extract, ctx, {
    situationFamiliale: data.situationFamiliale,
    preferredContact: person2Preferred,
    spouseContact: person1Result.contact,
    excludeContactId: person1Result.contact.id,
  });
  if (!person2Result) return null;

  const foyerLink = await ensureCoupleFoyer(
    person1Result.contact,
    person2Result.contact,
    ctx.explicitFoyerId
  );

  const finalContactId = person2Preferred
    ? foyerLink.contact2.id
    : person1Preferred
      ? foyerLink.contact1.id
      : foyerLink.contact1.id;

  let hasExistingInvestments = false;
  try {
    const inv1 = await getInvestissementsByContact(foyerLink.contact1.id);
    const inv2 = await getInvestissementsByContact(foyerLink.contact2.id);
    const invFoyer = await getInvestissementsByFoyer(foyerLink.foyerId);
    hasExistingInvestments = inv1.length > 0 || inv2.length > 0 || invFoyer.length > 0;
  } catch {
    hasExistingInvestments = false;
  }

  return {
    finalContactId,
    foyerId: foyerLink.foyerId,
    memberContactIds: [foyerLink.contact1.id, foyerLink.contact2.id],
    successMessage: buildCoupleApplySummary({
      person1: foyerLink.contact1,
      person2: foyerLink.contact2,
      person1Created: person1Result.created,
      person2Created: person2Result.created,
    }),
    hasExistingInvestments,
    displayNom: `${foyerLink.contact1.prenom} ${foyerLink.contact1.nom} & ${foyerLink.contact2.prenom} ${foyerLink.contact2.nom}`,
  };
}
