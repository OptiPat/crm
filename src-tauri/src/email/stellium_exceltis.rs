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
/// Alias Stellium → libellé CRM (Patrimoine Taux → Patrimoine).
const GAMME_PARSE_ALIASES: [(&str, &str); 5] = [
    ("patrimoine taux", "Patrimoine"),
    ("sérénité", "Sérénité"),
    ("serenite", "Sérénité"),
    ("rendement", "Rendement"),
    ("patrimoine", "Patrimoine"),
];
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
    /// Déclencheur campagne conservé même si l’annonce Stellium est masquée (UI).
    #[serde(default, alias = "etiquetteTriggerAt")]
    etiquette_trigger_at: HashMap<i64, i64>,
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
    let raw = headers
        .and_then(|hs| {
            hs.iter()
                .find(|h| h.name.eq_ignore_ascii_case(name))
                .map(|h| h.value.trim().to_string())
        })
        .unwrap_or_default();
    decode_mime_header(&raw)
}

/// Décode les sujets Gmail RFC 2047 (=?UTF-8?Q?F=C3=A9vrier?= …).
fn decode_mime_header(value: &str) -> String {
    let trimmed = value.trim();
    if !trimmed.contains("=?") {
        return trimmed.to_string();
    }
    let mut out = String::new();
    let mut rest = trimmed;
    while !rest.is_empty() {
        let Some(start) = rest.find("=?") else {
            out.push_str(rest);
            break;
        };
        out.push_str(&rest[..start]);
        rest = &rest[start..];
        let Some(end_rel) = rest[2..].find("?=") else {
            out.push_str(rest);
            break;
        };
        let end = end_rel + 2;
        let token = &rest[..end + 2];
        if let Some(decoded) = decode_encoded_word(token) {
            out.push_str(&decoded);
        } else {
            out.push_str(token);
        }
        rest = &rest[end + 2..];
        if rest.starts_with(' ') {
            out.push(' ');
            rest = &rest[1..];
        }
    }
    out.split_whitespace().collect::<Vec<_>>().join(" ")
}

fn decode_encoded_word(token: &str) -> Option<String> {
    let inner = token.strip_prefix("=?")?.strip_suffix("?=")?;
    let mut parts = inner.splitn(3, '?');
    let charset = parts.next()?.to_lowercase();
    let encoding = parts.next()?.to_uppercase();
    let data = parts.next()?;
    let bytes = match encoding.as_str() {
        "Q" => decode_q_encoding(data)?,
        "B" => base64::Engine::decode(&base64::engine::general_purpose::STANDARD, data).ok()?,
        _ => return None,
    };
    decode_header_bytes(&bytes, &charset)
}

fn decode_q_encoding(data: &str) -> Option<Vec<u8>> {
    let mut bytes = Vec::new();
    let chars: Vec<char> = data.chars().collect();
    let mut i = 0;
    while i < chars.len() {
        if chars[i] == '=' && i + 2 < chars.len() {
            let hex: String = chars[i + 1..i + 3].iter().collect();
            if hex.chars().all(|c| c.is_ascii_hexdigit()) {
                if let Ok(b) = u8::from_str_radix(&hex, 16) {
                    bytes.push(b);
                    i += 3;
                    continue;
                }
            }
        }
        bytes.push(if chars[i] == '_' { b' ' } else { chars[i] as u8 });
        i += 1;
    }
    Some(bytes)
}

fn decode_header_bytes(bytes: &[u8], charset: &str) -> Option<String> {
    if charset.contains("utf") {
        return String::from_utf8(bytes.to_vec()).ok();
    }
    Some(bytes.iter().map(|&b| b as char).collect())
}

fn subject_looks_like_exceltis_remboursement(subject: &str) -> bool {
    let lower = subject.to_lowercase();
    lower.contains("remboursement") && lower.contains("exceltis")
}

/// Mails « Informations complémentaires … » : pas de déclenchement campagne.
fn is_complementaires_subject(subject: &str) -> bool {
    let lower = subject.to_lowercase();
    lower.contains("informations complementaires")
        || lower.contains("informations complémentaires")
}

/// Newsletter « Bonne nouvelle … remboursements à venir » (plusieurs millésimes possibles).
fn subject_is_announcement_newsletter(subject: &str) -> bool {
    let lower = normalize_for_gamme_match(subject);
    if !lower.contains("exceltis") {
        return false;
    }
    lower.contains("a venir")
        || lower.contains("bonne nouvelle")
        || lower.contains("bonnes nouvelles")
}

/// Mail unitaire « Remboursement Exceltis {Gamme} {Mois} {Année} » — millésime = sujet seul.
fn subject_is_direct_remboursement(subject: &str) -> bool {
    if is_complementaires_subject(subject) || subject_is_announcement_newsletter(subject) {
        return false;
    }
    let lower = normalize_for_gamme_match(subject);
    lower.contains("remboursement exceltis") && parse_exceltis_key_from_text(subject).is_some()
}

const REMBOURSEMENT_BLOCK_WINDOW: usize = 500;
const MILLESIME_MAX_GAP_FROM_EXCELTIS: usize = 400;
/// Plafond corps mail / HTML — au-delà, troncature (newsletter Stellium tient en quelques Ko).
const MAX_STELLIUM_PARSE_CHARS: usize = 64_000;

/// Mentions produit (Extranet, fermeture souscription…) — pas un signal remboursement.
fn is_excluded_exceltis_mention(normalized_window: &str) -> bool {
    const PATTERNS: &[&str] = &[
        "est desormais accessible",
        "desormais accessible sur",
        "extranet placement",
        "sur votre extranet",
        "fermeture imminente",
        "fermeture prochaine",
        "derniers jours pour souscrire",
        "plus disponible a la souscription",
        "accessibilite sur l extranet",
    ];
    PATTERNS.iter().any(|p| normalized_window.contains(p))
}

/// Preuve forte qu'un bloc est un vrai remboursement (et pas une annonce de disponibilité).
/// Prime sur l'exclusion « Extranet/accessible » qui peut traîner dans la même fenêtre (pied de mail).
fn window_has_strong_remboursement_evidence(normalized_window: &str) -> bool {
    normalized_window.contains("remboursement :")
        || normalized_window.contains("date d observation")
        || normalized_window.contains("performance indice")
}

/// Bloc fiche produit Stellium (ligne « Remboursement : … », coupon, etc.) — pas de table ISIN.
fn window_looks_like_remboursement_block(normalized_window: &str) -> bool {
    if window_has_strong_remboursement_evidence(normalized_window) {
        return true;
    }
    if is_excluded_exceltis_mention(normalized_window) {
        return false;
    }
    normalized_window.contains("remboursement")
        || normalized_window.contains("coupon")
        || normalized_window.contains("indice de reference")
        || normalized_window.contains("air bag")
}

