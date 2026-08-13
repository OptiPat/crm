use axum::{
    extract::{Path, State},
    http::{HeaderMap, StatusCode},
    response::IntoResponse,
    Json,
};
use serde::Serialize;

use crate::AppState;

/// Le CRM ne transmet plus ni alertes ni tâches, mais les photos enregistrées
/// avant ce changement en contiennent encore — parfois avec la note de travail
/// du conseiller. L'interface les masque ; l'API, elle, servait le JSON brut.
/// Ce filtre neutralise ces anciennes photos sans attendre une resynchronisation.
const KINDS_RESERVES_AU_CONSEILLER: [&str; 3] = ["prochain_arbitrage", "alerte", "tache"];

fn strip_client_hidden_timeline_events(payload: &mut serde_json::Value) {
    let Some(timeline) = payload.get_mut("timeline").and_then(|v| v.as_array_mut()) else {
        return;
    };
    timeline.retain(|event| {
        let kind = event.get("kind").and_then(|k| k.as_str()).unwrap_or_default();
        !KINDS_RESERVES_AU_CONSEILLER.contains(&kind)
    });
}

/// Une adresse de rendez-vous non sécurisée ne doit pas être proposée depuis
/// une page qui affiche du patrimoine, même si elle a franchi la
/// synchronisation : le portail refait le contrôle pour son propre compte.
fn strip_unsafe_rdv_url(payload: &mut serde_json::Value) {
    let est_sur = |valeur: Option<&serde_json::Value>| {
        valeur
            .and_then(|v| v.as_str())
            .map(|url| url.trim().starts_with("https://"))
            .unwrap_or(false)
    };

    if !est_sur(payload.get("rdvUrl")) {
        if let Some(objet) = payload.as_object_mut() {
            objet.remove("rdvUrl");
        }
    }

    if let Some(timeline) = payload.get_mut("timeline").and_then(|v| v.as_array_mut()) {
        for event in timeline.iter_mut() {
            if event.get("rdvUrl").is_some() && !est_sur(event.get("rdvUrl")) {
                if let Some(objet) = event.as_object_mut() {
                    objet.remove("rdvUrl");
                }
            }
        }
    }
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
            strip_unsafe_rdv_url(&mut payload);
            if let Ok(declarations) = state.db.list_scpi_declarations_for_contact(contact_id) {
                crate::scpi_declarations::overlay_scpi_declarations(&mut payload, &declarations);
            }
            if let Ok(avoirs) = state.db.list_avoir_declarations_for_contact(contact_id) {
                crate::avoir_declarations::overlay_avoir_declarations(&mut payload, &avoirs);
            }
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

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    /// Une photo enregistrée avant le changement porte encore la note de
    /// travail du conseiller : elle ne doit pas ressortir par l'API.
    #[test]
    fn legacy_snapshots_lose_advisor_entries() {
        let mut payload = json!({
            "timeline": [
                { "id": "alerte-1", "kind": "alerte", "label": "Suivi annuel",
                  "detail": "Relancer, ne repond jamais" },
                { "id": "tache-1", "kind": "tache", "label": "Rendez-vous / tache" },
                { "id": "inv-1-fin_pret", "kind": "fin_pret", "label": "Fin de prêt" },
            ]
        });

        strip_client_hidden_timeline_events(&mut payload);

        let restants = payload["timeline"].as_array().unwrap();
        assert_eq!(restants.len(), 1);
        assert_eq!(restants[0]["kind"], "fin_pret");
    }

    #[test]
    fn insecure_booking_urls_are_dropped() {
        let mut payload = json!({
            "rdvUrl": "http://agenda.example.com/general",
            "timeline": [
                { "id": "echeance-1", "kind": "conseiller", "label": "Déclaration",
                  "rdvUrl": "http://agenda.example.com/bilan" },
                { "id": "echeance-2", "kind": "conseiller", "label": "Bilan",
                  "rdvUrl": "https://agenda.example.com/ok" },
            ]
        });

        strip_unsafe_rdv_url(&mut payload);

        assert!(payload.get("rdvUrl").is_none());
        let timeline = payload["timeline"].as_array().unwrap();
        assert!(timeline[0].get("rdvUrl").is_none());
        assert_eq!(timeline[1]["rdvUrl"], "https://agenda.example.com/ok");
    }
}
