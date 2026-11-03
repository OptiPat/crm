use super::oauth_client::build_basic_client;
use super::oauth_store::{EmailOAuthConnection, EmailOAuthStore};
use super::response_sync::parse_gmail_send_response;
use super::signature_html::{
    build_outgoing_email_bodies, html_to_plain_signature, inline_remote_images_in_html,
    normalize_signature_html,
};
use crate::commands::DbState;
use crate::database::models::CgpConfig;
use base64::Engine;
use oauth2::reqwest::http_client;
use oauth2::{RefreshToken, TokenResponse};
use tauri::{AppHandle, Manager};

/// Valeur d'en-tête sur une ligne : CR/LF et caractères de contrôle remplacés (anti-injection).
pub(crate) fn sanitize_header_value(value: &str) -> String {
    let cleaned: String = value
        .chars()
        .map(|c| {
            if c.is_control() || c == '\u{2028}' || c == '\u{2029}' {
                ' '
            } else {
                c
            }
        })
        .collect();
    cleaned.split_whitespace().collect::<Vec<_>>().join(" ")
}

/// Adresse email seule : espaces et contrôles retirés.
fn sanitize_address(value: &str) -> String {
    value
        .chars()
        .filter(|c| !c.is_control() && !c.is_whitespace())
        .collect()
}

/// Destinataire valide : une seule adresse, sans séparateur ni espace.
pub(crate) fn validate_recipient_email(email: &str) -> Result<(), String> {
    let e = email.trim();
    let invalid = || format!("Adresse email du destinataire invalide : « {e} ».");
    const FORBIDDEN: &str = ",;<>\"()[]\\";
    if e.is_empty()
        || e
            .chars()
            .any(|c| c.is_whitespace() || c.is_control() || FORBIDDEN.contains(c))
    {
        return Err(invalid());
    }
    let mut parts = e.split('@');
    let (local, domain) = match (parts.next(), parts.next(), parts.next()) {
        (Some(l), Some(d), None) => (l, d),
        _ => return Err(invalid()),
    };
    if local.is_empty() || !domain.contains('.') || domain.starts_with('.') || domain.ends_with('.')
    {
        return Err(invalid());
    }
    Ok(())
}

fn encode_mime_utf8_word(value: &str) -> String {
    let value = sanitize_header_value(value);
    if value.is_ascii() {
        return value;
    }
    let b64 = base64::engine::general_purpose::STANDARD.encode(value.as_bytes());
    format!("=?UTF-8?B?{}?=", b64)
}

/// Nom affiché : encodé si non-ASCII, entre guillemets si caractères spéciaux (« Dupont, Jean »).
fn encode_display_name(name: &str) -> String {
    let name = sanitize_header_value(name);
    if !name.is_ascii() {
        return encode_mime_utf8_word(&name);
    }
    const SPECIALS: &str = "()<>[]:;@\\,.\"";
    if name.chars().any(|c| SPECIALS.contains(c)) {
        let escaped = name.replace('\\', "\\\\").replace('"', "\\\"");
        return format!("\"{escaped}\"");
    }
    name
}

fn encode_mime_subject(subject: &str) -> String {
    encode_mime_utf8_word(subject)
}

fn load_cgp_config(app: &AppHandle) -> CgpConfig {
    app.try_state::<DbState>()
        .and_then(|state| {
            state
                .lock()
                .ok()
                .and_then(|guard| guard.as_ref().and_then(|db| db.get_cgp_config().ok()))
        })
        .unwrap_or_default()
}

pub fn resolve_google_calendar_connection(
    app: &AppHandle,
) -> Result<Option<EmailOAuthConnection>, String> {
    let store = EmailOAuthStore::load(app)?;
    if let Some(ref conn) = store.connection {
        if conn.provider == "google" {
            let mut c = conn.clone();
            refresh_connection_if_needed(app, &mut c)?;
            return Ok(Some(c));
        }
    }
    if let Some(ref conn) = store.google_calendar_connection {
        let mut c = conn.clone();
        refresh_oauth_connection_if_needed(app, &mut c, OAuthConnectionSlot::GoogleCalendar)?;
        return Ok(Some(c));
    }
    Ok(None)
}

pub fn resolve_google_calendar_access_token(app: &AppHandle) -> Result<Option<String>, String> {
    Ok(resolve_google_calendar_connection(app)?.map(|c| c.access_token))
}

pub fn refresh_connection_if_needed(
    app: &AppHandle,
    conn: &mut EmailOAuthConnection,
) -> Result<(), String> {
    refresh_oauth_connection_if_needed(app, conn, OAuthConnectionSlot::Primary)
}

pub enum OAuthConnectionSlot {
    Primary,
    GoogleCalendar,
    MicrosoftOnedrive,
    MicrosoftTeam,
}

