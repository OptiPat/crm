import type { PlacementOperation, PlacementOperationType } from "@/lib/api/tauri-box-placement";
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

/** Affaire commerciale classique : seule la souscription partenaire (pas d'actes de gestion). */
export const AFFAIRE_STELLIUM_SOUSCRIPTION_LABEL = "Souscription";

/** Souscription SCPI — distincte du contrat assureur (même libellé Stellium « Souscription » + produit SCPI). */
export const SCPI_STELLIUM_SOUSCRIPTION_LABEL = "Souscription de parts";

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
        SCPI_STELLIUM_SOUSCRIPTION_LABEL,
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

const AFFAIRE_STELLIUM_ACT_LABEL_GROUP: StelliumBoxPlacementLabelGroup = {
  id: "souscription-placement",
  label: "Souscription — placement",
  items: [AFFAIRE_STELLIUM_SOUSCRIPTION_LABEL],
};

export const PLACEMENT_TEMPLATE_LABEL_SCOPE_SEP = "::";

export const SCPI_STELLIUM_LABEL_GROUP_ID = "scpi";

export const SOUSCRIPTION_PLACEMENT_LABEL_GROUP_ID = "souscription-placement";

export function normalizeStelliumBoxPlacementLabel(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/é/g, "e")
    .replace(/è/g, "e")
    .replace(/ê/g, "e");
}

/** Clé stockée modèle email : groupe + libellé (évite les cases liées placement / SCPI). */
export function formatPlacementTemplateScopedLabel(
  groupId: string,
  label: string
): string {
  return `${groupId}${PLACEMENT_TEMPLATE_LABEL_SCOPE_SEP}${label}`;
}

export function parsePlacementTemplateScopedLabel(scopedLabel: string): {
  groupId: string | null;
  label: string;
} {
  const sep = PLACEMENT_TEMPLATE_LABEL_SCOPE_SEP;
  const idx = scopedLabel.indexOf(sep);
  if (idx <= 0) return { groupId: null, label: scopedLabel };
  return {
    groupId: scopedLabel.slice(0, idx),
    label: scopedLabel.slice(idx + sep.length),
  };
}

