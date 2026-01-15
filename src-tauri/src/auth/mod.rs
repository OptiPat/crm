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

#[derive(Debug, Serialize, Deserialize)]
pub struct AuthConfig {
    pub password_hash: String,
    pub recovery_key: String,
    #[serde(default = "default_db_key")]
    pub db_encryption_key: String, // Clé de chiffrement pour SQLCipher
    pub created_at: i64,
}

// Fonction par défaut pour les anciens fichiers sans db_encryption_key
fn default_db_key() -> String {
    String::new() // Retourne une chaîne vide pour déclencher la génération dans load_config
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

        // Créer le dossier s'il n'existe pas
        fs::create_dir_all(&app_data_dir)
            .map_err(|e| format!("Failed to create app data directory: {}", e))?;

        let config_path = app_data_dir.join("auth.json");

        Ok(AuthManager { config_path })
    }

    /// Vérifie si c'est le premier lancement (pas de configuration d'authentification)
    pub fn is_first_launch(&self) -> bool {
        !self.config_path.exists()
    }

    /// Crée un nouveau mot de passe maître
    pub fn create_master_password(&self, password: &str) -> Result<String, String> {
        // Vérifier que le fichier n'existe pas déjà
        if self.config_path.exists() {
            return Err("Master password already exists".to_string());
        }

        // Générer le sel
        let salt = SaltString::generate(&mut OsRng);

        // Hacher le mot de passe avec Argon2
        let argon2 = Argon2::default();
        let password_hash = argon2
            .hash_password(password.as_bytes(), &salt)
            .map_err(|e| format!("Failed to hash password: {}", e))?
            .to_string();

        // Générer une clé de récupération (8 mots aléatoires)
        let recovery_key = Self::generate_recovery_key();

        // Générer une clé de chiffrement pour la base de données (64 caractères hexadécimaux = 256 bits)
        let db_key = Self::generate_db_encryption_key();

        // Créer la configuration
        let config = AuthConfig {
            password_hash,
            recovery_key: recovery_key.clone(),
            db_encryption_key: db_key,
            created_at: chrono::Utc::now().timestamp(),
        };

        // Sauvegarder la configuration
        self.save_config(&config)?;

        println!("✅ Master password created successfully");

        Ok(recovery_key)
    }

    /// Vérifie le mot de passe maître
    pub fn verify_master_password(&self, password: &str) -> Result<bool, String> {
        // Lire la configuration
        let config = self.load_config()?;

        // Parser le hash
        let parsed_hash = PasswordHash::new(&config.password_hash)
            .map_err(|e| format!("Failed to parse hash: {}", e))?;

        // Vérifier le mot de passe
        let argon2 = Argon2::default();
        let is_valid = argon2
            .verify_password(password.as_bytes(), &parsed_hash)
            .is_ok();

        Ok(is_valid)
    }

    /// Charge la configuration d'authentification
    fn load_config(&self) -> Result<AuthConfig, String> {
        let config_str = fs::read_to_string(&self.config_path)
            .map_err(|e| format!("Failed to read config: {}", e))?;

        let mut config: AuthConfig = serde_json::from_str(&config_str)
            .map_err(|e| format!("Failed to parse config: {}", e))?;

        // Si la clé de chiffrement DB a été générée automatiquement (migration),
        // sauvegarder le fichier mis à jour
        if config.db_encryption_key.is_empty() {
            config.db_encryption_key = Self::generate_db_encryption_key();
            self.save_config(&config)?;
            println!("✅ Migrated auth.json: added db_encryption_key");
        }

        Ok(config)
    }

    /// Sauvegarde la configuration
    fn save_config(&self, config: &AuthConfig) -> Result<(), String> {
        let config_json = serde_json::to_string_pretty(config)
            .map_err(|e| format!("Failed to serialize config: {}", e))?;
        
        fs::write(&self.config_path, config_json)
            .map_err(|e| format!("Failed to write config: {}", e))?;
        
        Ok(())
    }

    /// Génère une clé de récupération aléatoire
    fn generate_recovery_key() -> String {
        use rand::seq::SliceRandom;

        let words = vec![
            "alpha", "bravo", "charlie", "delta", "echo", "foxtrot", "golf", "hotel",
            "india", "juliet", "kilo", "lima", "mike", "november", "oscar", "papa",
            "quebec", "romeo", "sierra", "tango", "uniform", "victor", "whiskey",
            "xray", "yankee", "zulu", "phoenix", "dragon", "tiger", "eagle",
        ];

        let mut rng = OsRng;
        let selected: Vec<&str> = words.choose_multiple(&mut rng, 8).cloned().collect();

        selected.join("-")
    }

    /// Récupère la clé de récupération (pour l'afficher à l'utilisateur)
    pub fn get_recovery_key(&self) -> Result<String, String> {
        let config = self.load_config()?;
        Ok(config.recovery_key)
    }

    /// Récupère la clé de chiffrement de la base de données
    pub fn get_db_encryption_key(&self) -> Result<String, String> {
        let config = self.load_config()?;
        Ok(config.db_encryption_key)
    }

    /// Génère une clé de chiffrement aléatoire pour la base de données
    fn generate_db_encryption_key() -> String {
        use rand::RngCore;
        let mut key = [0u8; 32]; // 256 bits
        OsRng.fill_bytes(&mut key);
        hex::encode(key)
    }
}
