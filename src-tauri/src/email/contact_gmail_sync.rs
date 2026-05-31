//! Synchronisation de l'historique Gmail d'un contact (échanges réels, hors campagnes CRM seules).

use super::oauth_send::refresh_connection_if_needed;
use super::oauth_store::EmailOAuthStore;
use super::response_sync::email_matches;
use crate::database::Database;
use serde::Deserialize;
use tauri::AppHandle;

const MAX_MESSAGES_PER_SYNC: u32 = 500;
const LIST_PAGE_SIZE: u32 = 100;

#[derive(Debug, Clone, serde::Serialize)]
pub struct ContactGmailSyncResult {
    pub imported: u32,
    pub skipped: u32,
    pub scanned: u32,
}

#[derive(Debug, Deserialize)]
struct GmailListResponse {
    messages: Option<Vec<GmailIdRef>>,
    #[serde(rename = "nextPageToken", default)]
    next_page_token: Option<String>,
}

#[derive(Debug, Deserialize)]
struct GmailIdRef {
    id: String,
    #[serde(rename = "threadId", default)]
    thread_id: Option<String>,
}

#[derive(Debug, Deserialize)]
struct GmailMessageMeta {
    #[serde(rename = "threadId", default)]
    thread_id: Option<String>,
    #[serde(rename = "internalDate", default)]
    internal_date: Option<String>,
    #[serde(default)]
    snippet: Option<String>,
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

fn parse_internal_date_ms(internal_date: &str) -> Option<i64> {
    internal_date
        .parse::<i64>()
        .ok()
        .map(|ms| ms / 1000)
}

fn header_value<'a>(headers: Option<&'a [GmailHeader]>, name: &str) -> String {
    headers
        .and_then(|hs| {
            hs.iter()
                .find(|h| h.name.eq_ignore_ascii_case(name))
                .map(|h| h.value.trim().to_string())
        })
        .unwrap_or_default()
}

fn gmail_query_for_contact(contact_email: &str) -> String {
    let email = contact_email.trim();
    let quoted = if email.contains(' ') || email.contains('"') {
        format!("\"{}\"", email.replace('"', "\\\""))
    } else {
        email.to_string()
    };
    format!("(from:{quoted} OR to:{quoted}) newer_than:5y -in:spam -in:trash")
}

fn detect_direction(from: &str, contact_email: &str, mailbox_email: &str) -> String {
    if email_matches(from, contact_email) {
        "inbound".into()
    } else if email_matches(from, mailbox_email) {
        "outbound".into()
    } else {
        "unknown".into()
    }
}

fn fetch_message_metadata(
    client: &reqwest::blocking::Client,
    token: &str,
    message_id: &str,
) -> Result<GmailMessageMeta, String> {
    let res = client
        .get(format!(
            "https://gmail.googleapis.com/gmail/v1/users/me/messages/{}",
            message_id
        ))
        .query(&[
            ("format", "metadata"),
            ("metadataHeaders", "From"),
            ("metadataHeaders", "To"),
            ("metadataHeaders", "Subject"),
        ])
        .bearer_auth(token)
        .send()
        .map_err(|e| e.to_string())?;
    if !res.status().is_success() {
        return Err(format!(
            "Gmail métadonnées: {}",
            res.text().unwrap_or_default()
        ));
    }
    res.json().map_err(|e| e.to_string())
}

fn list_message_ids(
    client: &reqwest::blocking::Client,
    token: &str,
    q: &str,
    page_token: Option<&str>,
) -> Result<(Vec<GmailIdRef>, Option<String>), String> {
    let mut query: Vec<(&str, String)> = vec![
        ("q", q.to_string()),
        ("maxResults", LIST_PAGE_SIZE.to_string()),
    ];
    if let Some(pt) = page_token {
        query.push(("pageToken", pt.to_string()));
    }
    let res = client
        .get("https://gmail.googleapis.com/gmail/v1/users/me/messages")
        .query(&query.iter().map(|(k, v)| (*k, v.as_str())).collect::<Vec<_>>())
        .bearer_auth(token)
        .send()
        .map_err(|e| e.to_string())?;
    if !res.status().is_success() {
        return Err(format!("Gmail liste: {}", res.text().unwrap_or_default()));
    }
    let list: GmailListResponse = res.json().map_err(|e| e.to_string())?;
    Ok((
        list.messages.unwrap_or_default(),
        list.next_page_token,
    ))
}

