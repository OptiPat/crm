use crate::commands::DbState;
use serde::Serialize;
use tauri::{AppHandle, Manager, State};

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

#[derive(Serialize)]
pub struct RestoreDbBackupResult {
    pub restored_from: String,
    pub safety_backup: Option<String>,
}

#[tauri::command]
pub fn restore_db_backup(
    app: AppHandle,
    db: State<'_, DbState>,
    backup_filename: String,
) -> Result<RestoreDbBackupResult, String> {
    let app_data_dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    let db_path = app_data_dir.join("patrimoine-crm.db");

    {
        let mut guard = db
            .lock()
            .map_err(|_| "Impossible de verrouiller la base.".to_string())?;
        *guard = None;
    }

    let (restored, safety) = crate::backup::restore_db_from_backup(
        &app_data_dir,
        &db_path,
        &backup_filename,
    )
    .map_err(|e| format!("Restauration impossible : {}", e))?;

    Ok(RestoreDbBackupResult {
        restored_from: restored
            .file_name()
            .map(|n| n.to_string_lossy().into_owned())
            .unwrap_or_else(|| backup_filename.clone()),
        safety_backup: safety.and_then(|p| {
            p.file_name()
                .map(|n| n.to_string_lossy().into_owned())
        }),
    })
}

#[tauri::command]
pub fn create_manual_db_backup(app: AppHandle) -> Result<String, String> {
    let app_data_dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    let db_path = app_data_dir.join("patrimoine-crm.db");
    if !db_path.exists() {
        return Err("Fichier de base introuvable.".to_string());
    }
    let dest = crate::backup::create_manual_backup(&app_data_dir, &db_path)
        .map_err(|e| e.to_string())?;
    Ok(dest.to_string_lossy().into_owned())
}

#[tauri::command]
pub fn open_document_file(path: String) -> Result<(), String> {
    let p = std::path::Path::new(&path);
    if !p.exists() {
        return Err("Fichier introuvable sur ce PC.".to_string());
    }
    open_path_with_system_default(p).map_err(|e| e.to_string())
}

/// Ouvre une URL HTTPS dans le navigateur (webview Tauri ne gère pas les liens externes).
pub fn open_url_in_browser(url: &str) -> Result<(), String> {
    if cfg!(target_os = "windows") {
        let escaped = url.replace('\'', "''");
        std::process::Command::new("powershell")
            .args([
                "-NoProfile",
                "-ExecutionPolicy",
                "Bypass",
                "-Command",
                &format!("Start-Process '{escaped}'"),
            ])
            .spawn()
            .map_err(|e| format!("Ouverture du navigateur: {}", e))?;
    } else if cfg!(target_os = "macos") {
        std::process::Command::new("open")
            .arg(url)
            .spawn()
            .map_err(|e| format!("Ouverture du navigateur: {}", e))?;
    } else {
        std::process::Command::new("xdg-open")
            .arg(url)
            .spawn()
            .map_err(|e| format!("Ouverture du navigateur: {}", e))?;
    }
    Ok(())
}

pub fn gmail_web_url(message_id: &str, thread_id: Option<&str>) -> String {
    if let Some(tid) = thread_id.map(str::trim).filter(|s| !s.is_empty()) {
        return format!("https://mail.google.com/mail/u/0/#inbox/{tid}");
    }
    format!(
        "https://mail.google.com/mail/u/0/#search/in%3Aall+{}",
        message_id.trim()
    )
}

#[tauri::command]
pub fn open_gmail_message(
    gmail_message_id: String,
    gmail_thread_id: Option<String>,
) -> Result<(), String> {
    let url = gmail_web_url(&gmail_message_id, gmail_thread_id.as_deref());
    open_url_in_browser(&url)
}

#[tauri::command]
pub fn open_external_url(url: String) -> Result<(), String> {
    let u = url.trim();
    if !(u.starts_with("https://") || u.starts_with("http://")) {
        return Err("URL non autorisée.".into());
    }
    open_url_in_browser(u)
}

pub(crate) fn open_path_with_system_default(path: &std::path::Path) -> std::io::Result<()> {
    #[cfg(target_os = "windows")]
    {
        std::process::Command::new("cmd")
            .args(["/C", "start", "", &path.to_string_lossy()])
            .spawn()?;
    }
    #[cfg(target_os = "macos")]
    {
        std::process::Command::new("open").arg(path).spawn()?;
    }
    #[cfg(all(not(target_os = "windows"), not(target_os = "macos")))]
    {
        std::process::Command::new("xdg-open").arg(path).spawn()?;
    }
    Ok(())
}
