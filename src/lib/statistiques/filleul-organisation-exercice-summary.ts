import type { Contact } from "@/lib/api/tauri-contacts";
import type { FilleulDossier } from "@/lib/api/tauri-filleul-dossier";
import type { FilleulVolumeExercice } from "@/lib/api/tauri-filleul-volumes";
import type { CgpConfig } from "@/lib/api/tauri-settings";
import {
  buildOrganisationVolumeRows,
  formatFilleulVolumeDisplayWhole,
} from "@/lib/organisation/organisation-branch-volumes";
import { buildOrganisationTree, resolveOrganisationSelfContact } from "@/lib/organisation/organisation-tree";
import {
  applyExerciceVolumesToContacts,
  buildOrganisationVolumeRowsForExercice,
  indexFilleulVolumeExercicesByContactId,
  isLiveFilleulExerciceVolumes,
  isFilleulExerciceVolumeResolvable,
  shouldUseHistoricalFilleulExerciceVolumes,
} from "@/lib/organisation/organisation-volume-history";
import {
  computeFilleulAttritionExerciceStats,
} from "@/lib/statistiques/contact-attrition-stats";
import {
  computeFilleulAverageVolumeExerciceStats,
  computeFilleulParraineurExerciceStats,
  EMPTY_FILLEUL_AVERAGE_VOLUME_STATS,
  formatFilleulManagerPercent,
} from "@/lib/statistiques/contact-filleul-organisation-stats";
import { computeFilleulNetGrowthExerciceStats } from "@/lib/statistiques/filleul-net-growth-stats";
import {
  computeFilleulHabilitationDurationExerciceStats,
  formatFilleulHabilitationDurationMonths,
} from "@/lib/statistiques/filleul-habilitation-duration-stats";
import {
  computeFilleulManagerDurationExerciceStats,
  formatFilleulManagerDurationMonths,
} from "@/lib/statistiques/filleul-manager-duration-stats";
import {
  computeFilleulParrainageDurationExerciceStats,
  formatFilleulParrainageDurationMonths,
} from "@/lib/statistiques/filleul-parrainage-duration-stats";
import {
  computeFilleulParrainagePerParraineurExerciceStats,
  formatFilleulParrainagePerParraineur,
} from "@/lib/statistiques/filleul-parrainage-per-parraineur-stats";
import {
  computeFilleulVaaDurationExerciceStats,
  formatFilleulVaaDurationMonths,
} from "@/lib/statistiques/filleul-vaa-duration-stats";
import {
  currentFiscalYearLabel,
  fiscalYearStartUnix,
  hasFiscalYearStarted,
  listSelectableFiscalYearLabels,
} from "@/lib/pipe/remuneration-fiscal-year";

export const FILLEUL_ORGANISATION_EXERCICE_SUMMARY_DEFAULT_COUNT = 5;

export { isLiveFilleulExerciceVolumes };

/** Volume organisation ÷ nombre de consultants net (effectif à la clôture). */
export function computeAverageOrganisationVolumePerConsultant(
  organisationBranchVolume: number | null | undefined,
  consultantNetCount: number
): number | null {
  if (
    organisationBranchVolume == null ||
    !Number.isFinite(organisationBranchVolume) ||
    consultantNetCount <= 0
  ) {
    return null;
  }
  return organisationBranchVolume / consultantNetCount;
}

export type FilleulOrganisationExerciceSummaryRow = {
  exerciceLabel: string;
  /** Consultants actifs sur l'exercice (non désinscrits avant la fin). */
  inscribedConsultantCount: number;
  /** Parrainages dont l'affiliation tombe dans l'exercice. */
  parrainageCount: number;
  organisationBranchVolume: number | null;
  averageVolume: number | null;
  /** Volume organisation ÷ nombre de consultants net. */
  averageVolumePerConsultant: number | null;
  activePercent: number;
  parraineurPercent: number;
  parrainagesPerParraineur: number | null;
  netGrowthPercent: number | null;
  attritionPercent: number;
  vaaDurationMonths: number | null;
  habilitationDurationMonths: number | null;
  managerDurationMonths: number | null;
  parrainageDurationMonths: number | null;
};

