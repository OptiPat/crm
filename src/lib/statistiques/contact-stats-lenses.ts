import type { Contact } from "@/lib/api/tauri-contacts";
import { isFilleulStatut, isPrescripteurCategorie } from "@/lib/contacts/contact-form-utils";

export type ContactStatsLens = "client" | "filleul";

function contactEffectiveFilleulCategorie(
  contact: Pick<Contact, "filleul_categorie" | "categorie">
): string | null | undefined {
  if (contact.filleul_categorie) return contact.filleul_categorie;
  if (isFilleulStatut(contact.categorie)) return contact.categorie;
  return null;
}

/** Lentille client : actifs, anciens et prospects clients — suspects exclus. */
export function isContactEligibleForClientStatsLens(
  contact: Pick<Contact, "categorie">
): boolean {
  if (isPrescripteurCategorie(contact.categorie)) return false;
  return contact.categorie === "CLIENT" || contact.categorie === "PROSPECT_CLIENT";
}

/** Lentille filleul : inscrits, prospects et désinscrits — tous parrains, suspects exclus. */
export function isContactEligibleForFilleulStatsLens(
  contact: Pick<Contact, "categorie" | "filleul_categorie">
): boolean {
  if (isPrescripteurCategorie(contact.categorie)) return false;
  const filleulCat = contactEffectiveFilleulCategorie(contact);
  return (
    filleulCat === "FILLEUL" ||
    filleulCat === "PROSPECT_FILLEUL" ||
    filleulCat === "FILLEUL_DESINSCRIT"
  );
}

export function isContactEligibleForStatsLens(
  contact: Pick<Contact, "categorie" | "filleul_categorie">,
  lens: ContactStatsLens
): boolean {
  return lens === "client"
    ? isContactEligibleForClientStatsLens(contact)
    : isContactEligibleForFilleulStatsLens(contact);
}
