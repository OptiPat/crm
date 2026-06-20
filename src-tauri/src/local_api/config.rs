use crate::database::Database;
use rand::Rng;
use serde::{Deserialize, Serialize};
use std::sync::{Arc, RwLock};

pub const SETTING_ENABLED: &str = "local_api_enabled";
pub const SETTING_PORT: &str = "local_api_port";
pub const SETTING_TOKEN: &str = "local_api_token";
pub const SETTING_SCPI_N8N_WEBHOOK_URL: &str = "scpi_n8n_webhook_url";

const DEFAULT_PORT: u16 = 3001;

#[derive(Debug, Clone)]
pub struct LocalApiConfig {
    pub db_path: std::path::PathBuf,
    /// Partagé entre le thread serveur et les mises à jour (régénération token).
    pub token: Arc<RwLock<String>>,
    pub port: u16,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LocalApiSettingsPayload {
    pub enabled: bool,
    pub port: u16,
    pub token: String,
    pub birthdays_url: String,
    pub scpi_campaigns_url: String,
    pub scpi_products_url: String,
    pub health_url: String,
    #[serde(default)]
    pub scpi_n8n_webhook_url: String,
}

pub struct LocalApiSettings {
    pub enabled: bool,
    pub port: u16,
    pub token: String,
}

impl LocalApiSettings {
    pub fn load(db: &Database) -> Result<Self, String> {
        let enabled = db
            .get_setting(SETTING_ENABLED)
            .map_err(|e| e.to_string())?
            .map(|v| v != "false")
            .unwrap_or(true);

        let port = db
            .get_setting(SETTING_PORT)
            .map_err(|e| e.to_string())?
            .and_then(|v| v.parse::<u16>().ok())
            .unwrap_or(DEFAULT_PORT);

        let token = match db.get_setting(SETTING_TOKEN).map_err(|e| e.to_string())? {
            Some(value) if !value.trim().is_empty() => value,
            _ => {
                let generated = generate_token();
                db.set_setting(SETTING_TOKEN, &generated)
                    .map_err(|e| e.to_string())?;
                generated
            }
        };

        Ok(Self {
            enabled,
            port,
            token,
        })
    }

    pub fn to_payload(&self, db: &Database) -> Result<LocalApiSettingsPayload, String> {
        let scpi_n8n_webhook_url = db
            .get_setting(SETTING_SCPI_N8N_WEBHOOK_URL)
            .map_err(|e| e.to_string())?
            .unwrap_or_default();
        Ok(LocalApiSettingsPayload {
            enabled: self.enabled,
            port: self.port,
            token: self.token.clone(),
            birthdays_url: format!(
                "http://host.docker.internal:{}/api/birthdays/today",
                self.port
            ),
            scpi_campaigns_url: format!(
                "http://host.docker.internal:{}/api/scpi/campaigns/prepare",
                self.port
            ),
            scpi_products_url: format!(
                "http://host.docker.internal:{}/api/scpi/products",
                self.port
            ),
            health_url: format!("http://127.0.0.1:{}/api/health", self.port),
            scpi_n8n_webhook_url,
        })
    }
}

pub fn get_local_api_settings(db: &Database) -> Result<LocalApiSettingsPayload, String> {
    LocalApiSettings::load(db).and_then(|s| s.to_payload(db))
}

pub fn save_local_api_settings(
    db: &Database,
    enabled: bool,
    port: u16,
    scpi_n8n_webhook_url: Option<&str>,
) -> Result<LocalApiSettingsPayload, String> {
    if port == 0 {
        return Err("Le port doit être supérieur à 0.".to_string());
    }
    db.set_setting(SETTING_ENABLED, if enabled { "true" } else { "false" })
        .map_err(|e| e.to_string())?;
    db.set_setting(SETTING_PORT, &port.to_string())
        .map_err(|e| e.to_string())?;
    if let Some(url) = scpi_n8n_webhook_url {
        db.set_setting(SETTING_SCPI_N8N_WEBHOOK_URL, url.trim())
            .map_err(|e| e.to_string())?;
    }
    get_local_api_settings(db)
}

pub fn regenerate_local_api_token(db: &Database) -> Result<LocalApiSettingsPayload, String> {
    let token = generate_token();
    db.set_setting(SETTING_TOKEN, &token)
        .map_err(|e| e.to_string())?;
    get_local_api_settings(db)
}

fn generate_token() -> String {
    const CHARSET: &[u8] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
    let mut rng = rand::thread_rng();
    (0..48)
        .map(|_| {
            let idx = rng.gen_range(0..CHARSET.len());
            CHARSET[idx] as char
        })
        .collect()
}
