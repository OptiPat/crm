import type { Contact } from "@/lib/api/tauri-contacts";
import { isAncienClient } from "@/lib/contacts/contacts-category-match";
import { isFilleulStatut, isPrescripteurCategorie } from "@/lib/contacts/contact-form-utils";

export type ContactAttritionStatResult = {
  activeCount: number;
  attritedCount: number;
  totalCount: number;
  attritionPercent: number;
  activeContactIds: number[];
  attritedContactIds: number[];
};

function contactEffectiveFilleulCategorie(
  contact: Pick<Contact, "filleul_categorie" | "categorie">
): string | null | undefined {
  if (contact.filleul_categorie) return contact.filleul_categorie;
  if (isFilleulStatut(contact.categorie)) return contact.categorie;
  return null;
}

/** Clients actifs ou anciens — hors suspects et prescripteurs. */
export function isContactEligibleForClientAttritionStats(
  contact: Pick<Contact, "categorie">
): boolean {
  if (isPrescripteurCategorie(contact.categorie)) return false;
  return contact.categorie === "CLIENT";
}

/** Filleuls inscrits ou désinscrits — tous parrains, hors suspects filleuls. */
export function isContactEligibleForFilleulAttritionStats(
  contact: Pick<Contact, "categorie" | "filleul_categorie">
): boolean {
  if (isPrescripteurCategorie(contact.categorie)) return false;
  const filleulCat = contactEffectiveFilleulCategorie(contact);
  return filleulCat === "FILLEUL" || filleulCat === "FILLEUL_DESINSCRIT";
}

function buildAttritionResult(
  activeContactIds: number[],
  attritedContactIds: number[]
): ContactAttritionStatResult {
  const activeCount = activeContactIds.length;
  const attritedCount = attritedContactIds.length;
  const totalCount = activeCount + attritedCount;
  return {
    activeCount,
    attritedCount,
    totalCount,
    attritionPercent: totalCount > 0 ? (attritedCount / totalCount) * 100 : 0,
    activeContactIds,
    attritedContactIds,
  };
}

/** Attrition client = anciens clients / (clients actifs + anciens clients). */
export function computeClientAttritionStats(contacts: Contact[]): ContactAttritionStatResult {
  const activeContactIds: number[] = [];
  const attritedContactIds: number[] = [];

  for (const contact of contacts) {
    if (!isContactEligibleForClientAttritionStats(contact) || contact.id == null) continue;
    if (isAncienClient(contact)) {
      attritedContactIds.push(contact.id);
      continue;
    }
    activeContactIds.push(contact.id);
  }

  return buildAttritionResult(activeContactIds, attritedContactIds);
}

/** Attrition filleul = désinscrits / (inscrits + désinscrits), tous parrains confondus. */
export function computeFilleulAttritionStats(contacts: Contact[]): ContactAttritionStatResult {
  const activeContactIds: number[] = [];
  const attritedContactIds: number[] = [];

  for (const contact of contacts) {
    if (!isContactEligibleForFilleulAttritionStats(contact) || contact.id == null) continue;
    const filleulCat = contactEffectiveFilleulCategorie(contact);
    if (filleulCat === "FILLEUL_DESINSCRIT") {
      attritedContactIds.push(contact.id);
      continue;
    }
    activeContactIds.push(contact.id);
  }

  return buildAttritionResult(activeContactIds, attritedContactIds);
}

export function filterContactsForClientAttritionLens(
  contacts: Contact[],
  lens: "active" | "attrited"
): Contact[] {
  return contacts.filter((contact) => {
    if (!isContactEligibleForClientAttritionStats(contact)) return false;
    return lens === "attrited" ? isAncienClient(contact) : !isAncienClient(contact);
  });
}

export function filterContactsForFilleulAttritionLens(
  contacts: Contact[],
  lens: "active" | "attrited"
): Contact[] {
  return contacts.filter((contact) => {
    if (!isContactEligibleForFilleulAttritionStats(contact)) return false;
    const filleulCat = contactEffectiveFilleulCategorie(contact);
    return lens === "attrited"
      ? filleulCat === "FILLEUL_DESINSCRIT"
      : filleulCat === "FILLEUL";
  });
}
