import { IMMOBILIER_TYPES } from "@/lib/investissements/investissement-display";
import { EPARGNE_BANCAIRE_TYPES } from "./epargne-bancaire-types";
import { PATRIMOINE_CATEGORIE_COLORS } from "./patrimoine-palette";

export type PatrimoineCategorie =
  | "Immobilier"
  | "SCPI"
  | "Épargne bancaire"
  | "Placements financiers"
  | "Prévoyance"
  | "Autre";

const SCPI_TYPES = new Set(["SCPI", "SCPI_DEMEMBREMENT", "SCPI_FISCALE"]);

const IMMOBILIER_SET = new Set<string>(IMMOBILIER_TYPES);

/** Regroupe un `type_produit` en catégorie affichable côté espace client. */
export function getPatrimoineCategorie(typeProduit: string | undefined): PatrimoineCategorie {
  if (!typeProduit) return "Autre";
  if (IMMOBILIER_SET.has(typeProduit)) return "Immobilier";
  if (SCPI_TYPES.has(typeProduit)) return "SCPI";
  if (EPARGNE_BANCAIRE_TYPES.has(typeProduit)) return "Épargne bancaire";
  if (typeProduit === "PREVOYANCE") return "Prévoyance";
  return "Placements financiers";
}

export const PATRIMOINE_CATEGORIE_ORDER: PatrimoineCategorie[] = [
  "Immobilier",
  "SCPI",
  "Placements financiers",
  "Épargne bancaire",
  "Prévoyance",
  "Autre",
];

export { PATRIMOINE_CATEGORIE_COLORS };
