use super::{activate_license, get_status, start_trial};
use crate::auth::commands::AuthState;
use crate::commands::DbState;
use tauri::{AppHandle, State};

fn installed_at_from_auth(auth: &AuthState) -> Option<i64> {
    let guard = auth.lock().ok()?;
    let manager = guard.as_ref()?;
    manager.created_at().ok()
}

#[tauri::command]
pub fn needs_license_activation_cmd(db: State<'_, DbState>) -> Result<bool, String> {
    let guard = db
        .lock()
        .map_err(|_| "Impossible de verrouiller la base.".to_string())?;
    let database = guard.as_ref().ok_or("Base non ouverte.".to_string())?;
    super::needs_activation_screen(database)
}

#[tauri::command]
pub fn get_license_status_cmd(db: State<'_, DbState>) -> Result<super::LicenseStatusView, String> {
    let guard = db
        .lock()
        .map_err(|_| "Impossible de verrouiller la base.".to_string())?;
    let database = guard.as_ref().ok_or("Base non ouverte.".to_string())?;
    get_status(database)
}

#[tauri::command]
pub fn start_license_trial_cmd(
    app: AppHandle,
    auth: State<'_, AuthState>,
    db: State<'_, DbState>,
    client_email: String,
    client_name: Option<String>,
    cabinet: Option<String>,
    allow_restart: Option<bool>,
) -> Result<super::LicenseStatusView, String> {
    let guard = db
        .lock()
        .map_err(|_| "Impossible de verrouiller la base.".to_string())?;
    let database = guard.as_ref().ok_or("Base non ouverte.".to_string())?;
    start_trial(
        &app,
        database,
        client_email,
        client_name,
        cabinet,
        installed_at_from_auth(&auth),
        allow_restart.unwrap_or(false),
    )
}

#[tauri::command]
pub fn activate_license_cmd(
    app: AppHandle,
    auth: State<'_, AuthState>,
    db: State<'_, DbState>,
    license_key: String,
    client_email: String,
    client_name: Option<String>,
    cabinet: Option<String>,
) -> Result<super::LicenseStatusView, String> {
    let guard = db
        .lock()
        .map_err(|_| "Impossible de verrouiller la base.".to_string())?;
    let database = guard.as_ref().ok_or("Base non ouverte.".to_string())?;
    activate_license(
        &app,
        database,
        license_key,
        client_email,
        client_name,
        cabinet,
        installed_at_from_auth(&auth),
    )
}
