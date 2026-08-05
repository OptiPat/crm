/**
 * Diagnostic Organisation — V1 (règles A1-A8, B5, B7 de docs/DIAGNOSTIC_ORGANISATION.md).
 *
 * Fonction pure : prend les stats déjà calculées ailleurs (benchmark settings + valeurs
 * d'exercice) et retourne une liste de constats/recommandations. Ne recalcule rien, ne connaît
 * pas les contacts — juste de la lecture de nombres déjà produits par les modules
 * `filleul-*-stats` et `statistiques-benchmark-settings`.
 *
 * Règles R-B2/R-B3/R-B4/R-B6 (nécessitent des données non encore vérifiées) volontairement hors
 * périmètre de cette V1.
 */
import {
  formatFilleulVolumeDisplay,
} from "@/lib/organisation/organisation-branch-volumes";
import { formatFilleulManagerPercent } from "./contact-filleul-organisation-stats";
import { formatFilleulVaaDurationMonths } from "./filleul-vaa-duration-stats";
import {
  getFilleulActiveConsultantRateBenchmarkStatus,
  getFilleulAttritionBenchmarkStatus,
  getFilleulHabilitationDurationBenchmarkStatus,
  getFilleulNetGrowthBenchmarkStatus,
  getFilleulParrainagePerParraineurBenchmarkStatus,
  getFilleulSponsorRateBenchmarkStatus,
  getFilleulVaaDurationBenchmarkStatus,
  getFilleulVolumeBenchmarkStatus,
  getGroupBenchmarkStatus,
  type FilleulVolumeBenchmarkStatus,
  type StatistiquesBenchmarkSettings,
} from "./statistiques-benchmark-settings";

/** Référence groupe par défaut — taux de Managers (R-A8, pas encore dans les réglages benchmark). */
export const DEFAULT_GROUP_MANAGER_RATE_BENCHMARK_PERCENT = 20;

export type OrganisationDiagnosticRuleId =
  | "volume"
  | "tauxActifs"
  | "tauxParraineurs"
  | "parrainagesParParraineur"
  | "croissanceNette"
  | "delaiVaa"
  | "delaiHabilitation"
  | "tauxManagers"
  | "attrition"
  | "delaiParrainage";

export type OrganisationDiagnosticSeverity = "ok" | "watch" | "alert" | "critical";

export type OrganisationDiagnosticEntry = {
  ruleId: OrganisationDiagnosticRuleId;
  severity: OrganisationDiagnosticSeverity;
  title: string;
  message: string;
  recommendation: string;
};

export type OrganisationDiagnosticInput = {
  benchmarkSettings: StatistiquesBenchmarkSettings;
  /** R-A8 : pas encore dans `StatistiquesBenchmarkSettings`, valeur par défaut sinon. */
  groupManagerRatePercent?: number;

  averageVolume?: number | null;
  activeRatePercent?: number | null;
  sponsorRatePercent?: number | null;
  parrainagesPerParraineur?: number | null;
  netGrowthPercent?: number | null;
  /** Pour détecter 2 exercices rouges consécutifs (R-A5). */
  previousNetGrowthPercent?: number | null;
  vaaDurationMonths?: number | null;
  habilitationDurationMonths?: number | null;
  managerRatePercent?: number | null;
  attritionPercent?: number | null;
  /** Pour détecter 2 exercices > 50 % consécutifs (R-B5). */
  previousAttritionPercent?: number | null;
  parrainageDurationMonths?: number | null;
  /** Délais des exercices précédents (hors courant), pour mesurer la variabilité (R-B7). */
  parrainageDurationHistoryMonths?: number[];
};

function severityFromBenchmarkStatus(
  status: FilleulVolumeBenchmarkStatus
): "ok" | "watch" | "alert" {
  if (status === "above_group") return "ok";
  if (status === "near_group") return "watch";
  return "alert";
}

