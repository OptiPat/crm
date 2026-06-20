//! Détection automatique : réponses Gmail et RDV Google Agenda.

use super::google_api_errors::calendar_access_error;
use super::oauth_send::refresh_connection_if_needed;
use super::oauth_store::EmailOAuthStore;
use crate::database::models::PendingCampaignResponseCheck;
use crate::newsletter::db::is_newsletter_unsubscribe_request;
use serde::Deserialize;
use tauri::AppHandle;

#[derive(Debug, Clone)]
pub struct GmailReplyFound {
    pub message_id: String,
    pub body_text: String,
    pub subject: Option<String>,
}

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
    #[serde(rename = "internalDate", default, deserialize_with = "deserialize_optional_internal_date")]
    internal_date: Option<String>,
}

/// Gmail renvoie `internalDate` en string ou en nombre selon l'endpoint / le format.
fn deserialize_optional_internal_date<'de, D>(deserializer: D) -> Result<Option<String>, D::Error>
where
    D: serde::Deserializer<'de>,
{
    let value: Option<serde_json::Value> = Option::deserialize(deserializer)?;
    Ok(value.and_then(internal_date_value_to_string))
}

fn internal_date_value_to_string(value: serde_json::Value) -> Option<String> {
    match value {
        serde_json::Value::String(s) if !s.is_empty() => Some(s),
        serde_json::Value::Number(n) => n
            .as_i64()
            .or_else(|| n.as_u64().map(|u| u as i64))
            .map(|i| i.to_string()),
        _ => None,
    }
}

#[derive(Debug, Deserialize)]
struct GmailMessageList {
    messages: Option<Vec<GmailMessageRef>>,
}

#[derive(Debug, Deserialize)]
struct GmailMessageMeta {
    #[serde(
        rename = "internalDate",
        default,
        deserialize_with = "deserialize_optional_internal_date"
    )]
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
    #[serde(default)]
    value: String,
}

#[derive(Debug, Deserialize)]
struct CalendarEventList {
    items: Option<Vec<CalendarEvent>>,
    #[serde(rename = "nextPageToken", default)]
    next_page_token: Option<String>,
}

#[derive(Debug, Deserialize)]
struct CalendarEvent {
    #[serde(rename = "start")]
    start: Option<CalendarEventTime>,
    attendees: Option<Vec<CalendarAttendee>>,
    status: Option<String>,
    summary: Option<String>,
    description: Option<String>,
}

const CALENDAR_RDV_MAX_PAGES: u32 = 4;
const CALENDAR_RDV_PAGE_SIZE: &str = "250";

#[derive(Debug, Deserialize)]
struct CalendarEventTime {
    #[serde(rename = "dateTime")]
    date_time: Option<String>,
    date: Option<String>,
}

