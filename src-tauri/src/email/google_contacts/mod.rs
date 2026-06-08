mod phone;
mod index;

use index::GoogleContactIndex;

use super::oauth_send::refresh_connection_if_needed;
use super::oauth_store::EmailOAuthStore;
use crate::commands::DbState;
use crate::database::models::Contact;
use crate::database::Database;
use reqwest::blocking::Client;
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, State};

pub use phone::{normalize_phone_for_match, phone_for_google_export, phones_match};

use std::collections::HashMap;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Mutex;
use std::time::{Duration, Instant};

const PEOPLE_BASE: &str = "https://people.googleapis.com/v1";
const READ_MASK: &str = "names,emailAddresses,phoneNumbers,metadata";
/// Marge sous la limite Google (~90 lectures critiques / min / utilisateur).
const MAX_CRITICAL_READS_PER_MINUTE: u32 = 75;
const RATE_LIMIT_RETRY_SECS: u64 = 65;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GoogleContactSyncResult {
    pub action: String,
    pub resource_name: Option<String>,
    pub enriched_email: bool,
    pub enriched_phone: bool,
    #[serde(default)]
    pub duplicates_removed: u32,
    pub message: Option<String>,
}

#[derive(Debug, Deserialize)]
struct SearchContactsResponse {
    results: Option<Vec<SearchResult>>,
}

#[derive(Debug, Deserialize)]
struct SearchResult {
    person: Option<GooglePerson>,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
struct GooglePersonMetadata {
    #[serde(default)]
    sources: Vec<GooglePersonSource>,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
struct GooglePersonSource {
    #[serde(default)]
    etag: Option<String>,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
pub(super) struct GooglePerson {
    #[serde(rename = "resourceName", default)]
    resource_name: Option<String>,
    #[serde(default)]
    etag: Option<String>,
    #[serde(default)]
    metadata: Option<GooglePersonMetadata>,
    #[serde(default)]
    names: Vec<GoogleName>,
    #[serde(rename = "emailAddresses", default)]
    email_addresses: Vec<GoogleEmail>,
    #[serde(rename = "phoneNumbers", default)]
    phone_numbers: Vec<GooglePhone>,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
struct GoogleName {
    #[serde(rename = "givenName", default)]
    given_name: Option<String>,
    #[serde(rename = "familyName", default)]
    family_name: Option<String>,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
struct GoogleEmail {
    value: Option<String>,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
struct GooglePhone {
    value: Option<String>,
}

#[derive(Debug, Deserialize)]
struct CreateContactResponse {
    #[serde(rename = "resourceName")]
    resource_name: Option<String>,
}

fn with_db<T, F>(db_state: &DbState, f: F) -> Result<T, String>
where
    F: FnOnce(&Database) -> Result<T, String>,
{
    let guard = db_state.lock().map_err(|_| "Base non accessible.".to_string())?;
    let db = guard.as_ref().ok_or("Base non initialisée.")?;
    f(db)
}

fn google_access_token(app: &AppHandle) -> Result<String, String> {
    let store = EmailOAuthStore::load(app)?;
    let mut conn = store
        .connection
        .clone()
        .ok_or("Connectez Google dans Paramètres → Email pour synchroniser les contacts.")?;
    if conn.provider != "google" {
        return Err("La sync Google Contacts nécessite un compte Google.".into());
    }
    refresh_connection_if_needed(app, &mut conn)?;
    Ok(conn.access_token)
}

fn auth_client(token: &str) -> Client {
    let mut headers = reqwest::header::HeaderMap::new();
    headers.insert(
        reqwest::header::AUTHORIZATION,
        format!("Bearer {token}").parse().expect("bearer header"),
    );
    headers.insert(
        reqwest::header::CONTENT_TYPE,
        "application/json".parse().expect("content-type"),
    );
    Client::builder()
        .timeout(std::time::Duration::from_secs(30))
        .default_headers(headers)
        .build()
        .unwrap_or_else(|_| Client::new())
}

pub(super) fn trim_opt(s: Option<&String>) -> Option<String> {
    s.and_then(|v| {
        let t = v.trim();
        if t.is_empty() {
            None
        } else {
            Some(t.to_string())
        }
    })
}

fn person_primary_email(person: &GooglePerson) -> Option<String> {
    person
        .email_addresses
        .iter()
        .find_map(|e| trim_opt(e.value.as_ref()))
}

fn person_primary_phone(person: &GooglePerson) -> Option<String> {
    person
        .phone_numbers
        .iter()
        .find_map(|p| trim_opt(p.value.as_ref()))
}

fn emails_match(a: &str, b: &str) -> bool {
    a.trim().eq_ignore_ascii_case(b.trim())
}

static SEARCH_WARMUP_DONE: AtomicBool = AtomicBool::new(false);
static SESSION_INDEX: Mutex<Option<GoogleContactIndex>> = Mutex::new(None);

struct ReadRateLimiter {
    window_start: Instant,
    reads_in_window: u32,
}

impl ReadRateLimiter {
    fn new() -> Self {
        Self {
            window_start: Instant::now(),
            reads_in_window: 0,
        }
    }

