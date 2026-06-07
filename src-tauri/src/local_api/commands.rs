use crate::commands::DbState;
use super::config::{get_local_api_settings, regenerate_local_api_token, save_local_api_settings, LocalApiSettingsPayload};
use super::{restart_for_app};
use tauri::{AppHandle, State};

#[tauri::command]
pub fn get_local_api_settings_cmd(db: State<'_, DbState>) -> Result<LocalApiSettingsPayload, String> {
    let db_guard = db.lock().map_err(|_| "Base non accessible.")?;
    let database = db_guard.as_ref().ok_or("Base non initialisée")?;
    get_local_api_settings(database)
}

#[tauri::command]
pub fn save_local_api_settings_cmd(
    app: AppHandle,
    db: State<'_, DbState>,
    enabled: bool,
    port: u16,
) -> Result<LocalApiSettingsPayload, String> {
    let db_guard = db.lock().map_err(|_| "Base non accessible.")?;
    let database = db_guard.as_ref().ok_or("Base non initialisée")?;
    let payload = save_local_api_settings(database, enabled, port)?;
    restart_for_app(&app, database)?;
    Ok(payload)
}

#[tauri::command]
pub fn regenerate_local_api_token_cmd(
    app: AppHandle,
    db: State<'_, DbState>,
) -> Result<LocalApiSettingsPayload, String> {
    let db_guard = db.lock().map_err(|_| "Base non accessible.")?;
    let database = db_guard.as_ref().ok_or("Base non initialisée")?;
    let payload = regenerate_local_api_token(database)?;
    restart_for_app(&app, database)?;
    Ok(payload)
}
