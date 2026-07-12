import { invoke } from "@tauri-apps/api/core";

export interface AppRuntimePrefs {
  close_to_tray: boolean;
  launch_at_startup: boolean;
  background_automations: boolean;
  background_relation_sync: boolean;
  background_stellium_scan: boolean;
  background_notes_sync: boolean;
  background_pipe_rdv_reminders: boolean;
  background_birthday_notifications: boolean;
}

export const DEFAULT_APP_RUNTIME_PREFS: AppRuntimePrefs = {
  close_to_tray: true,
  launch_at_startup: false,
  background_automations: true,
  background_relation_sync: true,
  background_stellium_scan: true,
  background_notes_sync: true,
  background_pipe_rdv_reminders: true,
  background_birthday_notifications: true,
};

type LegacyAppRuntimePrefs = Partial<AppRuntimePrefs> & {
  background_birthday_telegram?: boolean;
};

export function normalizeAppRuntimePrefs(partial: LegacyAppRuntimePrefs): AppRuntimePrefs {
  const merged = { ...DEFAULT_APP_RUNTIME_PREFS, ...partial };
  if (
    partial.background_birthday_notifications === undefined &&
    partial.background_birthday_telegram !== undefined
  ) {
    merged.background_birthday_notifications = partial.background_birthday_telegram;
  }
  return merged;
}

export function trayAutomationTickEnabled(prefs: AppRuntimePrefs): boolean {
  if (!prefs.background_automations) return false;
  return (
    prefs.background_relation_sync ||
    prefs.background_stellium_scan ||
    prefs.background_notes_sync ||
    prefs.background_pipe_rdv_reminders ||
    prefs.background_birthday_notifications
  );
}

export async function getAppRuntimePrefs(): Promise<AppRuntimePrefs> {
  return normalizeAppRuntimePrefs(
    await invoke<LegacyAppRuntimePrefs>("get_app_runtime_prefs")
  );
}

export async function saveAppRuntimePrefs(prefs: AppRuntimePrefs): Promise<void> {
  await invoke<void>("save_app_runtime_prefs", { prefs });
}

export async function quitAppFully(): Promise<void> {
  await invoke<void>("quit_app_fully_cmd");
}
