import type { FundWatchlistEntry } from "@/lib/api/tauri-fund-watchlist";
import { computeFundWatchlistShortTermScore } from "@/lib/fund-watchlist/fund-watchlist-short-term-score";
import {
  FUND_DIAGNOSTIC_THRESHOLDS_BY_CLASS,
  FUND_DIAGNOSTIC_VOLATILITY_CLASS_LABELS,
  getFundDiagnosticDeltaThresholds,
  isSameFundWatchlistPeerCategory,
  normalizeFundWatchlistCategory,
  type FundDiagnosticVolatilityClass,
} from "@/lib/fund-watchlist/fund-watchlist-diagnostic-thresholds";

/** Statut diagnostic recalculé à chaque lecture watchlist (pas de mémoire). */
export type FundDiagnosticStatus =
  | "conserver"
  | "sous_surveillance"
  | "signal_arbitrage"
  | "inconnu";

export type FundDiagnostic = {
  status: FundDiagnosticStatus;
  /** Perf 1 an du fonds − référence (Boursorama ou médiane watchlist). */
  delta_1an_vs_category: number | null;
  /** Libellé de la référence utilisée pour le Δ 1 an. */
  delta_reference_label: string | null;
  /** Nombre de fonds dans la catégorie avec perf 1 an (dont le fonds). */
  peer_count: number;
  /** Profil de volatilité utilisé pour les seuils Δ. */
  volatility_class: FundDiagnosticVolatilityClass;
  /** Raisons ayant déclenché surveillance / arbitrage. */
  trigger_reasons: string[];
  /** Informations de contexte (ex. 1 an au-dessus de la médiane). */
  context_reasons: string[];
  /** Toutes les raisons affichables (déclencheurs puis contexte). */
  reasons: string[];
  /** Score CT négatif : info visuelle uniquement (ne déclenche pas la surveillance). */
  short_term_respiration: boolean;
};

export type FundBenchmarkReference = {
  category_perf_1an: number | null;
  label: string;
};

export const FUND_DIAGNOSTIC_SHORT_TERM_RESPIRATION_LABEL =
  "Respiration court terme (score CT négatif)";

export const FUND_DIAGNOSTIC_SHARPE_TRIGGER = "Sharpe ≤ 0";

/** Renforce l'argumentaire si un autre déclencheur est déjà actif (ne crée pas d'alerte seule). */
function appendSharpeAmplifier(
  triggerReasons: string[],
  sharpe: number | null | undefined
): void {
  if (
    sharpe != null &&
    sharpe <= 0 &&
    triggerReasons.length > 0 &&
    !triggerReasons.includes(FUND_DIAGNOSTIC_SHARPE_TRIGGER)
  ) {
    triggerReasons.push(FUND_DIAGNOSTIC_SHARPE_TRIGGER);
  }
}

export const FUND_DIAGNOSTIC_STATUS_LABELS: Record<FundDiagnosticStatus, string> = {
  conserver: "Conserver",
  sous_surveillance: "Sous surveillance",
  signal_arbitrage: "Signal arbitrage",
  inconnu: "Inconnu",
};

/** Seuils par défaut (Actions) — voir `fund-watchlist-diagnostic-thresholds.ts`. */
export const FUND_DIAGNOSTIC_DELTA_SURVEILLANCE_PTS =
  FUND_DIAGNOSTIC_THRESHOLDS_BY_CLASS.actions.surveillance;
export const FUND_DIAGNOSTIC_DELTA_ARBITRAGE_PTS =
  FUND_DIAGNOSTIC_THRESHOLDS_BY_CLASS.actions.arbitrage;
export const FUND_DIAGNOSTIC_MIN_PEERS = 2;

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 0) {
    return (sorted[mid - 1] + sorted[mid]) / 2;
  }
  return sorted[mid];
}

/** Horizons pris en compte pour la faiblesse multi-périodes (seuil &lt; −3 %). */
export const FUND_DIAGNOSTIC_WEAK_HORIZON_LABELS = [
  "1 mois",
  "3 mois",
  "YTD",
  "3 ans",
  "5 ans",
] as const;

function listWeakHorizonLabels(entry: FundWatchlistEntry): string[] {
  const pairs: [string, number | null | undefined][] = [
    ["1 mois", entry.perf_1mois],
    ["3 mois", entry.perf_3mois],
    ["YTD", entry.perf_ytd],
    ["3 ans", entry.perf_3ans],
    ["5 ans", entry.perf_5ans],
  ];
  return pairs
    .filter(([, value]) => value != null && value < -3)
    .map(([label]) => label);
}

