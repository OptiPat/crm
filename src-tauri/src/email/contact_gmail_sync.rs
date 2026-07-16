//! Historique boîte mail par contact (Gmail). Indépendant de `response_sync` (campagnes / en attente de réponse).

use super::oauth_send::refresh_connection_if_needed;
use super::oauth_store::EmailOAuthStore;
use super::response_sync::{email_matches, gmail_fetch_message_body};
use crate::commands::DbState;
use crate::database::Database;
use serde::{Deserialize, Serialize};
use std::sync::Arc;
use std::thread;
use std::time::Duration;
use tauri::{AppHandle, Emitter};

/// Pages Gmail listées par appel (50 msgs max / page API).
const LIST_PAGE_SIZE: u32 = 50;
/// Backfill : plusieurs pages par invocation, reprise auto jusqu'à épuisement.
const BACKFILL_PAGES_PER_CALL: u32 = 4;
/// Incrémental : une page par invocation.
const INCREMENTAL_PAGES_PER_CALL: u32 = 1;
/// Pause entre appels métadonnées Gmail.
pub(crate) const METADATA_DELAY_MS: u64 = 100;

#[derive(Debug, Clone, Serialize)]
pub struct ContactGmailSyncResult {
    pub imported: u32,
    pub skipped: u32,
    pub scanned: u32,
    pub incremental: bool,
    /// Plus aucune page Gmail à parcourir (backfill terminé + incrémental à jour).
    pub complete: bool,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ContactMailSyncProgress {
    pub contact_id: i64,
    pub scanned: u32,
    pub imported: u32,
    pub skipped: u32,
    pub phase: String,
    pub done: bool,
    pub error: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MailAttachmentMeta {
    pub name: String,
    pub size_bytes: Option<u32>,
    /// ID Gmail `users.messages.attachments.get` (absent si métadonnées anciennes).
    #[serde(skip_serializing_if = "Option::is_none")]
    pub attachment_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub mime_type: Option<String>,
}

#[derive(Debug, Deserialize)]
struct GmailListResponse {
    messages: Option<Vec<GmailIdRef>>,
    #[serde(rename = "nextPageToken", default)]
    next_page_token: Option<String>,
}

#[derive(Debug, Deserialize)]
pub(crate) struct GmailIdRef {
    pub(crate) id: String,
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
    #[serde(rename = "mimeType", default)]
    mime_type: Option<String>,
    #[serde(default)]
    filename: Option<String>,
    #[serde(default)]
    body: Option<GmailPartBodyMeta>,
    #[serde(default)]
    parts: Option<Vec<GmailPartMeta>>,
}

#[derive(Debug, Deserialize)]
struct GmailHeader {
    name: String,
    #[serde(default)]
    value: String,
}

#[derive(Debug, Deserialize)]
struct GmailPartMeta {
    #[serde(default)]
    filename: Option<String>,
    #[serde(rename = "mimeType", default)]
    mime_type: Option<String>,
    #[serde(default)]
    headers: Option<Vec<GmailHeader>>,
    #[serde(default)]
    body: Option<GmailPartBodyMeta>,
    #[serde(default)]
    parts: Option<Vec<GmailPartMeta>>,
}

#[derive(Debug, Clone, Deserialize)]
struct GmailPartBodyMeta {
    #[serde(default)]
    size: Option<u32>,
    #[serde(rename = "attachmentId", default)]
    attachment_id: Option<String>,
}

pub(crate) fn emit_progress(app: &AppHandle, progress: &ContactMailSyncProgress) {
    let _ = app.emit("contact-mail-sync-progress", progress);
}

fn parse_internal_date_sec(internal_date: &str) -> Option<i64> {
    internal_date.parse::<i64>().ok().map(|ms| ms / 1000)
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

fn gmail_after_unix(unix: i64) -> String {
    use chrono::{TimeZone, Utc};
    let dt = Utc.timestamp_opt(unix, 0).single().unwrap_or_else(Utc::now);
    dt.format("%Y/%m/%d").to_string()
}

fn quote_email_for_query(email: &str) -> String {
    let email = email.trim();
    if email.contains(' ') || email.contains('"') {
        format!("\"{}\"", email.replace('"', "\\\""))
    } else {
        email.to_string()
    }
}

pub fn gmail_query_for_contact(contact_email: &str, after_ts: Option<i64>) -> String {
    let quoted = quote_email_for_query(contact_email);
    let base =
        format!("(from:{quoted} OR to:{quoted} OR cc:{quoted}) newer_than:5y -in:spam -in:trash");
    match after_ts {
        Some(ts) if ts > 0 => format!("{base} after:{}", gmail_after_unix(ts)),
        _ => base,
    }
}

pub(crate) fn detect_direction(from: &str, contact_email: &str, mailbox_email: &str) -> String {
    if email_matches(from, contact_email) {
        "inbound".into()
    } else if email_matches(from, mailbox_email) {
        "outbound".into()
    } else {
        "unknown".into()
    }
}

fn is_likely_inline_signature_image(part: &GmailPartMeta) -> bool {
    let mime = part.mime_type.as_deref().unwrap_or("");
    if !mime.starts_with("image/") {
        return false;
    }
    let size = part.body.as_ref().and_then(|b| b.size).unwrap_or(0);
    let filename = part.filename.as_deref().unwrap_or("").trim();
    filename.is_empty() && size < 120_000
}

fn part_content_disposition(part: &GmailPartMeta) -> Option<String> {
    part.headers.as_ref().and_then(|hs| {
        hs.iter()
            .find(|h| h.name.eq_ignore_ascii_case("Content-Disposition"))
            .map(|h| h.value.to_lowercase())
    })
}

fn is_attachment_part(part: &GmailPartMeta) -> bool {
    if part
        .body
        .as_ref()
        .and_then(|b| b.attachment_id.as_ref())
        .is_some()
    {
        if is_likely_inline_signature_image(part) {
            return false;
        }
        if let Some(disp) = part_content_disposition(part) {
            if disp.contains("inline") && !disp.contains("attachment") {
                let filename = part.filename.as_deref().unwrap_or("").trim();
                if filename.is_empty() {
                    return false;
                }
            }
        }
        return true;
    }
    let filename = part.filename.as_deref().unwrap_or("").trim();
    if filename.is_empty() {
        return false;
    }
    let mime = part.mime_type.as_deref().unwrap_or("");
    if mime.starts_with("multipart/") || mime.starts_with("text/") {
        return false;
    }
    if let Some(disp) = part_content_disposition(part) {
        return disp.contains("attachment");
    }
    mime.starts_with("application/")
}

fn collect_attachments(part: &GmailPartMeta, out: &mut Vec<MailAttachmentMeta>) {
    if let Some(ref nested) = part.parts {
        for p in nested {
            collect_attachments(p, out);
        }
    }
    if !is_attachment_part(part) {
        return;
    }
    let filename = part.filename.as_deref().unwrap_or("").trim();
    let name = if filename.is_empty() {
        part.mime_type
            .as_deref()
            .unwrap_or("Pièce jointe")
            .to_string()
    } else {
        filename.to_string()
    };
    let attachment_id = part.body.as_ref().and_then(|b| b.attachment_id.clone());
    if attachment_id.is_none() {
        return;
    }
    if out.iter().any(|a| a.attachment_id == attachment_id) {
        return;
    }
    out.push(MailAttachmentMeta {
        name,
        size_bytes: part.body.as_ref().and_then(|b| b.size),
        attachment_id,
        mime_type: part.mime_type.clone(),
    });
}

fn attachments_from_payload(payload: Option<&GmailPayload>) -> Option<String> {
    let payload = payload?;
    let mut list = Vec::new();
    let root = GmailPartMeta {
        filename: payload.filename.clone(),
        mime_type: payload.mime_type.clone(),
        headers: None,
        body: payload.body.clone(),
        parts: None,
    };
    collect_attachments(&root, &mut list);
    if let Some(ref parts) = payload.parts {
        for p in parts {
            collect_attachments(p, &mut list);
        }
    }
    if list.is_empty() {
        return None;
    }
    serde_json::to_string(&list).ok()
}

fn gmail_get(
    client: &reqwest::blocking::Client,
    token: &str,
    url: &str,
) -> Result<reqwest::blocking::Response, String> {
    let mut attempts = 0u32;
    loop {
        let res = client
            .get(url)
            .bearer_auth(token)
            .send()
            .map_err(|e| e.to_string())?;
        if res.status().as_u16() == 429 && attempts < 4 {
            attempts += 1;
            let wait = res
                .headers()
                .get("retry-after")
                .and_then(|v| v.to_str().ok())
                .and_then(|s| s.parse::<u64>().ok())
                .unwrap_or(2u64.saturating_pow(attempts));
            thread::sleep(Duration::from_secs(wait.min(30)));
            continue;
        }
        return Ok(res);
    }
}

fn fetch_message_metadata(
    client: &reqwest::blocking::Client,
    token: &str,
    message_id: &str,
) -> Result<GmailMessageMeta, String> {
    let url = format!(
        "https://gmail.googleapis.com/gmail/v1/users/me/messages/{}?format=full",
        message_id
    );
    let res = gmail_get(client, token, &url)?;
    if !res.status().is_success() {
        return Err(format!(
            "Gmail métadonnées: {}",
            res.text().unwrap_or_default()
        ));
    }
    res.json().map_err(|e| e.to_string())
}

pub(crate) fn list_message_ids(
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
    let url = "https://gmail.googleapis.com/gmail/v1/users/me/messages";
    let res = client
        .get(url)
        .query(
            &query
                .iter()
                .map(|(k, v)| (*k, v.as_str()))
                .collect::<Vec<_>>(),
        )
        .bearer_auth(token)
        .send()
        .map_err(|e| e.to_string())?;
    let res = if res.status().as_u16() == 429 {
        thread::sleep(Duration::from_secs(2));
        client
            .get(url)
            .query(
                &query
                    .iter()
                    .map(|(k, v)| (*k, v.as_str()))
                    .collect::<Vec<_>>(),
            )
            .bearer_auth(token)
            .send()
            .map_err(|e| e.to_string())?
    } else {
        res
    };
    if !res.status().is_success() {
        return Err(format!("Gmail liste: {}", res.text().unwrap_or_default()));
    }
    let list: GmailListResponse = res.json().map_err(|e| e.to_string())?;
    Ok((list.messages.unwrap_or_default(), list.next_page_token))
}

pub(crate) fn with_db<T>(
    db_state: &DbState,
    f: impl FnOnce(&Database) -> Result<T, String>,
) -> Result<T, String> {
    let guard = db_state.lock().map_err(|e| e.to_string())?;
    let database = guard.as_ref().ok_or("Database not initialized")?;
    f(database)
}

/// Point d’entrée sync boîte mail (Gmail ou Outlook selon le compte connecté).
pub fn sync_contact_mail_history(
    app: &AppHandle,
    db_state: &DbState,
    contact_id: i64,
    lightweight: bool,
) -> Result<ContactGmailSyncResult, String> {
    let store = EmailOAuthStore::load(app)?;
    let provider = store
        .connection
        .as_ref()
        .map(|c| c.provider.clone())
        .unwrap_or_default();
    if provider == "microsoft" {
        return crate::email::contact_outlook_sync::sync_contact_outlook_history(
            app,
            db_state,
            contact_id,
            lightweight,
        );
    }
    sync_contact_gmail_history_google(app, db_state, contact_id, lightweight)
}

fn sync_contact_gmail_history_google(
    app: &AppHandle,
    db_state: &DbState,
    contact_id: i64,
    lightweight: bool,
) -> Result<ContactGmailSyncResult, String> {
    let contact_email = with_db(db_state, |db| {
        let contact = db
            .get_contact_by_id(contact_id)
            .map_err(|e| e.to_string())?;
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
        .ok_or("Connectez Google dans Paramètres → Emails & envois → Connexion pour synchroniser l'historique.")?;
    if conn.provider != "google" {
        return Err("La synchronisation nécessite un compte Google connecté (Gmail).".into());
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
    let after_ts = if incremental {
        sync_state
            .as_ref()
            .and_then(|s| s.last_message_sent_at)
            .map(|t| t.saturating_sub(86400))
    } else {
        None
    };
    let pages_per_call = if incremental {
        INCREMENTAL_PAGES_PER_CALL
    } else if lightweight {
        1
    } else {
        BACKFILL_PAGES_PER_CALL
    };

    let campaign_ids: Arc<Vec<String>> = Arc::new(with_db(db_state, |db| {
        db.contact_campaign_gmail_message_ids(contact_id)
            .map_err(|e| e.to_string())
    })?);

    let client = reqwest::blocking::Client::new();
    let q = gmail_query_for_contact(&contact_email, after_ts);

    let mut result = ContactGmailSyncResult {
        imported: 0,
        skipped: 0,
        scanned: 0,
        incremental,
        complete: false,
    };
    let mut page_token: Option<String> =
        sync_state.as_ref().and_then(|s| s.list_page_token.clone());
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
        let (ids, next) = list_message_ids(&client, &token, &q, page_token.as_deref())?;
        pages_done += 1;
        for item in ids {
            result.scanned += 1;

            if campaign_ids.iter().any(|id| id == &item.id) {
                result.skipped += 1;
                emit_progress(
                    app,
                    &ContactMailSyncProgress {
                        scanned: result.scanned,
                        skipped: result.skipped,
                        imported: result.imported,
                        phase: "importing".into(),
                        ..progress_base.clone()
                    },
                );
                continue;
            }

            let exists = with_db(db_state, |db| {
                db.contact_gmail_message_exists(contact_id, &item.id)
                    .map_err(|e| e.to_string())
            })?;
            if exists {
                let needs_att = with_db(db_state, |db| {
                    let row_id = db
                        .contact_gmail_message_row_id(contact_id, &item.id)
                        .map_err(|e| e.to_string())?;
                    Ok(row_id)
                })?;
                if let Some(row_id) = needs_att {
                    let existing = with_db(db_state, |db| {
                        db.get_contact_gmail_message_by_id(row_id)
                            .map(|r| r.attachments_json)
                            .map_err(|e| e.to_string())
                    })?;
                    if attachments_json_needs_refresh(existing.as_deref()) {
                        thread::sleep(Duration::from_millis(METADATA_DELAY_MS));
                        if let Ok(meta) = fetch_message_metadata(&client, &token, &item.id) {
                            if let Some(att) = attachments_from_payload(meta.payload.as_ref()) {
                                let _ = with_db(db_state, |db| {
                                    db.update_contact_gmail_message_attachments(row_id, &att)
                                        .map_err(|e| e.to_string())
                                });
                            }
                        }
                    }
                }
                result.skipped += 1;
                emit_progress(
                    app,
                    &ContactMailSyncProgress {
                        scanned: result.scanned,
                        skipped: result.skipped,
                        imported: result.imported,
                        phase: "importing".into(),
                        ..progress_base.clone()
                    },
                );
                continue;
            }

            thread::sleep(Duration::from_millis(METADATA_DELAY_MS));
            let meta = fetch_message_metadata(&client, &token, &item.id)?;
            let headers = meta.payload.as_ref().and_then(|p| p.headers.as_deref());
            let from = header_value(headers, "From");
            let subject = header_value(headers, "Subject");
            let direction = detect_direction(&from, &contact_email, &mailbox_email);
            let sent_at = meta
                .internal_date
                .as_deref()
                .and_then(parse_internal_date_sec)
                .unwrap_or_else(|| chrono::Utc::now().timestamp());
            if sent_at > max_sent_at {
                max_sent_at = sent_at;
            }
            let snippet = meta.snippet.filter(|s| !s.is_empty());
            let attachments_json = attachments_from_payload(meta.payload.as_ref());

            with_db(db_state, |db| {
                db.insert_contact_gmail_message(
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
                    None,
                    sent_at,
                    "google",
                    attachments_json.as_deref(),
                )
                .map_err(|e| e.to_string())
            })?;
            result.imported += 1;

            emit_progress(
                app,
                &ContactMailSyncProgress {
                    scanned: result.scanned,
                    skipped: result.skipped,
                    imported: result.imported,
                    phase: "importing".into(),
                    ..progress_base.clone()
                },
            );
        }
        page_token = next;
        if page_token.is_none() {
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
                page_token.as_deref()
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

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FetchedContactMailBody {
    pub body: String,
    pub attachments_json: Option<String>,
}

pub fn attachments_json_needs_refresh(json: Option<&str>) -> bool {
    let Some(s) = json else { return true };
    let trimmed = s.trim();
    if trimmed.is_empty() || trimmed == "[]" {
        return true;
    }
    let Ok(list) = serde_json::from_str::<Vec<MailAttachmentMeta>>(trimmed) else {
        return true;
    };
    list.is_empty()
        || list.iter().all(|a| {
            a.attachment_id
                .as_ref()
                .map(|x| x.trim().is_empty())
                .unwrap_or(true)
        })
}

pub fn fetch_contact_gmail_message_body(
    app: &AppHandle,
    db_state: &DbState,
    message_row_id: i64,
) -> Result<FetchedContactMailBody, String> {
    let (gmail_id, existing_att) = with_db(db_state, |db| {
        let row = db
            .get_contact_gmail_message_by_id(message_row_id)
            .map_err(|e| e.to_string())?;
        Ok((row.gmail_message_id, row.attachments_json))
    })?;

    let store = EmailOAuthStore::load(app)?;
    let mut conn = store
        .connection
        .clone()
        .ok_or("Connectez Google dans Paramètres → Emails & envois → Connexion.")?;
    if conn.provider != "google" {
        return Err("Compte Google requis.".into());
    }
    refresh_connection_if_needed(app, &mut conn)?;

    let client = reqwest::blocking::Client::new();
    let token = conn.access_token.clone();
    let meta = fetch_message_metadata(&client, &token, &gmail_id)?;
    let fresh_att = attachments_from_payload(meta.payload.as_ref());
    let attachments_json = match fresh_att {
        Some(ref s) if !s.trim().is_empty() && s != "[]" => fresh_att,
        _ => existing_att,
    };
    let body = gmail_fetch_message_body(&client, &token, &gmail_id)?;

    with_db(db_state, |db| {
        db.update_contact_gmail_message_body(message_row_id, &body)
            .map_err(|e| e.to_string())?;
        if let Some(ref att) = attachments_json {
            if !att.trim().is_empty() && att != "[]" {
                db.update_contact_gmail_message_attachments(message_row_id, att)
                    .map_err(|e| e.to_string())?;
            }
        }
        Ok(())
    })?;

    Ok(FetchedContactMailBody {
        body,
        attachments_json,
    })
}

#[derive(Debug, Deserialize)]
struct GmailAttachmentBody {
    data: String,
}

fn sanitize_attachment_filename(name: &str) -> String {
    let base = name.trim();
    let safe: String = base
        .chars()
        .map(|c| {
            if c.is_ascii_alphanumeric() || c == '.' || c == '-' || c == '_' {
                c
            } else {
                '_'
            }
        })
        .collect();
    if safe.is_empty() {
        "piece_jointe".into()
    } else {
        safe
    }
}

pub fn open_contact_mail_attachment(
    app: &AppHandle,
    db_state: &DbState,
    message_row_id: i64,
    attachment_id: String,
) -> Result<(), String> {
    use base64::engine::general_purpose::{STANDARD, URL_SAFE, URL_SAFE_NO_PAD};
    use base64::Engine;

    let row = with_db(db_state, |db| {
        db.get_contact_gmail_message_by_id(message_row_id)
            .map_err(|e| e.to_string())
    })?;

    let att_id = attachment_id.trim();
    if att_id.is_empty() {
        return Err("Pièce jointe introuvable (resynchronisez le message).".into());
    }

    let file_name = row
        .attachments_json
        .as_deref()
        .and_then(|json| serde_json::from_str::<Vec<MailAttachmentMeta>>(json).ok())
        .and_then(|list| {
            list.into_iter()
                .find(|a| a.attachment_id.as_deref() == Some(att_id))
                .map(|a| a.name)
        })
        .unwrap_or_else(|| "piece_jointe".to_string());

    let store = EmailOAuthStore::load(app)?;
    let mut oauth = store
        .connection
        .clone()
        .ok_or("Connectez un compte email dans Paramètres → Emails & envois → Connexion.")?;
    refresh_connection_if_needed(app, &mut oauth)?;
    let client = reqwest::blocking::Client::new();

    let bytes = if row.provider == "microsoft" {
        let url = format!(
            "https://graph.microsoft.com/v1.0/me/messages/{}/attachments/{}/$value",
            row.gmail_message_id, att_id
        );
        let res = client
            .get(&url)
            .bearer_auth(&oauth.access_token)
            .send()
            .map_err(|e| e.to_string())?;
        if !res.status().is_success() {
            return Err(format!(
                "Outlook pièce jointe: {}",
                res.text().unwrap_or_default()
            ));
        }
        res.bytes().map_err(|e| e.to_string())?.to_vec()
    } else {
        let url = format!(
            "https://gmail.googleapis.com/gmail/v1/users/me/messages/{}/attachments/{}",
            row.gmail_message_id, att_id
        );
        let res = gmail_get(&client, &oauth.access_token, &url)?;
        if !res.status().is_success() {
            return Err(format!(
                "Gmail pièce jointe: {}",
                res.text().unwrap_or_default()
            ));
        }
        let body: GmailAttachmentBody = res.json().map_err(|e| e.to_string())?;
        URL_SAFE_NO_PAD
            .decode(body.data.as_bytes())
            .or_else(|_| URL_SAFE.decode(body.data.as_bytes()))
            .or_else(|_| STANDARD.decode(body.data.as_bytes()))
            .map_err(|e| format!("Décodage pièce jointe: {}", e))?
    };

    let dir = std::env::temp_dir().join("patrimoine-crm-attachments");
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    let path = dir.join(sanitize_attachment_filename(&file_name));
    std::fs::write(&path, &bytes).map_err(|e| e.to_string())?;
    crate::system_commands::open_path_with_system_default(&path)
        .map_err(|e| format!("Ouverture du fichier: {}", e))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn gmail_query_includes_contact_and_recency() {
        let q = gmail_query_for_contact("alice@example.com", None);
        assert!(q.contains("from:alice@example.com"));
        assert!(q.contains("newer_than:5y"));
        assert!(q.contains("cc:alice@example.com"));
    }

    #[test]
    fn gmail_query_incremental_adds_after() {
        let q = gmail_query_for_contact("alice@example.com", Some(1_700_000_000));
        assert!(q.contains("after:"));
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
}
