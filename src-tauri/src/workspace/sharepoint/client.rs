use reqwest::blocking::Client as BlockingClient;
use super::conflict::{parse_http_write_result, GraphWriteOutcome};
use super::schema::{ColumnKind, ListColumnDef, ListDef};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::sync::OnceLock;
use std::thread;
use std::time::Duration;

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GraphEntityVersion {
    pub id: String,
    pub etag: String,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct SharePointSiteRef {
    pub hostname: String,
    pub site_path: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ParsedSharePointSite {
    pub id: String,
    pub name: String,
    pub web_url: Option<String>,
    pub etag: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ParsedSharePointListItem {
    pub id: String,
    pub etag: String,
    pub fields: Value,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ParsedSharePointList {
    pub id: String,
    pub display_name: String,
    pub etag: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ParsedSharePointColumn {
    pub id: String,
    pub name: String,
    pub display_name: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ParsedDriveItem {
    pub id: String,
    pub name: String,
    pub etag: Option<String>,
    pub web_url: Option<String>,
    pub is_folder: bool,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SharePointConnectionTestResult {
    pub site_id: String,
    pub site_name: String,
    pub web_url: Option<String>,
    pub list_count: u32,
    pub drive_count: u32,
}

#[derive(Debug, Clone)]
pub struct SharePointGraphClient {
    pub site: SharePointSiteRef,
    pub api_version: String,
    http_client: Option<BlockingClient>,
}

const GRAPH_RATE_LIMIT_RETRIES: u32 = 3;
const GRAPH_RATE_LIMIT_PAUSE_SECS: u64 = 2;

impl SharePointGraphClient {
    pub fn new(site: SharePointSiteRef) -> Self {
        Self {
            site,
            api_version: "v1.0".into(),
            http_client: None,
        }
    }

    pub fn with_http_client(mut self, client: BlockingClient) -> Self {
        self.http_client = Some(client);
        self
    }

    fn http_client(&self) -> &BlockingClient {
        static DEFAULT: OnceLock<BlockingClient> = OnceLock::new();
        self.http_client.as_ref().unwrap_or_else(|| {
            DEFAULT.get_or_init(|| BlockingClient::new())
        })
    }

    pub fn urls(&self) -> super::SharePointGraphUrls {
        super::SharePointGraphUrls::new(self.site.clone()).with_api_version(&self.api_version)
    }

    pub fn resolve_site_blocking(&self, access_token: &str) -> Result<ParsedSharePointSite, String> {
        let url = self.urls().site_by_path();
        let (status, body) =
            graph_get_with_retry(self.http_client(), &url, access_token, "Résolution site SharePoint")?;
        if status != 200 {
            return Err(map_graph_http_error(status, &body));
        }
        Self::parse_site_response(&body)
    }

    pub fn count_site_lists_blocking(
        &self,
        access_token: &str,
        site_id: &str,
    ) -> Result<u32, String> {
        paginate_collection_count(
            self.http_client(),
            &self.urls().site_lists(site_id),
            access_token,
            "Listes SharePoint",
        )
    }

    pub fn count_site_drives_blocking(
        &self,
        access_token: &str,
        site_id: &str,
    ) -> Result<u32, String> {
        paginate_collection_count(
            self.http_client(),
            &self.urls().site_drives(site_id),
            access_token,
            "Bibliothèques SharePoint",
        )
    }

    pub fn test_connection_blocking(
        &self,
        access_token: &str,
    ) -> Result<SharePointConnectionTestResult, String> {
        let site = self.resolve_site_blocking(access_token)?;
        let list_count = self.count_site_lists_blocking(access_token, &site.id)?;
        let drive_count = self.count_site_drives_blocking(access_token, &site.id)?;
        Ok(SharePointConnectionTestResult {
            site_id: site.id,
            site_name: site.name,
            web_url: site.web_url,
            list_count,
            drive_count,
        })
    }

    pub fn parse_site_response(json: &str) -> Result<ParsedSharePointSite, String> {
        let value: Value = serde_json::from_str(json).map_err(|e| e.to_string())?;
        Ok(ParsedSharePointSite {
            id: required_string(&value, "id")?,
            name: required_string(&value, "name")?,
            web_url: optional_string(&value, "webUrl"),
            etag: extract_etag(&value),
        })
    }

    pub fn parse_list_item_response(json: &str) -> Result<ParsedSharePointListItem, String> {
        let value: Value = serde_json::from_str(json).map_err(|e| e.to_string())?;
        let etag = extract_etag(&value)
            .ok_or_else(|| "ETag absent dans la réponse liste SharePoint".to_string())?;
        Ok(ParsedSharePointListItem {
            id: required_string(&value, "id")?,
            etag,
            fields: value
                .get("fields")
                .cloned()
                .unwrap_or(Value::Object(Default::default())),
        })
    }

    pub fn parse_drive_item_response(json: &str) -> Result<ParsedDriveItem, String> {
        let value: Value = serde_json::from_str(json).map_err(|e| e.to_string())?;
        Ok(ParsedDriveItem {
            id: required_string(&value, "id")?,
            name: required_string(&value, "name")?,
            etag: extract_etag(&value),
            web_url: optional_string(&value, "webUrl"),
            is_folder: value.get("folder").is_some(),
        })
    }

    pub fn parse_list_items_page(json: &str) -> Result<Vec<ParsedSharePointListItem>, String> {
        let value: Value = serde_json::from_str(json).map_err(|e| e.to_string())?;
        let items = value
            .get("value")
            .and_then(|v| v.as_array())
            .ok_or_else(|| "Réponse Graph liste sans tableau value".to_string())?;
        items
            .iter()
            .map(parse_list_item_value)
            .collect()
    }

    pub fn parse_list_response(json: &str) -> Result<ParsedSharePointList, String> {
        let value: Value = serde_json::from_str(json).map_err(|e| e.to_string())?;
        parse_list_value(&value)
    }

    pub fn parse_lists_page(json: &str) -> Result<Vec<ParsedSharePointList>, String> {
        let value: Value = serde_json::from_str(json).map_err(|e| e.to_string())?;
        let items = value
            .get("value")
            .and_then(|v| v.as_array())
            .ok_or_else(|| "Réponse Graph listes sans tableau value".to_string())?;
        items.iter().map(parse_list_value).collect()
    }

    pub fn parse_columns_page(json: &str) -> Result<Vec<ParsedSharePointColumn>, String> {
        let value: Value = serde_json::from_str(json).map_err(|e| e.to_string())?;
        let items = value
            .get("value")
            .and_then(|v| v.as_array())
            .ok_or_else(|| "Réponse Graph colonnes sans tableau value".to_string())?;
        items
            .iter()
            .map(|item| {
                Ok(ParsedSharePointColumn {
                    id: required_string(item, "id")?,
                    name: required_string(item, "name")?,
                    display_name: optional_string(item, "displayName")
                        .unwrap_or_else(|| required_string(item, "name").unwrap_or_default()),
                })
            })
            .collect()
    }

    pub fn find_list_by_display_name_blocking(
        &self,
        access_token: &str,
        site_id: &str,
        display_name: &str,
    ) -> Result<Option<ParsedSharePointList>, String> {
        let escaped = display_name.replace('\'', "''");
        let filter = format!("displayName eq '{escaped}'");
        let url = self.urls().site_lists_filtered(site_id, &filter);
        let (status, body) =
            graph_get_with_retry(self.http_client(), &url, access_token, "Recherche liste SharePoint")?;
        if status != 200 {
            return Err(map_graph_http_error(status, &body));
        }
        let lists = Self::parse_lists_page(&body)?;
        Ok(lists.into_iter().next())
    }

    pub fn create_list_blocking(
        &self,
        access_token: &str,
        site_id: &str,
        display_name: &str,
    ) -> Result<ParsedSharePointList, String> {
        let url = self.urls().create_site_list(site_id);
        let payload = serde_json::json!({
            "displayName": display_name,
            "list": { "template": "genericList" }
        });
        let (status, body) = graph_post_with_retry(
            self.http_client(),
            &url,
            access_token,
            &payload,
            "Création liste SharePoint",
        )?;
        if status != 201 && status != 200 {
            return Err(map_graph_http_error(status, &body));
        }
        Self::parse_list_response(&body)
    }

    pub fn ensure_list_columns_blocking(
        &self,
        access_token: &str,
        site_id: &str,
        list_id: &str,
        columns: &[ListColumnDef],
    ) -> Result<(), String> {
        let url = self.urls().list_columns(site_id, list_id);
        let (status, body) =
            graph_get_with_retry(self.http_client(), &url, access_token, "Colonnes SharePoint")?;
        if status != 200 {
            return Err(map_graph_http_error(status, &body));
        }
        let existing = Self::parse_columns_page(&body)?;
        let existing_names: std::collections::HashSet<_> =
            existing.iter().map(|column| column.name.as_str()).collect();
        for column in columns {
            if existing_names.contains(column.name) {
                continue;
            }
            let payload = column_definition_payload(column);
            let create_url = self.urls().list_columns(site_id, list_id);
            let (create_status, create_body) = graph_post_with_retry(
                self.http_client(),
                &create_url,
                access_token,
                &payload,
                "Création colonne SharePoint",
            )?;
            if create_status != 201 && create_status != 200 {
                return Err(map_graph_http_error(create_status, &create_body));
            }
        }
        Ok(())
    }

    pub fn ensure_team_list_blocking(
        &self,
        access_token: &str,
        site_id: &str,
        list_def: &ListDef,
    ) -> Result<ParsedSharePointList, String> {
        let list = match self.find_list_by_display_name_blocking(access_token, site_id, list_def.display_name)? {
            Some(list) => list,
            None => self.create_list_blocking(access_token, site_id, list_def.display_name)?,
        };
        self.ensure_list_columns_blocking(access_token, site_id, &list.id, list_def.columns)?;
        Ok(list)
    }

    pub fn list_items_all_blocking(
        &self,
        access_token: &str,
        site_id: &str,
        list_id: &str,
        filter: Option<&str>,
    ) -> Result<Vec<ParsedSharePointListItem>, String> {
        let initial_url = match filter {
            Some(filter) => self.urls().list_items_filtered(site_id, list_id, filter),
            None => self.urls().list_items(site_id, list_id),
        };
        paginate_list_items(self.http_client(), &initial_url, access_token, "Éléments SharePoint")
    }

    pub fn create_list_item_blocking(
        &self,
        access_token: &str,
        site_id: &str,
        list_id: &str,
        fields: Value,
    ) -> Result<ParsedSharePointListItem, String> {
        let url = self.urls().list_items(site_id, list_id);
        let payload = serde_json::json!({ "fields": fields });
        let (status, body) = graph_post_with_retry(
            self.http_client(),
            &url,
            access_token,
            &payload,
            "Création élément SharePoint",
        )?;
        if status != 201 && status != 200 {
            return Err(map_graph_http_error(status, &body));
        }
        Self::parse_list_item_response(&body)
    }

    pub fn patch_list_item_fields_blocking(
        &self,
        access_token: &str,
        site_id: &str,
        list_id: &str,
        item_id: &str,
        etag: &str,
        fields: Value,
    ) -> Result<GraphWriteOutcome, String> {
        require_if_match_etag(etag)?;
        let url = self.urls().list_item_fields(site_id, list_id, item_id);
        let (status, body) = graph_patch_with_retry(
            self.http_client(),
            &url,
            access_token,
            etag,
            &fields,
            "Mise à jour élément SharePoint",
        )?;
        Ok(parse_http_write_result(status, &body, etag))
    }

    pub fn delete_list_item_blocking(
        &self,
        access_token: &str,
        site_id: &str,
        list_id: &str,
        item_id: &str,
        etag: &str,
    ) -> Result<GraphWriteOutcome, String> {
        require_if_match_etag(etag)?;
        let url = self.urls().delete_list_item(site_id, list_id, item_id);
        let (status, body) = graph_delete_with_retry(
            self.http_client(),
            &url,
            access_token,
            etag,
            "Suppression élément SharePoint",
        )?;
        Ok(parse_http_write_result(status, &body, etag))
    }
}

fn parse_list_item_value(item: &Value) -> Result<ParsedSharePointListItem, String> {
    let etag = extract_etag(item)
        .ok_or_else(|| "ETag absent dans un élément de liste".to_string())?;
    Ok(ParsedSharePointListItem {
        id: required_string(item, "id")?,
        etag,
        fields: item
            .get("fields")
            .cloned()
            .unwrap_or(Value::Object(Default::default())),
    })
}

fn parse_list_value(value: &Value) -> Result<ParsedSharePointList, String> {
    Ok(ParsedSharePointList {
        id: required_string(value, "id")?,
        display_name: required_string(value, "displayName")?,
        etag: extract_etag(value),
    })
}

fn column_definition_payload(column: &ListColumnDef) -> Value {
    // SharePoint doit arbitrer deux créations simultanées d'un même verrou.
    // Sans unicité serveur, deux clients pourraient créer chacun une ligne LockKey.
    let unique = matches!(column.name, "LockKey" | "SyncKey" | "SequenceKey");
    let mut payload = serde_json::json!({
        "name": column.name,
        "displayName": column.display_name,
        "enforceUniqueValues": unique,
        "indexed": unique,
    });
    match column.kind {
        ColumnKind::Text => {
            payload["text"] = serde_json::json!({});
        }
        ColumnKind::MultilineText => {
            payload["text"] = serde_json::json!({ "allowMultipleLines": true });
        }
        ColumnKind::DateTime => {
            payload["dateTime"] = serde_json::json!({});
        }
        ColumnKind::Boolean => {
            payload["boolean"] = serde_json::json!({});
        }
        ColumnKind::Number => {
            payload["number"] = serde_json::json!({});
        }
    }
    payload
}

fn require_if_match_etag(etag: &str) -> Result<(), String> {
    if etag.trim().is_empty() {
        return Err("ETag obligatoire pour patch/delete SharePoint.".into());
    }
    Ok(())
}

fn required_string(value: &Value, field: &str) -> Result<String, String> {
    value
        .get(field)
        .and_then(|v| v.as_str())
        .map(|s| s.to_string())
        .ok_or_else(|| format!("Champ Graph manquant: {field}"))
}

fn optional_string(value: &Value, field: &str) -> Option<String> {
    value
        .get(field)
        .and_then(|v| v.as_str())
        .filter(|s| !s.is_empty())
        .map(|s| s.to_string())
}

fn extract_etag(value: &Value) -> Option<String> {
    value
        .get("eTag")
        .or_else(|| value.get("@odata.etag"))
        .and_then(|v| v.as_str())
        .map(|s| s.to_string())
}

pub fn graph_error_code(body: &str) -> Option<String> {
    serde_json::from_str::<Value>(body)
        .ok()
        .and_then(|json| {
            json.get("error")
                .and_then(|error| error.get("code"))
                .and_then(|code| code.as_str())
                .map(str::to_string)
        })
}

pub fn is_sites_selected_access_denied(status: u16, body: &str) -> bool {
    if status != 403 {
        return false;
    }
    let lower = body.to_lowercase();
    let code = graph_error_code(body);
    matches!(
        code.as_deref(),
        Some("accessDenied") | Some("Authorization_RequestDenied") | Some("generalException")
    ) || lower.contains("sites.selected")
        || lower.contains("access denied")
        || lower.contains("insufficient")
        || lower.contains("authorization")
}

pub fn map_graph_http_error(status: u16, body: &str) -> String {
    if is_sites_selected_access_denied(status, body) {
        return "Accès SharePoint refusé : avec le scope Sites.Selected, l'administrateur Microsoft 365 \
                doit accorder explicitement l'application CRM au site (rôle write)."
            .into();
    }
    match status {
        401 => {
            "Session Microsoft expirée ou invalide. Reconnectez le compte équipe.".into()
        }
        403 => "Accès SharePoint refusé pour ce compte ou ce site.".into(),
        404 => "Site SharePoint introuvable : vérifiez le hostname et le chemin.".into(),
        429 => "Quota Microsoft Graph dépassé — réessayez dans quelques instants.".into(),
        _ => graph_error_code(body)
            .map(|code| format!("Erreur Microsoft Graph ({status}, {code})."))
            .unwrap_or_else(|| format!("Erreur Microsoft Graph ({status}).")),
    }
}

pub fn count_odata_value_array(json: &str) -> Result<usize, String> {
    let value: Value = serde_json::from_str(json).map_err(|error| error.to_string())?;
    value
        .get("value")
        .and_then(|items| items.as_array())
        .map(|items| items.len())
        .ok_or_else(|| "Réponse Graph sans tableau value".to_string())
}

pub fn extract_odata_next_link(json: &str) -> Option<String> {
    serde_json::from_str::<Value>(json)
        .ok()
        .and_then(|value| {
            value
                .get("@odata.nextLink")
                .and_then(|link| link.as_str())
                .filter(|link| !link.is_empty())
                .map(str::to_string)
        })
}

fn graph_get_blocking(
    client: &BlockingClient,
    url: &str,
    access_token: &str,
) -> Result<(u16, String), String> {
    let response = client
        .get(url)
        .bearer_auth(access_token)
        .send()
        .map_err(|error| format!("Requête Microsoft Graph impossible : {error}"))?;
    let status = response.status().as_u16();
    let body = response.text().unwrap_or_default();
    Ok((status, body))
}

fn graph_get_with_retry(
    client: &BlockingClient,
    url: &str,
    access_token: &str,
    label: &str,
) -> Result<(u16, String), String> {
    for attempt in 0..GRAPH_RATE_LIMIT_RETRIES {
        let (status, body) = graph_get_blocking(client, url, access_token)?;
        if status == 429 && attempt + 1 < GRAPH_RATE_LIMIT_RETRIES {
            thread::sleep(Duration::from_secs(GRAPH_RATE_LIMIT_PAUSE_SECS));
            continue;
        }
        if status == 429 {
            return Err(map_graph_http_error(status, &body));
        }
        if status >= 400 {
            return Err(format!("{label} : {}", map_graph_http_error(status, &body)));
        }
        return Ok((status, body));
    }
    Err(format!(
        "{label} : quota Microsoft Graph dépassé après plusieurs tentatives."
    ))
}

fn paginate_collection_count(
    client: &BlockingClient,
    initial_url: &str,
    access_token: &str,
    label: &str,
) -> Result<u32, String> {
    let mut url = initial_url.to_string();
    let mut total = 0_u32;
    loop {
        let (status, body) = graph_get_with_retry(client, &url, access_token, label)?;
        if status != 200 {
            return Err(format!("{label} : {}", map_graph_http_error(status, &body)));
        }
        let page_count = u32::try_from(count_odata_value_array(&body)?)
            .map_err(|_| format!("{label} : pagination Graph hors limites."))?;
        total = total.saturating_add(page_count);
        match extract_odata_next_link(&body) {
            Some(next_url) => url = next_url,
            None => break,
        }
    }
    Ok(total)
}

fn paginate_list_items(
    client: &BlockingClient,
    initial_url: &str,
    access_token: &str,
    label: &str,
) -> Result<Vec<ParsedSharePointListItem>, String> {
    let mut url = initial_url.to_string();
    let mut items = Vec::new();
    loop {
        let (status, body) = graph_get_with_retry(client, &url, access_token, label)?;
        if status != 200 {
            return Err(format!("{label} : {}", map_graph_http_error(status, &body)));
        }
        items.extend(SharePointGraphClient::parse_list_items_page(&body)?);
        match extract_odata_next_link(&body) {
            Some(next_url) => url = next_url,
            None => break,
        }
    }
    Ok(items)
}

fn graph_post_blocking(
    client: &BlockingClient,
    url: &str,
    access_token: &str,
    payload: &Value,
) -> Result<(u16, String), String> {
    let response = client
        .post(url)
        .bearer_auth(access_token)
        .json(payload)
        .send()
        .map_err(|error| format!("Requête Microsoft Graph impossible : {error}"))?;
    Ok((response.status().as_u16(), response.text().unwrap_or_default()))
}

fn graph_patch_blocking(
    client: &BlockingClient,
    url: &str,
    access_token: &str,
    etag: &str,
    payload: &Value,
) -> Result<(u16, String), String> {
    let response = client
        .patch(url)
        .bearer_auth(access_token)
        .header("If-Match", etag)
        .json(payload)
        .send()
        .map_err(|error| format!("Requête Microsoft Graph impossible : {error}"))?;
    Ok((response.status().as_u16(), response.text().unwrap_or_default()))
}

fn graph_delete_blocking(
    client: &BlockingClient,
    url: &str,
    access_token: &str,
    etag: &str,
) -> Result<(u16, String), String> {
    let response = client
        .delete(url)
        .bearer_auth(access_token)
        .header("If-Match", etag)
        .send()
        .map_err(|error| format!("Requête Microsoft Graph impossible : {error}"))?;
    Ok((response.status().as_u16(), response.text().unwrap_or_default()))
}

fn graph_post_with_retry(
    client: &BlockingClient,
    url: &str,
    access_token: &str,
    payload: &Value,
    label: &str,
) -> Result<(u16, String), String> {
    graph_write_with_retry(client, url, access_token, None, Some(payload), label, GraphWriteMethod::Post)
}

fn graph_patch_with_retry(
    client: &BlockingClient,
    url: &str,
    access_token: &str,
    etag: &str,
    payload: &Value,
    label: &str,
) -> Result<(u16, String), String> {
    graph_write_with_retry(
        client,
        url,
        access_token,
        Some(etag),
        Some(payload),
        label,
        GraphWriteMethod::Patch,
    )
}

fn graph_delete_with_retry(
    client: &BlockingClient,
    url: &str,
    access_token: &str,
    etag: &str,
    label: &str,
) -> Result<(u16, String), String> {
    graph_write_with_retry(
        client,
        url,
        access_token,
        Some(etag),
        None,
        label,
        GraphWriteMethod::Delete,
    )
}

enum GraphWriteMethod {
    Post,
    Patch,
    Delete,
}

fn graph_write_with_retry(
    client: &BlockingClient,
    url: &str,
    access_token: &str,
    etag: Option<&str>,
    payload: Option<&Value>,
    label: &str,
    method: GraphWriteMethod,
) -> Result<(u16, String), String> {
    for attempt in 0..GRAPH_RATE_LIMIT_RETRIES {
        let (status, body) = match method {
            GraphWriteMethod::Post => {
                graph_post_blocking(client, url, access_token, payload.unwrap_or(&Value::Null))?
            }
            GraphWriteMethod::Patch => graph_patch_blocking(
                client,
                url,
                access_token,
                etag.ok_or_else(|| format!("{label} : ETag obligatoire."))?,
                payload.unwrap_or(&Value::Null),
            )?,
            GraphWriteMethod::Delete => {
                graph_delete_blocking(client, url, access_token, etag.ok_or_else(|| {
                    format!("{label} : ETag obligatoire.")
                })?)?
            }
        };
        if status == 429 && attempt + 1 < GRAPH_RATE_LIMIT_RETRIES {
            thread::sleep(Duration::from_secs(GRAPH_RATE_LIMIT_PAUSE_SECS));
            continue;
        }
        if status == 429 {
            return Err(map_graph_http_error(status, &body));
        }
        return Ok((status, body));
    }
    Err(format!(
        "{label} : quota Microsoft Graph dépassé après plusieurs tentatives."
    ))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn client() -> SharePointGraphClient {
        SharePointGraphClient::new(SharePointSiteRef {
            hostname: "contoso.sharepoint.com".into(),
            site_path: "/sites/crm-team".into(),
        })
    }

    #[test]
    fn parse_site_extracts_id_and_etag() {
        let json = r#"{
            "id": "contoso.sharepoint.com,guid1,guid2",
            "name": "CRM Team",
            "webUrl": "https://contoso.sharepoint.com/sites/crm-team",
            "@odata.etag": "\"1\""
        }"#;
        let site = SharePointGraphClient::parse_site_response(json).unwrap();
        assert_eq!(site.id, "contoso.sharepoint.com,guid1,guid2");
        assert_eq!(site.etag.as_deref(), Some("\"1\""));
    }

    #[test]
    fn parse_list_item_requires_etag() {
        let json = r#"{"id":"42","fields":{"Title":"Test"}}"#;
        assert!(SharePointGraphClient::parse_list_item_response(json).is_err());

        let ok = r#"{"id":"42","eTag":"\"3\"","fields":{"Title":"Test"}}"#;
        let item = SharePointGraphClient::parse_list_item_response(ok).unwrap();
        assert_eq!(item.id, "42");
        assert_eq!(item.etag, "\"3\"");
        assert_eq!(item.fields["Title"], "Test");
    }

    #[test]
    fn parse_drive_item_detects_folder() {
        let json = r#"{
            "id": "item-1",
            "name": "Documents",
            "folder": {},
            "eTag": "\"9\""
        }"#;
        let item = SharePointGraphClient::parse_drive_item_response(json).unwrap();
        assert!(item.is_folder);
        assert_eq!(item.etag.as_deref(), Some("\"9\""));
    }

    #[test]
    fn map_graph_http_error_describes_sites_selected_admin_grant() {
        let body = r#"{"error":{"code":"accessDenied","message":"Access denied"}}"#;
        let message = map_graph_http_error(403, body);
        assert!(message.contains("Sites.Selected"));
        assert!(message.contains("administrateur"));
    }

    #[test]
    fn map_graph_http_error_describes_common_status_codes() {
        assert!(map_graph_http_error(401, "").contains("expirée"));
        assert!(map_graph_http_error(404, "").contains("introuvable"));
        assert!(map_graph_http_error(429, "").contains("Quota"));
    }

    #[test]
    fn parse_lists_page_extracts_display_name() {
        let json = r#"{"value":[{"id":"list-1","displayName":"CRM_Presence","eTag":"\"2\""}]}"#;
        let lists = SharePointGraphClient::parse_lists_page(json).unwrap();
        assert_eq!(lists[0].display_name, "CRM_Presence");
    }

    #[test]
    fn require_if_match_etag_rejects_empty() {
        assert!(require_if_match_etag("").is_err());
        assert!(require_if_match_etag("  ").is_err());
    }

    #[test]
    fn lock_key_column_is_unique_and_indexed() {
        let payload = column_definition_payload(&ListColumnDef {
            name: "LockKey",
            display_name: "Lock key",
            kind: ColumnKind::Text,
        });
        assert_eq!(payload["enforceUniqueValues"], true);
        assert_eq!(payload["indexed"], true);
    }

    #[test]
    fn odata_helpers_extract_next_link_and_count_items() {
        let page = r#"{
            "value": [{"id":"1"},{"id":"2"}],
            "@odata.nextLink": "https://graph.microsoft.com/v1.0/next"
        }"#;
        assert_eq!(count_odata_value_array(page).unwrap(), 2);
        assert_eq!(
            extract_odata_next_link(page).as_deref(),
            Some("https://graph.microsoft.com/v1.0/next")
        );
        assert!(extract_odata_next_link(r#"{"value":[]}"#).is_none());
    }

    #[test]
    fn is_sites_selected_access_denied_detects_authorization_errors() {
        let body = r#"{"error":{"code":"Authorization_RequestDenied"}}"#;
        assert!(is_sites_selected_access_denied(403, body));
        assert!(!is_sites_selected_access_denied(404, body));
    }
}
