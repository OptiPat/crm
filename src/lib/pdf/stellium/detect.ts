import { normalizeStelliumText } from "./normalize";

export type StelliumDocumentKind = "RIO" | "QPI";

/**
 * QPI Stellium : titre explicite en tête de document.
 * On exclut les faux positifs dus aux mentions légales du RIO.
 */
export function isStelliumQpi(text: string): boolean {
  const normalized = normalizeStelliumText(text);
  const head = normalized.slice(0, 600).toLowerCase();
  return (
    head.includes("profil investisseur") &&
    !head.includes("recueil d'informations")
  );
}

/**
 * RIO Stellium : recueil d'informations en tête de document.
 */
export function isStelliumRio(text: string): boolean {
  const normalized = normalizeStelliumText(text);
  const head = normalized.slice(0, 600).toLowerCase();
  return head.includes("recueil d'informations");
}

export function detectStelliumDocument(text: string): StelliumDocumentKind | null {
  if (isStelliumQpi(text)) return "QPI";
  if (isStelliumRio(text)) return "RIO";
  return null;
}
