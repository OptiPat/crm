use reqwest::blocking::Client;

use super::config::{load_sync_secret, PORTAL_URL_SETTING_KEY};
use crate::database::Database;

fn portal_url(db: &Database) -> Result<String, String> {
    db.get_setting(PORTAL_URL_SETTING_KEY)
        .map_err(|e| e.to_string())?
        .map(|v| v.trim().trim_end_matches('/').to_string())
        .filter(|v| !v.is_empty())
        .ok_or_else(|| "URL du portail espace client non configurée".to_string())
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

