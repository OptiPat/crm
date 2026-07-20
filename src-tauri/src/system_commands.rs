use crate::auth::session::{require_ui_session, UiSessionState};
use crate::commands::DbState;
use serde::Serialize;
use std::sync::{Mutex, OnceLock};
use tauri::{AppHandle, Manager, State};

static LEGACY_KEY_CLEANUP_LOCK: OnceLock<Mutex<()>> = OnceLock::new();

fn open_backup_source(
    db: &State<'_, DbState>,
    db_path: &std::path::Path,
) -> Result<rusqlite::Connection, String> {
    {
        let guard = db
            .lock()
            .map_err(|_| "Impossible d'accéder à la base.".to_string())?;
        if guard.is_none() {
            return Err("Base non initialisée".to_string());
        }
    }
    rusqlite::Connection::open_with_flags(
        db_path,
        rusqlite::OpenFlags::SQLITE_OPEN_READ_ONLY,
    )
    .map_err(|error| format!("Ouverture de la base pour sauvegarde impossible : {error}"))
}

#[derive(Serialize)]
pub struct AppInfo {
    pub version: String,
    pub db_path: String,
    pub secrets_protection_warning: bool,
    pub legacy_secret_key_cleanup_available: bool,
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

    Ok(AppInfo {
        version,
        db_path,
        secrets_protection_warning: crate::email::oauth_secrets::storage_protection_warning(&app),
        legacy_secret_key_cleanup_available:
            crate::email::oauth_secrets::legacy_secret_key_cleanup_available(&app),
    })
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
    let backup_guard = crate::backup::lock_backup_operations()
        .map_err(|error| format!("Restauration impossible : {error}"))?;
    crate::backup::validate_db_backup(&app_data_dir, &backup_filename)
        .map_err(|error| format!("Restauration impossible : {error}"))?;

    {
        let mut guard = db
            .lock()
            .map_err(|_| "Impossible de verrouiller la base.".to_string())?;
        *guard = None;
    }

    let restore_result = crate::backup::restore_db_from_backup(
        &app_data_dir,
        &db_path,
        &backup_filename,
    );
    let (restored, safety) = match restore_result {
        Ok(result) => result,
        Err(error) => {
            drop(backup_guard);
            let reopen_result = crate::database::Database::open(&app)
                .map_err(|reopen_error| reopen_error.to_string())
                .and_then(|database| {
                    let mut guard = db
                        .lock()
                        .map_err(|_| "Impossible de reverrouiller la base.".to_string())?;
                    *guard = Some(database);
                    Ok(())
                });
            return match reopen_result {
                Ok(()) => Err(format!("Restauration impossible : {error}")),
                Err(reopen_error) => Err(format!(
                    "Restauration impossible : {error}. Réouverture de la base impossible : {reopen_error}"
                )),
            };
        }
    };

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
    db: State<'_, DbState>,
    session: State<'_, UiSessionState>,
) -> Result<String, String> {
    require_ui_session(&session)?;
    let app_data_dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    let db_path = app_data_dir.join("patrimoine-crm.db");
    if !db_path.exists() {
        return Err("Fichier de base introuvable.".to_string());
    }
    let _backup_guard =
        crate::backup::lock_backup_operations().map_err(|error| error.to_string())?;
    let source = open_backup_source(&db, &db_path)?;
    let dest = crate::backup::create_manual_backup(&app_data_dir, &source)
        .map_err(|e| e.to_string())?;
    Ok(dest.to_string_lossy().into_owned())
}

#[derive(Serialize)]
pub struct CleanupLegacySecretKeyResult {
    pub backup_path: String,
}

