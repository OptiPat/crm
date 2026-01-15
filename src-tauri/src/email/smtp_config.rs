use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;
use tauri::{AppHandle, Manager};
use base64::Engine;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SmtpConfig {
    pub provider: String, // "gmail", "outlook", "other"
    pub smtp_server: String,
    pub smtp_port: u16,
    pub username: String,
    pub password: String, // Chiffré en base64 (à améliorer avec un vrai chiffrement)
    pub from_name: String,
    pub from_email: String,
    pub use_tls: bool,
}

impl SmtpConfig {
    pub fn load(app_handle: &AppHandle) -> Result<Option<Self>, String> {
        let config_path = Self::get_config_path(app_handle)?;
        
        if !config_path.exists() {
            return Ok(None);
        }

        let config_str = fs::read_to_string(&config_path)
            .map_err(|e| format!("Failed to read SMTP config: {}", e))?;

        let config: SmtpConfig = serde_json::from_str(&config_str)
            .map_err(|e| format!("Failed to parse SMTP config: {}", e))?;

        Ok(Some(config))
    }

    pub fn save(&self, app_handle: &AppHandle) -> Result<(), String> {
        let config_path = Self::get_config_path(app_handle)?;
        
        let config_json = serde_json::to_string_pretty(self)
            .map_err(|e| format!("Failed to serialize SMTP config: {}", e))?;

        fs::write(&config_path, config_json)
            .map_err(|e| format!("Failed to write SMTP config: {}", e))?;

        Ok(())
    }

    pub fn delete(app_handle: &AppHandle) -> Result<(), String> {
        let config_path = Self::get_config_path(app_handle)?;
        
        if config_path.exists() {
            fs::remove_file(&config_path)
                .map_err(|e| format!("Failed to delete SMTP config: {}", e))?;
        }

        Ok(())
    }

    fn get_config_path(app_handle: &AppHandle) -> Result<PathBuf, String> {
        let app_data_dir = app_handle
            .path()
            .app_data_dir()
            .map_err(|e| format!("Failed to get app data directory: {}", e))?;

        Ok(app_data_dir.join("smtp_config.json"))
    }

    // Presets pour les fournisseurs courants
    pub fn preset_gmail(username: String, password: String, from_name: String) -> Self {
        Self {
            provider: "gmail".to_string(),
            smtp_server: "smtp.gmail.com".to_string(),
            smtp_port: 587,
            username: username.clone(),
            password: base64::engine::general_purpose::STANDARD.encode(&password),
            from_name,
            from_email: username,
            use_tls: true,
        }
    }

    pub fn preset_outlook(username: String, password: String, from_name: String) -> Self {
        Self {
            provider: "outlook".to_string(),
            smtp_server: "smtp-mail.outlook.com".to_string(),
            smtp_port: 587,
            username: username.clone(),
            password: base64::engine::general_purpose::STANDARD.encode(&password),
            from_name,
            from_email: username,
            use_tls: true,
        }
    }

    pub fn decode_password(&self) -> Result<String, String> {
        let decoded = base64::engine::general_purpose::STANDARD
            .decode(&self.password)
            .map_err(|e| format!("Failed to decode password: {}", e))?;
        
        String::from_utf8(decoded)
            .map_err(|e| format!("Invalid UTF-8 in password: {}", e))
    }
}
