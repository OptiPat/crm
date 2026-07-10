import { mapDispositifFiscalToTypeProduit } from "@/lib/investissements/immo-commandes-import";
import { isImmobilierFinancingType } from "@/lib/investissements/investissement-immo-financing";
import type { BienImmobilier } from "../types";

/** Préfixes d'actifs immo reconnus dans les regex Stellium (RIO actifs / passifs). */
export const STELLIUM_IMMO_ACTIF_PREFIXES =
  "Résidence principale|Résidence secondaire|Classique|Pinel|LMNP|LMP|Denormandie|Malraux|Jeanbrun|Besson|Scellier|Robien|Méhaignerie|Mehaignerie|Périssol|Perissol|Duflot|Borloo|Monument Historique|D[eé]ficit Foncier";

/** Types produit dans les libellés de crédit immobilier (passifs RIO). */
export const STELLIUM_IMMO_CREDIT_PRODUCT_TYPES =
  "RP|Classique|Pinel|LMNP|LMP|SCPI|Denormandie|Malraux|Jeanbrun|Besson|Scellier|Robien|Méhaignerie|Mehaignerie|Périssol|Perissol|Duflot|Borloo|Monument Historique|D[eé]ficit Foncier";

export function mapStelliumImmoSchemeLabel(label: string): BienImmobilier["type"] {
  const lower = label.toLowerCase();
  if (lower.includes("résidence principale") || lower.includes("residence principale")) {
    return "RESIDENCE_PRINCIPALE";
  }
  if (lower.includes("résidence secondaire") || lower.includes("residence secondaire")) {
    return "RESIDENCE_SECONDAIRE";
  }
  if (lower.includes("scpi")) return "SCPI";
  const mapped = mapDispositifFiscalToTypeProduit(label);
  if (mapped && mapped !== "AUTRE") return mapped as BienImmobilier["type"];
  if (lower.includes("classique") || lower.includes("locatif") || lower.includes("rapport")) {
    return "LOCATIF";
  }
  return "IMMOBILIER";
}

export function isStelliumImmoActifCategory(category: string): boolean {
  const lower = category.toLowerCase();
  if (lower.includes("livret")) return false;
  if (lower.includes("résidence") || lower.includes("residence")) return true;
  if (lower.includes("classique") || lower.includes("locatif")) return true;
  const mapped = mapDispositifFiscalToTypeProduit(category);
  return mapped !== null && mapped !== "AUTRE";
}

export function isStelliumLocatifAggregateType(type: string): boolean {
  if (type === "RESIDENCE_PRINCIPALE" || type === "RESIDENCE_SECONDAIRE") return false;
  return isImmobilierFinancingType(type);
}
