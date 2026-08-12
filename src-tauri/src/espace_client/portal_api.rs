use reqwest::blocking::Client;

use super::config::{load_sync_secret, PORTAL_URL_SETTING_KEY};
use super::push::sign_espace_sync_body;
use crate::database::Database;

fn portal_url(db: &Database) -> Result<String, String> {
    db.get_setting(PORTAL_URL_SETTING_KEY)
        .map_err(|e| e.to_string())?
        .map(|v| v.trim().trim_end_matches('/').to_string())
        .filter(|v| !v.is_empty())
        .ok_or_else(|| "URL du portail espace client non configurée".to_string())
}

fn http_client() -> Result<Client, String> {
    Client::builder()
        .timeout(std::time::Duration::from_secs(60))
        .build()
        .map_err(|e| e.to_string())
}

fn signed_get_bytes(
    app: &tauri::AppHandle,
    db: &Database,
    path: &str,
) -> Result<Vec<u8>, String> {
    let portal_url = portal_url(db)?;
    let secret = load_sync_secret(app, db)?;
    let timestamp = chrono::Utc::now().timestamp();
    let signature = sign_espace_sync_body(&secret, timestamp, path.as_bytes());
    let endpoint = format!("{portal_url}{path}");

    let response = http_client()?
        .get(endpoint)
        .header("X-Espace-Timestamp", timestamp.to_string())
        .header("X-Espace-Signature", signature)
        .send()
        .map_err(|e| format!("Connexion au portail impossible : {e}"))?;

    if !response.status().is_success() {
        let status = response.status();
        let detail = response.text().unwrap_or_default();
        return Err(format!("Le portail a refusé la requête ({status}) : {detail}"));
    }

    response.bytes().map(|b| b.to_vec()).map_err(|e| e.to_string())
}

fn signed_get_json<T: serde::de::DeserializeOwned>(
    app: &tauri::AppHandle,
    db: &Database,
    path: &str,
) -> Result<T, String> {
    let bytes = signed_get_bytes(app, db, path)?;
    serde_json::from_slice(&bytes).map_err(|e| e.to_string())
}

fn signed_post_bytes(
    app: &tauri::AppHandle,
    db: &Database,
    path: &str,
    body: &[u8],
) -> Result<(), String> {
    let portal_url = portal_url(db)?;
    let secret = load_sync_secret(app, db)?;
    let timestamp = chrono::Utc::now().timestamp();
    let signature = sign_espace_sync_body(&secret, timestamp, body);
    let endpoint = format!("{portal_url}{path}");

    let response = http_client()?
        .post(endpoint)
        .header("X-Espace-Timestamp", timestamp.to_string())
        .header("X-Espace-Signature", signature)
        .header("Content-Type", "application/json")
        .body(body.to_vec())
        .send()
        .map_err(|e| format!("Connexion au portail impossible : {e}"))?;

    if response.status().is_success() {
        return Ok(());
    }
    let status = response.status();
    let detail = response.text().unwrap_or_default();
    Err(format!("Le portail a refusé la requête ({status}) : {detail}"))
}

fn signed_portal_request(
    app: &tauri::AppHandle,
    db: &Database,
    method: &str,
    path: &str,
    body: Option<&[u8]>,
) -> Result<(), String> {
    let portal_url = portal_url(db)?;
    let secret = load_sync_secret(app, db)?;
    let sign_bytes = body.unwrap_or(path.as_bytes());
    let timestamp = chrono::Utc::now().timestamp();
    let signature = super::push::sign_espace_sync_body(&secret, timestamp, sign_bytes);
    let endpoint = format!("{portal_url}{path}");

    let client = Client::builder()
        .timeout(std::time::Duration::from_secs(30))
        .build()
        .map_err(|e| e.to_string())?;

    let response = match method {
        "GET" => client
            .get(endpoint)
            .header("X-Espace-Timestamp", timestamp.to_string())
            .header("X-Espace-Signature", signature)
            .send(),
        "POST" => {
            let mut request = client
                .post(endpoint)
                .header("X-Espace-Timestamp", timestamp.to_string())
                .header("X-Espace-Signature", signature);
            if let Some(bytes) = body {
                request = request
                    .header("Content-Type", "application/json")
                    .body(bytes.to_vec());
            }
            request.send()
        }
        _ => return Err("Méthode HTTP non supportée".into()),
    }
    .map_err(|e| format!("Connexion au portail impossible : {e}"))?;

    if response.status().is_success() {
        return Ok(());
    }

    let status = response.status();
    let detail = response.text().unwrap_or_default();
    Err(format!("Le portail a refusé la requête ({status}) : {detail}"))
}

