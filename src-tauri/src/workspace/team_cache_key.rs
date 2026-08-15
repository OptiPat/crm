//! Clé du cache équipe : délivrée par SharePoint après Entra, uniquement en mémoire.
//!
//! SQLCipher n'est pas réactivé. `patrimoine-crm.db` n'est jamais concerné.
//! Une assistante retirée du site / des groupes ne peut plus lire cette clé.

use crate::workspace::enrollment::WorkspaceEnrollment;
use crate::workspace::sharepoint::{
    ParsedSharePointListItem, SharePointGraphClient, SharePointSiteRef, LIST_CRM_SECRETS,
    TEAM_WORKSPACE_LISTS,
};
use crate::workspace::team_connection::resolve_microsoft_team_connection;
use rand::{rngs::OsRng, RngCore};
use serde_json::{json, Value};
use std::sync::{Mutex, OnceLock};
use tauri::AppHandle;

pub const TEAM_CACHE_DEK_SECRET_NAME: &str = "team-cache-dek-v1";

static SESSION_DEK: OnceLock<Mutex<Option<[u8; 32]>>> = OnceLock::new();

fn session_slot() -> &'static Mutex<Option<[u8; 32]>> {
    SESSION_DEK.get_or_init(|| Mutex::new(None))
}

pub fn session_dek() -> Result<[u8; 32], String> {
    let guard = session_slot()
        .lock()
        .map_err(|_| "Clé de cache équipe inaccessible.".to_string())?;
    guard.ok_or_else(|| {
        "Clé de cache équipe absente. Une connexion Microsoft équipe valide est requise.".to_string()
    })
}

pub fn wipe_session_dek() {
    if let Ok(mut guard) = session_slot().lock() {
        if let Some(key) = guard.as_mut() {
            key.fill(0);
        }
        *guard = None;
    }
}

fn store_session_dek(key: [u8; 32]) -> Result<[u8; 32], String> {
    let mut guard = session_slot()
        .lock()
        .map_err(|_| "Clé de cache équipe inaccessible.".to_string())?;
    *guard = Some(key);
    Ok(key)
}

pub fn encode_dek_hex(key: &[u8; 32]) -> String {
    key.iter().map(|byte| format!("{byte:02x}")).collect()
}

pub fn parse_dek_hex(value: &str) -> Result<[u8; 32], String> {
    let trimmed = value.trim();
    if trimmed.len() != 64 || !trimmed.chars().all(|ch| ch.is_ascii_hexdigit()) {
        return Err("Valeur de clé de cache équipe invalide.".into());
    }
    let mut key = [0_u8; 32];
    for (index, chunk) in trimmed.as_bytes().chunks_exact(2).enumerate() {
        let hex = std::str::from_utf8(chunk)
            .map_err(|_| "Valeur de clé de cache équipe invalide.".to_string())?;
        key[index] = u8::from_str_radix(hex, 16)
            .map_err(|_| "Valeur de clé de cache équipe invalide.".to_string())?;
    }
    Ok(key)
}

fn field_string(fields: &Value, name: &str) -> Option<String> {
    fields
        .get(name)
        .and_then(|value| value.as_str())
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(str::to_string)
}

fn dek_from_secret_items(matches: &[ParsedSharePointListItem]) -> Result<[u8; 32], String> {
    let mut unique: Option<[u8; 32]> = None;
    for item in matches {
        let value = field_string(&item.fields, "SecretValue").ok_or_else(|| {
            "Élément CRM_Secrets sans SecretValue. Le cache équipe reste fermé.".to_string()
        })?;
        let key = parse_dek_hex(&value)?;
        match unique {
            None => unique = Some(key),
            Some(existing) if existing != key => {
                return Err(
                    "Plusieurs clés de cache équipe contradictoires sur SharePoint.".into(),
                );
            }
            Some(_) => {}
        }
    }
    unique.ok_or_else(|| "Clé de cache équipe introuvable sur SharePoint.".to_string())
}

fn list_team_cache_dek_items(
    client: &SharePointGraphClient,
    access_token: &str,
    site_id: &str,
    list_id: &str,
) -> Result<Vec<ParsedSharePointListItem>, String> {
    let filter = format!("fields/SecretName eq '{TEAM_CACHE_DEK_SECRET_NAME}'");
    client.list_items_all_blocking(access_token, site_id, list_id, Some(&filter))
}

pub fn fetch_existing_team_cache_dek(
    client: &SharePointGraphClient,
    access_token: &str,
    site_id: &str,
) -> Result<[u8; 32], String> {
    let list = client
        .find_list_by_display_name_blocking(access_token, site_id, LIST_CRM_SECRETS)?
        .ok_or_else(|| "Clé de cache équipe introuvable sur SharePoint.".to_string())?;
    let matches = list_team_cache_dek_items(client, access_token, site_id, &list.id)?;
    dek_from_secret_items(&matches)
}

