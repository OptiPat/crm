import type { Contact } from "@/lib/api/tauri-contacts";
import type { FilleulDossier, UpsertFilleulDossierInput } from "@/lib/api/tauri-filleul-dossier";
import { upsertFilleulDossier } from "@/lib/api/tauri-filleul-dossier";
import { isFilleulStatut } from "@/lib/contacts/contact-form-utils";
import { dateFieldToIso, toDateInput } from "@/lib/contacts/contact-form-utils";

export function emptyFilleulDossier(contactId: number): FilleulDossier {
  return {
    contactId,
    dateInvitation: null,
    dateInscription: null,
    dateDesinscription: null,
    datePremiereSouscriptionImo: null,
    datePremiereSouscriptionPlacement: null,
    datePremiereSouscriptionScpi: null,
    datePassageManager: null,
    dateHabilitationCif: null,
    datePremierVaaOuVa: null,
    notes: null,
    updatedAt: 0,
  };
}

export function indexFilleulDossiersByContactId(
  dossiers: FilleulDossier[]
): Map<number, FilleulDossier> {
  const map = new Map<number, FilleulDossier>();
  for (const dossier of dossiers) {
    map.set(dossier.contactId, dossier);
  }
  return map;
}

export function dossierDateToInput(value: number | null | undefined): string {
  return toDateInput(value ?? undefined);
}

export function dossierDateInputToTimestamp(field: string): number | null {
  const iso = dateFieldToIso(field);
  if (!iso) return null;
  const ms = Date.parse(iso);
  if (!Number.isFinite(ms)) return null;
  return Math.floor(ms / 1000);
}

export function buildUpsertFilleulDossierInput(
  dossier: FilleulDossier,
  patch: Partial<{
    dateInvitation: string;
    dateInscription: string;
    dateDesinscription: string;
    datePremiereSouscriptionImo: string;
    datePremiereSouscriptionPlacement: string;
    datePremiereSouscriptionScpi: string;
    datePassageManager: string;
    dateHabilitationCif: string;
    datePremierVaaOuVa: string;
    notes: string;
  }>
): UpsertFilleulDossierInput {
  return {
    contactId: dossier.contactId,
    dateInvitation:
      patch.dateInvitation !== undefined
        ? dossierDateInputToTimestamp(patch.dateInvitation)
        : dossier.dateInvitation,
    dateInscription:
      patch.dateInscription !== undefined
        ? dossierDateInputToTimestamp(patch.dateInscription)
        : dossier.dateInscription,
    dateDesinscription:
      patch.dateDesinscription !== undefined
        ? dossierDateInputToTimestamp(patch.dateDesinscription)
        : dossier.dateDesinscription,
    datePremiereSouscriptionImo:
      patch.datePremiereSouscriptionImo !== undefined
        ? dossierDateInputToTimestamp(patch.datePremiereSouscriptionImo)
        : dossier.datePremiereSouscriptionImo,
    datePremiereSouscriptionPlacement:
      patch.datePremiereSouscriptionPlacement !== undefined
        ? dossierDateInputToTimestamp(patch.datePremiereSouscriptionPlacement)
        : dossier.datePremiereSouscriptionPlacement,
    datePremiereSouscriptionScpi:
      patch.datePremiereSouscriptionScpi !== undefined
        ? dossierDateInputToTimestamp(patch.datePremiereSouscriptionScpi)
        : dossier.datePremiereSouscriptionScpi,
    datePassageManager:
      patch.datePassageManager !== undefined
        ? dossierDateInputToTimestamp(patch.datePassageManager)
        : dossier.datePassageManager,
    dateHabilitationCif:
      patch.dateHabilitationCif !== undefined
        ? dossierDateInputToTimestamp(patch.dateHabilitationCif)
        : dossier.dateHabilitationCif,
    datePremierVaaOuVa:
      patch.datePremierVaaOuVa !== undefined
        ? dossierDateInputToTimestamp(patch.datePremierVaaOuVa)
        : dossier.datePremierVaaOuVa,
    notes: patch.notes !== undefined ? patch.notes.trim() || null : dossier.notes,
  };
}

export function hasFilleulDossierRecord(dossier: FilleulDossier): boolean {
  return dossier.updatedAt > 0;
}

/** Vue dossier pour l'UI : ligne DB ou repli dates legacy contacts. */
export function mergeLegacyFilleulDossierView(
  contact: Pick<Contact, "id" | "date_invitation_filleul" | "date_inscription_filleul">,
  dossier?: FilleulDossier | null
): FilleulDossier {
  if (dossier) return dossier;
  const contactId = contact.id;
  if (contactId == null) {
    return emptyFilleulDossier(0);
  }
  return {
    ...emptyFilleulDossier(contactId),
    dateInvitation: contact.date_invitation_filleul ?? null,
    dateInscription: contact.date_inscription_filleul ?? null,
  };
}

