//! Hooks métier OneDrive (création contact, copie document) — best-effort, non bloquant.

use super::commands::{foyer_folder_name, require_root_folder_id, save_created_link};
use super::drive::{
    create_client_onedrive_folder, resolve_microsoft_onedrive_connection,
    sanitize_onedrive_upload_filename, upload_file_to_onedrive_folder,
};
use super::matching::format_contact_folder_name;
use crate::commands::DbState;
use crate::database::models::{Contact, Document};
use crate::database::Database;
use std::sync::{Mutex, OnceLock};
use tauri::{AppHandle, Manager};

const AUTO_CREATE_SETTING: &str = "client_onedrive_auto_create_on_contact";
const COPY_ON_IMPORT_SETTING: &str = "client_onedrive_copy_document_on_import";

fn auto_create_lock() -> &'static Mutex<()> {
    static LOCK: OnceLock<Mutex<()>> = OnceLock::new();
    LOCK.get_or_init(|| Mutex::new(()))
}

pub fn is_client_category(categorie: &str) -> bool {
    categorie == "CLIENT" || categorie == "PROSPECT_CLIENT"
}

pub fn is_auto_create_on_contact_enabled(database: &Database) -> bool {
    read_bool_setting(database, AUTO_CREATE_SETTING)
}

pub fn is_copy_document_on_import_enabled(database: &Database) -> bool {
    read_bool_setting(database, COPY_ON_IMPORT_SETTING)
}

pub fn set_auto_create_on_contact(database: &Database, enabled: bool) -> Result<(), String> {
    database
        .set_setting(AUTO_CREATE_SETTING, if enabled { "1" } else { "0" })
        .map_err(|e| e.to_string())
}

pub fn set_copy_document_on_import(database: &Database, enabled: bool) -> Result<(), String> {
    database
        .set_setting(COPY_ON_IMPORT_SETTING, if enabled { "1" } else { "0" })
        .map_err(|e| e.to_string())
}

fn read_bool_setting(database: &Database, key: &str) -> bool {
    database
        .get_setting(key)
        .ok()
        .flatten()
        .is_some_and(|v| v == "1" || v.eq_ignore_ascii_case("true"))
}

struct AutoCreatePlan {
    root_id: String,
    folder_name: String,
    contact: Contact,
}

fn build_auto_create_plan(
    database: &Database,
    app: &AppHandle,
    contact_id: i64,
) -> Result<Option<AutoCreatePlan>, String> {
    if !is_auto_create_on_contact_enabled(database) {
        return Ok(None);
    }
    if resolve_microsoft_onedrive_connection(app)?.is_none() {
        return Ok(None);
    }
    let root_id = match require_root_folder_id(database) {
        Ok(id) => id,
        Err(_) => return Ok(None),
    };
    if database
        .resolve_contact_onedrive_link(contact_id)
        .map_err(|e| e.to_string())?
        .is_some()
    {
        return Ok(None);
    }
    let contact = database
        .get_contact_by_id(contact_id)
        .map_err(|e| e.to_string())?;
    if !is_client_category(&contact.categorie) {
        return Ok(None);
    }
    let folder_name = resolve_new_folder_name(database, &contact)?;
    Ok(Some(AutoCreatePlan {
        root_id,
        folder_name,
        contact,
    }))
}

