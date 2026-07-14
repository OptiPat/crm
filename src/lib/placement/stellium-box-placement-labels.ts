import type { PlacementOperationType } from "@/lib/api/tauri-box-placement";
import { stelliumProductFamilyIdForProduct } from "@/lib/placement/stellium-box-placement-products";
import {
  isVersementComplementaireActLabel,
  VERSEMENT_COMPLEMENTAIRE_ACT_LABEL,
} from "@/lib/pipe/pipe-suivi";

/** Libellé exact tel qu'affiché dans les mails Stellium Box Placement. */
export type StelliumBoxPlacementLabel = string;

export interface StelliumBoxPlacementLabelGroup {
  id: string;
  label: string;
  items: readonly StelliumBoxPlacementLabel[];
}

/**
 * Catalogue Suivi / gestion (hors versement complémentaire affaire).
 * Les libellés doivent correspondre exactement à la 1ʳᵉ partie de la ligne mail Stellium.
 */
export const STELLIUM_BOX_PLACEMENT_LABEL_GROUPS: readonly StelliumBoxPlacementLabelGroup[] =
  [
    {
      id: "arbitrages",
      label: "Arbitrages",
      items: [
        "Arbitrage libre",
        "Arbitrages programmés : Arrêt",
        "Arbitrages programmés : Mise en place",
        "Arbitrages programmés : Modification",
      ],
    },
    {
      id: "rachats",
      label: "Rachats",
      items: [
        "Rachat partiel",
        "Rachat total/clôture",
        "Rachats programmés : Arrêt",
        "Rachats programmés : Mise en place",
        "Rachats programmés : Modification",
      ],
    },
    {
      id: "versements-programmes",
      label: "Versements programmés",
      items: [
        "Versements programmés : Arrêt",
        "Versements programmés : Mise en place",
        "Versements programmés : Modification",
      ],
    },
    {
      id: "avances",
      label: "Avances",
      items: ["Avance : Mise en place", "Avance : Remboursement"],
    },
    {
      id: "modifications-admin",
      label: "Modifications administratives",
      items: [
        "Modification administrative : adresse",
        "Modification administrative : nom",
        "Modification administrative : RIB",
        "Modification clause bénéficiaire",
        "Changement mode de gestion",
      ],
    },
    {
      id: "nantissement-garantie",
      label: "Nantissement & garantie",
      items: [
        "Nantissement : Arrêt",
        "Nantissement : Mise en place",
        "Garantie décès : Arrêt",
      ],
    },
    {
      id: "denouements",
      label: "Dénouements & sortie",
      items: ["Dénouement partiel", "Dénouement total", "Renonciation", "Décès"],
    },
    {
      id: "autres",
      label: "Autres actes",
      items: ["Ordre de remplacement", "Transfert entrant"],
    },
    {
      id: "scpi",
      label: "SCPI",
      items: [
        "Cession de parts",
        "Décès",
        "Donation",
        "Modification administrative : adresse / nom / RIB",
        "Nantissement : Arrêt",
        "Nantissement : Mise en place",
        "Réinvestissements des dividendes : Arrêt",
        "Réinvestissements des dividendes : Mise en place",
        "Réinvestissements des dividendes : Modification",
        "Retrait de parts",
        "Versements programmés : Arrêt",
        "Versements programmés : Mise en place",
        "Versements programmés : Modification",
      ],
    },
  ] as const;

export const STELLIUM_BOX_PLACEMENT_LABELS: readonly StelliumBoxPlacementLabel[] =
  STELLIUM_BOX_PLACEMENT_LABEL_GROUPS.flatMap((g) => g.items);

/** Affaire commerciale classique : seule la souscription partenaire (pas d'actes de gestion). */
export const AFFAIRE_STELLIUM_SOUSCRIPTION_LABEL = "Souscription";

const AFFAIRE_STELLIUM_ACT_LABEL_GROUP: StelliumBoxPlacementLabelGroup = {
  id: "souscription",
  label: "Souscription",
  items: [AFFAIRE_STELLIUM_SOUSCRIPTION_LABEL],
};

export function normalizeStelliumBoxPlacementLabel(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/é/g, "e")
    .replace(/è/g, "e")
    .replace(/ê/g, "e");
}

export function stelliumBoxPlacementLabelsMatch(
  declared: string,
  fromEmail: string
): boolean {
  return (
    normalizeStelliumBoxPlacementLabel(declared) ===
    normalizeStelliumBoxPlacementLabel(fromEmail)
  );
}

