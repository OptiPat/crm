//! Manifeste scellé du cache SQLite équipe actif.

use crate::email::oauth_secrets::{decrypt_secret, encrypt_secret, load_storage_key};
use crate::workspace::enrollment::load_workspace_enrollment;
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;
use tauri::{AppHandle, Manager};

const CACHE_MANIFEST_FILE: &str = "workspace_cache_manifest.sealed";
pub const TEAM_CACHE_DATABASE_FILE: &str = "workspace-team-cache.db";
pub const TEAM_CACHE_TEMP_FILE: &str = "workspace-team-cache.db.tmp";
pub const TEAM_CACHE_SEALED_FILE: &str = "workspace-team-cache.db.sealed";
const CACHE_MANIFEST_VERSION: u32 = 1;

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkspaceCacheManifest {
    pub version: u32,
    pub workspace_id: String,
    pub database_file: String,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct PersistedWorkspaceCacheManifest {
    version: u32,
    payload_enc: String,
}

fn app_data_dir(app: &AppHandle) -> Result<PathBuf, String> {
    app.path().app_data_dir().map_err(|error| error.to_string())
}

fn manifest_path(app: &AppHandle) -> Result<PathBuf, String> {
    Ok(app_data_dir(app)?.join(CACHE_MANIFEST_FILE))
}

pub fn team_cache_database_path(app: &AppHandle) -> Result<PathBuf, String> {
    Ok(app_data_dir(app)?.join(TEAM_CACHE_DATABASE_FILE))
}

pub fn team_cache_temp_path(app: &AppHandle) -> Result<PathBuf, String> {
    Ok(app_data_dir(app)?.join(TEAM_CACHE_TEMP_FILE))
}

pub fn team_cache_sealed_path(app: &AppHandle) -> Result<PathBuf, String> {
    Ok(app_data_dir(app)?.join(TEAM_CACHE_SEALED_FILE))
}

pub fn is_team_cache_path(path: &std::path::Path) -> bool {
    path.file_name()
        .and_then(|name| name.to_str())
        .is_some_and(|name| name == TEAM_CACHE_DATABASE_FILE)
}

pub fn load_workspace_cache_manifest(
    app: &AppHandle,
) -> Result<Option<WorkspaceCacheManifest>, String> {
    let path = manifest_path(app)?;
    if !path.is_file() {
        return Ok(None);
    }
    let raw = fs::read_to_string(&path)
        .map_err(|error| format!("Lecture manifeste cache équipe impossible : {error}"))?;
    let persisted: PersistedWorkspaceCacheManifest = serde_json::from_str(&raw)
        .map_err(|error| format!("Manifeste cache équipe illisible : {error}"))?;
    if persisted.version != CACHE_MANIFEST_VERSION {
        return Err(format!(
            "Version de manifeste cache équipe non supportée : {}.",
            persisted.version
        ));
    }
    let key = load_storage_key(app)?
        .ok_or_else(|| "Clé locale du cache équipe indisponible.".to_string())?;
    let payload = decrypt_secret(&persisted.payload_enc, &key)
        .map_err(|error| format!("Manifeste cache équipe invalide ou altéré : {error}"))?;
    let manifest: WorkspaceCacheManifest = serde_json::from_str(&payload)
        .map_err(|error| format!("Contenu manifeste cache équipe invalide : {error}"))?;
    if manifest.version != CACHE_MANIFEST_VERSION
        || manifest.database_file != TEAM_CACHE_DATABASE_FILE
    {
        return Err("Contenu manifeste cache équipe non supporté.".into());
    }
    Ok(Some(manifest))
}

pub fn save_workspace_cache_manifest(
    app: &AppHandle,
    workspace_id: &str,
) -> Result<WorkspaceCacheManifest, String> {
    if workspace_id.trim().is_empty() {
        return Err("WorkspaceId vide pour le manifeste cache.".into());
    }
    let manifest = WorkspaceCacheManifest {
        version: CACHE_MANIFEST_VERSION,
        workspace_id: workspace_id.to_string(),
        database_file: TEAM_CACHE_DATABASE_FILE.into(),
    };
    let payload = serde_json::to_string(&manifest)
        .map_err(|error| format!("Sérialisation manifeste cache : {error}"))?;
    let key = load_storage_key(app)?
        .ok_or_else(|| "Clé locale du cache équipe indisponible.".to_string())?;
    let persisted = PersistedWorkspaceCacheManifest {
        version: CACHE_MANIFEST_VERSION,
        payload_enc: encrypt_secret(&payload, &key)?,
    };
    let raw = serde_json::to_vec_pretty(&persisted)
        .map_err(|error| format!("Sérialisation fichier manifeste cache : {error}"))?;
    crate::atomic_file::write(&manifest_path(app)?, &raw)
        .map_err(|error| format!("Écriture manifeste cache équipe impossible : {error}"))?;
    Ok(manifest)
}

pub fn active_database_path(app: &AppHandle) -> Result<PathBuf, String> {
    let app_data = app_data_dir(app)?;
    let enrollment = load_workspace_enrollment(app)?;
    let manifest = load_workspace_cache_manifest(app)?;
    match enrollment {
        Some(enrollment) if enrollment.sync_activated => {
            let manifest = manifest.ok_or_else(|| {
                "Cache équipe activé mais manifeste local absent. Accès bloqué.".to_string()
            })?;
            if manifest.workspace_id != enrollment.workspace_id {
                return Err(
                    "Le manifeste du cache ne correspond pas à l'enrôlement équipe.".into(),
                );
            }
            let path = app_data.join(&manifest.database_file);
            if !path.is_file() && !app_data.join(TEAM_CACHE_SEALED_FILE).is_file() {
                return Err(format!(
                    "Cache équipe actif introuvable : {} et copie scellée absente.",
                    manifest.database_file
                ));
            }
            Ok(path)
        }
        Some(_) => Ok(app_data.join("patrimoine-crm.db")),
        None if manifest.is_some() => {
            Err("Manifeste cache équipe présent sans enrôlement. Accès bloqué.".into())
        }
        None => Ok(app_data.join("patrimoine-crm.db")),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn manifest_accepts_only_the_fixed_cache_filename() {
        let valid = WorkspaceCacheManifest {
            version: CACHE_MANIFEST_VERSION,
            workspace_id: "workspace-1".into(),
            database_file: TEAM_CACHE_DATABASE_FILE.into(),
        };
        assert_eq!(valid.database_file, "workspace-team-cache.db");
        assert!(is_team_cache_path(std::path::Path::new(
            "workspace-team-cache.db"
        )));
        assert!(!is_team_cache_path(std::path::Path::new(
            "patrimoine-crm.db"
        )));
    }
}
