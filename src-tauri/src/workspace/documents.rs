//! Identité logique et empreinte des fichiers documentaires partagés.

use sha2::{Digest, Sha256};
use std::fs::File;
use std::io::Read;
use std::path::{Path, PathBuf};
use tauri::{AppHandle, Manager};

const LOGICAL_PREFIX: &str = "workspace-document://";

pub fn logical_document_uri(document_id: i64) -> String {
    format!("{LOGICAL_PREFIX}{document_id}")
}

pub fn logical_document_id(value: &str) -> Option<i64> {
    value.strip_prefix(LOGICAL_PREFIX)?.parse().ok()
}

fn safe_file_name(value: &str) -> String {
    let sanitized = value
        .chars()
        .map(|character| {
            if character.is_ascii_alphanumeric() || matches!(character, '.' | '-' | '_') {
                character
            } else {
                '_'
            }
        })
        .collect::<String>();
    let trimmed = sanitized.trim_matches(['.', '_']);
    if trimmed.is_empty() {
        "document.bin".into()
    } else {
        trimmed.chars().take(120).collect()
    }
}

pub fn remote_document_name(document_id: i64, file_name: &str) -> String {
    format!("CRM_Document_{document_id}_{}", safe_file_name(file_name))
}

pub fn local_download_path(
    app_data_dir: &Path,
    document_id: i64,
    _contact_id: Option<i64>,
    file_name: &str,
) -> PathBuf {
    let directory = crate::documents_storage::team_documents_cache_dir(app_data_dir);
    directory.join(format!("{document_id}_{}", safe_file_name(file_name)))
}

pub fn purge_local_team_document_cache(app: &AppHandle) -> Result<(), String> {
    let app_data_dir = app
        .path()
        .app_data_dir()
        .map_err(|error| format!("App data introuvable : {error}"))?;
    let cache = crate::documents_storage::team_documents_cache_dir(&app_data_dir);
    if cache.exists() {
        std::fs::remove_dir_all(&cache)
            .map_err(|error| format!("Purge du cache documentaire équipe impossible : {error}"))?;
    }
    Ok(())
}

pub fn file_sha256(path: &Path) -> Result<String, String> {
    let mut input =
        File::open(path).map_err(|error| format!("Lecture du document impossible : {error}"))?;
    let mut digest = Sha256::new();
    let mut buffer = vec![0_u8; 1024 * 1024];
    loop {
        let read = input
            .read(&mut buffer)
            .map_err(|error| format!("Lecture du document impossible : {error}"))?;
        if read == 0 {
            break;
        }
        digest.update(&buffer[..read]);
    }
    Ok(format!("{:x}", digest.finalize()))
}

pub fn bytes_sha256(bytes: &[u8]) -> String {
    format!("{:x}", Sha256::digest(bytes))
}

pub fn ensure_local_document(
    app: &AppHandle,
    db: &crate::commands::DbState,
    document_id: i64,
) -> Result<PathBuf, String> {
    let (document, config, pending_content) = {
        let guard = db
            .lock()
            .map_err(|_| "Impossible d'accéder à la base.".to_string())?;
        let database = guard.as_ref().ok_or("Base non initialisée")?;
        let document = database
            .get_document_by_id(document_id)
            .map_err(|error| format!("Document introuvable : {error}"))?;
        (
            document,
            crate::workspace::guard::workspace_config_from_db(database)?,
            database
                .workspace_blob_pending_content(document_id)
                .map_err(|error| error.to_string())?,
        )
    };
    let existing = Path::new(&document.chemin_fichier);
    if existing.is_file() {
        let is_current = match document.workspace_blob_sha256.as_deref() {
            Some(expected) => file_sha256(existing)
                .map(|actual| actual.eq_ignore_ascii_case(expected))
                .unwrap_or(false),
            None => true,
        };
        if is_current {
            return Ok(existing.to_path_buf());
        }
    }
    if !config.mode.is_team() {
        return Err("Fichier introuvable sur ce PC.".into());
    }
    crate::workspace::enrollment::validate_workspace_enrollment(app, &config)?;
    crate::workspace::identity::require_sensitive_team_authority(app, &config)?;
    let (bytes, expected_sha256) = if let Some((bytes, sha256)) = pending_content {
        (bytes, Some(sha256))
    } else {
        let drive_id = document.workspace_blob_drive_id.as_deref().ok_or_else(|| {
            "Le contenu de ce document n'est pas encore disponible sur SharePoint.".to_string()
        })?;
        let item_id = document.workspace_blob_item_id.as_deref().ok_or_else(|| {
            "Le contenu de ce document n'est pas encore disponible sur SharePoint.".to_string()
        })?;
        let connection = crate::workspace::commands::resolve_microsoft_team_connection(app)?
            .ok_or_else(|| "Connexion Microsoft équipe absente.".to_string())?;
        let site_ref = crate::workspace::guard::resolve_sharepoint_site_ref(&config)?;
        let client = crate::workspace::sharepoint::SharePointGraphClient::new(site_ref);
        (
            client.download_drive_file_blocking(&connection.access_token, drive_id, item_id)?,
            document.workspace_blob_sha256.clone(),
        )
    };
    if bytes.len() as u64 > crate::secure_files::MAX_DOCUMENT_BYTES {
        return Err("Document SharePoint trop volumineux.".into());
    }

    let app_data_dir = app
        .path()
        .app_data_dir()
        .map_err(|error| format!("App data introuvable : {error}"))?;
    let target = local_download_path(
        &app_data_dir,
        document.id,
        document.contact_id,
        &document.nom_fichier,
    );
    let parent = target
        .parent()
        .ok_or_else(|| "Dossier documentaire local invalide.".to_string())?;
    std::fs::create_dir_all(parent)
        .map_err(|error| format!("Création du cache documentaire impossible : {error}"))?;
    let temporary = target.with_extension("download-part");
    std::fs::write(&temporary, &bytes)
        .map_err(|error| format!("Écriture du document impossible : {error}"))?;
    let downloaded_sha256 = file_sha256(&temporary)?;
    if expected_sha256
        .as_deref()
        .is_some_and(|expected| !expected.eq_ignore_ascii_case(&downloaded_sha256))
    {
        let _ = std::fs::remove_file(&temporary);
        return Err("Le document téléchargé ne correspond pas à son empreinte attendue.".into());
    }
    if target.exists() {
        std::fs::remove_file(&target)
            .map_err(|error| format!("Remplacement du document local impossible : {error}"))?;
    }
    std::fs::rename(&temporary, &target)
        .map_err(|error| format!("Finalisation du document local impossible : {error}"))?;
    {
        let guard = db
            .lock()
            .map_err(|_| "Impossible d'accéder à la base.".to_string())?;
        let database = guard.as_ref().ok_or("Base non initialisée")?;
        database
            .workspace_set_downloaded_document_path(
                document.id,
                &target.to_string_lossy(),
                bytes.len() as i64,
            )
            .map_err(|error| error.to_string())?;
    }
    Ok(target)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn logical_uri_and_remote_name_never_expose_local_paths() {
        assert_eq!(logical_document_id(&logical_document_uri(42)), Some(42));
        let name = remote_document_name(42, r"D:\Documents\QPI été.pdf");
        assert!(name.starts_with("CRM_Document_42_"));
        assert!(!name.contains('\\'));
        assert!(!name.contains(' '));
    }
}
