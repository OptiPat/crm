use axum::{
    extract::{Path, Query, State},
    http::{HeaderMap, StatusCode},
    response::IntoResponse,
    Json,
};
use serde::Deserialize;

use crate::auth::verify_espace_sync_signature;
use crate::auth_store::ConnexionLogRow;
use crate::sync::parse_header;
use crate::AppState;

#[derive(Deserialize)]
pub(crate) struct ConnexionsQuery {
    limit: Option<i64>,
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
struct ConnexionsResponse {
    entries: Vec<ConnexionLogRow>,
}

pub async fn revoke_acces(
    State(state): State<AppState>,
    Path(contact_id): Path<i64>,
    headers: HeaderMap,
) -> impl IntoResponse {
    let canonical = format!("/api/v1/sync/contact/{contact_id}/revoke-acces");
    match handle_revoke_acces(&state, contact_id, &headers, canonical.as_bytes()) {
        Ok(()) => (StatusCode::OK, Json(serde_json::json!({ "accepted": true }))).into_response(),
        Err(message) => (
            StatusCode::BAD_REQUEST,
            Json(serde_json::json!({ "error": message })),
        )
            .into_response(),
    }
}

fn handle_revoke_acces(
    state: &AppState,
    contact_id: i64,
    headers: &HeaderMap,
    sign_body: &[u8],
) -> Result<(), String> {
    verify_sync_request(state, headers, sign_body)?;
    state
        .db
        .upsert_acces_from_sync(contact_id, "revoque", None, None, None)
        .map_err(|e| e.to_string())
}

pub async fn get_connexions(
    State(state): State<AppState>,
    Path(contact_id): Path<i64>,
    Query(query): Query<ConnexionsQuery>,
    headers: HeaderMap,
) -> impl IntoResponse {
    let limit = query.limit.unwrap_or(50).clamp(1, 200);
    let canonical = format!("/api/v1/sync/contact/{contact_id}/connexions?limit={limit}");
    match handle_get_connexions(&state, contact_id, limit, &headers, canonical.as_bytes()) {
        Ok(entries) => (
            StatusCode::OK,
            Json(ConnexionsResponse { entries }),
        )
            .into_response(),
        Err(message) => (
            StatusCode::BAD_REQUEST,
            Json(serde_json::json!({ "error": message })),
        )
            .into_response(),
    }
}

fn handle_get_connexions(
    state: &AppState,
    contact_id: i64,
    limit: i64,
    headers: &HeaderMap,
    sign_body: &[u8],
) -> Result<Vec<ConnexionLogRow>, String> {
    verify_sync_request(state, headers, sign_body)?;
    state
        .db
        .list_connexion_log(contact_id, limit)
        .map_err(|e| e.to_string())
}

fn verify_sync_request(state: &AppState, headers: &HeaderMap, body: &[u8]) -> Result<(), String> {
    let timestamp = parse_header(headers, "x-espace-timestamp")?
        .parse::<i64>()
        .map_err(|_| "Horodatage invalide".to_string())?;
    let signature = parse_header(headers, "x-espace-signature")?;
    verify_espace_sync_signature(&state.sync_secret, timestamp, body, &signature)
}

