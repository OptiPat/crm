//! Scan Gmail / Outlook des mails Stellium Box Placement (no-reply@stellium.fr).

use super::contact_gmail_sync::{list_message_ids, with_db};
use super::oauth_send::refresh_connection_if_needed;
use super::oauth_store::EmailOAuthStore;
use super::response_sync::gmail_fetch_message_body_and_subject;
use super::response_sync_outlook::outlook_fetch_message_body_and_subject;
use crate::commands::DbState;
use crate::database::placement_operations::{
    map_stellium_label_to_operation_type, placement_operation_eligible_for_client_email,
    STATUS_CONFORME, STATUS_NON_CONFORME,
};
use serde::{Deserialize, Serialize};
use std::collections::HashSet;
use std::sync::Mutex;
use tauri::AppHandle;

const GMAIL_FROM: &str = "no-reply@stellium.fr";
const GMAIL_QUERY_RECENCY_DAYS: u32 = 120;
const SCAN_MAX_MESSAGE_IDS: usize = 100;
const BOX_SCAN_STATE_KEY: &str = "box_placement_scan_v1";
static BOX_SCAN_LOCK: Mutex<()> = Mutex::new(());

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
struct BoxPlacementScanState {
    #[serde(default, alias = "lastScanAt")]
    last_scan_at: Option<i64>,
    /// Mail(s) non appliqué(s) ou liste Gmail tronquée — ne pas avancer le filigrane `after:`.
    #[serde(default, alias = "pendingRetryable")]
    pending_retryable: bool,
    /// Reprise pagination Gmail quand plus de 100 messages correspondent encore.
    #[serde(default, alias = "listPageToken")]
    list_page_token: Option<String>,
    /// Provider auquel appartient le curseur (token Gmail ou nextLink Graph).
    #[serde(default, alias = "listProvider")]
    list_provider: Option<String>,
    /// Messages à retenter explicitement, indépendamment du filigrane de liste.
    #[serde(default, alias = "retryMessageIds")]
    retry_message_ids: Vec<String>,
    /// Provider du dernier scan, pour ne jamais rejouer un ID Gmail dans Graph (ou inversement).
    #[serde(default, alias = "scanProvider")]
    scan_provider: Option<String>,
}

/// Décision pure sur le filigrane et la pagination Box Placement.
fn next_box_scan_state(
    previous: &BoxPlacementScanState,
    provider: &str,
    list_exhausted: bool,
    resume_page_token: Option<String>,
    mut retry_message_ids: Vec<String>,
    now_unix: i64,
) -> BoxPlacementScanState {
    retry_message_ids.sort();
    retry_message_ids.dedup();
    if !list_exhausted {
        return BoxPlacementScanState {
            last_scan_at: previous.last_scan_at,
            pending_retryable: !retry_message_ids.is_empty(),
            list_page_token: resume_page_token,
            list_provider: Some(provider.to_string()),
            retry_message_ids,
            scan_provider: Some(provider.to_string()),
        };
    }
    BoxPlacementScanState {
        last_scan_at: Some(now_unix),
        pending_retryable: !retry_message_ids.is_empty(),
        list_page_token: None,
        list_provider: None,
        retry_message_ids,
        scan_provider: Some(provider.to_string()),
    }
}

fn box_scan_cursor(state: &BoxPlacementScanState, provider: &str) -> Option<String> {
    // Les anciens états ne stockaient pas les IDs en retry : repartir du début
    // évite d'abandonner un mail d'une page déjà parcourue.
    if state.pending_retryable && state.retry_message_ids.is_empty() {
        return None;
    }
    let provider_matches = state.list_provider.as_deref() == Some(provider)
        || (state.list_provider.is_none() && provider == "google");
    provider_matches
        .then(|| state.list_page_token.clone())
        .flatten()
}

