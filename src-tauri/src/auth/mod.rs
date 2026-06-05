pub mod commands;
pub mod crypto;

use argon2::{
    password_hash::{PasswordHash, PasswordHasher, PasswordVerifier, SaltString},
    Argon2,
};
use rand::rngs::OsRng;
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;
use tauri::{AppHandle, Manager};

/// Version courante du format `auth.json` (chiffrement par enveloppe).
const AUTH_VERSION_ENVELOPE: u32 = 2;

#[derive(Debug, Serialize, Deserialize)]
pub struct AuthConfig {
    /// 1 = ancien format (clé DEK en clair), 2 = enveloppe (DEK scellée).
    #[serde(default = "default_version")]
    pub version: u32,
    pub password_hash: String,
    /// v1 : clé de récupération en clair. v2 : vide (jamais stockée en clair).
    #[serde(default)]
    pub recovery_key: String,
    /// v1 : DEK en clair (hex). v2 : vide.
    #[serde(default = "default_db_key")]
    pub db_encryption_key: String,
    /// v2 : sel Argon2id pour dériver la clé d'enveloppe du mot de passe (hex).
    #[serde(default)]
    pub kdf_salt: String,
    /// v2 : sel Argon2id pour la clé de récupération (hex).
    #[serde(default)]
    pub recovery_salt: String,
    /// v2 : DEK scellée par le mot de passe (hex de `nonce||ciphertext`).
    #[serde(default)]
    pub dek_wrapped_pw: String,
    /// v2 : DEK scellée par la clé de récupération (hex).
    #[serde(default)]
    pub dek_wrapped_rec: String,
    pub created_at: i64,
}

fn default_version() -> u32 {
    1
}

fn default_db_key() -> String {
    String::new()
}

/// Résultat d'un déverrouillage : la DEK (hex) + indicateur d'ancien format à migrer.
pub struct UnlockOutcome {
    pub dek_hex: String,
    /// `true` si la config était en v1 (base en clair + DEK en clair) → migration requise.
    pub legacy: bool,
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

    /// Premier lancement = pas encore de configuration d'authentification.
    pub fn is_first_launch(&self) -> bool {
        !self.config_path.exists()
    }

    /// Crée le mot de passe maître et l'enveloppe de chiffrement (v2).
    /// Retourne la clé de récupération (à afficher **une seule fois**) et la DEK (hex)
    /// que l'appelant utilisera pour ouvrir la base.
    pub fn create_master_password(&self, password: &str) -> Result<(String, String), String> {
        if self.config_path.exists() {
            return Err("Master password already exists".to_string());
        }

        let password_hash = Self::hash_password(password)?;
        let recovery_key = Self::generate_recovery_key();

        // DEK aléatoire (256 bits) : c'est elle qui chiffre la base.
        let dek = crypto::random_bytes(crypto::KEY_LEN);
        let kdf_salt = crypto::random_bytes(crypto::SALT_LEN);
        let recovery_salt = crypto::random_bytes(crypto::SALT_LEN);

        let pw_kek = crypto::derive_kek(password, &kdf_salt)?;
        let rec_kek = crypto::derive_kek(&recovery_key, &recovery_salt)?;
        let dek_wrapped_pw = crypto::wrap_dek(&dek, &pw_kek)?;
        let dek_wrapped_rec = crypto::wrap_dek(&dek, &rec_kek)?;

        let config = AuthConfig {
            version: AUTH_VERSION_ENVELOPE,
            password_hash,
            recovery_key: String::new(),
            db_encryption_key: String::new(),
            kdf_salt: hex::encode(&kdf_salt),
            recovery_salt: hex::encode(&recovery_salt),
            dek_wrapped_pw: hex::encode(&dek_wrapped_pw),
            dek_wrapped_rec: hex::encode(&dek_wrapped_rec),
            created_at: chrono::Utc::now().timestamp(),
        };
        self.save_config(&config)?;

        println!("✅ Mot de passe maître créé (chiffrement par enveloppe actif)");
        Ok((recovery_key, hex::encode(&dek)))
    }

    /// Vérifie le mot de passe maître (hash Argon2id).
    pub fn verify_master_password(&self, password: &str) -> Result<bool, String> {
        let config = self.load_config()?;
        let parsed_hash = PasswordHash::new(&config.password_hash)
            .map_err(|e| format!("Failed to parse hash: {}", e))?;
        Ok(Argon2::default()
            .verify_password(password.as_bytes(), &parsed_hash)
            .is_ok())
    }

