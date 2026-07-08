//! Historique boîte mail Outlook (Microsoft Graph). Même table que Gmail.

use super::contact_gmail_sync::{
    detect_direction, emit_progress, with_db, ContactGmailSyncResult, ContactMailSyncProgress,
    MailAttachmentMeta, METADATA_DELAY_MS,
};
use super::oauth_send::refresh_connection_if_needed;
use super::oauth_store::EmailOAuthStore;
use crate::commands::DbState;
use serde::Deserialize;
use std::sync::Arc;
use std::thread;
use std::time::Duration;
use tauri::AppHandle;

const LIST_PAGE_SIZE: u32 = 50;
const BACKFILL_PAGES_PER_CALL: u32 = 4;
const INCREMENTAL_PAGES_PER_CALL: u32 = 1;

#[derive(Debug, Deserialize)]
struct GraphMessageList {
    value: Vec<GraphMessage>,
    #[serde(rename = "@odata.nextLink", default)]
    next_link: Option<String>,
}

#[derive(Debug, Deserialize)]
struct GraphMessage {
    id: String,
    #[serde(rename = "conversationId", default)]
    conversation_id: Option<String>,
    #[serde(default)]
    subject: Option<String>,
    #[serde(rename = "bodyPreview", default)]
    body_preview: Option<String>,
    #[serde(rename = "receivedDateTime", default)]
    received_date_time: Option<String>,
    #[serde(rename = "sentDateTime", default)]
    sent_date_time: Option<String>,
    #[serde(default)]
    from: Option<GraphEmailAddressWrapper>,
    #[serde(rename = "hasAttachments", default)]
    has_attachments: bool,
}

#[derive(Debug, Deserialize)]
struct GraphEmailAddressWrapper {
    #[serde(rename = "emailAddress", default)]
    email_address: Option<GraphEmailAddress>,
}

#[derive(Debug, Deserialize)]
struct GraphEmailAddress {
    #[serde(default)]
    address: Option<String>,
}

#[derive(Debug, Deserialize)]
struct GraphAttachmentList {
    value: Vec<GraphAttachment>,
}

#[derive(Debug, Deserialize)]
struct GraphAttachment {
    id: String,
    #[serde(default)]
    name: Option<String>,
    #[serde(default)]
    size: Option<u32>,
    #[serde(rename = "contentType", default)]
    content_type: Option<String>,
}

fn graph_search_query(contact_email: &str) -> String {
    let e = contact_email.trim();
    format!("from:{e} OR to:{e}")
}

fn parse_graph_datetime(s: &str) -> Option<i64> {
    chrono::DateTime::parse_from_rfc3339(s)
        .ok()
        .map(|dt| dt.timestamp())
}

fn from_address(msg: &GraphMessage) -> String {
    msg.from
        .as_ref()
        .and_then(|w| w.email_address.as_ref())
        .and_then(|a| a.address.as_ref())
        .map(|s| s.as_str())
        .unwrap_or("")
        .to_string()
}

fn fetch_graph_attachments(
    client: &reqwest::blocking::Client,
    token: &str,
    message_id: &str,
) -> Result<Option<String>, String> {
    let url = format!(
        "https://graph.microsoft.com/v1.0/me/messages/{}/attachments?$select=id,name,size,contentType",
        message_id
    );
    let res = client
        .get(&url)
        .bearer_auth(token)
        .send()
        .map_err(|e| e.to_string())?;
    if !res.status().is_success() {
        return Ok(None);
    }
    let list: GraphAttachmentList = res.json().map_err(|e| e.to_string())?;
    let metas: Vec<MailAttachmentMeta> = list
        .value
        .into_iter()
        .filter(|a| !a.id.is_empty())
        .map(|a| MailAttachmentMeta {
            name: a
                .name
                .filter(|n| !n.trim().is_empty())
                .unwrap_or_else(|| "Pièce jointe".into()),
            size_bytes: a.size,
            attachment_id: Some(a.id),
            mime_type: a.content_type,
        })
        .collect();
    if metas.is_empty() {
        return Ok(None);
    }
    Ok(serde_json::to_string(&metas).ok())
}

fn list_graph_messages(
    client: &reqwest::blocking::Client,
    token: &str,
    search: &str,
    next_link: Option<&str>,
) -> Result<(Vec<GraphMessage>, Option<String>), String> {
    let top = LIST_PAGE_SIZE.to_string();
    let res = if let Some(url) = next_link {
        client.get(url).bearer_auth(token).send()
    } else {
        client
            .get("https://graph.microsoft.com/v1.0/me/messages")
            .header("ConsistencyLevel", "eventual")
            .query(&[
                ("$search", search),
                ("$top", top.as_str()),
                (
                    "$select",
                    "id,conversationId,subject,bodyPreview,receivedDateTime,sentDateTime,from,toRecipients,hasAttachments",
                ),
            ])
            .bearer_auth(token)
            .send()
    }
    .map_err(|e| e.to_string())?;
    if !res.status().is_success() {
        return Err(format!("Outlook liste: {}", res.text().unwrap_or_default()));
    }
    let list: GraphMessageList = res.json().map_err(|e| e.to_string())?;
    Ok((list.value, list.next_link))
}

