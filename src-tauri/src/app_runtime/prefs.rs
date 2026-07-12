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
    /// Master : automatisations en tray (sync, scans, rappels).
    pub background_automations: bool,
    /// Sync Gmail + Agenda en tray.
    pub background_relation_sync: bool,
    /// Scan Stellium Exceltis en tray.
    pub background_stellium_scan: bool,
    /// Notes partagées en tray.
    pub background_notes_sync: bool,
    /// Rappels email RDV Pipe en tray.
    pub background_pipe_rdv_reminders: bool,
    /// Notification anniversaires du jour en tray.
    #[serde(default, alias = "background_birthday_telegram")]
    pub background_birthday_notifications: bool,
}

impl Default for AppRuntimePrefs {
    fn default() -> Self {
        Self {
            close_to_tray: true,
            launch_at_startup: false,
            background_automations: true,
            background_relation_sync: true,
            background_stellium_scan: true,
            background_notes_sync: true,
            background_pipe_rdv_reminders: true,
            background_birthday_notifications: true,
        }
    }
}

impl AppRuntimePrefs {
    pub fn tray_tick_enabled(&self) -> bool {
        if !self.background_automations {
            return false;
        }
        self.background_relation_sync
            || self.background_stellium_scan
            || self.background_notes_sync
            || self.background_pipe_rdv_reminders
            || self.background_birthday_notifications
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
        assert!(prefs.background_automations);
        assert!(prefs.tray_tick_enabled());
        let json = serde_json::to_string(&prefs).unwrap();
        let parsed: AppRuntimePrefs = serde_json::from_str(&json).unwrap();
        assert_eq!(parsed, prefs);
    }

    #[test]
    fn tray_tick_disabled_when_master_off() {
        let prefs = AppRuntimePrefs {
            background_automations: false,
            ..AppRuntimePrefs::default()
        };
        assert!(!prefs.tray_tick_enabled());
    }

    #[test]
    fn runtime_prefs_deserializes_legacy_birthday_telegram_key() {
        let parsed: AppRuntimePrefs =
            serde_json::from_str(r#"{"background_birthday_telegram":false}"#).unwrap();
        assert!(!parsed.background_birthday_notifications);
    }
}