pub fn sync_contact_gmail_history(
    app: &AppHandle,
    database: &Database,
    contact_id: i64,
) -> Result<ContactGmailSyncResult, String> {
    let contact = database
        .get_contact_by_id(contact_id)
        .map_err(|e| e.to_string())?;
    let contact_email = contact
        .email
        .as_deref()
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .ok_or("Ce contact n'a pas d'adresse email.")?
        .to_string();

    let store = EmailOAuthStore::load(app)?;
    let mut conn = store
        .connection
        .clone()
        .ok_or("Connectez Google dans Paramètres → Email pour synchroniser l'historique Gmail.")?;
    if conn.provider != "google" {
        return Err(
            "La synchronisation Gmail nécessite un compte Google connecté.".into(),
        );
    }
    refresh_connection_if_needed(app, &mut conn)?;
    let mailbox_email = conn.email.trim().to_lowercase();
    let token = conn.access_token.clone();

    let client = reqwest::blocking::Client::new();
    let q = gmail_query_for_contact(&contact_email);

    let mut result = ContactGmailSyncResult {
        imported: 0,
        skipped: 0,
        scanned: 0,
    };
    let mut page_token: Option<String> = None;

    loop {
        let (ids, next) = list_message_ids(
            &client,
            &token,
            &q,
            page_token.as_deref(),
        )?;
        for item in ids {
            if result.scanned >= MAX_MESSAGES_PER_SYNC {
                break;
            }
            result.scanned += 1;
            if database
                .contact_gmail_message_exists(contact_id, &item.id)
                .map_err(|e| e.to_string())?
            {
                result.skipped += 1;
                continue;
            }
            let meta = fetch_message_metadata(&client, &token, &item.id)?;
            let headers = meta.payload.as_ref().and_then(|p| p.headers.as_deref());
            let from = header_value(headers, "From");
            let subject = header_value(headers, "Subject");
            let direction = detect_direction(&from, &contact_email, &mailbox_email);
            let sent_at = meta
                .internal_date
                .as_deref()
                .and_then(parse_internal_date_ms)
                .unwrap_or_else(|| chrono::Utc::now().timestamp());
            let snippet = meta.snippet.filter(|s| !s.is_empty());
            let body_text = snippet.clone();

            database
                .insert_contact_gmail_message(
                    contact_id,
                    &item.id,
                    item.thread_id.or(meta.thread_id).as_deref(),
                    &direction,
                    if subject.is_empty() {
                        None
                    } else {
                        Some(subject)
                    },
                    snippet,
                    body_text,
                    sent_at,
                )
                .map_err(|e| e.to_string())?;
            result.imported += 1;
        }
        page_token = next;
        if page_token.is_none() || result.scanned >= MAX_MESSAGES_PER_SYNC {
            break;
        }
    }

    Ok(result)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn gmail_query_includes_contact_and_recency() {
        let q = gmail_query_for_contact("alice@example.com");
        assert!(q.contains("from:alice@example.com"));
        assert!(q.contains("to:alice@example.com"));
        assert!(q.contains("newer_than:5y"));
    }

    #[test]
    fn direction_from_contact_is_inbound() {
        assert_eq!(
            detect_direction(
                "Alice <alice@example.com>",
                "alice@example.com",
                "cgp@cabinet.fr"
            ),
            "inbound"
        );
    }

    #[test]
    fn direction_from_mailbox_is_outbound() {
        assert_eq!(
            detect_direction(
                "CGP <cgp@cabinet.fr>",
                "alice@example.com",
                "cgp@cabinet.fr"
            ),
            "outbound"
        );
    }
}
