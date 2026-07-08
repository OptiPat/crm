use serde::Deserialize;
use serde::Serialize;
use serde_json::Value;

#[derive(Serialize)]
struct RegistryRequest<'a> {
    token: &'a str,
    action: &'a str,
    #[serde(flatten)]
    extra: Value,
}

#[derive(Debug, Deserialize)]
struct RegistryResponse {
    ok: bool,
    #[serde(default)]
    error: Option<String>,
    #[serde(default)]
    notes: Vec<RemoteSharedNote>,
    #[serde(default)]
    contributions: Vec<RemoteContribution>,
    #[serde(default)]
    id: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct RemoteSharedNote {
    pub(crate) id: String,
    pub(crate) title: String,
    pub(crate) content_html: String,
    pub(crate) installation_id: String,
    pub(crate) author_name: String,
    pub(crate) created_at: i64,
    pub(crate) updated_at: i64,
}

#[derive(Debug, Deserialize)]
pub struct RemoteContribution {
    pub(crate) id: String,
    pub(crate) note_id: String,
    pub(crate) installation_id: String,
    pub(crate) author_name: String,
    pub(crate) content_html: String,
    pub(crate) created_at: i64,
}

pub struct RemoteSyncPayload {
    pub notes: Vec<RemoteSharedNote>,
    pub contributions: Vec<RemoteContribution>,
}

pub fn registry_url() -> Option<&'static str> {
    non_empty_env(option_env!("NOTES_REGISTRY_URL"))
}

pub fn registry_token() -> Option<&'static str> {
    non_empty_env(option_env!("NOTES_REGISTRY_TOKEN"))
}

fn non_empty_env(value: Option<&'static str>) -> Option<&'static str> {
    value.filter(|entry| !entry.is_empty())
}

pub fn is_registry_configured() -> bool {
    registry_url().is_some() && registry_token().is_some()
}

fn post_action(action: &str, extra: Value) -> Result<RegistryResponse, String> {
    let url = registry_url().ok_or("Registre notes non configuré (NOTES_REGISTRY_URL).")?;
    let token = registry_token().ok_or("Registre notes non configuré (NOTES_REGISTRY_TOKEN).")?;
    let payload = RegistryRequest {
        token,
        action,
        extra,
    };
    let client = reqwest::blocking::Client::builder()
        .timeout(std::time::Duration::from_secs(20))
        .build()
        .map_err(|e| format!("Client HTTP : {e}"))?;
    let response = client
        .post(url)
        .json(&payload)
        .send()
        .map_err(|e| format!("Envoi registre notes impossible : {e}"))?;
    let status = response.status();
    let body = response
        .text()
        .map_err(|e| format!("Lecture réponse registre notes : {e}"))?;
    if !status.is_success() {
        return Err(format!("Registre notes a répondu {status} : {body}"));
    }
    let parsed: RegistryResponse = serde_json::from_str(&body)
        .map_err(|e| format!("Réponse registre notes invalide : {e} ({body})"))?;
    if !parsed.ok {
        return Err(parsed
            .error
            .unwrap_or_else(|| "Registre notes a refusé la requête.".to_string()));
    }
    Ok(parsed)
}

pub fn sync_remote() -> Result<RemoteSyncPayload, String> {
    let parsed = post_action("sync", serde_json::json!({}))?;
    Ok(RemoteSyncPayload {
        notes: parsed.notes,
        contributions: parsed.contributions,
    })
}

pub fn create_remote_note(
    installation_id: &str,
    author_name: &str,
    title: &str,
    content_html: &str,
) -> Result<String, String> {
    let parsed = post_action(
        "create_note",
        serde_json::json!({
            "installation_id": installation_id,
            "author_name": author_name,
            "title": title,
            "content_html": content_html,
        }),
    )?;
    parsed
        .id
        .ok_or_else(|| "Registre notes : id manquant après création.".to_string())
}

pub fn update_remote_note(
    note_id: &str,
    installation_id: &str,
    title: &str,
    content_html: &str,
) -> Result<(), String> {
    post_action(
        "update_note",
        serde_json::json!({
            "note_id": note_id,
            "installation_id": installation_id,
            "title": title,
            "content_html": content_html,
        }),
    )?;
    Ok(())
}

pub fn delete_remote_note(note_id: &str, installation_id: &str) -> Result<(), String> {
    post_action(
        "delete_note",
        serde_json::json!({
            "note_id": note_id,
            "installation_id": installation_id,
        }),
    )?;
    Ok(())
}

pub fn add_remote_contribution(
    note_id: &str,
    installation_id: &str,
    author_name: &str,
    content_html: &str,
) -> Result<(), String> {
    post_action(
        "add_contribution",
        serde_json::json!({
            "note_id": note_id,
            "installation_id": installation_id,
            "author_name": author_name,
            "content_html": content_html,
        }),
    )?;
    Ok(())
}