function countWeakHorizons(entry: FundWatchlistEntry): number {
  return listWeakHorizonLabels(entry).length;
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

function emptyDiagnostic(
  partial: Omit<
    FundDiagnostic,
    "volatility_class" | "trigger_reasons" | "context_reasons" | "reasons" | "short_term_respiration"
  > & {
    volatility_class?: FundDiagnosticVolatilityClass;
    trigger_reasons?: string[];
    context_reasons?: string[];
    reasons?: string[];
    short_term_respiration?: boolean;
  }
): FundDiagnostic {
  const trigger_reasons = partial.trigger_reasons ?? [];
  const context_reasons = partial.context_reasons ?? [];
  const reasons =
    partial.reasons ??
    (trigger_reasons.length > 0 || context_reasons.length > 0
      ? [...trigger_reasons, ...context_reasons]
      : []);
  return {
    volatility_class: partial.volatility_class ?? "actions",
    short_term_respiration: partial.short_term_respiration ?? false,
    ...partial,
    trigger_reasons,
    context_reasons,
    reasons,
  };
}

export function computeFundDiagnostic(
  entry: FundWatchlistEntry,
  allEntries: FundWatchlistEntry[],
  benchmark?: FundBenchmarkReference | null
): FundDiagnostic {
  const triggerReasons: string[] = [];
  const contextReasons: string[] = [];
  const categoryKey = normalizeFundWatchlistCategory(entry.categorie);
  const thresholds = getFundDiagnosticDeltaThresholds(entry.categorie);

  if (!categoryKey) {
    return emptyDiagnostic({
      status: "inconnu",
      delta_1an_vs_category: null,
      delta_reference_label: null,
      peer_count: 0,
      volatility_class: thresholds.volatilityClass,
      reasons: ["Catégorie absente"],
    });
  }

  if (entry.perf_1an == null || !Number.isFinite(entry.perf_1an)) {
    return emptyDiagnostic({
      status: "inconnu",
      delta_1an_vs_category: null,
      delta_reference_label: null,
      peer_count: 0,
      volatility_class: thresholds.volatilityClass,
      reasons: ["Perf. 1 an absente"],
    });
  }

  const peers = allEntries.filter(
    (other) =>
      isSameFundWatchlistPeerCategory(other.categorie, entry.categorie) &&
      other.perf_1an != null &&
      Number.isFinite(other.perf_1an)
  );
  const peerPerfs = peers.map((p) => p.perf_1an as number);
  const peerMedian = median(peerPerfs);

  const boursoramaRef =
    benchmark?.category_perf_1an != null && Number.isFinite(benchmark.category_perf_1an)
      ? benchmark.category_perf_1an
      : null;
  const referenceLabel =
    boursoramaRef != null
      ? benchmark?.label ?? "Catégorie Boursorama"
      : peerPerfs.length >= FUND_DIAGNOSTIC_MIN_PEERS
        ? "médiane catégorie (watchlist)"
        : null;
  const referenceValue = boursoramaRef ?? peerMedian;

  if (referenceValue == null) {
    return emptyDiagnostic({
      status: "inconnu",
      delta_1an_vs_category: null,
      delta_reference_label: referenceLabel,
      peer_count: peerPerfs.length,
      volatility_class: thresholds.volatilityClass,
      reasons: [`Pairs insuffisants dans la catégorie (min. ${FUND_DIAGNOSTIC_MIN_PEERS})`],
    });
  }

  const delta = round1(entry.perf_1an - referenceValue);
  const refName = referenceLabel ?? "référence";
  if (delta > 0) {
    contextReasons.push(`1 an au-dessus de la référence (+${delta} pt)`);
  } else if (delta > thresholds.surveillance) {
    contextReasons.push(`Légèrement sous la référence (${delta} pt)`);
  } else if (delta !== 0) {
    triggerReasons.push(`Écart vs ${refName} 1 an : ${delta} pt`);
  }

  if (thresholds.volatilityClass !== "actions") {
    const label = FUND_DIAGNOSTIC_VOLATILITY_CLASS_LABELS[thresholds.volatilityClass];
    contextReasons.push(
      `Seuils ${label} : surveillance ≤ ${thresholds.surveillance} pt, arbitrage ≤ ${thresholds.arbitrage} pt`
    );
  }

  const weakHorizons = countWeakHorizons(entry);
  const ct = computeFundWatchlistShortTermScore(entry);
  const sharpe = entry.sharpe_ratio;
  const m1 = entry.perf_1mois;
  const ytd = entry.perf_ytd;
  const y1 = entry.perf_1an;

  const marketCorrection =
    m1 != null && ytd != null && m1 <= -5 && ytd >= 10;
  const shortTermRespiration = ct != null && ct < 0;

  if (marketCorrection) {
    triggerReasons.push("Correction 1 mois avec YTD encore solide");
  }

  if (shortTermRespiration) {
    contextReasons.push(FUND_DIAGNOSTIC_SHORT_TERM_RESPIRATION_LABEL);
  }

  if (weakHorizons >= 2) {
    const weakLabels = listWeakHorizonLabels(entry);
    triggerReasons.push(
      `Faiblesse sur ${weakHorizons} horizons (${weakLabels.join(", ")})`
    );
  }

  const durableWeakness =
    weakHorizons >= 2 || (y1 != null && m1 != null && y1 < 0 && m1 < 0);

  if (delta <= thresholds.arbitrage && durableWeakness) {
    appendSharpeAmplifier(triggerReasons, sharpe);
    return emptyDiagnostic({
      status: "signal_arbitrage",
      delta_1an_vs_category: delta,
      delta_reference_label: referenceLabel,
      peer_count: peerPerfs.length,
      volatility_class: thresholds.volatilityClass,
      short_term_respiration: shortTermRespiration,
      trigger_reasons: triggerReasons,
      context_reasons: contextReasons,
    });
  }

  if (
    delta <= thresholds.arbitrage ||
    delta <= thresholds.surveillance ||
    marketCorrection ||
    weakHorizons >= 2
  ) {
    appendSharpeAmplifier(triggerReasons, sharpe);
    return emptyDiagnostic({
      status: "sous_surveillance",
      delta_1an_vs_category: delta,
      delta_reference_label: referenceLabel,
      peer_count: peerPerfs.length,
      volatility_class: thresholds.volatilityClass,
      short_term_respiration: shortTermRespiration,
      trigger_reasons: triggerReasons,
      context_reasons: contextReasons,
    });
  }

  const contextOnly =
    contextReasons.length > 0
      ? contextReasons
      : [
          referenceLabel
            ? `Dans la moyenne vs ${referenceLabel}`
            : "Dans la moyenne de la catégorie (watchlist)",
        ];

  return emptyDiagnostic({
    status: "conserver",
    delta_1an_vs_category: delta,
    delta_reference_label: referenceLabel,
    peer_count: peerPerfs.length,
    volatility_class: thresholds.volatilityClass,
    short_term_respiration: shortTermRespiration,
    context_reasons: contextOnly,
  });
}

export function buildFundWatchlistDiagnostics(
  entries: FundWatchlistEntry[],
  benchmarks?: Map<string, FundBenchmarkReference>
): Map<string, FundDiagnostic> {
  const map = new Map<string, FundDiagnostic>();
  for (const entry of entries) {
    map.set(
      entry.isin,
      computeFundDiagnostic(entry, entries, benchmarks?.get(entry.isin))
    );
  }
  return map;
}

export function diagnosticStatusSortRank(status: FundDiagnosticStatus): number {
  switch (status) {
    case "signal_arbitrage":
      return 0;
    case "sous_surveillance":
      return 1;
    case "inconnu":
      return 2;
    case "conserver":
      return 3;
  }
}

export function sortEntriesByDiagnosticPriority(
  entries: FundWatchlistEntry[],
  diagnostics: Map<string, FundDiagnostic>
): FundWatchlistEntry[] {
  return [...entries].sort((a, b) => {
    const da = diagnostics.get(a.isin);
    const db = diagnostics.get(b.isin);
    const ra = diagnosticStatusSortRank(da?.status ?? "inconnu");
    const rb = diagnosticStatusSortRank(db?.status ?? "inconnu");
    if (ra !== rb) return ra - rb;
    const deltaA = da?.delta_1an_vs_category ?? 0;
    const deltaB = db?.delta_1an_vs_category ?? 0;
    if (deltaA !== deltaB) return deltaA - deltaB;
    return a.nom.localeCompare(b.nom, "fr");
  });
}

export function countDiagnosticsByStatus(
  diagnostics: Map<string, FundDiagnostic>
): Record<FundDiagnosticStatus, number> {
  const counts: Record<FundDiagnosticStatus, number> = {
    conserver: 0,
    sous_surveillance: 0,
    signal_arbitrage: 0,
    inconnu: 0,
  };
  for (const diag of diagnostics.values()) {
    counts[diag.status] += 1;
  }
  return counts;
}
