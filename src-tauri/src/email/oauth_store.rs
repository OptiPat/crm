use super::oauth_secrets::{decrypt_secret, encrypt_secret, is_legacy_secret, load_storage_key};
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;
use std::sync::{Mutex, OnceLock};
use std::time::{SystemTime, UNIX_EPOCH};
use tauri::{AppHandle, Manager};

pub const OAUTH_REDIRECT_PORT: u16 = 3847;
pub const OAUTH_REDIRECT_URI: &str = "http://127.0.0.1:3847/callback";
static OAUTH_STORE_IO_LOCK: OnceLock<Mutex<()>> = OnceLock::new();

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
        let _guard = OAUTH_STORE_IO_LOCK
            .get_or_init(|| Mutex::new(()))
            .lock()
            .map_err(|_| "Verrou du stockage OAuth indisponible.".to_string())?;
        Self::load_locked(app)
    }

    fn load_locked(app: &AppHandle) -> Result<Self, String> {
        let path = Self::path(app)?;
        if !path.exists() {
            return Ok(Self::default());
        }
        let raw = fs::read_to_string(&path).map_err(|e| e.to_string())?;
        let storage_key = load_storage_key(app)?;

        if let Ok(persisted) = serde_json::from_str::<PersistedOAuthStore>(&raw) {
            if persisted.version == 0 {
                let legacy: EmailOAuthStore =
                    serde_json::from_str(&raw).map_err(|e| format!("Parse OAuth store: {}", e))?;
                if storage_key.is_some()
                    && (legacy.connection.is_some()
                        || legacy.google_calendar_connection.is_some()
                        || legacy.google_client_secret.is_some())
                {
                    legacy.save_locked(app)?;
                }
                return Ok(legacy);
            }
            let needs_migration = persisted.needs_secret_migration();
            let store = Self::from_persisted(persisted, storage_key.as_ref())?;
            if needs_migration && storage_key.is_some() {
                store.save_locked(app)?;
            }
            return Ok(store);
        }

        // Fichier legacy (tokens en clair) — re-sauvegarde chiffrée si possible
        let legacy: EmailOAuthStore =
            serde_json::from_str(&raw).map_err(|e| format!("Parse OAuth store: {}", e))?;
        if storage_key.is_some()
            && (legacy.connection.is_some()
                || legacy.google_calendar_connection.is_some()
                || legacy.google_client_secret.is_some())
        {
            legacy.save_locked(app)?;
        }
        Ok(legacy)
    }

    pub fn save(&self, app: &AppHandle) -> Result<(), String> {
        let _guard = OAUTH_STORE_IO_LOCK
            .get_or_init(|| Mutex::new(()))
            .lock()
            .map_err(|_| "Verrou du stockage OAuth indisponible.".to_string())?;
        self.save_locked(app)
    }

    fn save_locked(&self, app: &AppHandle) -> Result<(), String> {
        let path = Self::path(app)?;
        if let Some(parent) = path.parent() {
            fs::create_dir_all(parent).map_err(|e| e.to_string())?;
        }
        let storage_key = load_storage_key(app)?;
        let persisted = self.to_persisted(storage_key.as_ref())?;
        let json = serde_json::to_string_pretty(&persisted).map_err(|e| e.to_string())?;
        crate::atomic_file::write(&path, json).map_err(|e| e.to_string())
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
            version: if storage_key.is_some() { 3 } else { 1 },
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

impl PersistedOAuthStore {
    fn needs_secret_migration(&self) -> bool {
        self.version < 3
            || self
                .google_client_secret_enc
                .as_deref()
                .is_some_and(is_legacy_secret)
            || self
                .connection
                .as_ref()
                .is_some_and(PersistedOAuthConnection::needs_secret_migration)
            || self
                .google_calendar_connection
                .as_ref()
                .is_some_and(PersistedOAuthConnection::needs_secret_migration)
    }
}

impl PersistedOAuthConnection {
    fn needs_secret_migration(&self) -> bool {
        self.access_token.is_some()
            || self.refresh_token.is_some()
            || self
                .access_token_enc
                .as_deref()
                .is_some_and(is_legacy_secret)
            || self
                .refresh_token_enc
                .as_deref()
                .is_some_and(is_legacy_secret)
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

#[cfg(test)]
mod tests {
    use super::*;
    use base64::Engine;

    fn legacy_secret_test_vector() -> String {
        let mut cipher: Vec<u8> = (0u8..16).collect();
        cipher.extend_from_slice(&[
            0x62, 0x75, 0x70, 0x60, 0x70, 0x60, 0x3a, 0x62, 0x7c, 0x6b, 0x6f,
        ]);
        base64::engine::general_purpose::STANDARD.encode(cipher)
    }

    #[test]
    fn legacy_xor_oauth_store_is_rewritten_as_authenticated_v3() {
        let key = [0x11; 32];
        let persisted = PersistedOAuthStore {
            version: 2,
            connection: Some(PersistedOAuthConnection {
                provider: "google".into(),
                email: "user@example.com".into(),
                access_token: None,
                refresh_token: None,
                access_token_enc: Some(legacy_secret_test_vector()),
                refresh_token_enc: None,
                expires_at: 123,
            }),
            ..Default::default()
        };

        assert!(persisted.needs_secret_migration());
        let runtime = EmailOAuthStore::from_persisted(persisted, Some(&key)).unwrap();
        assert_eq!(
            runtime.connection.as_ref().unwrap().access_token,
            "secret-test"
        );

        let migrated = runtime.to_persisted(Some(&key)).unwrap();
        assert_eq!(migrated.version, 3);
        assert!(migrated
            .connection
            .unwrap()
            .access_token_enc
            .unwrap()
            .starts_with("v2:"));
    }
}
