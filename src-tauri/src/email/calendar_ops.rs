//! Création et synchronisation RDV Google Calendar.

use super::oauth_send::resolve_google_calendar_connection;
use crate::database::models::{
    AgendaGooglePipeSyncResult, AgendaWeekListResult, CalendarEventEntry, CalendarSyncResult,
    GoogleCalendarWeekEvent,
};
use crate::database::Database;
use chrono::{NaiveDate, TimeZone};
use serde::{Deserialize, Serialize};
use tauri::AppHandle;

const WEEK_SECONDS: i64 = 7 * 86_400;
const WEEK_EVENTS_PAGE_SIZE: &str = "250";
const WEEK_EVENTS_MAX_PAGES: u32 = 4;
const PIPE_SYNC_TIME_TOLERANCE_SEC: i64 = 60;

#[derive(Debug, Serialize)]
struct CreateEventBody<'a> {
    summary: &'a str,
    start: EventDateTime<'a>,
    end: EventDateTime<'a>,
    #[serde(skip_serializing_if = "Option::is_none")]
    location: Option<&'a str>,
    #[serde(skip_serializing_if = "Option::is_none")]
    attendees: Option<Vec<Attendee<'a>>>,
    #[serde(rename = "conferenceData", skip_serializing_if = "Option::is_none")]
    conference_data: Option<ConferenceDataCreate>,
}

#[derive(Debug, Serialize)]
struct ConferenceDataCreate {
    #[serde(rename = "createRequest")]
    create_request: ConferenceCreateRequest,
}

#[derive(Debug, Serialize)]
struct ConferenceCreateRequest {
    #[serde(rename = "requestId")]
    request_id: String,
    #[serde(rename = "conferenceSolutionKey")]
    conference_solution_key: ConferenceSolutionKey,
}

#[derive(Debug, Serialize)]
struct ConferenceSolutionKey {
    #[serde(rename = "type")]
    type_: &'static str,
}

#[derive(Debug, Serialize)]
struct EventDateTime<'a> {
    #[serde(rename = "dateTime")]
    date_time: &'a str,
    #[serde(rename = "timeZone")]
    time_zone: &'a str,
}

#[derive(Debug, Serialize)]
struct Attendee<'a> {
    email: &'a str,
}

#[derive(Debug, Deserialize)]
struct GoogleEventCreated {
    id: String,
}

#[derive(Debug, Deserialize)]
struct GoogleEventDetail {
    status: Option<String>,
    attendees: Option<Vec<GoogleAttendee>>,
}

#[derive(Debug, Deserialize)]
struct GoogleAttendee {
    email: Option<String>,
    #[serde(rename = "responseStatus")]
    response_status: Option<String>,
}

#[derive(Debug, Deserialize)]
struct GoogleCalendarEventList {
    items: Option<Vec<GoogleCalendarListEvent>>,
    #[serde(rename = "nextPageToken", default)]
    next_page_token: Option<String>,
}

#[derive(Debug, Deserialize)]
struct GoogleCalendarListEvent {
    id: Option<String>,
    status: Option<String>,
    summary: Option<String>,
    #[serde(rename = "htmlLink", default)]
    html_link: Option<String>,
    start: Option<GoogleCalendarEventTime>,
    end: Option<GoogleCalendarEventTime>,
}

#[derive(Debug, Deserialize)]
struct GoogleCalendarEventTime {
    #[serde(rename = "dateTime")]
    date_time: Option<String>,
    date: Option<String>,
}

fn format_rfc3339_local(unix: i64) -> String {
    chrono::Local
        .timestamp_opt(unix, 0)
        .single()
        .map(|dt| dt.to_rfc3339())
        .unwrap_or_else(|| "1970-01-01T10:00:00+01:00".to_string())
}