function buildVolumeEntry(input: OrganisationDiagnosticInput): OrganisationDiagnosticEntry | null {
  if (input.averageVolume == null) return null;
  const ref = input.benchmarkSettings.groupActiveConsultantVolumeEuros;
  const status = getFilleulVolumeBenchmarkStatus(input.averageVolume, input.benchmarkSettings);
  const severity = severityFromBenchmarkStatus(status);
  return {
    ruleId: "volume",
    severity,
    title: "Volume moyen par consultant actif",
    message:
      severity === "ok"
        ? `Volume moyen des actifs (${formatFilleulVolumeDisplay(input.averageVolume)}) au niveau ou au-dessus de la référence groupe (${formatFilleulVolumeDisplay(ref)}).`
        : `Volume moyen des actifs (${formatFilleulVolumeDisplay(input.averageVolume)}) sous la référence groupe (${formatFilleulVolumeDisplay(ref)}).`,
    recommendation:
      severity === "ok"
        ? "Point fort à préserver."
        : "Pas un problème de recrutement mais de production : accompagnement terrain individualisé (co-rendez-vous, revue de portefeuille, formation produit) pour les actifs sous la référence.",
  };
}

function buildTauxActifsEntry(input: OrganisationDiagnosticInput): OrganisationDiagnosticEntry | null {
  if (input.activeRatePercent == null) return null;
  const ref = input.benchmarkSettings.groupActiveConsultantRatePercent;
  const status = getFilleulActiveConsultantRateBenchmarkStatus(
    input.activeRatePercent,
    input.benchmarkSettings
  );
  const severity = severityFromBenchmarkStatus(status);
  return {
    ruleId: "tauxActifs",
    severity,
    title: "Taux d'actifs",
    message: `Taux d'actifs ${formatFilleulManagerPercent(input.activeRatePercent)} (réf. groupe ${formatFilleulManagerPercent(ref)}).`,
    recommendation:
      severity === "ok"
        ? "Point fort à préserver."
        : "Beaucoup de consultants inscrits mais inactifs commercialement : identifier les inactifs et faire un point individuel avant qu'ils ne désinscrivent.",
  };
}

function buildTauxParraineursEntry(
  input: OrganisationDiagnosticInput
): OrganisationDiagnosticEntry | null {
  if (input.sponsorRatePercent == null) return null;
  const ref = input.benchmarkSettings.groupSponsorRatePercent;
  const status = getFilleulSponsorRateBenchmarkStatus(
    input.sponsorRatePercent,
    input.benchmarkSettings
  );
  const severity = severityFromBenchmarkStatus(status);
  return {
    ruleId: "tauxParraineurs",
    severity,
    title: "Taux de parraineurs",
    message: `Taux de parraineurs ${formatFilleulManagerPercent(input.sponsorRatePercent)} (réf. groupe ${formatFilleulManagerPercent(ref)}).`,
    recommendation:
      severity === "ok"
        ? "Point fort à préserver — base de recrutement large."
        : "Dépendance croissante à quelques recruteurs, la duplication ne fonctionne plus : creuser en priorité pourquoi moins de gens recrutent qu'avant, avant d'investir ailleurs.",
  };
}

function buildParrainagesParParraineurEntry(
  input: OrganisationDiagnosticInput
): OrganisationDiagnosticEntry | null {
  if (input.parrainagesPerParraineur == null) return null;
  const ref = input.benchmarkSettings.groupParrainagesPerParraineur;
  const status = getFilleulParrainagePerParraineurBenchmarkStatus(
    input.parrainagesPerParraineur,
    input.benchmarkSettings
  );
  const severity = severityFromBenchmarkStatus(status);
  return {
    ruleId: "parrainagesParParraineur",
    severity,
    title: "Parrainages / parraineur",
    message: `${input.parrainagesPerParraineur.toLocaleString("fr-FR", { maximumFractionDigits: 1 })} parrainages/parraineur (réf. groupe ${ref.toLocaleString("fr-FR", { maximumFractionDigits: 1 })}).`,
    recommendation:
      "À lire avec le taux de parraineurs : un chiffre élevé ici combiné à un taux de parraineurs bas confirme une concentration sur quelques recruteurs plutôt qu'une base large.",
  };
}

