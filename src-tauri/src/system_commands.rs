use serde::Serialize;
use tauri::{AppHandle, Manager};

#[derive(Serialize)]
pub struct AppInfo {
    pub version: String,
    pub db_path: String,
}

#[tauri::command]
pub fn get_app_info(app: AppHandle) -> Result<AppInfo, String> {
    let version = app.package_info().version.to_string();
    let db_path = app
        .path()
        .app_data_dir()
        .map_err(|e| e.to_string())?
        .join("patrimoine-crm.db")
        .to_string_lossy()
        .into_owned();

    Ok(AppInfo { version, db_path })
}

#[tauri::command]
pub fn list_db_backups(app: AppHandle) -> Result<Vec<(String, u64)>, String> {
    let app_data_dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    crate::backup::list_backups(&app_data_dir).map_err(|e| e.to_string())
}
