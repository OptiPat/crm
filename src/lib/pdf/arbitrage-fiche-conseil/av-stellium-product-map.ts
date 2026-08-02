import {
  STELLIUM_BOX_PLACEMENT_PRODUCTS,
  stelliumBoxPlacementProductsMatch,
} from "@/lib/placement/stellium-box-placement-products";

/** Libellés catalogue Stellium Box — assurance-vie (arbitrage). */
export const AV_STELLIUM_PRODUCT_LABELS = [
  "Cristalliance Avenir",
  "Cristalliance Evoluvie",
  "Cristalliance Opportunites",
  "Cristalliance Vie First",
  "Fipavie Ingénierie",
] as const;

export type AvStelliumProductLabel = (typeof AV_STELLIUM_PRODUCT_LABELS)[number];

type AvCrmProductRule = {
  stellium: AvStelliumProductLabel;
  aliases: readonly string[];
  /** Si présent dans le haystack, cette règle ne s'applique pas. */
  excludeIfIncludes?: readonly string[];
};

/** Ordre important : règles les plus spécifiques en premier. */
export const AV_CRM_TO_STELLIUM_PRODUCT_RULES: readonly AvCrmProductRule[] = [
  {
    stellium: "Fipavie Ingénierie",
    aliases: ["oddo ingenierie", "fipavie ingenierie"],
  },
  {
    stellium: "Cristalliance Vie First",
    aliases: [
      "cristalliance vie first",
      "apicil vie first",
      "apicil first",
      "vie first",
    ],
  },
  {
    stellium: "Cristalliance Opportunites",
    aliases: ["cristalliance opportunites", "cristalliance opportunités", "oddo"],
    excludeIfIncludes: ["ingenierie", "ingénierie"],
  },
  {
    stellium: "Cristalliance Evoluvie",
    aliases: ["cristalliance evoluvie", "apicil"],
    excludeIfIncludes: ["vie first", "apicil first", "apicil vie first"],
  },
  {
    stellium: "Cristalliance Avenir",
    aliases: ["cristalliance avenir", "suravenir", "vie plus"],
  },
];

function normalizeHaystack(...parts: Array<string | null | undefined>): string {
  return parts
    .filter(Boolean)
    .join(" ")
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9+]+/g, " ")
    .trim();
}

function haystackIncludes(haystack: string, token: string): boolean {
  const normalized = normalizeHaystack(token);
  if (!normalized) return false;
  return haystack.includes(normalized);
}

function ruleMatches(haystack: string, rule: AvCrmProductRule): boolean {
  if (rule.excludeIfIncludes?.some((ex) => haystackIncludes(haystack, ex))) {
    return false;
  }
  return rule.aliases.some((alias) => haystackIncludes(haystack, alias));
}

/** Nom produit / partenaire CRM → libellé catalogue Stellium AV. */
export function resolveStelliumAvProductLabelFromCrm(input: {
  nomProduit?: string | null;
  partenaireNom?: string | null;
}): AvStelliumProductLabel | null {
  const nomProduit = input.nomProduit?.trim() ?? "";
  if (nomProduit) {
    const direct = STELLIUM_BOX_PLACEMENT_PRODUCTS.find((item) =>
      stelliumBoxPlacementProductsMatch(nomProduit, item)
    );
    if (
      direct &&
      AV_STELLIUM_PRODUCT_LABELS.includes(direct as AvStelliumProductLabel)
    ) {
      return direct as AvStelliumProductLabel;
    }
  }

  const haystack = normalizeHaystack(input.nomProduit, input.partenaireNom);
  if (!haystack) return null;

  for (const rule of AV_CRM_TO_STELLIUM_PRODUCT_RULES) {
    if (ruleMatches(haystack, rule)) return rule.stellium;
  }
  return null;
}
