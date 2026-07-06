use super::oauth_secrets::{decrypt_secret, encrypt_secret, load_storage_key};
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;
use std::time::{SystemTime, UNIX_EPOCH};
use tauri::{AppHandle, Manager};

pub const OAUTH_REDIRECT_PORT: u16 = 3847;
pub const OAUTH_REDIRECT_URI: &str = "http://127.0.0.1:3847/callback";

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EmailOAuthConnection {
    pub provider: String,
    pub email: String,
    pub access_token: String,
    pub refresh_token: Option<String>,
    pub expires_at: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct EmailOAuthStore {
    pub google_client_id: Option<String>,
    /// Code secret Google (clients « Web » ou bureau avec secret exigé par Google).
    pub google_client_secret: Option<String>,
    pub microsoft_client_id: Option<String>,
    pub connection: Option<EmailOAuthConnection>,
    /// Agenda Google en complément d'une boîte Microsoft (lecture RDV campagnes).
    pub google_calendar_connection: Option<EmailOAuthConnection>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
struct PersistedOAuthStore {
    #[serde(default)]
    version: u32,
    google_client_id: Option<String>,
    #[serde(default)]
    google_client_secret_enc: Option<String>,
    microsoft_client_id: Option<String>,
    connection: Option<PersistedOAuthConnection>,
    #[serde(default)]
    google_calendar_connection: Option<PersistedOAuthConnection>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct PersistedOAuthConnection {
    provider: String,
    email: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    access_token: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    refresh_token: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    access_token_enc: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    refresh_token_enc: Option<String>,
    expires_at: i64,
}

impl EmailOAuthStore {
    pub fn load(app: &AppHandle) -> Result<Self, String> {
        let path = Self::path(app)?;
        if !path.exists() {
            return Ok(Self::default());
        }
        let raw = fs::read_to_string(&path).map_err(|e| e.to_string())?;
        let storage_key = load_storage_key(app)?;

        if let Ok(persisted) = serde_json::from_str::<PersistedOAuthStore>(&raw) {
            return Self::from_persisted(persisted, storage_key.as_ref());
        }

        // Fichier legacy (tokens en clair) — re-sauvegarde chiffrée si possible
        let legacy: EmailOAuthStore =
            serde_json::from_str(&raw).map_err(|e| format!("Parse OAuth store: {}", e))?;
        if legacy.connection.is_some() && storage_key.is_some() {
            legacy.save(app)?;
        }
        Ok(legacy)
    }

    pub fn save(&self, app: &AppHandle) -> Result<(), String> {
        let path = Self::path(app)?;
        if let Some(parent) = path.parent() {
            fs::create_dir_all(parent).map_err(|e| e.to_string())?;
        }
        let storage_key = load_storage_key(app)?;
        let persisted = self.to_persisted(storage_key.as_ref())?;
        let json = serde_json::to_string_pretty(&persisted).map_err(|e| e.to_string())?;
        fs::write(path, json).map_err(|e| e.to_string())
    }

    fn from_persisted(
        persisted: PersistedOAuthStore,
        storage_key: Option<&[u8; 32]>,
    ) -> Result<Self, String> {
        let connection = persisted
            .connection
            .map(|c| persisted_connection_to_runtime(c, storage_key))
            .transpose()?;
        let google_calendar_connection = persisted
            .google_calendar_connection
            .map(|c| persisted_connection_to_runtime(c, storage_key))
            .transpose()?;
        let google_client_secret = match (
            persisted.google_client_secret_enc.as_ref(),
            storage_key,
        ) {
            (Some(enc), Some(key)) => Some(decrypt_secret(enc, key)?),
            (Some(_), None) => {
                return Err("Code secret Google illisible (clé de stockage indisponible).".into());
            }
            (None, _) => None,
        };
        Ok(Self {
            google_client_id: persisted.google_client_id,
            google_client_secret,
            microsoft_client_id: persisted.microsoft_client_id,
            connection,
            google_calendar_connection,
        })
    }

    fn to_persisted(&self, storage_key: Option<&[u8; 32]>) -> Result<PersistedOAuthStore, String> {
        let connection = self
            .connection
            .as_ref()
            .map(|c| runtime_connection_to_persisted(c, storage_key))
            .transpose()?;
        let google_calendar_connection = self
            .google_calendar_connection
            .as_ref()
            .map(|c| runtime_connection_to_persisted(c, storage_key))
            .transpose()?;
        let google_client_secret_enc = match (self.google_client_secret.as_ref(), storage_key) {
            (Some(secret), Some(key)) if !secret.trim().is_empty() => {
                Some(encrypt_secret(secret, key)?)
            }
            (Some(_), None) => {
                return Err(
                    "Impossible de sauvegarder le code secret Google (clé de stockage indisponible)."
                        .into(),
                );
            }
            _ => None,
        };
        Ok(PersistedOAuthStore {
            version: if storage_key.is_some() { 2 } else { 1 },
            google_client_id: self.google_client_id.clone(),
            google_client_secret_enc,
            microsoft_client_id: self.microsoft_client_id.clone(),
            connection,
            google_calendar_connection,
        })
    }

    pub fn path(app: &AppHandle) -> Result<PathBuf, String> {
        let dir = app
            .path()
            .app_data_dir()
            .map_err(|e| e.to_string())?;
        Ok(dir.join("email_oauth.json"))
    }

    pub fn now_unix() -> i64 {
        SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap_or_default()
            .as_secs() as i64
    }

    pub fn connection_needs_refresh(conn: &EmailOAuthConnection) -> bool {
        conn.expires_at <= Self::now_unix() + 60
    }
}

fn persisted_connection_to_runtime(
    c: PersistedOAuthConnection,
    storage_key: Option<&[u8; 32]>,
) -> Result<EmailOAuthConnection, String> {
    if let Some(key) = storage_key {
        if let Some(enc) = c.access_token_enc.as_ref() {
            let access_token = decrypt_secret(enc, key)?;
            let refresh_token = c
                .refresh_token_enc
                .as_ref()
                .map(|r| decrypt_secret(r, key))
                .transpose()?;
            return Ok(EmailOAuthConnection {
                provider: c.provider,
                email: c.email,
                access_token,
                refresh_token,
                expires_at: c.expires_at,
            });
        }
    }
    let access_token = c
        .access_token
        .ok_or("Token OAuth manquant (fichier corrompu ou clé CRM indisponible)")?;
    Ok(EmailOAuthConnection {
        provider: c.provider,
        email: c.email,
        access_token,
        refresh_token: c.refresh_token,
        expires_at: c.expires_at,
    })
}

fn runtime_connection_to_persisted(
    c: &EmailOAuthConnection,
    storage_key: Option<&[u8; 32]>,
) -> Result<PersistedOAuthConnection, String> {
    if let Some(key) = storage_key {
        return Ok(PersistedOAuthConnection {
            provider: c.provider.clone(),
            email: c.email.clone(),
            access_token: None,
            refresh_token: None,
            access_token_enc: Some(encrypt_secret(&c.access_token, key)?),
            refresh_token_enc: c
                .refresh_token
                .as_ref()
                .map(|t| encrypt_secret(t, key))
                .transpose()?,
            expires_at: c.expires_at,
        });
    }
    Ok(PersistedOAuthConnection {
        provider: c.provider.clone(),
        email: c.email.clone(),
        access_token: Some(c.access_token.clone()),
        refresh_token: c.refresh_token.clone(),
        access_token_enc: None,
        refresh_token_enc: None,
        expires_at: c.expires_at,
    })
}
