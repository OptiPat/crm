use super::oauth_client::build_basic_client;
use super::oauth_store::{EmailOAuthConnection, EmailOAuthStore};
use super::response_sync::parse_gmail_send_response;
use super::signature_html::{
    build_outgoing_email_bodies, html_to_plain_signature, normalize_signature_html,
};
use crate::commands::DbState;
use crate::database::models::CgpConfig;
use base64::Engine;
use oauth2::reqwest::http_client;
use oauth2::{RefreshToken, TokenResponse};
use tauri::{AppHandle, Manager};

fn encode_mime_subject(subject: &str) -> String {
    if subject.is_ascii() {
        return subject.to_string();
    }
    let b64 = base64::engine::general_purpose::STANDARD.encode(subject.as_bytes());
    format!("=?UTF-8?B?{}?=", b64)
}

fn load_cgp_config(app: &AppHandle) -> CgpConfig {
    app.try_state::<DbState>()
        .and_then(|state| {
            state.lock().ok().and_then(|guard| {
                guard
                    .as_ref()
                    .and_then(|db| db.get_cgp_config().ok())
            })
        })
        .unwrap_or_default()
}

pub fn refresh_connection_if_needed(
    app: &AppHandle,
    conn: &mut EmailOAuthConnection,
) -> Result<(), String> {
    if !EmailOAuthStore::connection_needs_refresh(conn) {
        return Ok(());
    }
    let refresh = conn
        .refresh_token
        .clone()
        .ok_or("Session expirée. Reconnectez votre compte dans Paramètres → Email.")?;

    let store = EmailOAuthStore::load(app)?;
    let client = build_basic_client(&conn.provider, &store)?;

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
    store.connection = Some(conn.clone());
    store.save(app)?;
    Ok(())
}

fn format_addresses(
    from_email: &str,
    from_name: Option<&str>,
    to_email: &str,
    to_name: Option<&str>,
) -> (String, String) {
    let from = match from_name {
        Some(n) if !n.is_empty() => format!("{} <{}>", n, from_email),
        _ => from_email.to_string(),
    };
    let to = match to_name {
        Some(n) if !n.is_empty() => format!("{} <{}>", n, to_email),
        _ => to_email.to_string(),
    };
    (from, to)
}

fn build_rfc2822_plain(
    from: &str,
    to: &str,
    subject: &str,
    body: &str,
) -> String {
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
) -> String {
    let (from, to) = format_addresses(from_email, from_name, to_email, to_name);
    let subject_hdr = encode_mime_subject(subject);
    let core = if let Some(html) = body_html.filter(|h| !h.trim().is_empty()) {
        build_rfc2822_html(&from, &to, &subject_hdr, html)
    } else {
        build_rfc2822_plain(&from, &to, &subject_hdr, body)
    };
    append_reply_headers(&core, reply)
}

fn send_via_gmail(
    conn: &EmailOAuthConnection,
    to_email: &str,
    to_name: Option<&str>,
    subject: &str,
    body: &str,
    body_html: Option<&str>,
    reply: Option<&GmailThreadReply>,
) -> Result<Option<(String, String)>, String> {
    let raw = build_rfc2822(
        &conn.email, None, to_email, to_name, subject, body, body_html, reply,
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
    to_email: &str,
    to_name: Option<&str>,
    subject: &str,
    body: &str,
    body_html: Option<&str>,
) -> Result<(), String> {
    let display_name = to_name.unwrap_or(to_email);
    let (content_type, content) = match body_html.filter(|h| !h.trim().is_empty()) {
        Some(html) => ("HTML", html),
        None => ("Text", body),
    };
    let client = reqwest::blocking::Client::new();
    let res = client
        .post("https://graph.microsoft.com/v1.0/me/sendMail")
        .bearer_auth(&conn.access_token)
        .json(&serde_json::json!({
            "message": {
                "subject": subject,
                "body": { "contentType": content_type, "content": content },
                "toRecipients": [{
                    "emailAddress": {
                        "address": to_email,
                        "name": display_name
                    }
                }]
            },
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

pub fn send_with_oauth(
    app: &AppHandle,
    to_email: &str,
    to_name: Option<&str>,
    subject: &str,
    body: &str,
    body_html: Option<&str>,
    reply: Option<&GmailThreadReply>,
) -> Result<OAuthSendResult, String> {
    let store = EmailOAuthStore::load(app)?;
    let mut conn = store
        .connection
        .clone()
        .ok_or("Aucun compte connecté (Google/Microsoft). Paramètres → Email : connectez votre boîte.")?;

    refresh_connection_if_needed(app, &mut conn)?;

    match conn.provider.as_str() {
        "google" => {
            let ids = send_via_gmail(&conn, to_email, to_name, subject, body, body_html, reply)?;
            Ok(OAuthSendResult {
                gmail_message_id: ids.as_ref().map(|(m, _)| m.clone()),
                gmail_thread_id: ids.map(|(_, t)| t),
            })
        }
        "microsoft" => {
            send_via_microsoft(&conn, to_email, to_name, subject, body, body_html)?;
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
        .ok_or("Connectez Google dans Paramètres → Email.")?;
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
                "Accès refusé : reconnectez Google (Paramètres → Email) pour autoriser la lecture de la signature."
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
    let html = normalize_signature_html(sig_html);
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
    )?;
    let sig_note = if cgp.email_signature_html.as_deref().is_some_and(|s| !s.trim().is_empty())
        || cgp.email_signature.as_deref().is_some_and(|s| !s.trim().is_empty())
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
        );
        assert!(raw.contains("Content-Type: text/html; charset=UTF-8"));
        assert!(!raw.contains("multipart/alternative"));
        assert!(!raw.contains("crm_boundary"));
        assert!(raw.contains("In-Reply-To:"));
        assert!(raw.contains("<p>top</p>"));
    }
}
