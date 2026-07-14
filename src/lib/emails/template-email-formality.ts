import type { Contact } from "@/lib/api/tauri-contacts";
import { getTemplateCorpsHtml } from "@/lib/emails/template-email-html";

/** Registre d'adresse sur la fiche contact (modèles liés tu / vous). */
export type ContactRegistre = "VOUS" | "TU";

export const DEFAULT_CONTACT_REGISTRE: ContactRegistre = "VOUS";

export function normalizeContactRegistre(
  value: string | null | undefined
): ContactRegistre {
  if (value?.trim().toUpperCase() === "TU") return "TU";
  return "VOUS";
}

export function isContactTu(registre: string | null | undefined): boolean {
  return normalizeContactRegistre(registre) === "TU";
}

const TUTOIEMENT_NOM_SUFFIX = " (tu)";

/** Nom du modèle enfant lié (variante tutoiement). */
export function buildTutoiementTemplateNom(parentNom: string): string {
  const trimmed = parentNom.trim();
  if (!trimmed) return "Modèle (tu)";
  if (trimmed.endsWith(TUTOIEMENT_NOM_SUFFIX)) {
    return trimmed;
  }
  return `${trimmed}${TUTOIEMENT_NOM_SUFFIX}`;
}

export type TemplateContentSlice = {
  sujet: string;
  corps: string;
  variables?: string | null;
  agenda_link_id?: string | null;
};

/** Choisit la variante vous (principal) ou tu (liée) selon le contact. */
export function pickTemplateContentForRegistre(
  principal: TemplateContentSlice,
  tutoiement: TemplateContentSlice | null,
  registre: string | null | undefined
): TemplateContentSlice {
  if (isContactTu(registre) && tutoiement) {
    return tutoiement;
  }
  return principal;
}

export function pickTemplateCorpsHtmlForRegistre(
  principalVariables: string | null | undefined,
  tutoiementVariables: string | null | undefined,
  registre: string | null | undefined
): string | null {
  const vars = isContactTu(registre) ? tutoiementVariables : principalVariables;
  return getTemplateCorpsHtml(vars) ?? null;
}

/**
 * Variables (PJ incluses) de la variante effective selon le registre.
 * Si une variante tu existe, on n'hérite pas des PJ du modèle principal.
 */
export function pickTemplateVariablesForRegistre(
  principalVariables: string | null | undefined,
  tutoiementVariables: string | null | undefined,
  registre: string | null | undefined,
  hasTutoiementVariant = false
): string | null | undefined {
  if (isContactTu(registre) && hasTutoiementVariant) {
    return tutoiementVariables ?? null;
  }
  return principalVariables;
}

export function contactRegistreLabel(registre: string | null | undefined): string {
  return isContactTu(registre) ? "Tutoiement" : "Vouvoiement";
}

export function contactRegistreFromContact(
  contact: Pick<Contact, "registre"> | null | undefined
): ContactRegistre {
  return normalizeContactRegistre(contact?.registre);
}

/** Pastille lecture seule (file Envois, confirmation d'envoi). */
export function contactRegistreBadgeClass(registre: string | null | undefined): string {
  return isContactTu(registre)
    ? "bg-violet-100 text-violet-950 border-violet-400"
    : "bg-sky-100 text-sky-950 border-sky-400";
}
