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
const MAX_FAILED_ATTEMPTS: u32 = 8;
const MAX_BLOCK_SECONDS: u64 = 60 * 60;

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

#[derive(Debug, Default, Serialize, Deserialize)]
#[serde(default)]
struct LoginAttemptTracker {
    failed_attempts: u32,
    blocked_until: Option<i64>,
    #[serde(skip)]
    blocked_until_monotonic: Option<Instant>,
}

impl LoginAttemptTracker {
    fn load(path: &PathBuf, wall_now: i64, monotonic_now: Instant) -> Self {
        let Ok(raw) = fs::read_to_string(path) else {
            return Self::default();
        };
        let mut tracker: Self = serde_json::from_str(&raw).unwrap_or_default();
        tracker.failed_attempts = tracker.failed_attempts.min(MAX_FAILED_ATTEMPTS);
        tracker.blocked_until = tracker.blocked_until.and_then(|until| {
            if until <= wall_now {
                None
            } else {
                Some(until.min(wall_now.saturating_add(MAX_BLOCK_SECONDS as i64)))
            }
        });
        tracker.blocked_until_monotonic = tracker.blocked_until.map(|until| {
            let remaining = until.saturating_sub(wall_now) as u64;
            monotonic_now + Duration::from_secs(remaining)
        });
        tracker
    }

    fn retry_after_at(&self, monotonic_now: Instant) -> Option<u64> {
        self.blocked_until_monotonic
            .and_then(|until| until.checked_duration_since(monotonic_now))
            .filter(|duration| !duration.is_zero())
            .map(|duration| duration.as_secs().max(1).min(MAX_BLOCK_SECONDS))
    }

    fn record_failure_at(&mut self, wall_now: i64, monotonic_now: Instant) -> Option<u64> {
        self.failed_attempts = self
            .failed_attempts
            .saturating_add(1)
            .min(MAX_FAILED_ATTEMPTS);
        let delay = match self.failed_attempts {
            FIRST_BLOCKED_ATTEMPT => Some(60),
            6 => Some(5 * 60),
            7 => Some(15 * 60),
            8.. => Some(MAX_BLOCK_SECONDS),
            _ => None,
        };
        self.blocked_until = delay.map(|seconds| wall_now.saturating_add(seconds as i64));
        self.blocked_until_monotonic =
            delay.map(|seconds| monotonic_now + Duration::from_secs(seconds));
        delay
    }

    fn reset(&mut self) {
        self.failed_attempts = 0;
        self.blocked_until = None;
        self.blocked_until_monotonic = None;
    }
}

pub struct AuthManager {
    config_path: PathBuf,
    attempts_path: PathBuf,
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
        let attempts_path = app_data_dir.join("auth_attempts.json");
        let login_attempts = if config_path.exists() {
            LoginAttemptTracker::load(
                &attempts_path,
                chrono::Utc::now().timestamp(),
                Instant::now(),
            )
        } else {
            LoginAttemptTracker::default()
        };

