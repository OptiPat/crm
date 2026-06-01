//! Détection des emails Stellium « Remboursement Exceltis … » (Gmail).

use super::contact_gmail_sync::{list_message_ids, with_db};
use super::oauth_send::refresh_connection_if_needed;
use super::oauth_store::EmailOAuthStore;
use crate::commands::DbState;
use serde::{Deserialize, Serialize};
use std::collections::{HashMap, HashSet};
use tauri::AppHandle;

const STATE_SETTING_KEY: &str = "stellium_exceltis_signals_v1";
const GMAIL_FROM: &str = "marketplacement@stellium.fr";
const EXCELITIS_ETIQUETTE_PREFIX: &str = "Exceltis — ";
/// Fenêtre Gmail (`newer_than:400d`) — seuls ces messages sont listés.
const GMAIL_QUERY_RECENCY_DAYS: u32 = 400;
/// Plafond de sécurité par scan (pagination Gmail jusqu’à épuisement ou ce plafond).
const SCAN_MAX_MESSAGE_IDS: usize = 200;
/// Après ce nombre d’échecs de parsing du millésime, le message est ignoré (comme dismiss).
const PARSE_FAIL_MAX_ATTEMPTS: u32 = 3;

const MOIS_FR: [&str; 12] = [
    "Janvier",
    "Février",
    "Mars",
    "Avril",
    "Mai",
    "Juin",
    "Juillet",
    "Août",
    "Septembre",
    "Octobre",
    "Novembre",
    "Décembre",
];

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StelliumExceltisSignal {
    #[serde(alias = "gmailMessageId")]
    pub gmail_message_id: String,
    pub subject: String,
    #[serde(alias = "millesimeLabel")]
    pub millesime_label: String,
    #[serde(alias = "etiquetteNom")]
    pub etiquette_nom: String,
    #[serde(alias = "etiquetteId")]
    pub etiquette_id: Option<i64>,
    #[serde(alias = "contactCount")]
    pub contact_count: u32,
    #[serde(alias = "receivedAt")]
    pub received_at: i64,
    /// Date extraite du mail « À partir du … » : début du désinvestissement (ex. « 6 Mars 2026 »).
    #[serde(
        default,
        skip_serializing_if = "Option::is_none",
        alias = "operationFromLabel"
    )]
    pub operation_from_label: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
struct StelliumExceltisState {
    #[serde(default, alias = "dismissedMessageIds")]
    dismissed_message_ids: Vec<String>,
    #[serde(default)]
    signals: Vec<StelliumExceltisSignal>,
    /// Tentatives de parsing millésime (message_id → compteur).
    #[serde(default, alias = "parseRetryByMessageId")]
    parse_retry_by_message_id: HashMap<String, u32>,
}

fn record_parse_failure(state: &mut StelliumExceltisState, message_id: &str) {
    let count = state
        .parse_retry_by_message_id
        .entry(message_id.to_string())
        .or_insert(0);
    *count += 1;
    let n = *count;
    if n >= PARSE_FAIL_MAX_ATTEMPTS {
        state.parse_retry_by_message_id.remove(message_id);
        let id = message_id.to_string();
        if !state.dismissed_message_ids.contains(&id) {
            state.dismissed_message_ids.push(id);
        }
        eprintln!(
            "Stellium Exceltis: millésime non parsé après {PARSE_FAIL_MAX_ATTEMPTS} tentatives ({message_id}), ignoré"
        );
    } else {
        eprintln!(
            "Stellium Exceltis: millésime non parsé (tentative {n}/{PARSE_FAIL_MAX_ATTEMPTS}, message {message_id})"
        );
    }
}

#[derive(Debug, Clone, Serialize)]
pub struct StelliumExceltisScanResult {
    pub scanned: u32,
    pub new_signals: u32,
    pub signals: Vec<StelliumExceltisSignal>,
}

