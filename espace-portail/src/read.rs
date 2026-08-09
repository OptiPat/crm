use axum::{
    extract::{Path, State},
    http::{HeaderMap, StatusCode},
    response::IntoResponse,
    Json,
};
use serde::Serialize;

use crate::AppState;

fn strip_client_hidden_timeline_events(payload: &mut serde_json::Value) {
    let Some(timeline) = payload.get_mut("timeline").and_then(|v| v.as_array_mut()) else {
        return;
    };
    timeline.retain(|event| {
        event.get("kind").and_then(|k| k.as_str()) != Some("prochain_arbitrage")
    });
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PatrimoineResponse {
    pub contact_id: i64,
    pub sequence: i64,
    pub synced_at: i64,
    pub payload: serde_json::Value,
}

pub async fn get_patrimoine_me(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> impl IntoResponse {
    let contact_id = match crate::client_auth::resolve_session(&state, &headers) {
        Ok(id) => id,
        Err(response) => return response,
    };
    get_patrimoine_for_contact(state, contact_id).await
}

pub async fn get_patrimoine_dev(
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
    get_patrimoine_for_contact(state, contact_id).await
}

async fn get_patrimoine_for_contact(state: AppState, contact_id: i64) -> axum::response::Response {
    match state.db.get_contact_snapshot(contact_id) {
        Ok(Some(row)) => {
            let mut payload = row.payload;
            strip_client_hidden_timeline_events(&mut payload);
            (
                StatusCode::OK,
                Json(PatrimoineResponse {
                    contact_id: row.contact_id,
                    sequence: row.sequence,
                    synced_at: row.synced_at,
                    payload,
                }),
            )
                .into_response()
        }
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