fn is_month_at_word_boundary(text: &str, pos: usize, key: &str) -> bool {
    if !text.is_char_boundary(pos) {
        return false;
    }
    let after_pos = pos + key.len();
    if after_pos < text.len() && !text.is_char_boundary(after_pos) {
        return false;
    }
    let before_ok = text[..pos]
        .chars()
        .last()
        .map(|c| !c.is_alphabetic())
        .unwrap_or(true);
    let after_ok = text[after_pos..]
        .chars()
        .next()
        .map(|c| !c.is_alphabetic())
        .unwrap_or(true);
    before_ok && after_ok
}

/// Frontière de caractère ≤ `idx` (les espaces insécables `\u{a0}` font 2 octets).
fn floor_char_boundary(text: &str, mut idx: usize) -> usize {
    if idx >= text.len() {
        return text.len();
    }
    while idx > 0 && !text.is_char_boundary(idx) {
        idx -= 1;
    }
    idx
}

/// Frontière de caractère ≥ `idx`.
fn ceil_char_boundary(text: &str, mut idx: usize) -> usize {
    let len = text.len();
    if idx >= len {
        return len;
    }
    while idx < len && !text.is_char_boundary(idx) {
        idx += 1;
    }
    idx
}

fn find_millesime_after_pos(text: &str, anchor_pos: usize, max_gap: usize) -> Option<(u32, u32)> {
    // Recherche insensible à la casse : les clés de mois sont en minuscules.
    let lowered = text.to_lowercase();
    let text = lowered.as_str();
    let anchor_pos = floor_char_boundary(text, anchor_pos.min(text.len()));
    let search_end = floor_char_boundary(text, anchor_pos.saturating_add(max_gap).min(text.len()));
    if anchor_pos >= search_end {
        return None;
    }
    let mut best: Option<(usize, u32, u32)> = None;
    for month in 1..=12u32 {
        for key in month_search_keys(month) {
            let mut start = anchor_pos;
            while start < search_end {
                let Some(rel) = text[start..search_end].find(key) else {
                    break;
                };
                let pos = start + rel;
                if !is_month_at_word_boundary(text, pos, key) {
                    start = ceil_char_boundary(text, pos.saturating_add(1));
                    continue;
                }
                if let Some(year) = extract_year_after_month(&text[pos..], key.len()) {
                    if best.map(|(p, _, _)| pos < p).unwrap_or(true) {
                        best = Some((pos, month, year));
                    }
                }
                start = ceil_char_boundary(text, pos.saturating_add(1));
            }
        }
    }
    best.map(|(_, m, y)| (m, y))
}

fn push_unique_exceltis_key(
    keys: &mut Vec<ExceltisEtiquetteKey>,
    seen: &mut HashSet<(Option<String>, u32, u32)>,
    key: ExceltisEtiquetteKey,
) {
    let dedupe = (key.gamme.clone(), key.month, key.year);
    if seen.insert(dedupe) {
        keys.push(key);
    }
}

fn clip_parse_text(text: &str) -> &str {
    if text.len() <= MAX_STELLIUM_PARSE_CHARS {
        return text;
    }
    let mut end = MAX_STELLIUM_PARSE_CHARS;
    while end > 0 && !text.is_char_boundary(end) {
        end -= 1;
    }
    text.get(..end).unwrap_or(text)
}

fn parse_surface(text: &str) -> String {
    normalize_for_gamme_match(clip_parse_text(text))
}