#[derive(Debug, Deserialize)]
struct GmailMessageMeta {
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

fn header_value(headers: Option<&[GmailHeader]>, name: &str) -> String {
    headers
        .and_then(|hs| {
            hs.iter()
                .find(|h| h.name.eq_ignore_ascii_case(name))
                .map(|h| h.value.trim().to_string())
        })
        .unwrap_or_default()
}

fn normalize_month_key(name: &str) -> String {
    name.trim()
        .to_lowercase()
        .replace('é', "e")
        .replace('è', "e")
        .replace('ê', "e")
        .replace('û', "u")
        .replace('ô', "o")
        .replace('à', "a")
        .replace('ç', "c")
}

fn month_name_to_number(name: &str) -> Option<u32> {
    let key = normalize_month_key(name);
    match key.as_str() {
        "janvier" => Some(1),
        "fevrier" => Some(2),
        "mars" => Some(3),
        "avril" => Some(4),
        "mai" => Some(5),
        "juin" => Some(6),
        "juillet" => Some(7),
        "aout" => Some(8),
        "septembre" => Some(9),
        "octobre" => Some(10),
        "novembre" => Some(11),
        "decembre" => Some(12),
        _ => None,
    }
}

pub fn format_exceltis_etiquette_nom(month: u32, year: u32) -> Option<String> {
    let idx = month as usize;
    if idx < 1 || idx > 12 {
        return None;
    }
    Some(format!("{EXCELITIS_ETIQUETTE_PREFIX}{} {year}", MOIS_FR[idx - 1]))
}

fn month_search_keys(month: u32) -> &'static [&'static str] {
    match month {
        1 => &["janvier"],
        2 => &["février", "fevrier"],
        3 => &["mars"],
        4 => &["avril"],
        5 => &["mai"],
        6 => &["juin"],
        7 => &["juillet"],
        8 => &["août", "aout"],
        9 => &["septembre"],
        10 => &["octobre"],
        11 => &["novembre"],
        12 => &["décembre", "decembre"],
        _ => &[],
    }
}

fn extract_year_after_month(text: &str, month_key_len: usize) -> Option<u32> {
    let after = text.get(month_key_len..)?.trim();
    for word in after.split_whitespace().take(4) {
        let digits: String = word.chars().filter(|c| c.is_ascii_digit()).collect();
        if digits.len() == 4 {
            let y: u32 = digits.parse().ok()?;
            if (2015..=2100).contains(&y) {
                return Some(y);
            }
        }
    }
    None
}

/// Premier mois + année trouvés après une ancre « exceltis » (sujet flexible, sans exiger « Rendement »).
fn find_millesime_near_exceltis(text: &str) -> Option<(u32, u32)> {
    let lower = text.to_lowercase();
    if !lower.contains("exceltis") {
        return None;
    }
    let anchors = ["exceltis rendement", "remboursement exceltis", "exceltis"];
    let anchor_pos = anchors
        .iter()
        .filter_map(|a| lower.find(a))
        .min()
        .unwrap_or(0);

    let mut best: Option<(usize, u32, u32)> = None;
    for month in 1..=12u32 {
        for key in month_search_keys(month) {
            if let Some(pos) = lower.find(key) {
                if pos < anchor_pos || pos > anchor_pos.saturating_add(120) {
                    continue;
                }
                if let Some(year) = extract_year_after_month(&text[pos..], key.len()) {
                    let rank = pos;
                    if best.map(|(p, _, _)| rank < p).unwrap_or(true) {
                        best = Some((rank, month, year));
                    }
                }
            }
        }
    }
    best.map(|(_, m, y)| (m, y))
}

/// Extrait le millésime depuis le sujet ou le corps (ex. « Remboursement Exceltis Février 2025 »).
pub fn parse_millesime_from_text(text: &str) -> Option<(u32, u32)> {
    find_millesime_near_exceltis(text).or_else(|| {
        let lower = text.to_lowercase();
        if !lower.contains("exceltis") {
            return None;
        }
        for month in 1..=12u32 {
            for key in month_search_keys(month) {
                if let Some(pos) = lower.find(key) {
                    if let Some(year) = extract_year_after_month(&text[pos..], key.len()) {
                        return Some((month, year));
                    }
                }
            }
        }
        None
    })
}

/// « À partir du 06 mars 2026 » → libellé « 6 mars 2026 ».
pub fn parse_operation_from_date(text: &str) -> Option<String> {
    let lower = text.to_lowercase();
    let idx = lower
        .find("a partir du")
        .or_else(|| lower.find("à partir du"))?;
    let slice = text.get(idx..)?;
    let du_idx = slice.to_lowercase().find(" du ")?;
    let after_du = slice.get(du_idx + 4..)?.trim();
    let parts: Vec<&str> = after_du.split_whitespace().take(4).collect();
    if parts.len() < 3 {
        return None;
    }
    let day_digits: String = parts[0].chars().filter(|c| c.is_ascii_digit()).collect();
    let day: u32 = day_digits.parse().ok()?;
    if !(1..=31).contains(&day) {
        return None;
    }
    let month = month_name_to_number(parts[1])?;
    let year_digits: String = parts[2].chars().filter(|c| c.is_ascii_digit()).collect();
    let year: u32 = year_digits.parse().ok()?;
    if !(2015..=2100).contains(&year) {
        return None;
    }
    Some(format!("{day} {} {year}", MOIS_FR[month as usize - 1]))
}