function buildCroissanceNetteEntry(
  input: OrganisationDiagnosticInput
): OrganisationDiagnosticEntry | null {
  if (input.netGrowthPercent == null) return null;
  const ref = input.benchmarkSettings.groupNetGrowthPercent;
  const status = getFilleulNetGrowthBenchmarkStatus(input.netGrowthPercent, input.benchmarkSettings);
  const severity = severityFromBenchmarkStatus(status);
  const previousStatus =
    input.previousNetGrowthPercent != null
      ? getFilleulNetGrowthBenchmarkStatus(input.previousNetGrowthPercent, input.benchmarkSettings)
      : null;
  const twoYearsRed = severity === "alert" && previousStatus === "below_group";
  return {
    ruleId: "croissanceNette",
    severity: twoYearsRed ? "critical" : severity,
    title: "Croissance nette",
    message: twoYearsRed
      ? `Croissance nette sous la référence groupe (+${ref} %) 2 exercices consécutifs — contraction durable, pas un accident isolé.`
      : `Croissance nette ${input.netGrowthPercent.toLocaleString("fr-FR", { maximumFractionDigits: 1 })} % (réf. groupe +${ref} %).`,
    recommendation:
      severity === "ok"
        ? "Point fort à préserver."
        : "Signal de synthèse : regarder le taux de parraineurs, le taux d'actifs et l'attrition pour la cause racine. Vérifier le DMO personnel puis celui des leaders/managers avant de chercher une cause externe.",
  };
}

function buildDelaiVaaEntry(input: OrganisationDiagnosticInput): OrganisationDiagnosticEntry | null {
  if (input.vaaDurationMonths == null) return null;
  const ref = input.benchmarkSettings.groupVaaDurationMonths;
  const status = getFilleulVaaDurationBenchmarkStatus(input.vaaDurationMonths, input.benchmarkSettings);
  const severity = severityFromBenchmarkStatus(status);
  return {
    ruleId: "delaiVaa",
    severity,
    title: "Délai avant 1er VAA ou VA",
    message: `Délai ${formatFilleulVaaDurationMonths(input.vaaDurationMonths)} (réf. groupe ${formatFilleulVaaDurationMonths(ref)}).`,
    recommendation:
      severity === "ok"
        ? "Point fort à préserver."
        : "Vérifier ce qui a changé sur le dernier exercice (process interne, disponibilité de l'organisme, dossiers en attente) avant d'alerter fortement.",
  };
}

function buildDelaiHabilitationEntry(
  input: OrganisationDiagnosticInput
): OrganisationDiagnosticEntry | null {
  if (input.habilitationDurationMonths == null) return null;
  const ref = input.benchmarkSettings.groupHabilitationDurationMonths;
  const status = getFilleulHabilitationDurationBenchmarkStatus(
    input.habilitationDurationMonths,
    input.benchmarkSettings
  );
  const severity = severityFromBenchmarkStatus(status);
  return {
    ruleId: "delaiHabilitation",
    severity,
    title: "Délai 1ère habilitation",
    message: `Délai ${formatFilleulVaaDurationMonths(input.habilitationDurationMonths)} (réf. groupe ${formatFilleulVaaDurationMonths(ref)}).`,
    recommendation:
      severity === "ok"
        ? "Point fort à préserver."
        : "Vérifier ce qui a changé sur le dernier exercice (process interne, disponibilité de l'organisme, dossiers en attente) avant d'alerter fortement — un seul exercice rouge après une longue série verte est un signal à surveiller, pas une crise.",
  };
}

function buildTauxManagersEntry(
  input: OrganisationDiagnosticInput
): OrganisationDiagnosticEntry | null {
  if (input.managerRatePercent == null) return null;
  const ref = input.groupManagerRatePercent ?? DEFAULT_GROUP_MANAGER_RATE_BENCHMARK_PERCENT;
  const status = getGroupBenchmarkStatus(
    input.managerRatePercent,
    ref,
    input.benchmarkSettings.nearGroupBenchmarkRatio
  );
  const severity = severityFromBenchmarkStatus(status);
  return {
    ruleId: "tauxManagers",
    severity,
    title: "Taux de Managers (palier de confiance)",
    message: `${formatFilleulManagerPercent(input.managerRatePercent)} de Managers (réf. groupe ${formatFilleulManagerPercent(ref)}).`,
    recommendation:
      severity === "ok"
        ? "Point fort à préserver."
        : "Suivre en priorité les consultants proches du seuil Manager pour les accompagner activement ; rendre le chemin explicite dès l'intégration et célébrer publiquement chaque passage.",
  };
}