pub fn sync_contact_outlook_history(
    app: &AppHandle,
    db_state: &DbState,
    contact_id: i64,
) -> Result<ContactGmailSyncResult, String> {
    let contact_email = with_db(db_state, |db| {
        let contact = db.get_contact_by_id(contact_id).map_err(|e| e.to_string())?;
        contact
            .email
            .as_deref()
            .map(str::trim)
            .filter(|s| !s.is_empty())
            .map(|s| s.to_string())
            .ok_or_else(|| "Ce contact n'a pas d'adresse email.".to_string())
    })?;

    let store = EmailOAuthStore::load(app)?;
    let mut conn = store
        .connection
        .clone()
        .ok_or("Connectez Microsoft dans Paramètres → Emails & envois → Connexion pour synchroniser l'historique.")?;
    if conn.provider != "microsoft" {
        return Err("La synchronisation Outlook nécessite un compte Microsoft connecté.".into());
    }
    refresh_connection_if_needed(app, &mut conn)?;
    let mailbox_email = conn.email.trim().to_lowercase();

    let sync_state = with_db(db_state, |db| {
        db.get_contact_mail_sync_state(contact_id)
            .map_err(|e| e.to_string())
    })?;

    let backfill_complete = sync_state
        .as_ref()
        .map(|s| s.backfill_complete)
        .unwrap_or(false);
    let incremental = backfill_complete;
    let pages_per_call = if incremental {
        INCREMENTAL_PAGES_PER_CALL
    } else {
        BACKFILL_PAGES_PER_CALL
    };

    let campaign_ids: Arc<Vec<String>> = Arc::new(with_db(db_state, |db| {
        db.contact_campaign_gmail_message_ids(contact_id)
            .map_err(|e| e.to_string())
    })?);

    let client = reqwest::blocking::Client::new();
    let search = graph_search_query(&contact_email);

    let mut result = ContactGmailSyncResult {
        imported: 0,
        skipped: 0,
        scanned: 0,
        incremental,
        complete: false,
    };
    let mut next_link: Option<String> = sync_state
        .as_ref()
        .and_then(|s| s.list_page_token.clone());
    let mut max_sent_at: i64 = sync_state
        .as_ref()
        .and_then(|s| s.last_message_sent_at)
        .unwrap_or(0);
    let mut pages_done: u32 = 0;
    let mut list_exhausted = false;

    let progress_base = ContactMailSyncProgress {
        contact_id,
        scanned: 0,
        imported: 0,
        skipped: 0,
        phase: "listing".into(),
        done: false,
        error: None,
    };
    emit_progress(app, &progress_base);

    loop {
        if pages_done >= pages_per_call {
            break;
        }
        refresh_connection_if_needed(app, &mut conn)?;
        let token = conn.access_token.clone();
        let (messages, next) = list_graph_messages(
            &client,
            &token,
            &search,
            next_link.as_deref(),
        )?;
        pages_done += 1;
        for msg in messages {
            result.scanned += 1;
            if campaign_ids.iter().any(|id| id == &msg.id) {
                result.skipped += 1;
                continue;
            }
            let exists = with_db(db_state, |db| {
                db.contact_gmail_message_exists(contact_id, &msg.id)
                    .map_err(|e| e.to_string())
            })?;
            if exists {
                result.skipped += 1;
                continue;
            }

            thread::sleep(Duration::from_millis(METADATA_DELAY_MS));
            let from = from_address(&msg);
            let direction = detect_direction(&from, &contact_email, &mailbox_email);
            let sent_at = msg
                .received_date_time
                .as_deref()
                .or(msg.sent_date_time.as_deref())
                .and_then(parse_graph_datetime)
                .unwrap_or_else(|| chrono::Utc::now().timestamp());
            if sent_at > max_sent_at {
                max_sent_at = sent_at;
            }
            let subject = msg.subject.unwrap_or_default();
            let snippet = msg.body_preview.filter(|s| !s.is_empty());
            let attachments_json = if msg.has_attachments {
                fetch_graph_attachments(&client, &token, &msg.id)?
            } else {
                None
            };

            with_db(db_state, |db| {
                db.insert_contact_gmail_message(
                    contact_id,
                    &msg.id,
                    msg.conversation_id.as_deref(),
                    &direction,
                    if subject.is_empty() {
                        None
                    } else {
                        Some(subject)
                    },
                    snippet,
                    None,
                    sent_at,
                    "microsoft",
                    attachments_json.as_deref(),
                )
                .map_err(|e| e.to_string())
            })?;
            result.imported += 1;
        }
        next_link = next;
        if next_link.is_none() {
            list_exhausted = true;
            break;
        }
    }

    let backfill_done = list_exhausted && !incremental;
    result.complete = if incremental {
        list_exhausted
    } else {
        backfill_done
    };

    with_db(db_state, |db| {
        db.upsert_contact_mail_sync_state(
            contact_id,
            max_sent_at,
            backfill_done || incremental,
            backfill_done,
            if result.complete {
                None
            } else {
                next_link.as_deref()
            },
        )
        .map_err(|e| e.to_string())
    })?;

    emit_progress(
        app,
        &ContactMailSyncProgress {
            scanned: result.scanned,
            skipped: result.skipped,
            imported: result.imported,
            phase: "done".into(),
            done: true,
            ..progress_base
        },
    );

    Ok(result)
}