#[tauri::command]
pub fn cleanup_legacy_secret_key(
    app: AppHandle,
    db: State<'_, DbState>,
    session: State<'_, UiSessionState>,
) -> Result<CleanupLegacySecretKeyResult, String> {
    require_ui_session(&session)?;
    let _cleanup_guard = LEGACY_KEY_CLEANUP_LOCK
        .get_or_init(|| Mutex::new(()))
        .lock()
        .map_err(|_| "Nettoyage de l'ancienne clé déjà indisponible.".to_string())?;
    let _backup_guard =
        crate::backup::lock_backup_operations().map_err(|error| error.to_string())?;
    let keys = crate::email::oauth_secrets::validated_protected_key_for_cleanup(&app)?
        .ok_or("Aucune ancienne clé incompatible à nettoyer.")?;
    {
        let guard = db
            .lock()
            .map_err(|_| "Impossible d'accéder à la base.".to_string())?;
        let database = guard.as_ref().ok_or("Base non initialisée")?;
        crate::birthday_notifications::validate_stored_bot_token_key(database, &keys.protected)?;
    }

    let app_data_dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    let db_path = app_data_dir.join("patrimoine-crm.db");
    let backup_path = {
        let source = open_backup_source(&db, &db_path)?;
        crate::backup::create_manual_backup(&app_data_dir, &source)
            .map_err(|e| format!("Sauvegarde préalable impossible : {e}"))?
    };
    let revalidated = crate::email::oauth_secrets::validated_protected_key_for_cleanup(&app)?
        .ok_or("Le conflit de clés a changé pendant la sauvegarde. Aucun fichier supprimé.")?;
    if revalidated != keys {
        return Err("Les clés ont changé pendant la sauvegarde. Aucun fichier supprimé.".into());
    }
    {
        let guard = db
            .lock()
            .map_err(|_| "Impossible d'accéder à la base.".to_string())?;
        let database = guard.as_ref().ok_or("Base non initialisée")?;
        crate::birthday_notifications::validate_stored_bot_token_key(
            database,
            &keys.protected,
        )?;
    }
    if !crate::email::oauth_secrets::finalize_validated_legacy_key_cleanup(&app, keys)? {
        return Err("L'ancienne clé n'est plus présente ; aucun fichier supprimé.".into());
    }

    Ok(CleanupLegacySecretKeyResult {
        backup_path: backup_path.to_string_lossy().into_owned(),
    })
}

#[derive(Serialize)]
pub struct ExportFullArchiveResult {
    pub zip_path: String,
    pub zip_size: u64,
    pub files_included: usize,
}

#[derive(Serialize)]
pub struct ExternalBackupSettings {
    pub directory: Option<String>,
    pub last_backup_path: Option<String>,
    pub last_attempt_at: Option<String>,
    pub last_error: Option<String>,
}

fn external_backup_settings(app: &AppHandle) -> Result<ExternalBackupSettings, String> {
    let directory = crate::app_runtime::load_runtime_prefs(app).external_backup_directory;
    let app_data_dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    let status = crate::backup::load_external_backup_status(&app_data_dir);
    let last_backup_path = directory
        .as_deref()
        .map(std::path::Path::new)
        .and_then(|path| crate::export_archive::latest_automatic_archive(path).ok().flatten())
        .map(|path| path.to_string_lossy().into_owned());
    Ok(ExternalBackupSettings {
        directory,
        last_backup_path,
        last_attempt_at: status.last_attempt_at,
        last_error: status.last_error,
    })
}

#[tauri::command]
pub fn get_external_backup_settings(
    app: AppHandle,
    session: State<'_, UiSessionState>,
) -> Result<ExternalBackupSettings, String> {
    require_ui_session(&session)?;
    external_backup_settings(&app)
}

#[tauri::command]
pub fn set_external_backup_directory(
    app: AppHandle,
    session: State<'_, UiSessionState>,
    directory: Option<String>,
) -> Result<ExternalBackupSettings, String> {
    require_ui_session(&session)?;
    let mut prefs = crate::app_runtime::load_runtime_prefs(&app);
    prefs.external_backup_directory = match directory {
        Some(directory) if !directory.trim().is_empty() => {
            let selected = std::path::PathBuf::from(directory.trim());
            if !selected.is_dir() {
                return Err("Le dossier de sauvegarde externe est introuvable.".into());
            }
            let selected = selected
                .canonicalize()
                .map_err(|error| format!("Dossier externe invalide : {error}"))?;
            let app_data = app
                .path()
                .app_data_dir()
                .map_err(|error| error.to_string())?;
            let app_data = app_data.canonicalize().unwrap_or(app_data);
            if selected.starts_with(&app_data) {
                return Err(
                    "Choisissez un dossier hors des données internes du CRM.".to_string(),
                );
            }
            let probe = selected.join(format!(
                ".patrimoine-crm-write-test-{}-{}",
                std::process::id(),
                chrono::Local::now().timestamp_millis()
            ));
            std::fs::OpenOptions::new()
                .write(true)
                .create_new(true)
                .open(&probe)
                .map_err(|error| {
                    format!("Le dossier externe n'est pas accessible en écriture : {error}")
                })?;
            std::fs::remove_file(&probe)
                .map_err(|error| format!("Nettoyage du test d'écriture impossible : {error}"))?;
            Some(selected.to_string_lossy().into_owned())
        }
        _ => None,
    };
    crate::app_runtime::save_runtime_prefs(&app, &prefs)?;
    let app_data_dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    crate::backup::clear_external_backup_status(&app_data_dir);
    external_backup_settings(&app)
}

