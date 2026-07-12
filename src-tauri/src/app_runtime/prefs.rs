use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Path, PathBuf};
use tauri::{AppHandle, Manager};

pub const RUNTIME_PREFS_FILE: &str = "runtime_prefs.json";

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(default)]
pub struct AppRuntimePrefs {
    /// Fermer la fenêtre = minimiser dans la barre des tâches (tray).
    pub close_to_tray: bool,
    /// Lancer Patrimoine CRM au démarrage de Windows.
    pub launch_at_startup: bool,
    /// Traiter les rappels email RDV Pipe en arrière-plan (tray ouvert).
    pub background_pipe_rdv_reminders: bool,
}

impl Default for AppRuntimePrefs {
    fn default() -> Self {
        Self {
            close_to_tray: true,
            launch_at_startup: false,
            background_pipe_rdv_reminders: true,
        }
    }
}

pub fn runtime_prefs_path(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("Répertoire applicatif introuvable : {e}"))?;
    Ok(dir.join(RUNTIME_PREFS_FILE))
}

pub fn load_runtime_prefs(app: &AppHandle) -> AppRuntimePrefs {
    match runtime_prefs_path(app) {
        Ok(path) => load_runtime_prefs_from_path(&path),
        Err(_) => AppRuntimePrefs::default(),
    }
}

pub fn load_runtime_prefs_from_path(path: &Path) -> AppRuntimePrefs {
    let Ok(raw) = fs::read_to_string(path) else {
        return AppRuntimePrefs::default();
    };
    serde_json::from_str(&raw).unwrap_or_default()
}

pub fn save_runtime_prefs(app: &AppHandle, prefs: &AppRuntimePrefs) -> Result<(), String> {
    let path = runtime_prefs_path(app)?;
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    let json = serde_json::to_string_pretty(prefs).map_err(|e| e.to_string())?;
    fs::write(path, json).map_err(|e| e.to_string())?;
    Ok(())
}

pub fn sync_autostart(app: &AppHandle, enabled: bool) -> Result<(), String> {
    use tauri_plugin_autostart::ManagerExt;
    let autolaunch = app.autolaunch();
    let is_enabled = autolaunch.is_enabled().map_err(|e| e.to_string())?;
    if enabled {
        if !is_enabled {
            autolaunch.enable().map_err(|e| e.to_string())?;
        }
    } else if is_enabled {
        autolaunch.disable().map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn runtime_prefs_default_and_serde_roundtrip() {
        let prefs = AppRuntimePrefs::default();
        assert!(prefs.close_to_tray);
        assert!(!prefs.launch_at_startup);
        assert!(prefs.background_pipe_rdv_reminders);
        let json = serde_json::to_string(&prefs).unwrap();
        let parsed: AppRuntimePrefs = serde_json::from_str(&json).unwrap();
        assert_eq!(parsed, prefs);
    }
}
