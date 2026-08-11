/**
 * Couleurs espace client — alignées sur le CRM.
 *
 * Réf. `getTypeProduitBgColor` (badges patrimoine) et
 * `DASHBOARD_PRODUCT_FAMILY_META` (familles dashboard).
 */
import { IMMOBILIER_TYPES } from "@/lib/investissements/investissement-display";
import { isMonConseilOrigine } from "@/lib/investissements/investissement-origine";
import { EPARGNE_BANCAIRE_TYPES } from "./epargne-bancaire-types";
import type { PatrimoineCategorie } from "./categories";
import type { PatrimoineTimelineKind } from "./timeline";

/** Vert immobilier — `getTypeProduitBgColor` (LMNP, PINEL, …). */
export const CRM_IMMOBILIER_COLOR = "#85ad39";

/** Rose placements / AV — `getTypeProduitBgColor` (hors immo). */
export const CRM_PLACEMENT_COLOR = "#dc216e";

/** Bleu ardoise SCPI — harmonise vert immo + rose placements. */
export const CRM_SCPI_COLOR = "#7B9FD4";

/** Gris patrimoine à côté — `getTypeProduitBgColor` + `EXISTANT_CLIENT`. */
export const CRM_A_COTE_COLOR = "#9ca3af";

const SCPI_TYPES = new Set(["SCPI", "SCPI_DEMEMBREMENT", "SCPI_FISCALE"]);
const IMMOBILIER_SET = new Set<string>(IMMOBILIER_TYPES);

/** Gris ardoise — épargne bancaire / court terme. */
export const CRM_EPARGNE_BANCAIRE_COLOR = "#737373";

export const PATRIMOINE_CATEGORIE_COLORS: Record<PatrimoineCategorie, string> = {
  Immobilier: CRM_IMMOBILIER_COLOR,
  SCPI: CRM_SCPI_COLOR,
  "Épargne bancaire": CRM_EPARGNE_BANCAIRE_COLOR,
  "Placements financiers": CRM_PLACEMENT_COLOR,
  Prévoyance: CRM_PLACEMENT_COLOR,
  Autre: CRM_A_COTE_COLOR,
};

/** Horizons — teintes distinctes (lisibles sur fond sombre du portail). */
export const HORIZON_CHART_COLORS: Record<string, string> = {
  "Court terme": "#6B9EC4",
  "Moyen terme": "#C4A06B",
  "Long terme": "#9A8FCC",
  "Résidence principale": "#C17B5A",
};

/** Décomposition par source (hero) — teinte dédiée, distincte du rose placements. */
export const CRM_CONSEIL_SOURCE_COLOR = "#5B9EA6";

export const PATRIMOINE_SOURCE_COLORS: Record<string, string> = {
  MON_CONSEIL: CRM_CONSEIL_SOURCE_COLOR,
  EXISTANT_CLIENT: CRM_A_COTE_COLOR,
  DECLARE_CLIENT: CRM_A_COTE_COLOR,
};

export const PATRIMOINE_CHART_SEQUENCE = [
  CRM_IMMOBILIER_COLOR,
  CRM_SCPI_COLOR,
  CRM_PLACEMENT_COLOR,
  CRM_EPARGNE_BANCAIRE_COLOR,
  CRM_PLACEMENT_COLOR,
  CRM_A_COTE_COLOR,
] as const;

/** Couleur de repli pour alertes / tâches (sans placement lié). */
const TIMELINE_KIND_FALLBACK_COLOR: Record<PatrimoineTimelineKind, string> = {
  fin_demembrement: CRM_A_COTE_COLOR,
  fin_pret: CRM_A_COTE_COLOR,
  prochain_arbitrage: CRM_A_COTE_COLOR,
  cloture: CRM_A_COTE_COLOR,
  alerte: CRM_A_COTE_COLOR,
  tache: CRM_A_COTE_COLOR,
  conseiller: CRM_A_COTE_COLOR,
};

/** Couleur timeline — même logique que les pastilles de l'inventaire. */
export function getPatrimoineTimelineEventColor(event: {
  kind: PatrimoineTimelineKind;
  type_produit?: string;
  origine?: string;
}): string {
  if (event.type_produit) {
    return getClientPreviewInvestissementColor(event.type_produit, event.origine);
  }
  return TIMELINE_KIND_FALLBACK_COLOR[event.kind];
}

/** Couleur d'un placement dans l'inventaire client. */
export function getClientPreviewInvestissementColor(
  typeProduit: string | undefined,
  origine: string | undefined
): string {
  if (!isMonConseilOrigine(origine)) {
    return CRM_A_COTE_COLOR;
  }
  const type = typeProduit ?? "";
  if (IMMOBILIER_SET.has(type)) return CRM_IMMOBILIER_COLOR;
  if (SCPI_TYPES.has(type)) return CRM_SCPI_COLOR;
  if (EPARGNE_BANCAIRE_TYPES.has(type)) return CRM_EPARGNE_BANCAIRE_COLOR;
  return CRM_PLACEMENT_COLOR;
}

export const NAVY = CRM_PLACEMENT_COLOR;
export const EARTH = CRM_IMMOBILIER_COLOR;
export const SAGE = CRM_SCPI_COLOR;
export const STONE = CRM_A_COTE_COLOR;
export const BRONZE = CRM_SCPI_COLOR;
