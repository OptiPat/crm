use super::AuthManager;
use crate::commands::DbState;
use crate::database::Database;
use std::sync::Mutex;
use tauri::{AppHandle, State};

pub type AuthState = Mutex<Option<AuthManager>>;

const MIN_PASSWORD_LEN: usize = 8;

/// Arrête l'API locale n8n et libère la connexion SQLite (verrou d'accès).
fn close_database(db: &State<'_, DbState>) {
    crate::local_api::stop();
    *db.lock().unwrap() = None;
}

/// Ouvre la base locale (non chiffrée) et la place dans l'état partagé.
fn open_database(app: &AppHandle, db: &State<'_, DbState>) -> Result<(), String> {
    close_database(db);

    let database = Database::open(app).map_err(|e| {
        eprintln!("❌ open_database: échec ouverture base : {e}");
        format!("Échec d'ouverture de la base : {e}")
    })?;
    if let Err(e) = crate::local_api::start_for_app(app, &database) {
        eprintln!("⚠️ API locale n8n : {e}");
    }
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
/// Renvoie une erreur si le mot de passe est incorrect.
/// Idempotent : si la base est déjà ouverte (ex. rechargement HMR du frontend), ne la ferme pas.
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

    match db.try_lock() {
        Ok(guard) => {
            if guard.is_some() {
                return Ok(true);
            }
            drop(guard);
            open_database(&app, &db)?;
        }
        Err(_) => {
            // Commande longue en cours (recalcul étiquettes…) : la base est déjà ouverte.
        }
    }
    Ok(true)
}

/// Verrouille l'application : ferme la base et l'API locale (écran de déverrouillage).
#[tauri::command]
pub fn lock(db: State<'_, DbState>) -> Result<(), String> {
    close_database(&db);
    Ok(())
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
