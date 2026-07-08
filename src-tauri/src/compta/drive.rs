//! Google Drive — scan dossiers compta mensuels.

use super::{compta_drive_folder_name, compta_folder_names_match};
use crate::email::oauth_send::refresh_connection_if_needed;
use crate::email::oauth_store::EmailOAuthStore;
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Manager};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ComptaDriveFile {
    pub id: String,
    pub name: String,
    pub web_view_link: Option<String>,
    pub mime_type: String,
    pub modified_time: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ComptaDriveMonthScan {
    pub depenses_folder_id: Option<String>,
    pub encaissements_folder_id: Option<String>,
    pub depenses_files: Vec<ComptaDriveFile>,
    pub encaissements_files: Vec<ComptaDriveFile>,
    pub depenses_folder_name: String,
    pub encaissements_folder_name: String,
}

#[derive(Debug, Deserialize)]
struct DriveFileList {
    files: Option<Vec<DriveFile>>,
    #[serde(rename = "nextPageToken", default)]
    next_page_token: Option<String>,
}

#[derive(Debug, Deserialize)]
struct DriveFile {
    id: String,
    name: String,
    #[serde(rename = "mimeType", default)]
    mime_type: String,
    #[serde(rename = "webViewLink", default)]
    web_view_link: Option<String>,
    #[serde(rename = "modifiedTime", default)]
    modified_time: Option<String>,
}

fn google_drive_token(app: &AppHandle) -> Result<String, String> {
    let store = EmailOAuthStore::load(app)?;
    let mut conn = store
        .connection
        .clone()
        .ok_or("Connectez Google dans Paramètres → Emails & envois → Connexion (compte Google requis).")?;
    if conn.provider != "google" {
        return Err("La synchronisation Drive nécessite un compte Google connecté.".into());
    }
    refresh_connection_if_needed(app, &mut conn)?;
    Ok(conn.access_token)
}

fn drive_query_list(
    client: &reqwest::blocking::Client,
    token: &str,
    q: &str,
) -> Result<Vec<DriveFile>, String> {
    let mut out = Vec::new();
    let mut page_token: Option<String> = None;
    loop {
        let mut query: Vec<(&str, String)> = vec![
            ("q", q.to_string()),
            (
                "fields",
                "nextPageToken,files(id,name,mimeType,webViewLink,modifiedTime)".into(),
            ),
            ("pageSize", "200".into()),
        ];
        if let Some(ref pt) = page_token {
            query.push(("pageToken", pt.clone()));
        }
        let res = client
            .get("https://www.googleapis.com/drive/v3/files")
            .query(&query)
            .bearer_auth(token)
            .send()
            .map_err(|e| e.to_string())?;
        if res.status() == reqwest::StatusCode::FORBIDDEN {
            return Err(
                "Accès Drive refusé. Déconnectez puis reconnectez Google dans Paramètres → Emails & envois → Connexion (scope Drive)."
                    .into(),
            );
        }
        if !res.status().is_success() {
            return Err(format!("Drive API: {}", res.text().unwrap_or_default()));
        }
        let list: DriveFileList = res.json().map_err(|e| e.to_string())?;
        if let Some(files) = list.files {
            out.extend(files);
        }
        page_token = list.next_page_token;
        if page_token.is_none() {
            break;
        }
    }
    Ok(out)
}

fn find_month_folder(
    client: &reqwest::blocking::Client,
    token: &str,
    parent_id: &str,
    expected_name: &str,
) -> Result<Option<String>, String> {
    let q = format!(
        "'{}' in parents and mimeType = 'application/vnd.google-apps.folder' and trashed = false",
        parent_id
    );
    let folders = drive_query_list(client, token, &q)?;
    Ok(folders.into_iter().find_map(|f| {
        if compta_folder_names_match(expected_name, &f.name) {
            Some(f.id)
        } else {
            None
        }
    }))
}

fn list_folder_files(
    client: &reqwest::blocking::Client,
    token: &str,
    folder_id: &str,
) -> Result<Vec<ComptaDriveFile>, String> {
    let q = format!("'{}' in parents and trashed = false", folder_id);
    let files = drive_query_list(client, token, &q)?;
    Ok(files
        .into_iter()
        .filter(|f| {
            f.mime_type == "application/pdf"
                || f.name.to_lowercase().ends_with(".pdf")
                || f.mime_type.starts_with("image/")
        })
        .map(|f| ComptaDriveFile {
            id: f.id.clone(),
            web_view_link: f
                .web_view_link
                .clone()
                .or_else(|| Some(drive_view_url(&f.id))),
            name: f.name,
            mime_type: f.mime_type,
            modified_time: f.modified_time,
        })
        .collect())
}

pub fn drive_view_url(file_id: &str) -> String {
    format!("https://drive.google.com/file/d/{file_id}/view")
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ComptaDriveBrowseItem {
    pub id: String,
    pub name: String,
    pub is_folder: bool,
    pub web_view_link: Option<String>,
    pub modified_time: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ComptaDriveBrowseResult {
    pub folder_id: String,
    pub folder_name: String,
    pub parent_folder_id: Option<String>,
    pub items: Vec<ComptaDriveBrowseItem>,
}

#[derive(Debug, Deserialize)]
struct DriveFileMeta {
    name: String,
    #[serde(default)]
    parents: Option<Vec<String>>,
}

fn get_drive_folder_meta(
    client: &reqwest::blocking::Client,
    token: &str,
    folder_id: &str,
) -> Result<(String, Option<String>), String> {
    let res = client
        .get(format!(
            "https://www.googleapis.com/drive/v3/files/{}",
            folder_id.trim()
        ))
        .query(&[("fields", "name,parents")])
        .bearer_auth(token)
        .send()
        .map_err(|e| e.to_string())?;
    if !res.status().is_success() {
        return Err(format!("Drive API: {}", res.text().unwrap_or_default()));
    }
    let meta: DriveFileMeta = res.json().map_err(|e| e.to_string())?;
    Ok((meta.name, meta.parents.and_then(|p| p.into_iter().next())))
}

pub fn resolve_browse_start_folder(
    app: &AppHandle,
    root_folder_id: &str,
    year: Option<i32>,
    month: Option<u32>,
    month_folder_kind: Option<&str>,
) -> Result<String, String> {
    let root = root_folder_id.trim();
    if root.is_empty() {
        return Err("Renseignez l'ID du dossier racine Drive dans Configuration.".into());
    }
    if let (Some(y), Some(m), Some(kind)) = (year, month, month_folder_kind) {
        let folder_label = match kind {
            "depenses" => "Dépenses",
            "encaissements" => "Encaissements",
            _ => return Err("Dossier Drive invalide.".into()),
        };
        let expected = compta_drive_folder_name(y, m, folder_label);
        let token = google_drive_token(app)?;
        let client = reqwest::blocking::Client::new();
        if let Some(id) = find_month_folder(&client, &token, root, &expected)? {
            return Ok(id);
        }
    }
    Ok(root.to_string())
}

pub fn browse_compta_drive_folder(
    app: &AppHandle,
    folder_id: &str,
) -> Result<ComptaDriveBrowseResult, String> {
    let token = google_drive_token(app)?;
    let client = reqwest::blocking::Client::new();
    let (folder_name, parent_folder_id) = get_drive_folder_meta(&client, &token, folder_id)?;

    let q = format!("'{}' in parents and trashed = false", folder_id.trim());
    let files = drive_query_list(&client, &token, &q)?;

    let mut items: Vec<ComptaDriveBrowseItem> = files
        .into_iter()
        .filter_map(|f| {
            let is_folder = f.mime_type == "application/vnd.google-apps.folder";
            if is_folder {
                return Some(ComptaDriveBrowseItem {
                    id: f.id,
                    name: f.name,
                    is_folder: true,
                    web_view_link: None,
                    modified_time: f.modified_time,
                });
            }
            let selectable = f.mime_type == "application/pdf"
                || f.name.to_lowercase().ends_with(".pdf")
                || f.mime_type.starts_with("image/");
            if !selectable {
                return None;
            }
            Some(ComptaDriveBrowseItem {
                id: f.id.clone(),
                web_view_link: f
                    .web_view_link
                    .clone()
                    .or_else(|| Some(drive_view_url(&f.id))),
                name: f.name,
                is_folder: false,
                modified_time: f.modified_time,
            })
        })
        .collect();

    items.sort_by(|a, b| {
        match (a.is_folder, b.is_folder) {
            (true, false) => std::cmp::Ordering::Less,
            (false, true) => std::cmp::Ordering::Greater,
            _ => a.name.to_lowercase().cmp(&b.name.to_lowercase()),
        }
    });

    Ok(ComptaDriveBrowseResult {
        folder_id: folder_id.to_string(),
        folder_name,
        parent_folder_id,
        items,
    })
}

pub fn scan_compta_drive_month(
    app: &AppHandle,
    root_folder_id: &str,
    year: i32,
    month: u32,
) -> Result<ComptaDriveMonthScan, String> {
    let token = google_drive_token(app)?;
    let client = reqwest::blocking::Client::new();
    let root = root_folder_id.trim();
    if root.is_empty() {
        return Err("Renseignez l'ID du dossier racine Drive dans Configuration.".into());
    }

    let depenses_name = compta_drive_folder_name(year, month, "Dépenses");
    let enc_name = compta_drive_folder_name(year, month, "Encaissements");

    let depenses_folder_id = find_month_folder(&client, &token, root, &depenses_name)?;
    let encaissements_folder_id = find_month_folder(&client, &token, root, &enc_name)?;

    let depenses_files = depenses_folder_id
        .as_ref()
        .map(|id| list_folder_files(&client, &token, id))
        .transpose()?
        .unwrap_or_default();
    let encaissements_files = encaissements_folder_id
        .as_ref()
        .map(|id| list_folder_files(&client, &token, id))
        .transpose()?
        .unwrap_or_default();

    Ok(ComptaDriveMonthScan {
        depenses_folder_id,
        encaissements_folder_id,
        depenses_files,
        encaissements_files,
        depenses_folder_name: depenses_name,
        encaissements_folder_name: enc_name,
    })
}

pub fn download_drive_file_to_cache(
    app: &AppHandle,
    file_id: &str,
    file_name: &str,
) -> Result<String, String> {
    let token = google_drive_token(app)?;
    let client = reqwest::blocking::Client::new();
    let res = client
        .get(format!(
            "https://www.googleapis.com/drive/v3/files/{}",
            file_id.trim()
        ))
        .query(&[("alt", "media")])
        .bearer_auth(&token)
        .send()
        .map_err(|e| e.to_string())?;
    if !res.status().is_success() {
        return Err(format!(
            "Téléchargement Drive échoué: {}",
            res.text().unwrap_or_default()
        ));
    }
    let bytes = res.bytes().map_err(|e| e.to_string())?;
    let cache_dir = app
        .path()
        .app_cache_dir()
        .map_err(|e| e.to_string())?
        .join("compta-drive");
    std::fs::create_dir_all(&cache_dir).map_err(|e| e.to_string())?;
    let safe_name = file_name
        .chars()
        .map(|c| {
            if c.is_ascii_alphanumeric() || c == '.' || c == '-' || c == '_' {
                c
            } else {
                '_'
            }
        })
        .collect::<String>();
    let path = cache_dir.join(format!("{}_{}", file_id, safe_name));
    std::fs::write(&path, &bytes).map_err(|e| e.to_string())?;
    Ok(path.to_string_lossy().into_owned())
}
