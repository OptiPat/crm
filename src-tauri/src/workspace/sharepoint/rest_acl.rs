//! Restriction SharePoint REST de `CRM_Secrets` (héritage + groupes Entra).
//! Graph n'expose pas `breakRoleInheritance` ni l'ajout d'un groupe Entra sur une liste.

use super::client::{ParsedSharePointList, ParsedSharePointSite, SharePointGraphClient};
use reqwest::blocking::Client as BlockingClient;
use serde_json::Value;

pub fn entra_security_group_login(object_id: &str) -> String {
    format!("c:0t.c|tenant|{}", object_id.trim())
}

pub fn sharepoint_list_guid_literal(list_id: &str) -> String {
    let trimmed = list_id.trim().trim_matches('{').trim_matches('}');
    format!("guid'{trimmed}'")
}

/// Racine `_api` du site (sans page d'accueil `/SitePages/...`).
pub fn sharepoint_web_root(hostname: &str, site_path: &str) -> String {
    let host = hostname
        .trim()
        .trim_start_matches("https://")
        .trim_start_matches("http://")
        .trim_end_matches('/');
    let mut path = site_path.trim().trim_end_matches('/').to_string();
    if let Some(index) = path.to_ascii_lowercase().find("/sitepages") {
        path.truncate(index);
        path = path.trim_end_matches('/').to_string();
    }
    if !path.starts_with('/') {
        path = format!("/{path}");
    }
    format!("https://{host}{path}")
}

impl SharePointGraphClient {
    pub fn harden_crm_secrets_list_blocking(
        &self,
        graph_token: &str,
        rest_token: &str,
        site: &ParsedSharePointSite,
        list: &ParsedSharePointList,
        advisor_group_id: &str,
        secretary_group_id: &str,
    ) -> Result<(), String> {
        if let Err(error) = self.hide_list_blocking(graph_token, &site.id, list) {
            eprintln!("⚠️ Masquage CRM_Secrets : {error}");
        }
        let web_url = sharepoint_web_root(&self.site.hostname, &self.site.site_path);
        if let Err(error) = restrict_secrets_via_sharepoint_rest(
            self.http_client(),
            rest_token,
            &web_url,
            &list.id,
            advisor_group_id,
            secretary_group_id,
        ) {
            return Err(format!(
                "Impossible de restreindre CRM_Secrets (la clé n'a pas été écrite). \
                 Vérifiez que vous êtes propriétaire du site SharePoint, puis recliquez Provisionner. {error}"
            ));
        }
        Ok(())
    }
}

fn restrict_secrets_via_sharepoint_rest(
    http: &BlockingClient,
    access_token: &str,
    web_url: &str,
    list_id: &str,
    advisor_group_id: &str,
    secretary_group_id: &str,
) -> Result<(), String> {
    let digest = fetch_form_digest(http, access_token, web_url)?;
    let list_literal = sharepoint_list_guid_literal(list_id);
    let already_unique_acl =
        list_has_unique_role_assignments(http, access_token, web_url, &list_literal)?;
    if !already_unique_acl {
        let break_url = format!(
            "{web_url}/_api/web/lists({list_literal})/breakroleinheritance(copyRoleAssignments=false,clearSubscopes=true)"
        );
        let (break_status, break_body) =
            sharepoint_rest_post(http, access_token, &digest, &break_url, None)?;
        if !rest_success(break_status) && !already_unique(break_status, &break_body) {
            return Err(format!(
                "Impossible de restreindre CRM_Secrets ({break_status}) : {}",
                truncate_body(&break_body)
            ));
        }
    }
    let contribute_id = fetch_contribute_role_id(http, access_token, web_url)?;
    for group_id in [advisor_group_id, secretary_group_id] {
        let principal_id =
            ensure_entra_group_principal(http, access_token, &digest, web_url, group_id)?;
        let assign_url = format!(
            "{web_url}/_api/web/lists({list_literal})/roleassignments/addroleassignment(principalid={principal_id},roleDefId={contribute_id})"
        );
        let (status, body) = sharepoint_rest_post(http, access_token, &digest, &assign_url, None)?;
        if !rest_success(status) && !already_assigned(status, &body) {
            return Err(format!(
                "Impossible d'autoriser le groupe {group_id} sur CRM_Secrets ({status}) : {}",
                truncate_body(&body)
            ));
        }
    }
    let hide_url = format!("{web_url}/_api/web/lists({list_literal})");
    let hide_payload = serde_json::json!({ "Hidden": true });
    let (hide_status, hide_body) =
        sharepoint_rest_merge(http, access_token, &digest, &hide_url, &hide_payload)?;
    if !rest_success(hide_status) {
        eprintln!(
            "⚠️ Masquage REST CRM_Secrets ({hide_status}) : {}",
            truncate_body(&hide_body)
        );
    }
    Ok(())
}

