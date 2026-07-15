import type { Contact, NewContact } from "@/lib/api/tauri-contacts";
import {
  getContactById,
  getContactsByFoyer,
  updateContact,
} from "@/lib/api/tauri-contacts";
import type { PipeRecord } from "@/lib/api/tauri-pipe";
import { listPipes } from "@/lib/api/tauri-pipe";
import {
  contactToUpdatePayload,
  isClientActif,
  isFilleulStatut,
  isPrescripteurCategorie,
  toDateInput,
} from "@/lib/contacts/contact-form-utils";

export type ProspectionDatesFields = {
  date_r1?: string;
  date_dernier_contact?: string;
};

export function prospectionDatesFromContact(
  contact: Pick<Contact, "date_r1" | "date_dernier_contact">
): ProspectionDatesFields {
  return {
    date_r1: toDateInput(contact.date_r1),
    date_dernier_contact: toDateInput(contact.date_dernier_contact),
  };
}

export function hasAnyProspectionDates(
  dates: ProspectionDatesFields | null | undefined
): boolean {
  if (!dates) return false;
  return !!(dates.date_r1?.trim() || dates.date_dernier_contact?.trim());
}

/** Membre éligible à la copie R1 / dernier contact (hors enfants, prescripteurs, filleuls purs). */
export function isProspectionDateMemberEligible(
  member: Pick<Contact, "categorie" | "role_foyer" | "filleul_categorie">
): boolean {
  if (member.role_foyer === "ENFANT") return false;
  if (isPrescripteurCategorie(member.categorie)) return false;
  if (isClientActif(member.categorie)) return true;
  if (isFilleulStatut(member.filleul_categorie)) return false;
  return member.categorie === "AUCUN";
}

/** Co-contacts déclarés sur un pipe Affaire (conjoint commercial). */
export function pipeCoContactIdsForContact(
  contactId: number,
  pipes: Pick<PipeRecord, "pipe_type" | "contact_id" | "secondary_contact_id">[]
): number[] {
  const ids = new Set<number>();
  for (const pipe of pipes) {
    if (pipe.pipe_type !== "AFFAIRE") continue;
    if (
      pipe.contact_id === contactId &&
      pipe.secondary_contact_id != null &&
      pipe.secondary_contact_id > 0
    ) {
      ids.add(pipe.secondary_contact_id);
    }
    if (pipe.secondary_contact_id === contactId && pipe.contact_id > 0) {
      ids.add(pipe.contact_id);
    }
  }
  return Array.from(ids);
}

/** Autres contacts éligibles dans une liste (hors contact courant). */
export function filterProspectionDateTargets(
  members: readonly Contact[],
  excludeContactId?: number
): Contact[] {
  return members.filter(
    (member) =>
      member.id != null &&
      member.id !== excludeContactId &&
      isProspectionDateMemberEligible(member)
  );
}

/** Ne remplace une date existante que si la date source est plus récente ou égale. */
export function shouldApplyProspectionDateOverride(
  existingDate: string | number | null | undefined,
  incomingDate: string | undefined
): boolean {
  const incoming = incomingDate?.trim();
  if (!incoming) return false;
  const existing = toDateInput(existingDate)?.trim();
  if (!existing) return true;
  return incoming >= existing;
}

/** Overrides à appliquer sur un contact selon les dates saisies. */
export function prospectionDatesOverridesForMember(
  member: Pick<
    Contact,
    | "categorie"
    | "role_foyer"
    | "filleul_categorie"
    | "date_r1"
    | "date_dernier_contact"
  >,
  dates: ProspectionDatesFields
): Partial<NewContact> | null {
  if (!isProspectionDateMemberEligible(member) || !hasAnyProspectionDates(dates)) {
    return null;
  }

  const overrides: Partial<NewContact> = {};
  const dernierContact = dates.date_dernier_contact?.trim();
  const dateR1 = dates.date_r1?.trim();
  let promotesProspect = false;

  if (
    dernierContact &&
    shouldApplyProspectionDateOverride(member.date_dernier_contact, dernierContact)
  ) {
    overrides.date_dernier_contact = dernierContact;
    promotesProspect = true;
  }
  if (dateR1 && shouldApplyProspectionDateOverride(member.date_r1, dateR1)) {
    overrides.date_r1 = dateR1;
    promotesProspect = true;
  }

  if (
    promotesProspect &&
    (member.categorie === "AUCUN" || member.categorie === "SUSPECT_CLIENT")
  ) {
    overrides.categorie = "PROSPECT_CLIENT";
  }

  return Object.keys(overrides).length > 0 ? overrides : null;
}

/**
 * Contacts cibles : autres membres du foyer + co-contact pipe Affaire.
 */
export async function getProspectionDatePropagationTargets(options: {
  contactId: number;
  foyerId?: number | null;
  preloadedFoyerMembers?: Contact[];
  preloadedPipes?: PipeRecord[];
}): Promise<Contact[]> {
  const { contactId, foyerId, preloadedFoyerMembers, preloadedPipes } = options;
  const byId = new Map<number, Contact>();

  if (foyerId) {
    const members =
      preloadedFoyerMembers && preloadedFoyerMembers.length > 0
        ? preloadedFoyerMembers
        : await getContactsByFoyer(foyerId);
    for (const member of filterProspectionDateTargets(members, contactId)) {
      if (member.id != null) byId.set(member.id, member);
    }
  }

  const pipes = preloadedPipes ?? (await listPipes());
  for (const coContactId of pipeCoContactIdsForContact(contactId, pipes)) {
    if (byId.has(coContactId)) continue;
    const contact = await getContactById(coContactId);
    if (contact?.id != null && isProspectionDateMemberEligible(contact)) {
      byId.set(contact.id, contact);
    }
  }

  return Array.from(byId.values());
}

/**
 * Copie R1 et/ou dernier contact vers le conjoint / autres membres du foyer.
 */
export async function propagateProspectionDatesToRelatedContacts(options: {
  contactId: number;
  foyerId?: number | null;
  dates: ProspectionDatesFields;
  preloadedFoyerMembers?: Contact[];
}): Promise<Contact[]> {
  const { contactId, foyerId, dates, preloadedFoyerMembers } = options;
  if (!hasAnyProspectionDates(dates)) return [];

  const targets = await getProspectionDatePropagationTargets({
    contactId,
    foyerId,
    preloadedFoyerMembers,
  });
  const updated: Contact[] = [];

  for (const member of targets) {
    if (member.id == null) continue;
    const overrides = prospectionDatesOverridesForMember(member, dates);
    if (!overrides) continue;
    updated.push(
      await updateContact(member.id, contactToUpdatePayload(member, overrides))
    );
  }

  return updated;
}

/** @deprecated Utiliser filterProspectionDateTargets */
export const otherFoyerMembersForProspectionSync = filterProspectionDateTargets;

/** @deprecated Utiliser propagateProspectionDatesToRelatedContacts */
export async function propagateProspectionDatesToFoyerMembers(options: {
  foyerId: number;
  excludeContactId?: number;
  dates: ProspectionDatesFields;
}): Promise<Contact[]> {
  if (options.excludeContactId == null) return [];
  return propagateProspectionDatesToRelatedContacts({
    contactId: options.excludeContactId,
    foyerId: options.foyerId,
    dates: options.dates,
  });
}

/** @deprecated Utiliser isProspectionDateMemberEligible */
export const isProspectionDateFoyerMemberEligible = isProspectionDateMemberEligible;