export function collectOrganisationMemberContactIds(
  roster: { contact: { id?: number } }[]
): number[] {
  const ids: number[] = [];
  for (const entry of roster) {
    if (entry.contact.id != null) ids.push(entry.contact.id);
  }
  return ids;
}

/** Date invitation : dossier prioritaire ; repli legacy seulement sans ligne dossier. */
export function resolveFilleulInvitationTimestamp(
  contact: Pick<Contact, "date_invitation_filleul">,
  dossier?: FilleulDossier | null
): number | null | undefined {
  if (dossier && hasFilleulDossierRecord(dossier)) {
    return dossier.dateInvitation ?? null;
  }
  if (dossier?.dateInvitation != null) return dossier.dateInvitation;
  return contact.date_invitation_filleul ?? null;
}

/** Date inscription : dossier prioritaire ; repli legacy seulement sans ligne dossier. */
export function resolveFilleulInscriptionTimestamp(
  contact: Pick<Contact, "date_inscription_filleul">,
  dossier?: FilleulDossier | null
): number | null | undefined {
  if (dossier && hasFilleulDossierRecord(dossier)) {
    return dossier.dateInscription ?? null;
  }
  if (dossier?.dateInscription != null) return dossier.dateInscription;
  return contact.date_inscription_filleul ?? null;
}

/** Date désinscription : dossier uniquement. */
export function resolveFilleulDesinscriptionTimestamp(
  dossier?: FilleulDossier | null
): number | null | undefined {
  return dossier?.dateDesinscription ?? null;
}

function contactEffectiveFilleulCategorieForSync(
  contact: Pick<Contact, "filleul_categorie" | "categorie">
): string | null {
  if (contact.filleul_categorie) return contact.filleul_categorie;
  if (isFilleulStatut(contact.categorie)) return contact.categorie;
  return null;
}

/**
 * Aligne le statut filleul (réseau) après saisie ou effacement de la date de désinscription dossier.
 * Retourne `undefined` si aucun changement de statut nécessaire.
 */
export function resolveFilleulCategorieAfterDesinscriptionDateChange(
  contact: Pick<Contact, "filleul_categorie" | "categorie">,
  dateField: string
): string | null | undefined {
  const effective = contactEffectiveFilleulCategorieForSync(contact);
  const hasDate = dateField.trim() !== "";

  if (hasDate) {
    if (effective === "FILLEUL") return "FILLEUL_DESINSCRIT";
    return undefined;
  }

  if (effective === "FILLEUL_DESINSCRIT") return "FILLEUL";
  return undefined;
}

/** Date 1er VAA ou VA : dossier uniquement. */
export function resolveFilleulPremierVaaOuVaTimestamp(
  dossier?: FilleulDossier | null
): number | null | undefined {
  return dossier?.datePremierVaaOuVa ?? null;
}

/** Date qualification Manager : dossier uniquement. */
export function resolveFilleulPassageManagerTimestamp(
  dossier?: FilleulDossier | null
): number | null | undefined {
  return dossier?.datePassageManager ?? null;
}

/** Dates habilitation MIOBSP, MIA et Agent Lié (hors CIF). */
export function collectFilleulHabilitationTimestamps(
  dossier?: FilleulDossier | null
): number[] {
  if (!dossier) return [];
  return [
    dossier.datePremiereSouscriptionImo,
    dossier.datePremiereSouscriptionPlacement,
    dossier.datePremiereSouscriptionScpi,
  ].filter((ts): ts is number => ts != null && Number.isFinite(ts));
}

/**
 * Première habilitation : parmi MIOBSP / MIA / Agent Lié renseignées,
 * la date la plus proche de l'inscription (la plus tôt après inscription si possible).
 */
export function resolveFilleulPremiereHabilitationTimestamp(
  inscriptionUnix: number | null | undefined,
  dossier?: FilleulDossier | null
): number | null {
  const candidates = collectFilleulHabilitationTimestamps(dossier);
  if (candidates.length === 0) return null;
  if (inscriptionUnix == null || !Number.isFinite(inscriptionUnix)) {
    return Math.min(...candidates);
  }
  const onOrAfterInscription = candidates.filter((ts) => ts >= inscriptionUnix);
  return onOrAfterInscription.length > 0
    ? Math.min(...onOrAfterInscription)
    : Math.min(...candidates);
}

export async function upsertFilleulDossierDatesFromImport(
  contactId: number,
  dates: { dateInvitation?: string; dateInscription?: string }
): Promise<FilleulDossier | null> {
  const patch: Partial<{
    dateInvitation: string;
    dateInscription: string;
  }> = {};
  if (dates.dateInvitation) patch.dateInvitation = dates.dateInvitation;
  if (dates.dateInscription) patch.dateInscription = dates.dateInscription;
  if (Object.keys(patch).length === 0) return null;
  return upsertFilleulDossier(
    buildUpsertFilleulDossierInput(emptyFilleulDossier(contactId), patch)
  );
}