pub fn push_espace_acces_revoke(
    app: &tauri::AppHandle,
    db: &Database,
    contact_id: i64,
) -> Result<(), String> {
    let path = format!("/api/v1/sync/contact/{contact_id}/revoke-acces");
    signed_portal_request(app, db, "POST", &path, None)
}

#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PortalConnexionLogLine {
    pub id: i64,
    pub contact_id: i64,
    pub event: String,
    pub detail: Option<String>,
    pub ip: Option<String>,
    pub user_agent: Option<String>,
    pub created_at: i64,
}

pub fn pull_espace_connexion_log(
    app: &tauri::AppHandle,
    db: &Database,
    contact_id: i64,
    limit: i64,
) -> Result<Vec<PortalConnexionLogLine>, String> {
    let portal_url = portal_url(db)?;
    let secret = load_sync_secret(app, db)?;
    let path = format!("/api/v1/sync/contact/{contact_id}/connexions?limit={limit}");
    let timestamp = chrono::Utc::now().timestamp();
    let signature = super::push::sign_espace_sync_body(&secret, timestamp, path.as_bytes());
    let endpoint = format!("{portal_url}{path}");

    let client = Client::builder()
        .timeout(std::time::Duration::from_secs(30))
        .build()
        .map_err(|e| e.to_string())?;

    let response = client
        .get(endpoint)
        .header("X-Espace-Timestamp", timestamp.to_string())
        .header("X-Espace-Signature", signature)
        .send()
        .map_err(|e| format!("Connexion au portail impossible : {e}"))?;

    if !response.status().is_success() {
        let status = response.status();
        let detail = response.text().unwrap_or_default();
        return Err(format!(
            "Lecture du journal portail impossible ({status}) : {detail}"
        ));
    }

    #[derive(serde::Deserialize)]
    struct Response {
        entries: Vec<PortalConnexionLogLine>,
    }

    let body: Response = response.json().map_err(|e| e.to_string())?;
    Ok(body.entries)
}

#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PortalDepotLine {
    pub demande_id: i64,
    pub filename: String,
    pub mime_type: String,
    #[allow(dead_code)]
    pub size_bytes: i64,
    #[allow(dead_code)]
    pub uploaded_at: i64,
}

pub fn pull_espace_depots(
    app: &tauri::AppHandle,
    db: &Database,
    contact_id: i64,
) -> Result<Vec<PortalDepotLine>, String> {
    let path = format!("/api/v1/sync/contact/{contact_id}/depots");
    #[derive(serde::Deserialize)]
    struct Response {
        depots: Vec<PortalDepotLine>,
    }
    let body: Response = signed_get_json(app, db, &path)?;
    Ok(body.depots)
}

pub fn download_espace_depot(
    app: &tauri::AppHandle,
    db: &Database,
    contact_id: i64,
    demande_id: i64,
) -> Result<Vec<u8>, String> {
    let path = format!("/api/v1/sync/contact/{contact_id}/depots/{demande_id}/file");
    signed_get_bytes(app, db, &path)
}

pub fn ack_espace_depot(
    app: &tauri::AppHandle,
    db: &Database,
    contact_id: i64,
    demande_id: i64,
    file_sha256: &str,
) -> Result<(), String> {
    let path = format!("/api/v1/sync/contact/{contact_id}/depots/{demande_id}/ack");
    let body = serde_json::json!({ "sha256": file_sha256 });
    let body_bytes = serde_json::to_vec(&body).map_err(|e| e.to_string())?;
    signed_post_bytes(app, db, &path, &body_bytes)
}

#[derive(serde::Deserialize, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PortalScpiDeclarationLine {
    pub id: i64,
    pub investissement_id: i64,
    pub date_ts: i64,
    pub valorisation_centimes: i64,
    pub revenu_percu_centimes: Option<i64>,
    pub created_at: i64,
}

pub fn pull_espace_scpi_declarations(
    app: &tauri::AppHandle,
    db: &Database,
    contact_id: i64,
) -> Result<Vec<PortalScpiDeclarationLine>, String> {
    let path = format!("/api/v1/sync/contact/{contact_id}/scpi-declarations");
    #[derive(serde::Deserialize)]
    struct Response {
        declarations: Vec<PortalScpiDeclarationLine>,
    }
    let body: Response = signed_get_json(app, db, &path)?;
    Ok(body.declarations)
}

pub fn ack_espace_scpi_declaration(
    app: &tauri::AppHandle,
    db: &Database,
    contact_id: i64,
    declaration_id: i64,
) -> Result<(), String> {
    let path = format!(
        "/api/v1/sync/contact/{contact_id}/scpi-declarations/{declaration_id}/ack"
    );
    signed_portal_request(app, db, "POST", &path, None)
}

