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

/// Identifiant du lien d'agenda proposé par le bouton permanent de l'espace.
/// Un seul, choisi par le conseiller : faire trancher le client entre « bilan
/// annuel » et « point rapide » lui demanderait une décision qui n'est pas la
/// sienne. Les échéances, elles, désignent chacune leur propre lien.
pub const RDV_LIEN_SETTING_KEY: &str = "espace_client_rdv_lien_id";

#[derive(Debug, Clone, serde::Serialize)]
pub struct EspaceClientSyncConfig {
    pub portal_url: Option<String>,
    pub has_sync_secret: bool,
    pub rdv_lien_id: Option<String>,
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

/// Clé privée de descellement des dépôts, chiffrée au repos comme les autres
/// secrets. Elle ne quitte jamais ce poste : le portail n'a que la publique.
pub const DEPOT_SECRET_KEY_SETTING: &str = "espace_client_depot_secret_enc";
pub const DEPOT_PUBLIC_KEY_SETTING: &str = "espace_client_depot_public";

/// Retourne la clé publique à transmettre au portail, en la créant au besoin.
pub fn ensure_depot_public_key(app: &AppHandle, db: &Database) -> Result<String, String> {
    if let Some(public) = db
        .get_setting(DEPOT_PUBLIC_KEY_SETTING)
        .map_err(|e| e.to_string())?
        .map(|v| v.trim().to_string())
        .filter(|v| !v.is_empty())
    {
        return Ok(public);
    }

    let (secret, public) = crate::espace_client::depot_crypto::generate_keypair();
    let key =
        load_storage_key(app)?.ok_or("Clé de chiffrement locale indisponible.".to_string())?;
    let secret_enc = encrypt_secret(
        &crate::espace_client::depot_crypto::hex_encode(&secret),
        &key,
    )?;
    let public_hex = crate::espace_client::depot_crypto::hex_encode(&public);

    db.set_setting(DEPOT_SECRET_KEY_SETTING, &secret_enc)
        .map_err(|e| e.to_string())?;
    db.set_setting(DEPOT_PUBLIC_KEY_SETTING, &public_hex)
        .map_err(|e| e.to_string())?;

    Ok(public_hex)
}

pub fn load_depot_secret_key(app: &AppHandle, db: &Database) -> Result<[u8; 32], String> {
    let encrypted = db
        .get_setting(DEPOT_SECRET_KEY_SETTING)
        .map_err(|e| e.to_string())?
        .filter(|v| !v.trim().is_empty())
        .ok_or_else(|| {
            "Clé de descellement absente : aucun dépôt ne peut être ouvert.".to_string()
        })?;
    let key =
        load_storage_key(app)?.ok_or("Clé de chiffrement locale indisponible.".to_string())?;
    let hex = decrypt_secret(&encrypted, &key)?;
    crate::espace_client::depot_crypto::parse_secret_key(&hex)
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
    let rdv_lien_id = db
        .get_setting(RDV_LIEN_SETTING_KEY)
        .map_err(|e| e.to_string())?
        .map(|v| v.trim().to_string())
        .filter(|v| !v.is_empty());
    Ok(EspaceClientSyncConfig {
        portal_url,
        has_sync_secret,
        rdv_lien_id,
    })
}

pub fn save_sync_config(
    app: &AppHandle,
    db: &Database,
    portal_url: &str,
    sync_secret: Option<&str>,
    rdv_lien_id: Option<&str>,
) -> Result<EspaceClientSyncConfig, String> {
    let url = portal_url.trim();
    if url.is_empty() {
        return Err("URL du portail requise".into());
    }
    validate_portal_url(url)?;

    // Après validation seulement : un échec sur l'URL ne doit pas laisser le
    // lien de rendez-vous enregistré alors que l'appel a renvoyé une erreur.
    // Chaîne vide = aucun bouton, cas volontaire et distinct de « inchangé ».
    if let Some(lien) = rdv_lien_id {
        db.set_setting(RDV_LIEN_SETTING_KEY, lien.trim())
            .map_err(|e| e.to_string())?;
    }

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