pub fn refresh_oauth_connection_if_needed(
    app: &AppHandle,
    conn: &mut EmailOAuthConnection,
    slot: OAuthConnectionSlot,
) -> Result<(), String> {
    if !EmailOAuthStore::connection_needs_refresh(conn) {
        return Ok(());
    }
    let refresh = conn
        .refresh_token
        .clone()
        .ok_or_else(|| -> String {
            match slot {
                OAuthConnectionSlot::MicrosoftOnedrive => {
                    "Session OneDrive expirée. Reconnectez Microsoft dans Paramètres → Intégrations → Dossiers clients."
                        .into()
                }
                OAuthConnectionSlot::MicrosoftTeam => {
                    "Session mode équipe expirée. Reconnectez Microsoft 365 dans Paramètres → Mode équipe."
                        .into()
                }
                OAuthConnectionSlot::GoogleCalendar => {
                    "Session Google Agenda expirée. Reconnectez Google dans Paramètres → Emails & envois → Connexion."
                        .into()
                }
                OAuthConnectionSlot::Primary => {
                    "Session expirée. Reconnectez votre compte dans Paramètres → Emails & envois → Connexion."
                        .into()
                }
            }
        })?;

    let store = EmailOAuthStore::load(app)?;
    let flow_provider = match slot {
        OAuthConnectionSlot::MicrosoftOnedrive => "microsoft_onedrive",
        OAuthConnectionSlot::MicrosoftTeam => "microsoft_team",
        OAuthConnectionSlot::GoogleCalendar => "google_calendar",
        OAuthConnectionSlot::Primary => conn.provider.as_str(),
    };
    let client = build_basic_client(flow_provider, &store)?;

    let token = client
        .exchange_refresh_token(&RefreshToken::new(refresh))
        .request(http_client)
        .map_err(|e| format!("Rafraîchissement du token: {}", e))?;

    conn.access_token = token.access_token().secret().clone();
    if let Some(rt) = token.refresh_token() {
        conn.refresh_token = Some(rt.secret().clone());
    }
    conn.expires_at = token
        .expires_in()
        .map(|d| EmailOAuthStore::now_unix() + d.as_secs() as i64)
        .unwrap_or(EmailOAuthStore::now_unix() + 3500);

    let mut store = EmailOAuthStore::load(app)?;
    match slot {
        OAuthConnectionSlot::Primary => store.connection = Some(conn.clone()),
        OAuthConnectionSlot::GoogleCalendar => {
            store.google_calendar_connection = Some(conn.clone());
        }
        OAuthConnectionSlot::MicrosoftOnedrive => {
            store.microsoft_onedrive_connection = Some(conn.clone());
        }
        OAuthConnectionSlot::MicrosoftTeam => {
            store.microsoft_team_connection = Some(conn.clone());
        }
    }
    store.save(app)?;
    Ok(())
}

fn cgp_sender_display_name(cgp: &CgpConfig) -> Option<String> {
    let full = [cgp.prenom.as_deref(), cgp.nom.as_deref()]
        .into_iter()
        .flatten()
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .collect::<Vec<_>>()
        .join(" ");
    if full.is_empty() {
        None
    } else {
        Some(full)
    }
}

fn format_addresses(
    from_email: &str,
    from_name: Option<&str>,
    to_email: &str,
    to_name: Option<&str>,
) -> (String, String) {
    let from_email = sanitize_address(from_email);
    let to_email = sanitize_address(to_email);
    let from = match from_name.map(sanitize_header_value) {
        Some(n) if !n.is_empty() => format!("{} <{}>", encode_display_name(&n), from_email),
        _ => from_email,
    };
    let to = match to_name.map(sanitize_header_value) {
        Some(n) if !n.is_empty() => format!("{} <{}>", encode_display_name(&n), to_email),
        _ => to_email,
    };
    (from, to)
}

fn build_rfc2822_plain(from: &str, to: &str, subject: &str, body: &str) -> String {
    format!(
        "From: {}\r\nTo: {}\r\nSubject: {}\r\nMIME-Version: 1.0\r\nContent-Type: text/plain; charset=UTF-8\r\nContent-Transfer-Encoding: 8bit\r\n\r\n{}",
        from, to, subject, body
    )
}

/// Une seule partie HTML (évite que Gmail affiche le source MIME multipart brut).
fn build_rfc2822_html(from: &str, to: &str, subject: &str, body_html: &str) -> String {
    format!(
        "From: {}\r\nTo: {}\r\nSubject: {}\r\nMIME-Version: 1.0\r\nContent-Type: text/html; charset=UTF-8\r\nContent-Transfer-Encoding: 8bit\r\n\r\n{}",
        from, to, subject, body_html
    )
}

/// Image de signature (ou de corps) intégrée en `data:` URI. Outlook / Exchange (et Gmail)
/// ne l'affichent pas — le nom de l'image apparaît à la place : elle part en pièce « en
/// ligne » (`Content-ID`) référencée par `cid:` dans le HTML.
#[derive(Debug, Clone, PartialEq)]
pub(crate) struct InlineImage {
    pub cid: String,
    pub mime_type: String,
    pub data: Vec<u8>,
}

fn inline_image_extension(mime_type: &str) -> &'static str {
    match mime_type {
        "image/png" => "png",
        "image/gif" => "gif",
        "image/webp" => "webp",
        _ => "jpg",
    }
}

/// Guillemet ouvrant si `before` se termine par `src="` / `src='` (espaces tolérés).
fn img_src_quote_before(before: &str) -> Option<char> {
    let quote = before.chars().last().filter(|c| *c == '"' || *c == '\'')?;
    let attr = before[..before.len() - 1].trim_end().strip_suffix('=')?.trim_end();
    let name_start = attr.len().checked_sub(3)?;
    let name = attr.get(name_start..)?;
    let boundary_ok = attr[..name_start]
        .chars()
        .last()
        .is_some_and(|c| c.is_ascii_whitespace());
    (name.eq_ignore_ascii_case("src") && boundary_ok).then_some(quote)
}