fn parse_calendar_event_time(
    time: &GoogleCalendarEventTime,
) -> Option<(i64, bool)> {
    if let Some(ref dt) = time.date_time {
        let parsed = chrono::DateTime::parse_from_rfc3339(dt).ok()?;
        return Some((parsed.timestamp(), false));
    }
    if let Some(ref d) = time.date {
        let nd = NaiveDate::parse_from_str(d, "%Y-%m-%d").ok()?;
        let local = chrono::Local
            .from_local_datetime(&nd.and_hms_opt(0, 0, 0)?)
            .single()?;
        return Some((local.timestamp(), true));
    }
    None
}

fn map_google_list_event(event: GoogleCalendarListEvent) -> Option<GoogleCalendarWeekEvent> {
    if event.status.as_deref() == Some("cancelled") {
        return None;
    }
    let google_event_id = event.id.filter(|id| !id.trim().is_empty())?;
    let start = event.start.as_ref()?;
    let end = event.end.as_ref()?;
    let (start_at, start_all_day) = parse_calendar_event_time(start)?;
    let (mut end_at, _) = parse_calendar_event_time(end)?;
    if start_all_day && end_at <= start_at {
        end_at = start_at + 86_400;
    }
    if end_at <= start_at {
        end_at = start_at + 3_600;
    }
    Some(GoogleCalendarWeekEvent {
        google_event_id,
        title: event
            .summary
            .filter(|s| !s.trim().is_empty())
            .unwrap_or_else(|| "Sans titre".to_string()),
        start_at,
        end_at,
        all_day: start_all_day,
        html_link: event.html_link,
        pipe_timeline_entry_id: None,
        pipe_id: None,
    })
}

fn sync_pipe_rdv_from_google_week(
    db: &Database,
    week_start_at: i64,
    google_events: &[GoogleCalendarWeekEvent],
) -> Result<AgendaGooglePipeSyncResult, String> {
    let mut rescheduled = 0u32;
    let mut cancelled = 0u32;
    let mut contact_ids_to_sync = std::collections::HashSet::new();
    let week_end_at = week_start_at.saturating_add(WEEK_SECONDS);

    for ge in google_events {
        let Some(ce) = db
            .get_calendar_event_by_google_event_id(&ge.google_event_id)
            .map_err(|e| e.to_string())?
        else {
            continue;
        };
        let Some(timeline_id) = ce.pipe_timeline_entry_id else {
            continue;
        };
        let pipe_out_of_sync = db
            .get_pipe_timeline_entry(timeline_id)
            .ok()
            .is_some_and(|entry| entry.occurred_at != ge.start_at);
        let times_differ = (ce.start_at - ge.start_at).abs() > PIPE_SYNC_TIME_TOLERANCE_SEC
            || (ce.end_at - ge.end_at).abs() > PIPE_SYNC_TIME_TOLERANCE_SEC
            || pipe_out_of_sync;
        if !times_differ {
            continue;
        }
        db.update_pipe_timeline_occurred_at(timeline_id, ge.start_at)
            .map_err(|e| e.to_string())?;
        db.update_calendar_event_times(&ge.google_event_id, &ge.title, ge.start_at, ge.end_at)
            .map_err(|e| e.to_string())?;
        if let Ok(entry) = db.get_pipe_timeline_entry(timeline_id) {
            if let Ok(pipe) = db.get_pipe_by_id(entry.pipe_id) {
                contact_ids_to_sync.insert(pipe.contact_id);
            }
        }
        rescheduled += 1;
    }

    let linked = db
        .list_pipe_linked_calendar_events_between(week_start_at, week_end_at)
        .map_err(|e| e.to_string())?;
    let google_ids: std::collections::HashSet<&str> = google_events
        .iter()
        .map(|ev| ev.google_event_id.as_str())
        .collect();
    for ce in linked {
        if google_ids.contains(ce.google_event_id.as_str()) {
            continue;
        }
        db.mark_calendar_event_cancelled(&ce.google_event_id)
            .map_err(|e| e.to_string())?;
        if let Some(timeline_id) = ce.pipe_timeline_entry_id {
            let _ = db.set_pipe_timeline_google_event_id(timeline_id, None);
            if let Ok(entry) = db.get_pipe_timeline_entry(timeline_id) {
                if let Ok(pipe) = db.get_pipe_by_id(entry.pipe_id) {
                    contact_ids_to_sync.insert(pipe.contact_id);
                }
            }
        }
        cancelled += 1;
    }

    for contact_id in contact_ids_to_sync {
        let _ = db.sync_contact_dates_for_contact(contact_id);
    }

    Ok(AgendaGooglePipeSyncResult {
        rescheduled,
        cancelled,
    })
}

