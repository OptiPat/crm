pub mod commands;

use argon2::{
    password_hash::{PasswordHash, PasswordHasher, PasswordVerifier, SaltString},
    Argon2,
};
use rand::rngs::OsRng;
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;
use tauri::{AppHandle, Manager};

/// Configuration d'authentification : simple verrou d'accès local.
///
/// La base de données n'est **pas** chiffrée. Perdre ou réinitialiser ce fichier
/// ne fait donc jamais perdre les données : il suffit de redéfinir un mot de passe.
#[derive(Debug, Serialize, Deserialize)]
pub struct AuthConfig {
    pub password_hash: String,
    pub created_at: i64,
}

pub struct AuthManager {
    config_path: PathBuf,
}

impl AuthManager {
    pub fn new(app_handle: &AppHandle) -> Result<Self, String> {
        let app_data_dir = app_handle
            .path()
            .app_data_dir()
            .map_err(|e| format!("Failed to get app data directory: {}", e))?;

        fs::create_dir_all(&app_data_dir)
            .map_err(|e| format!("Failed to create app data directory: {}", e))?;

        let config_path = app_data_dir.join("auth.json");

        Ok(AuthManager { config_path })
    }

    /// Premier lancement = aucun mot de passe défini.
    pub fn is_first_launch(&self) -> bool {
        !self.config_path.exists()
    }

    /// Définit le mot de passe d'accès (premier lancement).
    pub fn create_master_password(&self, password: &str) -> Result<(), String> {
        if self.config_path.exists() {
            return Err("Master password already exists".to_string());
        }
        let config = AuthConfig {
            password_hash: Self::hash_password(password)?,
            created_at: chrono::Utc::now().timestamp(),
        };
        self.save_config(&config)?;
        println!("✅ Mot de passe d'accès créé");
        Ok(())
    }

    /// Vérifie le mot de passe d'accès (hash Argon2id).
    pub fn verify_master_password(&self, password: &str) -> Result<bool, String> {
        let config = self.load_config()?;
        let parsed_hash = PasswordHash::new(&config.password_hash)
            .map_err(|e| format!("Failed to parse hash: {}", e))?;
        Ok(Argon2::default()
            .verify_password(password.as_bytes(), &parsed_hash)
            .is_ok())
    }

    /// Change le mot de passe d'accès : vérifie l'actuel puis re-hache le nouveau.
    pub fn change_password(
        &self,
        current_password: &str,
        new_password: &str,
    ) -> Result<(), String> {
        if !self.verify_master_password(current_password)? {
            return Err("Mot de passe actuel incorrect".to_string());
        }
        let created_at = self
            .load_config()
            .map(|c| c.created_at)
            .unwrap_or_else(|_| chrono::Utc::now().timestamp());
        let config = AuthConfig {
            password_hash: Self::hash_password(new_password)?,
            created_at,
        };
        self.save_config(&config)
    }

    fn load_config(&self) -> Result<AuthConfig, String> {
        let config_str = fs::read_to_string(&self.config_path)
            .map_err(|e| format!("Failed to read config: {}", e))?;
        serde_json::from_str(&config_str).map_err(|e| format!("Failed to parse config: {}", e))
    }

    fn save_config(&self, config: &AuthConfig) -> Result<(), String> {
        let config_json = serde_json::to_string_pretty(config)
            .map_err(|e| format!("Failed to serialize config: {}", e))?;
        fs::write(&self.config_path, config_json)
            .map_err(|e| format!("Failed to write config: {}", e))
    }

    fn hash_password(password: &str) -> Result<String, String> {
        let salt = SaltString::generate(&mut OsRng);
        Ok(Argon2::default()
            .hash_password(password.as_bytes(), &salt)
            .map_err(|e| format!("Failed to hash password: {}", e))?
            .to_string())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::atomic::{AtomicU64, Ordering};
    use std::time::{SystemTime, UNIX_EPOCH};

    fn temp_manager() -> AuthManager {
        static COUNTER: AtomicU64 = AtomicU64::new(0);
        let nanos = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        let n = COUNTER.fetch_add(1, Ordering::Relaxed);
        let dir = std::env::temp_dir().join(format!("crm_auth_test_{nanos}_{n}"));
        fs::create_dir_all(&dir).unwrap();
        AuthManager {
            config_path: dir.join("auth.json"),
        }
    }

    #[test]
    fn create_then_verify_password() {
        let mgr = temp_manager();
        mgr.create_master_password("Sup3r-Secret").unwrap();
        assert!(mgr.verify_master_password("Sup3r-Secret").unwrap());
        assert!(!mgr.verify_master_password("mauvais").unwrap());
    }

    #[test]
    fn create_twice_fails() {
        let mgr = temp_manager();
        mgr.create_master_password("mdp-initial").unwrap();
        assert!(mgr.create_master_password("autre").is_err());
    }

    #[test]
    fn change_password_updates_hash() {
        let mgr = temp_manager();
        mgr.create_master_password("mdp-1").unwrap();
        mgr.change_password("mdp-1", "mdp-2").unwrap();
        assert!(!mgr.verify_master_password("mdp-1").unwrap());
        assert!(mgr.verify_master_password("mdp-2").unwrap());
    }

    #[test]
    fn change_password_wrong_current_fails() {
        let mgr = temp_manager();
        mgr.create_master_password("bon").unwrap();
        assert!(mgr.change_password("mauvais", "nouveau").is_err());
    }
}
