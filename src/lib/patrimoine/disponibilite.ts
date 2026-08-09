import { IMMOBILIER_TYPES } from "@/lib/investissements/investissement-display";
import { HORIZON_CHART_COLORS } from "./patrimoine-palette";
import { EPARGNE_BANCAIRE_TYPES } from "./epargne-bancaire-types";
/**
 * Horizon patrimonial affiché au client (graphique « Par horizon »).
 *
 * Règles métier :
 * - Court terme : épargne bancaire liquide
 * - Moyen terme : assurance-vie, PEA, compte-titres
 * - Long terme : PER, immobilier (hors RP), SCPI, épargne salariale
 * - Résidence principale : ligne dédiée (RP / RESIDENCE_PRINCIPALE)
 */
export type DisponibiliteHorizon =
  | "court_terme"
  | "moyen_terme"
  | "long_terme"
  | "residence_principale";


const IMMOBILIER_SET = new Set<string>(IMMOBILIER_TYPES);
const RESIDENCE_PRINCIPALE_TYPES = new Set(["RESIDENCE_PRINCIPALE", "RP"]);

/** Placements financiers à horizon intermédiaire. */
const MOYEN_TERME_TYPES = new Set([
  "ASSURANCE_VIE",
  "CONTRAT_CAPITALISATION",
  "PEA",
  "COMPTE_TITRE",
  "COMPTE_TITRES",
]);

/** PER et épargne salariale. */
const LONG_TERME_EPARGNE_TYPES = new Set([
  "PER",
  "PERCO",
  "PERCOL",
  "PERP",
  "EPARGNE_SALARIALE",
  "PEE",
]);

const SCPI_TYPES = new Set(["SCPI", "SCPI_DEMEMBREMENT", "SCPI_FISCALE"]);

export interface DisponibiliteInput {
  type_produit: string;
}

export function isResidencePrincipaleType(typeProduit: string): boolean {
  return RESIDENCE_PRINCIPALE_TYPES.has(typeProduit);
}

export function getDisponibiliteHorizon(
  input: DisponibiliteInput
): DisponibiliteHorizon {
  const { type_produit } = input;

  if (isResidencePrincipaleType(type_produit)) {
    return "residence_principale";
  }
  if (EPARGNE_BANCAIRE_TYPES.has(type_produit)) {
    return "court_terme";
  }
  if (MOYEN_TERME_TYPES.has(type_produit)) {
    return "moyen_terme";
  }
  if (LONG_TERME_EPARGNE_TYPES.has(type_produit)) {
    return "long_terme";
  }
  if (SCPI_TYPES.has(type_produit)) {
    return "long_terme";
  }
  if (IMMOBILIER_SET.has(type_produit)) {
    return "long_terme";
  }
  if (type_produit === "PREVOYANCE") {
    return "long_terme";
  }
  return "long_terme";
}

export function formatDisponibiliteLabel(horizon: DisponibiliteHorizon): string {
  switch (horizon) {
    case "court_terme":
      return "Court terme";
    case "moyen_terme":
      return "Moyen terme";
    case "long_terme":
      return "Long terme";
    case "residence_principale":
      return "Résidence principale";
  }
}

export const HORIZON_LABEL_ORDER = [
  "Court terme",
  "Moyen terme",
  "Long terme",
  "Résidence principale",
] as const;

export const DISPONIBILITE_CHART_COLORS = HORIZON_CHART_COLORS;
