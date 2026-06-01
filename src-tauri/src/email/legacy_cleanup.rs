use tauri::{AppHandle, Manager};

/// Supprime l'ancien fichier `smtp_config.json` (connexion SMTP retirée).
pub fn remove_legacy_smtp_config(app_handle: &AppHandle) {
    let Ok(app_data_dir) = app_handle.path().app_data_dir() else {
        return;
    };
    let path = app_data_dir.join("smtp_config.json");
    if !path.is_file() {
        return;
    }
    match std::fs::remove_file(&path) {
        Ok(()) => println!("✅ Ancienne config SMTP supprimée ({})", path.display()),
        Err(e) => eprintln!("⚠️ Impossible de supprimer smtp_config.json : {e}"),
    }
}