pub fn fetch_or_create_team_cache_dek(
    client: &SharePointGraphClient,
    access_token: &str,
    site_id: &str,
) -> Result<[u8; 32], String> {
    let list_def = TEAM_WORKSPACE_LISTS
        .iter()
        .find(|list| list.display_name == LIST_CRM_SECRETS)
        .expect("liste CRM_Secrets déclarée");
    let list = client.ensure_team_list_blocking(access_token, site_id, list_def)?;
    let matches = list_team_cache_dek_items(client, access_token, site_id, &list.id)?;
    if !matches.is_empty() {
        return dek_from_secret_items(&matches);
    }
    let mut key = [0_u8; 32];
    OsRng.fill_bytes(&mut key);
    client.create_list_item_blocking(
        access_token,
        site_id,
        &list.id,
        json!({
            "Title": TEAM_CACHE_DEK_SECRET_NAME,
            "SecretName": TEAM_CACHE_DEK_SECRET_NAME,
            "SecretValue": encode_dek_hex(&key),
        }),
    )?;
    Ok(key)
}

fn graph_client_for_enrollment(
    app: &AppHandle,
    enrollment: &WorkspaceEnrollment,
) -> Result<(SharePointGraphClient, String), String> {
    let connection = resolve_microsoft_team_connection(app)?.ok_or_else(|| {
        "Une connexion Microsoft équipe valide est requise. Le cache local reste scellé.".to_string()
    })?;
    let client = SharePointGraphClient::new(SharePointSiteRef {
        hostname: enrollment.site_hostname.clone(),
        site_path: enrollment.site_path.clone(),
    });
    Ok((client, connection.access_token))
}

/// Charge la DEK depuis SharePoint sans la créer. Toujours un aller Graph
/// (pas de court-circuit mémoire) pour détecter une révocation 403.
pub fn load_session_dek_from_sharepoint(
    app: &AppHandle,
    enrollment: &WorkspaceEnrollment,
) -> Result<[u8; 32], String> {
    let (client, access_token) = graph_client_for_enrollment(app, enrollment)?;
    let key = fetch_existing_team_cache_dek(&client, &access_token, &enrollment.site_id)?;
    store_session_dek(key)
}

/// Revalide la DEK SharePoint. Une valeur différente de celle en RAM est un échec.
pub fn refresh_session_dek_from_sharepoint(
    app: &AppHandle,
    enrollment: &WorkspaceEnrollment,
) -> Result<[u8; 32], String> {
    let (client, access_token) = graph_client_for_enrollment(app, enrollment)?;
    let fetched = fetch_existing_team_cache_dek(&client, &access_token, &enrollment.site_id)?;
    if let Ok(current) = session_dek() {
        if current != fetched {
            wipe_session_dek();
            return Err("Plusieurs clés de cache équipe contradictoires sur SharePoint.".into());
        }
    }
    store_session_dek(fetched)
}

/// Cutover conseiller : crée la DEK si elle n'existe pas encore.
pub fn ensure_session_dek_from_sharepoint(
    app: &AppHandle,
    enrollment: &WorkspaceEnrollment,
) -> Result<[u8; 32], String> {
    let (client, access_token) = graph_client_for_enrollment(app, enrollment)?;
    let key = fetch_or_create_team_cache_dek(&client, &access_token, &enrollment.site_id)?;
    store_session_dek(key)
}

