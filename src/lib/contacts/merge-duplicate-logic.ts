import type { Contact } from "@/lib/api/tauri-contacts";
import { isFilleulStatut } from "@/lib/contacts/contact-form-utils";

export function effectiveClientCategorie(cat: string): string {
  return isFilleulStatut(cat) ? "AUCUN" : cat;
}

export function effectiveFilleulCategorie(
  c: Pick<Contact, "filleul_categorie" | "categorie">
): string | null | undefined {
  if (c.filleul_categorie) return c.filleul_categorie;
  if (isFilleulStatut(c.categorie)) return c.categorie;
  return null;
}

const CLIENT_CATEGORIE_SCORE: Record<string, number> = {
  CLIENT: 4,
  PROSPECT_CLIENT: 3,
  SUSPECT_CLIENT: 2,
  AUCUN: 0,
  PRESCRIPTEUR: 0,
};

const FILLEUL_CATEGORIE_SCORE: Record<string, number> = {
  FILLEUL: 4,
  PROSPECT_FILLEUL: 3,
  SUSPECT_FILLEUL: 2,
  FILLEUL_DESINSCRIT: 1,
};

export function scoreClientCategorie(cat?: string): number {
  return CLIENT_CATEGORIE_SCORE[cat || ""] ?? 0;
}

export function scoreFilleulCategorie(cat?: string | null): number {
  return cat ? (FILLEUL_CATEGORIE_SCORE[cat] ?? 0) : 0;
}

/** Champs fusionnés à appliquer sur la fiche conservée (plus petit id). */
export interface MergedContactFields {
  categorie: string;
  filleul_categorie?: string;
  date_dernier_contact?: number;
  date_dernier_contact_filleul?: number;
  email?: string;
  telephone?: string;
  civilite?: string;
  situation_familiale?: string;
  notes?: string;
}

/** Agrège les doublons sans effets de bord (pas d'API). */
export function computeMergedContactFields(
  duplicates: Contact[]
): MergedContactFields {
  if (duplicates.length === 0) {
    throw new Error("Aucun contact à fusionner");
  }

  const sorted = [...duplicates].sort((a, b) => a.id! - b.id!);
  const main = sorted[0];

  let mostRecentClient = main.date_dernier_contact;
  let mostRecentFilleul = main.date_dernier_contact_filleul;
  let bestClientCat = effectiveClientCategorie(main.categorie);
  let bestClientScore = scoreClientCategorie(bestClientCat);
  let bestFilleulCat = effectiveFilleulCategorie(main);
  let bestFilleulScore = scoreFilleulCategorie(bestFilleulCat);

  let email = main.email;
  let telephone = main.telephone;
  let civilite = main.civilite;
  let situation = main.situation_familiale;
  const notesParts: string[] = main.notes ? [main.notes] : [];

  for (const c of sorted) {
    if (
      c.date_dernier_contact &&
      (!mostRecentClient || c.date_dernier_contact > mostRecentClient)
    ) {
      mostRecentClient = c.date_dernier_contact;
    }
    if (
      c.date_dernier_contact_filleul &&
      (!mostRecentFilleul || c.date_dernier_contact_filleul > mostRecentFilleul)
    ) {
      mostRecentFilleul = c.date_dernier_contact_filleul;
    }
    const cs = scoreClientCategorie(effectiveClientCategorie(c.categorie));
    if (cs > bestClientScore) {
      bestClientCat = effectiveClientCategorie(c.categorie);
      bestClientScore = cs;
    }
    const fc = effectiveFilleulCategorie(c);
    const fs = scoreFilleulCategorie(fc);
    if (fs > bestFilleulScore) {
      bestFilleulCat = fc;
      bestFilleulScore = fs;
    }
    if (!email && c.email) email = c.email;
    if (!telephone && c.telephone) telephone = c.telephone;
    if (!civilite && c.civilite) civilite = c.civilite;
    if (!situation && c.situation_familiale) situation = c.situation_familiale;
    if (c.notes && !notesParts.includes(c.notes)) notesParts.push(c.notes);
  }

  return {
    categorie: bestClientCat,
    filleul_categorie: bestFilleulCat || undefined,
    date_dernier_contact: mostRecentClient,
    date_dernier_contact_filleul: mostRecentFilleul,
    email,
    telephone,
    civilite,
    situation_familiale: situation,
    notes: notesParts.length > 0 ? notesParts.join("\n---\n") : undefined,
  };
}

/** Id de la fiche principale (plus petit id). */
export function pickMainContactId(duplicates: Contact[]): number {
  return [...duplicates].sort((a, b) => a.id! - b.id!)[0].id!;
}
