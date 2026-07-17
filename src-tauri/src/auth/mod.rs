pub mod commands;
pub mod session;

use argon2::{
    password_hash::{PasswordHash, PasswordHasher, PasswordVerifier, SaltString},
    Argon2,
};
use rand::rngs::OsRng;
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;
use std::time::{Duration, Instant};
use tauri::{AppHandle, Manager};

const FIRST_BLOCKED_ATTEMPT: u32 = 5;

/// Configuration d'authentification : simple verrou d'accès local.
///
/// La base de données n'est **pas** chiffrée. Perdre ou réinitialiser ce fichier
/// ne fait donc jamais perdre les données : il suffit de redéfinir un mot de passe.
#[derive(Debug, Serialize, Deserialize)]
pub struct AuthConfig {
    pub password_hash: String,
    pub created_at: i64,
    #[serde(default)]
    pub system_auth_enabled: bool,
}

#[derive(Debug, PartialEq, Eq)]
pub enum PasswordAttemptOutcome {
    Verified,
    Invalid,
    Blocked { retry_after_seconds: u64 },
}

#[derive(Debug, Default)]
struct LoginAttemptTracker {
    failed_attempts: u32,
    blocked_until: Option<Instant>,
}

impl LoginAttemptTracker {
    fn retry_after_at(&self, now: Instant) -> Option<Duration> {
        self.blocked_until
            .and_then(|until| until.checked_duration_since(now))
            .filter(|duration| !duration.is_zero())
    }

    fn record_failure_at(&mut self, now: Instant) -> Option<Duration> {
        self.failed_attempts = self.failed_attempts.saturating_add(1);
        let delay = match self.failed_attempts {
            FIRST_BLOCKED_ATTEMPT => Some(Duration::from_secs(60)),
            6 => Some(Duration::from_secs(5 * 60)),
            7 => Some(Duration::from_secs(15 * 60)),
            8.. => Some(Duration::from_secs(60 * 60)),
            _ => None,
        };
        self.blocked_until = delay.map(|duration| now + duration);
        delay
    }

    fn reset(&mut self) {
        self.failed_attempts = 0;
        self.blocked_until = None;
    }
}

pub struct AuthManager {
    config_path: PathBuf,
    login_attempts: LoginAttemptTracker,
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

        Ok(AuthManager {
            config_path,
            login_attempts: LoginAttemptTracker::default(),
        })
    }

    /// Premier lancement = aucun mot de passe défini.
    pub fn is_first_launch(&self) -> bool {
        !self.config_path.exists()
    }

    /// Horodatage de création du mot de passe (≈ date d'installation).
    pub fn created_at(&self) -> Result<i64, String> {
        if self.is_first_launch() {
            return Ok(chrono::Utc::now().timestamp());
        }
        Ok(self.load_config()?.created_at)
    }

    /// Définit le mot de passe d'accès (premier lancement).
    pub fn create_master_password(&self, password: &str) -> Result<(), String> {
        if self.config_path.exists() {
            return Err("Master password already exists".to_string());
        }
        let config = AuthConfig {
            password_hash: Self::hash_password(password)?,
            created_at: chrono::Utc::now().timestamp(),
            system_auth_enabled: false,
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

    pub fn verify_with_rate_limit(
        &mut self,
        password: &str,
    ) -> Result<PasswordAttemptOutcome, String> {
        self.verify_with_rate_limit_at(password, Instant::now())
    }

    fn verify_with_rate_limit_at(
        &mut self,
        password: &str,
        now: Instant,
    ) -> Result<PasswordAttemptOutcome, String> {
        if let Some(delay) = self.login_attempts.retry_after_at(now) {
            return Ok(PasswordAttemptOutcome::Blocked {
                retry_after_seconds: delay.as_secs().max(1),
            });
        }

        if self.verify_master_password(password)? {
            self.login_attempts.reset();
            return Ok(PasswordAttemptOutcome::Verified);
        }

        match self.login_attempts.record_failure_at(now) {
            Some(delay) => Ok(PasswordAttemptOutcome::Blocked {
                retry_after_seconds: delay.as_secs(),
            }),
            None => Ok(PasswordAttemptOutcome::Invalid),
        }
    }

    pub fn system_auth_enabled(&self) -> Result<bool, String> {
        Ok(self.load_config()?.system_auth_enabled)
    }

    pub fn set_system_auth_enabled(&self, enabled: bool) -> Result<(), String> {
        let mut config = self.load_config()?;
        config.system_auth_enabled = enabled;
        self.save_config(&config)
    }

    pub fn change_password_after_verification(&self, new_password: &str) -> Result<(), String> {
        let config = self.load_config()?;
        self.save_config(&AuthConfig {
            password_hash: Self::hash_password(new_password)?,
            created_at: config.created_at,
            system_auth_enabled: config.system_auth_enabled,
        })
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
            login_attempts: LoginAttemptTracker::default(),
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
    fn fifth_failure_starts_one_minute_block() {
        let mut mgr = temp_manager();
        mgr.create_master_password("mot-de-passe").unwrap();
        let now = Instant::now();

        for _ in 0..4 {
            assert_eq!(
                mgr.verify_with_rate_limit_at("mauvais", now).unwrap(),
                PasswordAttemptOutcome::Invalid
            );
        }
        assert_eq!(
            mgr.verify_with_rate_limit_at("mauvais", now).unwrap(),
            PasswordAttemptOutcome::Blocked {
                retry_after_seconds: 60
            }
        );
    }

    #[test]
    fn block_progresses_and_success_resets_attempts() {
        let mut mgr = temp_manager();
        mgr.create_master_password("mot-de-passe").unwrap();
        let start = Instant::now();

        for _ in 0..5 {
            let _ = mgr.verify_with_rate_limit_at("mauvais", start).unwrap();
        }
        let after_first_block = start + Duration::from_secs(61);
        assert_eq!(
            mgr.verify_with_rate_limit_at("mauvais", after_first_block)
                .unwrap(),
            PasswordAttemptOutcome::Blocked {
                retry_after_seconds: 5 * 60
            }
        );
        let after_second_block = after_first_block + Duration::from_secs(5 * 60 + 1);
        assert_eq!(
            mgr.verify_with_rate_limit_at("mot-de-passe", after_second_block)
                .unwrap(),
            PasswordAttemptOutcome::Verified
        );
        assert_eq!(
            mgr.verify_with_rate_limit_at("mauvais", after_second_block)
                .unwrap(),
            PasswordAttemptOutcome::Invalid
        );
    }

    #[test]
    fn legacy_config_defaults_system_auth_to_disabled() {
        let mgr = temp_manager();
        fs::write(
            &mgr.config_path,
            r#"{"password_hash":"test","created_at":123}"#,
        )
        .unwrap();

        assert!(!mgr.system_auth_enabled().unwrap());
    }

    #[test]
    fn password_change_preserves_system_auth_setting() {
        let mgr = temp_manager();
        mgr.create_master_password("mot-de-passe").unwrap();
        mgr.set_system_auth_enabled(true).unwrap();

        mgr.change_password_after_verification("nouveau-mot-de-passe")
            .unwrap();

        assert!(mgr.system_auth_enabled().unwrap());
        assert!(!mgr.verify_master_password("mot-de-passe").unwrap());
        assert!(mgr
            .verify_master_password("nouveau-mot-de-passe")
            .unwrap());
    }
}
