use super::session::{require_ui_session, UiSessionState, UI_SESSION_LOCKED_EVENT};
use super::{AuthManager, PasswordAttemptOutcome};
use crate::commands::DbState;
use crate::database::Database;
use serde::Serialize;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Mutex, OnceLock, TryLockError};
use std::time::Duration;
use tauri::{AppHandle, Emitter, State};
use tauri_plugin_biometry::{AuthOptions, BiometryExt};

pub type AuthState = Mutex<Option<AuthManager>>;

const MIN_PASSWORD_LEN: usize = 8;
static DATABASE_OPEN_LOCK: OnceLock<Mutex<()>> = OnceLock::new();
static SYSTEM_AUTH_IN_PROGRESS: AtomicBool = AtomicBool::new(false);

#[derive(Debug)]
struct SystemAuthGuard(&'static AtomicBool);

impl SystemAuthGuard {
    fn acquire(flag: &'static AtomicBool) -> Result<Self, AuthCommandError> {
        flag.compare_exchange(false, true, Ordering::AcqRel, Ordering::Acquire)
            .map(|_| Self(flag))
            .map_err(|_| {
                AuthCommandError::new(
                    "system_auth_in_progress",
                    "Une validation Windows Hello ou Touch ID est déjà en cours",
                )
            })
    }
}

impl Drop for SystemAuthGuard {
    fn drop(&mut self) {
        self.0.store(false, Ordering::Release);
    }
}

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

fn verify_password(auth: &State<'_, AuthState>, password: &str) -> Result<(), AuthCommandError> {
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
        PasswordAttemptOutcome::Invalid => Err(AuthCommandError::new(
            "invalid_password",
            "Mot de passe incorrect",
        )),
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

fn take_database(db: &DbState) -> Result<Option<Database>, String> {
    let mut guard = db
        .lock()
        .map_err(|_| "État de la base inaccessible".to_string())?;
    Ok(guard.take())
}

fn restore_database_state(db: &DbState, database: Database) -> Result<(), String> {
    let mut guard = db
        .lock()
        .map_err(|_| "État de la base inaccessible".to_string())?;
    if guard.is_none() {
        *guard = Some(database);
    }
    Ok(())
}

fn reopen_database_after_close_failure(app: &AppHandle, db: &DbState) -> Result<(), String> {
    crate::workspace::cache_seal::unseal_team_cache_if_needed(app)?;
    crate::licensing::set_workspace_write_allowed(true);
    let database =
        Database::open(app).map_err(|error| format!("Réouverture de la base : {error}"))?;
    let config = match database.get_workspace_config() {
        Ok(config) => config,
        Err(error) => {
            crate::licensing::set_workspace_write_allowed(false);
            restore_database_state(db, database)?;
            return Err(format!("Configuration workspace inaccessible : {error}"));
        }
    };
    let authority =
        crate::workspace::identity::initialize_workspace_write_gate(app, &config);
    restore_database_state(db, database)?;
    authority
}

pub(crate) fn close_database(app: &AppHandle, db: &DbState) -> Result<(), String> {
    let Some(database) = take_database(db)? else {
        return Ok(());
    };
    if let Err(error) = database.workspace_blob_stash_pending_content() {
        restore_database_state(db, database)?;
        return Err(format!(
            "Protection des documents en attente impossible : {error}"
        ));
    }
    let team_cache_sealed =
        match crate::workspace::cache_seal::seal_team_cache_database(app, database) {
            Ok(sealed) => sealed,
            Err(error) => {
                reopen_database_after_close_failure(app, db)
                    .map_err(|reopen| format!("{error} Réouverture impossible : {reopen}"))?;
                return Err(error);
            }
        };
    if team_cache_sealed {
        if let Err(error) = crate::workspace::documents::purge_local_team_document_cache(app) {
            reopen_database_after_close_failure(app, db)
                .map_err(|reopen| format!("{error} Réouverture impossible : {reopen}"))?;
            return Err(error);
        }
    }
    Ok(())
}

fn require_active_ui_session(session: &State<'_, UiSessionState>) -> Result<(), AuthCommandError> {
    require_ui_session(session).map_err(|message| AuthCommandError::new("session_locked", message))
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
                    _ => {
                        "L'authentification système n'est pas disponible sur ce poste.".to_string()
                    }
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
        AuthCommandError::new("system_auth_cancelled", "Authentification système annulée")
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
    let _system_auth_guard = SystemAuthGuard::acquire(&SYSTEM_AUTH_IN_PROGRESS)?;
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

/// Garantit que la base locale est ouverte, en sérialisant les ouvertures concurrentes.
fn open_database(
    app: &AppHandle,
    db: &State<'_, DbState>,
    auth: &State<'_, AuthState>,
) -> Result<(), String> {
    let _open_guard = DATABASE_OPEN_LOCK
        .get_or_init(|| Mutex::new(()))
        .lock()
        .map_err(|_| "Sérialisation de l'ouverture de la base inaccessible".to_string())?;
    {
        let db_guard = db
            .lock()
            .map_err(|_| "État de la base inaccessible".to_string())?;
        if db_guard.is_some() {
            drop(db_guard);
            crate::birthday_notifications::spawn_run_if_due(app);
            return Ok(());
        }
    }

    crate::workspace::cache_seal::unseal_team_cache_if_needed(app)?;
    crate::licensing::set_workspace_write_allowed(true);
    let database = Database::open(app).map_err(|e| {
        eprintln!("❌ open_database: échec ouverture base : {e}");
        format!("Échec d'ouverture de la base : {e}")
    })?;
    let workspace_config = database
        .get_workspace_config()
        .map_err(|error| format!("Configuration workspace inaccessible : {error}"))?;
    crate::workspace::identity::initialize_workspace_write_gate(app, &workspace_config)?;
    let installed_at = {
        let guard = auth
            .lock()
            .map_err(|_| "État d'authentification inaccessible".to_string())?;
        guard.as_ref().and_then(|manager| manager.created_at().ok())
    };
    if let Err(e) = crate::licensing::ensure_on_database_open(app, &database, installed_at) {
        eprintln!("⚠️ Licence : {e}");
    }
    let mut db_guard = db
        .lock()
        .map_err(|_| "État de la base inaccessible".to_string())?;
    *db_guard = Some(database);
    drop(db_guard);
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
    session: State<'_, UiSessionState>,
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

    open_database(&app, &db, &auth)?;
    session.unlock();
    Ok(())
}

/// Indique si la base est déjà ouverte côté backend (session Tauri active).
/// `try_lock` : si une commande longue (recalcul étiquettes) tient le mutex, on considère déverrouillé.
#[tauri::command]
pub fn is_database_unlocked(db: State<'_, DbState>) -> Result<bool, String> {
    match db.try_lock() {
        Ok(guard) => Ok(guard.is_some()),
        Err(TryLockError::WouldBlock) => Ok(false),
        Err(TryLockError::Poisoned(_)) => Err("État de la base inaccessible".to_string()),
    }
}

/// Statut du verrou de l'interface. La base peut rester ouverte pour le tray.
#[tauri::command]
pub fn is_ui_session_unlocked(session: State<'_, UiSessionState>) -> bool {
    session.is_unlocked()
}

/// Ping d'activité côté webview. Si le délai était déjà dépassé (notamment après
/// une veille), la session reste verrouillée et le frontend reçoit l'événement.
#[tauri::command]
pub fn touch_ui_session_activity(
    app: AppHandle,
    session: State<'_, UiSessionState>,
    db: State<'_, DbState>,
) -> bool {
    let minutes = crate::app_runtime::load_runtime_prefs(&app).auto_lock_minutes;
    let was_unlocked = session.is_unlocked();
    let mut active = session.touch_or_lock_if_idle(Duration::from_secs(u64::from(minutes) * 60));
    if was_unlocked && !active {
        match close_database(&app, db.inner()) {
            Ok(()) => {
                let _ = app.emit(UI_SESSION_LOCKED_EVENT, ());
            }
            Err(error) => {
                eprintln!("⚠️ Verrouillage différé, scellement impossible : {error}");
                session.unlock();
                active = true;
            }
        }
    }
    active
}

/// Déverrouille : vérifie le mot de passe d'accès puis ouvre la base.
/// Si la double authentification est activée, la validation système est obligatoire.
/// Idempotent : si la base est déjà ouverte (ex. rechargement HMR du frontend), ne la ferme pas.
#[tauri::command]
pub async fn unlock(
    app: AppHandle,
    auth: State<'_, AuthState>,
    db: State<'_, DbState>,
    session: State<'_, UiSessionState>,
    password: String,
) -> Result<bool, AuthCommandError> {
    verify_password(&auth, &password)?;

    if is_system_auth_enabled(&auth)? {
        authenticate_with_system(app.clone()).await?;
    }

    open_database(&app, &db, &auth).map_err(AuthCommandError::internal)?;
    session.unlock();
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
    session: State<'_, UiSessionState>,
    password: String,
    enabled: bool,
) -> Result<SystemAuthStatus, AuthCommandError> {
    require_active_ui_session(&session)?;
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
    session: State<'_, UiSessionState>,
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
    session.unlock();
    Ok(true)
}

/// Verrouille l'interface et ferme la base pour rendre les commandes IPC inopérantes.
#[tauri::command]
pub fn lock(
    app: AppHandle,
    db: State<'_, DbState>,
    session: State<'_, UiSessionState>,
) -> Result<(), String> {
    close_database(&app, db.inner())?;
    session.lock();
    Ok(())
}

#[tauri::command]
pub async fn recover_missing_team_cache_cmd(
    app: AppHandle,
    auth: State<'_, AuthState>,
    password: String,
) -> Result<crate::workspace::sync::rebuild::TeamCacheRebuildReport, AuthCommandError> {
    verify_password(&auth, &password)?;
    if is_system_auth_enabled(&auth)? {
        authenticate_with_system(app.clone()).await?;
    }
    crate::workspace::sync::rebuild::recover_missing_team_cache(&app)
        .map_err(AuthCommandError::internal)
}

/// Change le mot de passe d'accès (la base reste ouverte).
#[tauri::command]
pub fn change_master_password(
    auth: State<'_, AuthState>,
    db: State<'_, DbState>,
    session: State<'_, UiSessionState>,
    current_password: String,
    new_password: String,
) -> Result<(), AuthCommandError> {
    require_active_ui_session(&session)?;
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
    use super::{classify_system_auth_error, take_database, SystemAuthGuard};
    use crate::database::Database;
    use std::sync::atomic::AtomicBool;
    use std::sync::Mutex;

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

    #[test]
    fn rejects_overlapping_system_authentication_prompts() {
        static FLAG: AtomicBool = AtomicBool::new(false);
        let first = SystemAuthGuard::acquire(&FLAG).unwrap();
        let second = SystemAuthGuard::acquire(&FLAG).unwrap_err();
        assert_eq!(second.code, "system_auth_in_progress");
        drop(first);
        assert!(SystemAuthGuard::acquire(&FLAG).is_ok());
    }

    #[test]
    fn locking_drops_the_open_database() {
        let db = Mutex::new(Some(Database::open_in_memory_for_tests().unwrap()));
        drop(take_database(&db).unwrap());
        assert!(db.lock().unwrap().is_none());
    }
}