export function placementTemplateTriggerDisplayLabel(triggerLabel: string): string {
  return parsePlacementTemplateScopedLabel(triggerLabel).label;
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

function isGenericStelliumSouscriptionLabel(label: string): boolean {
  const normalized = normalizeStelliumBoxPlacementLabel(label);
  return (
    normalized === normalizeStelliumBoxPlacementLabel(AFFAIRE_STELLIUM_SOUSCRIPTION_LABEL) ||
    normalized === normalizeStelliumBoxPlacementLabel(SCPI_STELLIUM_SOUSCRIPTION_LABEL) ||
    normalized.includes("souscription")
  );
}

/** Correspondance trigger modèle email ↔ opération (souscription scindée placement / SCPI). */
export function placementStelliumLabelMatchesEmailTrigger(
  operation: Pick<PlacementOperation, "stellium_label" | "product_label">,
  triggerLabel: string
): boolean {
  const declared = operation.stellium_label?.trim() ?? "";
  const productFamily = stelliumProductFamilyIdForProduct(operation.product_label?.trim() ?? "");

  if (stelliumBoxPlacementLabelsMatch(triggerLabel, AFFAIRE_STELLIUM_SOUSCRIPTION_LABEL)) {
    if (declared && !isGenericStelliumSouscriptionLabel(declared)) return false;
    return productFamily !== "scpi";
  }

  if (stelliumBoxPlacementLabelsMatch(triggerLabel, SCPI_STELLIUM_SOUSCRIPTION_LABEL)) {
    if (declared && !isGenericStelliumSouscriptionLabel(declared)) return false;
    return productFamily === "scpi";
  }

  if (!declared) return false;
  return stelliumBoxPlacementLabelsMatch(triggerLabel, declared);
}

/** Groupe UI par défaut pour un libellé non scopé (préfère placement hors SCPI). */
export function resolveLegacyUnscopedTemplateLabelGroupId(label: string): string | null {
  const matchingGroups = stelliumBoxPlacementTemplateLabelGroups().filter((group) =>
    group.items.some((item) => stelliumBoxPlacementLabelsMatch(item, label))
  );
  if (matchingGroups.length === 0) return null;
  if (matchingGroups.length === 1) return matchingGroups[0]!.id;
  const placementGroup = matchingGroups.find(
    (group) => group.id !== SCPI_STELLIUM_LABEL_GROUP_ID
  );
  return placementGroup?.id ?? matchingGroups[0]!.id;
}

/** Trigger modèle email (scopé ou legacy) ↔ opération Box. */
export function placementTemplateTriggerMatchesOperation(
  operation: Pick<PlacementOperation, "stellium_label" | "product_label">,
  triggerLabel: string
): boolean {
  const { groupId, label } = parsePlacementTemplateScopedLabel(triggerLabel);
  if (!placementStelliumLabelMatchesEmailTrigger(operation, label)) return false;
  if (!groupId) return true;
  const family = stelliumProductFamilyIdForProduct(operation.product_label?.trim() ?? "");
  if (groupId === SCPI_STELLIUM_LABEL_GROUP_ID) return family === "scpi";
  return family !== "scpi";
}

export function placementTemplateScopedTriggersOverlap(a: string, b: string): boolean {
  const pa = parsePlacementTemplateScopedLabel(a);
  const pb = parsePlacementTemplateScopedLabel(b);
  if (!stelliumBoxPlacementLabelsMatch(pa.label, pb.label)) return false;
  if (pa.groupId && pb.groupId) return pa.groupId === pb.groupId;

  const scoped = pa.groupId ? pa : pb.groupId ? pb : null;
  const legacy = pa.groupId ? pb : pb.groupId ? pa : null;
  if (!scoped || !legacy || legacy.groupId) return true;

  if (resolveLegacyUnscopedTemplateLabelGroupId(legacy.label) === scoped.groupId) {
    return true;
  }
  // Legacy non scopé couvre aussi les produits SCPI pour les libellés du groupe SCPI.
  return stelliumBoxPlacementTemplateLabelGroups().some(
    (group) =>
      group.id === scoped.groupId &&
      group.items.some((item) => stelliumBoxPlacementLabelsMatch(item, legacy.label))
  );
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

/** Catalogue complet pour modèles email Box Placement (tous actes Suivi + affaire). */
export function stelliumBoxPlacementTemplateLabelGroups(): readonly StelliumBoxPlacementLabelGroup[] {
  const versementsGroup = STELLIUM_BOX_PLACEMENT_LABEL_GROUPS.find(
    (group) => group.id === VERSEMENTS_PROGRAMMES_GROUP_ID
  );
  const versementsItems = versementsGroup
    ? [
        VERSEMENT_COMPLEMENTAIRE_ACT_LABEL,
        ...versementsGroup.items.filter((item) => item !== VERSEMENT_COMPLEMENTAIRE_ACT_LABEL),
      ]
    : [VERSEMENT_COMPLEMENTAIRE_ACT_LABEL];

  const placementGroups = STELLIUM_BOX_PLACEMENT_LABEL_GROUPS.filter(
    (group) => group.id !== SCPI_STELLIUM_LABEL_GROUP_ID
  ).map((group) =>
    group.id === VERSEMENTS_PROGRAMMES_GROUP_ID
      ? { ...group, label: "Versements", items: versementsItems }
      : group
  );
  const scpiGroup = STELLIUM_BOX_PLACEMENT_LABEL_GROUPS.find(
    (group) => group.id === SCPI_STELLIUM_LABEL_GROUP_ID
  );

  return [
    ...placementGroups,
    AFFAIRE_STELLIUM_ACT_LABEL_GROUP,
    ...(scpiGroup ? [scpiGroup] : []),
  ];
}

export const STELLIUM_BOX_PLACEMENT_TEMPLATE_LABELS: readonly StelliumBoxPlacementLabel[] =
  stelliumBoxPlacementTemplateLabelGroups().flatMap((group) => group.items);

export function isKnownStelliumBoxPlacementTemplateLabel(label: string): boolean {
  const normalized = normalizeStelliumBoxPlacementLabel(label);
  return STELLIUM_BOX_PLACEMENT_TEMPLATE_LABELS.some(
    (item) => normalizeStelliumBoxPlacementLabel(item) === normalized
  );
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
