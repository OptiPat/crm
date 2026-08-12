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
use crate::demande_store::DemandeEmailNotification;
use crate::evenement_store::EvenementEmailNotification;
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
        Ok((response, notifications, evenements)) => {
            spawn_demande_emails(state.clone(), notifications);
            spawn_evenement_emails(state.clone(), evenements);
            (StatusCode::OK, Json(response)).into_response()
        }
        Err(message) => (
            StatusCode::BAD_REQUEST,
            Json(serde_json::json!({ "error": message })),
        )
            .into_response(),
    }
}

fn spawn_demande_emails(state: AppState, notifications: Vec<DemandeEmailNotification>) {
    if notifications.is_empty() {
        return;
    }
    tokio::spawn(async move {
        let Some(mailer) = state.mailer.clone() else {
            for note in &notifications {
                tracing::warn!(
                    "Pas d'envoi configuré — demande {} pour {}",
                    note.demande_id,
                    note.email
                );
            }
            return;
        };
        for note in notifications {
            match mailer
                .send_document_request(&note.email, &note.prenom, &note.libelle)
                .await
            {
                Ok(()) => {
                    let _ = state.db.mark_demande_client_notified(note.demande_id);
                    tracing::info!("Demande document notifiée (demande {})", note.demande_id);
                }
                Err(error) => {
                    tracing::error!(
                        "Envoi demande document impossible (demande {}) : {error}",
                        note.demande_id
                    );
                }
            }
        }
    });
}

/// Événements ajoutés par le conseiller : le client est prévenu une fois, à la
/// synchronisation qui les publie. Les échéances issues des placements, elles,
/// ne déclenchent rien — il ne s'agit pas d'une nouvelle.
fn spawn_evenement_emails(state: AppState, notifications: Vec<EvenementEmailNotification>) {
    if notifications.is_empty() {
        return;
    }
    tokio::spawn(async move {
        let Some(mailer) = state.mailer.clone() else {
            for note in &notifications {
                tracing::warn!(
                    "Pas d'envoi configuré — événement {} pour {}",
                    note.evenement_id,
                    note.email
                );
                release_notification(&state, &note.evenement_id);
            }
            return;
        };
        for note in notifications {
            match mailer
                .send_evenement(
                    &note.email,
                    &note.prenom,
                    &note.titre,
                    note.message.as_deref(),
                    &note.date_label,
                )
                .await
            {
                // La réservation a été prise avant l'envoi : rien à marquer ici.
                Ok(()) => tracing::info!("Événement notifié ({})", note.evenement_id),
                Err(error) => {
                    tracing::error!(
                        "Envoi événement impossible ({}) : {error}",
                        note.evenement_id
                    );
                    release_notification(&state, &note.evenement_id);
                }
            }
        }
    });
}

/// Rend une réservation pour que la nouvelle reparte à la prochaine photo.
fn release_notification(state: &AppState, evenement_id: &str) {
    if let Err(error) = state.db.release_evenement_notification(evenement_id) {
        tracing::error!(
            "Événement {evenement_id} non renvoyé : réservation impossible à rendre ({error})"
        );
    }
}

fn handle_sync(
    state: &AppState,
    contact_id: i64,
    headers: &HeaderMap,
    body: &[u8],
) -> Result<
    (
        SyncResponse,
        Vec<DemandeEmailNotification>,
        Vec<EvenementEmailNotification>,
    ),
    String,
> {
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

    // Clé publique de scellement des dépôts : le CRM la transmet à chaque
    // synchronisation, sa privée ne quitte jamais son poste.
    if let Some(key) = payload
        .get("depotPublicKey")
        .and_then(|v| v.as_str())
        .map(str::trim)
        .filter(|v| !v.is_empty())
    {
        match crate::depot_crypto::parse_public_key(key) {
            Ok(_) => state
                .db
                .set_depot_public_key(key)
                .map_err(|e| e.to_string())?,
            Err(error) => tracing::error!("Clé publique de dépôt refusée : {error}"),
        }
    }

    let json = serde_json::to_string(&payload).map_err(|e| e.to_string())?;
    let accepted = state
        .db
        .upsert_contact_snapshot(contact_id, header.sequence, &json)
        .map_err(|e| e.to_string())?;

    let notifications = if accepted {
        state
            .db
            .sync_demandes_from_payload(contact_id, &payload)
            .map_err(|e| e.to_string())?
    } else {
        vec![]
    };

    let evenements = if accepted {
        state
            .db
            .claim_evenement_notifications(contact_id, &payload)
            .map_err(|e| e.to_string())?
    } else {
        vec![]
    };

    Ok((
        SyncResponse {
            accepted,
            contact_id,
            sequence: header.sequence,
        },
        notifications,
        evenements,
    ))
}

pub fn parse_header(headers: &HeaderMap, name: &str) -> Result<String, String> {
    headers
        .get(name)
        .and_then(|v| v.to_str().ok())
        .map(|s| s.to_string())
        .ok_or_else(|| format!("En-tête {name} manquant"))
}
