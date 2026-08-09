use crate::database::Database;
use crate::email::oauth_secrets::{decrypt_secret, encrypt_secret, load_storage_key};
use tauri::AppHandle;

/// Verrouillage R11 : posée manuellement, absente par défaut (miroir de
/// `src/lib/espace-client/espace-client-capabilities.ts`).
pub const ACTIVE_SETTING_KEY: &str = "espace_client_active";
pub const PORTAL_URL_SETTING_KEY: &str = "espace_client_portal_url";
/// Clé HMAC d'authentification auprès du portail : chiffrée au repos comme les
/// autres secrets applicatifs (cf. `docs/CHIFFREMENT.md`).
pub const SYNC_SECRET_SETTING_KEY: &str = "espace_client_sync_secret_enc";

#[derive(Debug, Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct EspaceClientSyncConfig {
    pub portal_url: Option<String>,
    pub has_sync_secret: bool,
}

/// Le portail transporte des données patrimoniales nominatives : HTTPS exigé,
/// sauf boucle locale pour le développement.
fn validate_portal_url(url: &str) -> Result<(), String> {
    if let Some(rest) = url.strip_prefix("http://") {
        let host = rest.split(['/', ':']).next().unwrap_or_default();
        if host == "localhost" || host == "127.0.0.1" {
            return Ok(());
        }
        return Err("L'URL du portail doit être en HTTPS.".into());
    }
    if url.starts_with("https://") {
        return Ok(());
    }
    Err("L'URL du portail doit commencer par https://".into())
}

pub fn parse_active_flag(value: Option<&str>) -> bool {
    matches!(
        value.map(|v| v.trim().to_lowercase()).as_deref(),
        Some("1" | "true" | "oui" | "yes")
    )
}

pub fn is_espace_client_active(db: &Database) -> Result<bool, String> {
    let value = db
        .get_setting(ACTIVE_SETTING_KEY)
        .map_err(|e| e.to_string())?;
    Ok(parse_active_flag(value.as_deref()))
}

pub fn get_sync_config(db: &Database) -> Result<EspaceClientSyncConfig, String> {
    let portal_url = db
        .get_setting(PORTAL_URL_SETTING_KEY)
        .map_err(|e| e.to_string())?
        .map(|v| v.trim().to_string())
        .filter(|v| !v.is_empty());
    let has_sync_secret = db
        .get_setting(SYNC_SECRET_SETTING_KEY)
        .map_err(|e| e.to_string())?
        .map(|v| !v.trim().is_empty())
        .unwrap_or(false);
    Ok(EspaceClientSyncConfig {
        portal_url,
        has_sync_secret,
    })
}

pub fn save_sync_config(
    app: &AppHandle,
    db: &Database,
    portal_url: &str,
    sync_secret: Option<&str>,
) -> Result<EspaceClientSyncConfig, String> {
    let url = portal_url.trim();
    if url.is_empty() {
        return Err("URL du portail requise".into());
    }
    validate_portal_url(url)?;
    db.set_setting(PORTAL_URL_SETTING_KEY, url)
        .map_err(|e| e.to_string())?;
    if let Some(secret) = sync_secret {
        let trimmed = secret.trim();
        if !trimmed.is_empty() {
            let key = load_storage_key(app)?
                .ok_or("Clé de chiffrement locale indisponible.".to_string())?;
            let encrypted = encrypt_secret(trimmed, &key)?;
            db.set_setting(SYNC_SECRET_SETTING_KEY, &encrypted)
                .map_err(|e| e.to_string())?;
        }
    }
    get_sync_config(db)
}

pub fn load_sync_secret(app: &AppHandle, db: &Database) -> Result<String, String> {
    let encrypted = db
        .get_setting(SYNC_SECRET_SETTING_KEY)
        .map_err(|e| e.to_string())?
        .map(|v| v.trim().to_string())
        .filter(|v| !v.is_empty())
        .ok_or_else(|| "Clé de synchronisation espace client non configurée".to_string())?;
    let key =
        load_storage_key(app)?.ok_or("Clé de chiffrement locale indisponible.".to_string())?;
    decrypt_secret(&encrypted, &key)
}

#[cfg(test)]
mod tests {
    use super::{parse_active_flag, validate_portal_url};

    #[test]
    fn active_flag_defaults_to_false() {
        assert!(!parse_active_flag(None));
        assert!(!parse_active_flag(Some("")));
        assert!(!parse_active_flag(Some("0")));
        assert!(!parse_active_flag(Some("non")));
        assert!(parse_active_flag(Some("1")));
        assert!(parse_active_flag(Some(" TRUE ")));
        assert!(parse_active_flag(Some("oui")));
    }

    #[test]
    fn rejects_plain_http_except_loopback() {
        assert!(validate_portal_url("https://espace.example.com").is_ok());
        assert!(validate_portal_url("http://localhost:8080").is_ok());
        assert!(validate_portal_url("http://127.0.0.1:8080").is_ok());
        assert!(validate_portal_url("http://espace.example.com").is_err());
        assert!(validate_portal_url("ftp://espace.example.com").is_err());
    }
}
