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
use tauri::AppHandle;

const GMAIL_FROM: &str = "no-reply@stellium.fr";
const GMAIL_QUERY_RECENCY_DAYS: u32 = 120;
const SCAN_MAX_MESSAGE_IDS: usize = 100;

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
    let parts: Vec<&str> = line.split(" - ").map(str::trim).filter(|p| !p.is_empty()).collect();
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

fn gmail_box_placement_query() -> String {
    format!(
        "from:{GMAIL_FROM} subject:\"Box placement\" newer_than:{GMAIL_QUERY_RECENCY_DAYS}d -in:spam -in:trash"
    )
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
) -> Result<Vec<String>, String> {
    let search = graph_box_placement_search();
    let cutoff = box_placement_recency_cutoff_unix();
    let mut all_ids: Vec<String> = Vec::new();
    let mut next_link: Option<String> = None;
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
        if !res.status().is_success() {
            return Err(format!("Outlook Box Placement: {}", res.text().unwrap_or_default()));
        }
        let list: GraphBoxPlacementMessageList = res.json().map_err(|e| e.to_string())?;
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
            if all_ids.len() >= SCAN_MAX_MESSAGE_IDS {
                return Ok(all_ids);
            }
        }
        next_link = list.next_link;
        if next_link.is_none() {
            break;
        }
    }
    Ok(all_ids)
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
        return Err(format!("Outlook message: {}", res.text().unwrap_or_default()));
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
    let store = EmailOAuthStore::load(app)?;
    let conn = store.connection.as_ref().ok_or(
        "Aucun compte email connecté. Paramètres → Emails & envois → Connexion : connectez Google ou Microsoft.",
    )?;
    if conn.provider != "google" && conn.provider != "microsoft" {
        return Err(
            "Le scan Box Placement nécessite Gmail ou Outlook connecté (no-reply@stellium.fr).".into(),
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

    let all_ids = if provider == "microsoft" {
        list_graph_box_placement_message_ids(&client, &access_token)?
    } else {
        let q = gmail_box_placement_query();
        let mut page_token: Option<String> = None;
        let mut ids: Vec<String> = Vec::new();
        loop {
            let (batch, next) =
                list_message_ids(&client, &access_token, &q, page_token.as_deref())?;
            for m in batch {
                ids.push(m.id);
            }
            if next.is_none() || ids.len() >= SCAN_MAX_MESSAGE_IDS {
                break;
            }
            page_token = next;
        }
        ids
    };

    let scanned = all_ids.len() as u32;
    let mut updated = 0u32;
    let created = 0u32;
    let mut skipped = 0u32;
    let mut skipped_ambiguous_contacts = 0u32;
    let mut skipped_ambiguous_placements = 0u32;
    let mut new_conforme_ids: Vec<i64> = Vec::new();

    with_db(db_state, |db| {
        for message_id in all_ids {
            if db
                .placement_operation_exists_for_gmail(&message_id)
                .map_err(|e| e.to_string())?
            {
                skipped += 1;
                continue;
            }

            let fetched =
                fetch_box_placement_message(&client, &access_token, &message_id, &provider)?;
            let subject = fetched.subject;
            let body = fetched.body;
            let received_at = fetched.received_at;
            let Some(parsed) = parse_box_placement_email(&subject, &body) else {
                skipped += 1;
                continue;
            };

            let contact_id = db
                .find_contact_id_by_name_if_unique(&parsed.contact_nom, &parsed.contact_prenom)
                .map_err(|e| e.to_string())?;
            let Some(contact_id) = contact_id else {
                skipped += 1;
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
                continue;
            }
            updated += 1;
            if status == STATUS_CONFORME
                && placement_operation_eligible_for_client_email(&_op)
            {
                new_conforme_ids.push(_op.id);
            }
        }

        new_conforme_ids.sort_unstable();
        new_conforme_ids.dedup();

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

    const CONFORME_BODY: &str = "Bonjour,\n\nNous vous confirmons de l'envoi au partenaire ce-jour de l'opération suivante :\n\nArbitrage libre - Cristalliance Evoluvie - DUPONT Jean\n\nBien cordialement,\nL'équipe Stellium";
    const CONFORME_SUBJECT: &str = "Box placement - Envoi dossier d'opération - DUPONT Jean";

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
}