export type FilleulOrganisationExerciceSummaryOptions = {
  contacts: Contact[];
  /** Exercices réellement clôturés (closed_at) — détermine live vs historique. */
  closedExerciceLabels: string[];
  dossiersByContactId?: Map<number, FilleulDossier>;
  /** Contact « Moi » — aligné avec les panneaux KPI (ne dépend pas de cgp chargé). */
  organisationSelfContactId?: number | null;
  cgp?: Pick<CgpConfig, "nom" | "prenom">;
  historyRecordsByLabel: Map<string, FilleulVolumeExercice[]>;
  now?: Date;
};

/** Exercices commencés (courant, clôturés, sélectionnables) — récents en premier. */
export function buildFilleulOrganisationExerciceLabels(
  historyExerciceLabels: string[],
  now = new Date()
): string[] {
  const current = currentFiscalYearLabel(now);
  const labels = new Set<string>([current, ...historyExerciceLabels, ...listSelectableFiscalYearLabels(now)]);
  for (const label of listSelectableFiscalYearLabels(now)) {
    if (hasFiscalYearStarted(label, now)) {
      labels.add(label);
    }
  }
  return [...labels]
    .filter((label) => hasFiscalYearStarted(label, now))
    .sort((a, b) => {
      const aStart = fiscalYearStartUnix(a) ?? 0;
      const bStart = fiscalYearStartUnix(b) ?? 0;
      return bStart - aStart;
    });
}

/** Sous-ensemble des N exercices les plus récents, triés chronologiquement (ancien → récent). */
export function pickFilleulOrganisationExerciceLabelsForDisplay(
  allLabels: string[],
  showAll: boolean,
  maxRecent = FILLEUL_ORGANISATION_EXERCICE_SUMMARY_DEFAULT_COUNT
): string[] {
  const recentFirst = [...allLabels];
  const subset = showAll ? recentFirst : recentFirst.slice(0, maxRecent);
  return [...subset].sort((a, b) => {
    const aStart = fiscalYearStartUnix(a) ?? 0;
    const bStart = fiscalYearStartUnix(b) ?? 0;
    return aStart - bStart;
  });
}

export function resolveContactsForFilleulExercice(
  contacts: Contact[],
  exerciceLabel: string,
  closedExerciceLabels: string[],
  historyRecordsByLabel: Map<string, FilleulVolumeExercice[]>,
  now = new Date()
): Contact[] {
  if (
    !shouldUseHistoricalFilleulExerciceVolumes(
      exerciceLabel,
      closedExerciceLabels,
      historyRecordsByLabel,
      now
    )
  ) {
    return contacts;
  }
  const records = historyRecordsByLabel.get(exerciceLabel) ?? [];
  return applyExerciceVolumesToContacts(
    contacts,
    indexFilleulVolumeExercicesByContactId(records)
  );
}

export function computeOrganisationBranchVolumeForExercice(
  contacts: Contact[],
  exerciceLabel: string,
  closedExerciceLabels: string[],
  historyRecordsByLabel: Map<string, FilleulVolumeExercice[]>,
  cgp: Pick<CgpConfig, "nom" | "prenom">,
  dossiersByContactId: Map<number, FilleulDossier> | undefined,
  now = new Date()
): number {
  const contactsForExercice = resolveContactsForFilleulExercice(
    contacts,
    exerciceLabel,
    closedExerciceLabels,
    historyRecordsByLabel,
    now
  );
  const tree = buildOrganisationTree(contactsForExercice, cgp, {
    exerciceLabel,
    dossiersByContactId,
    hideDesinscrits: false,
  });
  const useHistorical = shouldUseHistoricalFilleulExerciceVolumes(
    exerciceLabel,
    closedExerciceLabels,
    historyRecordsByLabel,
    now
  );
  const rows = useHistorical
    ? buildOrganisationVolumeRowsForExercice(tree, contactsForExercice, {
        mode: "history",
        recordsByContactId: indexFilleulVolumeExercicesByContactId(
          historyRecordsByLabel.get(exerciceLabel) ?? []
        ),
      })
    : buildOrganisationVolumeRows(tree, contactsForExercice);
  const selfRow = rows.find((row) => row.generation === 0);
  return selfRow?.branchVolume ?? 0;
}