/// Remplace chaque `src="data:image/...;base64,..."` du HTML par `cid:` (même image = même
/// cid). Seule la valeur entière d'un attribut `src` est convertie : texte, `srcset` ou CSS
/// contenant une data URI restent tels quels.
pub(crate) fn extract_inline_images(html: &str) -> (String, Vec<InlineImage>) {
    const PREFIX: &str = "data:image/";
    let nonce = chrono::Utc::now().timestamp_millis();
    let mut out = String::with_capacity(html.len());
    let mut images: Vec<InlineImage> = Vec::new();
    let mut rest = html;
    while let Some(pos) = rest.find(PREFIX) {
        let after = &rest[pos + PREFIX.len()..];
        let parsed = img_src_quote_before(&rest[..pos]).and_then(|quote| {
            let (raw_subtype, tail) = after.split_once(";base64,")?;
            let subtype = raw_subtype.to_ascii_lowercase();
            if subtype.is_empty()
                || !subtype
                    .chars()
                    .all(|c| c.is_ascii_alphanumeric() || c == '+' || c == '-' || c == '.')
            {
                return None;
            }
            // La valeur doit se terminer exactement au guillemet fermant.
            let len = tail.find(quote)?;
            let value = &tail[..len];
            if !value
                .chars()
                .all(|c| c.is_ascii_alphanumeric() || "+/=".contains(c) || c.is_ascii_whitespace())
            {
                return None;
            }
            let cleaned: String = value.chars().filter(|c| !c.is_ascii_whitespace()).collect();
            let data = base64::engine::general_purpose::STANDARD.decode(cleaned).ok()?;
            let consumed = PREFIX.len() + raw_subtype.len() + ";base64,".len() + len;
            Some((format!("image/{subtype}"), data, consumed))
        });
        let Some((mime_type, data, consumed)) = parsed.filter(|(_, d, _)| !d.is_empty()) else {
            out.push_str(&rest[..pos + PREFIX.len()]);
            rest = &rest[pos + PREFIX.len()..];
            continue;
        };
        let cid = match images.iter().find(|img| img.data == data) {
            Some(existing) => existing.cid.clone(),
            None => {
                let cid = format!(
                    "crm-img{}-{nonce}.{}@crm",
                    images.len() + 1,
                    inline_image_extension(&mime_type)
                );
                images.push(InlineImage {
                    cid: cid.clone(),
                    mime_type,
                    data,
                });
                cid
            }
        };
        out.push_str(&rest[..pos]);
        out.push_str("cid:");
        out.push_str(&cid);
        rest = &rest[pos + consumed..];
    }
    out.push_str(rest);
    (out, images)
}

fn push_base64_lines(message: &mut String, data: &[u8]) {
    let b64 = base64::engine::general_purpose::STANDARD.encode(data);
    for chunk in b64.as_bytes().chunks(76) {
        message.push_str(std::str::from_utf8(chunk).unwrap_or(""));
        message.push_str("\r\n");
    }
}

/// Corps d'une partie `multipart/related` : le HTML puis ses images en ligne.
fn related_parts(boundary: &str, html: &str, images: &[InlineImage]) -> String {
    let mut out = format!(
        "--{boundary}\r\nContent-Type: text/html; charset=UTF-8\r\nContent-Transfer-Encoding: 8bit\r\n\r\n{html}\r\n"
    );
    for img in images {
        let name = format!("image.{}", inline_image_extension(&img.mime_type));
        out.push_str(&format!(
            "--{boundary}\r\nContent-Type: {}; name=\"{name}\"\r\nContent-Transfer-Encoding: base64\r\nContent-ID: <{}>\r\nContent-Disposition: inline; filename=\"{name}\"\r\n\r\n",
            img.mime_type, img.cid
        ));
        push_base64_lines(&mut out, &img.data);
    }
    out.push_str(&format!("--{boundary}--\r\n"));
    out
}

/// HTML avec images en ligne, sans pièce jointe.
fn build_rfc2822_html_related(
    from: &str,
    to: &str,
    subject: &str,
    body_html: &str,
    images: &[InlineImage],
) -> String {
    let boundary = format!("crm_related_{}", chrono::Utc::now().timestamp_millis());
    format!(
        "From: {from}\r\nTo: {to}\r\nSubject: {subject}\r\nMIME-Version: 1.0\r\nContent-Type: multipart/related; type=\"text/html\"; boundary=\"{boundary}\"\r\n\r\n{}",
        related_parts(&boundary, body_html, images)
    )
}

#[derive(Debug, Clone)]
pub struct OutgoingEmailAttachment {
    pub filename: String,
    pub mime_type: String,
    pub data: Vec<u8>,
}

fn encode_content_disposition_filename(filename: &str) -> String {
    if filename.is_ascii() {
        format!("filename=\"{}\"", filename.replace('"', "_"))
    } else {
        let encoded: String = filename
            .bytes()
            .map(|b| match b {
                b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'-' | b'_' | b'.' | b'~' => {
                    (b as char).to_string()
                }
                _ => format!("%{b:02X}"),
            })
            .collect();
        format!("filename*=UTF-8''{encoded}")
    }
}

fn build_rfc2822_with_attachments(
    from: &str,
    to: &str,
    subject: &str,
    body: &str,
    body_html: Option<&str>,
    inline_images: &[InlineImage],
    attachments: &[OutgoingEmailAttachment],
) -> String {
    let boundary = format!("crm_boundary_{}", chrono::Utc::now().timestamp_millis());
    let mut message = format!(
        "From: {}\r\nTo: {}\r\nSubject: {}\r\nMIME-Version: 1.0\r\nContent-Type: multipart/mixed; boundary=\"{}\"\r\n\r\n",
        from, to, subject, boundary
    );

    let body_part = if let Some(html) = body_html.filter(|h| !h.trim().is_empty()) {
        if inline_images.is_empty() {
            format!(
                "--{boundary}\r\nContent-Type: text/html; charset=UTF-8\r\nContent-Transfer-Encoding: 8bit\r\n\r\n{html}\r\n"
            )
        } else {
            let related = format!("crm_related_{}", chrono::Utc::now().timestamp_millis());
            format!(
                "--{boundary}\r\nContent-Type: multipart/related; type=\"text/html\"; boundary=\"{related}\"\r\n\r\n{}\r\n",
                related_parts(&related, html, inline_images)
            )
        }
    } else {
        format!(
            "--{boundary}\r\nContent-Type: text/plain; charset=UTF-8\r\nContent-Transfer-Encoding: 8bit\r\n\r\n{body}\r\n"
        )
    };
    message.push_str(&body_part);

    for att in attachments {
        let filename =
            crate::template_email_attachments::sanitize_attachment_filename(&att.filename)
                .unwrap_or_else(|_| "attachment".to_string());
        let mime_type = crate::template_email_attachments::sanitize_mime_type(&att.mime_type)
            .unwrap_or_else(|_| "application/octet-stream".to_string());
        let disp = encode_content_disposition_filename(&filename);
        message.push_str(&format!(
            "--{boundary}\r\nContent-Type: {}; name=\"{}\"\r\nContent-Disposition: attachment; {disp}\r\nContent-Transfer-Encoding: base64\r\n\r\n",
            mime_type,
            filename.replace('"', "_"),
        ));
        push_base64_lines(&mut message, &att.data);
        message.push('\r');
        message.push('\n');
    }

    message.push_str(&format!("--{boundary}--\r\n"));
    message
}