fn enrich_week_events_with_pipe_links(
    db: &Database,
    events: &mut [GoogleCalendarWeekEvent],
) -> Result<(), String> {
    let ids: Vec<String> = events.iter().map(|ev| ev.google_event_id.clone()).collect();
    let links = db
        .pipe_links_for_google_event_ids(&ids)
        .map_err(|e| e.to_string())?;
    for ev in events.iter_mut() {
        if let Some((timeline_id, pipe_id)) = links.get(&ev.google_event_id) {
            ev.pipe_timeline_entry_id = Some(*timeline_id);
            ev.pipe_id = Some(*pipe_id);
        }
    }
    Ok(())
}

pub fn list_google_calendar_week_with_pipe_sync(
    app: &AppHandle,
    db: &Database,
    week_start_at: i64,
) -> Result<AgendaWeekListResult, String> {
    let mut events = list_google_calendar_week_events(app, week_start_at)?;
    let sync = sync_pipe_rdv_from_google_week(db, week_start_at, &events)?;
    enrich_week_events_with_pipe_links(db, &mut events)?;
    Ok(AgendaWeekListResult { events, sync })
}

pub fn list_google_calendar_week_events(
    app: &AppHandle,
    week_start_at: i64,
) -> Result<Vec<GoogleCalendarWeekEvent>, String> {
    let conn = resolve_google_calendar_connection(app)?.ok_or(
        "Connectez Google Agenda dans Paramètres → Emails & envois → Connexion pour afficher l'agenda.",
    )?;

    let week_end_at = week_start_at.saturating_add(WEEK_SECONDS);
    let time_min = format_rfc3339_local(week_start_at);
    let time_max = format_rfc3339_local(week_end_at);

    let client = reqwest::blocking::Client::new();
    let mut page_token: Option<String> = None;
    let mut events: Vec<GoogleCalendarWeekEvent> = Vec::new();

    for _ in 0..WEEK_EVENTS_MAX_PAGES {
        let mut query: Vec<(&str, String)> = vec![
            ("timeMin", time_min.clone()),
            ("timeMax", time_max.clone()),
            ("maxResults", WEEK_EVENTS_PAGE_SIZE.to_string()),
            ("singleEvents", "true".to_string()),
            ("orderBy", "startTime".to_string()),
        ];
        if let Some(ref token) = page_token {
            query.push(("pageToken", token.clone()));
        }

        let res = client
            .get("https://www.googleapis.com/calendar/v3/calendars/primary/events")
            .query(&query)
            .bearer_auth(&conn.access_token)
            .send()
            .map_err(|e| e.to_string())?;

        if !res.status().is_success() {
            let status = res.status();
            let err = res.text().unwrap_or_default();
            return Err(super::google_api_errors::calendar_access_error(status, &err));
        }

        let list: GoogleCalendarEventList = res.json().map_err(|e| e.to_string())?;
        if let Some(items) = list.items {
            for item in items {
                if let Some(mapped) = map_google_list_event(item) {
                    events.push(mapped);
                }
            }
        }

        page_token = list.next_page_token;
        if page_token.is_none() {
            break;
        }
    }

    events.sort_by_key(|ev| ev.start_at);
    Ok(events)
}

