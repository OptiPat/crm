use axum::{
    body::{Body, Bytes},
    extract::{Path, Query, State},
    http::{HeaderMap, StatusCode},
    response::{IntoResponse, Response},
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

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
struct DepotsResponse {
    depots: Vec<DepotLine>,
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
struct DepotLine {
    demande_id: i64,
    filename: String,
    mime_type: String,
    size_bytes: i64,
    uploaded_at: i64,
}

pub async fn get_depots(
    State(state): State<AppState>,
    Path(contact_id): Path<i64>,
    headers: HeaderMap,
) -> impl IntoResponse {
    let canonical = format!("/api/v1/sync/contact/{contact_id}/depots");
    match handle_get_depots(&state, contact_id, &headers, canonical.as_bytes()) {
        Ok(depots) => (StatusCode::OK, Json(DepotsResponse { depots })).into_response(),
        Err(message) => (
            StatusCode::BAD_REQUEST,
            Json(serde_json::json!({ "error": message })),
        )
            .into_response(),
    }
}

fn handle_get_depots(
    state: &AppState,
    contact_id: i64,
    headers: &HeaderMap,
    sign_body: &[u8],
) -> Result<Vec<DepotLine>, String> {
    verify_sync_request(state, headers, sign_body)?;
    let rows = state
        .db
        .list_depots_for_sync(contact_id)
        .map_err(|e| e.to_string())?;
    Ok(rows
        .into_iter()
        .map(|row| DepotLine {
            demande_id: row.demande_id,
            filename: row.filename,
            mime_type: row.mime_type,
            size_bytes: row.size_bytes,
            uploaded_at: row.uploaded_at,
        })
        .collect())
}

pub async fn get_depot_file(
    State(state): State<AppState>,
    Path((contact_id, demande_id)): Path<(i64, i64)>,
    headers: HeaderMap,
) -> impl IntoResponse {
    let canonical = format!("/api/v1/sync/contact/{contact_id}/depots/{demande_id}/file");
    match handle_get_depot_file(&state, contact_id, demande_id, &headers, canonical.as_bytes()) {
        Ok((bytes, mime, filename)) => {
            let mut response = Response::new(Body::from(bytes));
            *response.status_mut() = StatusCode::OK;
            let headers = response.headers_mut();
            if let Ok(value) = mime.parse() {
                headers.insert(axum::http::header::CONTENT_TYPE, value);
            }
            if let Ok(value) =
                format!("attachment; filename=\"{filename}\"").parse()
            {
                headers.insert(axum::http::header::CONTENT_DISPOSITION, value);
            }
            response.into_response()
        }
        Err(message) => (
            StatusCode::BAD_REQUEST,
            Json(serde_json::json!({ "error": message })),
        )
            .into_response(),
    }
}

fn handle_get_depot_file(
    state: &AppState,
    contact_id: i64,
    demande_id: i64,
    headers: &HeaderMap,
    sign_body: &[u8],
) -> Result<(Vec<u8>, String, String), String> {
    verify_sync_request(state, headers, sign_body)?;
    let depot = state
        .db
        .get_depot(contact_id, demande_id)
        .map_err(|e| e.to_string())?
        .ok_or_else(|| "Dépôt introuvable".to_string())?;
    let bytes = std::fs::read(&depot.stored_path).map_err(|e| e.to_string())?;
    Ok((bytes, depot.mime_type, depot.filename))
}

pub async fn post_depot_ack(
    State(state): State<AppState>,
    Path((contact_id, demande_id)): Path<(i64, i64)>,
    headers: HeaderMap,
    body: Bytes,
) -> impl IntoResponse {
    match handle_post_depot_ack(&state, contact_id, demande_id, &headers, &body) {
        Ok(()) => (StatusCode::OK, Json(serde_json::json!({ "accepted": true }))).into_response(),
        Err(message) => (
            StatusCode::BAD_REQUEST,
            Json(serde_json::json!({ "error": message })),
        )
            .into_response(),
    }
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct DepotAckBody {
    sha256: String,
}

fn handle_post_depot_ack(
    state: &AppState,
    contact_id: i64,
    demande_id: i64,
    headers: &HeaderMap,
    body: &[u8],
) -> Result<(), String> {
    verify_sync_request(state, headers, body)?;
    let parsed: DepotAckBody =
        serde_json::from_slice(body).map_err(|_| "Corps JSON invalide".to_string())?;
    if parsed.sha256.trim().is_empty() {
        return Err("Empreinte SHA-256 requise".into());
    }
    match state
        .db
        .ack_depot(contact_id, demande_id, parsed.sha256.trim())
        .map_err(|e| e.to_string())?
    {
        Some(path) => {
            tracing::info!(
                "Accusé réception dépôt contact={contact_id} demande={demande_id}"
            );
            let _ = std::fs::remove_file(path);
        }
        None => tracing::info!(
            "Accusé réception idempotent contact={contact_id} demande={demande_id}"
        ),
    }
    Ok(())
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
struct ScpiDeclarationsResponse {
    declarations: Vec<crate::scpi_declarations::ScpiDeclarationLine>,
}

pub async fn get_scpi_declarations(
    State(state): State<AppState>,
    Path(contact_id): Path<i64>,
    headers: HeaderMap,
) -> impl IntoResponse {
    let canonical = format!("/api/v1/sync/contact/{contact_id}/scpi-declarations");
    match handle_get_scpi_declarations(&state, contact_id, &headers, canonical.as_bytes()) {
        Ok(declarations) => (
            StatusCode::OK,
            Json(ScpiDeclarationsResponse { declarations }),
        )
            .into_response(),
        Err(message) => (
            StatusCode::BAD_REQUEST,
            Json(serde_json::json!({ "error": message })),
        )
            .into_response(),
    }
}

fn handle_get_scpi_declarations(
    state: &AppState,
    contact_id: i64,
    headers: &HeaderMap,
    sign_body: &[u8],
) -> Result<Vec<crate::scpi_declarations::ScpiDeclarationLine>, String> {
    verify_sync_request(state, headers, sign_body)?;
    let rows = state
        .db
        .list_scpi_declarations_pending_sync(contact_id)
        .map_err(|e| e.to_string())?;
    Ok(rows
        .into_iter()
        .map(crate::scpi_declarations::ScpiDeclarationLine::from)
        .collect())
}

pub async fn post_scpi_declaration_ack(
    State(state): State<AppState>,
    Path((contact_id, declaration_id)): Path<(i64, i64)>,
    headers: HeaderMap,
) -> impl IntoResponse {
    let canonical = format!(
        "/api/v1/sync/contact/{contact_id}/scpi-declarations/{declaration_id}/ack"
    );
    match handle_post_scpi_declaration_ack(
        &state,
        contact_id,
        declaration_id,
        &headers,
        canonical.as_bytes(),
    ) {
        Ok(()) => (StatusCode::OK, Json(serde_json::json!({ "accepted": true }))).into_response(),
        Err(message) => (
            StatusCode::BAD_REQUEST,
            Json(serde_json::json!({ "error": message })),
        )
            .into_response(),
    }
}

fn handle_post_scpi_declaration_ack(
    state: &AppState,
    contact_id: i64,
    declaration_id: i64,
    headers: &HeaderMap,
    sign_body: &[u8],
) -> Result<(), String> {
    verify_sync_request(state, headers, sign_body)?;
    let updated = state
        .db
        .ack_scpi_declaration(contact_id, declaration_id)
        .map_err(|e| e.to_string())?;
    if !updated {
        tracing::info!(
            "Accusé réception idempotent déclaration SCPI contact={contact_id} id={declaration_id}"
        );
    }
    Ok(())
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
struct AvoirDeclarationsResponse {
    declarations: Vec<crate::avoir_declarations::AvoirDeclarationLine>,
}

pub async fn get_avoir_declarations(
    State(state): State<AppState>,
    Path(contact_id): Path<i64>,
    headers: HeaderMap,
) -> impl IntoResponse {
    let canonical = format!("/api/v1/sync/contact/{contact_id}/avoir-declarations");
    match handle_get_avoir_declarations(&state, contact_id, &headers, canonical.as_bytes()) {
        Ok(declarations) => (
            StatusCode::OK,
            Json(AvoirDeclarationsResponse { declarations }),
        )
            .into_response(),
        Err(message) => (
            StatusCode::BAD_REQUEST,
            Json(serde_json::json!({ "error": message })),
        )
            .into_response(),
    }
}

fn handle_get_avoir_declarations(
    state: &AppState,
    contact_id: i64,
    headers: &HeaderMap,
    sign_body: &[u8],
) -> Result<Vec<crate::avoir_declarations::AvoirDeclarationLine>, String> {
    verify_sync_request(state, headers, sign_body)?;
    let rows = state
        .db
        .list_avoir_declarations_for_contact(contact_id)
        .map_err(|e| e.to_string())?;
    Ok(rows
        .into_iter()
        .map(crate::avoir_declarations::AvoirDeclarationLine::from)
        .collect())
}

pub async fn post_avoir_declaration_ack(
    State(state): State<AppState>,
    Path((contact_id, declaration_id)): Path<(i64, i64)>,
    headers: HeaderMap,
) -> impl IntoResponse {
    let canonical = format!(
        "/api/v1/sync/contact/{contact_id}/avoir-declarations/{declaration_id}/ack"
    );
    match handle_post_avoir_declaration_ack(
        &state,
        contact_id,
        declaration_id,
        &headers,
        canonical.as_bytes(),
    ) {
        Ok(()) => (StatusCode::OK, Json(serde_json::json!({ "accepted": true }))).into_response(),
        Err(message) => (
            StatusCode::BAD_REQUEST,
            Json(serde_json::json!({ "error": message })),
        )
            .into_response(),
    }
}

fn handle_post_avoir_declaration_ack(
    state: &AppState,
    contact_id: i64,
    declaration_id: i64,
    headers: &HeaderMap,
    sign_body: &[u8],
) -> Result<(), String> {
    verify_sync_request(state, headers, sign_body)?;
    let updated = state
        .db
        .ack_avoir_declaration(contact_id, declaration_id)
        .map_err(|e| e.to_string())?;
    if !updated {
        tracing::info!(
            "Accusé réception idempotent avoir contact={contact_id} id={declaration_id}"
        );
    }
    Ok(())
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
struct AvoirRetraitsResponse {
    retraits: Vec<crate::avoir_declarations::AvoirRetraitLine>,
}

pub async fn get_avoir_retraits(
    State(state): State<AppState>,
    Path(contact_id): Path<i64>,
    headers: HeaderMap,
) -> impl IntoResponse {
    let canonical = format!("/api/v1/sync/contact/{contact_id}/avoir-retraits");
    match handle_get_avoir_retraits(&state, contact_id, &headers, canonical.as_bytes()) {
        Ok(retraits) => (StatusCode::OK, Json(AvoirRetraitsResponse { retraits })).into_response(),
        Err(message) => (
            StatusCode::BAD_REQUEST,
            Json(serde_json::json!({ "error": message })),
        )
            .into_response(),
    }
}

fn handle_get_avoir_retraits(
    state: &AppState,
    contact_id: i64,
    headers: &HeaderMap,
    sign_body: &[u8],
) -> Result<Vec<crate::avoir_declarations::AvoirRetraitLine>, String> {
    verify_sync_request(state, headers, sign_body)?;
    let rows = state
        .db
        .list_avoir_retraits_for_contact(contact_id)
        .map_err(|e| e.to_string())?;
    Ok(rows
        .into_iter()
        .map(crate::avoir_declarations::AvoirRetraitLine::from)
        .collect())
}

pub async fn post_avoir_retrait_ack(
    State(state): State<AppState>,
    Path((contact_id, retrait_id)): Path<(i64, i64)>,
    headers: HeaderMap,
) -> impl IntoResponse {
    let canonical = format!("/api/v1/sync/contact/{contact_id}/avoir-retraits/{retrait_id}/ack");
    match handle_post_avoir_retrait_ack(
        &state,
        contact_id,
        retrait_id,
        &headers,
        canonical.as_bytes(),
    ) {
        Ok(()) => (StatusCode::OK, Json(serde_json::json!({ "accepted": true }))).into_response(),
        Err(message) => (
            StatusCode::BAD_REQUEST,
            Json(serde_json::json!({ "error": message })),
        )
            .into_response(),
    }
}

fn handle_post_avoir_retrait_ack(
    state: &AppState,
    contact_id: i64,
    retrait_id: i64,
    headers: &HeaderMap,
    sign_body: &[u8],
) -> Result<(), String> {
    verify_sync_request(state, headers, sign_body)?;
    let updated = state
        .db
        .ack_avoir_retrait(contact_id, retrait_id)
        .map_err(|e| e.to_string())?;
    if !updated {
        tracing::info!("Accusé réception idempotent retrait contact={contact_id} id={retrait_id}");
    }
    Ok(())
}

