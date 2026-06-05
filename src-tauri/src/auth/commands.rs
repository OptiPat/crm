use super::AuthManager;
use crate::commands::DbState;
use crate::database::Database;
use std::sync::Mutex;
use tauri::{AppHandle, State};

pub type AuthState = Mutex<Option<AuthManager>>;

const MIN_PASSWORD_LEN: usize = 8;

/// Ouvre (et chiffre/migre si besoin) la base avec la DEK, puis la place dans l'état partagé.
fn open_database(app: &AppHandle, db: &State<'_, DbState>, dek_hex: &str) -> Result<(), String> {
    let database = Database::open_encrypted(app, dek_hex)
        .map_err(|e| format!("Échec d'ouverture de la base : {e}"))?;
    *db.lock().unwrap() = Some(database);
    Ok(())
}

#[tauri::command]
pub fn is_first_launch(auth: State<'_, AuthState>) -> Result<bool, String> {
    let guard = auth.lock().unwrap();
    let manager = guard.as_ref().ok_or("Auth not initialized")?;
    Ok(manager.is_first_launch())
}

/// Premier lancement : crée le mot de passe + l'enveloppe, ouvre la base chiffrée,
/// et renvoie la clé de récupération à afficher une seule fois.
#[tauri::command]
pub fn create_master_password(
    app: AppHandle,
    auth: State<'_, AuthState>,
    db: State<'_, DbState>,
    password: String,
) -> Result<String, String> {
    if password.len() < MIN_PASSWORD_LEN {
        return Err("Le mot de passe doit contenir au moins 8 caractères".to_string());
    }

    let (recovery_key, dek_hex) = {
        let guard = auth.lock().unwrap();
        let manager = guard.as_ref().ok_or("Auth not initialized")?;
        manager.create_master_password(&password)?
    };

    open_database(&app, &db, &dek_hex)?;
    Ok(recovery_key)
}

#[tauri::command]
pub fn verify_master_password(
    auth: State<'_, AuthState>,
    password: String,
) -> Result<bool, String> {
    let guard = auth.lock().unwrap();
    let manager = guard.as_ref().ok_or("Auth not initialized")?;
    manager.verify_master_password(&password)
}

/// Déverrouille avec le mot de passe : ouvre la base chiffrée (et la migre depuis le
/// format en clair si nécessaire). Renvoie une erreur si le mot de passe est incorrect.
#[tauri::command]
pub fn unlock(
    app: AppHandle,
    auth: State<'_, AuthState>,
    db: State<'_, DbState>,
    password: String,
) -> Result<bool, String> {
    let outcome = {
        let guard = auth.lock().unwrap();
        let manager = guard.as_ref().ok_or("Auth not initialized")?;
        manager.unlock_with_password(&password)?
    };

    open_database(&app, &db, &outcome.dek_hex)?;

    // Ancien format : la base vient d'être chiffrée, on migre aussi auth.json en v2.
    if outcome.legacy {
        let guard = auth.lock().unwrap();
        let manager = guard.as_ref().ok_or("Auth not initialized")?;
        manager.upgrade_legacy_to_envelope(&password, &outcome.dek_hex)?;
    }

    Ok(true)
}

/// Récupération : restitue l'accès via la clé de récupération et définit un nouveau
/// mot de passe. Une nouvelle clé de récupération est générée (récupérable via
/// `get_pending_recovery_key`).
#[tauri::command]
pub fn recover_account(
    app: AppHandle,
    auth: State<'_, AuthState>,
    db: State<'_, DbState>,
    recovery_key: String,
    new_password: String,
) -> Result<bool, String> {
    if new_password.len() < MIN_PASSWORD_LEN {
        return Err("Le mot de passe doit contenir au moins 8 caractères".to_string());
    }

    let outcome = {
        let guard = auth.lock().unwrap();
        let manager = guard.as_ref().ok_or("Auth not initialized")?;
        manager.recover_with_key(&recovery_key, &new_password)?
    };

    open_database(&app, &db, &outcome.dek_hex)?;
    Ok(true)
}

/// Change le mot de passe maître (re-scelle la clé de données, la base reste ouverte).
#[tauri::command]
pub fn change_master_password(
    auth: State<'_, AuthState>,
    current_password: String,
    new_password: String,
) -> Result<(), String> {
    if new_password.len() < MIN_PASSWORD_LEN {
        return Err("Le mot de passe doit contenir au moins 8 caractères".to_string());
    }
    let guard = auth.lock().unwrap();
    let manager = guard.as_ref().ok_or("Auth not initialized")?;
    manager.change_password(&current_password, &new_password)
}

/// Récupère puis efface la clé de récupération nouvellement générée (après
/// récupération ou changement de mot de passe), pour l'afficher une fois.
#[tauri::command]
pub fn get_pending_recovery_key(auth: State<'_, AuthState>) -> Result<Option<String>, String> {
    let guard = auth.lock().unwrap();
    let manager = guard.as_ref().ok_or("Auth not initialized")?;
    manager.take_pending_recovery_key()
}
