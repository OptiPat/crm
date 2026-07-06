//! Vérification de l'accès Google Calendar (OAuth + API activée).

use super::google_api_errors::{calendar_access_error, missing_calendar_scopes};
use super::oauth_send::resolve_google_calendar_connection;
use tauri::AppHandle;

fn fetch_token_scopes(client: &reqwest::blocking::Client, access_token: &str) -> Result<Vec<String>, String> {
    let res = client
        .get("https://www.googleapis.com/oauth2/v1/tokeninfo")
        .query(&[("access_token", access_token)])
        .send()
        .map_err(|e| e.to_string())?;
    if !res.status().is_success() {
        return Ok(vec![]);
    }
    let json: serde_json::Value = res.json().map_err(|e| e.to_string())?;
    let scope = json
        .get("scope")
        .and_then(|v| v.as_str())
        .unwrap_or("");
    Ok(scope.split_whitespace().map(|s| s.to_string()).collect())
}

/// GET minimal sur l'agenda principal — échoue avec un message actionnable si l'API ou les scopes manquent.
pub fn probe_google_calendar_access(app: &AppHandle) -> Result<(), String> {
    let conn = resolve_google_calendar_connection(app)?
        .ok_or("Connectez Google Agenda dans Paramètres → Email.")?;

    let client = reqwest::blocking::Client::new();
    let scopes = fetch_token_scopes(&client, &conn.access_token)?;
    let scope_refs: Vec<&str> = scopes.iter().map(|s| s.as_str()).collect();
    if let Some(msg) = missing_calendar_scopes(&scope_refs) {
        return Err(msg);
    }

    let time_min = chrono::Utc::now().to_rfc3339();
    let res = client
        .get("https://www.googleapis.com/calendar/v3/calendars/primary/events")
        .query(&[
            ("timeMin", time_min.as_str()),
            ("maxResults", "1"),
            ("singleEvents", "true"),
        ])
        .bearer_auth(&conn.access_token)
        .send()
        .map_err(|e| e.to_string())?;

    if res.status().is_success() {
        return Ok(());
    }
    Err(calendar_access_error(
        res.status(),
        &res.text().unwrap_or_default(),
    ))
}
