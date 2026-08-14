use hmac::{Hmac, Mac};
use reqwest::blocking::Client;
use sha2::Sha256;

use super::config::{load_sync_secret, PORTAL_URL_SETTING_KEY};
use super::sync_payload::EspaceClientSyncPayload;
use crate::database::Database;

type HmacSha256 = Hmac<Sha256>;

/// Signe les octets bruts du corps. Passer par `from_utf8_lossy` ferait
/// collisionner deux corps distincts sur une même signature (octets invalides
/// remplacés par U+FFFD).
pub fn sign_espace_sync_body(secret: &str, timestamp: i64, body: &[u8]) -> String {
    let mut mac =
        HmacSha256::new_from_slice(secret.as_bytes()).expect("HMAC accepte toute taille de cle");
    mac.update(timestamp.to_string().as_bytes());
    mac.update(b".");
    mac.update(body);
    mac.finalize()
        .into_bytes()
        .iter()
        .map(|b| format!("{b:02x}"))
        .collect()
}

/// URL + secret si le portail est configuré. `None` = pas d'URL, rien à pousser.
pub fn load_portal_push_target(
    app: &tauri::AppHandle,
    db: &Database,
) -> Result<Option<(String, String)>, String> {
    let portal_url = db
        .get_setting(PORTAL_URL_SETTING_KEY)
        .map_err(|e| e.to_string())?
        .map(|v| v.trim().trim_end_matches('/').to_string())
        .filter(|v| !v.is_empty());
    let Some(portal_url) = portal_url else {
        return Ok(None);
    };
    let secret = load_sync_secret(app, db)?;
    Ok(Some((portal_url, secret)))
}

/// Envoi HTTP seul : pas de verrou SQLite pendant les 30 s du timeout.
pub fn post_espace_client_snapshot_http(
    portal_url: &str,
    secret: &str,
    payload: &EspaceClientSyncPayload,
) -> Result<(), String> {
    let body = serde_json::to_vec(payload).map_err(|e| e.to_string())?;
    let timestamp = chrono::Utc::now().timestamp();
    let signature = sign_espace_sync_body(secret, timestamp, &body);

    let endpoint = format!(
        "{}/api/v1/sync/contact/{}",
        portal_url, payload.contact.contact_id
    );

    let client = Client::builder()
        .timeout(std::time::Duration::from_secs(30))
        .build()
        .map_err(|e| e.to_string())?;

    let response = client
        .post(endpoint)
        .header("Content-Type", "application/json")
        .header("X-Espace-Timestamp", timestamp.to_string())
        .header("X-Espace-Signature", signature)
        .body(body)
        .send()
        .map_err(|e| format!("Connexion au portail impossible : {e}"))?;

    let status = response.status();
    let response_body = response.text().unwrap_or_default();

    if status.is_success() {
        return Ok(());
    }

    let detail = if response_body.trim().is_empty() {
        status.to_string()
    } else {
        response_body
    };
    Err(format!(
        "Le portail a refusé la synchronisation ({status}) : {detail}"
    ))
}

pub fn record_espace_push_outcome(
    db: &Database,
    sequence: i64,
    ok: bool,
) -> Result<(), String> {
    db.record_espace_sync_success(if ok { "ok" } else { "error" }, Some(sequence))
        .map_err(|e| e.to_string())
}

pub fn push_espace_client_snapshot(
    app: &tauri::AppHandle,
    db: &Database,
    payload: &EspaceClientSyncPayload,
) -> Result<(), String> {
    let (portal_url, secret) = load_portal_push_target(app, db)?
        .ok_or_else(|| "URL du portail espace client non configurée".to_string())?;

    match post_espace_client_snapshot_http(&portal_url, &secret, payload) {
        Ok(()) => {
            record_espace_push_outcome(db, payload.sequence, true)?;
            Ok(())
        }
        Err(error) => {
            let _ = record_espace_push_outcome(db, payload.sequence, false);
            Err(error)
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn signature_is_stable_for_same_input() {
        let body = br#"{"schemaVersion":1}"#;
        let a = sign_espace_sync_body("secret-test", 1_700_000_000, body);
        let b = sign_espace_sync_body("secret-test", 1_700_000_000, body);
        assert_eq!(a, b);
        assert_ne!(a, sign_espace_sync_body("other", 1_700_000_000, body));
    }
}
