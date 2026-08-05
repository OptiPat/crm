import type { Contact } from "@/lib/api/tauri-contacts";
import type { FilleulDossier } from "@/lib/api/tauri-filleul-dossier";
import type { FilleulVolumeExercice } from "@/lib/api/tauri-filleul-volumes";
import { contactOwnVolume } from "@/lib/organisation/organisation-branch-volumes";
import { previousFiscalYearLabel } from "@/lib/pipe/remuneration-fiscal-year";
import { resolveContactsForFilleulExercice } from "@/lib/statistiques/filleul-organisation-exercice-summary";
import { computeFilleulAttritionExerciceStats } from "@/lib/statistiques/contact-attrition-stats";
import {
  computeFilleulAverageVolumeExerciceStats,
  computeFilleulParraineurExerciceStats,
} from "@/lib/statistiques/contact-filleul-organisation-stats";
import { computeFilleulNetGrowthExerciceStats } from "@/lib/statistiques/filleul-net-growth-stats";

export type OrganisationObjectifObservedStats = {
  /** Exercice source des valeurs observées (n-1 par rapport à l'exercice objectif). */
  exerciceLabel: string | null;
  targetGrowthPercent: number | null;
  attritionPercent: number | null;
  teamActiveRatePercent: number | null;
  sponsorsRatePercent: number | null;
  personalVolume: number | null;
  teamAverageVolume: number | null;
};

export type OrganisationObjectifObservedStatsOptions = {
  closedExerciceLabels: string[];
  dossiersByContactId?: Map<number, FilleulDossier>;
  organisationSelfContactId?: number | null;
  historyRecordsByLabel: Map<string, FilleulVolumeExercice[]>;
};

function roundRatePercent(value: number): number {
  return Math.round(value * 10) / 10;
}

/**
 * Stats « observées » pour le tableau d'objectifs : toujours l'exercice n-1 par rapport à
 * l'exercice pour lequel on fixe l'objectif (ex. objectif 2026-2027 → obs. = stats 2025-2026).
 */
export function computeOrganisationObjectifObservedStats(
  contacts: Contact[],
  objectifExerciceLabel: string,
  options: OrganisationObjectifObservedStatsOptions
): OrganisationObjectifObservedStats {
  const observedExerciceLabel = previousFiscalYearLabel(objectifExerciceLabel);
  if (observedExerciceLabel == null) {
    return {
      exerciceLabel: null,
      targetGrowthPercent: null,
      attritionPercent: null,
      teamActiveRatePercent: null,
      sponsorsRatePercent: null,
      personalVolume: null,
      teamAverageVolume: null,
    };
  }

  const statsOptions = {
    dossiersByContactId: options.dossiersByContactId,
    organisationSelfContactId: options.organisationSelfContactId,
  };
  const contactsForObservedExercice = resolveContactsForFilleulExercice(
    contacts,
    observedExerciceLabel,
    options.closedExerciceLabels,
    options.historyRecordsByLabel
  );

  const netGrowthStats = computeFilleulNetGrowthExerciceStats(
    contactsForObservedExercice,
    observedExerciceLabel,
    statsOptions
  );
  const attritionStats = computeFilleulAttritionExerciceStats(
    contactsForObservedExercice,
    observedExerciceLabel,
    statsOptions
  );

  const survivorsIds = new Set(netGrowthStats.currentContactIds);
  const survivorsContacts = contactsForObservedExercice.filter(
    (contact) => contact.id != null && survivorsIds.has(contact.id)
  );
  const survivorsTeamOnlyContacts =
    options.organisationSelfContactId == null
      ? survivorsContacts
      : survivorsContacts.filter((contact) => contact.id !== options.organisationSelfContactId);

  const survivorsParraineurStats = computeFilleulParraineurExerciceStats(
    survivorsContacts,
    observedExerciceLabel,
    statsOptions
  );
  const survivorsTeamOnlyVolumeStats = computeFilleulAverageVolumeExerciceStats(
    survivorsTeamOnlyContacts,
    observedExerciceLabel,
    statsOptions
  );

  const selfContact =
    options.organisationSelfContactId == null
      ? null
      : contactsForObservedExercice.find((contact) => contact.id === options.organisationSelfContactId) ??
        null;

  return {
    exerciceLabel: observedExerciceLabel,
    targetGrowthPercent:
      netGrowthStats.growthPercent != null ? roundRatePercent(netGrowthStats.growthPercent) : null,
    attritionPercent:
      attritionStats.totalCount > 0 ? roundRatePercent(attritionStats.attritionPercent) : null,
    teamActiveRatePercent:
      survivorsTeamOnlyVolumeStats.totalEligible > 0
        ? roundRatePercent(survivorsTeamOnlyVolumeStats.activePercent)
        : null,
    sponsorsRatePercent:
      survivorsParraineurStats.totalCount > 0
        ? roundRatePercent(survivorsParraineurStats.parraineurPercent)
        : null,
    personalVolume: selfContact != null ? Math.round(contactOwnVolume(selfContact)) : null,
    teamAverageVolume:
      survivorsTeamOnlyVolumeStats.averageVolume != null
        ? Math.round(survivorsTeamOnlyVolumeStats.averageVolume)
        : null,
  };
}
