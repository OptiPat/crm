import { getSetting, setSetting } from "@/lib/api/tauri-settings";
import {
  EMPTY_JD_FUNNEL_COUNTS,
  type JdFunnelCounts,
} from "@/lib/statistiques/organisation-jd-funnel-tracker";

export type JdFunnelTrackerState = {
  trackedExerciceLabel?: string;
  countsByExercice: Record<string, JdFunnelCounts>;
  savedAt: number;
};

export const JD_FUNNEL_TRACKER_SETTING_KEY = "organisation_jd_funnel_tracker";

const LEGACY_STORAGE_KEY = "crm_organisation_jd_funnel_tracker_v1";

function normalizeCounts(raw: unknown): JdFunnelCounts | null {
  if (raw == null || typeof raw !== "object" || Array.isArray(raw)) return null;
  const source = raw as Record<string, unknown>;
  const confirmations = source.confirmations;
  const presences = source.presences;
  const parrainages = source.parrainages;
  if (
    typeof confirmations !== "number" ||
    !Number.isFinite(confirmations) ||
    typeof presences !== "number" ||
    !Number.isFinite(presences) ||
    typeof parrainages !== "number" ||
    !Number.isFinite(parrainages)
  ) {
    return null;
  }
  return {
    confirmations: Math.max(0, Math.round(confirmations)),
    presences: Math.max(0, Math.round(presences)),
    parrainages: Math.max(0, Math.round(parrainages)),
  };
}

export function emptyJdFunnelTrackerState(now = Date.now()): JdFunnelTrackerState {
  return {
    countsByExercice: {},
    savedAt: now,
  };
}

export function normalizeJdFunnelTrackerState(raw: unknown): JdFunnelTrackerState | null {
  if (raw == null || typeof raw !== "object" || Array.isArray(raw)) return null;
  const source = raw as Record<string, unknown>;
  const countsByExercice: Record<string, JdFunnelCounts> = {};
  const rawCounts = source.countsByExercice;
  if (rawCounts != null && typeof rawCounts === "object" && !Array.isArray(rawCounts)) {
    for (const [label, value] of Object.entries(rawCounts as Record<string, unknown>)) {
      const counts = normalizeCounts(value);
      if (counts) countsByExercice[label] = counts;
    }
  }
  const trackedExerciceLabel = source.trackedExerciceLabel;
  const savedAt = source.savedAt;
  return {
    trackedExerciceLabel:
      typeof trackedExerciceLabel === "string" && trackedExerciceLabel.trim() !== ""
        ? trackedExerciceLabel
        : undefined,
    countsByExercice,
    savedAt: typeof savedAt === "number" && Number.isFinite(savedAt) ? savedAt : Date.now(),
  };
}

function readLegacyLocalStorageState(): JdFunnelTrackerState | null {
  if (typeof localStorage === "undefined") return null;
  try {
    const raw = localStorage.getItem(LEGACY_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as {
      targetExerciceLabel?: unknown;
      countsByExercice?: unknown;
    };
    return normalizeJdFunnelTrackerState({
      trackedExerciceLabel: parsed.targetExerciceLabel,
      countsByExercice: parsed.countsByExercice,
      savedAt: Date.now(),
    });
  } catch {
    return null;
  }
}

export function clearLegacyJdFunnelTrackerLocalStorage(): void {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.removeItem(LEGACY_STORAGE_KEY);
  } catch {
    /* ignore */
  }
}

export async function loadJdFunnelTrackerState(): Promise<JdFunnelTrackerState> {
  const raw = await getSetting(JD_FUNNEL_TRACKER_SETTING_KEY);
  if (raw) {
    try {
      const parsed = normalizeJdFunnelTrackerState(JSON.parse(raw));
      if (parsed) return parsed;
    } catch {
      /* fallback below */
    }
  }

  const legacy = readLegacyLocalStorageState();
  if (legacy) {
    await saveJdFunnelTrackerState(legacy);
    clearLegacyJdFunnelTrackerLocalStorage();
    return legacy;
  }

  return emptyJdFunnelTrackerState();
}

export async function saveJdFunnelTrackerState(state: JdFunnelTrackerState): Promise<void> {
  await setSetting(JD_FUNNEL_TRACKER_SETTING_KEY, JSON.stringify(state));
}

export function getJdFunnelCountsForExercice(
  state: JdFunnelTrackerState,
  exerciceLabel: string
): JdFunnelCounts {
  return state.countsByExercice[exerciceLabel] ?? EMPTY_JD_FUNNEL_COUNTS;
}

export function setJdFunnelCountsForExercice(
  state: JdFunnelTrackerState,
  exerciceLabel: string,
  counts: JdFunnelCounts
): JdFunnelTrackerState {
  return {
    ...state,
    countsByExercice: { ...state.countsByExercice, [exerciceLabel]: counts },
  };
}

export function setJdFunnelTrackedExerciceLabel(
  state: JdFunnelTrackerState,
  exerciceLabel: string
): JdFunnelTrackerState {
  return { ...state, trackedExerciceLabel: exerciceLabel };
}

export function jdFunnelTrackerStatesEqual(
  a: JdFunnelTrackerState | null,
  b: JdFunnelTrackerState | null
): boolean {
  if (a == null || b == null) return a === b;
  return JSON.stringify(a) === JSON.stringify(b);
}
