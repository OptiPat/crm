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
const PIPE_SYNC_TIME_TOLERANCE_SEC: i64 = crate::database::pipe_rdv_google_sync::PIPE_SYNC_TIME_TOLERANCE_SEC;

fn resolve_rdv_attendee_contact_ids(
    db: &Database,
    contact_id: i64,
    additional_contact_ids: &[i64],
    pipe_timeline_entry_id: Option<i64>,
) -> Result<Vec<i64>, String> {
    if contact_id <= 0 {
        return Err("contact_id obligatoire".into());
    }
    let mut ids = vec![contact_id];
    if let Some(entry_id) = pipe_timeline_entry_id {
        if let Ok(entry) = db.get_pipe_timeline_entry(entry_id) {
            if let Ok(pipe) = db.get_pipe_by_id(entry.pipe_id) {
                if let Some(sec) = pipe
                    .secondary_contact_id
                    .filter(|id| *id > 0 && *id != contact_id)
                {
                    ids.push(sec);
                }
                return Ok(ids);
            }
        }
    }
    for id in additional_contact_ids
        .iter()
        .copied()
        .filter(|id| *id > 0 && *id != contact_id)
    {
        ids.push(id);
    }
    Ok(ids)
}

fn attendee_emails_from_contact_ids(
    db: &Database,
    contact_ids: &[i64],
) -> Result<Vec<String>, String> {
    db.collect_calendar_attendee_emails(contact_ids)
        .map_err(|e| e.to_string())
}

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
    #[serde(default)]
    location: Option<String>,
    #[serde(rename = "hangoutLink", default)]
    hangout_link: Option<String>,
    #[serde(rename = "conferenceData", default)]
    conference_data: Option<GoogleConferenceData>,
}

#[derive(Debug, Deserialize)]
struct GoogleConferenceData {
    #[serde(rename = "entryPoints", default)]
    entry_points: Vec<GoogleConferenceEntryPoint>,
}

#[derive(Debug, Deserialize)]
struct GoogleConferenceEntryPoint {
    #[serde(rename = "entryPointType", default)]
    entry_point_type: Option<String>,
    uri: Option<String>,
}

fn extract_google_event_visio_link(event: &GoogleEventCreated) -> Option<String> {
    extract_google_visio_link_fields(
        event.hangout_link.as_deref(),
        event.conference_data.as_ref(),
    )
}

fn extract_google_visio_link_fields(
    hangout_link: Option<&str>,
    conference_data: Option<&GoogleConferenceData>,
) -> Option<String> {
    if let Some(link) = hangout_link.map(str::trim).filter(|s| !s.is_empty()) {
        return Some(link.to_string());
    }
    conference_data
        .and_then(|data| {
            data.entry_points
                .iter()
                .find(|ep| ep.entry_point_type.as_deref() == Some("video"))
                .and_then(|ep| ep.uri.as_deref().map(str::trim).filter(|s| !s.is_empty()))
        })
        .map(str::to_string)
}

fn extract_google_event_location(event: &GoogleEventCreated) -> Option<String> {
    normalize_google_location_text(event.location.as_deref())
}

fn normalize_google_location_text(raw: Option<&str>) -> Option<String> {
    raw.map(str::trim).filter(|s| !s.is_empty()).map(str::to_string)
}

fn normalize_google_calendar_visio_fields(
    meet_link: Option<String>,
    location: Option<String>,
) -> (Option<String>, Option<String>) {
    let location = normalize_google_location_text(location.as_deref());
    let meet_link = meet_link.filter(|s| !s.trim().is_empty());
    let visio_link = meet_link.or_else(|| {
        location.as_ref().and_then(|loc| {
            if loc.starts_with("http://") || loc.starts_with("https://") {
                Some(loc.clone())
            } else {
                None
            }
        })
    });
    (visio_link, location)
}

fn google_visio_fields_from_list_event(
    event: &GoogleCalendarListEvent,
) -> (Option<String>, Option<String>) {
    let meet_link = extract_google_visio_link_fields(
        event.hangout_link.as_deref(),
        event.conference_data.as_ref(),
    );
    normalize_google_calendar_visio_fields(meet_link, event.location.clone())
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
    #[serde(default)]
    location: Option<String>,
    #[serde(rename = "hangoutLink", default)]
    hangout_link: Option<String>,
    #[serde(rename = "conferenceData", default)]
    conference_data: Option<GoogleConferenceData>,
    #[serde(rename = "eventType", default)]
    event_type: Option<String>,
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
    let (visio_link, event_location) = google_visio_fields_from_list_event(&event);
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
        visio_link,
        event_location,
        event_type: event
            .event_type
            .filter(|s| !s.trim().is_empty()),
    })
}

