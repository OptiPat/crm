use super::drive::{
    browse_client_onedrive_folder, create_client_onedrive_folder, ensure_folder_under_client_root,
    get_drive_item_relative_path, get_drive_item_web_url, list_client_onedrive_child_folders,
    rename_client_onedrive_folder, resolve_microsoft_onedrive_connection,
    verify_onedrive_folder_health, ClientOneDriveBrowseResult, ClientOneDriveItem,
};
use super::local_sync::{resolve_local_onedrive_folder, LocalFolderResolveInput};
use super::matching::{format_contact_folder_name, propose_folder_matches};
use crate::auth::session::{require_ui_session, UiSessionState};
use crate::commands::DbState;
use crate::database::client_onedrive::{
    ClientOneDriveConfig, ClientOneDriveFolderLink, ClientOneDriveFolderProposal,
};
use crate::database::models::Contact;
use crate::email::oauth_flow::{disconnect_microsoft_onedrive_oauth, run_oauth_connect};
use crate::email::oauth_store::EmailOAuthStore;
use crate::system_commands::{open_path_with_system_default, open_url_in_browser};
use serde::{Deserialize, Serialize};
use std::collections::HashSet;
use std::path::Path;
use tauri::{AppHandle, Manager, State};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ClientOneDriveStatus {
    pub connected: bool,
    pub email: Option<String>,
    pub root_folder_id: Option<String>,
    pub root_folder_name: Option<String>,
    pub local_sync_root: Option<String>,
    pub microsoft_client_id_configured: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct OpenClientOneDriveFolderResult {
    pub mode: String,
    pub message: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ContactOneDriveHealth {
    pub status: String,
    pub folder_id: Option<String>,
    pub folder_name: Option<String>,
    pub local_available: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ContactOneDriveLinkFlag {
    pub contact_id: i64,
    pub linked: bool,
}

async fn run_onedrive_blocking<T, F>(f: F) -> Result<T, String>
where
    F: FnOnce() -> Result<T, String> + Send + 'static,
    T: Send + 'static,
{
    tauri::async_runtime::spawn_blocking(f)
        .await
        .map_err(|e| format!("OneDrive interrompu: {e}"))?
}

fn foyer_folder_name(
    database: &crate::database::Database,
    foyer_id: i64,
    fallback_contact: &Contact,
) -> Result<String, String> {
    let foyer = database
        .get_foyer_by_id(foyer_id)
        .map_err(|e| e.to_string())?;
    let foyer_nom = foyer.nom.trim();
    if !foyer_nom.is_empty() {
        return Ok(foyer_nom.to_string());
    }
    let members = database
        .get_contacts_by_foyer(foyer_id)
        .map_err(|e| e.to_string())?;
    if members.len() >= 2 {
        let a = &members[0];
        let b = &members[1];
        return Ok(format!(
            "{} & {}",
            format_contact_folder_name(&a.nom, &a.prenom),
            format_contact_folder_name(&b.nom, &b.prenom)
        ));
    }
    Ok(format_contact_folder_name(
        &fallback_contact.nom,
        &fallback_contact.prenom,
    ))
}

fn load_status(app: &AppHandle) -> Result<ClientOneDriveStatus, String> {
    let store = EmailOAuthStore::load(app)?;
    let microsoft_client_id_configured = store
        .microsoft_client_id
        .as_ref()
        .is_some_and(|id| !id.trim().is_empty());
    let conn = resolve_microsoft_onedrive_connection(app)?;
    let db_state = app.state::<DbState>();
    let database = db_state.lock().unwrap();
    let database = database.as_ref().ok_or("Database not initialized")?;
    let config = database
        .get_client_onedrive_config()
        .map_err(|e| e.to_string())?;
    Ok(ClientOneDriveStatus {
        connected: conn.is_some(),
        email: conn.map(|c| c.email),
        root_folder_id: config.root_folder_id,
        root_folder_name: config.root_folder_name,
        local_sync_root: config.local_sync_root,
        microsoft_client_id_configured,
    })
}

fn require_root_folder_id(database: &crate::database::Database) -> Result<String, String> {
    let config = database
        .get_client_onedrive_config()
        .map_err(|e| e.to_string())?;
    config
        .root_folder_id
        .filter(|s| !s.trim().is_empty())
        .ok_or_else(|| {
            "Choisissez d'abord le dossier racine « Dossier clients » dans Paramètres → Intégrations."
                .into()
        })
}

fn ensure_link_under_configured_root(
    app: &AppHandle,
    database: &crate::database::Database,
    folder_id: &str,
) -> Result<(), String> {
    let root_id = require_root_folder_id(database)?;
    ensure_folder_under_client_root(app, folder_id, &root_id)
}

fn save_created_link(
    database: &crate::database::Database,
    contact: &Contact,
    created: &ClientOneDriveItem,
) -> Result<ClientOneDriveFolderLink, String> {
    if let Some(foyer_id) = contact.foyer_id {
        let foyer = database
            .get_foyer_by_id(foyer_id)
            .map_err(|e| e.to_string())?;
        if foyer.type_foyer == "COUPLE" {
            database
                .set_foyer_onedrive_link(
                    foyer_id,
                    &created.id,
                    &created.name,
                    created.web_url.as_deref(),
                )
                .map_err(|e| e.to_string())?;
            database
                .clear_foyer_members_contact_onedrive_links(foyer_id)
                .map_err(|e| e.to_string())?;
            return Ok(ClientOneDriveFolderLink {
                folder_id: created.id.clone(),
                folder_name: created.name.clone(),
                web_url: created.web_url.clone(),
                source: "foyer".into(),
            });
        }
    }
    let contact_id = contact.id.ok_or("Contact sans identifiant")?;
    database
        .set_contact_onedrive_link(
            contact_id,
            &created.id,
            &created.name,
            created.web_url.as_deref(),
        )
        .map_err(|e| e.to_string())?;
    Ok(ClientOneDriveFolderLink {
        folder_id: created.id.clone(),
        folder_name: created.name.clone(),
        web_url: created.web_url.clone(),
        source: "contact".into(),
    })
}

#[tauri::command]
pub async fn get_client_onedrive_status(
    app: AppHandle,
    session: State<'_, UiSessionState>,
) -> Result<ClientOneDriveStatus, String> {
    require_ui_session(&session)?;
    run_onedrive_blocking(move || load_status(&app)).await
}

#[tauri::command]
pub async fn connect_microsoft_onedrive_oauth_cmd(
    app_handle: AppHandle,
    session: State<'_, UiSessionState>,
    force_consent: Option<bool>,
) -> Result<ClientOneDriveStatus, String> {
    require_ui_session(&session)?;
    let force = force_consent.unwrap_or(false);
    run_onedrive_blocking(move || {
        run_oauth_connect(&app_handle, "microsoft_onedrive", force)?;
        load_status(&app_handle)
    })
    .await
}

#[tauri::command]
pub fn disconnect_microsoft_onedrive_oauth_cmd(
    app_handle: AppHandle,
    session: State<'_, UiSessionState>,
) -> Result<(), String> {
    require_ui_session(&session)?;
    disconnect_microsoft_onedrive_oauth(&app_handle)
}

#[tauri::command]
pub fn save_client_onedrive_root_folder(
    db: State<'_, DbState>,
    session: State<'_, UiSessionState>,
    folder_id: String,
    folder_name: String,
) -> Result<ClientOneDriveConfig, String> {
    require_ui_session(&session)?;
    let database = db.lock().unwrap();
    let database = database.as_ref().ok_or("Database not initialized")?;
    let mut config = database
        .get_client_onedrive_config()
        .map_err(|e| e.to_string())?;
    config.root_folder_id = Some(folder_id);
    config.root_folder_name = Some(folder_name);
    database
        .save_client_onedrive_config(&config)
        .map_err(|e| e.to_string())?;
    Ok(config)
}

#[tauri::command]
pub fn save_client_onedrive_local_sync_root(
    db: State<'_, DbState>,
    session: State<'_, UiSessionState>,
    path: String,
) -> Result<ClientOneDriveConfig, String> {
    require_ui_session(&session)?;
    let trimmed = path.trim();
    if trimmed.is_empty() {
        return Err("Choisissez le dossier OneDrive sur ce PC.".into());
    }
    let path_buf = Path::new(trimmed);
    if !path_buf.is_dir() {
        return Err("Ce chemin n'est pas un dossier accessible sur ce PC.".into());
    }
    let database = db.lock().unwrap();
    let database = database.as_ref().ok_or("Database not initialized")?;
    database
        .save_client_onedrive_local_sync_root(trimmed)
        .map_err(|e| e.to_string())?;
    database
        .get_client_onedrive_config()
        .map_err(|e| e.to_string())
}

fn open_onedrive_folder_local_or_web(
    app: &AppHandle,
    database: &crate::database::Database,
    folder_id: &str,
    folder_name: Option<&str>,
) -> Result<OpenClientOneDriveFolderResult, String> {
    let config = database
        .get_client_onedrive_config()
        .map_err(|e| e.to_string())?;

    let graph_relative = get_drive_item_relative_path(app, folder_id).ok();
    let folder_name = folder_name
        .filter(|name| !name.trim().is_empty())
        .or_else(|| {
            graph_relative
                .as_deref()
                .and_then(|relative| Path::new(relative).file_name())
                .and_then(|name| name.to_str())
        });

    if let Some(local_path) = resolve_local_onedrive_folder(LocalFolderResolveInput {
        configured_local: config.local_sync_root.as_deref(),
        cloud_root_name: config.root_folder_name.as_deref(),
        graph_relative: graph_relative.as_deref(),
        folder_name,
    }) {
        open_path_with_system_default(&local_path)
            .map_err(|e| format!("Impossible d'ouvrir le dossier : {e}"))?;
        return Ok(OpenClientOneDriveFolderResult {
            mode: "local".into(),
            message: None,
        });
    }

    if let Some(web_url) = get_drive_item_web_url(app, folder_id)? {
        open_url_in_browser(&web_url)?;
        let hint = config
            .local_sync_root
            .filter(|s| !s.trim().is_empty())
            .map(|path| format!(" Chemin configuré : {path}."))
            .unwrap_or_else(|| {
                " Indiquez D:\\OneDrive ou D:\\OneDrive\\Dossier Clients PRODEMIAL dans Paramètres."
                    .to_string()
            });
        return Ok(OpenClientOneDriveFolderResult {
            mode: "web".into(),
            message: Some(format!(
                "Dossier introuvable en local — ouverture dans le navigateur.{hint}"
            )),
        });
    }

    Err(
        "Dossier OneDrive introuvable. Vérifiez la synchro locale et le chemin OneDrive dans Paramètres."
            .into(),
    )
}

#[tauri::command]
pub async fn open_client_onedrive_folder(
    app: AppHandle,
    session: State<'_, UiSessionState>,
    folder_id: String,
    folder_name: Option<String>,
) -> Result<OpenClientOneDriveFolderResult, String> {
    require_ui_session(&session)?;
    run_onedrive_blocking(move || {
        let db = app.state::<DbState>();
        let database = db.inner().lock().unwrap();
        let database = database.as_ref().ok_or("Database not initialized")?;
        open_onedrive_folder_local_or_web(
            &app,
            database,
            &folder_id,
            folder_name.as_deref(),
        )
    })
    .await
}

#[tauri::command]
pub fn unlink_contact_onedrive_folder(
    db: State<'_, DbState>,
    session: State<'_, UiSessionState>,
    contact_id: i64,
) -> Result<(), String> {
    require_ui_session(&session)?;
    let database = db.lock().unwrap();
    let database = database.as_ref().ok_or("Database not initialized")?;
    if database
        .clear_onedrive_link_for_contact(contact_id)
        .map_err(|e| e.to_string())?
    {
        return Ok(());
    }
    Err("Aucun dossier OneDrive relié à ce contact.".into())
}

#[tauri::command]
pub fn list_contacts_onedrive_link_flags(
    db: State<'_, DbState>,
    session: State<'_, UiSessionState>,
) -> Result<Vec<ContactOneDriveLinkFlag>, String> {
    require_ui_session(&session)?;
    let database = db.lock().unwrap();
    let database = database.as_ref().ok_or("Database not initialized")?;
    Ok(database
        .list_client_onedrive_link_flags()
        .map_err(|e| e.to_string())?
        .into_iter()
        .map(|(contact_id, linked)| ContactOneDriveLinkFlag { contact_id, linked })
        .collect())
}

#[tauri::command]
pub async fn get_contact_onedrive_health(
    app: AppHandle,
    session: State<'_, UiSessionState>,
    contact_id: i64,
) -> Result<ContactOneDriveHealth, String> {
    require_ui_session(&session)?;
    run_onedrive_blocking(move || {
        if resolve_microsoft_onedrive_connection(&app)?.is_none() {
            return Ok(ContactOneDriveHealth {
                status: "not_connected".into(),
                folder_id: None,
                folder_name: None,
                local_available: false,
            });
        }
        let db = app.state::<DbState>();
        let database = db.inner().lock().unwrap();
        let database = database.as_ref().ok_or("Database not initialized")?;
        let link = database
            .resolve_contact_onedrive_link(contact_id)
            .map_err(|e| e.to_string())?;
        let Some(link) = link else {
            return Ok(ContactOneDriveHealth {
                status: "not_linked".into(),
                folder_id: None,
                folder_name: None,
                local_available: false,
            });
        };
        let config = database
            .get_client_onedrive_config()
            .map_err(|e| e.to_string())?;
        let Some(root_id) = config
            .root_folder_id
            .as_ref()
            .filter(|s| !s.trim().is_empty())
        else {
            return Ok(ContactOneDriveHealth {
                status: "not_configured".into(),
                folder_id: Some(link.folder_id.clone()),
                folder_name: Some(link.folder_name.clone()),
                local_available: false,
            });
        };
        let status = match verify_onedrive_folder_health(&app, &link.folder_id, root_id) {
            Ok(()) => "ok",
            Err(code) if code == "cloud_missing" => "cloud_missing",
            Err(_) => "out_of_root",
        };
        let graph_relative = get_drive_item_relative_path(&app, &link.folder_id).ok();
        let local_available = super::local_sync::resolve_local_onedrive_folder(
            super::local_sync::LocalFolderResolveInput {
                configured_local: config.local_sync_root.as_deref(),
                cloud_root_name: config.root_folder_name.as_deref(),
                graph_relative: graph_relative.as_deref(),
                folder_name: Some(link.folder_name.as_str()),
            },
        )
        .is_some();
        Ok(ContactOneDriveHealth {
            status: status.into(),
            folder_id: Some(link.folder_id),
            folder_name: Some(link.folder_name),
            local_available,
        })
    })
    .await
}

#[tauri::command]
pub async fn browse_client_onedrive(
    app: AppHandle,
    session: State<'_, UiSessionState>,
    folder_id: Option<String>,
) -> Result<ClientOneDriveBrowseResult, String> {
    require_ui_session(&session)?;
    run_onedrive_blocking(move || browse_client_onedrive_folder(&app, folder_id.as_deref())).await
}

#[tauri::command]
pub fn resolve_contact_onedrive_folder(
    db: State<'_, DbState>,
    session: State<'_, UiSessionState>,
    contact_id: i64,
) -> Result<Option<ClientOneDriveFolderLink>, String> {
    require_ui_session(&session)?;
    let database = db.lock().unwrap();
    let database = database.as_ref().ok_or("Database not initialized")?;
    database
        .resolve_contact_onedrive_link(contact_id)
        .map_err(|e| e.to_string())
}

fn ensure_onedrive_folder_available(
    database: &crate::database::Database,
    folder_id: &str,
    contact_id: Option<i64>,
    foyer_id: Option<i64>,
) -> Result<(), String> {
    let Some(owner) = database
        .find_onedrive_folder_owner(folder_id)
        .map_err(|e| e.to_string())?
    else {
        return Ok(());
    };
    let same_contact = contact_id.is_some_and(|id| owner.contact_id == Some(id));
    let same_foyer = foyer_id.is_some_and(|id| owner.foyer_id == Some(id));
    if same_contact || same_foyer {
        return Ok(());
    }
    if let (Some(owner_contact_id), Some(target_contact_id)) = (owner.contact_id, contact_id) {
        if database
            .contacts_share_couple_foyer(owner_contact_id, target_contact_id)
            .map_err(|e| e.to_string())?
        {
            return Ok(());
        }
    }
    if let (Some(owner_contact_id), Some(target_foyer_id)) = (owner.contact_id, foyer_id) {
        if database
            .contact_belongs_to_foyer(owner_contact_id, target_foyer_id)
            .map_err(|e| e.to_string())?
        {
            let foyer = database
                .get_foyer_by_id(target_foyer_id)
                .map_err(|e| e.to_string())?;
            if foyer.type_foyer == "COUPLE" {
                return Ok(());
            }
        }
    }
    if let (Some(owner_foyer_id), Some(target_contact_id)) = (owner.foyer_id, contact_id) {
        if database
            .contact_belongs_to_foyer(target_contact_id, owner_foyer_id)
            .map_err(|e| e.to_string())?
        {
            return Ok(());
        }
    }
    Err(format!(
        "Ce dossier OneDrive est déjà relié à {}.",
        owner.label
    ))
}

fn persist_onedrive_folder_link(
    database: &crate::database::Database,
    contact_id: i64,
    folder_id: &str,
    folder_name: &str,
    web_url: Option<&str>,
) -> Result<(), String> {
    let contact = database
        .get_contact_by_id(contact_id)
        .map_err(|e| e.to_string())?;
    if let Some(foyer_id) = contact.foyer_id {
        let foyer = database
            .get_foyer_by_id(foyer_id)
            .map_err(|e| e.to_string())?;
        if foyer.type_foyer == "COUPLE" {
            ensure_onedrive_folder_available(database, folder_id, None, Some(foyer_id))?;
            database
                .set_foyer_onedrive_link(foyer_id, folder_id, folder_name, web_url)
                .map_err(|e| e.to_string())?;
            return database
                .clear_foyer_members_contact_onedrive_links(foyer_id)
                .map_err(|e| e.to_string());
        }
    }
    ensure_onedrive_folder_available(database, folder_id, Some(contact_id), None)?;
    database
        .set_contact_onedrive_link(contact_id, folder_id, folder_name, web_url)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn link_contact_onedrive_folder(
    app: AppHandle,
    session: State<'_, UiSessionState>,
    contact_id: i64,
    folder_id: String,
    folder_name: String,
    web_url: Option<String>,
) -> Result<(), String> {
    require_ui_session(&session)?;
    run_onedrive_blocking(move || {
        let db = app.state::<DbState>();
        let database = db.inner().lock().unwrap();
        let database = database.as_ref().ok_or("Database not initialized")?;
        ensure_link_under_configured_root(&app, database, &folder_id)?;
        persist_onedrive_folder_link(
            database,
            contact_id,
            &folder_id,
            &folder_name,
            web_url.as_deref(),
        )
    })
    .await
}

#[tauri::command]
pub async fn create_contact_onedrive_folder_cmd(
    app: AppHandle,
    session: State<'_, UiSessionState>,
    contact_id: i64,
) -> Result<ClientOneDriveFolderLink, String> {
    require_ui_session(&session)?;
    run_onedrive_blocking(move || {
        let db = app.state::<DbState>();
        let (root_id, folder_name, contact) = {
            let database = db.inner().lock().unwrap();
            let database = database.as_ref().ok_or("Database not initialized")?;
            if let Some(link) = database
                .resolve_contact_onedrive_link(contact_id)
                .map_err(|e| e.to_string())?
            {
                return Ok(link);
            }
            let root_id = require_root_folder_id(database)?;
            let contact = database
                .get_contact_by_id(contact_id)
                .map_err(|e| e.to_string())?;
            let folder_name = if let Some(foyer_id) = contact.foyer_id {
                let foyer = database
                    .get_foyer_by_id(foyer_id)
                    .map_err(|e| e.to_string())?;
                if foyer.type_foyer == "COUPLE" {
                    foyer_folder_name(database, foyer_id, &contact)?
                } else {
                    format_contact_folder_name(&contact.nom, &contact.prenom)
                }
            } else {
                format_contact_folder_name(&contact.nom, &contact.prenom)
            };
            (root_id, folder_name, contact)
        };
        let created = create_client_onedrive_folder(&app, &root_id, &folder_name)?;
        let database = db.inner().lock().unwrap();
        let database = database.as_ref().ok_or("Database not initialized")?;
        save_created_link(database, &contact, &created)
    })
    .await
}

#[tauri::command]
pub async fn propose_client_onedrive_folder_matches(
    app: AppHandle,
    session: State<'_, UiSessionState>,
) -> Result<Vec<ClientOneDriveFolderProposal>, String> {
    require_ui_session(&session)?;
    run_onedrive_blocking(move || {
        let db = app.state::<DbState>();
        let (root_id, contacts, foyers, linked_ids) = {
            let database = db.inner().lock().unwrap();
            let database = database.as_ref().ok_or("Database not initialized")?;
            let root_id = require_root_folder_id(database)?;
            let contacts = database
                .list_contacts_for_onedrive_matching()
                .map_err(|e| e.to_string())?;
            let foyers = database
                .list_foyers_for_onedrive_matching()
                .map_err(|e| e.to_string())?;
            let linked_ids = database
                .list_linked_onedrive_folder_ids()
                .map_err(|e| e.to_string())?;
            (root_id, contacts, foyers, linked_ids)
        };
        let folders = list_client_onedrive_child_folders(&app, &root_id)?;
        let linked: HashSet<String> = linked_ids.into_iter().collect();
        let folder_rows: Vec<(String, String, Option<String>)> = folders
            .into_iter()
            .map(|f| (f.id, f.name, f.web_url))
            .collect();
        Ok(propose_folder_matches(
            &folder_rows,
            &contacts,
            &foyers,
            &linked,
        ))
    })
    .await
}

#[tauri::command]
pub async fn apply_client_onedrive_folder_proposal(
    app: AppHandle,
    session: State<'_, UiSessionState>,
    proposal: ClientOneDriveFolderProposal,
    rename_to: Option<String>,
) -> Result<(), String> {
    require_ui_session(&session)?;
    run_onedrive_blocking(move || {
        let (folder_id, folder_name, web_url) = if let Some(new_name) = rename_to {
            let trimmed = new_name.trim();
            if trimmed.is_empty() {
                return Err("Nom de dossier vide.".into());
            }
            let renamed = rename_client_onedrive_folder(&app, &proposal.folder_id, trimmed)?;
            (renamed.id, renamed.name, renamed.web_url)
        } else {
            (
                proposal.folder_id.clone(),
                proposal.folder_name.clone(),
                proposal.web_url.clone(),
            )
        };
        let db = app.state::<DbState>();
        let database = db.inner().lock().unwrap();
        let database = database.as_ref().ok_or("Database not initialized")?;
        ensure_link_under_configured_root(&app, database, &folder_id)?;
        if let Some(foyer_id) = proposal.foyer_id {
            ensure_onedrive_folder_available(database, &folder_id, None, Some(foyer_id))?;
            database
                .set_foyer_onedrive_link(
                    foyer_id,
                    &folder_id,
                    &folder_name,
                    web_url.as_deref(),
                )
                .map_err(|e| e.to_string())?;
            return database
                .clear_foyer_members_contact_onedrive_links(foyer_id)
                .map_err(|e| e.to_string());
        }
        if let Some(contact_id) = proposal.contact_id {
            return persist_onedrive_folder_link(
                database,
                contact_id,
                &folder_id,
                &folder_name,
                web_url.as_deref(),
            );
        }
        Err("Aucune cible CRM pour cette proposition.".into())
    })
    .await
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn format_contact_folder_uses_nom_prenom() {
        assert_eq!(format_contact_folder_name("DUPONT", "Jean"), "DUPONT Jean");
    }
}
