use super::oauth_store::{EmailOAuthConnection, EmailOAuthStore};
use base64::Engine;
use oauth2::basic::BasicClient;
use oauth2::reqwest::http_client;
use oauth2::{AuthUrl, ClientId, RefreshToken, TokenResponse, TokenUrl};
use tauri::AppHandle;

fn client_id_for(store: &EmailOAuthStore, provider: &str) -> Result<String, String> {
    match provider {
        "google" => store
            .google_client_id
            .clone()
            .filter(|s| !s.trim().is_empty())
            .ok_or_else(|| "Identifiant client Google manquant".into()),
        "microsoft" => store
            .microsoft_client_id
            .clone()
            .filter(|s| !s.trim().is_empty())
            .ok_or_else(|| "Identifiant client Microsoft manquant".into()),
        _ => Err("Fournisseur inconnu".into()),
    }
}

fn oauth_endpoints(provider: &str) -> Result<(&'static str, &'static str), String> {
    match provider {
        "google" => Ok((
            "https://accounts.google.com/o/oauth2/v2/auth",
            "https://oauth2.googleapis.com/token",
        )),
        "microsoft" => Ok((
            "https://login.microsoftonline.com/common/oauth2/v2.0/authorize",
            "https://login.microsoftonline.com/common/oauth2/v2.0/token",
        )),
        _ => Err("Fournisseur inconnu".into()),
    }
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
    let client_id = client_id_for(&store, &conn.provider)?;
    let (auth_url, token_url) = oauth_endpoints(&conn.provider)?;
    let client = BasicClient::new(
        ClientId::new(client_id),
        None,
        AuthUrl::new(auth_url.to_string()).map_err(|e| e.to_string())?,
        Some(TokenUrl::new(token_url.to_string()).map_err(|e| e.to_string())?),
    );

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

fn build_rfc2822(
    from_email: &str,
    from_name: Option<&str>,
    to_email: &str,
    to_name: Option<&str>,
    subject: &str,
    body: &str,
) -> String {
    let from = match from_name {
        Some(n) if !n.is_empty() => format!("{} <{}>", n, from_email),
        _ => from_email.to_string(),
    };
    let to = match to_name {
        Some(n) if !n.is_empty() => format!("{} <{}>", n, to_email),
        _ => to_email.to_string(),
    };
    format!(
        "From: {}\r\nTo: {}\r\nSubject: {}\r\nMIME-Version: 1.0\r\nContent-Type: text/plain; charset=UTF-8\r\nContent-Transfer-Encoding: 8bit\r\n\r\n{}",
        from, to, subject, body
    )
}

fn send_via_gmail(conn: &EmailOAuthConnection, to_email: &str, to_name: Option<&str>, subject: &str, body: &str) -> Result<(), String> {
    let raw = build_rfc2822(&conn.email, None, to_email, to_name, subject, body);
    let encoded = base64::engine::general_purpose::URL_SAFE_NO_PAD.encode(raw.as_bytes());
    let client = reqwest::blocking::Client::new();
    let res = client
        .post("https://gmail.googleapis.com/gmail/v1/users/me/messages/send")
        .bearer_auth(&conn.access_token)
        .json(&serde_json::json!({ "raw": encoded }))
        .send()
        .map_err(|e| e.to_string())?;
    if !res.status().is_success() {
        let err = res.text().unwrap_or_default();
        return Err(format!("Gmail API: {}", err));
    }
    Ok(())
}

fn send_via_microsoft(
    conn: &EmailOAuthConnection,
    to_email: &str,
    to_name: Option<&str>,
    subject: &str,
    body: &str,
) -> Result<(), String> {
    let display_name = to_name.unwrap_or(to_email);
    let client = reqwest::blocking::Client::new();
    let res = client
        .post("https://graph.microsoft.com/v1.0/me/sendMail")
        .bearer_auth(&conn.access_token)
        .json(&serde_json::json!({
            "message": {
                "subject": subject,
                "body": { "contentType": "Text", "content": body },
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

pub fn send_with_oauth(
    app: &AppHandle,
    to_email: &str,
    to_name: Option<&str>,
    subject: &str,
    body: &str,
) -> Result<(), String> {
    let store = EmailOAuthStore::load(app)?;
    let mut conn = store
        .connection
        .clone()
        .ok_or("Aucun compte connecté (Google/Microsoft). Utilisez Paramètres → Email ou configurez le SMTP.")?;

    refresh_connection_if_needed(app, &mut conn)?;

    match conn.provider.as_str() {
        "google" => send_via_gmail(&conn, to_email, to_name, subject, body),
        "microsoft" => send_via_microsoft(&conn, to_email, to_name, subject, body),
        _ => Err("Fournisseur OAuth non supporté".into()),
    }
}

pub fn send_test_to_self(app: &AppHandle) -> Result<String, String> {
    let store = EmailOAuthStore::load(app)?;
    let conn = store
        .connection
        .as_ref()
        .ok_or("Aucun compte OAuth connecté")?;
    send_with_oauth(
        app,
        &conn.email,
        None,
        "Test CRM W.Y.S — connexion OAuth",
        "Ceci est un email de test envoyé via votre compte connecté (Gmail ou Microsoft).\n\nSi vous le recevez, la connexion fonctionne.",
    )?;
    Ok(format!("Email de test envoyé à {}", conn.email))
}