fn fetch_google_calendar_event_by_id(
    app: &AppHandle,
    google_event_id: &str,
) -> Result<Option<GoogleCalendarWeekEvent>, String> {
    let Some(conn) = resolve_google_calendar_connection(app)? else {
        return Err(
            "Connectez Google Agenda dans Paramètres → Emails & envois → Connexion.".into(),
        );
    };

    let client = reqwest::blocking::Client::new();
    let url = format!(
        "https://www.googleapis.com/calendar/v3/calendars/primary/events/{google_event_id}"
    );
    let res = client
        .get(&url)
        .query(&[("conferenceDataVersion", "1")])
        .bearer_auth(&conn.access_token)
        .send()
        .map_err(|e| e.to_string())?;

    if res.status() == reqwest::StatusCode::NOT_FOUND
        || res.status() == reqwest::StatusCode::GONE
    {
        return Ok(None);
    }

    if !res.status().is_success() {
        let status = res.status();
        let err = res.text().unwrap_or_default();
        return Err(super::google_api_errors::calendar_access_error(status, &err));
    }

    let event: GoogleCalendarListEvent = res.json().map_err(|e| e.to_string())?;
    Ok(map_google_list_event(event))
}

fn apply_google_event_diff_to_pipe_rdv(
    db: &Database,
    timeline_id: i64,
    google_event_id: &str,
    ge: &GoogleCalendarWeekEvent,
    ce: &CalendarEventEntry,
    contact_ids_to_sync: &mut std::collections::HashSet<i64>,
    rescheduled_timeline_entry_ids: &mut Vec<i64>,
) -> Result<bool, String> {
    let start_changed = (ce.start_at - ge.start_at).abs() > PIPE_SYNC_TIME_TOLERANCE_SEC;
    let end_changed = (ce.end_at - ge.end_at).abs() > PIPE_SYNC_TIME_TOLERANCE_SEC;
    let visio_link = ge.visio_link.as_deref();
    let event_location = ge.event_location.as_deref();
    let visio_changed = ce.visio_link.as_deref() != visio_link
        || ce.event_location.as_deref() != event_location;

    if start_changed {
        if db
            .apply_pipe_rdv_rescheduled_from_google(
                timeline_id,
                google_event_id,
                ge.start_at,
                ge.end_at,
                &ge.title,
                ce.start_at,
                visio_link,
                event_location,
            )
            .map_err(|e| e.to_string())?
        {
            if let Ok(entry) = db.get_pipe_timeline_entry(timeline_id) {
                if let Ok(pipe) = db.get_pipe_by_id(entry.pipe_id) {
                    contact_ids_to_sync.insert(pipe.contact_id);
                    if let Some(sec) = pipe.secondary_contact_id.filter(|id| *id > 0) {
                        contact_ids_to_sync.insert(sec);
                    }
                }
            }
            rescheduled_timeline_entry_ids.push(timeline_id);
            return Ok(true);
        }
    } else if end_changed {
        if db
            .apply_pipe_rdv_duration_from_google(
                google_event_id,
                ge.end_at,
                &ge.title,
                ge.start_at,
                ce.end_at,
                visio_link,
                event_location,
            )
            .map_err(|e| e.to_string())?
        {
            contact_ids_to_sync.insert(ce.contact_id);
            rescheduled_timeline_entry_ids.push(timeline_id);
            return Ok(true);
        }
    } else if visio_changed {
        if db
            .apply_pipe_rdv_visio_from_google(
                google_event_id,
                &ge.title,
                ge.start_at,
                ge.end_at,
                visio_link,
                event_location,
            )
            .map_err(|e| e.to_string())?
        {
            contact_ids_to_sync.insert(ce.contact_id);
            rescheduled_timeline_entry_ids.push(timeline_id);
            return Ok(true);
        }
    } else if db
        .get_pipe_timeline_entry(timeline_id)
        .ok()
        .is_some_and(|entry| entry.occurred_at != ge.start_at)
    {
        let _ = db.align_pipe_rdv_occurred_at_from_calendar(timeline_id, ge.start_at);
    }
    Ok(false)
}