fn build_parse_text(subject: &str, snippet: &str, body: Option<&str>) -> String {
    match body.filter(|b| !b.is_empty()) {
        Some(full) => format!("{subject}\n{snippet}\n{}", clip_parse_text(full)),
        None => format!("{subject}\n{snippet}"),
    }
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

pub fn format_exceltis_etiquette_nom(gamme: Option<&str>, month: u32, year: u32) -> Option<String> {
    let idx = month as usize;
    if idx < 1 || idx > 12 {
        return None;
    }
    let millesime = format!("{} {year}", MOIS_FR[idx - 1]);
    let gamme = gamme.map(str::trim).filter(|g| !g.is_empty());
    Some(match gamme {
        Some(g) => format!("Exceltis {g} — {millesime}"),
        None => format!("{EXCELITIS_ETIQUETTE_PREFIX}{millesime}"),
    })
}

#[derive(Debug, Clone, PartialEq, Eq)]
struct ExceltisEtiquetteKey {
    gamme: Option<String>,
    month: u32,
    year: u32,
}

fn normalize_for_gamme_match(text: &str) -> String {
    normalize_month_key(text)
}

fn parse_exceltis_gamme_from_text(text: &str) -> Option<String> {
    let normalized = normalize_for_gamme_match(text);
    let mut aliases: Vec<(&str, &str)> = GAMME_PARSE_ALIASES.to_vec();
    aliases.sort_by_key(|(pattern, _)| std::cmp::Reverse(pattern.len()));
    for (pattern, canonical) in aliases {
        if normalized.contains(&normalize_for_gamme_match(pattern)) {
            return Some((*canonical).to_string());
        }
    }
    None
}

fn parse_exceltis_key_from_text(text: &str) -> Option<ExceltisEtiquetteKey> {
    let (month, year) = parse_millesime_from_text(text)?;
    let trimmed = text.trim();
    let lower = trimmed.to_lowercase();
    let exceltis_pos = lower.find("exceltis")?;
    let mut month_pos: Option<usize> = None;
    for m in 1..=12u32 {
        if m != month {
            continue;
        }
        for key in month_search_keys(m) {
            if let Some(pos) = lower.find(key) {
                if pos < exceltis_pos || pos > exceltis_pos.saturating_add(120) {
                    continue;
                }
                let slice = trimmed.get(pos..)?;
                if extract_year_after_month(slice, key.len()) != Some(year) {
                    continue;
                }
                month_pos = Some(month_pos.map_or(pos, |best| best.min(pos)));
            }
        }
    }
    let gamme = month_pos
        .and_then(|pos| {
            let fragment = trimmed.get(exceltis_pos + "exceltis".len()..pos)?;
            parse_exceltis_gamme_from_text(fragment)
        })
        .or_else(|| parse_exceltis_gamme_from_text(text));
    Some(ExceltisEtiquetteKey {
        gamme,
        month,
        year,
    })
}

fn millesime_label_from_key(key: &ExceltisEtiquetteKey) -> String {
    format!("{} {}", MOIS_FR[key.month as usize - 1], key.year)
}

/// Match millésime + gamme. Une clé **sans gamme** (étiquette ou signal legacy
/// « Exceltis — {Mois} {Année} ») agit comme joker et matche n'importe quelle
/// gamme du même millésime ; deux gammes explicites doivent être identiques.
fn exceltis_keys_match(a: &ExceltisEtiquetteKey, b: &ExceltisEtiquetteKey) -> bool {
    if a.month != b.month || a.year != b.year {
        return false;
    }
    match (&a.gamme, &b.gamme) {
        (Some(ga), Some(gb)) => ga == gb,
        _ => true,
    }
}

/// Clé effective d'un signal : le sujet complète la gamme si `etiquette_nom` est legacy.
fn effective_exceltis_key_from_signal(signal: &StelliumExceltisSignal) -> Option<ExceltisEtiquetteKey> {
    let from_subject = parse_exceltis_key_from_text(&signal.subject);
    let from_nom = parse_exceltis_key_from_text(&signal.etiquette_nom);
    match (from_nom, from_subject) {
        (Some(mut nom_key), Some(subj_key)) => {
            if nom_key.gamme.is_none() {
                nom_key.gamme = subj_key.gamme;
            }
            Some(nom_key)
        }
        (Some(k), None) => Some(k),
        (None, Some(k)) => Some(k),
        (None, None) => None,
    }
}

pub fn is_exceltis_etiquette_nom(nom: &str) -> bool {
    parse_exceltis_key_from_text(nom).is_some()
}

fn find_etiquette_id_by_exceltis_key(
    db: &crate::database::Database,
    key: &ExceltisEtiquetteKey,
) -> Option<i64> {
    db.get_all_etiquettes()
        .ok()?
        .into_iter()
        .find_map(|e| {
            parse_exceltis_key_from_text(&e.nom)
                .filter(|candidate| exceltis_keys_match(candidate, key))
                .map(|_| e.id)
        })
}

fn resolve_etiquette_id_for_exceltis_key(
    db: &crate::database::Database,
    key: &ExceltisEtiquetteKey,
    canonical_nom: &str,
) -> Option<i64> {
    db.get_etiquette_id_by_nom_insensitive(canonical_nom)
        .ok()
        .flatten()
        .or_else(|| find_etiquette_id_by_exceltis_key(db, key))
}

fn record_etiquette_trigger(state: &mut StelliumExceltisState, signal: &StelliumExceltisSignal) {
    if let Some(etiquette_id) = signal.etiquette_id {
        state
            .etiquette_trigger_at
            .entry(etiquette_id)
            .and_modify(|ts| *ts = (*ts).max(signal.received_at))
            .or_insert(signal.received_at);
    }
}

fn refresh_etiquette_triggers_from_signals(state: &mut StelliumExceltisState) {
    let signals = state.signals.clone();
    for signal in &signals {
        record_etiquette_trigger(state, signal);
    }
}

/// Date du mail Stellium le plus récent pour cette étiquette millésime (si signal connu).
pub fn stellium_signal_received_at_for_etiquette(
    db: &crate::database::Database,
    etiquette_id: i64,
) -> Result<Option<i64>, String> {
    let etiquette = db
        .get_etiquette_by_id(etiquette_id)
        .map_err(|e| e.to_string())?;
    let state = load_state(db)?;
    let etiquette_key = parse_exceltis_key_from_text(&etiquette.nom);
    let mut best: Option<i64> = state.etiquette_trigger_at.get(&etiquette_id).copied();
    for signal in &state.signals {
        let matches_id = signal.etiquette_id == Some(etiquette_id);
        let matches_key = match (etiquette_key.as_ref(), effective_exceltis_key_from_signal(signal)) {
            (Some(ek), Some(sk)) => exceltis_keys_match(ek, &sk),
            _ => false,
        };
        if matches_id || matches_key {
            best = Some(best.map_or(signal.received_at, |b| b.max(signal.received_at)));
        }
    }
    Ok(best)
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
    let anchors = [
        "remboursements exceltis",
        "exceltis rendement",
        "remboursement exceltis",
        "exceltis",
    ];
    let anchor_pos = anchors
        .iter()
        .filter_map(|a| lower.find(a))
        .min()
        .unwrap_or(0);
    find_millesime_after_pos(text, anchor_pos, 200)
}

/// Millésimes repérés dans des blocs « Exceltis … Remboursement : … » (newsletter).
fn parse_remboursement_blocks_from_text(text: &str) -> Vec<ExceltisEtiquetteKey> {
    let surface = parse_surface(text);
    if !surface.contains("exceltis") {
        return vec![];
    }
    let mut keys = Vec::new();
    let mut seen: HashSet<(Option<String>, u32, u32)> = HashSet::new();
    let mut search_start = 0;
    while search_start < surface.len() {
        let Some(rel) = surface[search_start..].find("exceltis") else {
            break;
        };
        let exceltis_pos = search_start + rel;
        let next_pos = surface[exceltis_pos + "exceltis".len()..]
            .find("exceltis")
            .map(|p| exceltis_pos + "exceltis".len() + p);
        // Borner sur une frontière UTF-8 : `exceltis_pos + 500` peut tomber au milieu d'un
        // caractère multi-octets (espace insécable, emoji…), et `surface.get(..)` renverrait
        // alors `None` → le bloc serait silencieusement sauté.
        // Borner sur une frontière UTF-8 : `exceltis_pos + 500` peut tomber au milieu d'un
        // caractère multi-octets (espace insécable, emoji…), et `surface.get(..)` renverrait
        // alors `None` → le bloc serait silencieusement sauté.
        let window_end = floor_char_boundary(
            &surface,
            next_pos
                .unwrap_or(surface.len())
                .min(exceltis_pos + REMBOURSEMENT_BLOCK_WINDOW),
        );
        if let Some(fragment) = surface.get(exceltis_pos..window_end) {
            // `window_looks_like_remboursement_block` intègre déjà l'exclusion
            // (avec priorité à la preuve forte « Remboursement : … / Date d'observation »).
            if !window_looks_like_remboursement_block(fragment) {
                search_start = exceltis_pos + "exceltis".len();
                continue;
            }
            if let Some((month, year)) =
                find_millesime_after_pos(fragment, 0, MILLESIME_MAX_GAP_FROM_EXCELTIS)
            {
                let gamme = parse_exceltis_gamme_from_text(fragment);
                push_unique_exceltis_key(
                    &mut keys,
                    &mut seen,
                    ExceltisEtiquetteKey {
                        gamme,
                        month,
                        year,
                    },
                );
            }
        }
        search_start = exceltis_pos + "exceltis".len();
    }
    keys
}

fn keys_for_stellium_message(
    subject: &str,
    parse_text: &str,
    body_only: Option<&str>,
) -> Vec<ExceltisEtiquetteKey> {
    if subject_is_direct_remboursement(subject) {
        if let Some(k) = parse_exceltis_key_from_text(subject) {
            return vec![k];
        }
    }
    if subject_is_announcement_newsletter(subject) {
        let src = body_only
            .filter(|b| !b.is_empty())
            .map(clip_parse_text)
            .unwrap_or_else(|| clip_parse_text(parse_text));
        return parse_remboursement_blocks_from_text(src);
    }
    if let Some(k) = parse_exceltis_key_from_text(subject) {
        return vec![k];
    }
    if let Some(body) = body_only.filter(|b| !b.is_empty()) {
        let body = clip_parse_text(body);
        if let Some(k) = parse_exceltis_key_from_text(body) {
            return vec![k];
        }
        let from_body = parse_remboursement_blocks_from_text(body);
        if !from_body.is_empty() {
            return from_body;
        }
    }
    parse_remboursement_blocks_from_text(clip_parse_text(parse_text))
}

fn format_signal_id(message_id: &str, key: &ExceltisEtiquetteKey) -> String {
    let gamme = key.gamme.as_deref().unwrap_or("legacy");
    format!("{message_id}::{gamme}::{}::{}", key.month, key.year)
}

/// Masquage UI : id Gmail brut ou id composite `message_id::gamme::mois::année`.
fn is_stellium_message_dismissed(dismissed: &HashSet<String>, message_id: &str) -> bool {
    if dismissed.contains(message_id) {
        return true;
    }
    let prefix = format!("{message_id}::");
    dismissed.iter().any(|id| id.starts_with(&prefix))
}

/// Extrait le millésime depuis le sujet ou le corps (ex. « Remboursement Exceltis Février 2025 »).
pub fn parse_millesime_from_text(text: &str) -> Option<(u32, u32)> {
    let clipped = clip_parse_text(text);
    find_millesime_near_exceltis(clipped).or_else(|| {
        let surface = parse_surface(clipped);
        if !surface.contains("exceltis") {
            return None;
        }
        find_millesime_after_pos(&surface, 0, MILLESIME_MAX_GAP_FROM_EXCELTIS.saturating_mul(2))
    })
}

/// « À partir du 06 mars 2026 » → libellé « 6 mars 2026 ».
pub fn parse_operation_from_date(text: &str) -> Option<String> {
    let clipped = clip_parse_text(text);
    let lower = clipped.to_lowercase();
    let idx = lower
        .find("a partir du")
        .or_else(|| lower.find("à partir du"))?;
    let slice = clipped.get(idx..)?;
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
        "from:{GMAIL_FROM} (subject:\"Remboursement Exceltis\" OR subject:\"Remboursements Exceltis\") -subject:\"Informations complémentaires\" newer_than:{GMAIL_QUERY_RECENCY_DAYS}d -in:spam -in:trash"
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
    let resolved = db
        .get_etiquette_id_by_nom_insensitive(&signal.etiquette_nom)
        .ok()
        .flatten()
        .or_else(|| {
            effective_exceltis_key_from_signal(signal)
                .and_then(|key| find_etiquette_id_by_exceltis_key(db, &key))
        });
    if let Some(id) = resolved {
        signal.etiquette_id = Some(id);
        signal.contact_count = db.count_contacts_for_etiquette(id).unwrap_or(0);
    }
}

/// Répare les signaux persistés avant correction snake_case (champs vides côté UI).
fn repair_signal_metadata(signal: &mut StelliumExceltisSignal) {
    let Some(key) = effective_exceltis_key_from_signal(signal) else {
        return;
    };
    if let Some(etiquette_nom) =
        format_exceltis_etiquette_nom(key.gamme.as_deref(), key.month, key.year)
    {
        signal.millesime_label = millesime_label_from_key(&key);
        signal.etiquette_nom = etiquette_nom;
    }
}

fn build_signal_for_key(
    db: &crate::database::Database,
    message_id: &str,
    subject: &str,
    key: &ExceltisEtiquetteKey,
    received_at: i64,
    operation_from_label: Option<String>,
) -> Option<StelliumExceltisSignal> {
    let etiquette_nom = format_exceltis_etiquette_nom(key.gamme.as_deref(), key.month, key.year)?;
    let millesime_label = millesime_label_from_key(key);
    let signal_id = format_signal_id(message_id, key);
    let etiquette_id = resolve_etiquette_id_for_exceltis_key(db, key, &etiquette_nom);
    let contact_count = etiquette_id
        .map(|id| db.count_contacts_for_etiquette(id).unwrap_or(0))
        .unwrap_or(0);
    Some(StelliumExceltisSignal {
        gmail_message_id: signal_id,
        subject: subject.to_string(),
        millesime_label,
        etiquette_nom,
        etiquette_id,
        contact_count,
        received_at,
        operation_from_label,
    })
}

#[cfg(test)]
fn resolve_signals_from_message(
    db: &crate::database::Database,
    message_id: String,
    subject: String,
    parse_text: &str,
    body_only: Option<&str>,
    received_at: i64,
) -> Vec<StelliumExceltisSignal> {
    if is_complementaires_subject(&subject) {
        return vec![];
    }
    let operation_from_label = parse_operation_from_date(
        body_only.filter(|b| !b.is_empty()).unwrap_or(parse_text),
    );
    keys_for_stellium_message(&subject, parse_text, body_only)
        .into_iter()
        .filter_map(|key| {
            build_signal_for_key(
                db,
                &message_id,
                &subject,
                &key,
                received_at,
                operation_from_label.clone(),
            )
        })
        .collect()
}

fn etiquette_nom_has_gamme(nom: &str) -> bool {
    parse_exceltis_key_from_text(nom)
        .and_then(|k| k.gamme)
        .is_some()
}

fn upsert_signal_by_key(
    signals: &mut Vec<StelliumExceltisSignal>,
    incoming: StelliumExceltisSignal,
) -> bool {
    let Some(incoming_key) = effective_exceltis_key_from_signal(&incoming) else {
        signals.push(incoming);
        return true;
    };
    if let Some(existing) = signals.iter_mut().find(|s| {
        effective_exceltis_key_from_signal(s)
            .map(|k| exceltis_keys_match(&k, &incoming_key))
            .unwrap_or(false)
    }) {
        if incoming.received_at >= existing.received_at {
            existing.gmail_message_id = incoming.gmail_message_id;
            existing.subject = incoming.subject;
            existing.received_at = incoming.received_at;
            if incoming.operation_from_label.is_some() {
                existing.operation_from_label = incoming.operation_from_label;
            }
        }
        if etiquette_nom_has_gamme(&incoming.etiquette_nom)
            || !etiquette_nom_has_gamme(&existing.etiquette_nom)
        {
            existing.etiquette_nom = incoming.etiquette_nom.clone();
            existing.millesime_label = incoming.millesime_label.clone();
        }
        false
    } else {
        signals.push(incoming);
        true
    }
}

fn sanitize_stellium_state(state: &mut StelliumExceltisState) -> bool {
    let before = state.signals.len();
    state
        .signals
        .retain(|s| !is_complementaires_subject(&s.subject));
    let mut deduped: Vec<StelliumExceltisSignal> = Vec::new();
    for signal in state.signals.drain(..) {
        let _ = upsert_signal_by_key(&mut deduped, signal);
    }
    state.signals = deduped;
    refresh_etiquette_triggers_from_signals(state);
    state.signals.len() != before
}

/// Supprime les signaux déjà enregistrés pour un message Gmail avant mise à jour.
fn remove_signals_for_message(state: &mut StelliumExceltisState, message_id: &str) {
    let prefix = format!("{message_id}::");
    state.signals.retain(|s| {
        s.gmail_message_id != message_id && !s.gmail_message_id.starts_with(&prefix)
    });
}

fn visible_stellium_signals(state: &StelliumExceltisState) -> Vec<StelliumExceltisSignal> {
    let dismissed: HashSet<String> = state.dismissed_message_ids.iter().cloned().collect();
    state
        .signals
        .iter()
        .filter(|s| {
            if dismissed.contains(&s.gmail_message_id) {
                return false;
            }
            if let Some(raw) = s.gmail_message_id.split("::").next() {
                return !is_stellium_message_dismissed(&dismissed, raw);
            }
            true
        })
        .cloned()
        .collect()
}

pub fn get_stellium_exceltis_signals(db_state: &DbState) -> Result<Vec<StelliumExceltisSignal>, String> {
    with_db(db_state, |db| {
        let mut state = load_state(db)?;
        let mut changed = sanitize_stellium_state(&mut state);
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
        Ok(visible_stellium_signals(&state))
    })
}

/// Masque l’annonce UI — conserve le signal pour la planification campagne Exceltis.
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
        refresh_etiquette_triggers_from_signals(&mut state);
        if !state.dismissed_message_ids.contains(&id) {
            state.dismissed_message_ids.push(id);
        }
        save_state(db, &state)
    })
}

