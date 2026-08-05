/** Référence groupe par défaut — volume moyen / consultant actif (exercice). */
export const DEFAULT_GROUP_ACTIVE_CONSULTANT_VOLUME_BENCHMARK_EUROS = 547_000;

/** Référence groupe par défaut — volume organisation moyen / consultant net (exercice). */
export const DEFAULT_GROUP_CONSULTANT_AVERAGE_VOLUME_BENCHMARK_EUROS = 228_000;

/** Référence groupe par défaut — taux d'actifs (consultants présents ≥ 1 €). */
export const DEFAULT_GROUP_ACTIVE_CONSULTANT_RATE_BENCHMARK_PERCENT = 30;

/** Référence groupe par défaut — taux de parraineurs sur exercice (consultants réseau). */
export const DEFAULT_GROUP_SPONSOR_RATE_BENCHMARK_PERCENT = 26.5;

/** Référence groupe par défaut — parrainages / parraineur sur exercice. */
export const DEFAULT_GROUP_PARRAINAGES_PER_PARRAINEUR_BENCHMARK = 1.9;

/** Référence groupe par défaut — croissance nette sur exercice (% vs exercice précédent). */
export const DEFAULT_GROUP_NET_GROWTH_BENCHMARK_PERCENT = 30;

/** Référence groupe par défaut — taux d'attrition sur exercice (% de la cohorte). */
export const DEFAULT_GROUP_ATTRITION_BENCHMARK_PERCENT = 20;

/** Référence groupe par défaut — délai moyen avant 1er VAA ou VA (mois). */
export const DEFAULT_GROUP_VAA_DURATION_BENCHMARK_MONTHS = 14.62;

/** Référence groupe par défaut — délai moyen avant 1ère habilitation (mois). */
export const DEFAULT_GROUP_HABILITATION_DURATION_BENCHMARK_MONTHS = 8.7;

/** En dessous de ce ratio (ex. 0,8 = 80 %), la carte passe au rouge. */
export const DEFAULT_NEAR_GROUP_BENCHMARK_RATIO = 0.8;

export type FilleulVolumeBenchmarkStatus = "above_group" | "near_group" | "below_group";

export type StatistiquesBenchmarkSettings = {
  /** Volume moyen consultant actif — référence nationale / groupe (€). */
  groupActiveConsultantVolumeEuros: number;
  /** Volume organisation moyen / consultant net — référence nationale / groupe (€). */
  groupConsultantAverageVolumeEuros: number;
  /** Taux d'actifs — référence groupe (% consultants présents ≥ 1 €). */
  groupActiveConsultantRatePercent: number;
  /** Taux de parraineurs — référence nationale / groupe (%). */
  groupSponsorRatePercent: number;
  /** Parrainages / parraineur — référence nationale / groupe. */
  groupParrainagesPerParraineur: number;
  /** Croissance nette — référence nationale / groupe (% vs exercice précédent). */
  groupNetGrowthPercent: number;
  /** Attrition — référence nationale / groupe (% de la cohorte présente au 01/08). */
  groupAttritionPercent: number;
  /** Délai moyen avant 1er VAA ou VA — référence nationale / groupe (mois). */
  groupVaaDurationMonths: number;
  /** Délai moyen avant 1ère habilitation — référence nationale / groupe (mois). */
  groupHabilitationDurationMonths: number;
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
    groupConsultantAverageVolumeEuros: DEFAULT_GROUP_CONSULTANT_AVERAGE_VOLUME_BENCHMARK_EUROS,
    groupActiveConsultantRatePercent: DEFAULT_GROUP_ACTIVE_CONSULTANT_RATE_BENCHMARK_PERCENT,
    groupSponsorRatePercent: DEFAULT_GROUP_SPONSOR_RATE_BENCHMARK_PERCENT,
    groupParrainagesPerParraineur: DEFAULT_GROUP_PARRAINAGES_PER_PARRAINEUR_BENCHMARK,
    groupNetGrowthPercent: DEFAULT_GROUP_NET_GROWTH_BENCHMARK_PERCENT,
    groupAttritionPercent: DEFAULT_GROUP_ATTRITION_BENCHMARK_PERCENT,
    groupVaaDurationMonths: DEFAULT_GROUP_VAA_DURATION_BENCHMARK_MONTHS,
    groupHabilitationDurationMonths: DEFAULT_GROUP_HABILITATION_DURATION_BENCHMARK_MONTHS,
    nearGroupBenchmarkRatio: DEFAULT_NEAR_GROUP_BENCHMARK_RATIO,
  };
}