/** Type grossier pour modèles email client (trigger placement_conforme). */
export function placementOperationTypeFromStelliumLabel(
  label: string
): PlacementOperationType {
  const lower = normalizeStelliumBoxPlacementLabel(label);
  if (lower.includes("arbitrage")) return "ARBITRAGE";
  if (lower.includes("versement")) return "VERSEMENT";
  if (lower.includes("reinvestissement")) return "REINVESTISSEMENT";
  if (lower.includes("souscription")) return "SOUSCRIPTION";
  return "AUTRE";
}

export function isKnownStelliumBoxPlacementLabel(label: string): boolean {
  const normalized = normalizeStelliumBoxPlacementLabel(label);
  return STELLIUM_BOX_PLACEMENT_LABELS.some(
    (item) => normalizeStelliumBoxPlacementLabel(item) === normalized
  );
}

const VERSEMENTS_PROGRAMMES_GROUP_ID = "versements-programmes";

/** Versement complémentaire : AV / PER / capi uniquement (pas de SCPI). */
export function isSuiviVersementComplementaireAllowedForProduct(product: string): boolean {
  return stelliumProductFamilyIdForProduct(product) !== "scpi";
}

function injectSuiviVersementComplementaire(
  groups: readonly StelliumBoxPlacementLabelGroup[],
  product: string
): readonly StelliumBoxPlacementLabelGroup[] {
  if (!isSuiviVersementComplementaireAllowedForProduct(product)) {
    return groups;
  }
  const versementsGroup = groups.find((group) => group.id === VERSEMENTS_PROGRAMMES_GROUP_ID);
  if (versementsGroup) {
    return groups.map((group) =>
      group.id === VERSEMENTS_PROGRAMMES_GROUP_ID
        ? {
            ...group,
            label: "Versements",
            items: [
              VERSEMENT_COMPLEMENTAIRE_ACT_LABEL,
              ...group.items.filter((item) => item !== VERSEMENT_COMPLEMENTAIRE_ACT_LABEL),
            ],
          }
        : group
    );
  }
  if (groups.length === 0) {
    return [
      {
        id: VERSEMENTS_PROGRAMMES_GROUP_ID,
        label: "Versements",
        items: [VERSEMENT_COMPLEMENTAIRE_ACT_LABEL],
      },
    ];
  }
  return [
    {
      id: VERSEMENTS_PROGRAMMES_GROUP_ID,
      label: "Versements",
      items: [VERSEMENT_COMPLEMENTAIRE_ACT_LABEL],
    },
    ...groups,
  ];
}

/** Actes proposés selon la famille du produit (SCPI vs assurance-vie / PER / capi). */
export function stelliumLabelGroupsForProduct(
  product: string,
  options?: { suivi?: boolean }
): readonly StelliumBoxPlacementLabelGroup[] {
  const family = stelliumProductFamilyIdForProduct(product);
  const base =
    !family
      ? []
      : family === "scpi"
        ? STELLIUM_BOX_PLACEMENT_LABEL_GROUPS.filter((group) => group.id === "scpi")
        : STELLIUM_BOX_PLACEMENT_LABEL_GROUPS.filter((group) => group.id !== "scpi");
  if (!options?.suivi) return base;
  return injectSuiviVersementComplementaire(base, product);
}

export function stelliumSuiviActLabelGroups(
  product: string
): readonly StelliumBoxPlacementLabelGroup[] {
  return stelliumLabelGroupsForProduct(product, { suivi: true });
}

/** Affaire commerciale (hors Suivi gestion) : souscription uniquement. */
export function stelliumAffaireActLabelGroups(): readonly StelliumBoxPlacementLabelGroup[] {
  return [AFFAIRE_STELLIUM_ACT_LABEL_GROUP];
}

export function isStelliumLabelAllowedForAffaire(label: string): boolean {
  return (
    normalizeStelliumBoxPlacementLabel(label) ===
    normalizeStelliumBoxPlacementLabel(AFFAIRE_STELLIUM_SOUSCRIPTION_LABEL)
  );
}

export function isStelliumLabelAllowedForProduct(
  label: string,
  product: string,
  options?: { suivi?: boolean; affaire?: boolean }
): boolean {
  if (options?.affaire) return isStelliumLabelAllowedForAffaire(label);
  if (options?.suivi && isVersementComplementaireActLabel(label)) {
    return isSuiviVersementComplementaireAllowedForProduct(product);
  }
  const normalized = normalizeStelliumBoxPlacementLabel(label);
  return stelliumLabelGroupsForProduct(product, options).some((group) =>
    group.items.some((item) => normalizeStelliumBoxPlacementLabel(item) === normalized)
  );
}
