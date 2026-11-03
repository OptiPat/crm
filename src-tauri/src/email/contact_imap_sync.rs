//! Historique boîte mail IMAP (OVH, Ionos…) d'un contact. Même table que Gmail / Outlook ;
//! le corps est enregistré dès la synchro (pas d'API pour le relire à la demande).
use super::contact_gmail_sync::{
    detect_direction, emit_progress, with_db, ContactGmailSyncResult, ContactMailSyncProgress,
    METADATA_DELAY_MS,
};
use super::imap_mailbox::{imap_contact_query, ImapMailboxReader, IMAP_PROVIDER};
use crate::commands::DbState;
use std::thread;
use std::time::Duration;
use tauri::AppHandle;

/// Échanges listés au plus par contact (en-têtes seuls), plus récents d'abord.
const MAX_HISTORY_MESSAGES: usize = 2_000;
/// Messages lus (corps complet) par appel : le reste au prochain passage.
const BACKFILL_FETCH_PER_CALL: usize = 60;
const LIGHTWEIGHT_FETCH_PER_CALL: usize = 15;
const SNIPPET_CHARS: usize = 200;

fn snippet_of(body: &str) -> Option<String> {
    let flat = body.split_whitespace().collect::<Vec<_>>().join(" ");
    let snippet: String = flat.chars().take(SNIPPET_CHARS).collect();
    (!snippet.is_empty()).then_some(snippet)
}

pub fn sync_contact_imap_history(
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
    let query = imap_contact_query(&contact_email)
        .ok_or_else(|| format!("Adresse email du contact invalide : « {contact_email} »."))?;

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

    let mut reader = ImapMailboxReader::open(app)?;
    let mailbox_email = reader.own_email().trim().to_lowercase();
    // Réception et éléments envoyés : les deux sens de l'échange.
    let listed = reader.search_all_folders(&query, true, MAX_HISTORY_MESSAGES)?;

    let (sync_state, campaign_ids) = with_db(db_state, |db| {
        Ok((
            db.get_contact_mail_sync_state(contact_id)
                .map_err(|e| e.to_string())?,
            db.contact_campaign_gmail_message_ids(contact_id)
                .map_err(|e| e.to_string())?,
        ))
    })?;
    let incremental = sync_state.as_ref().is_some_and(|s| s.backfill_complete);
    let fetch_budget = if lightweight {
        LIGHTWEIGHT_FETCH_PER_CALL
    } else {
        BACKFILL_FETCH_PER_CALL
    };
    let mut max_sent_at = sync_state
        .as_ref()
        .and_then(|s| s.last_message_sent_at)
        .unwrap_or(0);
    let mut result = ContactGmailSyncResult {
        imported: 0,
        skipped: 0,
        scanned: 0,
        incremental,
        complete: false,
    };
    let mut fetched = 0usize;
    let mut budget_exhausted = false;

    for msg in &listed {
        result.scanned += 1;
        if campaign_ids.iter().any(|id| id == &msg.message_id) {
            result.skipped += 1;
            continue;
        }
        let exists = with_db(db_state, |db| {
            db.contact_gmail_message_exists(contact_id, &msg.message_id)
                .map_err(|e| e.to_string())
        })?;
        if exists {
            result.skipped += 1;
            continue;
        }
        if fetched >= fetch_budget {
            budget_exhausted = true;
            break;
        }
        fetched += 1;
        thread::sleep(Duration::from_millis(METADATA_DELAY_MS));
        // Message déplacé ou supprimé depuis la recherche : ignoré.
        let Some(content) = reader.fetch_listed(msg)? else {
            result.skipped += 1;
            continue;
        };
        let direction = detect_direction(&msg.from, &contact_email, &mailbox_email);
        let sent_at = if msg.received_at > 0 {
            msg.received_at
        } else {
            chrono::Utc::now().timestamp()
        };
        max_sent_at = max_sent_at.max(sent_at);
        let subject = Some(if content.subject.is_empty() {
            msg.subject.clone()
        } else {
            content.subject
        })
        .filter(|s| !s.trim().is_empty());
        let body = content.body_text;
        with_db(db_state, |db| {
            db.insert_contact_gmail_message(
                contact_id,
                &msg.message_id,
                Some(msg.thread_id.as_str()),
                &direction,
                subject,
                snippet_of(&body),
                (!body.trim().is_empty()).then_some(body),
                sent_at,
                IMAP_PROVIDER,
                None,
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

    result.complete = !budget_exhausted;
    with_db(db_state, |db| {
        db.upsert_contact_mail_sync_state(
            contact_id,
            max_sent_at,
            true,
            result.complete || incremental,
            None,
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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn snippet_is_flattened_and_capped() {
        assert_eq!(snippet_of("  Bonjour,\n\n  merci  "), Some("Bonjour, merci".into()));
        assert_eq!(snippet_of("x".repeat(500).as_str()).unwrap().chars().count(), SNIPPET_CHARS);
        assert_eq!(snippet_of("   "), None);
    }
}