#[derive(Debug, Clone, Default)]
pub struct GmailThreadReply {
    pub thread_id: Option<String>,
    pub in_reply_to_message_id: Option<String>,
    /// Newsletter : adresse du lien de désinscription (en-tête List-Unsubscribe, Gmail).
    pub list_unsubscribe_email: Option<String>,
}

fn has_gmail_reply_context(reply: Option<&GmailThreadReply>) -> bool {
    reply.is_some_and(|reply| {
        reply
            .thread_id
            .as_deref()
            .is_some_and(|value| !value.trim().is_empty())
            || reply
                .in_reply_to_message_id
                .as_deref()
                .is_some_and(|value| !value.trim().is_empty())
    })
}

/// Même objet que le lien « Se désinscrire » du pied de newsletter : la demande reçue
/// est reconnue par la synchro mail. Adresse invalide → pas d'en-tête.
fn list_unsubscribe_header(email: &str) -> Option<String> {
    let email = email.trim();
    validate_recipient_email(email).ok()?;
    Some(format!(
        "List-Unsubscribe: <mailto:{email}?subject=D%C3%A9sinscription%20newsletter>\r\n"
    ))
}

fn append_reply_headers(base: &str, reply: Option<&GmailThreadReply>) -> String {
    let Some(reply) = reply else {
        return base.to_string();
    };
    let mut extra = String::new();
    if let Some(ref mid) = reply.in_reply_to_message_id {
        // Id venu du front : sans espace ni CR/LF (anti-injection), toujours entre <>.
        let cleaned = sanitize_address(mid);
        let inner = cleaned.trim_start_matches('<').trim_end_matches('>');
        if !inner.is_empty() && !inner.contains(['<', '>']) {
            let token = format!("<{inner}>");
            extra.push_str(&format!("In-Reply-To: {}\r\n", token));
            extra.push_str(&format!("References: {}\r\n", token));
        }
    }
    if let Some(header) = reply
        .list_unsubscribe_email
        .as_deref()
        .and_then(list_unsubscribe_header)
    {
        extra.push_str(&header);
    }
    if extra.is_empty() {
        return base.to_string();
    }
    if let Some(pos) = base.find("\r\n\r\n") {
        // Après le CRLF du dernier en-tête (sinon « …8bitIn-Reply-To: »).
        let split = pos + 2;
        format!("{}{}{}", &base[..split], extra, &base[split..])
    } else {
        format!("{}{}", base, extra)
    }
}

fn build_rfc2822(
    from_email: &str,
    from_name: Option<&str>,
    to_email: &str,
    to_name: Option<&str>,
    subject: &str,
    body: &str,
    body_html: Option<&str>,
    reply: Option<&GmailThreadReply>,
    attachments: &[OutgoingEmailAttachment],
) -> String {
    let (from, to) = format_addresses(from_email, from_name, to_email, to_name);
    let subject_hdr = encode_mime_subject(subject);
    let (html_cid, inline_images) = match body_html.filter(|h| !h.trim().is_empty()) {
        Some(html) => {
            let (h, imgs) = extract_inline_images(html);
            (Some(h), imgs)
        }
        None => (None, vec![]),
    };
    let body_html = html_cid.as_deref();
    let core = if attachments.is_empty() {
        match body_html {
            Some(html) if !inline_images.is_empty() => {
                build_rfc2822_html_related(&from, &to, &subject_hdr, html, &inline_images)
            }
            Some(html) => build_rfc2822_html(&from, &to, &subject_hdr, html),
            None => build_rfc2822_plain(&from, &to, &subject_hdr, body),
        }
    } else {
        build_rfc2822_with_attachments(
            &from,
            &to,
            &subject_hdr,
            body,
            body_html,
            &inline_images,
            attachments,
        )
    };
    append_reply_headers(&core, reply)
}

/// Message HTML avec image en ligne + pièce jointe (tests du réencodage SMTP).
#[cfg(test)]
pub(crate) fn build_rfc2822_with_inline_image_for_tests(body_html: &str) -> String {
    let att = OutgoingEmailAttachment {
        filename: "doc.pdf".into(),
        mime_type: "application/pdf".into(),
        data: b"%PDF".to_vec(),
    };
    build_rfc2822("a@b.fr", None, "c@d.fr", None, "Objet", "", Some(body_html), None, &[att])
}

/// Message HTML d'une ligne avec en-têtes de réponse / désinscription (tests SMTP).
#[cfg(test)]
pub(crate) fn build_rfc2822_for_tests(
    from_email: &str,
    to_email: &str,
    body_html: &str,
    in_reply_to: Option<&str>,
    list_unsubscribe_email: Option<&str>,
) -> String {
    let reply = GmailThreadReply {
        thread_id: None,
        in_reply_to_message_id: in_reply_to.map(str::to_string),
        list_unsubscribe_email: list_unsubscribe_email.map(str::to_string),
    };
    build_rfc2822(
        from_email,
        None,
        to_email,
        None,
        "Objet",
        "",
        Some(body_html),
        Some(&reply),
        &[],
    )
}

fn send_via_gmail(
    conn: &EmailOAuthConnection,
    from_name: Option<&str>,
    to_email: &str,
    to_name: Option<&str>,
    subject: &str,
    body: &str,
    body_html: Option<&str>,
    reply: Option<&GmailThreadReply>,
    attachments: &[OutgoingEmailAttachment],
) -> Result<Option<(String, String)>, String> {
    let raw = build_rfc2822(
        &conn.email,
        from_name,
        to_email,
        to_name,
        subject,
        body,
        body_html,
        reply,
        attachments,
    );
    let encoded = base64::engine::general_purpose::URL_SAFE_NO_PAD.encode(raw.as_bytes());
    let mut payload = serde_json::json!({ "raw": encoded });
    if let Some(tid) = reply.and_then(|r| r.thread_id.as_deref()) {
        if !tid.trim().is_empty() {
            payload["threadId"] = serde_json::json!(tid);
        }
    }
    let client = reqwest::blocking::Client::new();
    let res = client
        .post("https://gmail.googleapis.com/gmail/v1/users/me/messages/send")
        .bearer_auth(&conn.access_token)
        .json(&payload)
        .send()
        .map_err(|e| e.to_string())?;
    if !res.status().is_success() {
        let err = res.text().unwrap_or_default();
        return Err(format!("Gmail API: {}", err));
    }
    let text = res.text().unwrap_or_default();
    Ok(parse_gmail_send_response(&text))
}

