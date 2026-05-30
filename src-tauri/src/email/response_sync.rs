//! Détection automatique : réponses Gmail et RDV Google Agenda.

use super::oauth_send::refresh_connection_if_needed;
use super::oauth_store::EmailOAuthStore;
use crate::database::models::PendingCampaignResponseCheck;
use serde::Deserialize;
use tauri::AppHandle;

#[derive(Debug, Clone, serde::Serialize)]
pub struct EmailCampaignSyncResult {
    pub checked: u32,
    pub mail_detected: u32,
    pub rdv_detected: u32,
    pub errors: Vec<String>,
}

#[derive(Debug, Deserialize)]
struct GmailSendResponse {
    id: String,
    #[serde(rename = "threadId")]
    thread_id: String,
}

#[derive(Debug, Deserialize)]
struct GmailThread {
    messages: Option<Vec<GmailMessageRef>>,
}

#[derive(Debug, Deserialize)]
struct GmailMessageRef {
    id: String,
    #[serde(rename = "internalDate")]
    internal_date: String,
}

#[derive(Debug, Deserialize)]
struct GmailMessageList {
    messages: Option<Vec<GmailMessageRef>>,
}

#[derive(Debug, Deserialize)]
struct GmailMessageMeta {
    #[serde(rename = "internalDate")]
    internal_date: Option<String>,
    payload: Option<GmailPayload>,
}

#[derive(Debug, Deserialize)]
struct GmailPayload {
    headers: Option<Vec<GmailHeader>>,
}

#[derive(Debug, Deserialize)]
struct GmailHeader {
    name: String,
    value: String,
}

#[derive(Debug, Deserialize)]
struct CalendarEventList {
    items: Option<Vec<CalendarEvent>>,
}

#[derive(Debug, Deserialize)]
struct CalendarEvent {
    #[serde(rename = "start")]
    start: Option<CalendarEventTime>,
    attendees: Option<Vec<CalendarAttendee>>,
    status: Option<String>,
}

#[derive(Debug, Deserialize)]
struct CalendarEventTime {
    #[serde(rename = "dateTime")]
    date_time: Option<String>,
    date: Option<String>,
}

#[derive(Debug, Deserialize)]
struct CalendarAttendee {
    email: Option<String>,
    #[serde(rename = "responseStatus")]
    response_status: Option<String>,
}

pub fn parse_gmail_send_response(body: &str) -> Option<(String, String)> {
    let parsed: GmailSendResponse = serde_json::from_str(body).ok()?;
    Some((parsed.id, parsed.thread_id))
}

fn gmail_after_date(sent_unix: i64) -> String {
    use chrono::{TimeZone, Utc};
    let dt = Utc.timestamp_opt(sent_unix, 0).single().unwrap_or_else(Utc::now);
    dt.format("%Y/%m/%d").to_string()
}

fn email_matches(address_header: &str, contact_email: &str) -> bool {
    let contact = contact_email.trim().to_lowercase();
    if contact.is_empty() {
        return false;
    }
    address_header.to_lowercase().contains(&contact)
}

fn is_reply_from_contact(from_header: &str, contact_email: &str) -> bool {
    email_matches(from_header, contact_email)
}

fn parse_internal_date_ms(internal_date: &str) -> Option<i64> {
    internal_date.parse::<i64>().ok()
}

fn message_from_contact(
    client: &reqwest::blocking::Client,
    token: &str,
    message_id: &str,
    contact_email: &str,
    sent_unix: i64,
) -> Result<bool, String> {
    let res = client
        .get(format!(
            "https://gmail.googleapis.com/gmail/v1/users/me/messages/{}",
            message_id
        ))
        .query(&[("format", "metadata"), ("metadataHeaders", "From")])
        .bearer_auth(token)
        .send()
        .map_err(|e| e.to_string())?;
    if !res.status().is_success() {
        return Ok(false);
    }
    let meta: GmailMessageMeta = res.json().map_err(|e| e.to_string())?;
    let sent_ms = sent_unix * 1000;
    if let Some(ref idate) = meta.internal_date {
        if let Some(ms) = parse_internal_date_ms(idate) {
            if ms <= sent_ms {
                return Ok(false);
            }
        }
    }
    let from = meta
        .payload
        .and_then(|p| p.headers)
        .map(|headers| {
            headers
                .iter()
                .find(|h| h.name.eq_ignore_ascii_case("from"))
                .map(|h| h.value.as_str())
                .unwrap_or("")
                .to_string()
        })
        .unwrap_or_default();
    Ok(is_reply_from_contact(&from, contact_email))
}

