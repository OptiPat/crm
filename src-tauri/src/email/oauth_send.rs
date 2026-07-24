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

fn encode_mime_utf8_word(value: &str) -> String {
    if value.is_ascii() {
        return value.to_string();
    }
    let b64 = base64::engine::general_purpose::STANDARD.encode(value.as_bytes());
    format!("=?UTF-8?B?{}?=", b64)
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
    let from = match from_name {
        Some(n) if !n.is_empty() => format!("{} <{}>", encode_mime_utf8_word(n), from_email),
        _ => from_email.to_string(),
    };
    let to = match to_name {
        Some(n) if !n.is_empty() => format!("{} <{}>", encode_mime_utf8_word(n), to_email),
        _ => to_email.to_string(),
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
    attachments: &[OutgoingEmailAttachment],
) -> String {
    let boundary = format!("crm_boundary_{}", chrono::Utc::now().timestamp_millis());
    let mut message = format!(
        "From: {}\r\nTo: {}\r\nSubject: {}\r\nMIME-Version: 1.0\r\nContent-Type: multipart/mixed; boundary=\"{}\"\r\n\r\n",
        from, to, subject, boundary
    );

    let body_part = if let Some(html) = body_html.filter(|h| !h.trim().is_empty()) {
        format!(
            "--{boundary}\r\nContent-Type: text/html; charset=UTF-8\r\nContent-Transfer-Encoding: 8bit\r\n\r\n{html}\r\n"
        )
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
        let b64 = base64::engine::general_purpose::STANDARD.encode(&att.data);
        let disp = encode_content_disposition_filename(&filename);
        message.push_str(&format!(
            "--{boundary}\r\nContent-Type: {}; name=\"{}\"\r\nContent-Disposition: attachment; {disp}\r\nContent-Transfer-Encoding: base64\r\n\r\n",
            mime_type,
            filename.replace('"', "_"),
        ));
        for chunk in b64.as_bytes().chunks(76) {
            message.push_str(std::str::from_utf8(chunk).unwrap_or(""));
            message.push_str("\r\n");
        }
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
}

fn append_reply_headers(base: &str, reply: Option<&GmailThreadReply>) -> String {
    let Some(reply) = reply else {
        return base.to_string();
    };
    let mut extra = String::new();
    if let Some(ref mid) = reply.in_reply_to_message_id {
        if !mid.trim().is_empty() {
            let token = if mid.contains('@') {
                mid.clone()
            } else {
                format!("<{}>", mid.trim())
            };
            extra.push_str(&format!("In-Reply-To: {}\r\n", token));
            extra.push_str(&format!("References: {}\r\n", token));
        }
    }
    if extra.is_empty() {
        return base.to_string();
    }
    if let Some(pos) = base.find("\r\n\r\n") {
        format!("{}{}{}", &base[..pos], extra, &base[pos..])
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
    let core = if attachments.is_empty() {
        if let Some(html) = body_html.filter(|h| !h.trim().is_empty()) {
            build_rfc2822_html(&from, &to, &subject_hdr, html)
        } else {
            build_rfc2822_plain(&from, &to, &subject_hdr, body)
        }
    } else {
        build_rfc2822_with_attachments(&from, &to, &subject_hdr, body, body_html, attachments)
    };
    append_reply_headers(&core, reply)
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
    let (content_type, content) = match body_html.filter(|h| !h.trim().is_empty()) {
        Some(html) => ("HTML", html),
        None => ("Text", body),
    };
    let graph_attachments: Vec<serde_json::Value> = attachments
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
    const MESSAGE: &str = "Ceci est un email de test envoyé via votre compte connecté (Gmail ou Microsoft).\n\nSi vous le recevez, la connexion fonctionne.";
    let (body, body_html) = build_outgoing_email_bodies(
        MESSAGE,
        cgp.email_signature.as_deref(),
        cgp.email_signature_html.as_deref(),
    );
    send_with_oauth(
        app,
        &conn.email,
        None,
        "Test CRM W.Y.S — connexion OAuth",
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
            }),
            &[],
        );
        assert!(raw.contains("Content-Type: text/html; charset=UTF-8"));
        assert!(!raw.contains("multipart/alternative"));
        assert!(!raw.contains("crm_boundary"));
        assert!(raw.contains("In-Reply-To:"));
        assert!(raw.contains("<p>top</p>"));
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
}
