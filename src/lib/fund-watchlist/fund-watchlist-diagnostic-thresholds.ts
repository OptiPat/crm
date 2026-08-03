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

export const FUND_DIAGNOSTIC_VOLATILITY_CLASS_LABELS: Record<
  FundDiagnosticVolatilityClass,
  string
> = {
  actions: "Actions & thématiques",
  diversified: "Diversifiés / équilibrés",
  rates: "Taux / obligations / prudence",
};

export function fundWatchlistMetaCategoryKey(normalized: string): string | null {
  if (!normalized) return null;

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
      ],
      key: "actions_asie",
    },
    { needles: ["actions japon", "japon"], key: "actions_japon" },
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
    (normalized.includes("asie") || normalized.includes("asia")) &&
    !normalized.includes("japon") &&
    !normalized.includes("japan")
  ) {
    return "actions_asie";
  }

  return null;
}

const META_TO_VOLATILITY: Record<string, FundDiagnosticVolatilityClass> = {
  actions_tech: "actions",
  actions_asie: "actions",
  actions_japon: "actions",
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
