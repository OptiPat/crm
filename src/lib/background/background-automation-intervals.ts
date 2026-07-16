import type { AppRuntimePrefs } from "@/lib/api/tauri-app-runtime";

export const RELATION_INTERVAL_MS = 15 * 60_000;
export const STELLIUM_INTERVAL_MS = 15 * 60_000;
export const BOX_PLACEMENT_INTERVAL_MS = 15 * 60_000;
export const BIRTHDAY_INTERVAL_MS = 60 * 60_000;
export const TRAY_DIGEST_INTERVAL_MS = 60 * 60_000;
export const RELATION_COOLDOWN_MS = 90_000;
export const MAIL_SCAN_COOLDOWN_MS = 90_000;
export const MAIL_UNAVAILABLE_RETRY_MS = 5 * 60_000;
/** @deprecated utiliser MAIL_SCAN_COOLDOWN_MS */
export const STELLIUM_COOLDOWN_MS = MAIL_SCAN_COOLDOWN_MS;
export const BIRTHDAY_COOLDOWN_MS = 30 * 60_000;
export const BIRTHDAY_VISIBLE_DEFER_MS = 30 * 60_000;
export const WAKE_DEBOUNCE_MS = 300;
/** Minimum entre deux cycles déclenchés par focus / retour fenêtre. */
export const WAKE_MIN_INTERVAL_MS = 60_000;
/** Tick foreground : vérifie les intervalles configurables (relation, Stellium, etc.). */
export const FOREGROUND_POLL_MS = 60_000;

export const RELATION_INTERVAL_OPTIONS_MIN = [3, 5, 15, 30, 45, 60, 120, 180] as const;
export type RelationIntervalMinutes = (typeof RELATION_INTERVAL_OPTIONS_MIN)[number];

/** 0 = scan manuel uniquement (Exceltis ou Box Placement). */
export const MAIL_SCAN_INTERVAL_OPTIONS_MIN = [0, 3, 5, 15, 30, 45, 60, 120, 180] as const;
export type MailScanIntervalMinutes = (typeof MAIL_SCAN_INTERVAL_OPTIONS_MIN)[number];

/** @deprecated alias — préférer MAIL_SCAN_INTERVAL_OPTIONS_MIN */
export const STELLIUM_INTERVAL_OPTIONS_MIN = MAIL_SCAN_INTERVAL_OPTIONS_MIN;
export type StelliumIntervalMinutes = MailScanIntervalMinutes;

export const BOX_PLACEMENT_INTERVAL_OPTIONS_MIN = MAIL_SCAN_INTERVAL_OPTIONS_MIN;
export type BoxPlacementIntervalMinutes = MailScanIntervalMinutes;

export type BackgroundAutomationJob =
  | "relation"
  | "stellium"
  | "box_placement"
  | "pipe_rdv"
  | "birthdays"
  | "tray_digest";

const BACKGROUND_AUTOMATION_JOBS: readonly BackgroundAutomationJob[] = [
  "relation",
  "stellium",
  "box_placement",
  "pipe_rdv",
  "birthdays",
  "tray_digest",
];

export function isBackgroundAutomationJob(value: string): value is BackgroundAutomationJob {
  return (BACKGROUND_AUTOMATION_JOBS as readonly string[]).includes(value);
}

export const JOB_INTERVAL_MS: Record<BackgroundAutomationJob, number> = {
  relation: RELATION_INTERVAL_MS,
  stellium: STELLIUM_INTERVAL_MS,
  box_placement: BOX_PLACEMENT_INTERVAL_MS,
  pipe_rdv: RELATION_INTERVAL_MS,
  birthdays: BIRTHDAY_INTERVAL_MS,
  tray_digest: TRAY_DIGEST_INTERVAL_MS,
};

export const JOB_COOLDOWN_MS: Partial<Record<BackgroundAutomationJob, number>> = {
  relation: RELATION_COOLDOWN_MS,
  stellium: MAIL_SCAN_COOLDOWN_MS,
  box_placement: MAIL_SCAN_COOLDOWN_MS,
  birthdays: BIRTHDAY_COOLDOWN_MS,
};

export function normalizeRelationIntervalMinutes(value: unknown): RelationIntervalMinutes {
  const n = typeof value === "number" ? value : 15;
  if ((RELATION_INTERVAL_OPTIONS_MIN as readonly number[]).includes(n)) {
    return n as RelationIntervalMinutes;
  }
  if (n === 10) return 15;
  return 15;
}

function normalizeMailScanIntervalMinutes(
  value: unknown,
  fallback: MailScanIntervalMinutes = 15
): MailScanIntervalMinutes {
  const n = typeof value === "number" ? value : fallback;
  if ((MAIL_SCAN_INTERVAL_OPTIONS_MIN as readonly number[]).includes(n)) {
    return n as MailScanIntervalMinutes;
  }
  return fallback;
}

export function normalizeStelliumIntervalMinutes(value: unknown): MailScanIntervalMinutes {
  return normalizeMailScanIntervalMinutes(value, 15);
}

export function normalizeBoxPlacementIntervalMinutes(value: unknown): MailScanIntervalMinutes {
  return normalizeMailScanIntervalMinutes(value, 15);
}

export function stelliumAutoScanEnabled(prefs: AppRuntimePrefs): boolean {
  return normalizeStelliumIntervalMinutes(prefs.stellium_interval_minutes) > 0;
}

export function boxPlacementAutoScanEnabled(prefs: AppRuntimePrefs): boolean {
  return normalizeBoxPlacementIntervalMinutes(prefs.box_placement_interval_minutes) > 0;
}

export function getRelationIntervalMs(prefs: AppRuntimePrefs): number {
  return normalizeRelationIntervalMinutes(prefs.relation_interval_minutes) * 60_000;
}

function mailScanIntervalMs(mins: MailScanIntervalMinutes): number {
  if (mins === 0) return Number.MAX_SAFE_INTEGER;
  return mins * 60_000;
}

export function getStelliumIntervalMs(prefs: AppRuntimePrefs): number {
  return mailScanIntervalMs(normalizeStelliumIntervalMinutes(prefs.stellium_interval_minutes));
}

export function getBoxPlacementIntervalMs(prefs: AppRuntimePrefs): number {
  return mailScanIntervalMs(
    normalizeBoxPlacementIntervalMinutes(prefs.box_placement_interval_minutes)
  );
}

export function formatMailScanIntervalLabel(
  mins: MailScanIntervalMinutes,
  defaultMinutes: MailScanIntervalMinutes = 15
): string {
  if (mins === 0) return "Manuel uniquement";
  if (mins >= 60) {
    return `${mins / 60} h`;
  }
  return `${mins} min${mins === defaultMinutes ? " (défaut)" : ""}`;
}

/** @deprecated utiliser formatMailScanIntervalLabel */
export function formatStelliumIntervalLabel(mins: MailScanIntervalMinutes): string {
  return formatMailScanIntervalLabel(mins, 15);
}

export function formatRelationIntervalLabel(mins: RelationIntervalMinutes): string {
  if (mins < 60) {
    return `${mins} min${mins === 15 ? " (défaut)" : ""}`;
  }
  return `${mins / 60} h`;
}

export function getJobIntervalMs(
  prefs: AppRuntimePrefs,
  job: BackgroundAutomationJob
): number {
  switch (job) {
    case "relation":
    case "pipe_rdv":
      return getRelationIntervalMs(prefs);
    case "stellium":
      return getStelliumIntervalMs(prefs);
    case "box_placement":
      return getBoxPlacementIntervalMs(prefs);
    default:
      return JOB_INTERVAL_MS[job];
  }
}