pub fn create_google_calendar_rdv(
    app: &AppHandle,
    db: &Database,
    contact_id: i64,
    alerte_id: Option<i64>,
    tache_id: Option<i64>,
    pipe_timeline_entry_id: Option<i64>,
    title: &str,
    start_at: i64,
    end_at: i64,
    add_google_meet: bool,
    visio_link: Option<&str>,
) -> Result<CalendarEventEntry, String> {
    let conn = resolve_google_calendar_connection(app)?
        .ok_or("Connectez Google Agenda dans Paramètres → Emails & envois → Connexion pour planifier un RDV.")?;

    let (prenom, nom, email) = db
        .get_contact_calendar_info(contact_id)
        .map_err(|e| e.to_string())?;

    let summary = if title.trim().is_empty() {
        format!("RDV — {prenom} {nom}")
    } else {
        title.trim().to_string()
    };
    let start_str = format_rfc3339_local(start_at);
    let end_str = format_rfc3339_local(end_at);
    let attendees = email
        .as_deref()
        .filter(|e| e.contains('@'))
        .map(|e| vec![Attendee { email: e }]);

    let location = if add_google_meet {
        None
    } else {
        visio_link.map(str::trim).filter(|s| !s.is_empty())
    };
    let conference_data = if add_google_meet {
        Some(ConferenceDataCreate {
            create_request: ConferenceCreateRequest {
                request_id: format!("crm-{contact_id}-{start_at}"),
                conference_solution_key: ConferenceSolutionKey {
                    type_: "hangoutsMeet",
                },
            },
        })
    } else {
        None
    };

    let body = CreateEventBody {
        summary: &summary,
        start: EventDateTime {
            date_time: &start_str,
            time_zone: "Europe/Paris",
        },
        end: EventDateTime {
            date_time: &end_str,
            time_zone: "Europe/Paris",
        },
        location,
        attendees,
        conference_data,
    };

    let client = reqwest::blocking::Client::new();
    let mut query = vec![("sendUpdates", "all")];
    if add_google_meet {
        query.push(("conferenceDataVersion", "1"));
    }
    let res = client
        .post("https://www.googleapis.com/calendar/v3/calendars/primary/events")
        .query(&query)
        .bearer_auth(&conn.access_token)
        .json(&body)
        .send()
        .map_err(|e| e.to_string())?;

    if !res.status().is_success() {
        let status = res.status();
        let err = res.text().unwrap_or_default();
        return Err(super::google_api_errors::calendar_access_error(status, &err));
    }

    let created: GoogleEventCreated = res.json().map_err(|e| e.to_string())?;
    let row_id = db
        .insert_calendar_event(
            contact_id,
            alerte_id,
            tache_id,
            pipe_timeline_entry_id,
            &created.id,
            &summary,
            start_at,
            end_at,
            email.as_deref(),
        )
        .map_err(|e| e.to_string())?;

    if let Some(entry_id) = pipe_timeline_entry_id {
        let _ = db.set_pipe_timeline_google_event_id(entry_id, Some(&created.id));
    }

    db.get_calendar_event_by_id(row_id)
        .map_err(|e| e.to_string())
}

pub fn update_google_calendar_rdv(
    app: &AppHandle,
    db: &Database,
    google_event_id: &str,
    title: &str,
    start_at: i64,
    end_at: i64,
) -> Result<(), String> {
    let conn = resolve_google_calendar_connection(app)?
        .ok_or("Connectez Google Agenda dans Paramètres → Emails & envois → Connexion.")?;

    let summary = title.trim();
    if summary.is_empty() {
        return Err("Titre requis.".into());
    }
    let start_str = format_rfc3339_local(start_at);
    let end_str = format_rfc3339_local(end_at);

    let body = CreateEventBody {
        summary,
        start: EventDateTime {
            date_time: &start_str,
            time_zone: "Europe/Paris",
        },
        end: EventDateTime {
            date_time: &end_str,
            time_zone: "Europe/Paris",
        },
        location: None,
        attendees: None,
        conference_data: None,
    };

    let client = reqwest::blocking::Client::new();
    let url = format!(
        "https://www.googleapis.com/calendar/v3/calendars/primary/events/{google_event_id}"
    );
    let res = client
        .patch(&url)
        .query(&[("sendUpdates", "all")])
        .bearer_auth(&conn.access_token)
        .json(&body)
        .send()
        .map_err(|e| e.to_string())?;

    if !res.status().is_success() {
        let status = res.status();
        let err = res.text().unwrap_or_default();
        return Err(super::google_api_errors::calendar_access_error(status, &err));
    }

    db.update_calendar_event_times(google_event_id, summary, start_at, end_at)
        .map_err(|e| e.to_string())
}

