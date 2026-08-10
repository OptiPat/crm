//! API client — dépôt de documents.

use axum::{
    extract::{Multipart, Path as AxumPath, State},
    http::{HeaderMap, StatusCode},
    response::IntoResponse,
    Json,
};
use serde::Serialize;

use crate::client_auth::resolve_session;
use crate::demande_store::{depot_storage_path, DEMANDE_EN_ATTENTE};
use crate::document_scan::require_clean_scan;
use crate::file_sniff::validate_allowed_document;
use crate::AppState;
use sha2::{Digest, Sha256};

const MAX_UPLOAD_BYTES: usize = 10 * 1024 * 1024;
const ALLOWED_MIME: &[&str] = &["application/pdf", "image/jpeg", "image/png"];

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct ClientDemandeLine {
    id: i64,
    libelle: String,
    type_document: String,
    demande_at: i64,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct ClientDemandesResponse {
    demandes: Vec<ClientDemandeLine>,
}

pub async fn get_demandes_me(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> impl IntoResponse {
    let contact_id = match resolve_session(&state, &headers) {
        Ok(id) => id,
        Err(response) => return response,
    };

    match state.db.list_client_demandes(contact_id) {
        Ok(rows) => {
            let demandes = rows
                .into_iter()
                .map(|row| ClientDemandeLine {
                    id: row.id,
                    libelle: row.libelle,
                    type_document: row.type_document,
                    demande_at: row.demande_at,
                })
                .collect();
            (StatusCode::OK, Json(ClientDemandesResponse { demandes })).into_response()
        }
        Err(error) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(serde_json::json!({ "error": error.to_string() })),
        )
            .into_response(),
    }
}

pub async fn post_demande_upload(
    State(state): State<AppState>,
    AxumPath(demande_id): AxumPath<i64>,
    headers: HeaderMap,
    mut multipart: Multipart,
) -> impl IntoResponse {
    // Session simple : deposer, c'est envoyer un fichier *vers* le conseiller.
    // Rien ne sort du serveur, donc exiger un code frais ne protegerait rien et
    // ferait buter le client. La preuve d'identite recente est reservee a la
    // consultation d'un document (R7).
    let contact_id = match resolve_session(&state, &headers) {
        Ok(id) => id,
        Err(response) => return response,
    };

    match handle_upload(&state, contact_id, demande_id, &mut multipart).await {
        Ok(()) => (StatusCode::OK, Json(serde_json::json!({ "accepted": true }))).into_response(),
        Err(message) => (
            StatusCode::BAD_REQUEST,
            Json(serde_json::json!({ "error": message })),
        )
            .into_response(),
    }
}

async fn handle_upload(
    state: &AppState,
    contact_id: i64,
    demande_id: i64,
    multipart: &mut Multipart,
) -> Result<(), String> {
    let demande = state
        .db
        .get_demande_for_contact(demande_id, contact_id)
        .map_err(|e| e.to_string())?
        .ok_or_else(|| "Demande introuvable".to_string())?;
    if demande.statut != DEMANDE_EN_ATTENTE {
        return Err("Cette demande n'accepte plus de dépôt".into());
    }
    if state.db.has_depot(demande_id).map_err(|e| e.to_string())? {
        return Err("Un fichier a déjà été déposé pour cette demande".into());
    }

    let mut filename: Option<String> = None;
    let mut mime_type: Option<String> = None;
    let mut bytes: Option<Vec<u8>> = None;

    while let Some(field) = multipart
        .next_field()
        .await
        .map_err(|e| format!("Lecture du formulaire impossible : {e}"))?
    {
        if field.name() != Some("file") {
            continue;
        }
        filename = field.file_name().map(|s| s.to_string());
        mime_type = field.content_type().map(|s| s.to_string());
        let data = field
            .bytes()
            .await
            .map_err(|e| format!("Lecture du fichier impossible : {e}"))?;
        bytes = Some(data.to_vec());
        break;
    }

    let filename = filename.ok_or_else(|| "Fichier requis".to_string())?;
    let mime_type = mime_type.unwrap_or_else(|| "application/octet-stream".to_string());
    let data = bytes.ok_or_else(|| "Fichier requis".to_string())?;

    if data.len() > MAX_UPLOAD_BYTES {
        return Err("Fichier trop volumineux (10 Mo maximum)".into());
    }
    if !ALLOWED_MIME.contains(&mime_type.as_str()) {
        return Err("Format non accepté (PDF, JPEG ou PNG uniquement)".into());
    }
    if !allowed_extension(&filename) {
        return Err("Extension non acceptée (pdf, jpg, jpeg, png)".into());
    }

    let validated_mime =
        validate_allowed_document(&data, &mime_type, &filename)?;

    // L'analyse antivirus parle a clamd en synchrone, avec des delais jusqu'a
    // trente secondes. Appelee telle quelle, elle immobiliserait un thread du
    // serveur : quelques depots simultanes suffiraient a geler le portail pour
    // tout le monde, connexion comprise.
    let scan_data = data.clone();
    let production = state.production;
    tokio::task::spawn_blocking(move || require_clean_scan(&scan_data, production))
        .await
        .map_err(|_| "Analyse antivirus interrompue".to_string())??;

    // Scellement avant écriture : le fichier n'existe jamais en clair sur le
    // disque du serveur, et seul le CRM peut le rouvrir.
    let recipient = state
        .db
        .depot_public_key()
        .map_err(|e| e.to_string())?
        .ok_or_else(|| {
            "Dépôt indisponible : le portail n'a pas encore reçu la clé de scellement du \
             conseiller. Synchronisez depuis le CRM."
                .to_string()
        })?;
    let sealed = crate::depot_crypto::seal(
        &data,
        &crate::depot_crypto::parse_public_key(&recipient)?,
    )?;

    // Empreinte du scellé : c'est ce que le CRM téléchargera et vérifiera.
    let content_sha256 = hex_sha256(&sealed);

    let stored_path = depot_storage_path(&state.data_dir, contact_id, demande_id);
    if let Some(parent) = stored_path.parent() {
        std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    std::fs::write(&stored_path, &sealed).map_err(|e| e.to_string())?;

    state
        .db
        .save_depot(
            demande_id,
            contact_id,
            &filename,
            &validated_mime,
            sealed.len() as i64,
            &stored_path.to_string_lossy(),
            &content_sha256,
        )
        .map_err(|e| e.to_string())?;

    notify_advisor_depot(state, contact_id, &demande.libelle).await;

    Ok(())
}

async fn notify_advisor_depot(state: &AppState, contact_id: i64, libelle: &str) {
    let advisor = state.advisor_email.trim();
    if advisor.is_empty() {
        tracing::warn!("ESPACE_ADVISOR_EMAIL absent — pas de notification conseiller");
        return;
    }
    let Some(mailer) = state.mailer.as_ref() else {
        tracing::warn!("Mailer absent — notification conseiller ignorée");
        return;
    };

    let client_label = state
        .db
        .get_contact_snapshot(contact_id)
        .ok()
        .flatten()
        .and_then(|row| {
            let prenom = row.payload.pointer("/contact/prenom")?.as_str()?;
            let nom = row.payload.pointer("/contact/nom")?.as_str()?;
            Some(format!("{prenom} {nom}"))
        })
        .unwrap_or_else(|| format!("contact {contact_id}"));

    if let Err(error) = mailer
        .send_depot_received(advisor, &client_label, libelle)
        .await
    {
        tracing::error!("Notification conseiller impossible : {error}");
    }
}

fn allowed_extension(filename: &str) -> bool {
    let lower = filename.to_lowercase();
    lower.ends_with(".pdf")
        || lower.ends_with(".jpg")
        || lower.ends_with(".jpeg")
        || lower.ends_with(".png")
}

fn hex_sha256(data: &[u8]) -> String {
    let digest = Sha256::digest(data);
    digest.iter().map(|byte| format!("{byte:02x}")).collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn extension_check() {
        assert!(allowed_extension("scan.PDF"));
        assert!(!allowed_extension("virus.exe"));
    }
}
