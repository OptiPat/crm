import type { Contact } from "@/lib/api/tauri-contacts";
import type { FilleulDossier } from "@/lib/api/tauri-filleul-dossier";
import { isFilleulStatut } from "@/lib/contacts/contact-form-utils";
import { wasConsultantInNetworkDuringExercice } from "@/lib/organisation/organisation-exercice-membership";

export type OrganisationExerciceVisibilityOptions = {
  exerciceLabel?: string;
  dossiersByContactId?: Map<number, FilleulDossier>;
  hideDesinscrits?: boolean;
};

function contactEffectiveFilleulCategorie(
  contact: Pick<Contact, "filleul_categorie" | "categorie">
): string | null | undefined {
  if (contact.filleul_categorie) return contact.filleul_categorie;
  if (isFilleulStatut(contact.categorie)) return contact.categorie;
  return null;
}

function isDownlineMember(
  contact: Pick<Contact, "filleul_categorie" | "categorie">
): boolean {
  const filleulCat = contactEffectiveFilleulCategorie(contact);
  return filleulCat === "FILLEUL" || filleulCat === "FILLEUL_DESINSCRIT";
}

function isActifFilleul(contact: Pick<Contact, "filleul_categorie" | "categorie">): boolean {
  return contactEffectiveFilleulCategorie(contact) === "FILLEUL";
}

function isDesinscritFilleul(contact: Pick<Contact, "filleul_categorie" | "categorie">): boolean {
  return contactEffectiveFilleulCategorie(contact) === "FILLEUL_DESINSCRIT";
}

/** Membre downline visible dans l'arbre pour l'exercice sélectionné. */
export function isDownlineVisibleInExercice(
  contact: Contact,
  options?: OrganisationExerciceVisibilityOptions
): boolean {
  if (!isDownlineMember(contact)) return false;
  if (!options?.exerciceLabel) return isActifFilleul(contact);
  if (options.hideDesinscrits && isDesinscritFilleul(contact)) return false;
  return wasConsultantInNetworkDuringExercice(
    contact,
    options.exerciceLabel,
    options.dossiersByContactId
  );
}

/** Parrain visible le plus proche (remonte la chaîne si parrains absents de l'exercice). */
export function resolveVisibleDownlineParrainId(
  contact: Contact,
  selfContactId: number,
  byId: Map<number, Contact>,
  options?: OrganisationExerciceVisibilityOptions
): number {
  let currentId = contact.parrain_id ?? null;
  const visited = new Set<number>();

  while (currentId != null) {
    if (currentId === selfContactId) return selfContactId;
    if (visited.has(currentId)) break;
    visited.add(currentId);

    const parrain = byId.get(currentId);
    if (!parrain) break;
    if (isDownlineVisibleInExercice(parrain, options)) return currentId;
    currentId = parrain.parrain_id ?? null;
  }

  return selfContactId;
}
