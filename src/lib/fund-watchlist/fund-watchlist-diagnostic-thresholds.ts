import fundCategoriesTable from "@/lib/fund-watchlist/fund-categories.json";

/** Classe de volatilité pour adapter les seuils Δ 1 an. */
export type FundDiagnosticVolatilityClass = "actions" | "diversified" | "rates";

export type FundDiagnosticDeltaThresholds = {
  surveillance: number;
  arbitrage: number;
};

export const FUND_DIAGNOSTIC_THRESHOLDS_BY_CLASS: Record<
  FundDiagnosticVolatilityClass,
  FundDiagnosticDeltaThresholds
> = {
  actions: { surveillance: -2, arbitrage: -4 },
  diversified: { surveillance: -1.5, arbitrage: -3 },
  rates: { surveillance: -0.8, arbitrage: -1.5 },
};

export type FundDiagnosticAbsoluteThresholds = {
  /** Recul sur un horizon au-delà duquel il compte comme faible. */
  weakHorizon: number;
  /** Recul à 1 mois signant une correction alors que l'année reste solide. */
  correction: number;
  /** Performance annuelle considérée comme solide malgré ce recul. */
  solidYear: number;
};

/**
 * Seuils de **performance absolue**, indexés sur le même profil que les seuils d'écart : −3 %
 * en un mois est du bruit pour un fonds actions et un accident pour un fonds à capital garanti.
 * Un seuil unique donnait donc deux sens opposés au même chiffre.
 */
export const FUND_DIAGNOSTIC_ABSOLUTE_THRESHOLDS_BY_CLASS: Record<
  FundDiagnosticVolatilityClass,
  FundDiagnosticAbsoluteThresholds
> = {
  actions: { weakHorizon: -5, correction: -8, solidYear: 10 },
  diversified: { weakHorizon: -3, correction: -5, solidYear: 6 },
  rates: { weakHorizon: -1.5, correction: -2.5, solidYear: 3 },
};

/**
 * Le palier vient de la volatilité **mesurée**, pas de la nature du fonds : un fonds cent pour
 * cent actions peut relever du palier modéré. Des noms de classes d'actifs laissaient croire à un
 * classement du fonds lui-même.
 */
export const FUND_DIAGNOSTIC_VOLATILITY_CLASS_LABELS: Record<
  FundDiagnosticVolatilityClass,
  string
> = {
  actions: "volatilité élevée",
  diversified: "volatilité modérée",
  rates: "volatilité faible",
};

export function fundWatchlistMetaCategoryKey(normalized: string): string | null {
  if (!normalized) return null;

  // Table explicite d'abord : elle seule connaît les libellés que les mots-clés classent mal
  // (« Global Diversified Bond » pris pour un diversifié, immobilier zone euro pris pour des
  // actions européennes). Les mots-clés ne servent plus qu'aux libellés inconnus.
  const explicit = FUND_CATEGORY_FAMILY_BY_LABEL.get(normalized);
  if (explicit) return explicit;

  const rules: Array<{ needles: string[]; key: string }> = [
    {
      needles: [
        "actions secteur technolog",
        "secteur technolog",
        "actions technolog",
        "technologie",
      ],
      key: "actions_tech",
    },
    {
      needles: [
        "asie hors japon",
        "asia pacific",
        "asia ex japan",
        "actions asie",
        "actions asiatique",
        "asiatique",
        "asian",
        "asie pacifique",
        "marches emergents asie",
        "marche emergent asie",
        "emergents asie",
        "asia discovery",
        "asia growth",
        "actions japon",
        "japon",
        "japan",
      ],
      key: "actions_asie_pacifique",
    },
    {
      needles: ["actions europe", "europe grandes", "eurozone", "zone euro"],
      key: "actions_europe",
    },
    {
      needles: ["actions amerique", "actions usa", "etats-unis", "north america"],
      key: "actions_us",
    },
    { needles: ["obligations euro", "oblig euro"], key: "oblig_euro" },
    { needles: ["obligations"], key: "oblig" },
    { needles: ["monetaire", "monétaire", "tresorerie"], key: "monetaire" },
    { needles: ["diversifie", "diversifié", "allocation"], key: "diversifie" },
    { needles: ["immobilier", "reits"], key: "immobilier" },
  ];

  for (const rule of rules) {
    if (rule.needles.some((needle) => normalized.includes(needle))) {
      return rule.key;
    }
  }

  if (
    normalized.includes("asie") ||
    normalized.includes("asia") ||
    normalized.includes("japon") ||
    normalized.includes("japan")
  ) {
    return "actions_asie_pacifique";
  }

  return null;
}

const META_TO_VOLATILITY: Record<string, FundDiagnosticVolatilityClass> = {
  actions_tech: "actions",
  actions_asie_pacifique: "actions",
  actions_europe: "actions",
  actions_us: "actions",
  immobilier: "actions",
  diversifie: "diversified",
  oblig_euro: "rates",
  oblig: "rates",
  monetaire: "rates",
};

export function normalizeFundWatchlistCategory(raw: string | null | undefined): string | null {
  if (!raw?.trim()) return null;
  return raw
    .trim()
    .toLowerCase()
    .replace(/’/g, "'")
    .replace(/[éèêë]/g, "e")
    .replace(/[àâ]/g, "a")
    .replace(/[ùû]/g, "u")
    .replace(/[îï]/g, "i")
    .replace(/[ôö]/g, "o")
    .replace(/ç/g, "c");
}

type FundCategoryTable = {
  excluded: string[];
  families: {
    key: string;
    label: string;
    volatility: FundDiagnosticVolatilityClass;
    categories: string[];
  }[];
};

const CATEGORY_TABLE = fundCategoriesTable as FundCategoryTable;

