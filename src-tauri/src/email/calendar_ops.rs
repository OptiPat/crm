//! Création et synchronisation RDV Google Calendar.

use super::oauth_send::refresh_connection_if_needed;
use super::oauth_store::EmailOAuthStore;
use crate::database::models::{CalendarEventEntry, CalendarSyncResult};
use crate::database::Database;
use chrono::TimeZone;
use serde::{Deserialize, Serialize};
use tauri::AppHandle;

#[derive(Debug, Serialize)]
struct CreateEventBody<'a> {
    summary: &'a str,
    description: &'a str,
    start: EventDateTime<'a>,
    end: EventDateTime<'a>,
    #[serde(skip_serializing_if = "Option::is_none")]
    attendees: Option<Vec<Attendee<'a>>>,
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

fn format_rfc3339_local(unix: i64) -> String {
    chrono::Local
        .timestamp_opt(unix, 0)
        .single()
        .map(|dt| dt.to_rfc3339())
        .unwrap_or_else(|| "1970-01-01T10:00:00+01:00".to_string())
}

pub fn create_google_calendar_rdv(
    app: &AppHandle,
    db: &Database,
    contact_id: i64,
    alerte_id: Option<i64>,
    tache_id: Option<i64>,
    title: &str,
    start_at: i64,
    end_at: i64,
) -> Result<CalendarEventEntry, String> {
    let store = EmailOAuthStore::load(app)?;
    let mut conn = store
        .connection
        .clone()
        .ok_or("Connectez Google dans Paramètres → Email pour planifier un RDV.")?;
    if conn.provider != "google" {
        return Err("La planification RDV nécessite un compte Google connecté.".into());
    }
    refresh_connection_if_needed(app, &mut conn)?;

    let (prenom, nom, email) = db
        .get_contact_calendar_info(contact_id)
        .map_err(|e| e.to_string())?;

    let summary = if title.trim().is_empty() {
        format!("RDV — {prenom} {nom}")
    } else {
        title.trim().to_string()
    };
    let description = format!(
        "Patrimoine CRM — contact #{contact_id}{}",
        alerte_id
            .map(|id| format!(" — alerte #{id}"))
            .unwrap_or_default()
    );
    let start_str = format_rfc3339_local(start_at);
    let end_str = format_rfc3339_local(end_at);
    let attendees = email
        .as_deref()
        .filter(|e| e.contains('@'))
        .map(|e| vec![Attendee { email: e }]);

    let body = CreateEventBody {
        summary: &summary,
        description: &description,
        start: EventDateTime {
            date_time: &start_str,
            time_zone: "Europe/Paris",
        },
        end: EventDateTime {
            date_time: &end_str,
            time_zone: "Europe/Paris",
        },
        attendees,
    };

    let client = reqwest::blocking::Client::new();
    let res = client
        .post("https://www.googleapis.com/calendar/v3/calendars/primary/events")
        .query(&[("sendUpdates", "all")])
        .bearer_auth(&conn.access_token)
        .json(&body)
        .send()
        .map_err(|e| e.to_string())?;

    if !res.status().is_success() {
        let err = res.text().unwrap_or_default();
        if err.contains("403") || err.contains("insufficient") {
            return Err(
                "Accès Agenda refusé : reconnectez Google pour autoriser la création de RDV."
                    .into(),
            );
        }
        return Err(format!("Google Calendar : {err}"));
    }

    let created: GoogleEventCreated = res.json().map_err(|e| e.to_string())?;
    let row_id = db
        .insert_calendar_event(
            contact_id,
            alerte_id,
            tache_id,
            &created.id,
            &summary,
            start_at,
            end_at,
            email.as_deref(),
        )
        .map_err(|e| e.to_string())?;

    db.get_calendar_event_by_id(row_id)
        .map_err(|e| e.to_string())
}

pub fn sync_calendar_rdv_status(app: &AppHandle, db: &Database) -> Result<CalendarSyncResult, String> {
    let store = EmailOAuthStore::load(app)?;
    let mut conn = store
        .connection
        .clone()
        .ok_or("Connectez Google pour synchroniser l'Agenda.")?;
    if conn.provider != "google" {
        return Err("Synchronisation Agenda : compte Google requis.".into());
    }
    refresh_connection_if_needed(app, &mut conn)?;

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
