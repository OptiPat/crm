//! Hooks métier OneDrive (création contact, copie document) — best-effort, non bloquant.

use super::commands::{foyer_folder_name, require_root_folder_id, save_created_link};
use super::drive::{
    create_client_onedrive_folder, onedrive_child_item_exists,
    resolve_microsoft_onedrive_connection, sanitize_onedrive_upload_filename,
    upload_file_to_onedrive_folder, verify_onedrive_folder_health,
};
use super::matching::format_contact_folder_name;
use crate::commands::DbState;
use crate::database::models::{Contact, Document};
use crate::database::Database;
use crate::documents_storage::validate_managed_document_file;
use std::path::PathBuf;
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

#[derive(Debug, PartialEq, Eq)]
enum CopyGuard {
    Skip,
    Message(String),
    Error(String),
    Proceed,
}

fn evaluate_copy_guard(
    on_import: bool,
    setting_on: bool,
    has_contact: bool,
    connected: bool,
    has_link: bool,
    file_ok: bool,
) -> CopyGuard {
    if on_import && !setting_on {
        return CopyGuard::Skip;
    }
    if !has_contact {
        return if on_import {
            CopyGuard::Skip
        } else {
            CopyGuard::Error("Ce document n'est lié à aucun client.".into())
        };
    }
    if !connected {
        return if on_import {
            CopyGuard::Message(
                "Document enregistré — OneDrive non connecté (copie cloud ignorée).".into(),
            )
        } else {
            CopyGuard::Error("OneDrive non connecté.".into())
        };
    }
    if !has_link {
        return if on_import {
            CopyGuard::Message(
                "Document enregistré — aucun dossier OneDrive relié à ce client.".into(),
            )
        } else {
            CopyGuard::Error("Aucun dossier OneDrive relié à ce client.".into())
        };
    }
    if !file_ok {
        return if on_import {
            CopyGuard::Message(
                "Document enregistré — fichier local introuvable pour la copie OneDrive.".into(),
            )
        } else {
            CopyGuard::Error("Fichier local introuvable pour la copie OneDrive.".into())
        };
    }
    CopyGuard::Proceed
}

fn map_folder_health_error(err: &str) -> String {
    if err == "cloud_missing" {
        return "Dossier OneDrive introuvable. Reliez à nouveau le dossier du client.".into();
    }
    if err.contains("n'appartient pas au dossier racine") {
        return err.to_string();
    }
    "Dossier OneDrive inaccessible. Vérifiez le lien du client dans la fiche.".into()
}

fn resolve_copy_source_path(app: &AppHandle, document: &Document) -> Result<PathBuf, String> {
    let app_data_dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("App data introuvable : {e}"))?;
    let path = std::path::Path::new(&document.chemin_fichier);
    if let Ok(managed) = validate_managed_document_file(&app_data_dir, path) {
        return Ok(managed);
    }
    if crate::workspace::documents::logical_document_id(&document.chemin_fichier).is_some() {
        let db_state = app.state::<DbState>();
        let resolved =
            crate::workspace::documents::ensure_local_document(app, &db_state, document.id)?;
        return validate_managed_document_file(&app_data_dir, &resolved).map_err(|_| {
            "Fichier local introuvable pour la copie OneDrive.".to_string()
        });
    }
    Err("Fichier local introuvable pour la copie OneDrive.".into())
}