    /// Déverrouille : restitue la DEH (hex) à partir du mot de passe.
    /// - v2 : désemballe la DEK via la clé dérivée du mot de passe.
    /// - v1 : vérifie le mot de passe puis renvoie l'ancienne DEK en clair (migration ensuite).
    pub fn unlock_with_password(&self, password: &str) -> Result<UnlockOutcome, String> {
        let config = self.load_config()?;

        if config.version >= AUTH_VERSION_ENVELOPE {
            let dek = self.unwrap_dek_with_password(&config, password)?;
            return Ok(UnlockOutcome {
                dek_hex: hex::encode(&dek),
                legacy: false,
            });
        }

        // v1 : la base est en clair, la DEK est stockée en clair.
        if !self.verify_master_password(password)? {
            return Err("Mot de passe incorrect".to_string());
        }
        let dek_hex = if config.db_encryption_key.is_empty() {
            return Err("Clé de chiffrement absente (auth.json v1 corrompu)".to_string());
        } else {
            config.db_encryption_key.clone()
        };
        Ok(UnlockOutcome {
            dek_hex,
            legacy: true,
        })
    }

    /// Récupération : restitue la DEK via la clé de récupération et redéfinit le mot de passe.
    pub fn recover_with_key(
        &self,
        recovery_key: &str,
        new_password: &str,
    ) -> Result<UnlockOutcome, String> {
        let config = self.load_config()?;
        let recovery_input = recovery_key.trim();

        let (dek, legacy) = if config.version >= AUTH_VERSION_ENVELOPE {
            let salt = hex::decode(&config.recovery_salt)
                .map_err(|_| "Sel de récupération invalide".to_string())?;
            let kek = crypto::derive_kek(recovery_input, &salt)?;
            let wrapped = hex::decode(&config.dek_wrapped_rec)
                .map_err(|_| "Donnée de récupération invalide".to_string())?;
            let dek = crypto::unwrap_dek(&wrapped, &kek)
                .map_err(|_| "Clé de récupération incorrecte".to_string())?;
            (dek, false)
        } else {
            // v1 : clé de récupération comparée en clair.
            if config.recovery_key.trim() != recovery_input {
                return Err("Clé de récupération incorrecte".to_string());
            }
            let dek = hex::decode(&config.db_encryption_key)
                .map_err(|_| "Clé de chiffrement absente (auth.json v1 corrompu)".to_string())?;
            (dek, true)
        };

        // Réécrit une enveloppe v2 complète avec le nouveau mot de passe.
        self.write_envelope(new_password, &dek)?;
        Ok(UnlockOutcome {
            dek_hex: hex::encode(&dek),
            legacy,
        })
    }

    /// Migre la config v1 → v2 (après chiffrement de la base) en scellant la DEK existante.
    pub fn upgrade_legacy_to_envelope(
        &self,
        password: &str,
        dek_hex: &str,
    ) -> Result<(), String> {
        let dek = hex::decode(dek_hex).map_err(|_| "DEK hex invalide".to_string())?;
        self.write_envelope(password, &dek)?;
        println!("✅ auth.json migré en v2 (chiffrement par enveloppe)");
        Ok(())
    }

    /// Change le mot de passe maître : re-scelle la DEK avec une nouvelle clé dérivée.
    pub fn change_password(
        &self,
        current_password: &str,
        new_password: &str,
    ) -> Result<(), String> {
        let outcome = self.unlock_with_password(current_password)?;
        let dek = hex::decode(&outcome.dek_hex).map_err(|_| "DEK hex invalide".to_string())?;
        self.write_envelope(new_password, &dek)
    }

    /// Écrit une enveloppe v2 complète (sel + DEK scellée par mot de passe ET récupération),
    /// en générant une nouvelle clé de récupération. Conserve `created_at` si possible.
    fn write_envelope(&self, password: &str, dek: &[u8]) -> Result<(), String> {
        let created_at = self
            .load_config()
            .map(|c| c.created_at)
            .unwrap_or_else(|_| chrono::Utc::now().timestamp());

        let password_hash = Self::hash_password(password)?;
        let recovery_key = Self::generate_recovery_key();
        let kdf_salt = crypto::random_bytes(crypto::SALT_LEN);
        let recovery_salt = crypto::random_bytes(crypto::SALT_LEN);

        let pw_kek = crypto::derive_kek(password, &kdf_salt)?;
        let rec_kek = crypto::derive_kek(&recovery_key, &recovery_salt)?;
        let dek_wrapped_pw = crypto::wrap_dek(dek, &pw_kek)?;
        let dek_wrapped_rec = crypto::wrap_dek(dek, &rec_kek)?;

        // La nouvelle clé de récupération doit être communiquée à l'utilisateur :
        // on la place temporairement dans un fichier annexe lu une fois par le frontend.
        self.store_pending_recovery_key(&recovery_key)?;

        let config = AuthConfig {
            version: AUTH_VERSION_ENVELOPE,
            password_hash,
            recovery_key: String::new(),
            db_encryption_key: String::new(),
            kdf_salt: hex::encode(&kdf_salt),
            recovery_salt: hex::encode(&recovery_salt),
            dek_wrapped_pw: hex::encode(&dek_wrapped_pw),
            dek_wrapped_rec: hex::encode(&dek_wrapped_rec),
            created_at,
        };
        self.save_config(&config)
    }

