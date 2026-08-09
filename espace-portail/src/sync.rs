use axum::{
    body::Bytes,
    extract::{Path, State},
    http::{HeaderMap, StatusCode},
    response::IntoResponse,
    Json,
};
use serde::Deserialize;
use serde_json::Value;

use crate::auth::verify_espace_sync_signature;
use crate::AppState;

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct SyncPayloadHeader {
    sequence: i64,
    contact: ContactRef,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ContactRef {
    contact_id: i64,
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
struct SyncResponse {
    accepted: bool,
    contact_id: i64,
    sequence: i64,
}

pub async fn receive_contact_snapshot(
    State(state): State<AppState>,
    Path(contact_id): Path<i64>,
    headers: HeaderMap,
    body: Bytes,
) -> impl IntoResponse {
    match handle_sync(&state, contact_id, &headers, &body) {
        Ok(response) => (StatusCode::OK, Json(response)).into_response(),
        Err(message) => (
            StatusCode::BAD_REQUEST,
            Json(serde_json::json!({ "error": message })),
        )
            .into_response(),
    }
}

fn handle_sync(
    state: &AppState,
    contact_id: i64,
    headers: &HeaderMap,
    body: &[u8],
) -> Result<SyncResponse, String> {
    let timestamp = parse_header(headers, "x-espace-timestamp")?
        .parse::<i64>()
        .map_err(|_| "Horodatage invalide".to_string())?;
    let signature = parse_header(headers, "x-espace-signature")?;

    verify_espace_sync_signature(&state.sync_secret, timestamp, body, &signature)?;

    let payload: Value =
        serde_json::from_slice(body).map_err(|_| "Corps JSON invalide".to_string())?;
    let header: SyncPayloadHeader = serde_json::from_value(payload.clone())
        .map_err(|_| "Contrat de synchronisation invalide".to_string())?;

    if header.contact.contact_id != contact_id {
        return Err("contact_id incohérent".into());
    }

    let json = serde_json::to_string(&payload).map_err(|e| e.to_string())?;
    let accepted = state
        .db
        .upsert_contact_snapshot(contact_id, header.sequence, &json)
        .map_err(|e| e.to_string())?;

    Ok(SyncResponse {
        accepted,
        contact_id,
        sequence: header.sequence,
    })
}

fn parse_header(headers: &HeaderMap, name: &str) -> Result<String, String> {
    headers
        .get(name)
        .and_then(|v| v.to_str().ok())
        .map(|s| s.to_string())
        .ok_or_else(|| format!("En-tête {name} manquant"))
}