        Ok(AuthManager {
            config_path,
            attempts_path,
            login_attempts,
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
        let _ = fs::remove_file(&self.attempts_path);
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
        self.verify_with_rate_limit_at(
            password,
            chrono::Utc::now().timestamp(),
            Instant::now(),
        )
    }

    fn verify_with_rate_limit_at(
        &mut self,
        password: &str,
        wall_now: i64,
        monotonic_now: Instant,
    ) -> Result<PasswordAttemptOutcome, String> {
        if let Some(delay) = self.login_attempts.retry_after_at(monotonic_now) {
            return Ok(PasswordAttemptOutcome::Blocked {
                retry_after_seconds: delay.max(1),
            });
        }

        if self.verify_master_password(password)? {
            self.login_attempts.reset();
            self.persist_login_attempts();
            return Ok(PasswordAttemptOutcome::Verified);
        }

        let delay = self
            .login_attempts
            .record_failure_at(wall_now, monotonic_now);
        self.persist_login_attempts();
        match delay {
            Some(retry_after_seconds) => Ok(PasswordAttemptOutcome::Blocked {
                retry_after_seconds,
            }),
            None => Ok(PasswordAttemptOutcome::Invalid),
        }
    }

    fn persist_login_attempts(&self) {
        if self.login_attempts.failed_attempts == 0 {
            let neutral_state = serde_json::to_string_pretty(&self.login_attempts)
                .unwrap_or_else(|_| r#"{"failed_attempts":0,"blocked_until":null}"#.to_string());
            let write_result = fs::write(&self.attempts_path, neutral_state);
            let remove_result = fs::remove_file(&self.attempts_path);
            if write_result.is_err()
                && remove_result
                    .as_ref()
                    .is_err_and(|error| error.kind() != std::io::ErrorKind::NotFound)
            {
                eprintln!(
                    "⚠️ Nettoyage état tentatives impossible : écriture={:?}, suppression={:?}",
                    write_result.err(),
                    remove_result.err()
                );
            }
            return;
        }
        match serde_json::to_string_pretty(&self.login_attempts) {
            Ok(json) => {
                if let Err(error) = fs::write(&self.attempts_path, json) {
                    eprintln!("⚠️ Persistance tentatives de connexion : {error}");
                }
            }
            Err(error) => eprintln!("⚠️ Sérialisation tentatives de connexion : {error}"),
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
        crate::atomic_file::write(&self.config_path, config_json)
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
    use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};

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
            attempts_path: dir.join("auth_attempts.json"),
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
        let wall_now = 1_000_000;
        let monotonic_now = Instant::now();

        for _ in 0..4 {
            assert_eq!(
                mgr.verify_with_rate_limit_at("mauvais", wall_now, monotonic_now)
                    .unwrap(),
                PasswordAttemptOutcome::Invalid
            );
        }
        assert_eq!(
            mgr.verify_with_rate_limit_at("mauvais", wall_now, monotonic_now)
                .unwrap(),
            PasswordAttemptOutcome::Blocked {
                retry_after_seconds: 60
            }
        );
    }

    #[test]
    fn block_progresses_and_success_resets_attempts() {
        let mut mgr = temp_manager();
        mgr.create_master_password("mot-de-passe").unwrap();
        let wall_start = 1_000_000;
        let monotonic_start = Instant::now();

        for _ in 0..5 {
            let _ = mgr
                .verify_with_rate_limit_at("mauvais", wall_start, monotonic_start)
                .unwrap();
        }
        let wall_after_first = wall_start + 61;
        let monotonic_after_first = monotonic_start + Duration::from_secs(61);
        assert_eq!(
            mgr.verify_with_rate_limit_at(
                "mauvais",
                wall_after_first,
                monotonic_after_first,
            )
                .unwrap(),
            PasswordAttemptOutcome::Blocked {
                retry_after_seconds: 5 * 60
            }
        );
        let wall_after_second = wall_after_first + 5 * 60 + 1;
        let monotonic_after_second =
            monotonic_after_first + Duration::from_secs(5 * 60 + 1);
        assert_eq!(
            mgr.verify_with_rate_limit_at(
                "mot-de-passe",
                wall_after_second,
                monotonic_after_second,
            )
                .unwrap(),
            PasswordAttemptOutcome::Verified
        );
        assert_eq!(
            mgr.verify_with_rate_limit_at(
                "mauvais",
                wall_after_second,
                monotonic_after_second,
            )
                .unwrap(),
            PasswordAttemptOutcome::Invalid
        );
    }

    #[test]
    fn system_clock_change_does_not_bypass_active_runtime_block() {
        let mut mgr = temp_manager();
        mgr.create_master_password("mot-de-passe").unwrap();
        let wall_start = 1_000_000;
        let monotonic_start = Instant::now();
        for _ in 0..5 {
            let _ = mgr
                .verify_with_rate_limit_at("mauvais", wall_start, monotonic_start)
                .unwrap();
        }

        assert_eq!(
            mgr.verify_with_rate_limit_at(
                "mot-de-passe",
                wall_start + 24 * 60 * 60,
                monotonic_start + Duration::from_secs(10),
            )
            .unwrap(),
            PasswordAttemptOutcome::Blocked {
                retry_after_seconds: 50
            }
        );
    }

    #[test]
    fn progressive_blocks_reach_fifteen_then_sixty_minutes() {
        let mut mgr = temp_manager();
        mgr.create_master_password("mot-de-passe").unwrap();
        let mut wall_now = 1_000_000;
        let mut monotonic_now = Instant::now();

        for _ in 0..5 {
            let _ = mgr
                .verify_with_rate_limit_at("mauvais", wall_now, monotonic_now)
                .unwrap();
        }
        wall_now += 61;
        monotonic_now += Duration::from_secs(61);
        assert_eq!(
            mgr.verify_with_rate_limit_at("mauvais", wall_now, monotonic_now)
                .unwrap(),
            PasswordAttemptOutcome::Blocked {
                retry_after_seconds: 5 * 60
            }
        );

        wall_now += 5 * 60 + 1;
        monotonic_now += Duration::from_secs(5 * 60 + 1);
        assert_eq!(
            mgr.verify_with_rate_limit_at("mauvais", wall_now, monotonic_now)
                .unwrap(),
            PasswordAttemptOutcome::Blocked {
                retry_after_seconds: 15 * 60
            }
        );

        wall_now += 15 * 60 + 1;
        monotonic_now += Duration::from_secs(15 * 60 + 1);
        assert_eq!(
            mgr.verify_with_rate_limit_at("mauvais", wall_now, monotonic_now)
                .unwrap(),
            PasswordAttemptOutcome::Blocked {
                retry_after_seconds: MAX_BLOCK_SECONDS
            }
        );
    }

    #[test]
    fn rate_limit_survives_restart_and_success_clears_persisted_state() {
        let mut mgr = temp_manager();
        mgr.create_master_password("mot-de-passe").unwrap();
        let wall_start = 1_000_000;
        let monotonic_start = Instant::now();
        for _ in 0..5 {
            let _ = mgr
                .verify_with_rate_limit_at("mauvais", wall_start, monotonic_start)
                .unwrap();
        }
        assert!(mgr.attempts_path.exists());

        let config_path = mgr.config_path.clone();
        let attempts_path = mgr.attempts_path.clone();
        let reopened_at = Instant::now();
        let mut reopened = AuthManager {
            config_path: config_path.clone(),
            attempts_path: attempts_path.clone(),
            login_attempts:
                LoginAttemptTracker::load(&attempts_path, wall_start + 10, reopened_at),
        };
        assert_eq!(
            reopened
                .verify_with_rate_limit_at("mot-de-passe", wall_start + 10, reopened_at)
                .unwrap(),
            PasswordAttemptOutcome::Blocked {
                retry_after_seconds: 50
            }
        );
        assert_eq!(
            reopened
                .verify_with_rate_limit_at(
                    "mot-de-passe",
                    wall_start + 61,
                    reopened_at + Duration::from_secs(51),
                )
                .unwrap(),
            PasswordAttemptOutcome::Verified
        );
        assert!(!attempts_path.exists());

        let after_success_at = Instant::now();
        let mut after_success = AuthManager {
            config_path,
            attempts_path: attempts_path.clone(),
            login_attempts:
                LoginAttemptTracker::load(&attempts_path, wall_start + 61, after_success_at),
        };
        assert_eq!(
            after_success
                .verify_with_rate_limit_at("mauvais", wall_start + 61, after_success_at)
                .unwrap(),
            PasswordAttemptOutcome::Invalid
        );
    }

    #[test]
    fn persisted_future_block_is_capped_to_one_hour() {
        let mgr = temp_manager();
        let wall_now = 1_000_000;
        let monotonic_now = Instant::now();
        fs::write(
            &mgr.attempts_path,
            r#"{"failed_attempts":999,"blocked_until":9999999999}"#,
        )
        .unwrap();

        let loaded =
            LoginAttemptTracker::load(&mgr.attempts_path, wall_now, monotonic_now);
        assert_eq!(loaded.failed_attempts, MAX_FAILED_ATTEMPTS);
        assert_eq!(
            loaded.retry_after_at(monotonic_now),
            Some(MAX_BLOCK_SECONDS)
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