#[cfg(test)]
pub fn set_session_dek_for_tests(key: [u8; 32]) {
    let mut guard = session_slot().lock().expect("session dek");
    *guard = Some(key);
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::workspace::sharepoint::test_server::{ScriptedGraphServer, ScriptedResponse};
    use serde_json::json;

    #[test]
    fn hex_roundtrip_preserves_the_key() {
        let key = [0xab_u8; 32];
        assert_eq!(parse_dek_hex(&encode_dek_hex(&key)).unwrap(), key);
        assert!(parse_dek_hex("zz").is_err());
        assert!(parse_dek_hex(&"aa".repeat(31)).is_err());
    }

    #[test]
    fn wipe_clears_the_in_memory_key() {
        set_session_dek_for_tests([9_u8; 32]);
        assert_eq!(session_dek().unwrap(), [9_u8; 32]);
        wipe_session_dek();
        assert!(session_dek().is_err());
    }

    #[test]
    fn existing_sharepoint_secret_is_loaded_and_never_overwritten() {
        let hex = encode_dek_hex(&[0x11_u8; 32]);
        let server = ScriptedGraphServer::spawn(vec![
            ScriptedResponse::json(
                200,
                r#"{"value":[{"id":"secrets-list","displayName":"CRM_Secrets","eTag":"\"1\""}]}"#,
            ),
            ScriptedResponse::json(
                200,
                r#"{"value":[{"id":"c1","name":"SecretName","displayName":"Secret name"},{"id":"c2","name":"SecretValue","displayName":"Secret value"}]}"#,
            ),
            ScriptedResponse::json(
                200,
                format!(
                    r#"{{"value":[{{"id":"9","eTag":"\"2\"","fields":{{"SecretName":"team-cache-dek-v1","SecretValue":"{hex}"}}}}]}}"#
                ),
            ),
        ]);
        let client = SharePointGraphClient::new(SharePointSiteRef {
            hostname: "contoso.sharepoint.com".into(),
            site_path: "/sites/crm-team".into(),
        })
        .with_graph_host(&server.base_url);

        let key = fetch_or_create_team_cache_dek(&client, "token", "site-id").unwrap();
        assert_eq!(key, [0x11_u8; 32]);
    }

    fn secret_item(id: &str, hex: &str) -> ParsedSharePointListItem {
        ParsedSharePointListItem {
            id: id.into(),
            etag: "\"1\"".into(),
            fields: json!({
                "SecretName": TEAM_CACHE_DEK_SECRET_NAME,
                "SecretValue": hex,
            }),
        }
    }

    #[test]
    fn duplicate_secrets_with_the_same_value_are_accepted() {
        let hex = encode_dek_hex(&[0x22_u8; 32]);
        let key = dek_from_secret_items(&[secret_item("1", &hex), secret_item("2", &hex)]).unwrap();
        assert_eq!(key, [0x22_u8; 32]);
    }

    #[test]
    fn conflicting_sharepoint_secrets_are_rejected() {
        let first = encode_dek_hex(&[0x22_u8; 32]);
        let second = encode_dek_hex(&[0x33_u8; 32]);
        let error = dek_from_secret_items(&[secret_item("1", &first), secret_item("2", &second)])
            .unwrap_err();
        assert!(error.contains("contradictoires"));
    }

    #[test]
    fn missing_secret_items_are_an_error() {
        let error = dek_from_secret_items(&[]).unwrap_err();
        assert!(error.contains("introuvable"));
    }

    #[test]
    fn empty_secrets_list_creates_a_new_dek() {
        let server = ScriptedGraphServer::spawn(vec![
            ScriptedResponse::json(
                200,
                r#"{"value":[{"id":"secrets-list","displayName":"CRM_Secrets","eTag":"\"1\""}]}"#,
            ),
            ScriptedResponse::json(
                200,
                r#"{"value":[{"id":"c1","name":"SecretName","displayName":"Secret name"},{"id":"c2","name":"SecretValue","displayName":"Secret value"}]}"#,
            ),
            ScriptedResponse::json(200, r#"{"value":[]}"#),
            ScriptedResponse::json(
                201,
                r#"{"id":"9","eTag":"\"2\"","fields":{"SecretName":"team-cache-dek-v1","SecretValue":"aa"}}"#,
            ),
        ]);
        let client = SharePointGraphClient::new(SharePointSiteRef {
            hostname: "contoso.sharepoint.com".into(),
            site_path: "/sites/crm-team".into(),
        })
        .with_graph_host(&server.base_url);

        let key = fetch_or_create_team_cache_dek(&client, "token", "site-id").unwrap();
        assert_eq!(key.len(), 32);
        assert_ne!(key, [0_u8; 32]);
    }

    #[test]
    fn fetch_existing_does_not_create_a_secret() {
        let hex = encode_dek_hex(&[0x44_u8; 32]);
        let server = ScriptedGraphServer::spawn(vec![
            ScriptedResponse::json(
                200,
                r#"{"value":[{"id":"secrets-list","displayName":"CRM_Secrets","eTag":"\"1\""}]}"#,
            ),
            ScriptedResponse::json(
                200,
                format!(
                    r#"{{"value":[{{"id":"9","eTag":"\"2\"","fields":{{"SecretName":"team-cache-dek-v1","SecretValue":"{hex}"}}}}]}}"#
                ),
            ),
        ]);
        let client = SharePointGraphClient::new(SharePointSiteRef {
            hostname: "contoso.sharepoint.com".into(),
            site_path: "/sites/crm-team".into(),
        })
        .with_graph_host(&server.base_url);

        let key = fetch_existing_team_cache_dek(&client, "token", "site-id").unwrap();
        assert_eq!(key, [0x44_u8; 32]);
    }
}
