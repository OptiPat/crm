import type { Contact } from "@/lib/api/tauri-contacts";
import type { FilleulDossier } from "@/lib/api/tauri-filleul-dossier";
import { isAncienClient } from "@/lib/contacts/contacts-category-match";
import { isFilleulStatut, isPrescripteurCategorie } from "@/lib/contacts/contact-form-utils";
import {
  resolveFilleulInscriptionTimestamp,
  resolveFilleulDesinscriptionTimestamp,
} from "@/lib/organisation/organisation-filleul-dossier";
import {
  isAffiliationInExercice,
  wasConsultantPresentAtExerciceStart,
} from "@/lib/statistiques/contact-filleul-organisation-stats";

export type ContactAttritionStatResult = {
  activeCount: number;
  attritedCount: number;
  totalCount: number;
  attritionPercent: number;
  activeContactIds: number[];
  attritedContactIds: number[];
};

export type FilleulAttritionExerciceStatsOptions = {
  dossiersByContactId?: Map<number, FilleulDossier>;
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

/** Désinscription du filleul tombant dans l'exercice fiscal (date dossier). */
export function isFilleulDesinscriptionInExercice(
  contact: Pick<Contact, "id" | "categorie" | "filleul_categorie" | "date_inscription_filleul">,
  exerciceLabel: string,
  dossiersByContactId?: Map<number, FilleulDossier>
): boolean {
  if (!isContactEligibleForFilleulAttritionStats(contact)) return false;
  const dossier = contact.id != null ? dossiersByContactId?.get(contact.id) : undefined;
  const desinscription = resolveFilleulDesinscriptionTimestamp(dossier);
  if (!isAffiliationInExercice(desinscription, exerciceLabel)) return false;
  const inscription = resolveFilleulInscriptionTimestamp(contact, dossier);
  if (
    inscription != null &&
    desinscription != null &&
    inscription > desinscription
  ) {
    return false;
  }
  return true;
}

/**
 * Attrition filleul sur l'exercice : désinscriptions de la période parmi la cohorte
 * présente au 1er jour de l'exercice (inscrits + désinscrits selon dates dossier).
 */
export function computeFilleulAttritionExerciceStats(
  contacts: Contact[],
  exerciceLabel: string,
  options?: FilleulAttritionExerciceStatsOptions
): ContactAttritionStatResult {
  const dossiersByContactId = options?.dossiersByContactId;
  const cohortContactIds: number[] = [];
  const attritedContactIds: number[] = [];
  const activeContactIds: number[] = [];

  for (const contact of contacts) {
    if (contact.id == null) continue;
    if (!wasConsultantPresentAtExerciceStart(contact, exerciceLabel, dossiersByContactId)) {
      continue;
    }
    cohortContactIds.push(contact.id);
    if (isFilleulDesinscriptionInExercice(contact, exerciceLabel, dossiersByContactId)) {
      attritedContactIds.push(contact.id);
    } else {
      activeContactIds.push(contact.id);
    }
  }

  const totalCount = cohortContactIds.length;
  const attritedCount = attritedContactIds.length;

  return {
    activeCount: activeContactIds.length,
    attritedCount,
    totalCount,
    attritionPercent: totalCount > 0 ? (attritedCount / totalCount) * 100 : 0,
    activeContactIds,
    attritedContactIds,
  };
}

export function formatFilleulAttritionExerciceSubtitle(
  stats: ContactAttritionStatResult,
  exerciceLabel: string
): string {
  const pct = stats.attritionPercent.toFixed(1).replace(".0", "");
  return `${stats.attritedCount} désinscription${stats.attritedCount > 1 ? "s" : ""} · ${pct} % · cohorte ${stats.totalCount} au 01/08 · ${exerciceLabel}`;
}

export function formatFilleulAttritionCumulativeIndex(
  stats: ContactAttritionStatResult
): string {
  const pct = stats.attritionPercent.toFixed(1).replace(".0", "");
  return `${pct} % — ${stats.attritedCount}/${stats.totalCount} désinscrits (état actuel)`;
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

export function filterContactsForFilleulAttritionExerciceLens(
  contacts: Contact[],
  lens: "active" | "attrited",
  exerciceLabel: string,
  options?: FilleulAttritionExerciceStatsOptions
): Contact[] {
  const dossiersByContactId = options?.dossiersByContactId;
  return contacts.filter((contact) => {
    if (!wasConsultantPresentAtExerciceStart(contact, exerciceLabel, dossiersByContactId)) {
      return false;
    }
    const departed = isFilleulDesinscriptionInExercice(
      contact,
      exerciceLabel,
      dossiersByContactId
    );
    return lens === "attrited" ? departed : !departed;
  });
}
