//! Google Agenda — propositions de déplacements (lieu physique uniquement).

use super::month_time_bounds_rfc3339;
use crate::email::oauth_send::refresh_connection_if_needed;
use crate::email::oauth_store::EmailOAuthStore;
use serde::{Deserialize, Serialize};
use tauri::AppHandle;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ComptaCalendarTripProposal {
    pub event_id: String,
    pub date: String,
    pub summary: String,
    pub location: String,
    pub already_imported: bool,
}

#[derive(Debug, Deserialize)]
struct CalendarEventList {
    items: Option<Vec<CalendarEvent>>,
    #[serde(rename = "nextPageToken", default)]
    next_page_token: Option<String>,
}

#[derive(Debug, Deserialize)]
struct CalendarEvent {
    id: Option<String>,
    summary: Option<String>,
    location: Option<String>,
    description: Option<String>,
    #[serde(rename = "hangoutLink", default)]
    hangout_link: Option<String>,
    #[serde(rename = "conferenceData", default)]
    conference_data: Option<ConferenceData>,
    status: Option<String>,
    start: Option<EventTime>,
}

#[derive(Debug, Deserialize)]
struct ConferenceData {
    #[serde(rename = "entryPoints", default)]
    entry_points: Option<Vec<ConferenceEntryPoint>>,
}

#[derive(Debug, Deserialize)]
struct ConferenceEntryPoint {
    #[serde(rename = "entryPointType", default)]
    entry_point_type: Option<String>,
    uri: Option<String>,
}

#[derive(Debug, Deserialize)]
struct EventTime {
    #[serde(rename = "dateTime", default)]
    date_time: Option<String>,
    date: Option<String>,
}

fn google_token(app: &AppHandle) -> Result<String, String> {
    let store = EmailOAuthStore::load(app)?;
    let mut conn = store
        .connection
        .clone()
        .ok_or("Connectez Google dans Paramètres → Email.")?;
    if conn.provider != "google" {
        return Err("L'agenda Google nécessite un compte Google connecté.".into());
    }
    refresh_connection_if_needed(app, &mut conn)?;
    Ok(conn.access_token)
}

pub fn is_visio_or_remote_event(ev: &CalendarEvent) -> bool {
    if ev.hangout_link.as_ref().is_some_and(|s| !s.trim().is_empty()) {
        return true;
    }
    if let Some(conf) = &ev.conference_data {
        if conf.entry_points.as_ref().is_some_and(|eps| {
            eps.iter().any(|ep| {
                ep.entry_point_type
                    .as_deref()
                    .is_some_and(|t| t.eq_ignore_ascii_case("video"))
            })
        }) {
            return true;
        }
    }
    let loc = ev.location.as_deref().unwrap_or("").trim();
    if loc.is_empty() {
        return true;
    }
    let hay = format!(
        "{} {} {}",
        loc.to_lowercase(),
        ev.summary.as_deref().unwrap_or("").to_lowercase(),
        ev.description.as_deref().unwrap_or("").to_lowercase()
    );
    const REMOTE: [&str; 8] = [
        "meet.google.com",
        "zoom.us",
        "teams.microsoft.com",
        "webex.com",
        "whereby.com",
        "visio",
        "visioconf",
        "google meet",
    ];
    REMOTE.iter().any(|k| hay.contains(k))
}

fn event_date_iso(ev: &CalendarEvent) -> Option<String> {
    if let Some(dt) = ev.start.as_ref()?.date_time.as_ref() {
        return dt.get(0..10).map(|s| s.to_string());
    }
    ev.start.as_ref()?.date.clone()
}

pub fn scan_compta_calendar_month(
    app: &AppHandle,
    year: i32,
    month: u32,
    imported_event_ids: &[String],
) -> Result<Vec<ComptaCalendarTripProposal>, String> {
    let token = google_token(app)?;
    let client = reqwest::blocking::Client::new();
    let (time_min, time_max) = month_time_bounds_rfc3339(year, month);

    let mut proposals = Vec::new();
    let mut page_token: Option<String> = None;
    for _ in 0..8 {
        let mut query: Vec<(&str, &str)> = vec![
            ("timeMin", time_min.as_str()),
            ("timeMax", time_max.as_str()),
            ("maxResults", "250"),
            ("singleEvents", "true"),
            ("orderBy", "startTime"),
        ];
        if let Some(ref pt) = page_token {
            query.push(("pageToken", pt.as_str()));
        }
        let res = client
            .get("https://www.googleapis.com/calendar/v3/calendars/primary/events")
            .query(&query)
            .bearer_auth(&token)
            .send()
            .map_err(|e| e.to_string())?;
        if !res.status().is_success() {
            return Err(format!("Agenda Google: {}", res.text().unwrap_or_default()));
        }
        let list: CalendarEventList = res.json().map_err(|e| e.to_string())?;
        if let Some(items) = list.items {
            for ev in items {
                if ev.status.as_deref() == Some("cancelled") {
                    continue;
                }
                if is_visio_or_remote_event(&ev) {
                    continue;
                }
                let location = ev.location.as_deref().unwrap_or("").trim().to_string();
                if location.is_empty() {
                    continue;
                }
                let Some(date) = event_date_iso(&ev) else {
                    continue;
                };
                let event_id = ev.id.unwrap_or_default();
                if event_id.is_empty() {
                    continue;
                }
                proposals.push(ComptaCalendarTripProposal {
                    already_imported: imported_event_ids.iter().any(|id| id == &event_id),
                    event_id,
                    date,
                    summary: ev.summary.unwrap_or_else(|| "RDV".into()),
                    location,
                });
            }
        }
        page_token = list.next_page_token;
        if page_token.is_none() {
            break;
        }
    }
    proposals.sort_by(|a, b| a.date.cmp(&b.date).then(a.summary.cmp(&b.summary)));
    Ok(proposals)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn ev(location: &str, hangout: Option<&str>) -> CalendarEvent {
        CalendarEvent {
            id: Some("1".into()),
            summary: Some("RDV".into()),
            location: Some(location.into()),
            description: None,
            hangout_link: hangout.map(String::from),
            conference_data: None,
            status: Some("confirmed".into()),
            start: Some(EventTime {
                date_time: Some("2026-07-15T10:00:00+02:00".into()),
                date: None,
            }),
        }
    }

    #[test]
    fn skips_visio_and_empty_location() {
        assert!(is_visio_or_remote_event(&ev("", None)));
        assert!(is_visio_or_remote_event(&ev(
            "https://meet.google.com/abc",
            None
        )));
        assert!(!is_visio_or_remote_event(&ev("12 rue des Acacias, Montpellier", None)));
    }
}
