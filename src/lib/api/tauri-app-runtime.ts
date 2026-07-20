import { invoke } from "@tauri-apps/api/core";
import {
  normalizeBoxPlacementIntervalMinutes,
  normalizeRelationIntervalMinutes,
  normalizeStelliumIntervalMinutes,
} from "@/lib/background/background-automation-intervals";

export interface AppRuntimePrefs {
  close_to_tray: boolean;
  launch_at_startup: boolean;
  /** Verrouillage de l'interface après inactivité. 0 = désactivé. */
  auto_lock_minutes: number;
  background_automations: boolean;
  background_relation_sync: boolean;
  /** Scan Stellium Exceltis (remboursements) en tray. */
  background_stellium_scan: boolean;
  /** Scan Box Placement en tray. */
  background_box_placement_scan: boolean;
  /** @deprecated sync notes tray retirée — conservé pour lecture runtime_prefs.json */
  background_notes_sync: boolean;
  background_pipe_rdv_reminders: boolean;
  background_birthday_notifications: boolean;
  background_tray_digest: boolean;
  /** Sync auto quand la fenêtre CRM est visible (timers + retour focus). */
  foreground_automations: boolean;
  /** Intervalle sync mail campagnes / pipe RDV (minutes). */
  relation_interval_minutes: number;
  /** Intervalle scan Stellium Exceltis (minutes). 0 = manuel uniquement. */
  stellium_interval_minutes: number;
  /** Intervalle scan Box Placement (minutes). 0 = manuel uniquement. */
  box_placement_interval_minutes: number;
  /** Dossier synchronisé utilisé pour l'archive externe quotidienne. */
  external_backup_directory: string | null;
}

export const DEFAULT_APP_RUNTIME_PREFS: AppRuntimePrefs = {
  close_to_tray: true,
  launch_at_startup: false,
  auto_lock_minutes: 15,
  background_automations: true,
  background_relation_sync: true,
  background_stellium_scan: true,
  background_box_placement_scan: true,
  background_notes_sync: false,
  background_pipe_rdv_reminders: true,
  background_birthday_notifications: true,
  background_tray_digest: true,
  foreground_automations: true,
  relation_interval_minutes: 15,
  stellium_interval_minutes: 15,
  box_placement_interval_minutes: 15,
  external_backup_directory: null,
};

export const APP_RUNTIME_PREFS_CHANGED_EVENT = "crm-runtime-prefs-changed";
export const AUTO_LOCK_OPTIONS_MIN = [0, 5, 15, 30] as const;

type LegacyAppRuntimePrefs = Partial<AppRuntimePrefs> & {
  background_birthday_telegram?: boolean;
};

export function normalizeAppRuntimePrefs(partial: LegacyAppRuntimePrefs): AppRuntimePrefs {
  const merged = { ...DEFAULT_APP_RUNTIME_PREFS, ...partial };
  if (!AUTO_LOCK_OPTIONS_MIN.includes(merged.auto_lock_minutes as 0 | 5 | 15 | 30)) {
    merged.auto_lock_minutes = DEFAULT_APP_RUNTIME_PREFS.auto_lock_minutes;
  }
  if (
    partial.background_birthday_notifications === undefined &&
    partial.background_birthday_telegram !== undefined
  ) {
    merged.background_birthday_notifications = partial.background_birthday_telegram;
  }
  if (partial.background_box_placement_scan === undefined) {
    merged.background_box_placement_scan = merged.background_stellium_scan;
  }
  merged.relation_interval_minutes = normalizeRelationIntervalMinutes(
    merged.relation_interval_minutes
  );
  merged.stellium_interval_minutes = normalizeStelliumIntervalMinutes(
    merged.stellium_interval_minutes
  );
  if (partial.box_placement_interval_minutes === undefined) {
    merged.box_placement_interval_minutes = normalizeBoxPlacementIntervalMinutes(
      merged.stellium_interval_minutes
    );
  } else {
    merged.box_placement_interval_minutes = normalizeBoxPlacementIntervalMinutes(
      merged.box_placement_interval_minutes
    );
  }
  return merged;
}

export function trayAutomationTickEnabled(prefs: AppRuntimePrefs): boolean {
  if (!prefs.background_automations) return false;
  return (
    prefs.background_relation_sync ||
    prefs.background_stellium_scan ||
    prefs.background_box_placement_scan ||
    prefs.background_pipe_rdv_reminders ||
    prefs.background_birthday_notifications ||
    prefs.background_tray_digest
  );
}

export async function getAppRuntimePrefs(): Promise<AppRuntimePrefs> {
  return normalizeAppRuntimePrefs(
    await invoke<LegacyAppRuntimePrefs>("get_app_runtime_prefs")
  );
}

export async function saveAppRuntimePrefs(
  prefs: AppRuntimePrefs
): Promise<AppRuntimePrefs> {
  const saved = normalizeAppRuntimePrefs(
    await invoke<LegacyAppRuntimePrefs>("save_app_runtime_prefs", { prefs })
  );
  notifyRuntimePrefsChanged(saved);
  return saved;
}

export async function saveAutoLockMinutes(minutes: number): Promise<AppRuntimePrefs> {
  const saved = normalizeAppRuntimePrefs(
    await invoke<LegacyAppRuntimePrefs>("save_auto_lock_minutes", { minutes })
  );
  notifyRuntimePrefsChanged(saved);
  return saved;
}

export function notifyRuntimePrefsChanged(saved: AppRuntimePrefs): void {
  if (typeof window !== "undefined") {
    window.dispatchEvent(
      new CustomEvent<AppRuntimePrefs>(APP_RUNTIME_PREFS_CHANGED_EVENT, { detail: saved })
    );
  }
}

export async function quitAppFully(): Promise<void> {
  await invoke<void>("quit_app_fully_cmd");
}