function normalizeBenchmarkSettings(
  raw: Partial<StatistiquesBenchmarkSettings> | null | undefined
): StatistiquesBenchmarkSettings {
  const defaults = defaultStatistiquesBenchmarkSettings();
  const euros = raw?.groupActiveConsultantVolumeEuros;
  const consultantAverageEuros = raw?.groupConsultantAverageVolumeEuros;
  const activeRate = raw?.groupActiveConsultantRatePercent;
  const sponsorRate = raw?.groupSponsorRatePercent;
  const parrainagesPerParraineur = raw?.groupParrainagesPerParraineur;
  const netGrowthPercent = raw?.groupNetGrowthPercent;
  const attritionPercent = raw?.groupAttritionPercent;
  const vaaDurationMonths = raw?.groupVaaDurationMonths;
  const habilitationDurationMonths = raw?.groupHabilitationDurationMonths;
  const ratio = raw?.nearGroupBenchmarkRatio;

  const groupActiveConsultantVolumeEuros =
    typeof euros === "number" && Number.isFinite(euros) && euros > 0 ? euros : defaults.groupActiveConsultantVolumeEuros;

  const groupConsultantAverageVolumeEuros =
    typeof consultantAverageEuros === "number" &&
    Number.isFinite(consultantAverageEuros) &&
    consultantAverageEuros > 0
      ? consultantAverageEuros
      : defaults.groupConsultantAverageVolumeEuros;

  const groupActiveConsultantRatePercent =
    typeof activeRate === "number" &&
    Number.isFinite(activeRate) &&
    activeRate > 0 &&
    activeRate <= 100
      ? activeRate
      : defaults.groupActiveConsultantRatePercent;

  const groupSponsorRatePercent =
    typeof sponsorRate === "number" && Number.isFinite(sponsorRate) && sponsorRate > 0 && sponsorRate <= 100
      ? sponsorRate
      : defaults.groupSponsorRatePercent;

  const groupParrainagesPerParraineur =
    typeof parrainagesPerParraineur === "number" &&
    Number.isFinite(parrainagesPerParraineur) &&
    parrainagesPerParraineur > 0
      ? parrainagesPerParraineur
      : defaults.groupParrainagesPerParraineur;

  const groupNetGrowthPercent =
    typeof netGrowthPercent === "number" &&
    Number.isFinite(netGrowthPercent) &&
    netGrowthPercent > 0
      ? netGrowthPercent
      : defaults.groupNetGrowthPercent;

  const groupAttritionPercent =
    typeof attritionPercent === "number" &&
    Number.isFinite(attritionPercent) &&
    attritionPercent >= 0 &&
    attritionPercent <= 100
      ? attritionPercent
      : defaults.groupAttritionPercent;

  const groupVaaDurationMonths =
    typeof vaaDurationMonths === "number" &&
    Number.isFinite(vaaDurationMonths) &&
    vaaDurationMonths > 0
      ? vaaDurationMonths
      : defaults.groupVaaDurationMonths;

  const groupHabilitationDurationMonths =
    typeof habilitationDurationMonths === "number" &&
    Number.isFinite(habilitationDurationMonths) &&
    habilitationDurationMonths > 0
      ? habilitationDurationMonths
      : defaults.groupHabilitationDurationMonths;

  const nearGroupBenchmarkRatio =
    typeof ratio === "number" && Number.isFinite(ratio) && ratio > 0 && ratio < 1
      ? ratio
      : defaults.nearGroupBenchmarkRatio;

  return {
    groupActiveConsultantVolumeEuros,
    groupConsultantAverageVolumeEuros,
    groupActiveConsultantRatePercent,
    groupSponsorRatePercent,
    groupParrainagesPerParraineur,
    groupNetGrowthPercent,
    groupAttritionPercent,
    groupVaaDurationMonths,
    groupHabilitationDurationMonths,
    nearGroupBenchmarkRatio,
  };
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

export function getFilleulConsultantAverageVolumeBenchmarkStatus(
  averageVolumePerConsultant: number,
  settings: StatistiquesBenchmarkSettings
): FilleulVolumeBenchmarkStatus {
  return getGroupBenchmarkStatus(
    averageVolumePerConsultant,
    settings.groupConsultantAverageVolumeEuros,
    settings.nearGroupBenchmarkRatio
  );
}

export function getFilleulActiveConsultantRateBenchmarkStatus(
  activeRatePercent: number,
  settings: StatistiquesBenchmarkSettings
): FilleulVolumeBenchmarkStatus {
  return getGroupBenchmarkStatus(
    activeRatePercent,
    settings.groupActiveConsultantRatePercent,
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

export function getFilleulParrainagePerParraineurBenchmarkStatus(
  averagePerParraineur: number,
  settings: StatistiquesBenchmarkSettings
): FilleulVolumeBenchmarkStatus {
  return getGroupBenchmarkStatus(
    averagePerParraineur,
    settings.groupParrainagesPerParraineur,
    settings.nearGroupBenchmarkRatio
  );
}

export function getFilleulNetGrowthBenchmarkStatus(
  netGrowthPercent: number,
  settings: StatistiquesBenchmarkSettings
): FilleulVolumeBenchmarkStatus {
  return getGroupBenchmarkStatus(
    netGrowthPercent,
    settings.groupNetGrowthPercent,
    settings.nearGroupBenchmarkRatio
  );
}

/** Attrition plus basse = mieux : vert ≤ réf., orange juste au-dessus, rouge au-delà. */
export function getFilleulAttritionBenchmarkStatus(
  attritionPercent: number,
  settings: StatistiquesBenchmarkSettings
): FilleulVolumeBenchmarkStatus {
  return getLowerIsBetterDurationBenchmarkStatus(
    attritionPercent,
    settings.groupAttritionPercent,
    settings
  );
}

/** Délai plus court = mieux : vert ≤ réf., orange juste au-dessus, rouge au-delà. */
export function getFilleulVaaDurationBenchmarkStatus(
  averageMonths: number,
  settings: StatistiquesBenchmarkSettings
): FilleulVolumeBenchmarkStatus {
  return getLowerIsBetterDurationBenchmarkStatus(averageMonths, settings.groupVaaDurationMonths, settings);
}

export function getFilleulHabilitationDurationBenchmarkStatus(
  averageMonths: number,
  settings: StatistiquesBenchmarkSettings
): FilleulVolumeBenchmarkStatus {
  return getLowerIsBetterDurationBenchmarkStatus(
    averageMonths,
    settings.groupHabilitationDurationMonths,
    settings
  );
}

function getLowerIsBetterDurationBenchmarkStatus(
  averageMonths: number,
  reference: number,
  settings: StatistiquesBenchmarkSettings
): FilleulVolumeBenchmarkStatus {
  const ratio = settings.nearGroupBenchmarkRatio;
  if (!Number.isFinite(averageMonths) || reference <= 0) return "below_group";
  if (averageMonths <= reference) return "above_group";
  const ceiling = reference / ratio;
  if (averageMonths <= ceiling) return "near_group";
  return "below_group";
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

export function formatConsultantAverageVolumeVsGroupBenchmarkPercent(
  averageVolumePerConsultant: number,
  settings: StatistiquesBenchmarkSettings
): string {
  return formatVsGroupBenchmarkPercent(
    averageVolumePerConsultant,
    settings.groupConsultantAverageVolumeEuros
  );
}

export function formatActiveConsultantRateVsGroupBenchmarkPercent(
  activeRatePercent: number,
  settings: StatistiquesBenchmarkSettings
): string {
  return formatVsGroupBenchmarkPercent(
    activeRatePercent,
    settings.groupActiveConsultantRatePercent
  );
}

export function formatSponsorRateVsGroupBenchmarkPercent(
  sponsorRatePercent: number,
  settings: StatistiquesBenchmarkSettings
): string {
  return formatVsGroupBenchmarkPercent(sponsorRatePercent, settings.groupSponsorRatePercent);
}

export function formatParrainagePerParraineurVsGroupBenchmarkPercent(
  averagePerParraineur: number,
  settings: StatistiquesBenchmarkSettings
): string {
  return formatVsGroupBenchmarkPercent(
    averagePerParraineur,
    settings.groupParrainagesPerParraineur
  );
}

export function formatNetGrowthVsGroupBenchmarkPercent(
  netGrowthPercent: number,
  settings: StatistiquesBenchmarkSettings
): string {
  return formatVsGroupBenchmarkPercent(netGrowthPercent, settings.groupNetGrowthPercent);
}

export function formatAttritionVsGroupBenchmarkPercent(
  attritionPercent: number,
  settings: StatistiquesBenchmarkSettings
): string {
  return formatVsGroupBenchmarkPercent(attritionPercent, settings.groupAttritionPercent);
}

export function formatVaaDurationVsGroupBenchmarkPercent(
  averageMonths: number,
  settings: StatistiquesBenchmarkSettings
): string {
  return formatVsGroupBenchmarkPercent(averageMonths, settings.groupVaaDurationMonths);
}

export function formatHabilitationDurationVsGroupBenchmarkPercent(
  averageMonths: number,
  settings: StatistiquesBenchmarkSettings
): string {
  return formatVsGroupBenchmarkPercent(averageMonths, settings.groupHabilitationDurationMonths);
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

export function filleulVaaDurationBenchmarkStatusLabel(status: FilleulVolumeBenchmarkStatus): string {
  if (status === "above_group") return "Délai inférieur à la référence groupe";
  if (status === "near_group") return "Délai proche de la référence groupe";
  return "Délai supérieur à la référence groupe";
}

export function filleulHabilitationDurationBenchmarkStatusLabel(
  status: FilleulVolumeBenchmarkStatus
): string {
  return filleulVaaDurationBenchmarkStatusLabel(status);
}

export function filleulAttritionBenchmarkStatusLabel(
  status: FilleulVolumeBenchmarkStatus
): string {
  if (status === "above_group") return "Attrition inférieure à la référence groupe";
  if (status === "near_group") return "Attrition proche de la référence groupe";
  return "Attrition supérieure à la référence groupe";
}