fn gmail_stellium_query() -> String {
    format!(
        "from:{GMAIL_FROM} subject:\"Remboursement Exceltis\" newer_than:{GMAIL_QUERY_RECENCY_DAYS}d -in:spam -in:trash"
    )
}

fn parse_internal_date_sec(internal_date: &str) -> i64 {
    internal_date
        .parse::<i64>()
        .ok()
        .map(|ms| ms / 1000)
        .unwrap_or_else(|| {
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_secs() as i64
        })
}

fn fetch_message_meta(
    client: &reqwest::blocking::Client,
    token: &str,
    message_id: &str,
) -> Result<GmailMessageMeta, String> {
    let url = format!(
        "https://gmail.googleapis.com/gmail/v1/users/me/messages/{message_id}?format=metadata&metadataHeaders=Subject&metadataHeaders=From&metadataHeaders=Date"
    );
    let res = client
        .get(&url)
        .bearer_auth(token)
        .send()
        .map_err(|e| e.to_string())?;
    if !res.status().is_success() {
        return Err(format!("Gmail message: {}", res.text().unwrap_or_default()));
    }
    res.json().map_err(|e| e.to_string())
}

fn load_state(db: &crate::database::Database) -> Result<StelliumExceltisState, String> {
    match db
        .get_setting(STATE_SETTING_KEY)
        .map_err(|e| e.to_string())?
    {
        Some(json) => serde_json::from_str(&json).map_err(|e| e.to_string()),
        None => Ok(StelliumExceltisState::default()),
    }
}

fn save_state(db: &crate::database::Database, state: &StelliumExceltisState) -> Result<(), String> {
    let json = serde_json::to_string(state).map_err(|e| e.to_string())?;
    db.set_setting(STATE_SETTING_KEY, &json)
        .map_err(|e| e.to_string())
}

fn refresh_signal_counts(db: &crate::database::Database, signal: &mut StelliumExceltisSignal) {
    if let Some(id) = signal.etiquette_id {
        signal.contact_count = db.count_contacts_for_etiquette(id).unwrap_or(0);
        return;
    }
    if let Ok(Some(id)) = db.get_etiquette_id_by_nom_insensitive(&signal.etiquette_nom) {
        signal.etiquette_id = Some(id);
        signal.contact_count = db.count_contacts_for_etiquette(id).unwrap_or(0);
    }
}

/// Répare les signaux persistés avant correction snake_case (champs vides côté UI).
fn repair_signal_metadata(signal: &mut StelliumExceltisSignal) {
    if signal.millesime_label.trim().is_empty() || signal.etiquette_nom.trim().is_empty() {
        if let Some((month, year)) = parse_millesime_from_text(&signal.subject) {
            if let Some(etiquette_nom) = format_exceltis_etiquette_nom(month, year) {
                if let Some(label) = etiquette_nom.strip_prefix(EXCELITIS_ETIQUETTE_PREFIX) {
                    signal.millesime_label = label.to_string();
                    signal.etiquette_nom = etiquette_nom;
                }
            }
        }
    }
}

fn resolve_signal(
    db: &crate::database::Database,
    message_id: String,
    subject: String,
    parse_text: &str,
    received_at: i64,
) -> Option<StelliumExceltisSignal> {
    let (month, year) = parse_millesime_from_text(&subject)
        .or_else(|| parse_millesime_from_text(parse_text))?;
    let etiquette_nom = format_exceltis_etiquette_nom(month, year)?;
    let millesime_label = etiquette_nom.strip_prefix(EXCELITIS_ETIQUETTE_PREFIX)?.to_string();
    let operation_from_label = parse_operation_from_date(parse_text);

    let etiquette_id = db
        .get_etiquette_id_by_nom_insensitive(&etiquette_nom)
        .ok()
        .flatten();
    let contact_count = etiquette_id
        .map(|id| db.count_contacts_for_etiquette(id).unwrap_or(0))
        .unwrap_or(0);

    Some(StelliumExceltisSignal {
        gmail_message_id: message_id,
        subject,
        millesime_label,
        etiquette_nom,
        etiquette_id,
        contact_count,
        received_at,
        operation_from_label,
    })
}