export function computeFilleulOrganisationExerciceSummaryRow(
  exerciceLabel: string,
  options: FilleulOrganisationExerciceSummaryOptions
): FilleulOrganisationExerciceSummaryRow {
  const {
    contacts,
    closedExerciceLabels,
    dossiersByContactId,
    organisationSelfContactId: organisationSelfContactIdOption,
    cgp = {},
    historyRecordsByLabel,
    now = new Date(),
  } = options;
  const organisationSelfContactId =
    organisationSelfContactIdOption ??
    resolveOrganisationSelfContact(contacts, cgp)?.id ??
    null;
  const statsOptions = { dossiersByContactId, organisationSelfContactId };
  const volumeResolvable = isFilleulExerciceVolumeResolvable(
    exerciceLabel,
    closedExerciceLabels,
    historyRecordsByLabel,
    now
  );
  const contactsForExercice = resolveContactsForFilleulExercice(
    contacts,
    exerciceLabel,
    closedExerciceLabels,
    historyRecordsByLabel,
    now
  );

  const volumeStats = volumeResolvable
    ? computeFilleulAverageVolumeExerciceStats(
        contactsForExercice,
        exerciceLabel,
        statsOptions
      )
    : EMPTY_FILLEUL_AVERAGE_VOLUME_STATS;
  const parraineurStats = computeFilleulParraineurExerciceStats(
    contactsForExercice,
    exerciceLabel,
    statsOptions
  );
  const parrainagePerParraineurStats = computeFilleulParrainagePerParraineurExerciceStats(
    contactsForExercice,
    exerciceLabel,
    statsOptions
  );
  const netGrowthStats = computeFilleulNetGrowthExerciceStats(
    contactsForExercice,
    exerciceLabel,
    statsOptions
  );
  const attritionStats = computeFilleulAttritionExerciceStats(
    contactsForExercice,
    exerciceLabel,
    statsOptions
  );
  const vaaStats = computeFilleulVaaDurationExerciceStats(
    contactsForExercice,
    exerciceLabel,
    statsOptions
  );
  const habilitationStats = computeFilleulHabilitationDurationExerciceStats(
    contactsForExercice,
    exerciceLabel,
    statsOptions
  );
  const managerDurationStats = computeFilleulManagerDurationExerciceStats(
    contactsForExercice,
    exerciceLabel,
    statsOptions
  );
  const parrainageDurationStats = computeFilleulParrainageDurationExerciceStats(
    contactsForExercice,
    exerciceLabel,
    statsOptions
  );
  const organisationBranchVolume = volumeResolvable
    ? computeOrganisationBranchVolumeForExercice(
        contacts,
        exerciceLabel,
        closedExerciceLabels,
        historyRecordsByLabel,
        cgp,
        dossiersByContactId,
        now
      )
    : null;

  return {
    exerciceLabel,
    inscribedConsultantCount: netGrowthStats.currentCount,
    parrainageCount: parrainagePerParraineurStats.totalParrainages,
    organisationBranchVolume,
    averageVolume: volumeStats.averageVolume,
    averageVolumePerConsultant: volumeResolvable
      ? computeAverageOrganisationVolumePerConsultant(
          organisationBranchVolume,
          netGrowthStats.currentCount
        )
      : null,
    activePercent: volumeStats.activePercent,
    parraineurPercent: parraineurStats.parraineurPercent,
    parrainagesPerParraineur: parrainagePerParraineurStats.averagePerParraineur,
    netGrowthPercent: netGrowthStats.growthPercent,
    attritionPercent: attritionStats.attritionPercent,
    vaaDurationMonths: vaaStats.averageMonths,
    habilitationDurationMonths: habilitationStats.averageMonths,
    managerDurationMonths: managerDurationStats.averageMonths,
    parrainageDurationMonths: parrainageDurationStats.averageMonths,
  };
}

export function computeFilleulOrganisationExerciceSummary(
  exerciceLabels: string[],
  options: FilleulOrganisationExerciceSummaryOptions
): FilleulOrganisationExerciceSummaryRow[] {
  return exerciceLabels.map((label) =>
    computeFilleulOrganisationExerciceSummaryRow(label, options)
  );
}