fn list_has_unique_role_assignments(
    http: &BlockingClient,
    access_token: &str,
    web_url: &str,
    list_literal: &str,
) -> Result<bool, String> {
    let url = format!("{web_url}/_api/web/lists({list_literal})?$select=HasUniqueRoleAssignments");
    let (status, body) = sharepoint_rest_get(http, access_token, &url)?;
    if !rest_success(status) {
        return Err(format!(
            "Lecture des droits CRM_Secrets impossible ({status}) : {}",
            truncate_body(&body)
        ));
    }
    json_find_bool(&body, "HasUniqueRoleAssignments").ok_or_else(|| {
        format!(
            "HasUniqueRoleAssignments absent : {}",
            truncate_body(&body)
        )
    })
}

fn fetch_form_digest(
    http: &BlockingClient,
    access_token: &str,
    web_url: &str,
) -> Result<String, String> {
    let url = format!("{web_url}/_api/contextinfo");
    let (status, body) = sharepoint_rest_post(http, access_token, "", &url, None)?;
    if !rest_success(status) {
        return Err(format!(
            "Contexte SharePoint inaccessible ({status}) : {}",
            truncate_body(&body)
        ));
    }
    json_find_string(&body, "FormDigestValue").ok_or_else(|| {
        format!("Jeton de formulaire SharePoint absent : {}", truncate_body(&body))
    })
}

fn fetch_contribute_role_id(
    http: &BlockingClient,
    access_token: &str,
    web_url: &str,
) -> Result<i64, String> {
    let url = format!("{web_url}/_api/web/roledefinitions/getbyname('Contribute')");
    let response = http
        .get(&url)
        .bearer_auth(access_token)
        .header("Accept", "application/json;odata=nometadata")
        .send()
        .map_err(|error| format!("Requête SharePoint impossible : {error}"))?;
    let status = response.status().as_u16();
    let body = response.text().unwrap_or_default();
    if !rest_success(status) {
        return Err(format!(
            "Rôle Contribute introuvable ({status}) : {}",
            truncate_body(&body)
        ));
    }
    json_find_i64(&body, "Id").ok_or_else(|| {
        format!("Identifiant du rôle Contribute absent : {}", truncate_body(&body))
    })
}

fn ensure_entra_group_principal(
    http: &BlockingClient,
    access_token: &str,
    digest: &str,
    web_url: &str,
    group_id: &str,
) -> Result<i64, String> {
    let url = format!("{web_url}/_api/web/ensureuser");
    let payload = serde_json::json!({ "logonName": entra_security_group_login(group_id) });
    let (status, body) = sharepoint_rest_post(http, access_token, digest, &url, Some(&payload))?;
    if !rest_success(status) {
        return Err(format!(
            "Groupe Entra {group_id} introuvable sur le site ({status}) : {}",
            truncate_body(&body)
        ));
    }
    json_find_i64(&body, "Id").ok_or_else(|| {
        format!("Identifiant SharePoint du groupe absent : {}", truncate_body(&body))
    })
}

