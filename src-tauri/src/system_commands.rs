use crate::auth::session::{require_ui_session, UiSessionState};
use crate::commands::DbState;
use serde::Serialize;
use tauri::{AppHandle, Manager, State};

#[derive(Serialize)]
pub struct AppInfo {
    pub version: String,
    pub db_path: String,
}

#[tauri::command]
pub fn get_app_info(
    app: AppHandle,
    session: State<'_, UiSessionState>,
) -> Result<AppInfo, String> {
    require_ui_session(&session)?;
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
pub fn list_db_backups(
    app: AppHandle,
    session: State<'_, UiSessionState>,
) -> Result<Vec<(String, u64)>, String> {
    require_ui_session(&session)?;
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
    session: State<'_, UiSessionState>,
    backup_filename: String,
) -> Result<RestoreDbBackupResult, String> {
    require_ui_session(&session)?;
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
pub fn create_manual_db_backup(
    app: AppHandle,
    session: State<'_, UiSessionState>,
) -> Result<String, String> {
    require_ui_session(&session)?;
    let app_data_dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    let db_path = app_data_dir.join("patrimoine-crm.db");
    if !db_path.exists() {
        return Err("Fichier de base introuvable.".to_string());
    }
    let dest = crate::backup::create_manual_backup(&app_data_dir, &db_path)
        .map_err(|e| e.to_string())?;
    Ok(dest.to_string_lossy().into_owned())
}

#[derive(Serialize)]
pub struct ExportFullArchiveResult {
    pub zip_path: String,
    pub zip_size: u64,
    pub files_included: usize,
}

#[tauri::command]
pub fn export_full_archive(
    app: AppHandle,
    db: State<'_, DbState>,
    session: State<'_, UiSessionState>,
    destination_dir: String,
) -> Result<ExportFullArchiveResult, String> {
    require_ui_session(&session)?;
    let dest = std::path::Path::new(destination_dir.trim());
    if destination_dir.trim().is_empty() {
        return Err("Choisissez un dossier de destination.".into());
    }
    if !dest.is_dir() {
        return Err("Le dossier de destination est introuvable.".into());
    }

    let app_data_dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    let db_guard = db
        .lock()
        .map_err(|_| "Impossible d'accéder à la base.".to_string())?;
    let database = db_guard.as_ref().ok_or("Base non initialisée")?;

    let output = crate::export_archive::export_full_archive(
        crate::export_archive::ExportArchiveInput {
            source_db: database.connection(),
            app_data_dir: &app_data_dir,
            destination_dir: dest,
        },
    )?;

    Ok(ExportFullArchiveResult {
        zip_path: output.zip_path.to_string_lossy().into_owned(),
        zip_size: output.zip_size,
        files_included: output.files_included,
    })
}

#[tauri::command]
pub fn open_document_file(
    session: State<'_, UiSessionState>,
    path: String,
) -> Result<(), String> {
    require_ui_session(&session)?;
    let p = std::path::Path::new(&path);
    if !p.exists() {
        return Err("Fichier introuvable sur ce PC.".to_string());
    }
    open_path_with_system_default(p).map_err(|e| e.to_string())
}

/// Ouvre une URL externe (https, ou sms: pour Phone Link / mobile).
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
    session: State<'_, UiSessionState>,
    gmail_message_id: String,
    gmail_thread_id: Option<String>,
) -> Result<(), String> {
    require_ui_session(&session)?;
    let url = gmail_web_url(&gmail_message_id, gmail_thread_id.as_deref());
    open_url_in_browser(&url)
}

#[tauri::command]
pub fn open_external_url(
    session: State<'_, UiSessionState>,
    url: String,
) -> Result<(), String> {
    require_ui_session(&session)?;
    let u = url.trim();
    if !is_allowed_external_url(u) {
        return Err("URL non autorisée.".into());
    }
    open_url_in_browser(u)
}

fn is_allowed_external_url(url: &str) -> bool {
    url.starts_with("https://")
        || url.starts_with("http://")
        || is_allowed_sms_url(url)
        || is_allowed_mailto_url(url)
}

fn is_allowed_mailto_url(url: &str) -> bool {
    let Some(rest) = url.strip_prefix("mailto:") else {
        return false;
    };
    let trimmed = rest.trim();
    !trimmed.is_empty()
        && !trimmed.contains('\n')
        && !trimmed.contains('\r')
        && !trimmed.to_ascii_lowercase().contains("javascript:")
}

fn is_allowed_sms_url(url: &str) -> bool {
    let Some(rest) = url.strip_prefix("sms:") else {
        return false;
    };
    let phone_part = rest.split('?').next().unwrap_or(rest);
    let digits = phone_part.trim_start_matches('+');
    !digits.is_empty() && digits.chars().all(|c| c.is_ascii_digit())
}

#[cfg(test)]
mod open_external_url_tests {
    use super::{is_allowed_external_url, is_allowed_sms_url};

    #[test]
    fn allows_https_and_wa_me() {
        assert!(is_allowed_external_url("https://wa.me/33612345678?text=hi"));
    }

    #[test]
    fn allows_sms_with_body() {
        assert!(is_allowed_sms_url("sms:+33612345678?body=Hello"));
        assert!(is_allowed_external_url("sms:+33612345678?body=Hello"));
    }

    #[test]
    fn allows_mailto() {
        assert!(is_allowed_external_url("mailto:contact@example.com"));
        assert!(!is_allowed_external_url("mailto:"));
    }

    #[test]
    fn rejects_unknown_schemes() {
        assert!(!is_allowed_external_url("javascript:alert(1)"));
        assert!(!is_allowed_sms_url("sms:abc"));
    }
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