export type FilleulOrganisationExerciceSummaryMetricId =
  | "inscribedConsultantCount"
  | "parrainageCount"
  | "organisationBranchVolume"
  | "averageVolume"
  | "averageVolumePerConsultant"
  | "activePercent"
  | "parraineurPercent"
  | "parrainagesPerParraineur"
  | "netGrowthPercent"
  | "attritionPercent"
  | "vaaDurationMonths"
  | "habilitationDurationMonths"
  | "managerDurationMonths"
  | "parrainageDurationMonths";

export type FilleulOrganisationExerciceSummaryMetric = {
  id: FilleulOrganisationExerciceSummaryMetricId;
  label: string;
  format: (row: FilleulOrganisationExerciceSummaryRow) => string;
};

export const FILLEUL_ORGANISATION_EXERCICE_SUMMARY_METRICS: FilleulOrganisationExerciceSummaryMetric[] =
  [
    {
      id: "inscribedConsultantCount",
      label: "Nombre de consultant net",
      format: (row) => formatConsultantCount(row.inscribedConsultantCount),
    },
    {
      id: "parrainageCount",
      label: "Nombre de parrainages",
      format: (row) => formatConsultantCount(row.parrainageCount),
    },
    {
      id: "organisationBranchVolume",
      label: "Volume organisation",
      format: (row) =>
        row.organisationBranchVolume != null
          ? formatFilleulVolumeDisplayWhole(row.organisationBranchVolume)
          : "—",
    },
    {
      id: "averageVolume",
      label: "Volume moyen (actifs)",
      format: (row) =>
        row.averageVolume != null ? formatFilleulVolumeDisplayWhole(row.averageVolume) : "—",
    },
    {
      id: "averageVolumePerConsultant",
      label: "Volume moyen / consultant",
      format: (row) =>
        row.averageVolumePerConsultant != null
          ? formatFilleulVolumeDisplayWhole(row.averageVolumePerConsultant)
          : "—",
    },
    {
      id: "activePercent",
      label: "Taux d'actifs",
      format: (row) => formatFilleulManagerPercent(row.activePercent),
    },
    {
      id: "parraineurPercent",
      label: "Taux de parraineurs",
      format: (row) => formatFilleulManagerPercent(row.parraineurPercent),
    },
    {
      id: "parrainagesPerParraineur",
      label: "Parrainages / parraineur",
      format: (row) =>
        row.parrainagesPerParraineur != null
          ? formatFilleulParrainagePerParraineur(row.parrainagesPerParraineur)
          : "—",
    },
    {
      id: "netGrowthPercent",
      label: "Croissance nette",
      format: (row) =>
        row.netGrowthPercent != null
          ? formatSignedPercent(row.netGrowthPercent)
          : "—",
    },
    {
      id: "attritionPercent",
      label: "Attrition",
      format: (row) => formatFilleulManagerPercent(row.attritionPercent),
    },
    {
      id: "vaaDurationMonths",
      label: "Délai VAA",
      format: (row) =>
        row.vaaDurationMonths != null
          ? formatFilleulVaaDurationMonths(row.vaaDurationMonths)
          : "—",
    },
    {
      id: "habilitationDurationMonths",
      label: "Délai habilitation",
      format: (row) =>
        row.habilitationDurationMonths != null
          ? formatFilleulHabilitationDurationMonths(row.habilitationDurationMonths)
          : "—",
    },
    {
      id: "managerDurationMonths",
      label: "Délai Manager",
      format: (row) =>
        row.managerDurationMonths != null
          ? formatFilleulManagerDurationMonths(row.managerDurationMonths)
          : "—",
    },
    {
      id: "parrainageDurationMonths",
      label: "Délai 1er parrainage",
      format: (row) =>
        row.parrainageDurationMonths != null
          ? formatFilleulParrainageDurationMonths(row.parrainageDurationMonths)
          : "—",
    },
  ];

function formatConsultantCount(value: number): string {
  return value.toLocaleString("fr-FR");
}

function formatSignedPercent(value: number): string {
  const abs = formatFilleulManagerPercent(Math.abs(value));
  if (value > 0) return `+${abs}`;
  if (value < 0) return `−${abs.replace(" %", "")} %`;
  return abs;
}