fn sync_pipe_rdv_from_google_week(
    app: &AppHandle,
    db: &Database,
    week_start_at: i64,
    google_events: &[GoogleCalendarWeekEvent],
) -> Result<AgendaGooglePipeSyncResult, String> {
    let mut rescheduled = 0u32;
    let mut cancelled = 0u32;
    let mut contact_ids_to_sync = std::collections::HashSet::new();
    let mut rescheduled_timeline_entry_ids = Vec::new();
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
        let changed = apply_google_event_diff_to_pipe_rdv(
            db,
            timeline_id,
            &ge.google_event_id,
            ge,
            &ce,
            &mut contact_ids_to_sync,
            &mut rescheduled_timeline_entry_ids,
        )?;
        if changed {
            rescheduled += 1;
        }
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
        match fetch_google_calendar_event_by_id(app, ce.google_event_id.as_str()) {
            Ok(Some(ge)) => {
                if let Some(timeline_id) = ce.pipe_timeline_entry_id {
                    let changed = apply_google_event_diff_to_pipe_rdv(
                        db,
                        timeline_id,
                        ce.google_event_id.as_str(),
                        &ge,
                        &ce,
                        &mut contact_ids_to_sync,
                        &mut rescheduled_timeline_entry_ids,
                    )?;
                    if changed {
                        rescheduled += 1;
                    }
                }
            }
            Ok(None) => {
                if let Some(timeline_id) = ce.pipe_timeline_entry_id {
                    if db.get_pipe_timeline_entry(timeline_id).is_ok() {
                        db.apply_pipe_rdv_cancelled_from_google(
                            timeline_id,
                            ce.google_event_id.as_str(),
                        )
                        .map_err(|e| e.to_string())?;
                    } else {
                        db.mark_calendar_event_cancelled(&ce.google_event_id)
                            .map_err(|e| e.to_string())?;
                    }
                } else {
                    db.mark_calendar_event_cancelled(&ce.google_event_id)
                        .map_err(|e| e.to_string())?;
                }
                contact_ids_to_sync.insert(ce.contact_id);
                cancelled += 1;
            }
            Err(_) => {
                // Indisponible (réseau, auth…) : ne pas annuler à tort.
            }
        }
    }

    for contact_id in contact_ids_to_sync {
        let _ = db.sync_contact_dates_for_contact_from_affaire(contact_id);
    }

    Ok(AgendaGooglePipeSyncResult {
        rescheduled,
        cancelled,
        rescheduled_timeline_entry_ids,
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
    sync_pipe: bool,
) -> Result<AgendaWeekListResult, String> {
    let mut events = list_google_calendar_week_events(app, week_start_at)?;
    let sync = if sync_pipe {
        sync_pipe_rdv_from_google_week(app, db, week_start_at, &events)?
    } else {
        AgendaGooglePipeSyncResult::default()
    };
    enrich_week_events_with_pipe_links(db, &mut events)?;
    Ok(AgendaWeekListResult { events, sync })
}

const PIPE_SYNC_LOOKBACK_SEC: i64 = 7 * 86_400;

pub fn sync_all_pipe_linked_google_rdvs(
    app: &AppHandle,
    db: &Database,
) -> Result<AgendaGooglePipeSyncResult, String> {
    let since = chrono::Utc::now().timestamp().saturating_sub(PIPE_SYNC_LOOKBACK_SEC);
    let linked = db
        .list_active_pipe_linked_calendar_events(since)
        .map_err(|e| e.to_string())?;
    let mut rescheduled = 0u32;
    let mut cancelled = 0u32;
    let mut contact_ids_to_sync = std::collections::HashSet::new();
    let mut rescheduled_timeline_entry_ids = Vec::new();

    for ce in linked {
        let Some(timeline_id) = ce.pipe_timeline_entry_id else {
            continue;
        };
        match fetch_google_calendar_event_by_id(app, ce.google_event_id.as_str()) {
            Ok(Some(ge)) => {
                let changed = apply_google_event_diff_to_pipe_rdv(
                    db,
                    timeline_id,
                    ce.google_event_id.as_str(),
                    &ge,
                    &ce,
                    &mut contact_ids_to_sync,
                    &mut rescheduled_timeline_entry_ids,
                )?;
                if changed {
                    rescheduled += 1;
                }
            }
            Ok(None) => {
                if db.get_pipe_timeline_entry(timeline_id).is_ok() {
                    db.apply_pipe_rdv_cancelled_from_google(
                        timeline_id,
                        ce.google_event_id.as_str(),
                    )
                    .map_err(|e| e.to_string())?;
                } else {
                    db.mark_calendar_event_cancelled(&ce.google_event_id)
                        .map_err(|e| e.to_string())?;
                }
                contact_ids_to_sync.insert(ce.contact_id);
                cancelled += 1;
            }
            Err(_) => {}
        }
    }

    for contact_id in contact_ids_to_sync {
        let _ = db.sync_contact_dates_for_contact_from_affaire(contact_id);
    }

    Ok(AgendaGooglePipeSyncResult {
        rescheduled,
        cancelled,
        rescheduled_timeline_entry_ids,
    })
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
    event_location: Option<&str>,
    additional_contact_ids: &[i64],
) -> Result<CalendarEventEntry, String> {
    let conn = resolve_google_calendar_connection(app)?
        .ok_or("Connectez Google Agenda dans Paramètres → Emails & envois → Connexion pour planifier un RDV.")?;

    let (prenom, nom, _email) = db
        .get_contact_calendar_info(contact_id)
        .map_err(|e| e.to_string())?;

    let summary = if title.trim().is_empty() {
        format!("RDV — {prenom} {nom}")
    } else {
        title.trim().to_string()
    };
    let start_str = format_rfc3339_local(start_at);
    let end_str = format_rfc3339_local(end_at);
    let mut attendee_contact_ids =
        resolve_rdv_attendee_contact_ids(db, contact_id, additional_contact_ids, pipe_timeline_entry_id)?;
    attendee_contact_ids.sort_unstable();
    attendee_contact_ids.dedup();
    let attendee_emails = attendee_emails_from_contact_ids(db, &attendee_contact_ids)?;
    let attendees = if attendee_emails.is_empty() {
        None
    } else {
        Some(
            attendee_emails
                .iter()
                .map(|email| Attendee {
                    email: email.as_str(),
                })
                .collect(),
        )
    };
    let primary_attendee_email = attendee_emails.first().map(String::as_str);

    let location = if add_google_meet {
        None
    } else {
        event_location
            .map(str::trim)
            .filter(|s| !s.is_empty())
            .or_else(|| visio_link.map(str::trim).filter(|s| !s.is_empty()))
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
    let visio_link = extract_google_event_visio_link(&created);
    let event_location = extract_google_event_location(&created);
    let (visio_link, event_location) =
        normalize_google_calendar_visio_fields(visio_link, event_location);
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
            primary_attendee_email,
            visio_link.as_deref(),
            event_location.as_deref(),
        )
        .map_err(|e| e.to_string())?;

    if let Some(entry_id) = pipe_timeline_entry_id {
        let _ = db.set_pipe_timeline_google_event_id(entry_id, Some(&created.id));
    }

    db.get_calendar_event_by_id(row_id).map_err(|e| e.to_string())
}

#[derive(Debug, Serialize)]
struct PatchEventBody<'a> {
    summary: &'a str,
    start: EventDateTime<'a>,
    end: EventDateTime<'a>,
    #[serde(skip_serializing_if = "Option::is_none")]
    location: Option<serde_json::Value>,
    #[serde(skip_serializing_if = "Option::is_none")]
    attendees: Option<Vec<Attendee<'a>>>,
    #[serde(rename = "conferenceData", skip_serializing_if = "Option::is_none")]
    conference_data: Option<serde_json::Value>,
}