#[derive(Debug, Deserialize)]
struct CalendarAttendee {
    email: Option<String>,
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

pub(crate) fn email_matches(address_header: &str, contact_email: &str) -> bool {
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

#[derive(Debug, Deserialize)]
struct GmailBodyData {
    #[serde(default)]
    data: Option<String>,
}

#[derive(Debug, Deserialize)]
struct GmailPart {
    #[serde(rename = "mimeType", default)]
    mime_type: Option<String>,
    #[serde(default)]
    body: Option<GmailBodyData>,
    #[serde(default)]
    parts: Option<Vec<GmailPart>>,
    #[serde(default)]
    headers: Option<Vec<GmailHeader>>,
}

fn header_from_part(part: &GmailPart, name: &str) -> Option<String> {
    part.headers.as_ref()?.iter().find(|h| h.name.eq_ignore_ascii_case(name)).map(|h| h.value.clone())
}

#[derive(Debug, Deserialize)]
struct GmailMessageFull {
    #[serde(default)]
    snippet: Option<String>,
    payload: Option<GmailPart>,
}

fn decode_gmail_body_data(data: &str) -> Option<String> {
    use base64::Engine;
    let normalized: String = data
        .chars()
        .map(|c| match c {
            '-' => '+',
            '_' => '/',
            other => other,
        })
        .collect();
    let pad = (4 - normalized.len() % 4) % 4;
    let padded = format!("{}{}", normalized, "=".repeat(pad));
    let bytes = base64::engine::general_purpose::STANDARD
        .decode(padded.as_bytes())
        .ok()?;
    String::from_utf8(bytes).ok()
}

fn looks_like_html_body(s: &str) -> bool {
    let t = s.trim_start();
    t.starts_with('<')
        || t.to_lowercase().contains("<style")
        || t.to_lowercase().contains("<!doctype")
        || t.to_lowercase().contains("<html")
}

fn normalize_email_body_text(s: &str) -> String {
    let trimmed = s.trim();
    if trimmed.is_empty() {
        return String::new();
    }
    if looks_like_html_body(trimmed) {
        super::signature_html::html_to_plain_email(trimmed)
    } else {
        trimmed.to_string()
    }
}

fn extract_text_from_part(part: &GmailPart, plain: &mut Option<String>, html: &mut Option<String>) {
    if let Some(ref nested) = part.parts {
        for p in nested {
            extract_text_from_part(p, plain, html);
        }
        return;
    }
    let mime = part.mime_type.as_deref().unwrap_or("");
    let Some(data) = part.body.as_ref().and_then(|b| b.data.as_deref()) else {
        return;
    };
    let Some(decoded) = decode_gmail_body_data(data) else {
        return;
    };
    if mime.contains("text/plain") {
        let text = normalize_email_body_text(&decoded);
        if !text.is_empty() {
            plain.get_or_insert(text);
        }
    } else if mime.contains("text/html") && html.is_none() {
        *html = Some(super::signature_html::html_to_plain_email(&decoded));
    }
}

pub fn gmail_fetch_message_body_and_subject(
    client: &reqwest::blocking::Client,
    token: &str,
    message_id: &str,
) -> Result<(String, Option<String>), String> {
    let res = client
        .get(format!(
            "https://gmail.googleapis.com/gmail/v1/users/me/messages/{}",
            message_id
        ))
        .query(&[("format", "full")])
        .bearer_auth(token)
        .send()
        .map_err(|e| e.to_string())?;
    if !res.status().is_success() {
        return Err(format!("Gmail message: {}", res.text().unwrap_or_default()));
    }
    let msg: GmailMessageFull = res.json().map_err(|e| e.to_string())?;
    let subject = msg
        .payload
        .as_ref()
        .and_then(|p| header_from_part(p, "Subject"));
    let mut plain = None;
    let mut html = None;
    if let Some(ref payload) = msg.payload {
        extract_text_from_part(payload, &mut plain, &mut html);
    }
    let raw = plain
        .or(html)
        .or(msg.snippet.clone())
        .unwrap_or_default();
    let text = normalize_email_body_text(&raw);
    if text.is_empty() {
        return Ok((
            msg.snippet.unwrap_or_default().trim().to_string(),
            subject,
        ));
    }
    Ok((text, subject))
}

pub fn gmail_fetch_message_body(
    client: &reqwest::blocking::Client,
    token: &str,
    message_id: &str,
) -> Result<String, String> {
    gmail_fetch_message_body_and_subject(client, token, message_id).map(|(body, _)| body)
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

fn gmail_find_reply_message_id(
    client: &reqwest::blocking::Client,
    token: &str,
    item: &PendingCampaignResponseCheck,
) -> Result<Option<String>, String> {
    let contact = item.contact_email.trim();
    if contact.is_empty() {
        return Ok(None);
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
                    let after_sent = msg
                        .internal_date
                        .as_deref()
                        .and_then(parse_internal_date_ms)
                        .map(|ms| ms > item.email_date_envoi * 1000)
                        .unwrap_or(true);
                    if after_sent
                        && message_from_contact(
                            client,
                            token,
                            &msg.id,
                            contact,
                            item.email_date_envoi,
                        )?
                    {
                        return Ok(Some(msg.id));
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
        return Ok(None);
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
                return Ok(Some(msg.id));
            }
        }
    }
    Ok(None)
}

pub fn gmail_find_contact_reply(
    client: &reqwest::blocking::Client,
    token: &str,
    item: &PendingCampaignResponseCheck,
) -> Result<Option<GmailReplyFound>, String> {
    let Some(message_id) = gmail_find_reply_message_id(client, token, item)? else {
        return Ok(None);
    };
    let (body_text, subject) =
        gmail_fetch_message_body_and_subject(client, token, &message_id)?;
    if body_text.trim().is_empty()
        && !is_newsletter_unsubscribe_request(subject.as_deref(), None)
    {
        return Ok(None);
    }
    Ok(Some(GmailReplyFound {
        message_id,
        body_text,
        subject,
    }))
}

fn event_includes_contact(event: &CalendarEvent, contact_email: &str) -> bool {
    let contact = contact_email.trim().to_lowercase();
    if contact.is_empty() {
        return false;
    }
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
    if event
        .summary
        .as_deref()
        .map(|s| s.to_lowercase().contains(&contact))
        .unwrap_or(false)
    {
        return true;
    }
    event
        .description
        .as_deref()
        .map(|s| s.to_lowercase().contains(&contact))
        .unwrap_or(false)
}

fn event_start_unix(event: &CalendarEvent) -> Option<i64> {
    let start = event.start.as_ref()?;
    if let Some(ref dt) = start.date_time {
        if let Ok(parsed) = chrono::DateTime::parse_from_rfc3339(dt) {
            return Some(parsed.timestamp());
        }
    }
    if let Some(ref d) = start.date {
        let nd = chrono::NaiveDate::parse_from_str(d, "%Y-%m-%d").ok()?;
        return nd
            .and_hms_opt(12, 0, 0)
            .map(|ndt| chrono::TimeZone::from_utc_datetime(&chrono::Utc, &ndt).timestamp());
    }
    None
}

fn event_start_after(event: &CalendarEvent, sent_unix: i64) -> bool {
    event_start_unix(event)
        .map(|start| start >= sent_unix)
        .unwrap_or(false)
}

fn calendar_event_matches_rdv(event: &CalendarEvent, contact: &str, sent_unix: i64) -> bool {
    if event.status.as_deref() == Some("cancelled") {
        return false;
    }
    event_includes_contact(event, contact) && event_start_after(event, sent_unix)
}

/// Date de début du prochain RDV Agenda client après l'envoi campagne (unix s).
pub fn find_calendar_rdv_start(
    client: &reqwest::blocking::Client,
    token: &str,
    item: &PendingCampaignResponseCheck,
) -> Result<Option<i64>, String> {
    let contact = item.contact_email.trim();
    if contact.is_empty() {
        return Ok(None);
    }
    let time_min = chrono::DateTime::from_timestamp(item.email_date_envoi, 0)
        .map(|t| t.to_rfc3339())
        .unwrap_or_else(|| "1970-01-01T00:00:00Z".to_string());

    let mut page_token: Option<String> = None;
    for _ in 0..CALENDAR_RDV_MAX_PAGES {
        let mut query: Vec<(&str, &str)> = vec![
            ("timeMin", time_min.as_str()),
            ("maxResults", CALENDAR_RDV_PAGE_SIZE),
            ("singleEvents", "true"),
            ("orderBy", "startTime"),
            ("q", contact),
        ];
        if let Some(ref token) = page_token {
            query.push(("pageToken", token.as_str()));
        }

        let res = client
            .get("https://www.googleapis.com/calendar/v3/calendars/primary/events")
            .query(&query)
            .bearer_auth(token)
            .send()
            .map_err(|e| e.to_string())?;
        if !res.status().is_success() {
            let status = res.status();
            let err = res.text().unwrap_or_default();
            if status == reqwest::StatusCode::FORBIDDEN
                || status == reqwest::StatusCode::UNAUTHORIZED
                || err.to_lowercase().contains("insufficient")
                || err.to_lowercase().contains("accessnotconfigured")
            {
                return Err(calendar_access_error(status, &err));
            }
            return Ok(None);
        }
        let list: CalendarEventList = res.json().map_err(|e| e.to_string())?;
        if let Some(items) = list.items {
            for ev in &items {
                if calendar_event_matches_rdv(ev, contact, item.email_date_envoi) {
                    return Ok(event_start_unix(ev));
                }
            }
        }
        page_token = list.next_page_token;
        if page_token.is_none() {
            break;
        }
    }
    Ok(None)
}

pub fn resolve_campaign_rdv_start(
    app: &AppHandle,
    contact_email: &str,
    email_date_envoi: i64,
) -> Result<Option<i64>, String> {
    let store = EmailOAuthStore::load(app)?;
    let mut conn = store
        .connection
        .clone()
        .ok_or("Connectez Google dans Paramètres → Email.")?;
    if conn.provider != "google" {
        return Ok(None);
    }
    refresh_connection_if_needed(app, &mut conn)?;
    let client = reqwest::blocking::Client::new();
    let item = PendingCampaignResponseCheck {
        contact_etiquette_id: 0,
        contact_email: contact_email.to_string(),
        email_date_envoi,
        email_gmail_thread_id: None,
    };
    find_calendar_rdv_start(&client, &conn.access_token, &item)
}

pub fn sync_email_campaign_responses(
    app: &AppHandle,
    pending: Vec<PendingCampaignResponseCheck>,
    mark_response: impl Fn(
        i64,
        &str,
        Option<&str>,
        Option<&str>,
        Option<&str>,
        Option<i64>,
    ) -> Result<(), String>,
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
        // Agenda avant Gmail : un mail parasite (hors fil campagne) ne doit pas masquer un RDV.
        match find_calendar_rdv_start(&client, &conn.access_token, &item) {
            Ok(Some(rdv_at)) => {
                match mark_response(
                    item.contact_etiquette_id,
                    "rdv",
                    None,
                    None,
                    None,
                    Some(rdv_at),
                ) {
                Ok(()) => result.rdv_detected += 1,
                Err(e) if result.errors.len() < 5 => result.errors.push(e),
                Err(_) => {}
                }
            }
            Ok(None) => match gmail_find_contact_reply(&client, &conn.access_token, &item) {
                Ok(Some(reply)) => match mark_response(
                    item.contact_etiquette_id,
                    "mail",
                    Some(reply.body_text.as_str()),
                    Some(reply.message_id.as_str()),
                    reply.subject.as_deref(),
                    None,
                ) {
                    Ok(()) => result.mail_detected += 1,
                    Err(e) if result.errors.len() < 5 => result.errors.push(e),
                    Err(_) => {}
                },
                Ok(None) => {}
                Err(e) if result.errors.len() < 3 => {
                    result.errors.push(format!("Gmail {}: {}", item.contact_email, e));
                }
                Err(_) => {}
            },
            Err(e) if result.errors.len() < 5 => result.errors.push(e),
            Err(_) => {}
        }
    }

    Ok(result)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_gmail_thread_minimal_without_internal_date() {
        let json = r#"{"messages":[{"id":"msg1","threadId":"thr1"}]}"#;
        let thread: GmailThread = serde_json::from_str(json).expect("thread minimal");
        let msgs = thread.messages.expect("messages");
        assert_eq!(msgs[0].id, "msg1");
        assert!(msgs[0].internal_date.is_none());
    }

    #[test]
    fn parses_gmail_messages_list_ids_only() {
        let json = r#"{"messages":[{"id":"m1","threadId":"t1"}],"resultSizeEstimate":1}"#;
        let list: GmailMessageList = serde_json::from_str(json).expect("list");
        assert_eq!(list.messages.as_ref().unwrap().len(), 1);
    }

    #[test]
    fn parses_internal_date_as_number() {
        let json = r#"{"id":"x","internalDate":1700000000000}"#;
        let msg: GmailMessageRef = serde_json::from_str(json).expect("msg");
        assert_eq!(msg.internal_date.as_deref(), Some("1700000000000"));
    }

    #[test]
    fn event_start_unix_parses_rfc3339() {
        let event: CalendarEvent = serde_json::from_str(
            r#"{"start":{"dateTime":"2026-06-11T14:00:00+02:00"},"status":"confirmed"}"#,
        )
        .expect("event");
        let start = event_start_unix(&event).expect("start");
        assert!(start > 1_700_000_000);
    }

    #[test]
    fn calendar_event_matches_rdv_by_attendee_and_start() {
        let sent = 1_700_000_000_i64;
        let event: CalendarEvent = serde_json::from_str(
            r#"{
                "start": { "dateTime": "2026-06-11T12:00:00Z" },
                "attendees": [ { "email": "client@example.com" } ],
                "status": "confirmed"
            }"#,
        )
        .expect("event");
        assert!(calendar_event_matches_rdv(
            &event,
            "client@example.com",
            sent
        ));
    }

