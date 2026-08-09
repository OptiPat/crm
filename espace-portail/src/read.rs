use axum::{
    extract::{Path, State},
    http::StatusCode,
    response::IntoResponse,
    Json,
};
use serde::Serialize;

use crate::AppState;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PatrimoineResponse {
    pub contact_id: i64,
    pub sequence: i64,
    pub synced_at: i64,
    pub payload: serde_json::Value,
}

pub async fn get_patrimoine(
    State(state): State<AppState>,
    Path(contact_id): Path<i64>,
) -> impl IntoResponse {
    if !state.dev_mode {
        return (
            StatusCode::NOT_FOUND,
            Json(serde_json::json!({ "error": "Non disponible" })),
        )
            .into_response();
    }

    match state.db.get_contact_snapshot(contact_id) {
        Ok(Some(row)) => (
            StatusCode::OK,
            Json(PatrimoineResponse {
                contact_id: row.contact_id,
                sequence: row.sequence,
                synced_at: row.synced_at,
                payload: row.payload,
            }),
        )
            .into_response(),
        Ok(None) => (
            StatusCode::NOT_FOUND,
            Json(serde_json::json!({ "error": "Aucune synchronisation pour ce contact" })),
        )
            .into_response(),
        Err(error) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(serde_json::json!({ "error": error.to_string() })),
        )
            .into_response(),
    }
}