/// Ré-affiche toutes les annonces masquées : vide la liste des messages masqués
/// et les compteurs d'échec de parsing. Le prochain scan repopule les signaux.
pub fn reset_stellium_exceltis_dismissed(db_state: &DbState) -> Result<(), String> {
    with_db(db_state, |db| {
        let mut state = load_state(db)?;
        state.dismissed_message_ids.clear();
        state.parse_retry_by_message_id.clear();
        save_state(db, &state)
    })
}

/// Résultat intermédiaire : fetch Gmail hors verrou DB.
struct StelliumFetchedMessage {
    message_id: String,
    subject: String,
    received_at: i64,
    keys: Vec<ExceltisEtiquetteKey>,
    operation_from_label: Option<String>,
    remboursement_unparsed: bool,
    mark_dismissed: bool,
}

fn fetch_stellium_message_keys(
    client: &reqwest::blocking::Client,
    access_token: &str,
    message_id: &str,
    dismissed: &HashSet<String>,
) -> Option<StelliumFetchedMessage> {
    let meta = match fetch_message_meta(client, access_token, message_id) {
        Ok(m) => m,
        Err(e) => {
            eprintln!("Stellium meta {message_id}: {e}");
            return None;
        }
    };
    let headers = meta.payload.as_ref().and_then(|p| p.headers.as_deref());
    let subject = header_value(headers, "Subject");
    if subject.is_empty() {
        return None;
    }
    if is_complementaires_subject(&subject) {
        return Some(StelliumFetchedMessage {
            message_id: message_id.to_string(),
            subject,
            received_at: 0,
            keys: vec![],
            operation_from_label: None,
            remboursement_unparsed: false,
            mark_dismissed: true,
        });
    }
    if dismissed.contains(message_id) && !subject_looks_like_exceltis_remboursement(&subject) {
        return None;
    }
    let from = header_value(headers, "From").to_lowercase();
    if !from.contains("stellium") && !from.contains(GMAIL_FROM) {
        return None;
    }
    let received_at = meta
        .internal_date
        .as_deref()
        .map(parse_internal_date_sec)
        .unwrap_or(0);

    let snippet = meta.snippet.unwrap_or_default();
    let mut parse_text = build_parse_text(&subject, &snippet, None);
    let mut body_owned: Option<String> = None;

    let mut keys = keys_for_stellium_message(&subject, &parse_text, None);
    if keys.is_empty() {
        if let Ok(full) =
            super::response_sync::gmail_fetch_message_body(client, access_token, message_id)
        {
            if !full.is_empty() {
                body_owned = Some(full);
            }
        }
    }
    let body_ref = body_owned.as_deref();
    if keys.is_empty() {
        if let Some(body) = body_ref {
            parse_text = build_parse_text(&subject, &snippet, Some(body));
            keys = keys_for_stellium_message(&subject, &parse_text, Some(body));
        }
    }

    let operation_from_label = parse_operation_from_date(
        body_ref.filter(|b| !b.is_empty()).unwrap_or(&parse_text),
    );

    let remboursement_unparsed =
        keys.is_empty() && subject_looks_like_exceltis_remboursement(&subject);
    let mark_dismissed = keys.is_empty()
        && !remboursement_unparsed
        && !dismissed.contains(message_id);

    Some(StelliumFetchedMessage {
        message_id: message_id.to_string(),
        subject,
        received_at,
        keys,
        operation_from_label,
        remboursement_unparsed,
        mark_dismissed,
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

    let dismissed: HashSet<String> = with_db(db_state, |db| {
        let state = load_state(db)?;
        Ok(state
            .dismissed_message_ids
            .iter()
            .cloned()
            .collect::<HashSet<_>>())
    })?;

    let fetched: Vec<StelliumFetchedMessage> = all_ids
        .iter()
        .filter_map(|message_id| {
            fetch_stellium_message_keys(&client, &access_token, message_id, &dismissed)
        })
        .collect();

    let mut new_signals = 0u32;

    with_db(db_state, |db| {
        let mut state = load_state(db)?;
        sanitize_stellium_state(&mut state);
        let dismissed: HashSet<String> = state.dismissed_message_ids.iter().cloned().collect();

        for item in fetched {
            if is_complementaires_subject(&item.subject) {
                if !state.dismissed_message_ids.contains(&item.message_id) {
                    state.dismissed_message_ids.push(item.message_id);
                }
                continue;
            }
            if dismissed.contains(&item.message_id)
                && subject_looks_like_exceltis_remboursement(&item.subject)
            {
                state.parse_retry_by_message_id.remove(&item.message_id);
            }
            if !item.keys.is_empty() {
                let was_dismissed = is_stellium_message_dismissed(&dismissed, &item.message_id);
                if !was_dismissed {
                    state.parse_retry_by_message_id.remove(&item.message_id);
                    state
                        .dismissed_message_ids
                        .retain(|id| id != &item.message_id);
                    remove_signals_for_message(&mut state, &item.message_id);
                }
                for key in item.keys {
                    if was_dismissed {
                        continue;
                    }
                    if let Some(signal) = build_signal_for_key(
                        db,
                        &item.message_id,
                        &item.subject,
                        &key,
                        item.received_at,
                        item.operation_from_label.clone(),
                    ) {
                        if dismissed.contains(&signal.gmail_message_id) {
                            continue;
                        }
                        if upsert_signal_by_key(&mut state.signals, signal.clone()) {
                            new_signals += 1;
                        }
                        record_etiquette_trigger(&mut state, &signal);
                    }
                }
            } else if item.remboursement_unparsed {
                eprintln!(
                    "Stellium Exceltis: sujet non parsé — {:?}",
                    item.subject
                );
                record_parse_failure(&mut state, &item.message_id);
            } else if item.mark_dismissed
                && !state.dismissed_message_ids.contains(&item.message_id)
            {
                state.dismissed_message_ids.push(item.message_id);
            }
        }

        sanitize_stellium_state(&mut state);
        for signal in &mut state.signals {
            refresh_signal_counts(db, signal);
        }

        if let Ok(etiquettes) = db.get_all_etiquettes() {
            for etiquette in etiquettes {
                if is_exceltis_etiquette_nom(&etiquette.nom) {
                    let _ = db.sync_exceltis_etiquette_email_schedule(etiquette.id);
                }
            }
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
    fn is_exceltis_etiquette_nom_matches_prefix() {
        assert!(is_exceltis_etiquette_nom("Exceltis Rendement — Août 2026"));
        assert!(is_exceltis_etiquette_nom("Exceltis — Août 2026"));
        assert!(is_exceltis_etiquette_nom("Exceltis Rendement - Août 2026"));
        assert!(!is_exceltis_etiquette_nom("Suivi > 1 an"));
        assert!(!is_exceltis_etiquette_nom("Exceltis — remboursement et arbitrage"));
    }

    #[test]
    fn parse_etiquette_nom_variants() {
        let key = parse_exceltis_key_from_text("Exceltis Rendement - fevrier 2025").unwrap();
        assert_eq!(key.gamme.as_deref(), Some("Rendement"));
        assert_eq!(key.month, 2);
        assert_eq!(key.year, 2025);
    }

    #[test]
    fn parse_patrimoine_taux_maps_to_patrimoine() {
        let key = parse_exceltis_key_from_text("Exceltis Patrimoine Taux Juin 2026").unwrap();
        assert_eq!(key.gamme.as_deref(), Some("Patrimoine"));
        assert_eq!(key.month, 6);
        assert_eq!(key.year, 2026);
    }

    #[test]
    fn decode_mime_subject_fevrier_partial() {
        let raw = "Remboursement Exceltis Rendement =?UTF-8?Q?F=C3=A9vrier?= 2025";
        let decoded = decode_mime_header(raw);
        assert_eq!(decoded, "Remboursement Exceltis Rendement Février 2025");
        let key = parse_exceltis_key_from_text(&decoded).unwrap();
        assert_eq!(key.gamme.as_deref(), Some("Rendement"));
        assert_eq!(key.month, 2);
        assert_eq!(key.year, 2025);
    }

    #[test]
    fn decode_mime_subject_aout_full() {
        let raw = "=?UTF-8?Q?Remboursement_Exceltis_Rendement_Ao=C3=BBt_2026?=";
        let decoded = decode_mime_header(raw);
        assert_eq!(decoded, "Remboursement Exceltis Rendement Août 2026");
        let key = parse_exceltis_key_from_text(&decoded).unwrap();
        assert_eq!(key.month, 8);
        assert_eq!(key.year, 2026);
    }

    #[test]
    fn parse_subject_fevrier_2025() {
        let s = "Remboursement Exceltis Rendement Février 2025";
        let key = parse_exceltis_key_from_text(s).unwrap();
        assert_eq!(key.gamme.as_deref(), Some("Rendement"));
        assert_eq!(key.month, 2);
        assert_eq!(key.year, 2025);
        assert_eq!(
            format_exceltis_etiquette_nom(key.gamme.as_deref(), key.month, key.year).as_deref(),
            Some("Exceltis Rendement — Février 2025")
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
    fn is_complementaires_subject_excluded() {
        let s = "Informations complémentaires Remboursement Exceltis Rendement Octobre 2024";
        assert!(is_complementaires_subject(s));
        assert!(resolve_signals_from_message(
            &crate::database::Database::open_in_memory_for_tests().unwrap(),
            "msg".into(),
            s.into(),
            s,
            None,
            0,
        )
        .is_empty());
    }

    #[test]
    fn newsletter_parsed_from_body_not_subject() {
        let subject = "Bonne nouvelle 🤙 2 Remboursements Exceltis à venir !";
        let body = r#"Exceltis Rendement
Mai 2025
💰 Remboursement : 111,0004%*
Exceltis Sérénité
Mai 2024
💰 Remboursement : 111%*
Exceltis Rendement Août 2026 est désormais accessible sur votre Extranet Placement"#;
        let keys = parse_remboursement_blocks_from_text(body);
        assert_eq!(keys.len(), 2);
        let db = crate::database::Database::open_in_memory_for_tests().unwrap();
        let signals = resolve_signals_from_message(
            &db,
            "msg".into(),
            subject.into(),
            subject,
            Some(body),
            0,
        );
        assert_eq!(signals.len(), 2);
    }

    #[test]
    fn month_mai_not_matched_inside_email_word() {
        let text = "contact email marketplacement@stellium.fr Exceltis Rendement Mai 2025 Remboursement : 111%";
        let (m, y) = find_millesime_after_pos(text, 0, 500).unwrap();
        assert_eq!(m, 5);
        assert_eq!(y, 2025);
    }

    #[test]
    fn real_newsletter_body_detects_two_millesimes() {
        // Structure réelle Stellium (markdown) : 1er bloc > 500 octets avant le « Exceltis »
        // suivant (lignes ◆, indice long, emojis 💰📈📅) → la borne de fenêtre tombe au milieu
        // d'un caractère multi-octets ; sans clamp UTF-8 le bloc Rendement était sauté.
        let subject = "Bonne nouvelle 🤙 2 Remboursements Exceltis à venir !";
        let block_rendement = "Exceltis Rendement\u{a0}\r\n-------------------\r\n\r\nMai 2025\r\n--------\r\n\r\n+ 11,0004%*\r\n===========\r\n\r\n◆ ISIN : **FR001400WRY7**\r\n\r\n◆ Coupon avec effet mémoire : **11% /an**\r\n\r\n◆ Air bag : **- 30%**\r\n\r\n◆ Rappel : Mensuel\r\n\r\n◆ Protection en capital : ** -50%**\r\n\r\n◆ Durée max : **10 ans**\r\n\r\n◆ Indice de Référence : ** iEdge Transatlantic Leaders 20 Decrement 50 Points GTR**\r\n\r\n💰 Remboursement : **111,0004%***\r\n\r\n📈 Performance Indice de référence  : **29,32%**\r\n\r\n📅 Date d'observation : ** 01/06/2026**\r\n\r\n";
        let block_serenite = "Exceltis Sérénité\u{a0}\r\n------------------\r\n\r\nMai 2024\r\n--------\r\n\r\n+ 11%*\r\n======\r\n\r\n◆ ISIN : **FR1459AB2429**\r\n\r\n◆ Coupon avec effet mémoire : **5,5% /an**\r\n\r\n◆ Air bag : **- 20%**\r\n\r\n◆ Rappel : Annuel\r\n\r\n◆ Protection en capital : **100%**\r\n\r\n◆ Durée max : **10 ans**\r\n\r\n◆ Indice de Référence : **Morningstar Eurozone 30 Decrement 50 Point GR EUR**\r\n\r\n💰 Remboursement : **111%***\r\n\r\n📈 Performance Indice de référence  : **57,11%**\r\n\r\n📅 Date d'observation :  **01/06/2026**\r\n\r\n";
        let body = format!(
            "[Ouvrir dans votre navigateur](https://example.com/x)\r\n\r\nBonne nouvelle 🤩\r\n----------------\r\n\r\n2 remboursements Exceltis à venir 🚀\r\n\r\nNous avons le plaisir de vous annoncer le déclenchement de la mécanique de remboursement par anticipation de deux millésimes Exceltis à la 1ère date de constatation 🤩\r\n\r\n{block_rendement}{block_serenite}**hors frais d'entrée**\r\n\r\n**pour en savoir plus sur les millésimes remboursés,**\r\n-------------------------------------------------------\r\n\r\n**retrouvez toutes les informations sur l'Extranet Placement**\r\n----------------------------------------------------------------\r\n\r\n◆ Exceltis Rendement\u{a0}\r\nMai 2025\r\n◆ Exceltis Sérénité\u{a0}\r\nMai 2024\r\n\r\n**À partir du 08 juin 2026**, les compagnies d'assurance vont désinvestir les sommes investies sur les lignes \"EXCELTIS Rendement Mai 2025\" et \"EXCELTIS Sérénité Mai 2024\".\r\n\r\nRappel 🔔 vos 2 millésimes à l'affiche\r\nExceltis Rendement\u{a0}\r\nAoût 2026\r\nExceltis Patrimoine Taux\r\nJuin 2026"
        );
        let body = body.as_str();
        let keys = parse_remboursement_blocks_from_text(body);
        assert_eq!(keys.len(), 2, "keys = {keys:?}");
        assert!(
            keys.iter().any(|k| k.gamme.as_deref() == Some("Rendement")
                && k.month == 5
                && k.year == 2025),
            "Rendement Mai 2025 manquant : {keys:?}"
        );
        assert!(
            keys.iter().any(|k| k.gamme.as_deref() == Some("Sérénité")
                && k.month == 5
                && k.year == 2024),
            "Sérénité Mai 2024 manquant : {keys:?}"
        );
        let db = crate::database::Database::open_in_memory_for_tests().unwrap();
        let signals = resolve_signals_from_message(
            &db,
            "msg-news".into(),
            subject.into(),
            &format!("{subject}\n{body}"),
            Some(body),
            0,
        );
        assert_eq!(signals.len(), 2, "signals = {signals:?}");
    }

    #[test]
    fn block_window_boundary_in_multibyte_char_does_not_skip_block() {
        // Le 2e « exceltis » est à > 500 octets et l'octet 500 tombe au milieu d'un « é »
        // (2 octets) : sans clamp UTF-8, `surface.get(0..500)` = None → bloc Rendement sauté.
        let pad = "x".repeat(452);
        let body = format!(
            "exceltis rendement mai 2025 remboursement : 1% {pad}\u{a0} exceltis serenite mai 2024 remboursement : 1%"
        );
        let keys = parse_remboursement_blocks_from_text(&body);
        assert_eq!(keys.len(), 2, "keys = {keys:?}");
        assert!(keys.iter().any(|k| k.month == 5 && k.year == 2025), "{keys:?}");
        assert!(keys.iter().any(|k| k.month == 5 && k.year == 2024), "{keys:?}");
    }

    #[test]
    fn real_direct_mail_detects_from_subject() {
        let subject = "Remboursement Exceltis Rendement Février 2025";
        let key = parse_exceltis_key_from_text(subject).unwrap();
        assert_eq!(key.gamme.as_deref(), Some("Rendement"));
        assert_eq!((key.month, key.year), (2, 2025));
        let db = crate::database::Database::open_in_memory_for_tests().unwrap();
        let signals = resolve_signals_from_message(
            &db,
            "msg-direct".into(),
            subject.into(),
            subject,
            None,
            0,
        );
        assert_eq!(signals.len(), 1, "signals = {signals:?}");
    }

    #[test]
    fn find_millesime_no_panic_with_nbsp_at_window_edge() {
        // `\u{a0}` fait 2 octets : on remplit pour qu'une coupe à 400 tombe au milieu.
        let mut text = String::from("exceltis serenite mai 2024 ");
        while text.len() < 400 {
            text.push('\u{a0}');
        }
        let (m, y) = find_millesime_after_pos(&text, 0, 400).unwrap();
        assert_eq!((m, y), (5, 2024));
    }

    #[test]
    fn parse_newsletter_two_millesimes() {
        let subject = "Bonne nouvelle 🤙 2 Remboursements Exceltis à venir !";
        let body = r#"Exceltis Rendement 
Mai 2025
◆ ISIN : FR001400WRY7
💰 Remboursement : 111,0004%*
Exceltis Sérénité 
Mai 2024
◆ ISIN : FR1459AB2429
💰 Remboursement : 111%*
À partir du 08 juin 2026, les compagnies d'assurance vont désinvestir"#;
        let parse_text = format!("{subject}\n{body}");
        let keys = parse_remboursement_blocks_from_text(body);
        assert_eq!(keys.len(), 2);
        assert_eq!(keys[0].gamme.as_deref(), Some("Rendement"));
        assert_eq!(keys[0].month, 5);
        assert_eq!(keys[0].year, 2025);
        assert_eq!(keys[1].gamme.as_deref(), Some("Sérénité"));
        assert_eq!(keys[1].month, 5);
        assert_eq!(keys[1].year, 2024);
        let db = crate::database::Database::open_in_memory_for_tests().unwrap();
        let signals = resolve_signals_from_message(
            &db,
            "msg".into(),
            subject.into(),
            &parse_text,
            Some(body),
            0,
        );
        assert_eq!(signals.len(), 2);
        assert_eq!(
            parse_operation_from_date(body).as_deref(),
            Some("8 Juin 2026")
        );
    }

    #[test]
    fn newsletter_ignores_extranet_and_fermeture_mentions() {
        let subject = "Bonne nouvelle 🤙 2 Remboursements Exceltis à venir !";
        let body = r#"Exceltis Rendement Mai 2025
💰 Remboursement : 111%
Exceltis Sérénité Mai 2024
💰 Remboursement : 111%
Exceltis Rendement Août 2026 est désormais accessible sur votre Extranet Placement
Fermeture imminente d'Exceltis Rendement Juin 2026"#;
        let parse_text = format!("{subject}\n{body}");
        let db = crate::database::Database::open_in_memory_for_tests().unwrap();
        let signals = resolve_signals_from_message(
            &db,
            "msg".into(),
            subject.into(),
            &parse_text,
            Some(body),
            0,
        );
        assert_eq!(signals.len(), 2);
        assert!(signals.iter().all(|s| {
            s.millesime_label == "Mai 2025" || s.millesime_label == "Mai 2024"
        }));
    }

    #[test]
    fn direct_remboursement_uses_subject_only() {
        let subject = "Remboursement Exceltis Rendement Février 2025";
        let body = "Exceltis Rendement Août 2026 est désormais accessible sur votre Extranet Placement";
        let parse_text = format!("{subject}\n{body}");
        let db = crate::database::Database::open_in_memory_for_tests().unwrap();
        let signals = resolve_signals_from_message(
            &db,
            "msg".into(),
            subject.into(),
            &parse_text,
            Some(body),
            0,
        );
        assert_eq!(signals.len(), 1);
        assert_eq!(signals[0].millesime_label, "Février 2025");
    }

    #[test]
    fn upsert_dedupes_same_millesime() {
        let mut signals = Vec::new();
        let mk = |id: &str, received: i64| StelliumExceltisSignal {
            gmail_message_id: id.into(),
            subject: "Remboursement Exceltis Rendement Octobre 2024".into(),
            millesime_label: "Octobre 2024".into(),
            etiquette_nom: "Exceltis Rendement — Octobre 2024".into(),
            etiquette_id: None,
            contact_count: 0,
            received_at: received,
            operation_from_label: None,
        };
        assert!(upsert_signal_by_key(&mut signals, mk("a", 100)));
        assert!(!upsert_signal_by_key(&mut signals, mk("b", 200)));
        assert_eq!(signals.len(), 1);
        assert_eq!(signals[0].gmail_message_id, "b");
    }

    #[test]
    fn parse_subject_informations_complementaires() {
        let s = "Informations complémentaires Remboursement Exceltis Rendement Octobre 2024";
        let (m, y) = parse_millesime_from_text(s).unwrap();
        assert_eq!(m, 10);
        assert_eq!(y, 2024);
        assert!(is_complementaires_subject(s));
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
        assert_eq!(signal.etiquette_nom, "Exceltis Rendement — Octobre 2024");
    }

    #[test]
    fn legacy_signal_nom_upgraded_from_subject_gamme() {
        let mut signal = StelliumExceltisSignal {
            gmail_message_id: "legacy".into(),
            subject: "Remboursement Exceltis Rendement Août 2026".into(),
            millesime_label: "Août 2026".into(),
            etiquette_nom: "Exceltis — Août 2026".into(),
            etiquette_id: None,
            contact_count: 0,
            received_at: 1,
            operation_from_label: None,
        };
        repair_signal_metadata(&mut signal);
        assert_eq!(signal.etiquette_nom, "Exceltis Rendement — Août 2026");
        let etiquette_key = parse_exceltis_key_from_text("Exceltis Rendement — Août 2026").unwrap();
        let signal_key = effective_exceltis_key_from_signal(&signal).unwrap();
        assert!(exceltis_keys_match(&etiquette_key, &signal_key));
    }

    #[test]
    fn is_stellium_message_dismissed_matches_composite_signal_id() {
        let mut dismissed = HashSet::new();
        dismissed.insert("gmail-abc::Rendement::12::2024".into());
        assert!(is_stellium_message_dismissed(&dismissed, "gmail-abc"));
        assert!(!is_stellium_message_dismissed(&dismissed, "gmail-other"));
    }

    #[test]
    fn dismiss_masks_ui_but_keeps_signal_for_scheduling() {
        let mut state = StelliumExceltisState::default();
        let signal = StelliumExceltisSignal {
            gmail_message_id: "msg-exceltis-1::Rendement::12::2024".into(),
            subject: "Remboursement Exceltis Rendement Décembre 2024".into(),
            millesime_label: "Décembre 2024".into(),
            etiquette_nom: "Exceltis Rendement — Décembre 2024".into(),
            etiquette_id: Some(42),
            contact_count: 16,
            received_at: 1_735_000_000,
            operation_from_label: None,
        };
        state.signals.push(signal);
        state
            .dismissed_message_ids
            .push("msg-exceltis-1::Rendement::12::2024".into());

        assert!(visible_stellium_signals(&state).is_empty());
        assert_eq!(state.signals.len(), 1);
        assert_eq!(
            state.signals[0].gmail_message_id,
            "msg-exceltis-1::Rendement::12::2024"
        );
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
