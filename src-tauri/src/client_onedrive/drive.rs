//! OneDrive personnel — dossiers clients (Microsoft Graph).

use crate::contact_name::normalize_contact_name;
use crate::email::oauth_send::{refresh_oauth_connection_if_needed, OAuthConnectionSlot};
use crate::email::oauth_store::{EmailOAuthConnection, EmailOAuthStore};
use serde::{Deserialize, Serialize};
use tauri::AppHandle;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ClientOneDriveItem {
    pub id: String,
    pub name: String,
    pub web_url: Option<String>,
    pub is_folder: bool,
    pub last_modified: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ClientOneDriveBrowseResult {
    pub folder_id: String,
    pub folder_name: String,
    pub parent_folder_id: Option<String>,
    pub items: Vec<ClientOneDriveItem>,
}

#[derive(Debug, Deserialize)]
struct GraphDriveItemList {
    value: Vec<GraphDriveItem>,
    #[serde(rename = "@odata.nextLink", default)]
    next_link: Option<String>,
}

#[derive(Debug, Deserialize)]
struct GraphDriveItem {
    id: String,
    name: String,
    #[serde(rename = "webUrl", default)]
    web_url: Option<String>,
    #[serde(default)]
    folder: Option<serde_json::Value>,
    #[serde(rename = "lastModifiedDateTime", default)]
    last_modified: Option<String>,
}

#[derive(Debug, Deserialize)]
struct GraphDriveItemCreated {
    id: String,
    name: String,
    #[serde(rename = "webUrl", default)]
    web_url: Option<String>,
}

pub fn resolve_microsoft_onedrive_connection(
    app: &AppHandle,
) -> Result<Option<EmailOAuthConnection>, String> {
    let store = EmailOAuthStore::load(app)?;
    if let Some(ref conn) = store.microsoft_onedrive_connection {
        let mut c = conn.clone();
        refresh_oauth_connection_if_needed(app, &mut c, OAuthConnectionSlot::MicrosoftOnedrive)?;
        return Ok(Some(c));
    }
    Ok(None)
}

fn onedrive_token(app: &AppHandle) -> Result<String, String> {
    let conn = resolve_microsoft_onedrive_connection(app)?
        .ok_or("Connectez Microsoft OneDrive dans Paramètres → Intégrations → Dossiers clients.")?;
    Ok(conn.access_token)
}

fn map_graph_item(item: GraphDriveItem) -> ClientOneDriveItem {
    ClientOneDriveItem {
        id: item.id,
        name: item.name,
        web_url: item.web_url,
        is_folder: item.folder.is_some(),
        last_modified: item.last_modified,
    }
}

fn list_children(
    client: &reqwest::blocking::Client,
    token: &str,
    folder_id: &str,
) -> Result<Vec<ClientOneDriveItem>, String> {
    let url = if folder_id == "root" {
        "https://graph.microsoft.com/v1.0/me/drive/root/children".to_string()
    } else {
        format!(
            "https://graph.microsoft.com/v1.0/me/drive/items/{folder_id}/children"
        )
    };
    let mut out = Vec::new();
    let mut next = Some(url);
    while let Some(page_url) = next.take() {
        let res = client
            .get(&page_url)
            .bearer_auth(token)
            .send()
            .map_err(|e| e.to_string())?;
        if res.status() == reqwest::StatusCode::FORBIDDEN {
            return Err(
                "Accès OneDrive refusé. Reconnectez Microsoft dans Paramètres → Intégrations → Dossiers clients."
                    .into(),
            );
        }
        if !res.status().is_success() {
            return Err(format!("OneDrive API: {}", res.text().unwrap_or_default()));
        }
        let list: GraphDriveItemList = res.json().map_err(|e| e.to_string())?;
        out.extend(list.value.into_iter().map(map_graph_item));
        next = list.next_link;
    }
    out.sort_by(|a, b| {
        b.is_folder
            .cmp(&a.is_folder)
            .then_with(|| a.name.to_lowercase().cmp(&b.name.to_lowercase()))
    });
    Ok(out)
}

fn fetch_item_meta(
    client: &reqwest::blocking::Client,
    token: &str,
    item_id: &str,
) -> Result<GraphDriveItem, String> {
    let url = format!("https://graph.microsoft.com/v1.0/me/drive/items/{item_id}");
    let res = client
        .get(&url)
        .bearer_auth(token)
        .send()
        .map_err(|e| e.to_string())?;
    if !res.status().is_success() {
        return Err(format!("OneDrive API: {}", res.text().unwrap_or_default()));
    }
    res.json().map_err(|e| e.to_string())
}

pub fn get_drive_item_relative_path(app: &AppHandle, item_id: &str) -> Result<String, String> {
    let token = onedrive_token(app)?;
    let client = reqwest::blocking::Client::new();
    let url = format!(
        "https://graph.microsoft.com/v1.0/me/drive/items/{item_id}?$select=name,parentReference"
    );
    let res = client
        .get(&url)
        .bearer_auth(&token)
        .send()
        .map_err(|e| e.to_string())?;
    if !res.status().is_success() {
        return Err(format!("OneDrive API: {}", res.text().unwrap_or_default()));
    }
    let json: serde_json::Value = res.json().map_err(|e| e.to_string())?;
    let name = json
        .get("name")
        .and_then(|v| v.as_str())
        .ok_or("Nom de dossier OneDrive introuvable.")?;
    let parent_path = json
        .get("parentReference")
        .and_then(|p| p.get("path"))
        .and_then(|v| v.as_str())
        .ok_or("Chemin OneDrive introuvable pour ce dossier.")?;
    let parent_relative = super::local_sync::graph_parent_path_to_relative(parent_path)
        .unwrap_or_default();
    let relative = if parent_relative.is_empty() {
        name.to_string()
    } else {
        super::local_sync::join_drive_relative(&parent_relative, name)
            .to_string_lossy()
            .into_owned()
    };
    Ok(relative)
}

pub fn get_drive_item_web_url(app: &AppHandle, item_id: &str) -> Result<Option<String>, String> {
    let token = onedrive_token(app)?;
    let client = reqwest::blocking::Client::new();
    let url = format!("https://graph.microsoft.com/v1.0/me/drive/items/{item_id}?$select=webUrl");
    let res = client
        .get(&url)
        .bearer_auth(&token)
        .send()
        .map_err(|e| e.to_string())?;
    if !res.status().is_success() {
        return Err(format!("OneDrive API: {}", res.text().unwrap_or_default()));
    }
    let json: serde_json::Value = res.json().map_err(|e| e.to_string())?;
    Ok(json
        .get("webUrl")
        .and_then(|v| v.as_str())
        .map(str::to_string))
}

pub fn browse_client_onedrive_folder(
    app: &AppHandle,
    folder_id: Option<&str>,
) -> Result<ClientOneDriveBrowseResult, String> {
    let token = onedrive_token(app)?;
    let client = reqwest::blocking::Client::new();
    let target = folder_id.unwrap_or("root");
    let meta = if target == "root" {
        GraphDriveItem {
            id: "root".into(),
            name: "OneDrive".into(),
            web_url: None,
            folder: Some(serde_json::json!({})),
            last_modified: None,
        }
    } else {
        fetch_item_meta(&client, &token, target)?
    };
    let parent_folder_id = if target == "root" {
        None
    } else {
        let url = format!("https://graph.microsoft.com/v1.0/me/drive/items/{target}?$select=parentReference");
        let res = client
            .get(&url)
            .bearer_auth(&token)
            .send()
            .map_err(|e| e.to_string())?;
        if !res.status().is_success() {
            return Err(format!("OneDrive API: {}", res.text().unwrap_or_default()));
        }
        let json: serde_json::Value = res.json().map_err(|e| e.to_string())?;
        json.get("parentReference")
            .and_then(|p| p.get("id"))
            .and_then(|v| v.as_str())
            .map(str::to_string)
    };
    let items = list_children(&client, &token, target)?;
    Ok(ClientOneDriveBrowseResult {
        folder_id: if target == "root" {
            "root".into()
        } else {
            meta.id
        },
        folder_name: meta.name,
        parent_folder_id,
        items,
    })
}

pub fn create_client_onedrive_folder(
    app: &AppHandle,
    parent_folder_id: &str,
    folder_name: &str,
) -> Result<ClientOneDriveItem, String> {
    if let Some(existing) = find_child_folder_by_name(app, parent_folder_id, folder_name)? {
        return Ok(existing);
    }
    let token = onedrive_token(app)?;
    let client = reqwest::blocking::Client::new();
    let parent = if parent_folder_id == "root" {
        "root".to_string()
    } else {
        parent_folder_id.to_string()
    };
    let url = format!(
        "https://graph.microsoft.com/v1.0/me/drive/items/{parent}/children"
    );
    let body = serde_json::json!({
        "name": folder_name,
        "folder": {},
        "@microsoft.graph.conflictBehavior": "fail"
    });
    let res = client
        .post(&url)
        .bearer_auth(&token)
        .json(&body)
        .send()
        .map_err(|e| e.to_string())?;
    if !res.status().is_success() {
        let body_text = res.text().unwrap_or_default();
        if graph_error_code(&body_text).as_deref() == Some("nameAlreadyExists") {
            if let Some(existing) = find_child_folder_by_name(app, parent_folder_id, folder_name)? {
                return Ok(existing);
            }
        }
        return Err(format!("Création dossier OneDrive: {body_text}"));
    }
    let created: GraphDriveItemCreated = res.json().map_err(|e| e.to_string())?;
    Ok(ClientOneDriveItem {
        id: created.id,
        name: created.name,
        web_url: created.web_url,
        is_folder: true,
        last_modified: None,
    })
}

fn folder_names_equal(a: &str, b: &str) -> bool {
    let a = a.trim();
    let b = b.trim();
    if a.eq_ignore_ascii_case(b) {
        return true;
    }
    normalize_contact_name(a) == normalize_contact_name(b)
}

fn graph_error_code(body: &str) -> Option<String> {
    serde_json::from_str::<serde_json::Value>(body)
        .ok()
        .and_then(|json| {
            json.get("error")
                .and_then(|e| e.get("code"))
                .and_then(|c| c.as_str())
                .map(str::to_string)
        })
}

pub fn get_item_parent_folder_id(app: &AppHandle, item_id: &str) -> Result<String, String> {
    let token = onedrive_token(app)?;
    let client = reqwest::blocking::Client::new();
    let url = format!("https://graph.microsoft.com/v1.0/me/drive/items/{item_id}?$select=parentReference");
    let res = client
        .get(&url)
        .bearer_auth(&token)
        .send()
        .map_err(|e| e.to_string())?;
    if !res.status().is_success() {
        return Err(format!("OneDrive API: {}", res.text().unwrap_or_default()));
    }
    let json: serde_json::Value = res.json().map_err(|e| e.to_string())?;
    json.get("parentReference")
        .and_then(|p| p.get("id"))
        .and_then(|v| v.as_str())
        .map(str::to_string)
        .ok_or_else(|| "Dossier parent OneDrive introuvable.".into())
}

pub fn find_child_folder_by_name(
    app: &AppHandle,
    parent_folder_id: &str,
    folder_name: &str,
) -> Result<Option<ClientOneDriveItem>, String> {
    let children = list_client_onedrive_child_folders(app, parent_folder_id)?;
    Ok(children
        .into_iter()
        .find(|item| folder_names_equal(&item.name, folder_name)))
}

pub fn rename_client_onedrive_folder(
    app: &AppHandle,
    item_id: &str,
    new_name: &str,
) -> Result<ClientOneDriveItem, String> {
    let token = onedrive_token(app)?;
    let client = reqwest::blocking::Client::new();
    let url = format!("https://graph.microsoft.com/v1.0/me/drive/items/{item_id}");
    let body = serde_json::json!({ "name": new_name });
    let res = client
        .patch(&url)
        .bearer_auth(&token)
        .json(&body)
        .send()
        .map_err(|e| e.to_string())?;
    if res.status().is_success() {
        let updated: GraphDriveItemCreated = res.json().map_err(|e| e.to_string())?;
        return Ok(ClientOneDriveItem {
            id: updated.id,
            name: updated.name,
            web_url: updated.web_url,
            is_folder: true,
            last_modified: None,
        });
    }
    let body_text = res.text().unwrap_or_default();
    if graph_error_code(&body_text).as_deref() == Some("nameAlreadyExists") {
        return resolve_existing_sibling_folder(app, item_id, new_name);
    }
    Err(format!("Renommage dossier OneDrive: {body_text}"))
}

/// Si le nom cible existe déjà (doublon Prénom NOM + NOM Prénom), relie le dossier existant.
fn resolve_existing_sibling_folder(
    app: &AppHandle,
    item_id: &str,
    target_name: &str,
) -> Result<ClientOneDriveItem, String> {
    let parent_id = get_item_parent_folder_id(app, item_id)?;
    if let Some(existing) = find_child_folder_by_name(app, &parent_id, target_name)? {
        if existing.id != item_id {
            return Ok(existing);
        }
        return Ok(existing);
    }
    Err(format!(
        "Le dossier « {target_name} » existe déjà sur OneDrive (doublon). \
         Supprimez ou fusionnez manuellement le dossier en double, puis réessayez."
    ))
}

pub fn ensure_folder_under_client_root(
    app: &AppHandle,
    folder_id: &str,
    root_folder_id: &str,
) -> Result<(), String> {
    if folder_id == root_folder_id {
        return Err(
            "Choisissez un dossier client, pas le dossier racine « Dossier clients » lui-même.".into(),
        );
    }
    let mut current = folder_id.to_string();
    for _ in 0..64 {
        if current == root_folder_id {
            return Ok(());
        }
        let parent = get_item_parent_folder_id(app, &current)?;
        if parent == current {
            break;
        }
        current = parent;
    }
    Err(
        "Ce dossier n'appartient pas au dossier racine clients configuré dans Paramètres → Intégrations."
            .into(),
    )
}

pub fn list_client_onedrive_child_folders(
    app: &AppHandle,
    parent_folder_id: &str,
) -> Result<Vec<ClientOneDriveItem>, String> {
    let token = onedrive_token(app)?;
    let client = reqwest::blocking::Client::new();
    Ok(list_children(&client, &token, parent_folder_id)?
        .into_iter()
        .filter(|i| i.is_folder)
        .collect())
}
