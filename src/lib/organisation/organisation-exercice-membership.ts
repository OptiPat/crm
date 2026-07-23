import type { Contact } from "@/lib/api/tauri-contacts";
import type { FilleulDossier } from "@/lib/api/tauri-filleul-dossier";
import { isFilleulStatut, isPrescripteurCategorie } from "@/lib/contacts/contact-form-utils";
import {
  resolveFilleulDesinscriptionTimestamp,
  resolveFilleulInscriptionTimestamp,
} from "@/lib/organisation/organisation-filleul-dossier";
import { fiscalYearEndUnix, fiscalYearStartUnix } from "@/lib/pipe/remuneration-fiscal-year";

function contactEffectiveFilleulCategorie(
  contact: Pick<Contact, "filleul_categorie" | "categorie">
): string | null | undefined {
  if (contact.filleul_categorie) return contact.filleul_categorie;
  if (isFilleulStatut(contact.categorie)) return contact.categorie;
  return null;
}

function isEligibleForExerciceNetworkMembership(
  contact: Pick<Contact, "categorie" | "filleul_categorie">
): boolean {
  if (isPrescripteurCategorie(contact.categorie)) return false;
  const filleulCat = contactEffectiveFilleulCategorie(contact);
  return filleulCat === "FILLEUL" || filleulCat === "FILLEUL_DESINSCRIT";
}

/**
 * Consultant présent sur l'exercice : inscription avant fin d'exercice,
 * et (si désinscrit) sortie après le début d'exercice.
 */
export function wasConsultantInNetworkDuringExercice(
  contact: Pick<
    Contact,
    "id" | "categorie" | "filleul_categorie" | "date_inscription_filleul"
  >,
  exerciceLabel: string,
  dossiersByContactId?: Map<number, FilleulDossier>
): boolean {
  if (!isEligibleForExerciceNetworkMembership(contact)) return false;

  const start = fiscalYearStartUnix(exerciceLabel);
  const end = fiscalYearEndUnix(exerciceLabel);
  if (start == null || end == null) return true;

  const dossier = contact.id != null ? dossiersByContactId?.get(contact.id) : undefined;
  const inscription = resolveFilleulInscriptionTimestamp(contact, dossier);
  if (inscription != null && inscription > end) return false;

  const desinscription = resolveFilleulDesinscriptionTimestamp(dossier);
  if (desinscription != null && desinscription < start) return false;

  return true;
}