/** Libellé Cristalliance normalisé → clé de famille (cf. `docs/CATEGORIES-VEILLE-FONDS.md`). */
const FUND_CATEGORY_FAMILY_BY_LABEL = new Map<string, string>(
  CATEGORY_TABLE.families.flatMap((family) =>
    family.categories
      .map((categorie) => normalizeFundWatchlistCategory(categorie))
      .filter((normalized): normalized is string => normalized != null)
      .map((normalized) => [normalized, family.key] as const)
  )
);

const FUND_CATEGORY_EXCLUDED = new Set<string>(
  CATEGORY_TABLE.excluded
    .map((categorie) => normalizeFundWatchlistCategory(categorie))
    .filter((normalized): normalized is string => normalized != null)
);

/**
 * Catégories sans diagnostic possible : valorisation trimestrielle et lissée, un écart de
 * performance contre une catégorie n'y a pas de sens. Mieux vaut aucun badge qu'un badge faux.
 */
export function isFundCategoryExcludedFromDiagnostic(
  categorie: string | null | undefined
): boolean {
  const normalized = normalizeFundWatchlistCategory(categorie);
  return normalized != null && FUND_CATEGORY_EXCLUDED.has(normalized);
}

/**
 * Profil de volatilité par famille, lu dans la table et utilisé **uniquement en repli** quand la
 * volatilité 3 ans mesurée manque dans l'import. Remplace l'inférence par mots-clés, qui classait
 * en « actions » tout libellé sans mot reconnu (capital garanti, subordonnées, convertibles).
 */
const FAMILY_TO_VOLATILITY = new Map<string, FundDiagnosticVolatilityClass>(
  CATEGORY_TABLE.families.map((family) => [family.key, family.volatility])
);

/** Pairs diagnostic : méta-catégorie UC si possible, sinon libellé exact. */
export function isSameFundWatchlistPeerCategory(
  a: string | null | undefined,
  b: string | null | undefined
): boolean {
  const na = normalizeFundWatchlistCategory(a);
  const nb = normalizeFundWatchlistCategory(b);
  if (!na || !nb) return false;
  if (na === nb) return true;
  const ma = fundWatchlistMetaCategoryKey(na);
  const mb = fundWatchlistMetaCategoryKey(nb);
  return ma != null && ma === mb;
}

export function resolveFundDiagnosticVolatilityClass(
  categorie: string | null | undefined
): FundDiagnosticVolatilityClass {
  const normalized = normalizeFundWatchlistCategory(categorie);
  if (!normalized) return "actions";

  const meta = fundWatchlistMetaCategoryKey(normalized);
  const fromTable = meta ? FAMILY_TO_VOLATILITY.get(meta) : undefined;
  if (fromTable) return fromTable;
  if (meta && META_TO_VOLATILITY[meta]) {
    return META_TO_VOLATILITY[meta];
  }

  if (
    normalized.includes("oblig") ||
    normalized.includes("monetaire") ||
    normalized.includes("taux") ||
    normalized.includes("prudence")
  ) {
    return "rates";
  }
  if (
    normalized.includes("diversif") ||
    normalized.includes("equilib") ||
    normalized.includes("allocation") ||
    normalized.includes("flexible")
  ) {
    return "diversified";
  }
  if (
    normalized.includes("action") ||
    normalized.includes("immobilier") ||
    normalized.includes("reit")
  ) {
    return "actions";
  }

  return "actions";
}

export function getFundDiagnosticDeltaThresholds(
  categorie: string | null | undefined
): FundDiagnosticDeltaThresholds & { volatilityClass: FundDiagnosticVolatilityClass } {
  const volatilityClass = resolveFundDiagnosticVolatilityClass(categorie);
  return {
    volatilityClass,
    ...FUND_DIAGNOSTIC_THRESHOLDS_BY_CLASS[volatilityClass],
  };
}

/** Coupures de volatilité 3 ans mesurée (points de %) séparant les trois profils. */
export const FUND_DIAGNOSTIC_VOLATILITY_CUTOFFS = {
  /** Sous cette volatilité : profil taux / prudence. */
  diversifiedFloor: 5,
  /** Sous cette volatilité : profil diversifié. */
  actionsFloor: 12,
} as const;

/**
 * Profil de volatilité du fonds à partir de sa volatilité 3 ans **mesurée** (import
 * Cristalliance). Le libellé de catégorie ne sert que de repli : il classait en « actions »
 * tout produit dont le nom ne contient aucun mot reconnu (capital garanti, subordonnées,
 * convertibles), rendant les seuils bien trop larges pour eux.
 */
export function resolveFundDiagnosticVolatilityClassFromMeasure(
  vol3ans: number | null | undefined,
  categorie: string | null | undefined
): FundDiagnosticVolatilityClass {
  // Une volatilité nulle ou négative est un artefact de données, pas un fonds sans risque.
  if (vol3ans != null && Number.isFinite(vol3ans) && vol3ans > 0) {
    if (vol3ans < FUND_DIAGNOSTIC_VOLATILITY_CUTOFFS.diversifiedFloor) return "rates";
    if (vol3ans < FUND_DIAGNOSTIC_VOLATILITY_CUTOFFS.actionsFloor) return "diversified";
    return "actions";
  }
  return resolveFundDiagnosticVolatilityClass(categorie);
}

export function getFundDiagnosticDeltaThresholdsFromMeasure(
  vol3ans: number | null | undefined,
  categorie: string | null | undefined
): FundDiagnosticDeltaThresholds & { volatilityClass: FundDiagnosticVolatilityClass } {
  const volatilityClass = resolveFundDiagnosticVolatilityClassFromMeasure(vol3ans, categorie);
  return {
    volatilityClass,
    ...FUND_DIAGNOSTIC_THRESHOLDS_BY_CLASS[volatilityClass],
  };
}
