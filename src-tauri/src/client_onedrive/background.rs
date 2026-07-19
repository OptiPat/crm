//! OneDrive en arrière-plan (std::thread) — évite blocage UI et panics Tokio.

use super::hooks::maybe_auto_create_onedrive_for_contact;
use serde::Serialize;
use tauri::{AppHandle, Emitter, Manager};

pub const AUTO_CREATE_DONE_EVENT: &str = "client-onedrive-auto-create-done";
pub const DOCUMENT_COPY_DONE_EVENT: &str = "client-onedrive-document-copy-done";

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ClientOneDriveAutoCreateEvent {
    pub contact_id: i64,
    pub link_created: bool,
    pub message: Option<String>,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ClientOneDriveDocumentCopyEvent {
    pub document_id: i64,
    pub message: Option<String>,
}

fn auto_create_outcome(
    app: &AppHandle,
    contact_id: i64,
) -> (bool, Option<String>) {
    match maybe_auto_create_onedrive_for_contact(app, contact_id) {
        Ok(true) => (true, None),
        Ok(false) => (false, None),
        Err(e) => (
            false,
            Some(format!("Contact créé — dossier OneDrive non créé : {e}")),
        ),
    }
}

/// Lance l'auto-création dossier sans bloquer la commande appelante.
pub fn spawn_onedrive_auto_create_background(app: AppHandle, contact_id: i64) {
    std::thread::spawn(move || {
        let (link_created, message) = auto_create_outcome(&app, contact_id);
        let _ = app.emit(
            AUTO_CREATE_DONE_EVENT,
            ClientOneDriveAutoCreateEvent {
                contact_id,
                link_created,
                message,
            },
        );
    });
}

/// Import bulk : une seule thread, créations séquentielles.
pub fn spawn_onedrive_auto_create_batch_background(app: AppHandle, contact_ids: Vec<i64>) {
    if contact_ids.is_empty() {
        return;
    }
    std::thread::spawn(move || {
        for contact_id in contact_ids {
            let (link_created, message) = auto_create_outcome(&app, contact_id);
            let _ = app.emit(
                AUTO_CREATE_DONE_EVENT,
                ClientOneDriveAutoCreateEvent {
                    contact_id,
                    link_created,
                    message,
                },
            );
        }
    });
}

/// Copie document → OneDrive sans bloquer `create_document`.
pub fn spawn_onedrive_document_copy_background(app: AppHandle, document_id: i64) {
    std::thread::spawn(move || {
        let message = (|| -> Result<Option<String>, String> {
            let db_state = app.state::<crate::commands::DbState>();
            let guard = db_state.lock().unwrap();
            let database = guard.as_ref().ok_or("Database not initialized")?;
            let document = database
                .get_document_by_id(document_id)
                .map_err(|e| format!("Failed to get document: {}", e))?;
            drop(guard);
            match super::hooks::maybe_copy_document_to_contact_onedrive(&app, &document) {
                Ok(msg) => Ok(msg),
                Err(e) => Ok(Some(format!(
                    "Document enregistré — copie OneDrive échouée : {e}"
                ))),
            }
        })()
        .unwrap_or_else(|e| Some(format!("Document enregistré — copie OneDrive échouée : {e}")));

        let _ = app.emit(
            DOCUMENT_COPY_DONE_EVENT,
            ClientOneDriveDocumentCopyEvent {
                document_id,
                message,
            },
        );
    });
}