pub fn get_stellium_exceltis_signals(db_state: &DbState) -> Result<Vec<StelliumExceltisSignal>, String> {
    with_db(db_state, |db| {
        let mut state = load_state(db)?;
        let mut changed = false;
        for signal in &mut state.signals {
            let before = (
                signal.millesime_label.clone(),
                signal.etiquette_nom.clone(),
            );
            repair_signal_metadata(signal);
            refresh_signal_counts(db, signal);
            if before != (signal.millesime_label.clone(), signal.etiquette_nom.clone()) {
                changed = true;
            }
        }
        if changed {
            save_state(db, &state)?;
        }
        Ok(state.signals)
    })
}

pub fn dismiss_stellium_exceltis_signal(
    db_state: &DbState,
    gmail_message_id: &str,
) -> Result<(), String> {
    with_db(db_state, |db| {
        let mut state = load_state(db)?;
        let id = gmail_message_id.trim().to_string();
        if id.is_empty() {
            return Err("Identifiant de message invalide".into());
        }
        state.signals.retain(|s| s.gmail_message_id != id);
        if !state.dismissed_message_ids.contains(&id) {
            state.dismissed_message_ids.push(id);
        }
        save_state(db, &state)
    })
}

pub fn scan_stellium_exceltis_emails(
    app: &AppHandle,
    db_state: &DbState,
) -> Result<StelliumExceltisScanResult, String> {
    let store = EmailOAuthStore::load(app)?;
    let conn = store
        .connection
        .as_ref()
        .ok_or("Aucun compte email connecté. Paramètres → Email : connectez Google.")?;
    if conn.provider != "google" {
        return Err(
            "La détection Stellium / Exceltis nécessite une connexion Google (Gmail).".into(),
        );
    }

    let mut oauth_conn = conn.clone();
    refresh_connection_if_needed(app, &mut oauth_conn)?;
    let access_token = oauth_conn.access_token;

    let client = reqwest::blocking::Client::builder()
        .timeout(std::time::Duration::from_secs(30))
        .build()
        .map_err(|e| e.to_string())?;

    let q = gmail_stellium_query();
    let mut page_token: Option<String> = None;
    let mut all_ids: Vec<String> = Vec::new();
    loop {
        let (ids, next) = list_message_ids(
            &client,
            &access_token,
            &q,
            page_token.as_deref(),
        )?;
        for m in ids {
            all_ids.push(m.id);
        }
        if next.is_none() || all_ids.len() >= SCAN_MAX_MESSAGE_IDS {
            break;
        }
        page_token = next;
    }

    let scanned = all_ids.len() as u32;
    let mut new_signals = 0u32;

    with_db(db_state, |db| {
        let mut state = load_state(db)?;
        let dismissed: HashSet<String> = state.dismissed_message_ids.iter().cloned().collect();
        let known: HashSet<String> = state
            .signals
            .iter()
            .map(|s| s.gmail_message_id.clone())
            .chain(dismissed.iter().cloned())
            .collect();

        for message_id in all_ids {
            if known.contains(&message_id) {
                continue;
            }
            let meta = match fetch_message_meta(&client, &access_token, &message_id) {
                Ok(m) => m,
                Err(e) => {
                    eprintln!("Stellium meta {message_id}: {e}");
                    continue;
                }
            };
            let headers = meta.payload.as_ref().and_then(|p| p.headers.as_deref());
            let subject = header_value(headers, "Subject");
            if subject.is_empty() {
                continue;
            }
            let from = header_value(headers, "From").to_lowercase();
            if !from.contains("stellium") && !from.contains(GMAIL_FROM) {
                continue;
            }
            let received_at = meta
                .internal_date
                .as_deref()
                .map(parse_internal_date_sec)
                .unwrap_or(0);

            let snippet = meta.snippet.unwrap_or_default();
            let mut parse_text = format!("{subject}\n{snippet}");
            if parse_operation_from_date(&parse_text).is_none() {
                if let Ok(full) =
                    super::response_sync::gmail_fetch_message_body(&client, &access_token, &message_id)
                {
                    if !full.is_empty() {
                        parse_text = format!("{subject}\n{snippet}\n{full}");
                    }
                }
            }

            if let Some(signal) = resolve_signal(
                db,
                message_id.clone(),
                subject.clone(),
                &parse_text,
                received_at,
            ) {
                state.parse_retry_by_message_id.remove(&message_id);
                state.signals.push(signal);
                new_signals += 1;
            } else {
                let subj = subject.to_lowercase();
                if subj.contains("remboursement") && subj.contains("exceltis") {
                    record_parse_failure(&mut state, &message_id);
                } else if !state.dismissed_message_ids.contains(&message_id) {
                    state.dismissed_message_ids.push(message_id);
                }
            }
        }

        for signal in &mut state.signals {
            refresh_signal_counts(db, signal);
        }

        save_state(db, &state)?;
        Ok(StelliumExceltisScanResult {
            scanned,
            new_signals,
            signals: state.signals.clone(),
        })
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parse_subject_fevrier_2025() {
        let s = "Remboursement Exceltis Rendement Février 2025";
        let (m, y) = parse_millesime_from_text(s).unwrap();
        assert_eq!(m, 2);
        assert_eq!(y, 2025);
        assert_eq!(
            format_exceltis_etiquette_nom(m, y).as_deref(),
            Some("Exceltis — Février 2025")
        );
    }

    #[test]
    fn parse_subject_aout_2026() {
        let s = "Remboursement Exceltis Rendement Août 2026";
        let (m, y) = parse_millesime_from_text(s).unwrap();
        assert_eq!(m, 8);
        assert_eq!(y, 2026);
    }

    #[test]
    fn parse_subject_without_rendement() {
        let s = "Remboursement Exceltis Février 2025";
        let (m, y) = parse_millesime_from_text(s).unwrap();
        assert_eq!(m, 2);
        assert_eq!(y, 2025);
    }

    #[test]
    fn parse_subject_serenite_decembre_2023() {
        let s = "Remboursement Exceltis Sérénité Décembre 2023";
        let (m, y) = parse_millesime_from_text(s).unwrap();
        assert_eq!(m, 12);
        assert_eq!(y, 2023);
    }

    #[test]
    fn parse_subject_informations_complementaires() {
        let s = "Informations complémentaires Remboursement Exceltis Rendement Octobre 2024";
        let (m, y) = parse_millesime_from_text(s).unwrap();
        assert_eq!(m, 10);
        assert_eq!(y, 2024);
    }

    #[test]
    fn deserialize_signal_camel_case_json() {
        let json = r#"{"gmailMessageId":"abc","subject":"Remboursement Exceltis Rendement Février 2025","millesimeLabel":"Février 2025","etiquetteNom":"Exceltis — Février 2025","etiquetteId":null,"contactCount":0,"receivedAt":1}"#;
        let signal: StelliumExceltisSignal = serde_json::from_str(json).unwrap();
        assert_eq!(signal.gmail_message_id, "abc");
        assert_eq!(signal.millesime_label, "Février 2025");
        assert_eq!(signal.etiquette_nom, "Exceltis — Février 2025");
    }

    #[test]
    fn repair_signal_from_subject() {
        let mut signal = StelliumExceltisSignal {
            gmail_message_id: "x".into(),
            subject: "Remboursement Exceltis Rendement Octobre 2024".into(),
            millesime_label: String::new(),
            etiquette_nom: String::new(),
            etiquette_id: None,
            contact_count: 0,
            received_at: 0,
            operation_from_label: None,
        };
        repair_signal_metadata(&mut signal);
        assert_eq!(signal.millesime_label, "Octobre 2024");
        assert_eq!(signal.etiquette_nom, "Exceltis — Octobre 2024");
    }

    #[test]
    fn parse_fail_dismissed_after_max_attempts() {
        let mut state = StelliumExceltisState::default();
        record_parse_failure(&mut state, "msg-1");
        record_parse_failure(&mut state, "msg-1");
        assert!(!state.dismissed_message_ids.iter().any(|id| id == "msg-1"));
        record_parse_failure(&mut state, "msg-1");
        assert!(state.dismissed_message_ids.iter().any(|id| id == "msg-1"));
        assert!(!state.parse_retry_by_message_id.contains_key("msg-1"));
    }

    #[test]
    fn parse_operation_from_a_partir_du() {
        let body = "Arbitrage requis. À partir du 06 mars 2026, désinvestissement automatique.";
        assert_eq!(
            parse_operation_from_date(body).as_deref(),
            Some("6 Mars 2026")
        );
    }
}