    #[test]
    fn calendar_event_matches_rdv_by_description_email() {
        let sent = 1_700_000_000_i64;
        let event: CalendarEvent = serde_json::from_str(
            r#"{
                "start": { "dateTime": "2026-06-11T12:00:00Z" },
                "description": "Invité : client@example.com",
                "status": "confirmed"
            }"#,
        )
        .expect("event");
        assert!(calendar_event_matches_rdv(
            &event,
            "client@example.com",
            sent
        ));
    }

    #[test]
    fn calendar_event_ignores_cancelled_and_before_send() {
        let sent = 1_800_000_000_i64;
        let cancelled: CalendarEvent = serde_json::from_str(
            r#"{
                "start": { "dateTime": "2026-06-12T12:00:00Z" },
                "attendees": [ { "email": "a@b.com" } ],
                "status": "cancelled"
            }"#,
        )
        .expect("cancelled");
        assert!(!calendar_event_matches_rdv(&cancelled, "a@b.com", sent));

        let early: CalendarEvent = serde_json::from_str(
            r#"{
                "start": { "dateTime": "2026-06-01T12:00:00Z" },
                "attendees": [ { "email": "a@b.com" } ],
                "status": "confirmed"
            }"#,
        )
        .expect("early");
        assert!(!calendar_event_matches_rdv(&early, "a@b.com", sent));
    }
}
