/** Produit / contrat tel qu'affiché dans les mails Stellium (partie centrale de la ligne). */
export type StelliumBoxPlacementProduct = string;

export interface StelliumBoxPlacementProductGroup {
  id: string;
  label: string;
  items: readonly StelliumBoxPlacementProduct[];
}

/**
 * Catalogue produits Box Placement (noms canoniques, sans ALPSI / CIF).
 * Les variantes SCPI avec suffixe ALPSI ou CIF dans le mail sont ignorées au matching.
 * Compléter quand d'autres SCPI sont fournies.
 */
export const STELLIUM_BOX_PLACEMENT_PRODUCT_GROUPS: readonly StelliumBoxPlacementProductGroup[] =
  [
    {
      id: "assurance-vie",
      label: "Assurance-vie",
      items: [
        "Cristalliance Avenir",
        "Cristalliance Evoluvie",
        "Cristalliance Opportunites",
        "Cristalliance Vie First",
        "Fipavie Ingénierie",
      ],
    },
    {
      id: "per",
      label: "PER",
      items: [
        "Cristalliance EvoluPER",
        "Cristalliance PER Opportunités",
        "PER ERES BY Spirica",
        "PER ERES BY Swisslife",
        "Pertinence Retraite",
        "Plan Epargne retraite entreprise collectif (PERECOI)",
        "Plan Epargne Inter Entreprise (PEI)",
      ],
    },
    {
      id: "capitalisation",
      label: "Contrat de capitalisation",
      items: [
        "Cristalliance Avenir Capi PM",
        "Cristalliance Capi Patrim",
        "Cristalliance Opportunités Capi PM",
        "Cristalliance Avenir Capi",
        "Cristalliance Opportunités Capi",
      ],
    },
    {
      id: "scpi",
      label: "SCPI",
      items: [
        "Activimmo",
        "Alta Convictions",
        "Atream Hotels",
        "Comète",
        "Corum Eurion",
        "Corum Origin",
        "Epargne Pierre",
        "Epargne Pierre Europe",
        "Eurovalys",
        "Immorente",
        "LF Avenir Santé",
        "NCap Régions",
        "Osmo Energie",
        "Perial Opportunités Europe",
        "Sofidy Europe Invest",
        "Transitions Europe",
      ],
    },
  ] as const;

export const STELLIUM_BOX_PLACEMENT_PRODUCTS: readonly StelliumBoxPlacementProduct[] =
  STELLIUM_BOX_PLACEMENT_PRODUCT_GROUPS.flatMap((g) => g.items);

const ALPSI_CIF_SUFFIX_RE = /\s*(?:\((?:alpsi|cif)\)|(?:alpsi|cif))\s*$/i;

export function normalizeStelliumBoxPlacementProduct(value: string): string {
  let normalized = value
    .trim()
    .toLowerCase()
    .replace(/é/g, "e")
    .replace(/è/g, "e")
    .replace(/ê/g, "e")
    .replace(/'/g, "'");
  while (ALPSI_CIF_SUFFIX_RE.test(normalized)) {
    normalized = normalized.replace(ALPSI_CIF_SUFFIX_RE, "").trim();
  }
  return normalized.replace(/\s+/g, " ").trim();
}

export function stelliumBoxPlacementProductsMatch(
  declared: string,
  fromEmail: string
): boolean {
  return (
    normalizeStelliumBoxPlacementProduct(declared) ===
    normalizeStelliumBoxPlacementProduct(fromEmail)
  );
}

/** Libellé produit affiché au client (sans ALPSI / CIF). */
export function formatStelliumProductForDisplay(productLabel: string): string {
  const trimmed = productLabel.trim();
  if (!trimmed) return "";
  const normalizedInput = normalizeStelliumBoxPlacementProduct(trimmed);
  const catalogHit = STELLIUM_BOX_PLACEMENT_PRODUCTS.find(
    (item) => normalizeStelliumBoxPlacementProduct(item) === normalizedInput
  );
  return catalogHit ?? trimmed.replace(ALPSI_CIF_SUFFIX_RE, "").trim();
}

export function isKnownStelliumBoxPlacementProduct(product: string): boolean {
  const normalized = normalizeStelliumBoxPlacementProduct(product);
  return STELLIUM_BOX_PLACEMENT_PRODUCTS.some(
    (item) => normalizeStelliumBoxPlacementProduct(item) === normalized
  );
}
