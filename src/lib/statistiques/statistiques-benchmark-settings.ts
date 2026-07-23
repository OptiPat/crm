/** Référence groupe par défaut — volume moyen / consultant actif (exercice). */
export const DEFAULT_GROUP_ACTIVE_CONSULTANT_VOLUME_BENCHMARK_EUROS = 547_000;

/** Référence groupe par défaut — taux de parrainage sur exercice (consultants réseau). */
export const DEFAULT_GROUP_SPONSOR_RATE_BENCHMARK_PERCENT = 26.5;

/** En dessous de ce ratio (ex. 0,8 = 80 %), la carte passe au rouge. */
export const DEFAULT_NEAR_GROUP_BENCHMARK_RATIO = 0.8;

export type FilleulVolumeBenchmarkStatus = "above_group" | "near_group" | "below_group";

export type StatistiquesBenchmarkSettings = {
  /** Volume moyen consultant actif — référence nationale / groupe (€). */
  groupActiveConsultantVolumeEuros: number;
  /** Taux de parrainage — référence nationale / groupe (%). */
  groupSponsorRatePercent: number;
  /**
   * Seuil minimal (ratio 0–1) pour la zone orange.
   * Orange : [ratio × référence, référence[ ; vert au-dessus ; rouge en dessous.
   */
  nearGroupBenchmarkRatio: number;
};

const STORAGE_KEY = "crm_statistiques_benchmarks_v1";

export const STATISTIQUES_BENCHMARK_SETTINGS_CHANGED = "statistiques-benchmark-settings-changed";

export function defaultStatistiquesBenchmarkSettings(): StatistiquesBenchmarkSettings {
  return {
    groupActiveConsultantVolumeEuros: DEFAULT_GROUP_ACTIVE_CONSULTANT_VOLUME_BENCHMARK_EUROS,
    groupSponsorRatePercent: DEFAULT_GROUP_SPONSOR_RATE_BENCHMARK_PERCENT,
    nearGroupBenchmarkRatio: DEFAULT_NEAR_GROUP_BENCHMARK_RATIO,
  };
}

function normalizeBenchmarkSettings(
  raw: Partial<StatistiquesBenchmarkSettings> | null | undefined
): StatistiquesBenchmarkSettings {
  const defaults = defaultStatistiquesBenchmarkSettings();
  const euros = raw?.groupActiveConsultantVolumeEuros;
  const sponsorRate = raw?.groupSponsorRatePercent;
  const ratio = raw?.nearGroupBenchmarkRatio;

  const groupActiveConsultantVolumeEuros =
    typeof euros === "number" && Number.isFinite(euros) && euros > 0 ? euros : defaults.groupActiveConsultantVolumeEuros;

  const groupSponsorRatePercent =
    typeof sponsorRate === "number" && Number.isFinite(sponsorRate) && sponsorRate > 0 && sponsorRate <= 100
      ? sponsorRate
      : defaults.groupSponsorRatePercent;

  const nearGroupBenchmarkRatio =
    typeof ratio === "number" && Number.isFinite(ratio) && ratio > 0 && ratio < 1
      ? ratio
      : defaults.nearGroupBenchmarkRatio;

  return { groupActiveConsultantVolumeEuros, groupSponsorRatePercent, nearGroupBenchmarkRatio };
}

export function loadStatistiquesBenchmarkSettings(): StatistiquesBenchmarkSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultStatistiquesBenchmarkSettings();
    return normalizeBenchmarkSettings(JSON.parse(raw) as Partial<StatistiquesBenchmarkSettings>);
  } catch {
    return defaultStatistiquesBenchmarkSettings();
  }
}

export function saveStatistiquesBenchmarkSettings(settings: StatistiquesBenchmarkSettings): void {
  const normalized = normalizeBenchmarkSettings(settings);
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(normalized));
  } catch {
    /* ignore */
  }
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent(STATISTIQUES_BENCHMARK_SETTINGS_CHANGED));
  }
}

export function getGroupBenchmarkStatus(
  value: number,
  reference: number,
  nearRatio: number
): FilleulVolumeBenchmarkStatus {
  if (!Number.isFinite(value) || reference <= 0) return "below_group";
  if (value >= reference) return "above_group";
  const floor = reference * nearRatio;
  if (value >= floor) return "near_group";
  return "below_group";
}

export function getFilleulVolumeBenchmarkStatus(
  averageVolume: number,
  settings: StatistiquesBenchmarkSettings
): FilleulVolumeBenchmarkStatus {
  return getGroupBenchmarkStatus(
    averageVolume,
    settings.groupActiveConsultantVolumeEuros,
    settings.nearGroupBenchmarkRatio
  );
}

export function getFilleulSponsorRateBenchmarkStatus(
  sponsorRatePercent: number,
  settings: StatistiquesBenchmarkSettings
): FilleulVolumeBenchmarkStatus {
  return getGroupBenchmarkStatus(
    sponsorRatePercent,
    settings.groupSponsorRatePercent,
    settings.nearGroupBenchmarkRatio
  );
}

/** Écart relatif vs référence groupe (ex. +12 % ou −23 %). */
export function formatVsGroupBenchmarkPercent(value: number, reference: number): string {
  if (reference <= 0 || !Number.isFinite(value)) return "—";
  const pct = ((value - reference) / reference) * 100;
  const rounded = Math.round(pct);
  if (rounded === 0) return "≈ référence";
  const sign = rounded > 0 ? "+" : "";
  return `${sign}${rounded} % vs réf.`;
}

export function formatVolumeVsGroupBenchmarkPercent(
  averageVolume: number,
  settings: StatistiquesBenchmarkSettings
): string {
  return formatVsGroupBenchmarkPercent(averageVolume, settings.groupActiveConsultantVolumeEuros);
}

export function formatSponsorRateVsGroupBenchmarkPercent(
  sponsorRatePercent: number,
  settings: StatistiquesBenchmarkSettings
): string {
  return formatVsGroupBenchmarkPercent(sponsorRatePercent, settings.groupSponsorRatePercent);
}

export function filleulVolumeBenchmarkStatusBoxClasses(status: FilleulVolumeBenchmarkStatus): string {
  if (status === "above_group") {
    return "border-emerald-200/80 bg-emerald-50/90";
  }
  if (status === "near_group") {
    return "border-amber-200/80 bg-amber-50/90";
  }
  return "border-red-200/80 bg-red-50/90";
}

export function filleulVolumeBenchmarkStatusValueClasses(status: FilleulVolumeBenchmarkStatus): string {
  if (status === "above_group") return "text-emerald-800";
  if (status === "near_group") return "text-amber-900";
  return "text-red-800";
}

export function filleulVolumeBenchmarkStatusLabel(status: FilleulVolumeBenchmarkStatus): string {
  if (status === "above_group") return "Au-dessus de la référence groupe";
  if (status === "near_group") return "Proche de la référence groupe";
  return "Sous la référence groupe";
}