fn send_via_microsoft(
    conn: &EmailOAuthConnection,
    send_mail_url: &str,
    to_email: &str,
    to_name: Option<&str>,
    subject: &str,
    body: &str,
    body_html: Option<&str>,
    attachments: &[OutgoingEmailAttachment],
) -> Result<(), String> {
    let display_name = to_name.unwrap_or(to_email);
    let (html_cid, inline_images) = match body_html.filter(|h| !h.trim().is_empty()) {
        Some(html) => {
            let (h, imgs) = extract_inline_images(html);
            (Some(h), imgs)
        }
        None => (None, vec![]),
    };
    let (content_type, content) = match html_cid.as_deref() {
        Some(html) => ("HTML", html),
        None => ("Text", body),
    };
    let mut graph_attachments: Vec<serde_json::Value> = attachments
        .iter()
        .map(|att| {
            serde_json::json!({
                "@odata.type": "#microsoft.graph.fileAttachment",
                "name": att.filename,
                "contentType": att.mime_type,
                "contentBytes": base64::engine::general_purpose::STANDARD.encode(&att.data),
            })
        })
        .collect();
    graph_attachments.extend(inline_images.iter().map(|img| {
        serde_json::json!({
            "@odata.type": "#microsoft.graph.fileAttachment",
            "name": format!("image.{}", inline_image_extension(&img.mime_type)),
            "contentType": img.mime_type,
            "contentBytes": base64::engine::general_purpose::STANDARD.encode(&img.data),
            "isInline": true,
            "contentId": img.cid,
        })
    }));
    let mut message = serde_json::json!({
        "subject": subject,
        "body": { "contentType": content_type, "content": content },
        "toRecipients": [{
            "emailAddress": {
                "address": to_email,
                "name": display_name
            }
        }]
    });
    if !graph_attachments.is_empty() {
        message["attachments"] = serde_json::json!(graph_attachments);
    }
    let client = reqwest::blocking::Client::new();
    let res = client
        .post(send_mail_url)
        .bearer_auth(&conn.access_token)
        .json(&serde_json::json!({
            "message": message,
            "saveToSentItems": true
        }))
        .send()
        .map_err(|e| e.to_string())?;
    if !res.status().is_success() {
        let err = res.text().unwrap_or_default();
        return Err(format!("Microsoft Graph: {}", err));
    }
    Ok(())
}

#[derive(Debug, Clone, Default, serde::Serialize)]
pub struct OAuthSendResult {
    pub gmail_message_id: Option<String>,
    pub gmail_thread_id: Option<String>,
}

/// Boîte SMTP / IMAP : le Message-ID tient lieu d'identifiant de message et de fil
/// (la synchro des réponses cherche ce Message-ID dans In-Reply-To / References).
fn send_via_smtp(
    app: &AppHandle,
    conn: &EmailOAuthConnection,
    from_name: Option<&str>,
    to_email: &str,
    to_name: Option<&str>,
    subject: &str,
    body: &str,
    body_html: Option<&str>,
    reply: Option<&GmailThreadReply>,
    attachments: &[OutgoingEmailAttachment],
) -> Result<OAuthSendResult, String> {
    let raw = build_rfc2822(
        &conn.email,
        from_name,
        to_email,
        to_name,
        subject,
        body,
        body_html,
        reply,
        attachments,
    );
    let message_id = super::imap_mailbox::send_raw_message(app, to_email, &raw)?;
    let thread_id = reply
        .and_then(|r| r.thread_id.as_deref())
        .map(str::trim)
        .filter(|t| !t.is_empty())
        .map(str::to_string)
        .unwrap_or_else(|| message_id.clone());
    Ok(OAuthSendResult {
        gmail_message_id: Some(message_id),
        gmail_thread_id: Some(thread_id),
    })
}