fn gmail_has_reply(
    client: &reqwest::blocking::Client,
    token: &str,
    item: &PendingCampaignResponseCheck,
) -> Result<bool, String> {
    let contact = item.contact_email.trim();
    if contact.is_empty() {
        return Ok(false);
    }

    if let Some(ref thread_id) = item.email_gmail_thread_id {
        let res = client
            .get(format!(
                "https://gmail.googleapis.com/gmail/v1/users/me/threads/{}",
                thread_id
            ))
            .query(&[("format", "minimal")])
            .bearer_auth(token)
            .send()
            .map_err(|e| e.to_string())?;
        if res.status().is_success() {
            let thread: GmailThread = res.json().map_err(|e| e.to_string())?;
            if let Some(messages) = thread.messages {
                for msg in messages {
                    if parse_internal_date_ms(&msg.internal_date)
                        .map(|ms| ms > item.email_date_envoi * 1000)
                        .unwrap_or(true)
                        && message_from_contact(
                            client,
                            token,
                            &msg.id,
                            contact,
                            item.email_date_envoi,
                        )?
                    {
                        return Ok(true);
                    }
                }
            }
        }
    }

    let after = gmail_after_date(item.email_date_envoi);
    let q = format!("from:{} after:{}", contact, after);
    let res = client
        .get("https://gmail.googleapis.com/gmail/v1/users/me/messages")
        .query(&[("q", q.as_str()), ("maxResults", "5")])
        .bearer_auth(token)
        .send()
        .map_err(|e| e.to_string())?;
    if !res.status().is_success() {
        return Ok(false);
    }
    let list: GmailMessageList = res.json().map_err(|e| e.to_string())?;
    if let Some(messages) = list.messages {
        for msg in messages {
            if message_from_contact(
                client,
                token,
                &msg.id,
                contact,
                item.email_date_envoi,
            )? {
                return Ok(true);
            }
        }
    }
    Ok(false)
}

fn event_includes_contact(event: &CalendarEvent, contact_email: &str) -> bool {
    let contact = contact_email.trim().to_lowercase();
    if let Some(ref attendees) = event.attendees {
        for a in attendees {
            if a
                .email
                .as_ref()
                .map(|e| e.trim().to_lowercase() == contact)
                .unwrap_or(false)
            {
                return true;
            }
        }
    }
    false
}

fn event_start_after(event: &CalendarEvent, sent_unix: i64) -> bool {
    let Some(ref start) = event.start else {
        return false;
    };
    if let Some(ref dt) = start.date_time {
        if let Ok(parsed) = chrono::DateTime::parse_from_rfc3339(dt) {
            return parsed.timestamp() >= sent_unix;
        }
    }
    if let Some(ref d) = start.date {
        if let Ok(nd) = chrono::NaiveDate::parse_from_str(d, "%Y-%m-%d") {
            let sent_date = chrono::DateTime::from_timestamp(sent_unix, 0)
                .map(|t| t.date_naive())
                .unwrap_or(nd);
            return nd >= sent_date;
        }
    }
    false
}

fn calendar_has_rdv(
    client: &reqwest::blocking::Client,
    token: &str,
    item: &PendingCampaignResponseCheck,
) -> Result<bool, String> {
    let contact = item.contact_email.trim();
    if contact.is_empty() {
        return Ok(false);
    }
    let time_min = chrono::DateTime::from_timestamp(item.email_date_envoi, 0)
        .map(|t| t.to_rfc3339())
        .unwrap_or_else(|| "1970-01-01T00:00:00Z".to_string());

    let res = client
        .get("https://www.googleapis.com/calendar/v3/calendars/primary/events")
        .query(&[
            ("timeMin", time_min.as_str()),
            ("maxResults", "100"),
            ("singleEvents", "true"),
            ("orderBy", "startTime"),
        ])
        .bearer_auth(token)
        .send()
        .map_err(|e| e.to_string())?;
    if !res.status().is_success() {
        let err = res.text().unwrap_or_default();
        if err.contains("403") || err.contains("insufficient") {
            return Err(
                "Accès Agenda refusé : reconnectez Google pour autoriser Google Calendar."
                    .into(),
            );
        }
        return Ok(false);
    }
    let list: CalendarEventList = res.json().map_err(|e| e.to_string())?;
    if let Some(items) = list.items {
        for ev in &items {
            if ev.status.as_deref() == Some("cancelled") {
                continue;
            }
            if event_includes_contact(ev, contact) && event_start_after(ev, item.email_date_envoi) {
                return Ok(true);
            }
        }
    }
    Ok(false)
}

pub fn sync_email_campaign_responses(
    app: &AppHandle,
    pending: Vec<PendingCampaignResponseCheck>,
    mark_response: impl Fn(i64, &str) -> Result<(), String>,
) -> Result<EmailCampaignSyncResult, String> {
    let store = EmailOAuthStore::load(app)?;
    let mut conn = store
        .connection
        .clone()
        .ok_or("Connectez Google dans Paramètres → Email pour la détection automatique.")?;
    if conn.provider != "google" {
        return Err(
            "La détection automatique nécessite un compte Google (Gmail + Agenda).".into(),
        );
    }
    refresh_connection_if_needed(app, &mut conn)?;

    let client = reqwest::blocking::Client::new();
    let mut result = EmailCampaignSyncResult {
        checked: pending.len() as u32,
        mail_detected: 0,
        rdv_detected: 0,
        errors: vec![],
    };

    for item in pending {
        match gmail_has_reply(&client, &conn.access_token, &item) {
            Ok(true) => match mark_response(item.contact_etiquette_id, "mail") {
                Ok(()) => result.mail_detected += 1,
                Err(e) if result.errors.len() < 5 => result.errors.push(e),
                Err(_) => {}
            },
            Ok(false) => {
                match calendar_has_rdv(&client, &conn.access_token, &item) {
                    Ok(true) => match mark_response(item.contact_etiquette_id, "rdv") {
                        Ok(()) => result.rdv_detected += 1,
                        Err(e) if result.errors.len() < 5 => result.errors.push(e),
                        Err(_) => {}
                    },
                    Ok(false) => {}
                    Err(e) if result.errors.len() < 5 => result.errors.push(e),
                    Err(_) => {}
                }
            }
            Err(e) if result.errors.len() < 3 => {
                result.errors.push(format!("Gmail {}: {}", item.contact_email, e));
            }
            Err(_) => {}
        }
    }

    Ok(result)
}
