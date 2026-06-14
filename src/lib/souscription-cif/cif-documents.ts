/**
 * Modèle documentaire CIF — Patrimoine CRM.
 *
 * - **Lettre de mission** : signée une fois, commune à toutes les solutions (pages 1–7).
 * - **Rapport de mission** : par souscription ; structure similaire, champs dossier spécifiques.
 * - **Annexes au rapport** : par souscription ; contenu et déclaration d'adéquation détaillée
 *   selon le produit (SCPI rendement, Girardin, etc.).
 *
 * Le `productType` du brouillon sélectionne le gabarit d'annexes (aujourd'hui : `scpi` uniquement).
 */

export const ANNEXES_RAPPORT_DOCUMENT_TITLE =
  "Annexes au rapport de mission et déclaration d'adéquation";

export type CifDocumentLifecycle = "once" | "per-subscription";

export const CIF_DOCUMENT_LIFECYCLE: Record<
  "lettre-mission" | "rapport-mission" | "annexes-rapport",
  CifDocumentLifecycle
> = {
  "lettre-mission": "once",
  "rapport-mission": "per-subscription",
  "annexes-rapport": "per-subscription",
};
