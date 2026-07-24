//! Synchronisation des contenus binaires des documents CRM.

use crate::database::models::Document;
use crate::database::workspace_blob::WorkspaceBlobQueueItem;
use crate::database::Database;
use crate::workspace::documents::{bytes_sha256, file_sha256, remote_document_name};
use crate::workspace::migration::{compute_mutation_id, compute_sync_key};
use crate::workspace::sharepoint::{ParsedDriveItem, SharePointGraphClient};
use crate::workspace::sync::push::ensure_remote_audit_entry;
use std::path::Path;

#[derive(Debug)]
pub struct PendingBlobPlan {
    pub queue: WorkspaceBlobQueueItem,
    pub document: Option<Document>,
}

pub enum RemoteBlobResult {
    Upserted {
        item: ParsedDriveItem,
        drive_id: String,
    },
    Deleted,
}

pub fn seed_missing_document_blobs(database: &Database) -> Result<usize, String> {
    let documents = database
        .workspace_blob_documents_needing_upload(20)
        .map_err(|error| error.to_string())?;
    let mut seeded = 0;
    for (document_id, local_path) in documents {
        let path = Path::new(&local_path);
        if !path.is_file() {
            continue;
        }
        let sha256 = file_sha256(path)?;
        database
            .workspace_blob_enqueue_upsert(document_id, &local_path, &sha256)
            .map_err(|error| error.to_string())?;
        seeded += 1;
    }
    Ok(seeded)
}

pub fn next_pending_blob(database: &Database) -> Result<Option<PendingBlobPlan>, String> {
    let Some(queue) = database
        .workspace_blob_next_pending()
        .map_err(|error| error.to_string())?
    else {
        return Ok(None);
    };
    let document = if queue.operation == "upsert" {
        Some(
            database
                .get_document_by_id(queue.document_id)
                .map_err(|error| format!("Document binaire introuvable : {error}"))?,
        )
    } else {
        None
    };
    Ok(Some(PendingBlobPlan { queue, document }))
}

pub fn execute_remote_blob(
    client: &SharePointGraphClient,
    access_token: &str,
    site_id: &str,
    plan: &PendingBlobPlan,
) -> Result<RemoteBlobResult, String> {
    if plan.queue.operation == "delete" {
        if let (Some(drive_id), Some(item_id)) = (
            plan.queue.remote_drive_id.as_deref(),
            plan.queue.remote_item_id.as_deref(),
        ) {
            client.delete_drive_item_blocking(
                access_token,
                drive_id,
                item_id,
                plan.queue.remote_etag.as_deref(),
            )?;
        }
        return Ok(RemoteBlobResult::Deleted);
    }

    let document = plan
        .document
        .as_ref()
        .ok_or_else(|| "Métadonnées du document absentes.".to_string())?;
    let bytes = if let Some(bytes) = plan.queue.content_blob.as_ref() {
        if bytes.len() as u64 > crate::secure_files::MAX_DOCUMENT_BYTES {
            return Err("Document en attente trop volumineux.".into());
        }
        bytes.clone()
    } else {
        let local_path = plan
            .queue
            .local_path
            .as_deref()
            .ok_or_else(|| "Chemin local du document absent.".to_string())?;
        let path = Path::new(local_path);
        crate::secure_files::ensure_file_size(path, crate::secure_files::MAX_DOCUMENT_BYTES)?;
        std::fs::read(path).map_err(|error| format!("Lecture du document impossible : {error}"))?
    };
    let actual_sha256 = bytes_sha256(&bytes);
    if plan.queue.content_sha256.as_deref() != Some(actual_sha256.as_str()) {
        return Err(
            "Le document local a changé depuis sa mise en file ; une nouvelle synchronisation est nécessaire."
                .into(),
        );
    }
    let drive = match document
        .workspace_blob_drive_id
        .as_deref()
        .or(plan.queue.remote_drive_id.as_deref())
    {
        Some(id) => crate::workspace::sharepoint::ParsedSharePointDrive {
            id: id.to_string(),
            name: String::new(),
        },
        None => client.resolve_documents_drive_blocking(access_token, site_id)?,
    };
    let item = client.upload_drive_file_blocking(
        access_token,
        &drive.id,
        document
            .workspace_blob_item_id
            .as_deref()
            .or(plan.queue.remote_item_id.as_deref()),
        document
            .workspace_blob_etag
            .as_deref()
            .or(plan.queue.remote_etag.as_deref()),
        &remote_document_name(document.id, &document.nom_fichier),
        bytes,
        document.mime_type.as_deref(),
    )?;
    Ok(RemoteBlobResult::Upserted {
        item,
        drive_id: drive.id,
    })
}

pub fn complete_remote_blob(
    database: &Database,
    plan: &PendingBlobPlan,
    result: &RemoteBlobResult,
) -> Result<(), String> {
    match result {
        RemoteBlobResult::Deleted => database
            .workspace_blob_mark_synced(plan.queue.id, plan.queue.revision)
            .map(|_| ())
            .map_err(|error| error.to_string()),
        RemoteBlobResult::Upserted { item, drive_id } => {
            let etag = item
                .etag
                .as_deref()
                .ok_or_else(|| "ETag absent après l'envoi du document SharePoint.".to_string())?;
            let sha256 = plan
                .queue
                .content_sha256
                .as_deref()
                .ok_or_else(|| "Empreinte du document absente.".to_string())?;
            database
                .workspace_blob_complete_upsert(
                    plan.queue.id,
                    plan.queue.revision,
                    plan.queue.document_id,
                    drive_id,
                    &item.id,
                    etag,
                    sha256,
                )
                .map(|_| ())
                .map_err(|error| error.to_string())
        }
    }
}

#[allow(clippy::too_many_arguments)]
pub fn ensure_remote_blob_audit(
    client: &SharePointGraphClient,
    access_token: &str,
    site_id: &str,
    audit_list_id: &str,
    actor_id: &str,
    created_at: &str,
    plan: &PendingBlobPlan,
) -> Result<(), String> {
    let entity_id = plan.queue.document_id.to_string();
    let sync_key = compute_sync_key("document_blob", &entity_id);
    let mutation_id = compute_mutation_id(&sync_key, plan.queue.revision);
    ensure_remote_audit_entry(
        client,
        access_token,
        site_id,
        audit_list_id,
        &mutation_id,
        "document_blob",
        &entity_id,
        actor_id,
        if plan.queue.operation == "delete" {
            "delete"
        } else {
            "upsert"
        },
        &format!(
            "Synchronisation du fichier documentaire — révision {}",
            plan.queue.revision
        ),
        created_at,
    )
}