fn sharepoint_rest_get(
    http: &BlockingClient,
    access_token: &str,
    url: &str,
) -> Result<(u16, String), String> {
    let response = http
        .get(url)
        .bearer_auth(access_token)
        .header("Accept", "application/json;odata=nometadata")
        .send()
        .map_err(|error| format!("Requête SharePoint impossible : {error}"))?;
    Ok((
        response.status().as_u16(),
        response.text().unwrap_or_default(),
    ))
}

/// IIS / SharePoint Online répond **411 Length Required** si un POST n'a ni corps
/// ni `Content-Length` (reqwest omet les deux quand `payload` est `None`).
fn apply_sharepoint_json_payload(
    request: reqwest::blocking::RequestBuilder,
    payload: Option<&Value>,
) -> reqwest::blocking::RequestBuilder {
    match payload {
        Some(payload) => request
            .header("Content-Type", "application/json;odata=nometadata")
            .json(payload),
        None => request
            .header("Content-Type", "application/json;odata=nometadata")
            .body(""),
    }
}

fn sharepoint_rest_post(
    http: &BlockingClient,
    access_token: &str,
    digest: &str,
    url: &str,
    payload: Option<&Value>,
) -> Result<(u16, String), String> {
    let mut request = http
        .post(url)
        .bearer_auth(access_token)
        .header("Accept", "application/json;odata=nometadata");
    if !digest.is_empty() {
        request = request.header("X-RequestDigest", digest);
    }
    let response = apply_sharepoint_json_payload(request, payload)
        .send()
        .map_err(|error| format!("Requête SharePoint impossible : {error}"))?;
    Ok((
        response.status().as_u16(),
        response.text().unwrap_or_default(),
    ))
}

fn sharepoint_rest_merge(
    http: &BlockingClient,
    access_token: &str,
    digest: &str,
    url: &str,
    payload: &Value,
) -> Result<(u16, String), String> {
    let response = http
        .post(url)
        .bearer_auth(access_token)
        .header("Accept", "application/json;odata=nometadata")
        .header("Content-Type", "application/json;odata=nometadata")
        .header("X-RequestDigest", digest)
        .header("X-HTTP-Method", "MERGE")
        .header("If-Match", "*")
        .json(payload)
        .send()
        .map_err(|error| format!("Requête SharePoint impossible : {error}"))?;
    Ok((
        response.status().as_u16(),
        response.text().unwrap_or_default(),
    ))
}

fn rest_success(status: u16) -> bool {
    status == 200 || status == 201 || status == 204
}

fn already_unique(status: u16, body: &str) -> bool {
    if status != 400 && status != 409 {
        return false;
    }
    let lower = body.to_lowercase();
    lower.contains("already") || lower.contains("unique") || lower.contains("role inheritance")
}

fn already_assigned(status: u16, body: &str) -> bool {
    if status != 400 && status != 409 {
        return false;
    }
    let lower = body.to_lowercase();
    lower.contains("already") || lower.contains("exist")
}

fn json_find_string(body: &str, key: &str) -> Option<String> {
    serde_json::from_str::<Value>(body)
        .ok()
        .and_then(|value| find_string(&value, key))
}

fn json_find_i64(body: &str, key: &str) -> Option<i64> {
    serde_json::from_str::<Value>(body)
        .ok()
        .and_then(|value| find_i64(&value, key))
}

fn json_find_bool(body: &str, key: &str) -> Option<bool> {
    serde_json::from_str::<Value>(body)
        .ok()
        .and_then(|value| find_bool(&value, key))
}

fn find_string(value: &Value, key: &str) -> Option<String> {
    match value {
        Value::Object(map) => {
            if let Some(Value::String(text)) = map.get(key) {
                if !text.trim().is_empty() {
                    return Some(text.clone());
                }
            }
            map.values().find_map(|child| find_string(child, key))
        }
        Value::Array(items) => items.iter().find_map(|child| find_string(child, key)),
        _ => None,
    }
}