    fn unwrap_dek_with_password(
        &self,
        config: &AuthConfig,
        password: &str,
    ) -> Result<Vec<u8>, String> {
        let salt = hex::decode(&config.kdf_salt).map_err(|_| "Sel invalide".to_string())?;
        let kek = crypto::derive_kek(password, &salt)?;
        let wrapped =
            hex::decode(&config.dek_wrapped_pw).map_err(|_| "Donnée scellée invalide".to_string())?;
        crypto::unwrap_dek(&wrapped, &kek).map_err(|_| "Mot de passe incorrect".to_string())
    }

    /// Chemin du fichier annexe contenant une clé de récupération à présenter une fois.
    fn pending_recovery_path(&self) -> PathBuf {
        self.config_path
            .with_file_name("pending_recovery_key.txt")
    }

    fn store_pending_recovery_key(&self, recovery_key: &str) -> Result<(), String> {
        fs::write(self.pending_recovery_path(), recovery_key)
            .map_err(|e| format!("Failed to write pending recovery key: {}", e))
    }

    /// Récupère puis efface la clé de récupération en attente (après changement/récupération).
    pub fn take_pending_recovery_key(&self) -> Result<Option<String>, String> {
        let path = self.pending_recovery_path();
        if !path.exists() {
            return Ok(None);
        }
        let key = fs::read_to_string(&path)
            .map_err(|e| format!("Failed to read pending recovery key: {}", e))?;
        let _ = fs::remove_file(&path);
        Ok(Some(key))
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

    fn generate_recovery_key() -> String {
        use rand::seq::SliceRandom;
        let words = vec![
            "alpha", "bravo", "charlie", "delta", "echo", "foxtrot", "golf", "hotel", "india",
            "juliet", "kilo", "lima", "mike", "november", "oscar", "papa", "quebec", "romeo",
            "sierra", "tango", "uniform", "victor", "whiskey", "xray", "yankee", "zulu", "phoenix",
            "dragon", "tiger", "eagle",
        ];
        let mut rng = OsRng;
        let selected: Vec<&str> = words.choose_multiple(&mut rng, 8).cloned().collect();
        selected.join("-")
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
    fn create_then_unlock_with_correct_password() {
        let mgr = temp_manager();
        let (_recovery, dek_hex) = mgr.create_master_password("Sup3r-Secret").unwrap();

        let outcome = mgr.unlock_with_password("Sup3r-Secret").unwrap();
        assert!(!outcome.legacy, "config fraîche = v2, pas de migration");
        assert_eq!(outcome.dek_hex, dek_hex, "même DEK qu'à la création");
    }

    #[test]
    fn unlock_fails_with_wrong_password() {
        let mgr = temp_manager();
        mgr.create_master_password("bon-mot-de-passe").unwrap();
        assert!(mgr.unlock_with_password("mauvais").is_err());
    }

    #[test]
    fn recovery_restores_same_dek_and_sets_new_password() {
        let mgr = temp_manager();
        let (recovery, dek_hex) = mgr.create_master_password("ancien-mdp").unwrap();

        let outcome = mgr.recover_with_key(&recovery, "nouveau-mdp").unwrap();
        assert_eq!(outcome.dek_hex, dek_hex, "la récupération restitue la même DEK");

        // L'ancien mot de passe ne marche plus, le nouveau oui.
        assert!(mgr.unlock_with_password("ancien-mdp").is_err());
        assert_eq!(mgr.unlock_with_password("nouveau-mdp").unwrap().dek_hex, dek_hex);
    }

    #[test]
    fn legacy_v1_config_unlocks_and_reports_migration() {
        let mgr = temp_manager();
        let dek_hex = hex::encode(crypto::random_bytes(crypto::KEY_LEN));
        let v1 = AuthConfig {
            version: 1,
            password_hash: AuthManager::hash_password("mdp-v1").unwrap(),
            recovery_key: "alpha-bravo-charlie".to_string(),
            db_encryption_key: dek_hex.clone(),
            kdf_salt: String::new(),
            recovery_salt: String::new(),
            dek_wrapped_pw: String::new(),
            dek_wrapped_rec: String::new(),
            created_at: 0,
        };
        mgr.save_config(&v1).unwrap();

        let outcome = mgr.unlock_with_password("mdp-v1").unwrap();
        assert!(outcome.legacy, "v1 doit signaler une migration");
        assert_eq!(outcome.dek_hex, dek_hex);

        // Après migration en v2, la DEK reste identique et le format devient v2.
        mgr.upgrade_legacy_to_envelope("mdp-v1", &dek_hex).unwrap();
        let after = mgr.unlock_with_password("mdp-v1").unwrap();
        assert!(!after.legacy, "désormais v2");
        assert_eq!(after.dek_hex, dek_hex, "DEK inchangée après migration");
    }

    #[test]
    fn change_password_keeps_same_dek() {
        let mgr = temp_manager();
        let (_rec, dek_hex) = mgr.create_master_password("mdp-1").unwrap();
        mgr.change_password("mdp-1", "mdp-2").unwrap();
        assert!(mgr.unlock_with_password("mdp-1").is_err());
        assert_eq!(mgr.unlock_with_password("mdp-2").unwrap().dek_hex, dek_hex);
    }
}
