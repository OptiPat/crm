use super::AuthManager;
use std::sync::Mutex;
use tauri::State;

pub type AuthState = Mutex<Option<AuthManager>>;

#[tauri::command]
pub fn is_first_launch(auth: State<'_, AuthState>) -> Result<bool, String> {
    let auth_guard = auth.lock().unwrap();
    let auth_manager = auth_guard.as_ref().ok_or("Auth not initialized")?;

    Ok(auth_manager.is_first_launch())
}

#[tauri::command]
pub fn create_master_password(
    auth: State<'_, AuthState>,
    password: String,
) -> Result<String, String> {
    let auth_guard = auth.lock().unwrap();
    let auth_manager = auth_guard.as_ref().ok_or("Auth not initialized")?;

    // Vérifier la force du mot de passe
    if password.len() < 8 {
        return Err("Le mot de passe doit contenir au moins 8 caractères".to_string());
    }

    auth_manager.create_master_password(&password)
}

#[tauri::command]
pub fn verify_master_password(
    auth: State<'_, AuthState>,
    password: String,
) -> Result<bool, String> {
    let auth_guard = auth.lock().unwrap();
    let auth_manager = auth_guard.as_ref().ok_or("Auth not initialized")?;

    auth_manager.verify_master_password(&password)
}

#[tauri::command]
pub fn get_recovery_key(auth: State<'_, AuthState>) -> Result<String, String> {
    let auth_guard = auth.lock().unwrap();
    let auth_manager = auth_guard.as_ref().ok_or("Auth not initialized")?;

    auth_manager.get_recovery_key()
}
