use tauri::AppHandle;

use super::prefs::{load_runtime_prefs, AppRuntimePrefs};
use super::tray::{quit_app_fully, save_prefs_and_sync};

#[tauri::command]
pub fn get_app_runtime_prefs(app: AppHandle) -> Result<AppRuntimePrefs, String> {
    Ok(load_runtime_prefs(&app))
}

#[tauri::command]
pub fn save_app_runtime_prefs(
    app: AppHandle,
    prefs: AppRuntimePrefs,
) -> Result<AppRuntimePrefs, String> {
    save_prefs_and_sync(&app, prefs)
}

#[tauri::command]
pub fn quit_app_fully_cmd(app: AppHandle) -> Result<(), String> {
    quit_app_fully(&app);
    Ok(())
}

#[tauri::command]
pub fn focus_main_window_cmd(app: AppHandle) -> Result<(), String> {
    super::tray::focus_main_window(&app);
    Ok(())
}