pub fn cancel_google_calendar_rdv(app: &AppHandle, db: &Database, google_event_id: &str) -> Result<(), String> {
    let conn = resolve_google_calendar_connection(app)?
        .ok_or("Connectez Google Agenda dans Paramètres → Emails & envois → Connexion.")?;

    let client = reqwest::blocking::Client::new();
    let url = format!(
        "https://www.googleapis.com/calendar/v3/calendars/primary/events/{google_event_id}"
    );
    let res = client
        .delete(&url)
        .query(&[("sendUpdates", "all")])
        .bearer_auth(&conn.access_token)
        .send()
        .map_err(|e| e.to_string())?;

    if !res.status().is_success() && res.status() != reqwest::StatusCode::GONE {
        let status = res.status();
        let err = res.text().unwrap_or_default();
        return Err(super::google_api_errors::calendar_access_error(status, &err));
    }

    db.mark_calendar_event_cancelled(google_event_id)
        .map_err(|e| e.to_string())
}

pub fn sync_calendar_rdv_status(app: &AppHandle, db: &Database) -> Result<CalendarSyncResult, String> {
    let conn = resolve_google_calendar_connection(app)?
        .ok_or("Connectez Google Agenda pour synchroniser l'Agenda.")?;

    let pending = db.list_calendar_events_to_sync().map_err(|e| e.to_string())?;
    let client = reqwest::blocking::Client::new();
    let mut result = CalendarSyncResult {
        checked: pending.len() as u32,
        accepted: 0,
        declined: 0,
        cancelled: 0,
        errors: vec![],
    };

    for ev in pending {
        let url = format!(
            "https://www.googleapis.com/calendar/v3/calendars/primary/events/{}",
            ev.google_event_id
        );
        let res = match client
            .get(&url)
            .bearer_auth(&conn.access_token)
            .send()
        {
            Ok(r) => r,
            Err(e) => {
                if result.errors.len() < 5 {
                    result.errors.push(e.to_string());
                }
                continue;
            }
        };

        if !res.status().is_success() {
            if result.errors.len() < 5 {
                result.errors.push(format!("Événement {} introuvable", ev.id));
            }
            continue;
        }

        let detail: GoogleEventDetail = match res.json() {
            Ok(d) => d,
            Err(e) => {
                if result.errors.len() < 5 {
                    result.errors.push(e.to_string());
                }
                continue;
            }
        };

        let event_status = if detail.status.as_deref() == Some("cancelled") {
            "cancelled"
        } else {
            "confirmed"
        };

        let attendee_status = detail
            .attendees
            .as_ref()
            .and_then(|list| {
                list.iter().find(|a| {
                    ev.attendee_email
                        .as_deref()
                        .zip(a.email.as_deref())
                        .map(|(want, got)| want.eq_ignore_ascii_case(got))
                        .unwrap_or(false)
                })
            })
            .and_then(|a| a.response_status.clone());

        let _ = db.update_calendar_event_sync(ev.id, attendee_status.as_deref(), event_status);

        if event_status == "cancelled" {
            result.cancelled += 1;
            continue;
        }

        match attendee_status.as_deref() {
            Some("accepted") => {
                result.accepted += 1;
                let _ = db.advance_pipeline_on_rdv(ev.contact_id);
            }
            Some("declined") => result.declined += 1,
            _ => {}
        }
    }

    Ok(result)
}
