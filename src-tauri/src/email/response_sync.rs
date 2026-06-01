//! Détection automatique : réponses Gmail et RDV Google Agenda.

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
    #[serde(rename = "threadId", default)]
    thread_id: Option<String>,
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
    mark_response: impl Fn(i64, &str, Option<&str>, Option<&str>, Option<&str>) -> Result<(), String>,
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
        match gmail_find_contact_reply(&client, &conn.access_token, &item) {
            Ok(Some(reply)) => {
                match mark_response(
                    item.contact_etiquette_id,
                    "mail",
                    Some(reply.body_text.as_str()),
                    Some(reply.message_id.as_str()),
                    reply.subject.as_deref(),
                ) {
                    Ok(()) => result.mail_detected += 1,
                    Err(e) if result.errors.len() < 5 => result.errors.push(e),
                    Err(_) => {}
                }
            }
            Ok(None) => {
                match calendar_has_rdv(&client, &conn.access_token, &item) {
                    Ok(true) => match mark_response(item.contact_etiquette_id, "rdv", None, None, None) {
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
}