pub fn send_with_resolved_identity(
    app: &AppHandle,
    identity: &crate::workspace::mailbox::ResolvedSendIdentity,
    to_email: &str,
    to_name: Option<&str>,
    subject: &str,
    body: &str,
    body_html: Option<&str>,
    reply: Option<&GmailThreadReply>,
    attachments: &[OutgoingEmailAttachment],
) -> Result<OAuthSendResult, String> {
    use crate::workspace::commands::resolve_microsoft_team_connection;
    use crate::workspace::mailbox::{microsoft_graph_send_mail_url, SendMailboxRoute};

    if identity.route == SendMailboxRoute::OfficeShared && has_gmail_reply_context(reply) {
        return Err(
            "La boîte cabinet Microsoft ne peut pas répondre dans un fil Gmail. \
             Envoyez un nouveau message ou utilisez le compte Google d'origine."
                .into(),
        );
    }

    validate_recipient_email(to_email)?;
    let to_email = to_email.trim();
    let subject_clean = sanitize_header_value(subject);
    let subject = subject_clean.as_str();

    let from_name = cgp_sender_display_name(&load_cgp_config(app));

    match identity.route {
        SendMailboxRoute::Primary => {
            let store = EmailOAuthStore::load(app)?;
            let mut conn = store
                .connection
                .clone()
                .ok_or("Aucun compte connecté (Google/Microsoft). Paramètres → Emails & envois → Connexion : connectez votre boîte.")?;
            refresh_connection_if_needed(app, &mut conn)?;
            match conn.provider.as_str() {
                "google" => {
                    let ids = send_via_gmail(
                        &conn,
                        from_name.as_deref(),
                        to_email,
                        to_name,
                        subject,
                        body,
                        body_html,
                        reply,
                        attachments,
                    )?;
                    Ok(OAuthSendResult {
                        gmail_message_id: ids.as_ref().map(|(m, _)| m.clone()),
                        gmail_thread_id: ids.map(|(_, t)| t),
                    })
                }
                "microsoft" => {
                    let send_mail_url =
                        microsoft_graph_send_mail_url(SendMailboxRoute::Primary, &conn.email);
                    send_via_microsoft(
                        &conn,
                        &send_mail_url,
                        to_email,
                        to_name,
                        subject,
                        body,
                        body_html,
                        attachments,
                    )?;
                    Ok(OAuthSendResult::default())
                }
                super::imap_mailbox::IMAP_PROVIDER => send_via_smtp(
                    app,
                    &conn,
                    from_name.as_deref(),
                    to_email,
                    to_name,
                    subject,
                    body,
                    body_html,
                    reply,
                    attachments,
                ),
                _ => Err("Fournisseur OAuth non supporté".into()),
            }
        }
        SendMailboxRoute::OfficeShared => {
            let conn = resolve_microsoft_team_connection(app)?.ok_or_else(|| {
                "Connectez un compte Microsoft équipe (Paramètres → Mode équipe).".to_string()
            })?;
            let send_mail_url =
                microsoft_graph_send_mail_url(SendMailboxRoute::OfficeShared, &identity.sender_email);
            send_via_microsoft(
                &conn,
                &send_mail_url,
                to_email,
                to_name,
                subject,
                body,
                body_html,
                attachments,
            )?;
            Ok(OAuthSendResult::default())
        }
    }
}

pub fn send_with_oauth(
    app: &AppHandle,
    to_email: &str,
    to_name: Option<&str>,
    subject: &str,
    body: &str,
    body_html: Option<&str>,
    reply: Option<&GmailThreadReply>,
    attachments: &[OutgoingEmailAttachment],
) -> Result<OAuthSendResult, String> {
    let store = EmailOAuthStore::load(app)?;
    let mut conn = store
        .connection
        .clone()
        .ok_or("Aucun compte connecté (Google/Microsoft). Paramètres → Emails & envois → Connexion : connectez votre boîte.")?;

    refresh_connection_if_needed(app, &mut conn)?;

    let from_name = cgp_sender_display_name(&load_cgp_config(app));

    match conn.provider.as_str() {
        "google" => {
            let ids = send_via_gmail(
                &conn,
                from_name.as_deref(),
                to_email,
                to_name,
                subject,
                body,
                body_html,
                reply,
                attachments,
            )?;
            Ok(OAuthSendResult {
                gmail_message_id: ids.as_ref().map(|(m, _)| m.clone()),
                gmail_thread_id: ids.map(|(_, t)| t),
            })
        }
        "microsoft" => {
            let send_mail_url = crate::workspace::mailbox::microsoft_graph_send_mail_url(
                crate::workspace::mailbox::SendMailboxRoute::Primary,
                &conn.email,
            );
            send_via_microsoft(
                &conn,
                &send_mail_url,
                to_email,
                to_name,
                subject,
                body,
                body_html,
                attachments,
            )?;
            Ok(OAuthSendResult::default())
        }
        super::imap_mailbox::IMAP_PROVIDER => send_via_smtp(
            app,
            &conn,
            from_name.as_deref(),
            to_email,
            to_name,
            subject,
            body,
            body_html,
            reply,
            attachments,
        ),
        _ => Err("Fournisseur OAuth non supporté".into()),
    }
}

#[derive(serde::Serialize)]
pub struct ImportedGmailSignature {
    pub html: String,
    pub plain: String,
}

/// Récupère la signature Gmail (alias d'envoi par défaut). Nécessite gmail.settings.basic.
pub fn fetch_gmail_signature(app: &AppHandle) -> Result<ImportedGmailSignature, String> {
    let store = EmailOAuthStore::load(app)?;
    let mut conn = store
        .connection
        .clone()
        .ok_or("Connectez Google dans Paramètres → Emails & envois → Connexion.")?;
    if conn.provider != "google" {
        return Err("L'import de signature fonctionne uniquement avec un compte Google.".into());
    }
    refresh_connection_if_needed(app, &mut conn)?;

    let client = reqwest::blocking::Client::new();
    let res = client
        .get("https://gmail.googleapis.com/gmail/v1/users/me/settings/sendAs")
        .bearer_auth(&conn.access_token)
        .send()
        .map_err(|e| e.to_string())?;
    if !res.status().is_success() {
        let err = res.text().unwrap_or_default();
        if err.contains("insufficient") || err.contains("403") {
            return Err(
                "Accès refusé : reconnectez Google (Paramètres → Emails & envois → Signature) pour autoriser la lecture de la signature."
                    .into(),
            );
        }
        return Err(format!("Gmail API (signature): {}", err));
    }

    let body: serde_json::Value = res.json().map_err(|e| e.to_string())?;
    let entries = body
        .get("sendAs")
        .and_then(|v| v.as_array())
        .ok_or("Réponse Gmail inattendue (sendAs).")?;

    let pick = entries
        .iter()
        .find(|e| e.get("isDefault").and_then(|v| v.as_bool()) == Some(true))
        .or_else(|| {
            entries
                .iter()
                .find(|e| e.get("isPrimary").and_then(|v| v.as_bool()) == Some(true))
        })
        .or_else(|| entries.first());

    let entry = pick.ok_or("Aucun alias d'envoi Gmail trouvé.")?;
    let sig_html = entry
        .get("signature")
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .trim();
    if sig_html.is_empty() {
        return Err(
            "Aucune signature configurée dans Gmail (Paramètres Gmail → Signature).".into(),
        );
    }
    let html = inline_remote_images_in_html(&normalize_signature_html(sig_html));
    let plain = html_to_plain_signature(&html);
    Ok(ImportedGmailSignature { html, plain })
}

