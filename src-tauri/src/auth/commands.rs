use super::{AuthManager, PasswordAttemptOutcome};
use crate::commands::DbState;
use crate::database::Database;
use serde::Serialize;
use std::sync::Mutex;
use tauri::{AppHandle, State};
use tauri_plugin_biometry::{AuthOptions, BiometryExt};

pub type AuthState = Mutex<Option<AuthManager>>;

const MIN_PASSWORD_LEN: usize = 8;

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AuthCommandError {
    code: String,
    message: String,
    retry_after_seconds: Option<u64>,
}

impl AuthCommandError {
    fn new(code: &str, message: impl Into<String>) -> Self {
        Self {
            code: code.to_string(),
            message: message.into(),
            retry_after_seconds: None,
        }
    }

    fn internal(message: impl Into<String>) -> Self {
        Self::new("internal_error", message)
    }

    fn rate_limited(retry_after_seconds: u64) -> Self {
        Self {
            code: "rate_limited".to_string(),
            message: format!(
                "Trop de tentatives incorrectes. Réessayez dans {}.",
                format_delay(retry_after_seconds)
            ),
            retry_after_seconds: Some(retry_after_seconds),
        }
    }
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SystemAuthStatus {
    supported: bool,
    available: bool,
    enabled: bool,
    label: String,
    detail: Option<String>,
}

fn format_delay(seconds: u64) -> String {
    match seconds {
        0..=59 => format!("{seconds} seconde{}", if seconds > 1 { "s" } else { "" }),
        60..=119 => "1 minute".to_string(),
        120..=3599 => format!("{} minutes", seconds.div_ceil(60)),
        3600..=7199 => "1 heure".to_string(),
        _ => format!("{} heures", seconds.div_ceil(3600)),
    }
}

fn verify_password(
    auth: &State<'_, AuthState>,
    password: &str,
) -> Result<(), AuthCommandError> {
    let mut guard = auth
        .lock()
        .map_err(|_| AuthCommandError::internal("État d'authentification inaccessible"))?;
    let manager = guard
        .as_mut()
        .ok_or_else(|| AuthCommandError::internal("Authentification non initialisée"))?;

    match manager
        .verify_with_rate_limit(password)
        .map_err(AuthCommandError::internal)?
    {
        PasswordAttemptOutcome::Verified => Ok(()),
        PasswordAttemptOutcome::Invalid => {
            Err(AuthCommandError::new("invalid_password", "Mot de passe incorrect"))
        }
        PasswordAttemptOutcome::Blocked {
            retry_after_seconds,
        } => Err(AuthCommandError::rate_limited(retry_after_seconds)),
    }
}

fn is_system_auth_enabled(auth: &State<'_, AuthState>) -> Result<bool, AuthCommandError> {
    let guard = auth
        .lock()
        .map_err(|_| AuthCommandError::internal("État d'authentification inaccessible"))?;
    let manager = guard
        .as_ref()
        .ok_or_else(|| AuthCommandError::internal("Authentification non initialisée"))?;
    manager
        .system_auth_enabled()
        .map_err(AuthCommandError::internal)
}

fn set_system_auth_enabled(
    auth: &State<'_, AuthState>,
    enabled: bool,
) -> Result<(), AuthCommandError> {
    let guard = auth
        .lock()
        .map_err(|_| AuthCommandError::internal("État d'authentification inaccessible"))?;
    let manager = guard
        .as_ref()
        .ok_or_else(|| AuthCommandError::internal("Authentification non initialisée"))?;
    manager
        .set_system_auth_enabled(enabled)
        .map_err(AuthCommandError::internal)
}

fn require_database_unlocked(db: &State<'_, DbState>) -> Result<(), AuthCommandError> {
    let guard = db
        .lock()
        .map_err(|_| AuthCommandError::internal("État de la base inaccessible"))?;
    if guard.is_some() {
        Ok(())
    } else {
        Err(AuthCommandError::new(
            "session_locked",
            "Déverrouillez d'abord le CRM pour modifier ses réglages de sécurité",
        ))
    }
}

fn platform_system_auth_status(app: &AppHandle) -> (bool, bool, String, Option<String>) {
    #[cfg(target_os = "windows")]
    let label = "Windows Hello (visage, empreinte ou code PIN)".to_string();
    #[cfg(target_os = "macos")]
    let label = "Touch ID (ou mot de passe du Mac)".to_string();
    #[cfg(not(any(target_os = "windows", target_os = "macos")))]
    let label = "Authentification système".to_string();

    if !cfg!(any(target_os = "windows", target_os = "macos")) {
        return (
            false,
            false,
            label,
            Some("Cette plateforme n'est pas prise en charge.".to_string()),
        );
    }

    match app.biometry().status() {
        Ok(status) => (
            true,
            status.is_available,
            label,
            if status.is_available {
                None
            } else {
                Some(match status.error_code.as_deref() {
                    Some("biometryNotEnrolled") => {
                        if cfg!(target_os = "macos") {
                            "Touch ID n'est pas configuré ; le test pourra proposer le mot de passe du Mac."
                                .to_string()
                        } else {
                            "Configurez d'abord Windows Hello dans les réglages du système."
                                .to_string()
                        }
                    }
                    Some("biometryLockout") => {
                        "L'authentification système est temporairement verrouillée.".to_string()
                    }
                    _ => "L'authentification système n'est pas disponible sur ce poste.".to_string(),
                })
            },
        ),
        Err(_) => (
            true,
            false,
            label,
            Some("Impossible de vérifier l'authentification système sur ce poste.".to_string()),
        ),
    }
}

fn classify_system_auth_error(plugin_error: &str) -> AuthCommandError {
    if plugin_error.starts_with("[userCancel]") {
        AuthCommandError::new(
            "system_auth_cancelled",
            "Authentification système annulée",
        )
    } else if plugin_error.starts_with("[biometryLockout]") {
        AuthCommandError::new(
            "system_auth_locked",
            "Trop de tentatives système. Déverrouillez votre session puis réessayez.",
        )
    } else if [
        "[biometryNotAvailable]",
        "[biometryNotEnrolled]",
        "[passcodeNotSet]",
        "[notSupported]",
    ]
    .iter()
    .any(|code| plugin_error.starts_with(code))
    {
        AuthCommandError::new(
            "system_auth_unavailable",
            "Windows Hello ou l'authentification du Mac n'est pas disponible sur ce poste",
        )
    } else {
        AuthCommandError::new(
            "system_auth_failed",
            "La validation Windows Hello ou Touch ID a échoué",
        )
    }
}

async fn authenticate_with_system(app: AppHandle) -> Result<(), AuthCommandError> {
    tauri::async_runtime::spawn_blocking(move || {
        app.biometry().authenticate(
            "Confirmez votre identité pour accéder au CRM".to_string(),
            AuthOptions {
                allow_device_credential: Some(true),
                cancel_title: Some("Annuler".to_string()),
                fallback_title: Some("Utiliser le mot de passe de l’appareil".to_string()),
                title: Some("Déverrouiller le CRM".to_string()),
                subtitle: None,
                confirmation_required: Some(true),
            },
        )
    })
    .await
    .map_err(|_| AuthCommandError::internal("L'authentification système s'est interrompue"))?
    .map_err(|error| classify_system_auth_error(&error.to_string()))
}

/// Libère la connexion SQLite (verrou d'accès).
fn close_database(db: &State<'_, DbState>) {
    *db.lock().unwrap() = None;
}

/// Ouvre la base locale (non chiffrée) et la place dans l'état partagé.
fn open_database(
    app: &AppHandle,
    db: &State<'_, DbState>,
    auth: &State<'_, AuthState>,
) -> Result<(), String> {
    close_database(db);

    let database = Database::open(app).map_err(|e| {
        eprintln!("❌ open_database: échec ouverture base : {e}");
        format!("Échec d'ouverture de la base : {e}")
    })?;
    let installed_at = {
        let guard = auth.lock().unwrap();
        guard.as_ref().and_then(|manager| manager.created_at().ok())
    };
    if let Err(e) = crate::licensing::ensure_on_database_open(app, &database, installed_at) {
        eprintln!("⚠️ Licence : {e}");
    }
    *db.lock().unwrap() = Some(database);
    crate::birthday_notifications::spawn_run_if_due(app);
    Ok(())
}

#[tauri::command]
pub fn is_first_launch(auth: State<'_, AuthState>) -> Result<bool, String> {
    let guard = auth.lock().unwrap();
    let manager = guard.as_ref().ok_or("Auth not initialized")?;
    Ok(manager.is_first_launch())
}

/// Premier lancement : crée le mot de passe d'accès et ouvre la base.
#[tauri::command]
pub fn create_master_password(
    app: AppHandle,
    auth: State<'_, AuthState>,
    db: State<'_, DbState>,
    password: String,
) -> Result<(), String> {
    if password.len() < MIN_PASSWORD_LEN {
        return Err("Le mot de passe doit contenir au moins 8 caractères".to_string());
    }

    {
        let guard = auth.lock().unwrap();
        let manager = guard.as_ref().ok_or("Auth not initialized")?;
        manager.create_master_password(&password)?;
    }

    open_database(&app, &db, &auth)
}

/// Indique si la base est déjà ouverte côté backend (session Tauri active).
/// `try_lock` : si une commande longue (recalcul étiquettes) tient le mutex, on considère déverrouillé.
#[tauri::command]
pub fn is_database_unlocked(db: State<'_, DbState>) -> Result<bool, String> {
    match db.try_lock() {
        Ok(guard) => Ok(guard.is_some()),
        Err(_) => Ok(true),
    }
}

/// Déverrouille : vérifie le mot de passe d'accès puis ouvre la base.
/// Si la double authentification est activée, la validation système est obligatoire.
/// Idempotent : si la base est déjà ouverte (ex. rechargement HMR du frontend), ne la ferme pas.
#[tauri::command]
pub async fn unlock(
    app: AppHandle,
    auth: State<'_, AuthState>,
    db: State<'_, DbState>,
    password: String,
) -> Result<bool, AuthCommandError> {
    verify_password(&auth, &password)?;

    if is_system_auth_enabled(&auth)? {
        authenticate_with_system(app.clone()).await?;
    }

    match db.try_lock() {
        Ok(guard) => {
            if guard.is_some() {
                crate::birthday_notifications::spawn_run_if_due(&app);
                return Ok(true);
            }
            drop(guard);
            open_database(&app, &db, &auth).map_err(AuthCommandError::internal)?;
        }
        Err(_) => {
            // Commande longue en cours (recalcul étiquettes…) : la base est déjà ouverte.
        }
    }
    Ok(true)
}

#[tauri::command]
pub fn get_system_auth_status(
    app: AppHandle,
    auth: State<'_, AuthState>,
) -> Result<SystemAuthStatus, AuthCommandError> {
    let enabled = is_system_auth_enabled(&auth)?;
    let (supported, available, label, detail) = platform_system_auth_status(&app);
    Ok(SystemAuthStatus {
        supported,
        available,
        enabled,
        label,
        detail,
    })
}

#[tauri::command]
pub async fn configure_system_auth(
    app: AppHandle,
    auth: State<'_, AuthState>,
    db: State<'_, DbState>,
    password: String,
    enabled: bool,
) -> Result<SystemAuthStatus, AuthCommandError> {
    require_database_unlocked(&db)?;
    verify_password(&auth, &password)?;

    let was_enabled = is_system_auth_enabled(&auth)?;
    if enabled || was_enabled {
        if let Err(error) = authenticate_with_system(app.clone()).await {
            if enabled || error.code != "system_auth_unavailable" {
                return Err(error);
            }
            // Session CRM déjà ouverte : la désactivation reste récupérable si le
            // mécanisme système a disparu de ce poste.
        }
    }

    set_system_auth_enabled(&auth, enabled)?;
    get_system_auth_status(app, auth)
}

/// Récupération volontaire : uniquement si la protection activée est devenue indisponible.
/// Le mot de passe reste requis et la protection système est désactivée avant l'ouverture.
#[tauri::command]
pub async fn recover_without_system_auth(
    app: AppHandle,
    auth: State<'_, AuthState>,
    db: State<'_, DbState>,
    password: String,
) -> Result<bool, AuthCommandError> {
    if !is_system_auth_enabled(&auth)? {
        return Err(AuthCommandError::new(
            "recovery_not_needed",
            "La protection système n'est pas activée",
        ));
    }

    verify_password(&auth, &password)?;
    if let Err(error) = authenticate_with_system(app.clone()).await {
        if error.code != "system_auth_unavailable" {
            return Err(error);
        }
        // Nouveau poste ou mécanisme retiré : le mot de passe CRM reste la voie
        // de récupération afin de ne jamais rendre les données inaccessibles.
    }
    set_system_auth_enabled(&auth, false)?;
    open_database(&app, &db, &auth).map_err(AuthCommandError::internal)?;
    Ok(true)
}

/// Verrouille l'application : ferme la base (écran de déverrouillage).
#[tauri::command]
pub fn lock(db: State<'_, DbState>) -> Result<(), String> {
    close_database(&db);
    Ok(())
}

/// Change le mot de passe d'accès (la base reste ouverte).
#[tauri::command]
pub fn change_master_password(
    auth: State<'_, AuthState>,
    db: State<'_, DbState>,
    current_password: String,
    new_password: String,
) -> Result<(), AuthCommandError> {
    require_database_unlocked(&db)?;
    if new_password.len() < MIN_PASSWORD_LEN {
        return Err(AuthCommandError::new(
            "invalid_new_password",
            "Le mot de passe doit contenir au moins 8 caractères",
        ));
    }
    verify_password(&auth, &current_password)?;
    let guard = auth
        .lock()
        .map_err(|_| AuthCommandError::internal("État d'authentification inaccessible"))?;
    let manager = guard
        .as_ref()
        .ok_or_else(|| AuthCommandError::internal("Authentification non initialisée"))?;
    manager
        .change_password_after_verification(&new_password)
        .map_err(AuthCommandError::internal)
}

#[cfg(test)]
mod tests {
    use super::classify_system_auth_error;

    #[test]
    fn classifies_system_auth_errors_from_stable_display_codes() {
        assert_eq!(
            classify_system_auth_error("[userCancel] - cancelled").code,
            "system_auth_cancelled"
        );
        assert_eq!(
            classify_system_auth_error("[biometryLockout] - locked").code,
            "system_auth_locked"
        );
        assert_eq!(
            classify_system_auth_error("[biometryNotEnrolled] - missing").code,
            "system_auth_unavailable"
        );
        assert_eq!(
            classify_system_auth_error("[authenticationFailed] - failed").code,
            "system_auth_failed"
        );
    }
}
