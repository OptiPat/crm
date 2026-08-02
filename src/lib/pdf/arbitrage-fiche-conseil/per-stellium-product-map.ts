import {
  STELLIUM_BOX_PLACEMENT_PRODUCTS,
  stelliumBoxPlacementProductsMatch,
} from "@/lib/placement/stellium-box-placement-products";

/** Libellés catalogue Stellium Box — PER (arbitrage / modification VP). */
export const PER_STELLIUM_PRODUCT_LABELS = [
  "Cristalliance EvoluPER",
  "Cristalliance PER Opportunités",
  "PER ERES BY Spirica",
  "PER ERES BY Swisslife",
  "Pertinence Retraite",
  "Plan Epargne retraite entreprise collectif (PERECOI)",
  "Plan Epargne Inter Entreprise (PEI)",
] as const;

export type PerStelliumProductLabel = (typeof PER_STELLIUM_PRODUCT_LABELS)[number];

type PerCrmProductRule = {
  stellium: PerStelliumProductLabel;
  aliases: readonly string[];
  excludeIfIncludes?: readonly string[];
};

/** Ordre important : règles les plus spécifiques en premier. */
export const PER_CRM_TO_STELLIUM_PRODUCT_RULES: readonly PerCrmProductRule[] = [
  {
    stellium: "Plan Epargne retraite entreprise collectif (PERECOI)",
    aliases: ["perecoi", "per collectif", "per entreprise collectif", "retraite entreprise collectif"],
  },
  {
    stellium: "Plan Epargne Inter Entreprise (PEI)",
    aliases: ["pei", "plan epargne inter entreprise", "inter entreprise"],
    excludeIfIncludes: ["perecoi", "collectif"],
  },
  {
    stellium: "PER ERES BY Spirica",
    aliases: ["eres spirica", "per spirica", "spirica"],
    excludeIfIncludes: ["swisslife", "swiss life"],
  },
  {
    stellium: "PER ERES BY Swisslife",
    aliases: ["eres swisslife", "per swisslife", "swisslife", "swiss life"],
  },
  {
    stellium: "Cristalliance PER Opportunités",
    aliases: [
      "cristalliance per opportunites",
      "cristalliance per opportunités",
      "per opportunites",
      "per opportunités",
      "oddo per",
      "oddo",
    ],
    excludeIfIncludes: ["evoluper", "evolu per", "ingenierie", "ingénierie"],
  },
  {
    stellium: "Cristalliance EvoluPER",
    aliases: ["cristalliance evoluper", "evoluper", "evolu per", "apicil per", "apicil"],
    excludeIfIncludes: ["opportunites", "opportunités"],
  },
  {
    stellium: "Pertinence Retraite",
    aliases: ["pertinence retraite", "pertinence"],
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

function ruleMatches(haystack: string, rule: PerCrmProductRule): boolean {
  if (rule.excludeIfIncludes?.some((ex) => haystackIncludes(haystack, ex))) {
    return false;
  }
  return rule.aliases.some((alias) => haystackIncludes(haystack, alias));
}

/** Nom produit / partenaire CRM → libellé catalogue Stellium PER. */
export function resolveStelliumPerProductLabelFromCrm(input: {
  nomProduit?: string | null;
  partenaireNom?: string | null;
}): PerStelliumProductLabel | null {
  const nomProduit = input.nomProduit?.trim() ?? "";
  if (nomProduit) {
    const direct = STELLIUM_BOX_PLACEMENT_PRODUCTS.find((item) =>
      stelliumBoxPlacementProductsMatch(nomProduit, item)
    );
    if (
      direct &&
      PER_STELLIUM_PRODUCT_LABELS.includes(direct as PerStelliumProductLabel)
    ) {
      return direct as PerStelliumProductLabel;
    }
  }

  const haystack = normalizeHaystack(input.nomProduit, input.partenaireNom);
  if (!haystack) return null;

  for (const rule of PER_CRM_TO_STELLIUM_PRODUCT_RULES) {
    if (ruleMatches(haystack, rule)) return rule.stellium;
  }
  return null;
}
