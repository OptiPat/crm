use serde::Deserialize;
use serde::Serialize;

#[derive(Serialize)]
pub struct RegistryPayload<'a> {
    pub token: &'a str,
    pub event: &'a str,
    pub installation_id: &'a str,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub license_key: Option<&'a str>,
    pub license_type: &'a str,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub client_email: Option<&'a str>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub client_name: Option<&'a str>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub cabinet: Option<&'a str>,
    pub app_version: &'a str,
    pub os: &'a str,
    pub activated_at: i64,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub expires_at: Option<i64>,
    pub installed_at: i64,
    pub legacy: bool,
}

#[derive(Deserialize)]
struct RegistryResponse {
    ok: bool,
    #[serde(default)]
    error: Option<String>,
}

pub fn registry_url() -> Option<&'static str> {
    non_empty_env(option_env!("LICENSE_REGISTRY_URL"))
}

pub fn registry_token() -> Option<&'static str> {
    non_empty_env(option_env!("LICENSE_REGISTRY_TOKEN"))
}

fn non_empty_env(value: Option<&'static str>) -> Option<&'static str> {
    value.filter(|entry| !entry.is_empty())
}

pub fn is_registry_configured() -> bool {
    registry_url().is_some() && registry_token().is_some()
}

pub fn post_registry_event(payload: &RegistryPayload<'_>) -> Result<(), String> {
    let url = registry_url().ok_or("Registre non configuré (LICENSE_REGISTRY_URL).")?;
    let client = reqwest::blocking::Client::builder()
        .timeout(std::time::Duration::from_secs(12))
        .build()
        .map_err(|e| format!("Client HTTP : {e}"))?;
    let response = client
        .post(url)
        .json(payload)
        .send()
        .map_err(|e| format!("Envoi registre impossible : {e}"))?;
    let status = response.status();
    let body = response
        .text()
        .map_err(|e| format!("Lecture réponse registre : {e}"))?;
    if !status.is_success() {
        return Err(format!("Registre a répondu {status} : {body}"));
    }
    let parsed: RegistryResponse = serde_json::from_str(&body)
        .map_err(|e| format!("Réponse registre invalide : {e} ({body})"))?;
    if !parsed.ok {
        return Err(parsed
            .error
            .unwrap_or_else(|| "Registre a refusé la requête.".to_string()));
    }
    Ok(())
}

pub fn os_label() -> String {
    #[cfg(target_os = "windows")]
    {
        "Windows".to_string()
    }
    #[cfg(target_os = "macos")]
    {
        "macOS".to_string()
    }
    #[cfg(target_os = "linux")]
    {
        "Linux".to_string()
    }
    #[cfg(not(any(target_os = "windows", target_os = "macos", target_os = "linux")))]
    {
        "Unknown".to_string()
    }
}
