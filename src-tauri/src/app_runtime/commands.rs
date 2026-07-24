use crate::auth::session::{require_ui_session, UiSessionState};
use tauri::AppHandle;
use tauri::State;

use super::prefs::{load_runtime_prefs, AppRuntimePrefs};
use super::tray::{quit_app_fully, save_prefs_and_sync};

fn preserve_export_managed_prefs(
    current: &AppRuntimePrefs,
    mut next: AppRuntimePrefs,
) -> AppRuntimePrefs {
    next.external_backup_directory = current.external_backup_directory.clone();
    next
}

#[tauri::command]
pub fn get_app_runtime_prefs(app: AppHandle) -> Result<AppRuntimePrefs, String> {
    Ok(load_runtime_prefs(&app))
}

#[tauri::command]
pub fn save_app_runtime_prefs(
    app: AppHandle,
    session: State<'_, UiSessionState>,
    prefs: AppRuntimePrefs,
) -> Result<AppRuntimePrefs, String> {
    require_ui_session(&session)?;
    let current = load_runtime_prefs(&app);
    save_prefs_and_sync(&app, preserve_export_managed_prefs(&current, prefs))
}

#[tauri::command]
pub fn save_auto_lock_minutes(
    app: AppHandle,
    session: State<'_, UiSessionState>,
    minutes: u32,
) -> Result<AppRuntimePrefs, String> {
    require_ui_session(&session)?;
    let mut prefs = load_runtime_prefs(&app);
    prefs.auto_lock_minutes = minutes;
    save_prefs_and_sync(&app, prefs)
}

#[tauri::command]
pub fn quit_app_fully_cmd(app: AppHandle) -> Result<(), String> {
    quit_app_fully(&app)
}

#[tauri::command]
pub fn focus_main_window_cmd(app: AppHandle) -> Result<(), String> {
    super::tray::focus_main_window(&app);
    Ok(())
}

#[tauri::command]
pub fn claim_background_automation_lease_cmd(
    app: AppHandle,
    session: State<'_, UiSessionState>,
) -> Result<bool, String> {
    require_ui_session(&session)?;
    Ok(super::worker::automation_tick_allowed(&app))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn generic_runtime_save_cannot_change_external_backup_directory() {
        let current = AppRuntimePrefs {
            external_backup_directory: Some("D:/Archive CRM".into()),
            ..AppRuntimePrefs::default()
        };
        let next = AppRuntimePrefs {
            external_backup_directory: Some("D:/Exfiltration".into()),
            close_to_tray: false,
            ..AppRuntimePrefs::default()
        };
        let preserved = preserve_export_managed_prefs(&current, next);
        assert_eq!(
            preserved.external_backup_directory.as_deref(),
            Some("D:/Archive CRM")
        );
        assert!(!preserved.close_to_tray);
    }
}