#[derive(Debug, Clone, PartialEq, Eq)]
enum CopyInner {
    Skip,
    Message(String),
    Copied(String),
    AlreadyExists(String),
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct CopyDocumentResult {
    pub copied: bool,
    pub already_exists: bool,
    pub message: String,
}

/// Copie un document GED vers le dossier OneDrive déjà relié au client.
/// Ignore l'option « copier à l'import ».
pub fn copy_document_to_contact_onedrive(
    app: &AppHandle,
    document: &Document,
    overwrite: bool,
) -> Result<CopyDocumentResult, String> {
    match copy_document_to_contact_onedrive_inner(app, document, false, overwrite)? {
        CopyInner::Copied(message) => Ok(CopyDocumentResult {
            copied: true,
            already_exists: false,
            message,
        }),
        CopyInner::AlreadyExists(message) => Ok(CopyDocumentResult {
            copied: false,
            already_exists: true,
            message,
        }),
        CopyInner::Message(message) => Err(message),
        CopyInner::Skip => Err("Impossible de copier ce document vers OneDrive.".into()),
    }
}

/// Copie un document CRM vers le dossier OneDrive du contact si l'option est activée.
/// Retourne un message utilisateur (succès ou avertissement), ou `None` si ignoré.
pub fn maybe_copy_document_to_contact_onedrive(
    app: &AppHandle,
    document: &Document,
) -> Result<Option<String>, String> {
    match copy_document_to_contact_onedrive_inner(app, document, true, false) {
        Ok(CopyInner::Skip) => Ok(None),
        Ok(CopyInner::Message(msg) | CopyInner::Copied(msg)) => Ok(Some(msg)),
        Ok(CopyInner::AlreadyExists(_)) => Ok(Some(
            "Document enregistré — un fichier du même nom existe déjà sur OneDrive (copie ignorée)."
                .into(),
        )),
        Err(e) => Ok(Some(format!(
            "Document enregistré — copie OneDrive échouée : {e}"
        ))),
    }
}

fn copy_document_to_contact_onedrive_inner(
    app: &AppHandle,
    document: &Document,
    on_import: bool,
    overwrite: bool,
) -> Result<CopyInner, String> {
    let db_state = app.state::<DbState>();
    let (link, safe_name, root_id) = {
        let database = db_state.lock().unwrap();
        let database = database.as_ref().ok_or("Database not initialized")?;
        if on_import && !is_copy_document_on_import_enabled(database) {
            return Ok(CopyInner::Skip);
        }
        let Some(contact_id) = document.contact_id else {
            if on_import {
                return Ok(CopyInner::Skip);
            }
            return Err("Ce document n'est lié à aucun client.".into());
        };
        let link = database
            .resolve_contact_onedrive_link(contact_id)
            .map_err(|e| e.to_string())?;
        let safe_name = sanitize_onedrive_upload_filename(&document.nom_fichier)?;
        let root_id = require_root_folder_id(database).ok();
        (link, safe_name, root_id)
    };
    let connected = resolve_microsoft_onedrive_connection(app)?.is_some();
    match evaluate_copy_guard(on_import, true, true, connected, link.is_some(), true) {
        CopyGuard::Skip => return Ok(CopyInner::Skip),
        CopyGuard::Message(msg) => return Ok(CopyInner::Message(msg)),
        CopyGuard::Error(msg) => return Err(msg),
        CopyGuard::Proceed => {}
    }
    let Some(link) = link else {
        return Err("Aucun dossier OneDrive relié à ce client.".into());
    };
    if !on_import && root_id.is_none() {
        return Err(
            "Choisissez d'abord le dossier racine « Dossier clients » dans Paramètres → Intégrations."
                .into(),
        );
    }
    let source_path = match resolve_copy_source_path(app, document) {
        Ok(path) => path,
        Err(_) if on_import => {
            return Ok(CopyInner::Message(
                "Document enregistré — fichier local introuvable pour la copie OneDrive.".into(),
            ));
        }
        Err(e) => return Err(e),
    };
    if let Some(root_id) = root_id.as_deref() {
        if let Err(err) = verify_onedrive_folder_health(app, &link.folder_id, root_id) {
            let mapped = map_folder_health_error(&err);
            if on_import {
                return Ok(CopyInner::Message(format!(
                    "Document enregistré — {mapped} (copie ignorée)."
                )));
            }
            return Err(mapped);
        }
    }
    if !overwrite {
        match onedrive_child_item_exists(app, &link.folder_id, &safe_name) {
            Ok(true) => {
                return Ok(CopyInner::AlreadyExists(format!(
                    "Un fichier « {safe_name} » existe déjà dans le dossier OneDrive « {} ».",
                    link.folder_name
                )));
            }
            Ok(false) => {}
            Err(e) if on_import => {
                return Ok(CopyInner::Message(format!(
                    "Document enregistré — copie OneDrive échouée : {e}"
                )));
            }
            Err(e) => return Err(e),
        }
    }
    let file_bytes = std::fs::read(&source_path).map_err(|e| format!("Lecture fichier : {e}"))?;
    upload_file_to_onedrive_folder(app, &link.folder_id, &safe_name, &file_bytes)?;
    Ok(CopyInner::Copied(format!(
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

    #[test]
    fn import_copy_skips_when_setting_off_or_no_contact() {
        assert_eq!(
            evaluate_copy_guard(true, false, true, true, true, true),
            CopyGuard::Skip
        );
        assert_eq!(
            evaluate_copy_guard(true, true, false, true, true, true),
            CopyGuard::Skip
        );
    }

    #[test]
    fn manual_copy_requires_contact_link_and_file() {
        assert_eq!(
            evaluate_copy_guard(false, false, false, true, true, true),
            CopyGuard::Error("Ce document n'est lié à aucun client.".into())
        );
        assert_eq!(
            evaluate_copy_guard(false, false, true, false, true, true),
            CopyGuard::Error("OneDrive non connecté.".into())
        );
        assert_eq!(
            evaluate_copy_guard(false, false, true, true, false, true),
            CopyGuard::Error("Aucun dossier OneDrive relié à ce client.".into())
        );
        assert_eq!(
            evaluate_copy_guard(false, false, true, true, true, false),
            CopyGuard::Error("Fichier local introuvable pour la copie OneDrive.".into())
        );
        assert_eq!(
            evaluate_copy_guard(false, false, true, true, true, true),
            CopyGuard::Proceed
        );
    }

    #[test]
    fn import_copy_warns_without_connection_or_link() {
        assert!(matches!(
            evaluate_copy_guard(true, true, true, false, true, true),
            CopyGuard::Message(msg) if msg.contains("non connecté")
        ));
        assert!(matches!(
            evaluate_copy_guard(true, true, true, true, false, true),
            CopyGuard::Message(msg) if msg.contains("aucun dossier OneDrive")
        ));
    }

    #[test]
    fn map_folder_health_error_is_user_facing() {
        assert!(map_folder_health_error("cloud_missing").contains("introuvable"));
        assert!(map_folder_health_error("OneDrive API: {\"error\":true}").contains("inaccessible"));
        assert!(!map_folder_health_error("OneDrive API: {\"error\":true}").contains("error"));
    }
}
