//! Rapatriement des dépôts portail → GED CRM.

use std::io::Write;
use std::path::PathBuf;

use tauri::Manager;

use crate::database::espace_demande::EspaceDepotImportLock;
use crate::database::models::NewDocument;
use crate::database::Database;
use crate::espace_client::portal_api::{ack_espace_depot, download_espace_depot, pull_espace_depots};
use crate::workspace::documents::bytes_sha256;

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ImportEspaceDepotsResult {
    pub imported: usize,
    pub document_ids: Vec<i64>,
    pub scpi_declarations_imported: usize,
    pub avoirs_imported: usize,
    pub errors: Vec<String>,
}

pub fn import_espace_depots(
    app: &tauri::AppHandle,
    db: &Database,
    contact_id: i64,
) -> Result<ImportEspaceDepotsResult, String> {
    let depots = pull_espace_depots(app, db, contact_id)?;
    for depot in &depots {
        if let Ok(Some(demande)) = db.get_espace_demande_by_id(depot.demande_id) {
            if demande.statut == crate::database::espace_demande::ESPACE_DEMANDE_EN_ATTENTE {
                let _ = db.mark_espace_demande_recu(depot.demande_id);
            }
        }
    }

    if depots.is_empty() {
        return Ok(ImportEspaceDepotsResult {
            imported: 0,
            document_ids: vec![],
            scpi_declarations_imported: 0,
            avoirs_imported: 0,
            errors: vec![],
        });
    }

    let app_data_dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("App data introuvable : {e}"))?;
    let team_mode = db
        .get_workspace_config()
        .map_err(|e| e.to_string())?
        .mode
        .is_team();

    let mut document_ids = Vec::new();
    let mut errors = Vec::new();

    for depot in depots {
        match import_one_depot(
            app,
            db,
            contact_id,
            &app_data_dir,
            team_mode,
            &depot,
        ) {
            Ok(Some(doc_id)) => document_ids.push(doc_id),
            Ok(None) => {}
            Err(message) => errors.push(format!("Demande {} : {message}", depot.demande_id)),
        }
    }

    Ok(ImportEspaceDepotsResult {
        imported: document_ids.len(),
        document_ids,
        scpi_declarations_imported: 0,
        avoirs_imported: 0,
        errors,
    })
}

fn import_one_depot(
    app: &tauri::AppHandle,
    db: &Database,
    contact_id: i64,
    app_data_dir: &std::path::Path,
    team_mode: bool,
    depot: &crate::espace_client::portal_api::PortalDepotLine,
) -> Result<Option<i64>, String> {
    let demande = match db.try_lock_espace_depot_import(depot.demande_id, contact_id)? {
        EspaceDepotImportLock::Proceed(demande) => demande,
        EspaceDepotImportLock::AlreadyImported(_doc_id) => {
            // Déjà en GED : on se contente de confirmer au portail pour qu'il
            // purge, sans avoir à desceller quoi que ce soit.
            if let Ok(sealed) = download_espace_depot(app, db, contact_id, depot.demande_id) {
                let hash = bytes_sha256(&sealed);
                let _ = ack_espace_depot(app, db, contact_id, depot.demande_id, &hash);
            }
            return Ok(None);
        }
        EspaceDepotImportLock::Refused(message) => return Err(message),
    };

    let import_result = (|| -> Result<i64, String> {
        let sealed = download_espace_depot(app, db, contact_id, depot.demande_id)?;
        // L'empreinte porte sur le scellé : c'est lui que le portail a stocké
        // et qu'il comparera avant de purger.
        let file_sha256 = bytes_sha256(&sealed);

        // Descellement : le fichier n'a jamais existé en clair sur le serveur,
        // et ce poste est le seul à détenir la clé privée.
        let secret = crate::espace_client::config::load_depot_secret_key(app, db)?;
        let bytes = crate::espace_client::depot_crypto::unseal(&sealed, &secret)?;
        let temp_path = write_temp_file(&depot.filename, &bytes)?;

        let source = temp_path.as_path();
        let (stored_path, size) = if team_mode {
            crate::documents_storage::ensure_team_document_stored(app_data_dir, source)
        } else {
            crate::documents_storage::ensure_document_stored(
                app_data_dir,
                source,
                Some(contact_id),
                true,
            )
        }
        .map_err(|e| format!("stockage GED : {e}"))?;

        let notes = Some(format!(
            "Importé depuis l'espace client (demande #{})",
            depot.demande_id
        ));
        let document = db
            .create_document(NewDocument {
                contact_id: Some(contact_id),
                foyer_id: None,
                type_document: demande.type_document.clone(),
                nom_fichier: depot.filename.clone(),
                chemin_fichier: stored_path.to_string_lossy().into_owned(),
                taille_fichier: size as i64,
                mime_type: Some(depot.mime_type.clone()),
                date_document: None,
                notes,
                sensibilite_extra_financiere: None,
                experience_investissement: None,
            })
            .map_err(|e| e.to_string())?;

        db.complete_espace_depot_import(depot.demande_id, document.id)?;
        ack_espace_depot(
            app,
            db,
            contact_id,
            depot.demande_id,
            &file_sha256,
        )?;

        let _ = std::fs::remove_file(&temp_path);

        crate::client_onedrive::background::spawn_onedrive_document_copy_background(
            app.clone(),
            document.id,
        );

        Ok(document.id)
    })();

    match import_result {
        Ok(doc_id) => Ok(Some(doc_id)),
        Err(error) => {
            let _ = db.release_espace_depot_import_lock(depot.demande_id);
            Err(error)
        }
    }
}

fn write_temp_file(filename: &str, bytes: &[u8]) -> Result<PathBuf, String> {
    let safe_name = sanitize_filename(filename);
    let mut path = std::env::temp_dir();
    path.push(format!(
        "espace-depot-{}-{safe_name}",
        chrono::Utc::now().timestamp_nanos_opt().unwrap_or(0)
    ));
    let mut file = std::fs::File::create(&path).map_err(|e| e.to_string())?;
    file.write_all(bytes).map_err(|e| e.to_string())?;
    Ok(path)
}

fn sanitize_filename(name: &str) -> String {
    let base = std::path::Path::new(name)
        .file_name()
        .and_then(|s| s.to_str())
        .unwrap_or("document");
    base.chars()
        .map(|c| if c.is_ascii_alphanumeric() || c == '.' || c == '-' || c == '_' {
            c
        } else {
            '_'
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn sanitize_strips_path_segments() {
        assert_eq!(sanitize_filename("../../secret.pdf"), "secret.pdf");
    }
}