pub fn update_google_calendar_rdv(
    app: &AppHandle,
    db: &Database,
    google_event_id: &str,
    title: &str,
    start_at: i64,
    end_at: i64,
    add_google_meet: bool,
    visio_link: Option<&str>,
    event_location: Option<&str>,
    preserve_visio: bool,
    clear_visio: bool,
    additional_contact_ids: &[i64],
) -> Result<crate::database::models::CalendarRdvSyncDetails, String> {
    let conn = resolve_google_calendar_connection(app)?
        .ok_or("Connectez Google Agenda dans Paramètres → Emails & envois → Connexion.")?;

    let summary = title.trim();
    if summary.is_empty() {
        return Err("Titre requis.".into());
    }
    let start_str = format_rfc3339_local(start_at);
    let end_str = format_rfc3339_local(end_at);

    let calendar_event = db
        .get_calendar_event_by_google_event_id(google_event_id)
        .map_err(|e| e.to_string())?;
    let attendee_emails = if let Some(ref ce) = calendar_event {
        let attendee_contact_ids = resolve_rdv_attendee_contact_ids(
            db,
            ce.contact_id,
            additional_contact_ids,
            ce.pipe_timeline_entry_id,
        )?;
        attendee_emails_from_contact_ids(db, &attendee_contact_ids)?
    } else {
        Vec::new()
    };
    let attendees = if attendee_emails.is_empty() {
        None
    } else {
        Some(
            attendee_emails
                .iter()
                .map(|email| Attendee {
                    email: email.as_str(),
                })
                .collect(),
        )
    };

    let (location, conference_data) = if preserve_visio {
        (None, None)
    } else if clear_visio {
        (
            Some(serde_json::Value::Null),
            Some(serde_json::Value::Null),
        )
    } else if add_google_meet {
        (
            None,
            Some(serde_json::to_value(ConferenceDataCreate {
                create_request: ConferenceCreateRequest {
                    request_id: format!("crm-upd-{google_event_id}-{start_at}"),
                    conference_solution_key: ConferenceSolutionKey {
                        type_: "hangoutsMeet",
                    },
                },
            }).map_err(|e| e.to_string())?),
        )
    } else {
        let loc = event_location
            .map(str::trim)
            .filter(|s| !s.is_empty())
            .or_else(|| visio_link.map(str::trim).filter(|s| !s.is_empty()));
        (
            loc.map(|value| serde_json::Value::String(value.to_string())),
            None,
        )
    };

    let body = PatchEventBody {
        summary,
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
    let url = format!(
        "https://www.googleapis.com/calendar/v3/calendars/primary/events/{google_event_id}"
    );
    let mut query = vec![("sendUpdates", "all")];
    if !preserve_visio && (add_google_meet || clear_visio) {
        query.push(("conferenceDataVersion", "1"));
    }
    let res = client
        .patch(&url)
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

    let updated: GoogleEventCreated = res.json().map_err(|e| e.to_string())?;
    let visio_link = extract_google_event_visio_link(&updated);
    let event_location = extract_google_event_location(&updated);
    let (visio_link, event_location) =
        normalize_google_calendar_visio_fields(visio_link, event_location);

    db.update_calendar_event_sync_details(
        google_event_id,
        summary,
        start_at,
        end_at,
        visio_link.as_deref(),
        event_location.as_deref(),
        true,
    )
    .map_err(|e| e.to_string())?;

    Ok(crate::database::models::CalendarRdvSyncDetails {
        visio_link,
        event_location,
    })
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
            if res.status() == reqwest::StatusCode::NOT_FOUND
                || res.status() == reqwest::StatusCode::GONE
            {
                let _ = db.update_calendar_event_sync(ev.id, None, "cancelled");
                if let Some(timeline_id) = ev.pipe_timeline_entry_id {
                    if db.get_pipe_timeline_entry(timeline_id).is_ok() {
                        let _ = db.apply_pipe_rdv_cancelled_from_google(
                            timeline_id,
                            ev.google_event_id.as_str(),
                        );
                    }
                }
                result.cancelled += 1;
                continue;
            }
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
            if let Some(timeline_id) = ev.pipe_timeline_entry_id {
                if db.get_pipe_timeline_entry(timeline_id).is_ok() {
                    let _ = db.apply_pipe_rdv_cancelled_from_google(
                        timeline_id,
                        ev.google_event_id.as_str(),
                    );
                }
            }
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

#[cfg(test)]
mod visio_tests {
    use super::normalize_google_calendar_visio_fields;

    #[test]
    fn custom_link_in_location_becomes_visio_link() {
        let (visio, lieu) = normalize_google_calendar_visio_fields(
            None,
            Some("https://zoom.us/j/123".into()),
        );
        assert_eq!(visio.as_deref(), Some("https://zoom.us/j/123"));
        assert_eq!(lieu.as_deref(), Some("https://zoom.us/j/123"));
    }

    #[test]
    fn meet_link_takes_priority_over_location() {
        let (visio, lieu) = normalize_google_calendar_visio_fields(
            Some("https://meet.google.com/abc".into()),
            Some("8 place du Marche".into()),
        );
        assert_eq!(visio.as_deref(), Some("https://meet.google.com/abc"));
        assert_eq!(lieu.as_deref(), Some("8 place du Marche"));
    }
}
