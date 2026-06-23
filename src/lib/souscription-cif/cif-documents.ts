/**
 * Modèle documentaire CIF — Patrimoine CRM.
 *
 * - **Lettre de mission** : signée une fois, commune à toutes les solutions (pages 1–7).
 * - **Convention RTO** : signée une fois, réception-transmission d'ordres (SCPI, Capital invest.).
 *   Absente pour **G3F** (Girardin industriel).
 * - **Rapport de mission** : par souscription ; structure similaire, champs dossier spécifiques.
 * - **Annexes au rapport** : par souscription ; contenu et déclaration d'adéquation détaillée
 *   selon le produit (SCPI rendement, Girardin, etc.).
 *
 * Le `productType` du brouillon sélectionne le gabarit d'annexes (`scpi`, `capital-investissement`, `g3f`).
 */

export const ANNEXES_RAPPORT_DOCUMENT_TITLE =
  "Annexes au rapport de mission et déclaration d'adéquation";

export { RTO_DOCUMENT_TITLE } from "@/lib/souscription-cif/rto-page1";

export type CifDocumentLifecycle = "once" | "per-subscription";

export const CIF_DOCUMENT_LIFECYCLE: Record<
  "lettre-mission" | "convention-rto" | "rapport-mission" | "annexes-rapport",
  CifDocumentLifecycle
> = {
  "lettre-mission": "once",
  "convention-rto": "once",
  "rapport-mission": "per-subscription",
  "annexes-rapport": "per-subscription",
};