    fn before_critical_read(&mut self) {
        let now = Instant::now();
        if now.duration_since(self.window_start) >= Duration::from_secs(60) {
            self.window_start = now;
            self.reads_in_window = 0;
        }
        if self.reads_in_window >= MAX_CRITICAL_READS_PER_MINUTE {
            let elapsed = now.duration_since(self.window_start);
            let wait = Duration::from_secs(60).saturating_sub(elapsed);
            if wait > Duration::from_millis(0) {
                std::thread::sleep(wait);
            }
            self.window_start = Instant::now();
            self.reads_in_window = 0;
        }
        self.reads_in_window += 1;
    }
}

static READ_RATE_LIMITER: std::sync::OnceLock<Mutex<ReadRateLimiter>> = std::sync::OnceLock::new();

fn read_rate_limiter() -> &'static Mutex<ReadRateLimiter> {
    READ_RATE_LIMITER.get_or_init(|| Mutex::new(ReadRateLimiter::new()))
}

pub(super) fn before_critical_read() {
    if let Ok(mut guard) = read_rate_limiter().lock() {
        guard.before_critical_read();
    }
}

fn is_rate_limit_error(status: reqwest::StatusCode, body: &str) -> bool {
    status.as_u16() == 429
        || body.contains("RESOURCE_EXHAUSTED")
        || body.contains("RATE_LIMIT_EXCEEDED")
}

pub(super) fn send_with_rate_limit_retry(
    label: &str,
    send: impl Fn() -> Result<reqwest::blocking::Response, reqwest::Error>,
) -> Result<reqwest::blocking::Response, String> {
    for attempt in 0..3 {
        let resp = send().map_err(|e| format!("{label} : {e}"))?;
        let status = resp.status();
        if status.is_success() {
            return Ok(resp);
        }
        let body = resp.text().unwrap_or_default();
        if is_rate_limit_error(status, &body) && attempt < 2 {
            eprintln!(
                "⚠️ Google Contacts quota ({label}) — pause {RATE_LIMIT_RETRY_SECS}s (tentative {}/3)",
                attempt + 1
            );
            std::thread::sleep(Duration::from_secs(RATE_LIMIT_RETRY_SECS));
            continue;
        }
        return Err(format!("{label} ({status}): {body}"));
    }
    Err(format!("{label} : quota Google dépassé après plusieurs tentatives."))
}

/// Invalide le cache local (déconnexion Google ou changement de compte).
pub fn clear_session_index() {
    if let Ok(mut guard) = SESSION_INDEX.lock() {
        *guard = None;
    }
}

fn search_contacts_request(client: &Client, query: &str) -> Result<Vec<GooglePerson>, String> {
    before_critical_read();
    let resp = send_with_rate_limit_retry("Recherche Google Contacts", || {
        client
            .get(format!("{PEOPLE_BASE}/people:searchContacts"))
            .query(&[
                ("query", query),
                ("readMask", READ_MASK),
                ("pageSize", "10"),
            ])
            .send()
    })?;

    let body: SearchContactsResponse = resp
        .json()
        .map_err(|e| format!("Réponse Google Contacts invalide : {e}"))?;

    Ok(body
        .results
        .unwrap_or_default()
        .into_iter()
        .filter_map(|r| r.person)
        .collect())
}

fn ensure_search_warmup(client: &Client) -> Result<(), String> {
    if SEARCH_WARMUP_DONE.swap(true, Ordering::SeqCst) {
        return Ok(());
    }
    // People API : requête vide obligatoire avant la première recherche (cache).
    search_contacts_request(client, "")?;
    Ok(())
}

fn search_contacts(client: &Client, query: &str) -> Result<Vec<GooglePerson>, String> {
    ensure_search_warmup(client)?;
    search_contacts_request(client, query)
}

fn pick_best_match(contact: &Contact, candidates: &[GooglePerson]) -> Option<GooglePerson> {
    let crm_email = trim_opt(contact.email.as_ref());
    let crm_phone = trim_opt(contact.telephone.as_ref());

    for person in candidates {
        if let Some(ref em) = crm_email {
            if google_has_crm_email(person, em) {
                return Some(person.clone());
            }
        }
    }

    for person in candidates {
        if let Some(ref ph) = crm_phone {
            if google_has_crm_phone(person, ph) {
                return Some(person.clone());
            }
        }
    }

    None
}

fn google_has_crm_email(person: &GooglePerson, email: &str) -> bool {
    person.email_addresses.iter().any(|e| {
        trim_opt(e.value.as_ref())
            .map(|v| emails_match(&v, email))
            .unwrap_or(false)
    })
}

fn google_has_crm_phone(person: &GooglePerson, phone: &str) -> bool {
    person.phone_numbers.iter().any(|p| {
        trim_opt(p.value.as_ref())
            .map(|v| phones_match(&v, phone))
            .unwrap_or(false)
    })
}

fn name_matches_crm(person: &GooglePerson, contact: &Contact) -> bool {
    let name = person.names.first();
    let given_ok = name
        .and_then(|n| trim_opt(n.given_name.as_ref()))
        .map(|g| g.eq_ignore_ascii_case(contact.prenom.trim()))
        .unwrap_or(false);
    let family_ok = name
        .and_then(|n| trim_opt(n.family_name.as_ref()))
        .map(|f| f.eq_ignore_ascii_case(contact.nom.trim()))
        .unwrap_or(false);
    given_ok && family_ok
}

fn match_score(person: &GooglePerson, contact: &Contact) -> u8 {
    let mut score = 0u8;
    if let Some(ref em) = trim_opt(contact.email.as_ref()) {
        if google_has_crm_email(person, em) {
            score += 2;
        }
    }
    if let Some(ref ph) = trim_opt(contact.telephone.as_ref()) {
        if google_has_crm_phone(person, ph) {
            score += 2;
        }
    }
    if contact
        .google_contact_resource_name
        .as_ref()
        .is_some_and(|rn| person.resource_name.as_deref() == Some(rn.as_str()))
    {
        score += 1;
    }
    score
}

fn insert_candidate(map: &mut HashMap<String, GooglePerson>, person: GooglePerson) {
    if let Some(rn) = person.resource_name.clone().filter(|s| !s.is_empty()) {
        map.entry(rn).or_insert(person);
    }
}

fn collect_google_candidates(
    client: &Client,
    contact: &Contact,
    index: &GoogleContactIndex,
) -> Result<Vec<GooglePerson>, String> {
    let mut by_rn: HashMap<String, GooglePerson> = HashMap::new();

    if let Some(ref rn) = contact.google_contact_resource_name {
        if !rn.is_empty() {
            if let Some(person) = index.get_person(rn) {
                if person_matches_contact(person, contact) {
                    insert_candidate(&mut by_rn, person.clone());
                }
            } else if let Ok(person) = get_person_by_resource_name(client, rn) {
                if person_matches_contact(&person, contact) {
                    insert_candidate(&mut by_rn, person);
                }
            }
        }
    }

    for rn in index.lookup_resource_names(contact) {
        if by_rn.contains_key(&rn) {
            continue;
        }
        if let Some(person) = index.get_person(&rn) {
            if person_matches_contact(person, contact) {
                insert_candidate(&mut by_rn, person.clone());
            }
        } else if let Ok(person) = get_person_by_resource_name(client, &rn) {
            if person_matches_contact(&person, contact) {
                insert_candidate(&mut by_rn, person);
            }
        }
    }

    // Index complet = liste authoritative ; pas de searchContacts (quota + doublons évités).
    if index.is_full_load() {
        return Ok(by_rn.into_values().collect());
    }

    if let Some(email) = trim_opt(contact.email.as_ref()) {
        for person in search_contacts(client, &email)? {
            if person_matches_contact(&person, contact) {
                insert_candidate(&mut by_rn, person);
            }
        }
    }

    if let Some(phone) = trim_opt(contact.telephone.as_ref()) {
        for person in search_contacts(client, &phone)? {
            if person_matches_contact(&person, contact) {
                insert_candidate(&mut by_rn, person);
            }
        }
        if let Some(nine) = normalize_phone_for_match(&phone) {
            for person in search_contacts(client, &nine)? {
                if person_matches_contact(&person, contact) {
                    insert_candidate(&mut by_rn, person);
                }
            }
        }
    }

    Ok(by_rn.into_values().collect())
}

fn resolve_google_duplicates(
    client: &Client,
    contact: &Contact,
    mut candidates: Vec<GooglePerson>,
    index: &mut GoogleContactIndex,
) -> Result<(Option<GooglePerson>, u32), String> {
    if candidates.is_empty() {
        return Ok((None, 0));
    }
    if candidates.len() == 1 {
        return Ok((candidates.pop(), 0));
    }

    candidates.sort_by_key(|p| std::cmp::Reverse(match_score(p, contact)));
    let keeper = candidates
        .first()
        .cloned()
        .ok_or("Doublons Google sans fiche.")?;
    let keeper_rn = keeper
        .resource_name
        .clone()
        .ok_or("Contact Google sans resourceName.")?;

    let mut removed = 0u32;
    for person in candidates.into_iter().skip(1) {
        let Some(rn) = person.resource_name else { continue };
        if rn == keeper_rn {
            continue;
        }
        delete_google_contact(client, &rn)?;
        index.unregister(&rn);
        removed += 1;
    }

    if removed > 0 {
        if let Ok(fresh) = get_person_by_resource_name(client, &keeper_rn) {
            return Ok((Some(fresh), removed));
        }
    }

    Ok((Some(keeper), removed))
}

fn is_fully_synced(
    contact: &Contact,
    email_out: Option<&str>,
    phone_out: Option<&str>,
    person: &GooglePerson,
) -> bool {
    if let Some(e) = email_out {
        if !google_has_crm_email(person, e) {
            return false;
        }
    }
    if let Some(p) = phone_out {
        if !google_has_crm_phone(person, p) {
            return false;
        }
    }
    if trim_opt(contact.email.as_ref()).is_some() && email_out.is_none() {
        return false;
    }
    if trim_opt(contact.telephone.as_ref()).is_some() && phone_out.is_none() {
        return false;
    }
    name_matches_crm(person, contact)
}

fn needs_google_update(
    contact: &Contact,
    email_out: Option<&str>,
    phone_out: Option<&str>,
    person: &GooglePerson,
) -> bool {
    !is_fully_synced(contact, email_out, phone_out, person)
}

fn get_person_by_resource_name(client: &Client, resource_name: &str) -> Result<GooglePerson, String> {
    before_critical_read();
    let url = format!("{PEOPLE_BASE}/{resource_name}?personFields={READ_MASK}");
    let resp = send_with_rate_limit_retry("Lecture Google Contact", || client.get(&url).send())?;
    resp.json()
        .map_err(|e| format!("Réponse Google Contact invalide : {e}"))
}

fn person_matches_contact(person: &GooglePerson, contact: &Contact) -> bool {
    pick_best_match(contact, std::slice::from_ref(person)).is_some()
}

fn merge_emails_for_update(crm_email: Option<&str>, existing: &GooglePerson) -> Vec<GoogleEmail> {
    let mut out = Vec::new();
    if let Some(e) = crm_email.filter(|s| !s.trim().is_empty()) {
        out.push(GoogleEmail {
            value: Some(e.to_string()),
        });
    }
    for e in &existing.email_addresses {
        if let Some(val) = trim_opt(e.value.as_ref()) {
            if !out
                .iter()
                .any(|x| x.value.as_ref().map(|v| emails_match(v, &val)).unwrap_or(false))
            {
                out.push(GoogleEmail { value: Some(val) });
            }
        }
    }
    out
}

fn merge_phones_for_update(crm_phone: Option<&str>, existing: &GooglePerson) -> Vec<GooglePhone> {
    let mut out = Vec::new();
    if let Some(p) = crm_phone.filter(|s| !s.trim().is_empty()) {
        out.push(GooglePhone {
            value: Some(phone_for_google_export(p)),
        });
    }
    for p in &existing.phone_numbers {
        if let Some(val) = trim_opt(p.value.as_ref()) {
            if !out
                .iter()
                .any(|x| x.value.as_ref().map(|v| phones_match(v, &val)).unwrap_or(false))
            {
                out.push(GooglePhone { value: Some(val) });
            }
        }
    }
    out
}

fn build_person_payload_for_create(
    contact: &Contact,
    email: Option<&str>,
    phone: Option<&str>,
) -> GooglePerson {
    GooglePerson {
        resource_name: None,
        etag: None,
        metadata: None,
        names: vec![GoogleName {
            given_name: Some(contact.prenom.clone()),
            family_name: Some(contact.nom.clone()),
        }],
        email_addresses: email
            .map(|v| GoogleEmail {
                value: Some(v.to_string()),
            })
            .into_iter()
            .collect(),
        phone_numbers: phone
            .map(|v| GooglePhone {
                value: Some(phone_for_google_export(v)),
            })
            .into_iter()
            .collect(),
    }
}

fn build_person_payload_for_update(
    contact: &Contact,
    existing: &GooglePerson,
    email: Option<&str>,
    phone: Option<&str>,
    resource_name: &str,
) -> GooglePerson {
    GooglePerson {
        resource_name: Some(resource_name.to_string()),
        etag: existing.etag.clone(),
        metadata: existing.metadata.clone(),
        names: vec![GoogleName {
            given_name: Some(contact.prenom.clone()),
            family_name: Some(contact.nom.clone()),
        }],
        email_addresses: merge_emails_for_update(email, existing),
        phone_numbers: merge_phones_for_update(phone, existing),
    }
}

fn create_google_contact(client: &Client, person: &GooglePerson) -> Result<String, String> {
    let resp = client
        .post(format!("{PEOPLE_BASE}/people:createContact"))
        .json(person)
        .send()
        .map_err(|e| format!("Création Google Contact : {e}"))?;
    if !resp.status().is_success() {
        return Err(format!(
            "Création Google Contact ({}): {}",
            resp.status(),
            resp.text().unwrap_or_default()
        ));
    }
    let body: CreateContactResponse = resp
        .json()
        .map_err(|e| format!("Réponse création Google : {e}"))?;
    body.resource_name
        .ok_or_else(|| "Google n'a pas renvoyé resourceName.".to_string())
}

fn delete_google_contact(client: &Client, resource_name: &str) -> Result<(), String> {
    let url = format!("{PEOPLE_BASE}/{resource_name}:deleteContact");
    let resp = client
        .delete(&url)
        .send()
        .map_err(|e| format!("Suppression doublon Google : {e}"))?;
    if !resp.status().is_success() {
        return Err(format!(
            "Suppression doublon Google ({}): {}",
            resp.status(),
            resp.text().unwrap_or_default()
        ));
    }
    Ok(())
}

fn is_stale_etag_error(message: &str) -> bool {
    message.contains("etag is different") || message.contains("FAILED_PRECONDITION")
}

fn update_google_contact(
    client: &Client,
    resource_name: &str,
    person: &GooglePerson,
) -> Result<Option<GooglePerson>, String> {
    let url = format!(
        "{PEOPLE_BASE}/{resource_name}:updateContact?updatePersonFields=names,emailAddresses,phoneNumbers"
    );
    let resp = client
        .patch(&url)
        .json(person)
        .send()
        .map_err(|e| format!("Mise à jour Google Contact : {e}"))?;
    if resp.status().is_success() {
        return resp
            .json::<GooglePerson>()
            .map(Some)
            .map_err(|e| format!("Réponse mise à jour Google invalide : {e}"));
    }
    Err(format!(
        "Mise à jour Google Contact ({}): {}",
        resp.status(),
        resp.text().unwrap_or_default()
    ))
}

fn apply_google_contact_update(
    client: &Client,
    contact: &Contact,
    base_person: &GooglePerson,
    email: Option<&str>,
    phone: Option<&str>,
    resource_name: &str,
    index: &mut GoogleContactIndex,
) -> Result<(), String> {
    let mut source = get_person_by_resource_name(client, resource_name).unwrap_or_else(|_| base_person.clone());

    for attempt in 0..2 {
        let patch = build_person_payload_for_update(contact, &source, email, phone, resource_name);
        match update_google_contact(client, resource_name, &patch) {
            Ok(updated) => {
                if let Some(person) = updated {
                    index.register_person(person);
                } else if let Ok(fresh) = get_person_by_resource_name(client, resource_name) {
                    index.register_person(fresh);
                }
                return Ok(());
            }
            Err(err) if is_stale_etag_error(&err) && attempt == 0 => {
                source = get_person_by_resource_name(client, resource_name)?;
            }
            Err(err) => return Err(err),
        }
    }

    Err("Mise à jour Google Contact : etag obsolète après nouvelle tentative.".into())
}

/// Sync CRM ↔ Google Contacts (toutes catégories de contacts).
pub fn sync_contact_to_google(
    app: &AppHandle,
    db_state: &DbState,
    contact_id: i64,
    index: Option<&mut GoogleContactIndex>,
) -> Result<GoogleContactSyncResult, String> {
    let token = google_access_token(app)?;
    let client = auth_client(&token);

    let contact = with_db(db_state, |db| {
        db.get_contact_by_id(contact_id)
            .map_err(|e| e.to_string())
    })?;

    let crm_email = trim_opt(contact.email.as_ref());
    let crm_phone = trim_opt(contact.telephone.as_ref());

    if crm_email.is_none() && crm_phone.is_none() {
        return Ok(GoogleContactSyncResult {
            action: "skipped".into(),
            resource_name: contact.google_contact_resource_name.clone(),
            enriched_email: false,
            enriched_phone: false,
            duplicates_removed: 0,
            message: Some("Aucun email ni téléphone à synchroniser.".into()),
        });
    }

    let mut _session_guard_holder = None;
    let index_mut: &mut GoogleContactIndex = match index {
        Some(idx) => idx,
        None => {
            let mut guard = SESSION_INDEX
                .lock()
                .map_err(|_| "Cache Google Contacts indisponible.".to_string())?;
            if guard.is_none() {
                *guard = Some(GoogleContactIndex::load(&client)?);
            }
            _session_guard_holder = Some(guard);
            _session_guard_holder
                .as_mut()
                .unwrap()
                .as_mut()
                .unwrap()
        }
    };

    let candidates = collect_google_candidates(&client, &contact, index_mut)?;
    let (existing, duplicates_removed) =
        resolve_google_duplicates(&client, &contact, candidates, index_mut)?;

    let mut enriched_email = false;
    let mut enriched_phone = false;
    let mut email_out = crm_email.clone();
    let mut phone_out = crm_phone.clone();

    if let Some(ref person) = existing {
        if email_out.is_none() {
            if let Some(g) = person_primary_email(person) {
                with_db(db_state, |db| {
                    db.enrich_contact_email_if_empty(contact_id, &g)
                        .map_err(|e| e.to_string())?;
                    Ok(())
                })?;
                email_out = Some(g);
                enriched_email = true;
            }
        }
        if phone_out.is_none() {
            if let Some(g) = person_primary_phone(person) {
                with_db(db_state, |db| {
                    db.enrich_contact_phone_if_empty(contact_id, &g)
                        .map_err(|e| e.to_string())?;
                    Ok(())
                })?;
                phone_out = Some(g);
                enriched_phone = true;
            }
        }

        let resource_name = person
            .resource_name
            .clone()
            .or(contact.google_contact_resource_name.clone())
            .ok_or("Contact Google sans resourceName.")?;

        with_db(db_state, |db| {
            db.set_google_contact_link(contact_id, &resource_name)
                .map_err(|e| e.to_string())?;
            Ok(())
        })?;
        index_mut.register(&contact, &resource_name);

        let email_slice = email_out.as_deref();
        let phone_slice = phone_out.as_deref();
        let needs_update = needs_google_update(&contact, email_slice, phone_slice, person);

        if !enriched_email && !enriched_phone && !needs_update {
            let msg = if duplicates_removed > 0 {
                Some(format!(
                    "{duplicates_removed} doublon(s) Google supprimé(s) — fiche déjà à jour."
                ))
            } else {
                None
            };
            return Ok(GoogleContactSyncResult {
                action: "unchanged".into(),
                resource_name: Some(resource_name),
                enriched_email: false,
                enriched_phone: false,
                duplicates_removed,
                message: msg,
            });
        }

        if needs_update {
            apply_google_contact_update(
                &client,
                &contact,
                person,
                email_slice,
                phone_slice,
                &resource_name,
                index_mut,
            )?;
        }

        let action = if enriched_email || enriched_phone {
            "linked_enriched".into()
        } else {
            "updated".into()
        };
        let msg = if duplicates_removed > 0 {
            Some(format!("{duplicates_removed} doublon(s) Google supprimé(s)."))
        } else {
            None
        };

        return Ok(GoogleContactSyncResult {
            action,
            resource_name: Some(resource_name),
            enriched_email,
            enriched_phone,
            duplicates_removed,
            message: msg,
        });
    }

    let payload = build_person_payload_for_create(
        &contact,
        email_out.as_deref(),
        phone_out.as_deref(),
    );
    let resource_name = create_google_contact(&client, &payload)?;

    with_db(db_state, |db| {
        db.set_google_contact_link(contact_id, &resource_name)
            .map_err(|e| e.to_string())?;
        Ok(())
    })?;
    index_mut.register(&contact, &resource_name);
    index_mut.register_person(GooglePerson {
        resource_name: Some(resource_name.clone()),
        etag: None,
        metadata: None,
        names: vec![GoogleName {
            given_name: Some(contact.prenom.clone()),
            family_name: Some(contact.nom.clone()),
        }],
        email_addresses: email_out
            .as_ref()
            .map(|v| GoogleEmail {
                value: Some(v.clone()),
            })
            .into_iter()
            .collect(),
        phone_numbers: phone_out
            .as_ref()
            .map(|v| GooglePhone {
                value: Some(phone_for_google_export(v)),
            })
            .into_iter()
            .collect(),
    });

    Ok(GoogleContactSyncResult {
        action: "created".into(),
        resource_name: Some(resource_name),
        enriched_email,
        enriched_phone,
        duplicates_removed,
        message: None,
    })
}

/// Appelé après create/update contact — erreurs loguées, ne bloque pas l'UI.
pub fn sync_contact_after_save(app: &AppHandle, db_state: &DbState, contact_id: i64) {
    match sync_contact_to_google(app, db_state, contact_id, None) {
        Ok(r) => println!(
            "✅ Google Contacts sync #{contact_id} : {} {:?}",
            r.action, r.resource_name
        ),
        Err(e) => eprintln!("⚠️ Google Contacts sync #{contact_id} : {e}"),
    }
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GoogleContactBatchSyncEntry {
    pub contact_id: i64,
    pub prenom: String,
    pub nom: String,
    pub action: String,
    pub message: Option<String>,
    pub duplicates_removed: u32,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GoogleContactBatchSyncResult {
    pub total: usize,
    pub created: usize,
    pub updated: usize,
    pub linked_enriched: usize,
    pub unchanged: usize,
    pub skipped: usize,
    pub duplicates_removed: u32,
    pub errors: usize,
    pub error_samples: Vec<String>,
    pub entries: Vec<GoogleContactBatchSyncEntry>,
}

/// Sync tous les contacts CRM ayant email ou téléphone (toutes catégories).
pub fn sync_all_contacts_to_google(
    app: &AppHandle,
    db_state: &DbState,
) -> Result<GoogleContactBatchSyncResult, String> {
    let contact_labels: HashMap<i64, (String, String)> = with_db(db_state, |db| {
        db.get_all_contacts()
            .map(|contacts| {
                contacts
                    .into_iter()
                    .filter(|c| {
                        trim_opt(c.email.as_ref()).is_some()
                            || trim_opt(c.telephone.as_ref()).is_some()
                    })
                    .filter_map(|c| {
                        let id = c.id?;
                        Some((id, (c.prenom.clone(), c.nom.clone())))
                    })
                    .collect()
            })
            .map_err(|e| e.to_string())
    })?;

    let ids: Vec<i64> = contact_labels.keys().copied().collect();

    let mut result = GoogleContactBatchSyncResult {
        total: ids.len(),
        created: 0,
        updated: 0,
        linked_enriched: 0,
        unchanged: 0,
        skipped: 0,
        duplicates_removed: 0,
        errors: 0,
        error_samples: Vec::new(),
        entries: Vec::with_capacity(ids.len()),
    };

    let token = google_access_token(app)?;
    let client = auth_client(&token);
    let mut index = GoogleContactIndex::load(&client)?;

    for id in ids {
        let (prenom, nom) = contact_labels
            .get(&id)
            .cloned()
            .unwrap_or_else(|| ("?".into(), format!("#{id}")));
        match sync_contact_to_google(app, db_state, id, Some(&mut index)) {
            Ok(r) => {
                result.duplicates_removed += r.duplicates_removed;
                match r.action.as_str() {
                    "created" => result.created += 1,
                    "updated" => result.updated += 1,
                    "linked_enriched" => result.linked_enriched += 1,
                    "unchanged" => result.unchanged += 1,
                    "skipped" => result.skipped += 1,
                    _ => {}
                }
                result.entries.push(GoogleContactBatchSyncEntry {
                    contact_id: id,
                    prenom,
                    nom,
                    action: r.action,
                    message: r.message,
                    duplicates_removed: r.duplicates_removed,
                });
            }
            Err(e) => {
                result.errors += 1;
                if result.error_samples.len() < 5 {
                    result.error_samples.push(format!("#{id}: {e}"));
                }
                result.entries.push(GoogleContactBatchSyncEntry {
                    contact_id: id,
                    prenom,
                    nom,
                    action: "error".into(),
                    message: Some(e.clone()),
                    duplicates_removed: 0,
                });
                eprintln!("⚠️ Google Contacts batch sync #{id} : {e}");
            }
        }
        std::thread::sleep(std::time::Duration::from_millis(400));
    }

    if let Ok(mut guard) = SESSION_INDEX.lock() {
        *guard = Some(index);
    }

    println!(
        "✅ Google Contacts batch : {} traités — {} créés, {} mis à jour, {} enrichis, {} inchangés, {} ignorés, {} doublons supprimés, {} erreurs",
        result.total,
        result.created,
        result.updated,
        result.linked_enriched,
        result.unchanged,
        result.skipped,
        result.duplicates_removed,
        result.errors
    );

    Ok(result)
}

#[tauri::command]
pub fn sync_all_contacts_google_cmd(
    app: AppHandle,
    db: State<'_, DbState>,
) -> Result<GoogleContactBatchSyncResult, String> {
    sync_all_contacts_to_google(&app, &db)
}

#[tauri::command]
pub fn sync_contact_google_cmd(
    app: AppHandle,
    db: State<'_, DbState>,
    contact_id: i64,
) -> Result<GoogleContactSyncResult, String> {
    sync_contact_to_google(&app, &db, contact_id, None)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::database::models::Contact;

    fn sample_contact(email: Option<&str>, phone: Option<&str>) -> Contact {
        Contact {
            id: Some(1),
            famille_id: None,
            foyer_id: None,
            role_foyer: None,
            role_famille: None,
            categorie: "CLIENT".into(),
            filleul_categorie: None,
            parrain_id: None,
            prescripteur_id: None,
            civilite: None,
            nom: "Dupont".into(),
            prenom: "Jean".into(),
            email: email.map(String::from),
            telephone: phone.map(String::from),
            adresse: None,
            code_postal: None,
            ville: None,
            date_naissance: None,
            profession: None,
            situation_familiale: None,
            source_lead: None,
            profil_risque_sri: None,
            date_dernier_contact: None,
            date_prochain_suivi: None,
            date_dernier_contact_filleul: None,
            date_prochain_suivi_filleul: None,
            statut_suivi: "ACTIF".into(),
            registre: None,
            notes: None,
            famille_regroupement_exclu: false,
            google_contact_resource_name: None,
            google_synced_at: None,
            created_at: Some(0),
            updated_at: Some(0),
        }
    }

    #[test]
    fn pick_best_match_requires_email_or_phone_match() {
        let contact = sample_contact(Some("jean@example.com"), None);
        let wrong_name = GooglePerson {
            resource_name: Some("people/c1".into()),
            etag: None,
            metadata: None,
            names: vec![GoogleName {
                given_name: Some("Jean".into()),
                family_name: Some("Dupont".into()),
            }],
            email_addresses: vec![GoogleEmail {
                value: Some("autre@example.com".into()),
            }],
            phone_numbers: vec![],
        };
        assert!(pick_best_match(&contact, &[wrong_name.clone()]).is_none());

        let right_email = GooglePerson {
            email_addresses: vec![GoogleEmail {
                value: Some("jean@example.com".into()),
            }],
            ..wrong_name
        };
        assert!(pick_best_match(&contact, &[right_email]).is_some());
    }

    #[test]
    fn merge_emails_keeps_existing_google_addresses() {
        let existing = GooglePerson {
            resource_name: Some("people/c1".into()),
            etag: Some("\"abc\"".into()),
            metadata: None,
            names: vec![],
            email_addresses: vec![
                GoogleEmail {
                    value: Some("pro@example.com".into()),
                },
                GoogleEmail {
                    value: Some("perso@example.com".into()),
                },
            ],
            phone_numbers: vec![],
        };
        let merged = merge_emails_for_update(Some("pro@example.com"), &existing);
        assert_eq!(merged.len(), 2);
    }
}