function buildAttritionEntry(input: OrganisationDiagnosticInput): OrganisationDiagnosticEntry | null {
  if (input.attritionPercent == null) return null;
  const ref = input.benchmarkSettings.groupAttritionPercent;
  const status = getFilleulAttritionBenchmarkStatus(input.attritionPercent, input.benchmarkSettings);
  const severity = severityFromBenchmarkStatus(status);
  const previousStatus =
    input.previousAttritionPercent != null
      ? getFilleulAttritionBenchmarkStatus(input.previousAttritionPercent, input.benchmarkSettings)
      : null;
  const twoYearsBelowGroup = severity === "alert" && previousStatus === "below_group";
  return {
    ruleId: "attrition",
    severity: twoYearsBelowGroup ? "critical" : severity,
    title: "Attrition",
    message: twoYearsBelowGroup
      ? `Attrition supérieure à la référence groupe (${formatFilleulManagerPercent(ref)}) 2 exercices consécutifs (actuel : ${formatFilleulManagerPercent(input.attritionPercent)}).`
      : `Attrition ${formatFilleulManagerPercent(input.attritionPercent)} (réf. groupe ${formatFilleulManagerPercent(ref)}).`,
    recommendation:
      severity === "ok"
        ? "Point fort à préserver."
        : "Suivi structuré à 30/60/90 jours pour les nouveaux plutôt qu'un contrôle uniquement à la clôture de l'exercice ; l'attrition se joue surtout dans les tout premiers jours/semaines.",
  };
}

function standardDeviation(values: number[]): number {
  if (values.length < 2) return 0;
  const mean = values.reduce((sum, v) => sum + v, 0) / values.length;
  const variance = values.reduce((sum, v) => sum + (v - mean) ** 2, 0) / values.length;
  return Math.sqrt(variance);
}

/** Au-delà de cet écart-type (en mois), le délai 1er parrainage est jugé peu prévisible. */
const DELAI_PARRAINAGE_VARIABILITY_THRESHOLD_MONTHS = 1.5;

function buildDelaiParrainageEntry(
  input: OrganisationDiagnosticInput
): OrganisationDiagnosticEntry | null {
  if (input.parrainageDurationMonths == null) return null;
  const history = [
    ...(input.parrainageDurationHistoryMonths ?? []),
    input.parrainageDurationMonths,
  ];
  const stdDev = standardDeviation(history);
  const highVariability = history.length >= 3 && stdDev > DELAI_PARRAINAGE_VARIABILITY_THRESHOLD_MONTHS;
  return {
    ruleId: "delaiParrainage",
    severity: highVariability ? "watch" : "ok",
    title: "Délai avant 1er parrainage",
    message: highVariability
      ? `Délai très variable d'un exercice à l'autre (écart-type ${stdDev.toLocaleString("fr-FR", { maximumFractionDigits: 1 })} mois) : pas de process d'intégration répétable.`
      : `Délai ${formatFilleulVaaDurationMonths(input.parrainageDurationMonths)} — pas de référence nationale disponible pour cet indicateur.`,
    recommendation: highVariability
      ? "Fixer, dès l'intégration, un objectif d'activité dans les premiers jours (invitations/présentations) plutôt qu'un objectif de résultat, pour réduire la dépendance au hasard."
      : "Cet indicateur mesure le délai jusqu'au résultat, pas jusqu'à la 1ère activité : à interpréter avec prudence tant que le suivi d'activité n'existe pas.",
  };
}

const RULE_BUILDERS: Array<
  (input: OrganisationDiagnosticInput) => OrganisationDiagnosticEntry | null
> = [
  buildVolumeEntry,
  buildTauxActifsEntry,
  buildTauxParraineursEntry,
  buildParrainagesParParraineurEntry,
  buildCroissanceNetteEntry,
  buildDelaiVaaEntry,
  buildDelaiHabilitationEntry,
  buildTauxManagersEntry,
  buildAttritionEntry,
  buildDelaiParrainageEntry,
];

/** Calcule le diagnostic complet (règles A1-A8, B5, B7) — ignore les règles sans valeur fournie. */
export function computeOrganisationDiagnostic(
  input: OrganisationDiagnosticInput
): OrganisationDiagnosticEntry[] {
  return RULE_BUILDERS.map((build) => build(input)).filter(
    (entry): entry is OrganisationDiagnosticEntry => entry != null
  );
}

const SEVERITY_ORDER: Record<OrganisationDiagnosticSeverity, number> = {
  critical: 0,
  alert: 1,
  watch: 2,
  ok: 3,
};

/** Trie les constats du plus critique au plus sain — utile pour un futur affichage priorisé. */
export function sortOrganisationDiagnosticBySeverity(
  entries: OrganisationDiagnosticEntry[]
): OrganisationDiagnosticEntry[] {
  return [...entries].sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity]);
}