pub fn send_test_to_self(app: &AppHandle) -> Result<String, String> {
    let store = EmailOAuthStore::load(app)?;
    let conn = store
        .connection
        .as_ref()
        .ok_or("Aucun compte OAuth connecté")?;
    let cgp = load_cgp_config(app);
    const MESSAGE: &str = "Ceci est un email de test envoyé via votre boîte connectée au CRM.\n\nSi vous le recevez, la connexion fonctionne.";
    let (body, body_html) = build_outgoing_email_bodies(
        MESSAGE,
        cgp.email_signature.as_deref(),
        cgp.email_signature_html.as_deref(),
    );
    send_with_oauth(
        app,
        &conn.email,
        None,
        "Test CRM W.Y.S — connexion de la boîte mail",
        &body,
        body_html.as_deref(),
        None,
        &[],
    )?;
    let sig_note = if cgp
        .email_signature_html
        .as_deref()
        .is_some_and(|s| !s.trim().is_empty())
        || cgp
            .email_signature
            .as_deref()
            .is_some_and(|s| !s.trim().is_empty())
    {
        " (avec signature du profil)"
    } else {
        " (sans signature : configurez-la dans Paramètres → Profil)"
    };
    Ok(format!("Email de test envoyé à {}{}", conn.email, sig_note))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn headers_strip_crlf_and_quote_special_names() {
        let raw = build_rfc2822(
            "cgp@example.com",
            Some("Cabinet"),
            "jean@example.com",
            Some("Dupont, Jean"),
            "Objet\r\nBcc: tiers@example.com",
            "Corps",
            None,
            None,
            &[],
        );
        assert!(raw.contains("To: \"Dupont, Jean\" <jean@example.com>"));
        assert!(raw.contains("Subject: Objet Bcc: tiers@example.com\r\n"));
        assert!(!raw.contains("\r\nBcc:"));
    }

    #[test]
    fn recipient_validation_rejects_lists_and_garbage() {
        assert!(validate_recipient_email("jean@example.com").is_ok());
        assert!(validate_recipient_email(" jean@example.com ").is_ok());
        assert!(validate_recipient_email("a@x.fr; b@y.fr").is_err());
        assert!(validate_recipient_email("a@x.fr,b@y.fr").is_err());
        assert!(validate_recipient_email("pas-un-email").is_err());
        assert!(validate_recipient_email("a@b@c.fr").is_err());
        assert!(validate_recipient_email("a@localhost").is_err());
    }

    #[test]
    fn to_header_encodes_non_ascii_display_name() {
        let raw = build_rfc2822(
            "cgp@example.com",
            Some("Jean DUPONT"),
            "celine@example.com",
            Some("Céline CHUNG"),
            "Sujet",
            "Corps",
            None,
            None,
            &[],
        );
        assert!(raw.contains("To: =?UTF-8?B?"));
        assert!(raw.contains("<celine@example.com>"));
        assert!(!raw.contains("To: Céline"));
    }

    #[test]
    fn from_header_includes_cgp_display_name() {
        let raw = build_rfc2822(
            "cgp@example.com",
            Some("Jean DUPONT"),
            "client@example.com",
            Some("Marie"),
            "Sujet",
            "Corps",
            None,
            None,
            &[],
        );
        assert!(raw.starts_with("From: Jean DUPONT <cgp@example.com>"));
    }

    const PNG_1PX: &str = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==";

    #[test]
    fn data_uri_images_become_cid_references() {
        let html = format!(
            "<p>Sig</p><img src=\"data:image/png;base64,{PNG_1PX}\" alt=\"photo.jpg\"><img src='data:image/png;base64,{PNG_1PX}'><img src=\"https://x.fr/a.png\">"
        );
        let (out, images) = extract_inline_images(&html);
        assert_eq!(images.len(), 1, "même image = une seule pièce");
        assert_eq!(images[0].mime_type, "image/png");
        assert!(!out.contains("data:image"));
        assert_eq!(out.matches(&format!("cid:{}", images[0].cid)).count(), 2);
        assert!(out.contains("https://x.fr/a.png"));
    }

    #[test]
    fn malformed_data_uri_is_left_untouched() {
        let html = "<img src=\"data:image/png;base64,@@@\">";
        let (out, images) = extract_inline_images(html);
        assert!(images.is_empty());
        assert_eq!(out, html);
    }

    #[test]
    fn data_uri_outside_img_src_value_is_left_untouched() {
        for html in [
            format!("<p>data:image/png;base64,{PNG_1PX} ok go</p>"),
            format!("<img srcset=\"data:image/png;base64,{PNG_1PX} 100w\">"),
            format!("<div style=\"background:url(data:image/png;base64,{PNG_1PX})\"></div>"),
            format!("<img src=\"data:image/png;base64,{PNG_1PX} 100w\">"),
            format!("<img data-src=\"data:image/png;base64,{PNG_1PX}\">"),
        ] {
            let (out, images) = extract_inline_images(&html);
            assert!(images.is_empty(), "{html}");
            assert_eq!(out, html);
        }
    }

    #[test]
    fn src_attribute_variants_are_converted() {
        let html = format!("<IMG SRC = 'data:image/png;base64,{PNG_1PX}' alt=x>");
        let (out, images) = extract_inline_images(&html);
        assert_eq!(images.len(), 1);
        assert_eq!(out, format!("<IMG SRC = 'cid:{}' alt=x>", images[0].cid));
    }

    #[test]
    fn related_message_keeps_reply_and_unsubscribe_headers() {
        let html = format!("<img src=\"data:image/png;base64,{PNG_1PX}\">");
        let reply = GmailThreadReply {
            thread_id: None,
            in_reply_to_message_id: Some("crm.1.abc@cabinet.fr".into()),
            list_unsubscribe_email: Some("moi@cabinet.fr".into()),
        };
        let raw = build_rfc2822("a@b.fr", None, "c@d.fr", None, "Objet", "", Some(&html), Some(&reply), &[]);
        let parsed = mailparse::parse_mail(raw.as_bytes()).unwrap();
        use mailparse::MailHeaderMap;
        assert_eq!(parsed.ctype.mimetype, "multipart/related");
        assert_eq!(
            parsed.headers.get_first_value("In-Reply-To").as_deref(),
            Some("<crm.1.abc@cabinet.fr>")
        );
        assert!(parsed.headers.get_first_value("List-Unsubscribe").is_some());
        assert_eq!(parsed.subparts.len(), 2);
    }

    #[test]
    fn html_with_inline_image_is_multipart_related() {
        let html = format!("<p>Bonjour</p><img src=\"data:image/png;base64,{PNG_1PX}\">");
        let raw = build_rfc2822("a@b.fr", None, "c@d.fr", None, "Objet", "", Some(&html), None, &[]);
        assert!(raw.contains("Content-Type: multipart/related; type=\"text/html\""));
        assert!(raw.contains("Content-ID: <crm-img1-"));
        assert!(raw.contains("Content-Disposition: inline"));
        assert!(raw.contains("src=\"cid:crm-img1-"));
        assert!(!raw.contains("data:image"));
    }

    #[test]
    fn attachments_keep_inline_images_in_nested_related_part() {
        let html = format!("<img src=\"data:image/png;base64,{PNG_1PX}\">");
        let att = OutgoingEmailAttachment {
            filename: "doc.pdf".into(),
            mime_type: "application/pdf".into(),
            data: b"%PDF".to_vec(),
        };
        let raw = build_rfc2822("a@b.fr", None, "c@d.fr", None, "Objet", "", Some(&html), None, &[att]);
        assert!(raw.contains("multipart/mixed"));
        assert!(raw.contains("Content-Type: multipart/related"));
        assert!(raw.contains("Content-ID: <crm-img1-"));
        assert!(raw.contains("Content-Disposition: attachment; filename=\"doc.pdf\""));
        let parsed = mailparse::parse_mail(raw.as_bytes()).unwrap();
        assert_eq!(parsed.subparts.len(), 2, "corps related + pièce jointe");
        assert_eq!(parsed.subparts[0].subparts.len(), 2, "HTML + image");
    }

    #[test]
    fn html_message_is_single_part_not_multipart() {
        let raw = build_rfc2822(
            "cg@example.com",
            Some("CGP"),
            "client@example.com",
            Some("Client"),
            "Re: test",
            "top",
            Some("<p>top</p><br>sig"),
            Some(&GmailThreadReply {
                thread_id: Some("thread1".into()),
                in_reply_to_message_id: Some("abc123".into()),
                ..Default::default()
            }),
            &[],
        );
        assert!(raw.contains("Content-Type: text/html; charset=UTF-8"));
        assert!(!raw.contains("multipart/alternative"));
        assert!(!raw.contains("crm_boundary"));
        assert!(raw.contains("In-Reply-To:"));
        assert!(raw.contains("<p>top</p>"));
        assert!(raw.contains("8bit\r\nIn-Reply-To: <abc123>\r\nReferences: <abc123>\r\n\r\n"));
    }

    #[test]
    fn reply_message_id_cannot_inject_headers() {
        let raw = append_reply_headers(
            "From: a@b.fr\r\nSubject: S\r\n\r\nCorps",
            Some(&GmailThreadReply {
                thread_id: None,
                in_reply_to_message_id: Some("x@y\r\nBcc: tiers@z.fr".into()),
                ..Default::default()
            }),
        );
        assert!(!raw.contains("\r\nBcc:"));
        assert!(raw.starts_with("From: a@b.fr\r\nSubject: S\r\nIn-Reply-To: <"));
        assert!(raw.ends_with("\r\n\r\nCorps"));
    }

    #[test]
    fn newsletter_list_unsubscribe_header_is_validated() {
        let raw = append_reply_headers(
            "From: a@b.fr\r\nSubject: S\r\n\r\nCorps",
            Some(&GmailThreadReply {
                list_unsubscribe_email: Some("cgp@cabinet.fr".into()),
                ..Default::default()
            }),
        );
        assert!(raw.contains(
            "\r\nList-Unsubscribe: <mailto:cgp@cabinet.fr?subject=D%C3%A9sinscription%20newsletter>\r\n\r\nCorps"
        ));
        let injected = append_reply_headers(
            "From: a@b.fr\r\n\r\nCorps",
            Some(&GmailThreadReply {
                list_unsubscribe_email: Some("x@y.fr\r\nBcc: tiers@z.fr".into()),
                ..Default::default()
            }),
        );
        assert_eq!(injected, "From: a@b.fr\r\n\r\nCorps");
    }

    #[test]
    fn multipart_includes_attachment_when_present() {
        let raw = build_rfc2822(
            "cg@example.com",
            None,
            "client@example.com",
            None,
            "Sujet",
            "Corps",
            Some("<p>Hi</p>"),
            None,
            &[OutgoingEmailAttachment {
                filename: "doc.pdf".into(),
                mime_type: "application/pdf".into(),
                data: b"%PDF-1".to_vec(),
            }],
        );
        assert!(raw.contains("multipart/mixed"));
        assert!(raw.contains("Content-Disposition: attachment"));
        assert!(raw.contains("application/pdf"));
    }

    #[test]
    fn detects_non_empty_gmail_reply_context() {
        assert!(has_gmail_reply_context(Some(&GmailThreadReply {
            thread_id: Some("thread-1".into()),
            in_reply_to_message_id: None,
            ..Default::default()
        })));
        assert!(has_gmail_reply_context(Some(&GmailThreadReply {
            thread_id: None,
            in_reply_to_message_id: Some("message-1".into()),
            ..Default::default()
        })));
    }

    #[test]
    fn ignores_empty_gmail_reply_context() {
        assert!(!has_gmail_reply_context(None));
        assert!(!has_gmail_reply_context(Some(&GmailThreadReply {
            thread_id: Some("  ".into()),
            in_reply_to_message_id: None,
            ..Default::default()
        })));
    }
}
