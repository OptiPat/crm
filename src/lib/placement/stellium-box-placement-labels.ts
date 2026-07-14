import type { PlacementOperationType } from "@/lib/api/tauri-box-placement";

/** Libellé exact tel qu'affiché dans les mails Stellium Box Placement. */
export type StelliumBoxPlacementLabel = string;

export interface StelliumBoxPlacementLabelGroup {
  id: string;
  label: string;
  items: readonly StelliumBoxPlacementLabel[];
}

/**
 * Catalogue Suivi / gestion (hors versement complémentaire affaire, hors SCPI — à compléter).
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
  ] as const;

export const STELLIUM_BOX_PLACEMENT_LABELS: readonly StelliumBoxPlacementLabel[] =
  STELLIUM_BOX_PLACEMENT_LABEL_GROUPS.flatMap((g) => g.items);

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