fn find_bool(value: &Value, key: &str) -> Option<bool> {
    match value {
        Value::Object(map) => {
            if let Some(Value::Bool(flag)) = map.get(key) {
                return Some(*flag);
            }
            map.values().find_map(|child| find_bool(child, key))
        }
        Value::Array(items) => items.iter().find_map(|child| find_bool(child, key)),
        _ => None,
    }
}

fn find_i64(value: &Value, key: &str) -> Option<i64> {
    match value {
        Value::Object(map) => {
            if let Some(found) = map.get(key).and_then(Value::as_i64) {
                return Some(found);
            }
            map.values().find_map(|child| find_i64(child, key))
        }
        Value::Array(items) => items.iter().find_map(|child| find_i64(child, key)),
        _ => None,
    }
}

fn truncate_body(body: &str) -> String {
    let trimmed = body.trim();
    if trimmed.chars().count() <= 180 {
        trimmed.to_string()
    } else {
        format!("{}…", trimmed.chars().take(180).collect::<String>())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn entra_login_and_list_guid_are_sharepoint_literals() {
        assert_eq!(
            entra_security_group_login(" 11111111-1111-1111-1111-111111111111 "),
            "c:0t.c|tenant|11111111-1111-1111-1111-111111111111"
        );
        assert_eq!(
            sharepoint_list_guid_literal("{44ca0d29-33d3-47c9-8f12-eb0c46e3c7ad}"),
            "guid'44ca0d29-33d3-47c9-8f12-eb0c46e3c7ad'"
        );
    }

    #[test]
    fn sharepoint_web_root_strips_sitepages_homepage() {
        assert_eq!(
            sharepoint_web_root(
                "actingpeople.sharepoint.com",
                "/sites/CRMActingpeople/SitePages/CollabHome.aspx"
            ),
            "https://actingpeople.sharepoint.com/sites/CRMActingpeople"
        );
        assert_eq!(
            sharepoint_web_root("actingpeople.sharepoint.com", "/sites/CRMActingpeople"),
            "https://actingpeople.sharepoint.com/sites/CRMActingpeople"
        );
    }

    #[test]
    fn digest_is_found_in_nested_sharepoint_json() {
        let body = r#"{"d":{"GetContextWebInformation":{"FormDigestValue":"0xDIGEST,1"}}}"#;
        assert_eq!(json_find_string(body, "FormDigestValue").unwrap(), "0xDIGEST,1");
        assert_eq!(json_find_i64(r#"{"Id": 42}"#, "Id"), Some(42));
        assert_eq!(
            json_find_bool(r#"{"HasUniqueRoleAssignments": true}"#, "HasUniqueRoleAssignments"),
            Some(true)
        );
        assert_eq!(
            json_find_bool(
                r#"{"d":{"HasUniqueRoleAssignments": false}}"#,
                "HasUniqueRoleAssignments"
            ),
            Some(false)
        );
    }

    #[test]
    fn empty_sharepoint_post_sends_content_length_so_iis_does_not_return_411() {
        let server = crate::workspace::sharepoint::test_server::ScriptedGraphServer::spawn(vec![
            crate::workspace::sharepoint::test_server::ScriptedResponse::json(
                200,
                r#"{"FormDigestValue":"0xDIGEST,1"}"#,
            ),
        ]);
        let http = BlockingClient::builder()
            .timeout(std::time::Duration::from_secs(5))
            .build()
            .unwrap();
        let digest = fetch_form_digest(&http, "token", &server.base_url).expect("digest");
        assert_eq!(digest, "0xDIGEST,1");
        let requests = server.finish();
        assert_eq!(requests.len(), 1);
        let request = requests[0].to_ascii_lowercase();
        let content_length = request.lines().find_map(|line| {
            line.strip_prefix("content-length:")
                .and_then(|value| value.trim().parse::<usize>().ok())
        });
        assert!(
            content_length.is_some(),
            "POST _api/contextinfo sans Content-Length → 411 Length Required : {}",
            requests[0]
        );
    }
}
