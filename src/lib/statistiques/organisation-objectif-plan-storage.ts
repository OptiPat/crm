import { getSetting, setSetting } from "@/lib/api/tauri-settings";
import { currentFiscalYearLabel } from "@/lib/pipe/remuneration-fiscal-year";
import type { YearlyGrowthLevers } from "@/lib/statistiques/organisation-growth-projection";

/**
 * Hypothèses personnalisées du tableau d'objectifs — une clé absente = suivi automatique
 * de la valeur observée (cf. bouton réinitialiser sur chaque champ).
 */
export type OrganisationObjectifTablePrefs = {
  targetGrowthPercent?: number;
  attritionPercent?: number;
  targetPersonalVolume?: number;
  targetTeamAverageVolume?: number;
  targetTeamActiveRatePercent?: number;
  targetSponsorsRatePercent?: number;
  jdPresenceToRecruitRatePercent?: number;
  jdConfirmationToPresenceRatePercent?: number;
};

export type OrganisationObjectifPlan = {
  tablePrefs: OrganisationObjectifTablePrefs;
  /** Surcharges année 2–5 de la projection (clés 1-based). */
  projectionOverridesByYear: Record<number, Partial<YearlyGrowthLevers>>;
  savedAt: number;
};

export const ORGANISATION_OBJECTIF_PLAN_SETTING_PREFIX = "organisation_objectif_plan:";

const LEGACY_TABLE_STORAGE_KEY = "crm_organisation_objectif_table_v1";
const LEGACY_PROJECTION_STORAGE_KEY = "crm_organisation_growth_projection_v1";

export function organisationObjectifPlanSettingKey(exerciceLabel: string): string {
  return `${ORGANISATION_OBJECTIF_PLAN_SETTING_PREFIX}${exerciceLabel}`;
}

export function emptyOrganisationObjectifPlan(now = Date.now()): OrganisationObjectifPlan {
  return {
    tablePrefs: {},
    projectionOverridesByYear: {},
    savedAt: now,
  };
}

export function mergeOrganisationObjectifTablePrefs(
  current: OrganisationObjectifTablePrefs,
  update: Partial<Record<keyof OrganisationObjectifTablePrefs, number | undefined>>
): OrganisationObjectifTablePrefs {
  const next: OrganisationObjectifTablePrefs = { ...current };
  for (const key of Object.keys(update) as (keyof OrganisationObjectifTablePrefs)[]) {
    const value = update[key];
    if (value === undefined) {
      delete next[key];
    } else {
      next[key] = value;
    }
  }
  return next;
}

function normalizeProjectionOverrides(
  raw: unknown
): Record<number, Partial<YearlyGrowthLevers>> {
  if (raw == null || typeof raw !== "object" || Array.isArray(raw)) return {};
  const result: Record<number, Partial<YearlyGrowthLevers>> = {};
  for (const [yearKey, value] of Object.entries(raw as Record<string, unknown>)) {
    const year = Number(yearKey);
    if (!Number.isFinite(year) || year < 2 || value == null || typeof value !== "object" || Array.isArray(value)) {
      continue;
    }
    result[year] = value as Partial<YearlyGrowthLevers>;
  }
  return result;
}

function normalizeTablePrefs(raw: unknown): OrganisationObjectifTablePrefs {
  if (raw == null || typeof raw !== "object" || Array.isArray(raw)) return {};
  const source = raw as Record<string, unknown>;
  const next: OrganisationObjectifTablePrefs = {};
  const keys: (keyof OrganisationObjectifTablePrefs)[] = [
    "targetGrowthPercent",
    "attritionPercent",
    "targetPersonalVolume",
    "targetTeamAverageVolume",
    "targetTeamActiveRatePercent",
    "targetSponsorsRatePercent",
    "jdPresenceToRecruitRatePercent",
    "jdConfirmationToPresenceRatePercent",
  ];
  for (const key of keys) {
    const value = source[key];
    if (typeof value === "number" && Number.isFinite(value)) {
      next[key] = value;
    }
  }
  return next;
}

export function normalizeOrganisationObjectifPlan(raw: unknown): OrganisationObjectifPlan | null {
  if (raw == null || typeof raw !== "object" || Array.isArray(raw)) return null;
  const source = raw as Record<string, unknown>;
  const savedAt = source.savedAt;
  return {
    tablePrefs: normalizeTablePrefs(source.tablePrefs),
    projectionOverridesByYear: normalizeProjectionOverrides(source.projectionOverridesByYear),
    savedAt: typeof savedAt === "number" && Number.isFinite(savedAt) ? savedAt : Date.now(),
  };
}

function readLegacyLocalStoragePlan(): OrganisationObjectifPlan | null {
  if (typeof localStorage === "undefined") return null;

  let hasLegacy = false;
  let tablePrefs: OrganisationObjectifTablePrefs = {};
  let projectionOverridesByYear: Record<number, Partial<YearlyGrowthLevers>> = {};

  try {
    const tableRaw = localStorage.getItem(LEGACY_TABLE_STORAGE_KEY);
    if (tableRaw) {
      tablePrefs = normalizeTablePrefs(JSON.parse(tableRaw));
      hasLegacy = true;
    }
  } catch {
    /* ignore */
  }

  try {
    const projectionRaw = localStorage.getItem(LEGACY_PROJECTION_STORAGE_KEY);
    if (projectionRaw) {
      const parsed = JSON.parse(projectionRaw) as { overridesByYear?: unknown };
      projectionOverridesByYear = normalizeProjectionOverrides(parsed.overridesByYear);
      hasLegacy = true;
    }
  } catch {
    /* ignore */
  }

  if (!hasLegacy) return null;
  return {
    tablePrefs,
    projectionOverridesByYear,
    savedAt: Date.now(),
  };
}

export function clearLegacyOrganisationObjectifLocalStorage(): void {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.removeItem(LEGACY_TABLE_STORAGE_KEY);
    localStorage.removeItem(LEGACY_PROJECTION_STORAGE_KEY);
  } catch {
    /* ignore */
  }
}

export async function loadOrganisationObjectifPlan(
  exerciceLabel: string,
  now = new Date()
): Promise<OrganisationObjectifPlan> {
  const raw = await getSetting(organisationObjectifPlanSettingKey(exerciceLabel));
  if (raw) {
    try {
      const parsed = normalizeOrganisationObjectifPlan(JSON.parse(raw));
      if (parsed) return parsed;
    } catch {
      /* fallback below */
    }
  }

  const legacy = readLegacyLocalStoragePlan();
  if (legacy && exerciceLabel === currentFiscalYearLabel(now)) {
    await saveOrganisationObjectifPlan(exerciceLabel, legacy);
    clearLegacyOrganisationObjectifLocalStorage();
    return legacy;
  }

  return emptyOrganisationObjectifPlan();
}

export async function saveOrganisationObjectifPlan(
  exerciceLabel: string,
  plan: OrganisationObjectifPlan
): Promise<void> {
  await setSetting(organisationObjectifPlanSettingKey(exerciceLabel), JSON.stringify(plan));
}

export function formatOrganisationObjectifPlanSavedAt(savedAt: number): string {
  return new Intl.DateTimeFormat("fr-FR", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(savedAt));
}