#[tauri::command]
pub fn create_external_backup_now(
    app: AppHandle,
    db: State<'_, DbState>,
    session: State<'_, UiSessionState>,
) -> Result<ExportFullArchiveResult, String> {
    require_ui_session(&session)?;
    let settings = external_backup_settings(&app)?;
    let directory = settings
        .directory
        .ok_or("Choisissez d'abord un dossier de sauvegarde externe.")?;
    let app_data_dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    let _backup_guard =
        crate::backup::lock_backup_operations().map_err(|error| error.to_string())?;
    let db_path = app_data_dir.join("patrimoine-crm.db");
    let source = open_backup_source(&db, &db_path)?;
    let export_result = crate::export_archive::export_automatic_archive_if_due(
        crate::export_archive::ExportArchiveInput {
            source_db: &source,
            app_data_dir: &app_data_dir,
            destination_dir: std::path::Path::new(&directory),
        },
        true,
    );
    let output = match export_result {
        Ok(Some(output)) => {
            crate::backup::record_external_backup_success(&app_data_dir, &output.zip_path);
            output
        }
        Ok(None) => return Err("Aucune archive externe créée.".to_string()),
        Err(error) => {
            crate::backup::record_external_backup_error(&app_data_dir, &error);
            return Err(error);
        }
    };
    Ok(ExportFullArchiveResult {
        zip_path: output.zip_path.to_string_lossy().into_owned(),
        zip_size: output.zip_size,
        files_included: output.files_included,
    })
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
    let _backup_guard =
        crate::backup::lock_backup_operations().map_err(|error| error.to_string())?;
    let db_path = app_data_dir.join("patrimoine-crm.db");
    let source = open_backup_source(&db, &db_path)?;

    let output = crate::export_archive::export_full_archive(
        crate::export_archive::ExportArchiveInput {
            source_db: &source,
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
    app: AppHandle,
    session: State<'_, UiSessionState>,
    path: String,
) -> Result<(), String> {
    require_ui_session(&session)?;
    let app_data_dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    let managed = crate::documents_storage::validate_managed_document_file(
        &app_data_dir,
        std::path::Path::new(&path),
    )?;
    open_path_with_system_default(&managed).map_err(|e| e.to_string())
}

/// Ouvre une URL externe (https, ou sms: pour Phone Link / mobile).
pub fn open_url_in_browser(url: &str) -> Result<(), String> {
    open::that_detached(url).map_err(|e| format!("Ouverture du navigateur : {e}"))
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
    if is_allowed_sms_url(url) || is_allowed_tel_url(url) || is_allowed_mailto_url(url) {
        return true;
    }
    let Ok(parsed) = url::Url::parse(url) else {
        return false;
    };
    matches!(parsed.scheme(), "http" | "https")
        && parsed.host_str().is_some()
        && parsed.username().is_empty()
        && parsed.password().is_none()
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

fn is_allowed_tel_url(url: &str) -> bool {
    let Some(rest) = url.strip_prefix("tel:") else {
        return false;
    };
    let mut digit_count = 0;
    for character in rest.chars() {
        if character.is_ascii_digit() {
            digit_count += 1;
        } else if !matches!(character, '+' | ' ' | '-' | '(' | ')' | '.') {
            return false;
        }
    }
    digit_count >= 6
}

#[cfg(test)]
mod open_external_url_tests {
    use super::{is_allowed_external_url, is_allowed_sms_url, is_allowed_tel_url};

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
    fn allows_safe_phone_links() {
        assert!(is_allowed_tel_url("tel:+33 6 12 34 56 78"));
        assert!(is_allowed_external_url("tel:0612345678"));
        assert!(!is_allowed_tel_url("tel:12&calc"));
        assert!(!is_allowed_tel_url("tel:123"));
    }

    #[test]
    fn rejects_unknown_schemes() {
        assert!(!is_allowed_external_url("javascript:alert(1)"));
        assert!(!is_allowed_sms_url("sms:abc"));
    }

    #[test]
    fn allows_http_notes_but_rejects_credentials_and_invalid_urls() {
        assert!(is_allowed_external_url("http://example.com"));
        assert!(!is_allowed_external_url("https://user:password@example.com"));
        assert!(!is_allowed_external_url("http://user:password@example.com"));
        assert!(!is_allowed_external_url("https://"));
        assert!(is_allowed_external_url("https://example.com/path?q=1"));
    }
}

pub(crate) fn open_path_with_system_default(path: &std::path::Path) -> std::io::Result<()> {
    open::that_detached(path)
}
