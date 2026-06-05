use super::AuthManager;
use crate::commands::DbState;
use crate::database::Database;
use std::sync::Mutex;
use tauri::{AppHandle, State};

pub type AuthState = Mutex<Option<AuthManager>>;

const MIN_PASSWORD_LEN: usize = 8;

/// Ouvre la base locale (non chiffrée) et la place dans l'état partagé.
fn open_database(app: &AppHandle, db: &State<'_, DbState>) -> Result<(), String> {
    let database = Database::open(app).map_err(|e| {
        eprintln!("❌ open_database: échec ouverture base : {e}");
        format!("Échec d'ouverture de la base : {e}")
    })?;
    *db.lock().unwrap() = Some(database);
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

    open_database(&app, &db)
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

/// Déverrouille : vérifie le mot de passe d'accès puis ouvre la base.
/// Renvoie une erreur si le mot de passe est incorrect.
#[tauri::command]
pub fn unlock(
    app: AppHandle,
    auth: State<'_, AuthState>,
    db: State<'_, DbState>,
    password: String,
) -> Result<bool, String> {
    {
        let guard = auth.lock().unwrap();
        let manager = guard.as_ref().ok_or("Auth not initialized")?;
        if !manager.verify_master_password(&password)? {
            return Err("Mot de passe incorrect".to_string());
        }
    }

    open_database(&app, &db)?;
    Ok(true)
}

/// Change le mot de passe d'accès (la base reste ouverte).
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
