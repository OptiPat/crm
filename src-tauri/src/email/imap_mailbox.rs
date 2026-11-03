//! Boîte « autre messagerie » (OVH, Ionos, Orange…) : envoi SMTP, lecture IMAP.
//!
//! Le mot de passe est stocké chiffré dans `EmailOAuthStore.connection.access_token`
//! (provider [`IMAP_PROVIDER`]) ; les serveurs dans `EmailOAuthStore.imap_servers`.

use super::oauth_store::{EmailOAuthConnection, EmailOAuthStore};
use super::response_sync::{email_matches, first_send_check_item, NewsletterUnsubscribeRequest};
use crate::database::models::PendingCampaignResponseCheck;
use crate::newsletter::db::is_newsletter_unsubscribe_request;
use lettre::address::Envelope;
use lettre::transport::smtp::authentication::Credentials;
use lettre::transport::smtp::client::{Tls, TlsParameters};
use lettre::{SmtpTransport, Transport};
use mailparse::{MailHeader, MailHeaderMap, ParsedMail};
use serde::{Deserialize, Serialize};
use std::collections::HashSet;
use std::net::{TcpStream, ToSocketAddrs};
use std::sync::{Arc, OnceLock};
use std::time::Duration;
use tauri::AppHandle;

pub const IMAP_PROVIDER: &str = "imap";
/// Pas d'expiration : un mot de passe ne se rafraîchit pas (an 9999).
const NO_EXPIRY: i64 = 253_402_300_799;
const NETWORK_TIMEOUT: Duration = Duration::from_secs(30);
/// Messages examinés au maximum par recherche (en-têtes seuls ; corps lu pour la réponse).
pub const MAX_HEADER_CANDIDATES: usize = 300;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum SmtpSecurity {
    /// Port 587 : connexion en clair puis STARTTLS obligatoire.
    Starttls,
    /// Port 465 : TLS dès la connexion.
    Tls,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct ImapMailboxServers {
    pub imap_host: String,
    pub imap_port: u16,
    pub smtp_host: String,
    pub smtp_port: u16,
    pub smtp_security: SmtpSecurity,
    /// Identifiant de connexion ; vide = l'adresse email.
    #[serde(default)]
    pub username: Option<String>,
}

impl ImapMailboxServers {
    fn new(imap_host: &str, smtp_host: &str, smtp_port: u16) -> Self {
        Self {
            imap_host: imap_host.into(),
            imap_port: 993,
            smtp_host: smtp_host.into(),
            smtp_port,
            smtp_security: if smtp_port == 465 {
                SmtpSecurity::Tls
            } else {
                SmtpSecurity::Starttls
            },
            username: None,
        }
    }

    fn login<'a>(&'a self, email: &'a str) -> &'a str {
        self.username
            .as_deref()
            .map(str::trim)
            .filter(|u| !u.is_empty())
            .unwrap_or(email)
    }

    fn validate(&self) -> Result<(), String> {
        for (label, host, port) in [
            ("IMAP", &self.imap_host, self.imap_port),
            ("SMTP", &self.smtp_host, self.smtp_port),
        ] {
            let host = host.trim();
            if host.is_empty()
                || host
                    .chars()
                    .any(|c| c.is_whitespace() || c.is_control() || "/:@\"'".contains(c))
            {
                return Err(format!("Serveur {label} invalide : « {host} »."));
            }
            if port == 0 {
                return Err(format!("Port {label} invalide."));
            }
        }
        if self.imap_port == 143 {
            return Err("IMAP : seul le port chiffré 993 (SSL/TLS) est pris en charge.".into());
        }
        Ok(())
    }
}

#[derive(Debug, Clone, Serialize)]
pub struct ImapServerSuggestion {
    /// Hébergeur reconnu (« OVH », « Orange »…), sinon `None`.
    pub provider_label: Option<String>,
    /// Serveurs à essayer dans l'ordre à la connexion.
    pub candidates: Vec<ImapMailboxServers>,
    /// Message à afficher (ex. boîte Google : utilisez plutôt le bouton Google).
    pub hint: Option<String>,
}

fn email_domain(email: &str) -> Option<String> {
    let (_, domain) = email.trim().rsplit_once('@')?;
    let domain = domain.trim().trim_end_matches('.').to_ascii_lowercase();
    (!domain.is_empty() && domain.contains('.')).then_some(domain)
}

fn suggestion(label: &str, candidates: Vec<ImapMailboxServers>) -> ImapServerSuggestion {
    ImapServerSuggestion {
        provider_label: Some(label.into()),
        candidates,
        hint: None,
    }
}

fn ovh_candidates() -> Vec<ImapMailboxServers> {
    // Email Pro (pro1 à pro3) puis MX Plan : le bon serveur est celui qui accepte la connexion.
    vec![
        ImapMailboxServers::new("pro1.mail.ovh.net", "pro1.mail.ovh.net", 587),
        ImapMailboxServers::new("pro2.mail.ovh.net", "pro2.mail.ovh.net", 587),
        ImapMailboxServers::new("pro3.mail.ovh.net", "pro3.mail.ovh.net", 587),
        ImapMailboxServers::new("ssl0.ovh.net", "ssl0.ovh.net", 465),
    ]
}

/// Messageries grand public reconnues à l'adresse seule.
fn suggest_from_email_domain(domain: &str) -> Option<ImapServerSuggestion> {
    let s = |label: &str, imap: &str, smtp: &str, port: u16| {
        Some(suggestion(label, vec![ImapMailboxServers::new(imap, smtp, port)]))
    };
    match domain {
        "orange.fr" | "wanadoo.fr" => s("Orange", "imap.orange.fr", "smtp.orange.fr", 465),
        "free.fr" => s("Free", "imap.free.fr", "smtp.free.fr", 465),
        "sfr.fr" | "neuf.fr" => s("SFR", "imap.sfr.fr", "smtp.sfr.fr", 465),
        "laposte.net" => s("La Poste", "imap.laposte.net", "smtp.laposte.net", 465),
        "gmx.fr" | "gmx.com" | "gmx.net" => s("GMX", "imap.gmx.com", "mail.gmx.com", 587),
        "yahoo.fr" | "yahoo.com" => {
            s("Yahoo", "imap.mail.yahoo.com", "smtp.mail.yahoo.com", 465).map(|mut sug| {
                sug.hint = Some(
                    "Yahoo exige un mot de passe d'application (Sécurité du compte Yahoo).".into(),
                );
                sug
            })
        }
        "icloud.com" | "me.com" | "mac.com" => {
            s("iCloud", "imap.mail.me.com", "smtp.mail.me.com", 587).map(|mut sug| {
                sug.hint = Some(
                    "iCloud exige un mot de passe d'application (appleid.apple.com → Connexion et sécurité)."
                        .into(),
                );
                sug
            })
        }
        "gmail.com" | "googlemail.com" => Some(google_or_microsoft_hint("Google")),
        "outlook.com" | "outlook.fr" | "hotmail.com" | "hotmail.fr" | "live.com" | "live.fr"
        | "msn.com" => Some(google_or_microsoft_hint("Microsoft")),
        _ => None,
    }
}

fn google_or_microsoft_hint(label: &str) -> ImapServerSuggestion {
    ImapServerSuggestion {
        provider_label: Some(label.into()),
        candidates: vec![],
        hint: Some(format!(
            "Cette boîte est hébergée chez {label} : utilisez plutôt le bouton {label} (connexion sécurisée, détection des réponses plus complète)."
        )),
    }
}

/// Domaine personnalisé : hébergeur déduit des serveurs MX.
fn suggest_from_mx(mx_hosts: &[String]) -> Option<ImapServerSuggestion> {
    let any = |needle: &str| mx_hosts.iter().any(|h| h.ends_with(needle));
    if any(".ovh.net") {
        return Some(suggestion("OVH", ovh_candidates()));
    }
    if any(".ionos.fr") || any(".ionos.com") || any(".kundenserver.de") || any(".1and1.fr") {
        return Some(suggestion(
            "Ionos",
            vec![ImapMailboxServers::new("imap.ionos.fr", "smtp.ionos.fr", 465)],
        ));
    }
    if any(".gandi.net") {
        return Some(suggestion(
            "Gandi",
            vec![ImapMailboxServers::new("mail.gandi.net", "mail.gandi.net", 465)],
        ));
    }
    if any(".infomaniak.ch") {
        return Some(suggestion(
            "Infomaniak",
            vec![ImapMailboxServers::new("mail.infomaniak.com", "mail.infomaniak.com", 465)],
        ));
    }
    if any(".google.com") || any(".googlemail.com") {
        return Some(google_or_microsoft_hint("Google"));
    }
    if any(".outlook.com") {
        return Some(google_or_microsoft_hint("Microsoft"));
    }
    None
}

/// Serveurs MX via DNS-over-HTTPS (pas de résolveur MX dans la bibliothèque standard).
fn lookup_mx_hosts(domain: &str) -> Result<Vec<String>, String> {
    #[derive(Deserialize)]
    struct DohAnswer {
        #[serde(rename = "type")]
        record_type: u16,
        data: String,
    }
    #[derive(Deserialize)]
    struct DohResponse {
        #[serde(rename = "Answer", default)]
        answer: Vec<DohAnswer>,
    }
    let res = reqwest::blocking::Client::builder()
        .timeout(Duration::from_secs(8))
        .build()
        .map_err(|e| e.to_string())?
        .get("https://cloudflare-dns.com/dns-query")
        .query(&[("name", domain), ("type", "MX")])
        .header("accept", "application/dns-json")
        .send()
        .map_err(|e| e.to_string())?;
    let body: DohResponse = res.json().map_err(|e| e.to_string())?;
    Ok(body
        .answer
        .into_iter()
        .filter(|a| a.record_type == 15)
        .filter_map(|a| {
            a.data
                .split_whitespace()
                .last()
                .map(|h| h.trim_end_matches('.').to_ascii_lowercase())
        })
        .collect())
}

pub fn suggest_servers(email: &str) -> ImapServerSuggestion {
    let unknown = ImapServerSuggestion {
        provider_label: None,
        candidates: vec![],
        hint: None,
    };
    let Some(domain) = email_domain(email) else {
        return unknown;
    };
    if let Some(s) = suggest_from_email_domain(&domain) {
        return s;
    }
    lookup_mx_hosts(&domain)
        .ok()
        .and_then(|mx| suggest_from_mx(&mx))
        .unwrap_or(unknown)
}

// --- Connexion TLS / IMAP ---------------------------------------------------------------

type ImapStream = rustls::StreamOwned<rustls::ClientConnection, TcpStream>;
type ImapSession = imap::Session<ImapStream>;

fn tls_config() -> Result<Arc<rustls::ClientConfig>, String> {
    static CONFIG: OnceLock<Arc<rustls::ClientConfig>> = OnceLock::new();
    if let Some(c) = CONFIG.get() {
        return Ok(c.clone());
    }
    let mut roots = rustls::RootCertStore::empty();
    roots.extend(webpki_roots::TLS_SERVER_ROOTS.iter().cloned());
    let config = rustls::ClientConfig::builder_with_provider(Arc::new(
        rustls::crypto::ring::default_provider(),
    ))
    .with_safe_default_protocol_versions()
    .map_err(|e| e.to_string())?
    .with_root_certificates(roots)
    .with_no_client_auth();
    Ok(CONFIG.get_or_init(|| Arc::new(config)).clone())
}

/// Erreur de connexion à un serveur : `auth` = identifiants refusés (essayer le suivant).
#[derive(Debug)]
struct ConnectError {
    auth: bool,
    message: String,
}

fn unreachable(host: &str, e: impl std::fmt::Display) -> ConnectError {
    ConnectError {
        auth: false,
        message: format!("Serveur {host} injoignable : {e}"),
    }
}

fn open_imap(
    servers: &ImapMailboxServers,
    email: &str,
    password: &str,
) -> Result<ImapSession, ConnectError> {
    let host = servers.imap_host.trim();
    // Toutes les adresses (IPv6 cassé sur certains réseaux : repli IPv4).
    let mut tcp = Err(unreachable(host, "adresse introuvable"));
    for addr in (host, servers.imap_port)
        .to_socket_addrs()
        .map_err(|e| unreachable(host, e))?
    {
        tcp = TcpStream::connect_timeout(&addr, NETWORK_TIMEOUT).map_err(|e| unreachable(host, e));
        if tcp.is_ok() {
            break;
        }
    }
    let tcp = tcp?;
    tcp.set_read_timeout(Some(NETWORK_TIMEOUT))
        .and_then(|_| tcp.set_write_timeout(Some(NETWORK_TIMEOUT)))
        .map_err(|e| unreachable(host, e))?;
    let server_name = rustls::pki_types::ServerName::try_from(host.to_string())
        .map_err(|e| unreachable(host, e))?;
    let tls = rustls::ClientConnection::new(tls_config().map_err(|e| unreachable(host, e))?, server_name)
        .map_err(|e| unreachable(host, e))?;
    let mut client = imap::Client::new(rustls::StreamOwned::new(tls, tcp));
    client.read_greeting().map_err(|e| unreachable(host, e))?;
    client
        .login(servers.login(email), password)
        .map_err(|(e, _)| match e {
            imap::Error::No(_) | imap::Error::Bad(_) => ConnectError {
                auth: true,
                message: format!("Adresse ou mot de passe refusé par {host}."),
            },
            other => unreachable(host, other),
        })
}

fn smtp_transport(
    servers: &ImapMailboxServers,
    email: &str,
    password: &str,
) -> Result<SmtpTransport, String> {
    let host = servers.smtp_host.trim().to_string();
    let params = TlsParameters::new(host.clone()).map_err(|e| format!("TLS {host} : {e}"))?;
    let tls = match servers.smtp_security {
        SmtpSecurity::Starttls => Tls::Required(params),
        SmtpSecurity::Tls => Tls::Wrapper(params),
    };
    Ok(SmtpTransport::builder_dangerous(host)
        .port(servers.smtp_port)
        .tls(tls)
        .credentials(Credentials::new(
            servers.login(email).to_string(),
            password.to_string(),
        ))
        .timeout(Some(NETWORK_TIMEOUT))
        .build())
}

fn smtp_error(servers: &ImapMailboxServers, e: lettre::transport::smtp::Error) -> String {
    let host = servers.smtp_host.trim();
    if e.is_permanent() && e.status().is_some_and(|c| c.to_string().starts_with("53")) {
        return format!("Envoi refusé par {host} : adresse ou mot de passe incorrect.");
    }
    format!("Envoi via {host} impossible : {e}")
}

fn connected_mailbox(
    app: &AppHandle,
) -> Result<(EmailOAuthConnection, ImapMailboxServers), String> {
    let store = EmailOAuthStore::load(app)?;
    let conn = store
        .connection
        .filter(|c| c.provider == IMAP_PROVIDER)
        .ok_or("Aucune boîte connectée. Paramètres → Emails & envois → Connexion.")?;
    let servers = store
        .imap_servers
        .ok_or("Serveurs de messagerie manquants : reconnectez votre boîte (Paramètres → Emails & envois → Connexion).")?;
    Ok((conn, servers))
}

// --- Connexion depuis les paramètres ------------------------------------------------------

/// Essaie chaque jeu de serveurs (IMAP puis SMTP) et enregistre le premier qui fonctionne.
pub fn connect_mailbox(
    app: &AppHandle,
    email: &str,
    password: &str,
    servers: Option<ImapMailboxServers>,
) -> Result<(), String> {
    let email = email.trim();
    super::oauth_send::validate_recipient_email(email)
        .map_err(|_| format!("Adresse email invalide : « {email} »."))?;
    if password.is_empty() {
        return Err("Saisissez le mot de passe de la messagerie.".into());
    }
    let candidates = match servers {
        Some(s) => {
            s.validate()?;
            vec![s]
        }
        None => {
            let sug = suggest_servers(email);
            if sug.candidates.is_empty() {
                return Err(sug.hint.unwrap_or_else(|| {
                    "Hébergeur non reconnu : renseignez les serveurs IMAP et SMTP dans « Serveurs (avancé) ».".into()
                }));
            }
            sug.candidates
        }
    };

    let tried = candidates.len();
    let mut auth_refused = None;
    let mut last_error = None;
    for candidate in candidates {
        match open_imap(&candidate, email, password) {
            Ok(mut session) => {
                let _ = session.logout();
                smtp_transport(&candidate, email, password)?
                    .test_connection()
                    .map_err(|e| smtp_error(&candidate, e))?;
                let mut store = EmailOAuthStore::load(app)?;
                store.connection = Some(EmailOAuthConnection {
                    provider: IMAP_PROVIDER.into(),
                    email: email.to_string(),
                    access_token: password.to_string(),
                    refresh_token: None,
                    expires_at: NO_EXPIRY,
                });
                store.imap_servers = Some(candidate);
                return store.save(app);
            }
            Err(e) if e.auth => auth_refused = Some(e.message),
            Err(e) => last_error = Some(e.message),
        }
    }
    if auth_refused.is_some() && tried > 1 {
        return Err(format!(
            "Adresse ou mot de passe refusé par les {tried} serveurs essayés. Vérifiez le mot de passe \
             (celui du webmail) ; sinon renseignez le serveur exact dans « Serveurs (avancé) » \
             (indiqué dans l'espace client de l'hébergeur ou dans l'adresse du webmail)."
        ));
    }
    Err(auth_refused
        .or(last_error)
        .unwrap_or_else(|| "Connexion à la messagerie impossible.".into()))
}

// --- Envoi --------------------------------------------------------------------------------

fn new_message_id(from_email: &str) -> String {
    use rand::Rng;
    let domain = email_domain(from_email).unwrap_or_else(|| "crm.local".into());
    let nonce: u64 = rand::thread_rng().gen();
    format!(
        "crm.{}.{nonce:016x}@{domain}",
        chrono::Utc::now().timestamp_millis()
    )
}

/// En-têtes ajoutés d'ordinaire par Gmail / Graph : date et identifiant (suivi des réponses).
fn with_transport_headers(raw: &str, message_id: &str) -> String {
    format!(
        "Date: {}\r\nMessage-ID: <{message_id}>\r\n{raw}",
        chrono::Local::now().to_rfc2822()
    )
}

/// Corps « 8bit » réencodés en base64 : SMTP limite les lignes à 998 octets (logos intégrés
/// en data: URI) et certains serveurs refusent les LF seuls. Gmail / Graph acceptaient le 8bit.
fn smtp_safe_body_encoding(raw: &str) -> String {
    use base64::Engine;
    // En-tête cherché seul : In-Reply-To / List-Unsubscribe peuvent être insérés après lui.
    const MARK: &str = "Content-Transfer-Encoding: 8bit\r\n";
    // Toutes les frontières (multipart/related imbriqué dans multipart/mixed) : le contenu
    // d'une partie s'arrête à la première frontière rencontrée, quelle qu'elle soit.
    // Frontières générées par le CRM uniquement (`crm_…`) : un « boundary="" » écrit dans le
    // corps HTML ne doit pas couper une partie.
    let boundaries: Vec<String> = raw
        .match_indices("boundary=\"")
        .filter_map(|(i, m)| raw[i + m.len()..].split_once('"'))
        .map(|(b, _)| b)
        .filter(|b| b.starts_with("crm_"))
        .map(|b| format!("\r\n--{b}"))
        .collect();
    let mut out = String::with_capacity(raw.len() * 4 / 3);
    let mut rest = raw;
    while let Some(pos) = rest.find(MARK) {
        let after_mark = pos + MARK.len();
        // Fin du bloc d'en-têtes de la partie (le CRLF du marqueur peut en être le début).
        let Some(headers_end) = rest[after_mark - 2..].find("\r\n\r\n") else {
            break;
        };
        let content_start = after_mark - 2 + headers_end + 4;
        let content_len = boundaries
            .iter()
            .filter_map(|b| rest[content_start..].find(b.as_str()))
            .min()
            .unwrap_or(rest.len() - content_start);
        out.push_str(&rest[..pos]);
        out.push_str("Content-Transfer-Encoding: base64\r\n");
        out.push_str(&rest[after_mark..content_start]);
        let b64 = base64::engine::general_purpose::STANDARD
            .encode(&rest.as_bytes()[content_start..content_start + content_len]);
        let lines: Vec<&str> = b64
            .as_bytes()
            .chunks(76)
            .map(|c| std::str::from_utf8(c).unwrap_or(""))
            .collect();
        out.push_str(&lines.join("\r\n"));
        rest = &rest[content_start + content_len..];
    }
    out.push_str(rest);
    out
}

/// Envoie un message RFC 2822 déjà construit ; renvoie son Message-ID (sans chevrons).
pub fn send_raw_message(app: &AppHandle, to_email: &str, raw: &str) -> Result<String, String> {
    let (conn, servers) = connected_mailbox(app)?;
    super::smtp_quota::ensure_can_send(app)?;
    let message_id = new_message_id(&conn.email);
    let full = with_transport_headers(&smtp_safe_body_encoding(raw), &message_id);
    let envelope = Envelope::new(
        Some(conn.email.parse().map_err(|e| format!("Expéditeur invalide : {e}"))?),
        vec![to_email.parse().map_err(|e| format!("Destinataire invalide : {e}"))?],
    )
    .map_err(|e| e.to_string())?;
    smtp_transport(&servers, &conn.email, &conn.access_token)?
        .send_raw(&envelope, full.as_bytes())
        .map_err(|e| smtp_error(&servers, e))?;
    if let Err(e) = super::smtp_quota::record_send(app) {
        eprintln!("[smtp] envoi non compté dans le quota horaire : {e}");
    }
    // Copie dans « Éléments envoyés » : l'email est parti même si ce dépôt échoue.
    if let Err(e) = append_to_sent(&servers, &conn, full.as_bytes()) {
        eprintln!("[imap] copie dans les éléments envoyés impossible : {e}");
    }
    Ok(message_id)
}

fn sent_folder(session: &mut ImapSession) -> Result<String, String> {
    let names = session.list(None, Some("*")).map_err(|e| e.to_string())?;
    if let Some(name) = names
        .iter()
        .find(|n| n.attributes().contains(&imap_proto::NameAttribute::Sent))
    {
        return Ok(name.name().to_string());
    }
    // Noms IMAP en UTF-7 modifié : « Éléments envoyés » = « &AMk-l&AOk-ments envoy&AOk-s ».
    const USUAL: [&str; 7] = [
        "Sent",
        "Sent Items",
        "INBOX.Sent",
        "Sent Messages",
        "&AMk-l&AOk-ments envoy&AOk-s",
        "Envoy&AOk-s",
        "INBOX.Envoy&AOk-s",
    ];
    names
        .iter()
        .map(|n| n.name())
        .find(|n| USUAL.iter().any(|u| n.eq_ignore_ascii_case(u)))
        .map(str::to_string)
        .ok_or_else(|| "dossier des éléments envoyés introuvable".into())
}

fn append_to_sent(
    servers: &ImapMailboxServers,
    conn: &EmailOAuthConnection,
    message: &[u8],
) -> Result<(), String> {
    let mut session =
        open_imap(servers, &conn.email, &conn.access_token).map_err(|e| e.message)?;
    let folder = sent_folder(&mut session)?;
    session
        .append(&folder, message)
        .flag(imap::types::Flag::Seen)
        .finish()
        .map_err(|e| e.to_string())?;
    let _ = session.logout();
    Ok(())
}

// --- Lecture des réponses -----------------------------------------------------------------

#[derive(Debug, Clone)]
pub struct ImapReplyFound {
    pub message_id: String,
    pub body_text: String,
    pub subject: Option<String>,
}

struct FetchedHeaders {
    uid: u32,
    received_at: Option<i64>,
    raw: Vec<u8>,
}

/// Session IMAP ouverte pour une synchro (une connexion pour tous les envois vérifiés).
pub struct ImapMailboxReader {
    session: ImapSession,
    own_email: String,
    /// Dossier ouvert (lecture seule) : réponses dans INBOX, scans dans tous les dossiers.
    selected: String,
}

/// Message trouvé par une recherche multi-dossiers (en-têtes seuls).
#[derive(Debug, Clone)]
pub struct ImapListedMessage {
    pub folder: String,
    pub uid: u32,
    /// Message-ID (sans chevrons) : identifiant stable, quel que soit le dossier.
    pub message_id: String,
    pub subject: String,
    pub from: String,
    pub received_at: i64,
    /// Premier message du fil (References / In-Reply-To), sinon le message lui-même.
    pub thread_id: String,
}

/// Contenu lu d'un message listé.
#[derive(Debug, Clone)]
pub struct ImapFetchedMessage {
    pub subject: String,
    pub body_text: String,
}

/// Dossiers jamais parcourus par les scans (noms IMAP en UTF-7 modifié, comparés en minuscules).
const SKIPPED_FOLDER_NAMES: [&str; 22] = [
    "drafts",
    "brouillons",
    "trash",
    "corbeille",
    "deleted items",
    "&amk-l&aok-ments supprim&aok-s",
    "junk",
    "junk email",
    "junk e-mail",
    "spam",
    "courrier ind&aok-sirable",
    "outbox",
    "bo&ao4-te d'envoi",
    "calendar",
    "calendrier",
    "contacts",
    "tasks",
    "t&aoi-ches",
    "notes",
    "journal",
    "sync issues",
    "probl&aog-mes de synchronisation",
];
const SENT_FOLDER_NAMES: [&str; 4] = [
    "sent",
    "sent items",
    "&amk-l&aok-ments envoy&aok-s",
    "envoy&aok-s",
];
/// Plafond de dossiers parcourus par recherche (boîtes très arborescentes).
const MAX_SCAN_FOLDERS: usize = 80;

fn folder_leaf(name: &str, delimiter: Option<&str>) -> String {
    let leaf = match delimiter.filter(|d| !d.is_empty()) {
        Some(d) => name.rsplit(d).next().unwrap_or(name),
        None => name,
    };
    leaf.to_ascii_lowercase()
}

/// Dossier à parcourir : ni brouillons, corbeille, indésirables ni dossiers non-mail ;
/// les éléments envoyés seulement si `include_sent`.
fn scan_folder_wanted(
    attributes: &[imap_proto::NameAttribute],
    leaf: &str,
    include_sent: bool,
) -> bool {
    use imap_proto::NameAttribute as A;
    if attributes.iter().any(|a| {
        matches!(a, A::NoSelect | A::Drafts | A::Trash | A::Junk | A::All)
    }) {
        return false;
    }
    let is_sent = attributes.contains(&A::Sent) || SENT_FOLDER_NAMES.contains(&leaf);
    if is_sent {
        return include_sent;
    }
    !SKIPPED_FOLDER_NAMES.contains(&leaf)
}

/// Premier identifiant de `References`, sinon `In-Reply-To` : racine du fil.
fn headers_thread_root(headers: &[MailHeader]) -> Option<String> {
    ["References", "In-Reply-To"].iter().find_map(|h| {
        headers
            .get_first_value(h)
            .and_then(|v| header_ids(&v).next().map(str::to_string))
    })
}

fn imap_date(ts: i64) -> String {
    chrono::DateTime::from_timestamp(ts, 0)
        .unwrap_or_default()
        .format("%d-%b-%Y")
        .to_string()
}

fn header_ids(value: &str) -> impl Iterator<Item = &str> {
    value
        .split(|c: char| c.is_whitespace() || c == ',')
        .map(|t| t.trim().trim_start_matches('<').trim_end_matches('>'))
        .filter(|t| !t.is_empty())
}

fn references_any(headers: &[MailHeader], wanted: &[String]) -> bool {
    ["In-Reply-To", "References"].iter().any(|h| {
        headers
            .get_all_values(h)
            .iter()
            .any(|v| header_ids(v).any(|id| wanted.iter().any(|w| w == id)))
    })
}

fn is_attachment(part: &ParsedMail) -> bool {
    part.get_content_disposition().disposition == mailparse::DispositionType::Attachment
}

fn find_text_part(mail: &ParsedMail, mimetype: &str) -> Option<String> {
    if mail.subparts.is_empty() {
        return (!is_attachment(mail) && mail.ctype.mimetype.eq_ignore_ascii_case(mimetype))
            .then(|| mail.get_body().ok())
            .flatten();
    }
    mail.subparts.iter().find_map(|p| find_text_part(p, mimetype))
}

fn mail_body_text(mail: &ParsedMail) -> String {
    if let Some(plain) = find_text_part(mail, "text/plain") {
        return plain.trim().to_string();
    }
    find_text_part(mail, "text/html")
        .map(|html| super::signature_html::html_to_plain_email(html.trim()))
        .unwrap_or_default()
}

fn mail_message_id(headers: &[MailHeader], uid: u32) -> String {
    headers
        .get_first_value("Message-ID")
        .and_then(|v| header_ids(&v).next().map(str::to_string))
        .unwrap_or_else(|| format!("imap-uid-{uid}"))
}

fn headers_timestamp(headers: &[MailHeader]) -> Option<i64> {
    headers
        .get_first_value("Date")
        .and_then(|d| mailparse::dateparse(&d).ok())
}

/// Message-ID de l'envoi d'origine (stocké comme fil et message). Les identifiants Gmail /
/// Graph (sans « @ », boîte changée depuis l'envoi) sont ignorés : recherche par expéditeur.
fn sent_message_refs(item: &PendingCampaignResponseCheck) -> Vec<String> {
    [&item.email_gmail_thread_id, &item.email_gmail_message_id]
        .into_iter()
        .flatten()
        .flat_map(|v| header_ids(v).map(str::to_string).collect::<Vec<_>>())
        .filter(|id| id.contains('@'))
        .collect()
}

/// Recherche IMAP : valeur entre guillemets, sans caractère qui casserait la commande.
fn imap_quoted(value: &str) -> Option<String> {
    let v = value.trim();
    // ASCII seulement : SEARCH sans CHARSET (un caractère accentué = commande refusée).
    (!v.is_empty() && v.is_ascii() && !v.chars().any(|c| c == '"' || c == '\\' || c.is_control()))
        .then(|| format!("\"{v}\""))
}

impl ImapMailboxReader {
    pub fn open(app: &AppHandle) -> Result<Self, String> {
        let (conn, servers) = connected_mailbox(app)?;
        let mut session =
            open_imap(&servers, &conn.email, &conn.access_token).map_err(|e| e.message)?;
        session.examine("INBOX").map_err(|e| format!("Boîte de réception : {e}"))?;
        Ok(Self {
            session,
            own_email: conn.email,
            selected: "INBOX".into(),
        })
    }

    pub fn own_email(&self) -> &str {
        &self.own_email
    }

    /// Ouvre `folder` en lecture seule (EXAMINE) s'il n'est pas déjà ouvert.
    fn ensure_folder(&mut self, folder: &str) -> Result<(), String> {
        if self.selected != folder {
            if let Err(e) = self.session.examine(folder) {
                // RFC 3501 : un EXAMINE refusé ne laisse aucun dossier ouvert.
                self.selected.clear();
                return Err(format!("Dossier « {folder} » : {e}"));
            }
            self.selected = folder.to_string();
        }
        Ok(())
    }

    fn scan_folders(&mut self, include_sent: bool) -> Result<Vec<String>, String> {
        let names = self
            .session
            .list(None, Some("*"))
            .map_err(|e| format!("Liste des dossiers : {e}"))?;
        let mut folders: Vec<(u8, String)> = names
            .iter()
            .filter_map(|n| {
                let leaf = folder_leaf(n.name(), n.delimiter());
                if !scan_folder_wanted(n.attributes(), &leaf, include_sent) {
                    return None;
                }
                let is_sent = n.attributes().contains(&imap_proto::NameAttribute::Sent)
                    || SENT_FOLDER_NAMES.contains(&leaf.as_str());
                // Réception puis éléments envoyés d'abord : jamais coupés par le plafond.
                let rank = if n.name().eq_ignore_ascii_case("INBOX") {
                    0
                } else if is_sent {
                    1
                } else {
                    2
                };
                Some((rank, n.name().to_string()))
            })
            .collect();
        folders.sort_by_key(|(rank, _)| *rank);
        folders.truncate(MAX_SCAN_FOLDERS);
        Ok(folders.into_iter().map(|(_, name)| name).collect())
    }

    /// Recherche `query` dans tous les dossiers utiles (rangements par règle compris).
    /// Doublons (même Message-ID dans deux dossiers) retirés, plus récents d'abord.
    pub fn search_all_folders(
        &mut self,
        query: &str,
        include_sent: bool,
        max: usize,
    ) -> Result<Vec<ImapListedMessage>, String> {
        let mut out: Vec<ImapListedMessage> = Vec::new();
        let mut seen: HashSet<String> = HashSet::new();
        let mut searched_any = false;
        let mut last_error = None;
        for folder in self.scan_folders(include_sent)? {
            // Dossier illisible (droits, dossier partagé) : on passe au suivant.
            if self.ensure_folder(&folder).is_err() {
                continue;
            }
            let found = match self.fetch_headers_capped(query, max) {
                Ok(found) => {
                    searched_any = true;
                    found
                }
                Err(e) => {
                    eprintln!("[imap] recherche dans « {folder} » : {e}");
                    last_error = Some(e);
                    continue;
                }
            };
            for msg in found {
                let Ok((headers, _)) = mailparse::parse_headers(&msg.raw) else {
                    continue;
                };
                let message_id = headers
                    .get_first_value("Message-ID")
                    .and_then(|v| header_ids(&v).next().map(str::to_string))
                    .unwrap_or_else(|| format!("imap-{folder}-{}", msg.uid));
                if !seen.insert(message_id.clone()) {
                    continue;
                }
                out.push(ImapListedMessage {
                    folder: folder.clone(),
                    uid: msg.uid,
                    thread_id: headers_thread_root(&headers).unwrap_or_else(|| message_id.clone()),
                    message_id,
                    subject: headers.get_first_value("Subject").unwrap_or_default(),
                    from: headers.get_first_value("From").unwrap_or_default(),
                    received_at: msg
                        .received_at
                        .or_else(|| headers_timestamp(&headers))
                        .unwrap_or(0),
                });
            }
        }
        // Aucun dossier lisible (connexion coupée…) : erreur plutôt qu'une liste vide trompeuse.
        if !searched_any {
            if let Some(e) = last_error {
                return Err(e);
            }
        }
        out.sort_by(|a, b| b.received_at.cmp(&a.received_at));
        out.truncate(max);
        Ok(out)
    }

    /// Corps texte d'un message listé (`None` : supprimé ou déplacé depuis la recherche).
    pub fn fetch_listed(
        &mut self,
        listed: &ImapListedMessage,
    ) -> Result<Option<ImapFetchedMessage>, String> {
        self.ensure_folder(&listed.folder)?;
        let Some(raw) = self.fetch_full(listed.uid)? else {
            return Ok(None);
        };
        let mail = mailparse::parse_mail(&raw).map_err(|e| format!("Message illisible : {e}"))?;
        Ok(Some(ImapFetchedMessage {
            subject: mail.headers.get_first_value("Subject").unwrap_or_default(),
            body_text: mail_body_text(&mail),
        }))
    }

    /// En-têtes et date de réception (INTERNALDATE) des messages trouvés, plus récents d'abord.
    fn fetch_headers(&mut self, query: &str) -> Result<Vec<FetchedHeaders>, String> {
        self.fetch_headers_capped(query, MAX_HEADER_CANDIDATES)
    }

    fn fetch_headers_capped(
        &mut self,
        query: &str,
        max: usize,
    ) -> Result<Vec<FetchedHeaders>, String> {
        let mut uids: Vec<u32> = self
            .session
            .uid_search(query)
            .map_err(|e| format!("Recherche IMAP : {e}"))?
            .into_iter()
            .collect();
        if uids.is_empty() {
            return Ok(vec![]);
        }
        uids.sort_unstable_by(|a, b| b.cmp(a));
        uids.truncate(max);
        let set = uids.iter().map(u32::to_string).collect::<Vec<_>>().join(",");
        let fetches = self
            .session
            .uid_fetch(&set, "(UID INTERNALDATE BODY.PEEK[HEADER])")
            .map_err(|e| format!("Lecture IMAP : {e}"))?;
        let mut out: Vec<FetchedHeaders> = fetches
            .iter()
            .filter_map(|f| {
                Some(FetchedHeaders {
                    uid: f.uid?,
                    received_at: f.internal_date().map(|d| d.timestamp()),
                    raw: f.header()?.to_vec(),
                })
            })
            .collect();
        out.sort_unstable_by(|a, b| b.uid.cmp(&a.uid));
        Ok(out)
    }

    fn fetch_full(&mut self, uid: u32) -> Result<Option<Vec<u8>>, String> {
        let fetches = self
            .session
            .uid_fetch(uid.to_string(), "BODY.PEEK[]")
            .map_err(|e| format!("Lecture IMAP : {e}"))?;
        Ok(fetches.iter().find_map(|f| f.body().map(<[u8]>::to_vec)))
    }

    fn find_reply(
        &mut self,
        item: &PendingCampaignResponseCheck,
    ) -> Result<Option<ImapReplyFound>, String> {
        let Some(from) = imap_quoted(&item.contact_email) else {
            return Ok(None);
        };
        self.ensure_folder("INBOX")?;
        let since = imap_date(item.email_date_envoi - 86_400);
        let refs = sent_message_refs(item);
        // En-têtes seuls pour tous les messages du contact : la réponse au fil n'est pas
        // forcément parmi les plus récents (échange actif, réponses automatiques).
        for msg in self.fetch_headers(&format!("SINCE {since} FROM {from}"))? {
            let Ok((headers, _)) = mailparse::parse_headers(&msg.raw) else {
                continue;
            };
            let from_header = headers.get_first_value("From").unwrap_or_default();
            if !email_matches(&from_header, &item.contact_email) {
                continue;
            }
            // Réception côté serveur (pas l'horloge de l'expéditeur), comme internalDate Gmail.
            let received_at = msg.received_at.or_else(|| headers_timestamp(&headers));
            if received_at.is_some_and(|ts| ts <= item.email_date_envoi) {
                continue;
            }
            // Même règle que Gmail / Outlook : envoi tracé → réponse dans le fil uniquement.
            if !refs.is_empty() && !references_any(&headers, &refs) {
                continue;
            }
            let Some(raw) = self.fetch_full(msg.uid)? else {
                continue;
            };
            let Ok(mail) = mailparse::parse_mail(&raw) else {
                continue;
            };
            let subject = mail
                .headers
                .get_first_value("Subject")
                .filter(|s| !s.trim().is_empty());
            let body_text = mail_body_text(&mail);
            if body_text.trim().is_empty()
                && !is_newsletter_unsubscribe_request(subject.as_deref(), None)
            {
                continue;
            }
            return Ok(Some(ImapReplyFound {
                message_id: mail_message_id(&mail.headers, msg.uid),
                body_text,
                subject,
            }));
        }
        Ok(None)
    }

    pub fn find_contact_reply(
        &mut self,
        item: &PendingCampaignResponseCheck,
    ) -> Result<Option<ImapReplyFound>, String> {
        if let Some(found) = self.find_reply(item)? {
            return Ok(Some(found));
        }
        match first_send_check_item(item) {
            Some(first) => self.find_reply(&first),
            None => Ok(None),
        }
    }

    pub fn list_newsletter_unsubscribe_requests(
        &mut self,
        lookback_days: i64,
        known: &HashSet<String>,
    ) -> Result<Vec<NewsletterUnsubscribeRequest>, String> {
        self.ensure_folder("INBOX")?;
        let since_ts = chrono::Utc::now().timestamp() - lookback_days * 86_400;
        // Sous-chaîne commune à « Désinscription » et « Desinscription » (recherche ASCII).
        let query = format!(
            "SINCE {} SUBJECT \"sinscription newsletter\"",
            imap_date(since_ts)
        );
        let mut out = Vec::new();
        for msg in self.fetch_headers(&query)? {
            let Ok((headers, _)) = mailparse::parse_headers(&msg.raw) else {
                continue;
            };
            let message_id = mail_message_id(&headers, msg.uid);
            let subject = headers.get_first_value("Subject");
            let from_header = headers.get_first_value("From").unwrap_or_default();
            if known.contains(&message_id)
                || !is_newsletter_unsubscribe_request(subject.as_deref(), None)
                || from_header.trim().is_empty()
                || email_matches(&from_header, &self.own_email)
            {
                continue;
            }
            out.push(NewsletterUnsubscribeRequest {
                message_id,
                from_header,
                received_at: msg
                    .received_at
                    .or_else(|| headers_timestamp(&headers))
                    .unwrap_or(0),
            });
        }
        Ok(out)
    }
}

impl Drop for ImapMailboxReader {
    fn drop(&mut self) {
        let _ = self.session.logout();
    }
}

/// Requête IMAP « depuis `since_ts`, expéditeur et objet contenant… » (valeurs sûres).
pub fn imap_scan_query(since_ts: i64, from: &str, subject: &str) -> Option<String> {
    Some(format!(
        "SINCE {} FROM {} SUBJECT {}",
        imap_date(since_ts),
        imap_quoted(from)?,
        imap_quoted(subject)?
    ))
}

/// Requête IMAP des échanges avec `contact_email` (expéditeur ou destinataire).
pub fn imap_contact_query(contact_email: &str) -> Option<String> {
    let q = imap_quoted(contact_email)?;
    Some(format!("OR FROM {q} OR TO {q} CC {q}"))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn scan_skips_drafts_trash_junk_and_optionally_sent() {
        use imap_proto::NameAttribute as A;
        assert!(scan_folder_wanted(&[], "inbox", false));
        assert!(scan_folder_wanted(&[], "stellium", false), "dossier rangé par règle");
        assert!(!scan_folder_wanted(&[A::NoSelect], "archives", false));
        assert!(!scan_folder_wanted(&[A::Trash], "poubelle", false));
        assert!(!scan_folder_wanted(&[], "deleted items", false));
        assert!(!scan_folder_wanted(&[], "courrier ind&aok-sirable", false));
        assert!(!scan_folder_wanted(&[A::Sent], "sent items", false));
        assert!(scan_folder_wanted(&[A::Sent], "sent items", true));
        assert!(scan_folder_wanted(&[], "&amk-l&aok-ments envoy&aok-s", true));
        assert_eq!(folder_leaf("INBOX/Stellium", Some("/")), "stellium");
        assert_eq!(folder_leaf("Sent Items", None), "sent items");
    }

    #[test]
    fn thread_root_prefers_first_reference() {
        let raw = b"References: <a@x> <b@x>\r\nIn-Reply-To: <b@x>\r\n\r\n";
        let (headers, _) = mailparse::parse_headers(raw).unwrap();
        assert_eq!(headers_thread_root(&headers).as_deref(), Some("a@x"));
        let raw = b"In-Reply-To: <b@x>\r\n\r\n";
        let (headers, _) = mailparse::parse_headers(raw).unwrap();
        assert_eq!(headers_thread_root(&headers).as_deref(), Some("b@x"));
    }

    #[test]
    fn scan_queries_are_quoted() {
        let q = imap_scan_query(1_800_000_000, "no-reply@stellium.fr", "Box placement").unwrap();
        assert_eq!(q, "SINCE 15-Jan-2027 FROM \"no-reply@stellium.fr\" SUBJECT \"Box placement\"");
        assert_eq!(
            imap_contact_query("a@b.fr").as_deref(),
            Some("OR FROM \"a@b.fr\" OR TO \"a@b.fr\" CC \"a@b.fr\"")
        );
        assert!(imap_contact_query("a\"@b.fr").is_none());
        assert!(imap_contact_query("andré@b.fr").is_none(), "SEARCH sans CHARSET");
    }

    fn item(thread: Option<&str>, message: Option<&str>) -> PendingCampaignResponseCheck {
        PendingCampaignResponseCheck {
            contact_etiquette_id: 1,
            contact_email: "client@example.fr".into(),
            email_date_envoi: 1_800_000_000,
            email_gmail_thread_id: thread.map(Into::into),
            email_gmail_message_id: message.map(Into::into),
            queue_row_kind: "etiquette".into(),
            first_send_thread: None,
        }
    }

    #[test]
    fn ovh_mx_suggests_email_pro_then_mx_plan() {
        let sug = suggest_from_mx(&["mx1.mail.ovh.net".into()]).unwrap();
        assert_eq!(sug.provider_label.as_deref(), Some("OVH"));
        let hosts: Vec<_> = sug.candidates.iter().map(|c| c.imap_host.as_str()).collect();
        assert_eq!(
            hosts,
            ["pro1.mail.ovh.net", "pro2.mail.ovh.net", "pro3.mail.ovh.net", "ssl0.ovh.net"]
        );
        assert_eq!(sug.candidates[1].smtp_port, 587);
        assert_eq!(sug.candidates[1].smtp_security, SmtpSecurity::Starttls);
        assert_eq!(sug.candidates[3].smtp_security, SmtpSecurity::Tls);
    }

    #[test]
    fn public_domains_and_google_redirect() {
        let orange = suggest_from_email_domain("orange.fr").unwrap();
        assert_eq!(orange.candidates[0].imap_host, "imap.orange.fr");
        let gmail = suggest_from_email_domain("gmail.com").unwrap();
        assert!(gmail.candidates.is_empty());
        assert!(gmail.hint.unwrap().contains("Google"));
        assert!(suggest_from_email_domain("cabinet-dupont.fr").is_none());
    }

    #[test]
    fn server_validation_rejects_urls_and_empty_ports() {
        let mut s = ImapMailboxServers::new("pro2.mail.ovh.net", "pro2.mail.ovh.net", 587);
        assert!(s.validate().is_ok());
        s.imap_host = "https://pro2.mail.ovh.net/owa".into();
        assert!(s.validate().is_err());
        s.imap_host = "pro2.mail.ovh.net".into();
        s.smtp_port = 0;
        assert!(s.validate().is_err());
    }

    #[test]
    fn login_defaults_to_email() {
        let mut s = ImapMailboxServers::new("a.b", "a.b", 465);
        assert_eq!(s.login("moi@cabinet.fr"), "moi@cabinet.fr");
        s.username = Some("  ".into());
        assert_eq!(s.login("moi@cabinet.fr"), "moi@cabinet.fr");
        s.username = Some("compte".into());
        assert_eq!(s.login("moi@cabinet.fr"), "compte");
    }

    #[test]
    fn transport_headers_and_message_id() {
        let id = new_message_id("moi@cabinet.fr");
        assert!(id.starts_with("crm.") && id.ends_with("@cabinet.fr"));
        let raw = with_transport_headers("From: moi@cabinet.fr\r\nSubject: x\r\n\r\nCorps", &id);
        assert!(raw.starts_with("Date: "));
        assert!(raw.contains(&format!("\r\nMessage-ID: <{id}>\r\nFrom: ")));
    }

    #[test]
    fn smtp_bodies_are_reencoded_in_base64() {
        use base64::Engine;
        let decode = |s: &str| {
            String::from_utf8(
                base64::engine::general_purpose::STANDARD
                    .decode(s.replace("\r\n", ""))
                    .unwrap(),
            )
            .unwrap()
        };
        let long = "x".repeat(2000);
        let single = format!(
            "From: a@b.fr\r\nContent-Type: text/html; charset=UTF-8\r\nContent-Transfer-Encoding: 8bit\r\n\r\n<p>{long}</p>\n-- \nSignature"
        );
        let out = smtp_safe_body_encoding(&single);
        assert!(out.lines().all(|l| l.len() <= 998));
        let body = out.split_once("base64\r\n\r\n").unwrap().1;
        assert_eq!(decode(body), format!("<p>{long}</p>\n-- \nSignature"));

        let multi = concat!(
            "From: a@b.fr\r\nContent-Type: multipart/mixed; boundary=\"crm_bnd\"\r\n\r\n",
            "--crm_bnd\r\nContent-Type: text/plain; charset=UTF-8\r\nContent-Transfer-Encoding: 8bit\r\n\r\nBonjour\n-- \nMoi\r\n",
            "--crm_bnd\r\nContent-Type: application/pdf; name=\"a.pdf\"\r\nContent-Transfer-Encoding: base64\r\n\r\nQUJD\r\n\r\n",
            "--crm_bnd--\r\n"
        );
        let out = smtp_safe_body_encoding(multi);
        let (_, after) = out.split_once("Content-Transfer-Encoding: base64\r\n\r\n").unwrap();
        let (encoded, tail) = after.split_once("\r\n--crm_bnd").unwrap();
        assert_eq!(decode(encoded), "Bonjour\n-- \nMoi");
        assert!(tail.contains("QUJD") && tail.ends_with("--crm_bnd--\r\n"));
    }

    #[test]
    fn smtp_reencoding_survives_reply_and_unsubscribe_headers() {
        use base64::Engine;
        let raw = super::super::oauth_send::build_rfc2822_for_tests(
            "moi@cabinet.fr",
            "client@example.fr",
            &format!("<p>{}</p>\n-- \nSignature", "x".repeat(2000)),
            Some("crm.1.abc@cabinet.fr"),
            Some("moi@cabinet.fr"),
        );
        let out = smtp_safe_body_encoding(&raw);
        assert!(out.lines().all(|l| l.len() <= 998));
        assert!(out.contains("In-Reply-To: <crm.1.abc@cabinet.fr>\r\n"));
        assert!(out.contains("List-Unsubscribe: <mailto:moi@cabinet.fr"));
        assert!(!out.contains("8bit"));
        let (_, body) = out.split_once("\r\n\r\n").unwrap();
        let decoded = base64::engine::general_purpose::STANDARD
            .decode(body.replace("\r\n", ""))
            .unwrap();
        assert!(String::from_utf8(decoded).unwrap().ends_with("Signature"));
    }

    #[test]
    fn smtp_reencoding_handles_nested_related_part() {
        use base64::Engine;
        let png = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==";
        let raw = super::super::oauth_send::build_rfc2822_with_inline_image_for_tests(
            &format!("<p>{}</p><img src=\"data:image/png;base64,{png}\">", "x".repeat(1500)),
        );
        let out = smtp_safe_body_encoding(&raw);
        assert!(out.lines().all(|l| l.len() <= 998));
        let parsed = mailparse::parse_mail(out.as_bytes()).unwrap();
        let related = &parsed.subparts[0];
        assert_eq!(related.subparts.len(), 2, "HTML + image intactes");
        let html = related.subparts[0].get_body().unwrap();
        assert!(html.starts_with("<p>xxx") && html.contains("cid:crm-img1-"));
        let img = related.subparts[1].get_body_raw().unwrap();
        assert_eq!(
            img,
            base64::engine::general_purpose::STANDARD.decode(png).unwrap(),
            "image non réencodée"
        );
    }

    #[test]
    fn reply_matches_in_reply_to_or_references() {
        let raw = b"From: Client <client@example.fr>\r\nIn-Reply-To: <crm.1.abc@cabinet.fr>\r\nSubject: Re: Bilan\r\n\r\nMerci !";
        let mail = mailparse::parse_mail(raw).unwrap();
        let refs = sent_message_refs(&item(Some("crm.1.abc@cabinet.fr"), None));
        assert!(references_any(&mail.headers, &refs));
        assert!(!references_any(&mail.headers, &["autre@cabinet.fr".into()]));

        let raw = b"From: client@example.fr\r\nReferences: <x@y> <crm.1.abc@cabinet.fr>\r\n\r\nOk";
        let mail = mailparse::parse_mail(raw).unwrap();
        assert!(references_any(&mail.headers, &refs));

        // Identifiant Gmail (boîte changée depuis l'envoi) : pas de règle « fil uniquement ».
        assert!(sent_message_refs(&item(Some("18c2f0a1b2"), None)).is_empty());
    }

    #[test]
    fn body_prefers_plain_and_skips_attachments() {
        let raw = concat!(
            "Content-Type: multipart/mixed; boundary=\"b\"\r\n\r\n",
            "--b\r\nContent-Type: text/html\r\n\r\n<p>Bonjour <b>HTML</b></p>\r\n",
            "--b\r\nContent-Type: text/plain\r\nContent-Disposition: attachment; filename=\"a.txt\"\r\n\r\npiece jointe\r\n",
            "--b--\r\n"
        );
        let mail = mailparse::parse_mail(raw.as_bytes()).unwrap();
        let text = mail_body_text(&mail);
        assert!(text.contains("Bonjour"));
        assert!(!text.contains("piece jointe"));
    }

    #[test]
    fn imap_search_values_are_quoted_safely() {
        assert_eq!(imap_quoted("a@b.fr").as_deref(), Some("\"a@b.fr\""));
        assert!(imap_quoted("a\"@b.fr").is_none());
        assert!(imap_quoted("").is_none());
        assert_eq!(imap_date(1_800_000_000), "15-Jan-2027");
    }
}
