import { invoke } from "@tauri-apps/api/core";

export interface AppRuntimePrefs {
  close_to_tray: boolean;
  launch_at_startup: boolean;
  background_pipe_rdv_reminders: boolean;
}

export const DEFAULT_APP_RUNTIME_PREFS: AppRuntimePrefs = {
  close_to_tray: true,
  launch_at_startup: false,
  background_pipe_rdv_reminders: true,
};

export async function getAppRuntimePrefs(): Promise<AppRuntimePrefs> {
  return invoke<AppRuntimePrefs>("get_app_runtime_prefs");
}

export async function saveAppRuntimePrefs(prefs: AppRuntimePrefs): Promise<void> {
  await invoke<void>("save_app_runtime_prefs", { prefs });
}

export async function quitAppFully(): Promise<void> {
  await invoke<void>("quit_app_fully_cmd");
}