fn box_scan_resume(
    state: &BoxPlacementScanState,
    provider: &str,
) -> (Option<i64>, Option<String>, Vec<String>) {
    let provider_changed = match state.scan_provider.as_deref() {
        Some(previous) => previous != provider,
        None => {
            provider == "microsoft"
                && (state.last_scan_at.is_some()
                    || state.list_page_token.is_some()
                    || !state.retry_message_ids.is_empty())
        }
    };
    if provider_changed {
        // Les IDs et filigranes sont propres au compte/provider. Un scan complet
        // redécouvre les éventuels retries quand l'utilisateur change de boîte.
        return (None, None, Vec::new());
    }
    (
        state.last_scan_at,
        box_scan_cursor(state, provider),
        state.retry_message_ids.clone(),
    )
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum BoxPlacementKind {
    Conforme,
    NonConforme,
}

#[derive(Debug, Clone)]
pub struct ParsedBoxPlacementEmail {
    pub kind: BoxPlacementKind,
    pub contact_nom: String,
    pub contact_prenom: String,
    pub stellium_label: String,
    pub product_label: String,
}

#[derive(Debug, Serialize)]
pub struct BoxPlacementScanResult {
    pub scanned: u32,
    pub updated: u32,
    pub created: u32,
    pub skipped: u32,
    pub skipped_ambiguous_contacts: u32,
    pub skipped_ambiguous_placements: u32,
    /// Opérations passées en CONFORME lors de ce scan (candidats email client).
    pub new_conforme_ids: Vec<i64>,
}

#[derive(Debug, Deserialize)]
struct GmailMessageInternalDate {
    #[serde(rename = "internalDate", default)]
    internal_date: Option<String>,
}

fn normalize_text(value: &str) -> String {
    value
        .to_lowercase()
        .replace(['é', 'è', 'ê'], "e")
        .replace('\u{2019}', "'")
        .trim()
        .to_string()
}

pub fn parse_investor_name(full: &str) -> Option<(String, String)> {
    let parts: Vec<&str> = full.split_whitespace().filter(|p| !p.is_empty()).collect();
    if parts.len() < 2 {
        return None;
    }
    if parts.len() == 2 {
        return Some((parts[0].to_string(), parts[1].to_string()));
    }
    Some((
        parts[..parts.len() - 1].join(" "),
        parts[parts.len() - 1].to_string(),
    ))
}

pub fn parse_operation_line(line: &str) -> Option<(String, String, String)> {
    let parts: Vec<&str> = line
        .split(" - ")
        .map(str::trim)
        .filter(|p| !p.is_empty())
        .collect();
    if parts.len() < 3 {
        return None;
    }
    let contact_full = parts[parts.len() - 1].to_string();
    let stellium_label = parts[0].to_string();
    let product_label = parts[1..parts.len() - 1].join(" - ");
    Some((stellium_label, product_label, contact_full))
}

pub fn detect_box_placement_kind(subject: &str, body: &str) -> Option<BoxPlacementKind> {
    let subject_norm = normalize_text(subject);
    if subject_norm.starts_with("box placement - non-conformite a traiter - ")
        || subject_norm.starts_with("box placement - instance partenaire a traiter - ")
    {
        return Some(BoxPlacementKind::NonConforme);
    }
    if subject_norm.starts_with("box placement - envoi dossier d'operation - ") {
        return Some(BoxPlacementKind::Conforme);
    }

    let body_norm = normalize_text(body);
    if body_norm.contains("non-conformite pour l'operation suivante :")
        || body_norm.contains("situation d'instance pour l'operation suivante :")
    {
        return Some(BoxPlacementKind::NonConforme);
    }
    if body_norm.contains("operation suivante :")
        || body_norm.contains("confirmons de l'envoi au partenaire")
    {
        return Some(BoxPlacementKind::Conforme);
    }
    None
}

fn extract_operation_line(body: &str, kind: BoxPlacementKind) -> Option<String> {
    let marker_substrs: &[&str] = match kind {
        BoxPlacementKind::Conforme => &["operation suivante"],
        BoxPlacementKind::NonConforme => &[
            "non-conformite pour l'operation suivante",
            "situation d'instance pour l'operation suivante",
        ],
    };
    let lines: Vec<&str> = body.lines().map(str::trim).collect();
    for (i, line) in lines.iter().enumerate() {
        let line_norm = normalize_text(line);
        if !marker_substrs.iter().any(|m| line_norm.contains(m)) {
            continue;
        }
        for next in lines.iter().skip(i + 1) {
            let candidate = next.trim();
            if candidate.is_empty() {
                continue;
            }
            if parse_operation_line(candidate).is_some() {
                return Some(candidate.to_string());
            }
        }
    }
    None
}

fn parse_contact_from_subject(subject: &str, kind: BoxPlacementKind) -> Option<(String, String)> {
    let subject_norm = normalize_text(subject);
    let ok = match kind {
        BoxPlacementKind::Conforme => subject_norm.contains("envoi dossier d'operation - "),
        BoxPlacementKind::NonConforme => {
            subject_norm.contains("non-conformite a traiter - ")
                || subject_norm.contains("instance partenaire a traiter - ")
        }
    };
    if !ok {
        return None;
    }
    let parts: Vec<&str> = subject.split(" - ").map(str::trim).collect();
    if parts.len() < 3 {
        return None;
    }
    parse_investor_name(parts[parts.len() - 1])
}

pub fn parse_box_placement_email(subject: &str, body: &str) -> Option<ParsedBoxPlacementEmail> {
    let kind = detect_box_placement_kind(subject, body)?;
    let operation_line = extract_operation_line(body, kind)?;
    let (stellium_label, product_label, contact_full) = parse_operation_line(&operation_line)?;
    let from_line = parse_investor_name(&contact_full);
    let from_subject = parse_contact_from_subject(subject, kind);
    let (contact_nom, contact_prenom) = from_line.or(from_subject)?;

    Some(ParsedBoxPlacementEmail {
        kind,
        contact_nom,
        contact_prenom,
        stellium_label,
        product_label,
    })
}

fn gmail_box_placement_query(after_unix: Option<i64>) -> String {
    let base = format!(
        "from:{GMAIL_FROM} subject:\"Box placement\" newer_than:{GMAIL_QUERY_RECENCY_DAYS}d -in:spam -in:trash"
    );
    match after_unix.and_then(format_gmail_after_date) {
        Some(after) => format!("{base} {after}"),
        None => base,
    }
}

fn format_gmail_after_date(unix: i64) -> Option<String> {
    (unix > 0).then(|| format!("after:{}", unix.saturating_sub(60)))
}

fn load_box_scan_state(db: &crate::database::Database) -> Result<BoxPlacementScanState, String> {
    match db
        .get_setting(BOX_SCAN_STATE_KEY)
        .map_err(|e| e.to_string())?
    {
        Some(raw) => serde_json::from_str(&raw)
            .map_err(|e| format!("État scan Box Placement invalide : {e}")),
        None => Ok(BoxPlacementScanState::default()),
    }
}

fn save_box_scan_state(
    db: &crate::database::Database,
    state: &BoxPlacementScanState,
) -> Result<(), String> {
    let json = serde_json::to_string(state).map_err(|e| e.to_string())?;
    db.set_setting(BOX_SCAN_STATE_KEY, &json)
        .map_err(|e| e.to_string())
}

fn parse_internal_date_sec(internal_date: &str) -> i64 {
    internal_date
        .parse::<i64>()
        .ok()
        .map(|ms| ms / 1000)
        .unwrap_or_else(|| chrono::Utc::now().timestamp())
}

fn gmail_fetch_message_received_at(
    client: &reqwest::blocking::Client,
    token: &str,
    message_id: &str,
) -> Result<i64, String> {
    let url = format!(
        "https://gmail.googleapis.com/gmail/v1/users/me/messages/{message_id}?format=metadata"
    );
    let res = client
        .get(&url)
        .bearer_auth(token)
        .send()
        .map_err(|e| e.to_string())?;
    if !res.status().is_success() {
        return Err(format!("Gmail message: {}", res.text().unwrap_or_default()));
    }
    let meta: GmailMessageInternalDate = res.json().map_err(|e| e.to_string())?;
    Ok(meta
        .internal_date
        .as_deref()
        .map(parse_internal_date_sec)
        .unwrap_or_else(|| chrono::Utc::now().timestamp()))
}

fn box_placement_recency_cutoff_unix() -> i64 {
    chrono::Utc::now().timestamp() - (GMAIL_QUERY_RECENCY_DAYS as i64 * 86_400)
}

fn graph_box_placement_search() -> String {
    format!("from:{GMAIL_FROM} \"Box placement\"")
}

#[derive(Debug, Deserialize)]
struct GraphBoxPlacementMessageList {
    value: Vec<GraphBoxPlacementMessage>,
    #[serde(rename = "@odata.nextLink", default)]
    next_link: Option<String>,
}

#[derive(Debug, Deserialize)]
struct GraphBoxPlacementMessage {
    id: String,
    #[serde(default)]
    subject: Option<String>,
    #[serde(rename = "receivedDateTime", default)]
    received_date_time: Option<String>,
    #[serde(default)]
    from: Option<GraphBoxPlacementFromWrapper>,
}

#[derive(Debug, Deserialize)]
struct GraphBoxPlacementFromWrapper {
    #[serde(rename = "emailAddress", default)]
    email_address: Option<GraphBoxPlacementEmailAddress>,
}

#[derive(Debug, Deserialize)]
struct GraphBoxPlacementEmailAddress {
    #[serde(default)]
    address: Option<String>,
}

#[derive(Debug, Clone)]
struct FetchedBoxPlacementMessage {
    subject: String,
    body: String,
    received_at: i64,
}

fn list_graph_box_placement_message_ids(
    client: &reqwest::blocking::Client,
    token: &str,
    start_next_link: Option<&str>,
) -> Result<(Vec<String>, bool, Option<String>), String> {
    let search = graph_box_placement_search();
    let cutoff = box_placement_recency_cutoff_unix();
    let mut all_ids: Vec<String> = Vec::new();
    let mut next_link = start_next_link.map(str::to_string);
    let mut first_request = true;
    loop {
        let res = if let Some(ref url) = next_link {
            client.get(url).bearer_auth(token).send()
        } else {
            client
                .get("https://graph.microsoft.com/v1.0/me/messages")
                .header("ConsistencyLevel", "eventual")
                .query(&[
                    ("$search", search.as_str()),
                    ("$top", "50"),
                    ("$select", "id,subject,receivedDateTime,from"),
                ])
                .bearer_auth(token)
                .send()
        }
        .map_err(|e| e.to_string())?;
        if !res.status().is_success() && first_request && start_next_link.is_some() {
            return list_graph_box_placement_message_ids(client, token, None);
        }
        if !res.status().is_success() {
            return Err(format!(
                "Outlook Box Placement: {}",
                res.text().unwrap_or_default()
            ));
        }
        first_request = false;
        let list: GraphBoxPlacementMessageList = res.json().map_err(|e| e.to_string())?;
        let page_next_link = list.next_link;
        for msg in list.value {
            let from = msg
                .from
                .as_ref()
                .and_then(|w| w.email_address.as_ref())
                .and_then(|a| a.address.as_ref())
                .map(|s| s.to_lowercase())
                .unwrap_or_default();
            if !from.contains("no-reply@stellium.fr") {
                continue;
            }
            let subject = msg.subject.as_deref().unwrap_or("");
            if !normalize_text(subject).contains("box placement") {
                continue;
            }
            let received_at = msg
                .received_date_time
                .as_deref()
                .and_then(|s| chrono::DateTime::parse_from_rfc3339(s).ok())
                .map(|dt| dt.timestamp())
                .unwrap_or(0);
            if received_at > 0 && received_at < cutoff {
                continue;
            }
            all_ids.push(msg.id);
        }
        if page_next_link.is_none() {
            return Ok((all_ids, true, None));
        }
        if all_ids.len() >= SCAN_MAX_MESSAGE_IDS {
            return Ok((all_ids, false, page_next_link));
        }
        next_link = page_next_link;
    }
}

fn outlook_fetch_message_received_at(
    client: &reqwest::blocking::Client,
    token: &str,
    message_id: &str,
) -> Result<i64, String> {
    let url = format!(
        "https://graph.microsoft.com/v1.0/me/messages/{message_id}?$select=receivedDateTime"
    );
    let res = client
        .get(&url)
        .bearer_auth(token)
        .send()
        .map_err(|e| e.to_string())?;
    if !res.status().is_success() {
        return Err(format!(
            "Outlook message: {}",
            res.text().unwrap_or_default()
        ));
    }
    #[derive(Deserialize)]
    struct Meta {
        #[serde(rename = "receivedDateTime", default)]
        received_date_time: Option<String>,
    }
    let meta: Meta = res.json().map_err(|e| e.to_string())?;
    Ok(meta
        .received_date_time
        .as_deref()
        .and_then(|s| chrono::DateTime::parse_from_rfc3339(s).ok())
        .map(|dt| dt.timestamp())
        .unwrap_or_else(|| chrono::Utc::now().timestamp()))
}

fn fetch_box_placement_message(
    client: &reqwest::blocking::Client,
    token: &str,
    message_id: &str,
    provider: &str,
) -> Result<FetchedBoxPlacementMessage, String> {
    if provider == "microsoft" {
        let received_at = outlook_fetch_message_received_at(client, token, message_id)?;
        let (body, subject_opt) =
            outlook_fetch_message_body_and_subject(client, token, message_id)?;
        return Ok(FetchedBoxPlacementMessage {
            subject: subject_opt.unwrap_or_default(),
            body,
            received_at,
        });
    }
    let received_at = gmail_fetch_message_received_at(client, token, message_id)?;
    let (body, subject_opt) = gmail_fetch_message_body_and_subject(client, token, message_id)?;
    Ok(FetchedBoxPlacementMessage {
        subject: subject_opt.unwrap_or_default(),
        body,
        received_at,
    })
}

pub fn scan_box_placement_emails(
    app: &AppHandle,
    db_state: &DbState,
) -> Result<BoxPlacementScanResult, String> {
    let _scan_guard = BOX_SCAN_LOCK
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner());
    let store = EmailOAuthStore::load(app)?;
    let conn = store.connection.as_ref().ok_or(
        "Aucun compte email connecté. Paramètres → Emails & envois → Connexion : connectez Google ou Microsoft.",
    )?;
    if conn.provider != "google" && conn.provider != "microsoft" {
        return Err(
            "Le scan Box Placement nécessite Gmail ou Outlook connecté (no-reply@stellium.fr)."
                .into(),
        );
    }

    let mut oauth_conn = conn.clone();
    refresh_connection_if_needed(app, &mut oauth_conn)?;
    let access_token = oauth_conn.access_token.clone();
    let provider = oauth_conn.provider.clone();

    let client = reqwest::blocking::Client::builder()
        .timeout(std::time::Duration::from_secs(30))
        .build()
        .map_err(|e| e.to_string())?;
    let scan_started_at = chrono::Utc::now().timestamp();

    let scan_state = with_db(db_state, |db| {
        let state = load_box_scan_state(db)?;
        Ok(state)
    })?;

    let (last_scan_at, start_cursor, retry_ids_for_provider) =
        box_scan_resume(&scan_state, &provider);
    let (mut all_ids, list_exhausted, resume_page_token) = if provider == "microsoft" {
        list_graph_box_placement_message_ids(&client, &access_token, start_cursor.as_deref())?
    } else {
        let q = gmail_box_placement_query(last_scan_at);
        let mut page_token = start_cursor;
        let mut ids: Vec<String> = Vec::new();
        let mut resume_page_token: Option<String> = None;
        let mut restarted_after_cursor_error = false;
        let list_exhausted = loop {
            let (batch, next) =
                match list_message_ids(&client, &access_token, &q, page_token.as_deref()) {
                    Ok(page) => page,
                    Err(_) if page_token.is_some() && !restarted_after_cursor_error => {
                        ids.clear();
                        page_token = None;
                        restarted_after_cursor_error = true;
                        continue;
                    }
                    Err(error) => return Err(error),
                };
            for m in batch {
                ids.push(m.id);
            }
            if next.is_none() {
                break true;
            }
            if ids.len() >= SCAN_MAX_MESSAGE_IDS {
                resume_page_token = next;
                break false;
            }
            page_token = next;
        };
        (ids, list_exhausted, resume_page_token)
    };

    let mut seen_ids: HashSet<String> = all_ids.iter().cloned().collect();
    for message_id in &retry_ids_for_provider {
        if seen_ids.insert(message_id.clone()) {
            all_ids.push(message_id.clone());
        }
    }
    let scanned = all_ids.len() as u32;
    let mut updated = 0u32;
    let created = 0u32;
    let existing_ids = with_db(db_state, |db| {
        let mut ids = HashSet::new();
        for message_id in &all_ids {
            if db
                .placement_operation_exists_for_gmail(message_id)
                .map_err(|e| e.to_string())?
            {
                ids.insert(message_id.clone());
            }
        }
        Ok(ids)
    })?;
    let mut skipped = existing_ids.len() as u32;
    let mut skipped_ambiguous_contacts = 0u32;
    let mut skipped_ambiguous_placements = 0u32;
    let mut new_conforme_ids: Vec<i64> = Vec::new();
    let mut retry_message_ids: HashSet<String> = retry_ids_for_provider.into_iter().collect();
    for message_id in &existing_ids {
        retry_message_ids.remove(message_id);
    }

    // Les appels réseau restent hors du verrou SQLite pour ne pas bloquer l'UI.
    let mut fetched_messages: Vec<(String, FetchedBoxPlacementMessage)> = Vec::new();
    for message_id in all_ids {
        if existing_ids.contains(&message_id) {
            continue;
        }
        std::thread::sleep(std::time::Duration::from_millis(
            super::contact_gmail_sync::METADATA_DELAY_MS,
        ));
        match fetch_box_placement_message(&client, &access_token, &message_id, &provider) {
            Ok(fetched) => {
                retry_message_ids.remove(&message_id);
                fetched_messages.push((message_id, fetched));
            }
            Err(error) => {
                eprintln!("Box Placement fetch {message_id}: {error}");
                retry_message_ids.insert(message_id);
                skipped += 1;
            }
        }
    }

    with_db(db_state, |db| {
        for (message_id, fetched) in fetched_messages {
            let subject = fetched.subject;
            let body = fetched.body;
            let received_at = fetched.received_at;
            let Some(parsed) = parse_box_placement_email(&subject, &body) else {
                skipped += 1;
                retry_message_ids.insert(message_id);
                continue;
            };

            let contact_id = db
                .find_contact_id_by_name_if_unique(&parsed.contact_nom, &parsed.contact_prenom)
                .map_err(|e| e.to_string())?;
            let Some(contact_id) = contact_id else {
                skipped += 1;
                retry_message_ids.insert(message_id);
                if db
                    .find_contact_by_name(&parsed.contact_nom, &parsed.contact_prenom)
                    .map_err(|e| e.to_string())?
                    .is_some()
                {
                    skipped_ambiguous_contacts += 1;
                }
                continue;
            };

            let operation_type = map_stellium_label_to_operation_type(&parsed.stellium_label);
            let status = match parsed.kind {
                BoxPlacementKind::Conforme => STATUS_CONFORME,
                BoxPlacementKind::NonConforme => STATUS_NON_CONFORME,
            };
            let pipe_id_hint = db
                .find_latest_suivi_pipe_id_for_contact(contact_id)
                .map_err(|e| e.to_string())?;

            let matched = db
                .find_placement_for_email_match(
                    contact_id,
                    &parsed.stellium_label,
                    status,
                    Some(&parsed.product_label),
                    received_at,
                    pipe_id_hint,
                )
                .map_err(|e| e.to_string())?;

            let Some(_matched_op) = matched else {
                skipped += 1;
                retry_message_ids.insert(message_id);
                let open_count = db
                    .count_open_placements_for_email_match(
                        contact_id,
                        &parsed.stellium_label,
                        status,
                        received_at,
                    )
                    .map_err(|e| e.to_string())?;
                if open_count > 1 {
                    skipped_ambiguous_placements += 1;
                }
                continue;
            };

            let (_op, changed) = db
                .apply_placement_email_update(
                    contact_id,
                    operation_type,
                    status,
                    Some(&parsed.stellium_label),
                    Some(&parsed.product_label),
                    &message_id,
                    Some(&subject),
                    received_at,
                    pipe_id_hint,
                )
                .map_err(|e| e.to_string())?;

            if !changed {
                skipped += 1;
                retry_message_ids.remove(&message_id);
                continue;
            }
            retry_message_ids.remove(&message_id);
            updated += 1;
            if status == STATUS_CONFORME && placement_operation_eligible_for_client_email(&_op) {
                new_conforme_ids.push(_op.id);
            }
        }

        new_conforme_ids.sort_unstable();
        new_conforme_ids.dedup();

        let next_state = next_box_scan_state(
            &scan_state,
            &provider,
            list_exhausted,
            resume_page_token,
            retry_message_ids.into_iter().collect(),
            scan_started_at,
        );
        save_box_scan_state(db, &next_state)?;

        Ok(BoxPlacementScanResult {
            scanned,
            updated,
            created,
            skipped,
            skipped_ambiguous_contacts,
            skipped_ambiguous_placements,
            new_conforme_ids,
        })
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use chrono::TimeZone;

    const CONFORME_BODY: &str = "Bonjour,\n\nNous vous confirmons de l'envoi au partenaire ce-jour de l'opération suivante :\n\nArbitrage libre - Cristalliance Evoluvie - DUPONT Jean\n\nBien cordialement,\nL'équipe Stellium";
    const CONFORME_SUBJECT: &str = "Box placement - Envoi dossier d'opération - DUPONT Jean";

    #[test]
    fn gmail_box_placement_query_adds_precise_after_clause() {
        let ts = chrono::Utc
            .with_ymd_and_hms(2026, 2, 1, 8, 0, 0)
            .unwrap()
            .timestamp();
        let q = gmail_box_placement_query(Some(ts));
        assert!(q.contains(&format!("after:{}", ts - 60)));
        assert!(q.contains("no-reply@stellium.fr"));
    }

    #[test]
    fn parse_conforme_email() {
        let parsed = parse_box_placement_email(CONFORME_SUBJECT, CONFORME_BODY).unwrap();
        assert_eq!(parsed.kind, BoxPlacementKind::Conforme);
        assert_eq!(parsed.contact_nom, "DUPONT");
        assert_eq!(parsed.contact_prenom, "Jean");
        assert_eq!(parsed.stellium_label, "Arbitrage libre");
        assert_eq!(parsed.product_label, "Cristalliance Evoluvie");
    }

    #[test]
    fn parse_instance_partenaire_email_as_non_conforme() {
        const SUBJECT: &str = "Box placement - Instance partenaire à traiter - ROCHIAS Tony";
        const BODY: &str = "Bonjour,\n\nNous vous remercions de prendre connaissance de la situation d'instance pour l'opération suivante :\n\nSouscription - Corum Origin CIF - ROCHIAS Tony\n\nBien cordialement,\nL'équipe Stellium";
        let parsed = parse_box_placement_email(SUBJECT, BODY).unwrap();
        assert_eq!(parsed.kind, BoxPlacementKind::NonConforme);
        assert_eq!(parsed.contact_nom, "ROCHIAS");
        assert_eq!(parsed.contact_prenom, "Tony");
        assert_eq!(parsed.stellium_label, "Souscription");
        assert_eq!(parsed.product_label, "Corum Origin CIF");
    }

    #[test]
    fn box_retry_ids_survive_when_list_is_exhausted() {
        let prev = BoxPlacementScanState::default();
        let next = next_box_scan_state(&prev, "google", true, None, vec!["msg-retry".into()], 1000);
        assert_eq!(next.last_scan_at, Some(1000));
        assert!(next.pending_retryable);
        assert!(next.list_page_token.is_none());
        assert_eq!(next.retry_message_ids, vec!["msg-retry"]);
    }

    #[test]
    fn box_pagination_keeps_cursor_and_explicit_retry_ids() {
        let prev = BoxPlacementScanState::default();
        let next = next_box_scan_state(
            &prev,
            "google",
            false,
            Some("page-2".into()),
            vec!["msg-retry".into()],
            1000,
        );
        assert_eq!(next.last_scan_at, None);
        assert!(next.pending_retryable);
        assert_eq!(next.list_page_token.as_deref(), Some("page-2"));
        assert_eq!(next.list_provider.as_deref(), Some("google"));
        assert_eq!(next.retry_message_ids, vec!["msg-retry"]);
    }

    #[test]
    fn box_watermark_holds_when_gmail_list_not_exhausted() {
        let prev = BoxPlacementScanState::default();
        let next = next_box_scan_state(&prev, "google", false, Some("page-2".into()), vec![], 1000);
        assert_eq!(next.last_scan_at, None);
        assert!(!next.pending_retryable);
        assert_eq!(next.list_page_token.as_deref(), Some("page-2"));
    }

    #[test]
    fn box_watermark_advances_when_fully_processed() {
        let prev = BoxPlacementScanState {
            pending_retryable: true,
            list_page_token: Some("page-2".into()),
            ..Default::default()
        };
        let next = next_box_scan_state(&prev, "google", true, None, vec![], 3000);
        assert_eq!(next.last_scan_at, Some(3000));
        assert!(!next.pending_retryable);
        assert!(next.list_page_token.is_none());
    }

    #[test]
    fn box_legacy_retry_state_restarts_listing_from_first_page() {
        let prev = BoxPlacementScanState {
            pending_retryable: true,
            list_page_token: Some("page-2".into()),
            ..Default::default()
        };
        assert!(box_scan_cursor(&prev, "google").is_none());
        let (last_scan_at, cursor, retries) = box_scan_resume(&prev, "microsoft");
        assert!(last_scan_at.is_none());
        assert!(cursor.is_none());
        assert!(retries.is_empty());
    }

    #[test]
    fn box_cursor_is_scoped_to_provider() {
        let prev = BoxPlacementScanState {
            last_scan_at: Some(1000),
            list_page_token: Some("gmail-token".into()),
            list_provider: Some("google".into()),
            retry_message_ids: vec!["gmail-retry".into()],
            scan_provider: Some("google".into()),
            ..Default::default()
        };
        assert_eq!(
            box_scan_cursor(&prev, "google").as_deref(),
            Some("gmail-token")
        );
        assert!(box_scan_cursor(&prev, "microsoft").is_none());

        let (last_scan_at, cursor, retries) = box_scan_resume(&prev, "microsoft");
        assert!(last_scan_at.is_none());
        assert!(cursor.is_none());
        assert!(retries.is_empty());
    }
}