/// Crée et relie un dossier OneDrive pour un nouveau contact si l'option est activée.
/// Retourne `true` si un lien a été créé.
pub fn maybe_auto_create_onedrive_for_contact(
    app: &AppHandle,
    contact_id: i64,
) -> Result<bool, String> {
    let _guard = auto_create_lock()
        .lock()
        .map_err(|_| "Verrou auto-création OneDrive indisponible.".to_string())?;
    let db_state = app.state::<DbState>();
    let plan = {
        let database = db_state.lock().unwrap();
        let database = database.as_ref().ok_or("Database not initialized")?;
        build_auto_create_plan(database, app, contact_id)?
    };
    let Some(plan) = plan else {
        return Ok(false);
    };
    // Re-vérifier sous verrou (création couple concurrente).
    {
        let database = db_state.lock().unwrap();
        let database = database.as_ref().ok_or("Database not initialized")?;
        if database
            .resolve_contact_onedrive_link(contact_id)
            .map_err(|e| e.to_string())?
            .is_some()
        {
            return Ok(false);
        }
    }
    let created = create_client_onedrive_folder(app, &plan.root_id, &plan.folder_name)?;
    {
        let database = db_state.lock().unwrap();
        let database = database.as_ref().ok_or("Database not initialized")?;
        if database
            .resolve_contact_onedrive_link(contact_id)
            .map_err(|e| e.to_string())?
            .is_some()
        {
            return Ok(false);
        }
        save_created_link(database, &plan.contact, &created)?;
    }
    Ok(true)
}

fn resolve_new_folder_name(database: &Database, contact: &Contact) -> Result<String, String> {
    if let Some(foyer_id) = contact.foyer_id {
        let foyer = database
            .get_foyer_by_id(foyer_id)
            .map_err(|e| e.to_string())?;
        if foyer.type_foyer == "COUPLE" {
            return foyer_folder_name(database, foyer_id, contact);
        }
    }
    Ok(format_contact_folder_name(&contact.nom, &contact.prenom))
}

/// Copie un document CRM vers le dossier OneDrive du contact si l'option est activée.
/// Retourne un message utilisateur (succès ou avertissement), ou `None` si ignoré.
pub fn maybe_copy_document_to_contact_onedrive(
    app: &AppHandle,
    document: &Document,
) -> Result<Option<String>, String> {
    let db_state = app.state::<DbState>();
    let (connected, link, safe_name) = {
        let database = db_state.lock().unwrap();
        let database = database.as_ref().ok_or("Database not initialized")?;
        if !is_copy_document_on_import_enabled(database) {
            return Ok(None);
        }
        let Some(contact_id) = document.contact_id else {
            return Ok(None);
        };
        let connected = resolve_microsoft_onedrive_connection(app)?.is_some();
        let link = database
            .resolve_contact_onedrive_link(contact_id)
            .map_err(|e| e.to_string())?;
        let safe_name = sanitize_onedrive_upload_filename(&document.nom_fichier)?;
        (connected, link, safe_name)
    };
    if !connected {
        return Ok(Some(
            "Document enregistré — OneDrive non connecté (copie cloud ignorée).".into(),
        ));
    }
    let Some(link) = link else {
        return Ok(Some(
            "Document enregistré — aucun dossier OneDrive relié à ce client.".into(),
        ));
    };
    let path = std::path::Path::new(&document.chemin_fichier);
    if !path.is_file() {
        return Ok(Some(
            "Document enregistré — fichier local introuvable pour la copie OneDrive.".into(),
        ));
    }
    let file_bytes = std::fs::read(path).map_err(|e| format!("Lecture fichier : {e}"))?;
    upload_file_to_onedrive_folder(app, &link.folder_id, &safe_name, &file_bytes)?;
    Ok(Some(format!(
        "Document copié sur OneDrive : {}",
        link.folder_name
    )))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn read_bool_setting_parses_common_values() {
        let db = crate::database::Database::open_in_memory_for_tests().unwrap();
        db.set_setting("test_flag", "1").unwrap();
        assert!(read_bool_setting(&db, "test_flag"));
        db.set_setting("test_flag", "0").unwrap();
        assert!(!read_bool_setting(&db, "test_flag"));
    }

    #[test]
    fn is_client_category_matches_clients_and_prospects() {
        assert!(is_client_category("CLIENT"));
        assert!(is_client_category("PROSPECT_CLIENT"));
        assert!(!is_client_category("SUSPECT"));
    }
}
