pub mod commands;
pub mod os;

use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Path, PathBuf};
use tauri::{AppHandle, Manager};

pub const DEFAULT_DISPLAY_NAME: &str = "CRM W.Y.S";

const CONFIG_FILENAME: &str = "branding.json";
const CABINET_LOGO_BASENAME: &str = "cabinet-logo";

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq, Default)]
#[serde(rename_all = "snake_case")]
pub enum LogoMode {
    #[default]
    Default,
    Custom,
    Cabinet,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct AppBrandingConfig {
    #[serde(default = "default_display_name")]
    pub display_name: String,
    #[serde(default)]
    pub logo_mode: LogoMode,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub logo_path: Option<String>,
}

impl Default for AppBrandingConfig {
    fn default() -> Self {
        Self {
            display_name: default_display_name(),
            logo_mode: LogoMode::Default,
            logo_path: None,
        }
    }
}

fn default_display_name() -> String {
    DEFAULT_DISPLAY_NAME.to_string()
}

pub struct AppBrandingManager {
    config_path: PathBuf,
    app_data_dir: PathBuf,
}

impl AppBrandingManager {
    pub fn new(app_handle: &AppHandle) -> Result<Self, String> {
        let app_data_dir = app_handle
            .path()
            .app_data_dir()
            .map_err(|e| format!("Failed to get app data directory: {e}"))?;

        fs::create_dir_all(&app_data_dir)
            .map_err(|e| format!("Failed to create app data directory: {e}"))?;

        Ok(Self {
            config_path: app_data_dir.join(CONFIG_FILENAME),
            app_data_dir,
        })
    }

    pub fn load(&self) -> AppBrandingConfig {
        if !self.config_path.exists() {
            return AppBrandingConfig::default();
        }

        let raw = match fs::read_to_string(&self.config_path) {
            Ok(s) => s,
            Err(e) => {
                eprintln!("⚠️ branding.json illisible : {e}");
                return AppBrandingConfig::default();
            }
        };

        match serde_json::from_str::<AppBrandingConfig>(&raw) {
            Ok(config) => config,
            Err(e) => {
                eprintln!("⚠️ branding.json invalide : {e}");
                AppBrandingConfig::default()
            }
        }
    }

    pub fn save(&self, config: &AppBrandingConfig) -> Result<(), String> {
        let normalized = normalize_config(config);
        let json = serde_json::to_string_pretty(&normalized)
            .map_err(|e| format!("Failed to serialize branding: {e}"))?;
        fs::write(&self.config_path, json)
            .map_err(|e| format!("Failed to write branding.json: {e}"))
    }

    pub fn resolve_logo_path(&self, config: &AppBrandingConfig) -> Option<PathBuf> {
        match config.logo_mode {
            LogoMode::Default => None,
            LogoMode::Custom => config
                .logo_path
                .as_ref()
                .map(PathBuf::from)
                .filter(|path| {
                    crate::secure_files::validate_public_logo_path(
                        &self.app_data_dir,
                        &path.to_string_lossy(),
                    )
                    .is_ok()
                }),
            LogoMode::Cabinet => find_cabinet_logo(&self.app_data_dir),
        }
    }

    pub fn effective_display_name(&self, config: &AppBrandingConfig) -> String {
        let trimmed = config.display_name.trim();
        if trimmed.is_empty() {
            DEFAULT_DISPLAY_NAME.to_string()
        } else {
            trimmed.to_string()
        }
    }

    /// Force la regeneration icone OS au prochain apply (apres changement de logo).
    pub fn clear_os_branding_cache(&self) {
        let state_path = self.app_data_dir.join("branding-os-state.json");
        let _ = fs::remove_file(state_path);
    }
}

pub fn normalize_config(config: &AppBrandingConfig) -> AppBrandingConfig {
    let display_name = {
        let trimmed = config.display_name.trim();
        if trimmed.is_empty() {
            DEFAULT_DISPLAY_NAME.to_string()
        } else {
            trimmed.chars().take(80).collect()
        }
    };

    let logo_path = match config.logo_mode {
        LogoMode::Custom => config
            .logo_path
            .as_ref()
            .map(|p| p.trim().to_string())
            .filter(|p| !p.is_empty()),
        _ => None,
    };

    AppBrandingConfig {
        display_name,
        logo_mode: config.logo_mode,
        logo_path,
    }
}

pub fn find_cabinet_logo(app_data_dir: &Path) -> Option<PathBuf> {
    let logos_dir = app_data_dir.join("logos");
    for ext in ["png", "jpg", "webp"] {
        let path = logos_dir.join(format!("{CABINET_LOGO_BASENAME}.{ext}"));
        if path.is_file() {
            return Some(path);
        }
    }
    None
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::atomic::{AtomicU64, Ordering};
    use std::time::{SystemTime, UNIX_EPOCH};

    fn temp_manager() -> AppBrandingManager {
        static COUNTER: AtomicU64 = AtomicU64::new(0);
        let nanos = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        let n = COUNTER.fetch_add(1, Ordering::Relaxed);
        let dir = std::env::temp_dir().join(format!("crm_branding_test_{nanos}_{n}"));
        fs::create_dir_all(&dir).unwrap();
        AppBrandingManager {
            config_path: dir.join(CONFIG_FILENAME),
            app_data_dir: dir,
        }
    }

    #[test]
    fn default_config_when_missing() {
        let mgr = temp_manager();
        let config = mgr.load();
        assert_eq!(config.display_name, DEFAULT_DISPLAY_NAME);
        assert_eq!(config.logo_mode, LogoMode::Default);
    }

    #[test]
    fn save_and_load_roundtrip() {
        let mgr = temp_manager();
        let input = AppBrandingConfig {
            display_name: "  Mon CRM  ".to_string(),
            logo_mode: LogoMode::Custom,
            logo_path: Some("C:\\logos\\app-branding.png".to_string()),
        };
        mgr.save(&input).unwrap();
        let loaded = mgr.load();
        assert_eq!(loaded.display_name, "Mon CRM");
        assert_eq!(loaded.logo_mode, LogoMode::Custom);
        assert_eq!(
            loaded.logo_path.as_deref(),
            Some("C:\\logos\\app-branding.png")
        );
    }

    #[test]
    fn resolve_cabinet_logo_from_logos_dir() {
        let mgr = temp_manager();
        let logos = mgr.app_data_dir.join("logos");
        fs::create_dir_all(&logos).unwrap();
        let logo = logos.join("cabinet-logo.png");
        fs::write(&logo, b"fake").unwrap();

        let config = AppBrandingConfig {
            logo_mode: LogoMode::Cabinet,
            ..Default::default()
        };
        assert_eq!(mgr.resolve_logo_path(&config), Some(logo));
    }

    #[test]
    fn resolve_custom_logo_rejects_paths_outside_managed_logos() {
        let mgr = temp_manager();
        let logos = mgr.app_data_dir.join("logos");
        fs::create_dir_all(&logos).unwrap();
        let managed = logos.join("app-branding.png");
        let external = mgr.app_data_dir.join("external.png");
        fs::write(&managed, b"fake").unwrap();
        fs::write(&external, b"fake").unwrap();

        let mut config = AppBrandingConfig {
            logo_mode: LogoMode::Custom,
            logo_path: Some(managed.to_string_lossy().into_owned()),
            ..Default::default()
        };
        assert_eq!(mgr.resolve_logo_path(&config), Some(managed));
        config.logo_path = Some(external.to_string_lossy().into_owned());
        assert_eq!(mgr.resolve_logo_path(&config), None);
    }
}
