use super::oauth_flow::{disconnect_oauth, run_oauth_connect};
use super::oauth_send::{
    fetch_gmail_signature, send_test_to_self, send_with_oauth, ImportedGmailSignature, OAuthSendResult,
};
use super::oauth_store::EmailOAuthStore;
use super::{EmailSender, SmtpConfig};
use serde::Serialize;
use tauri::AppHandle;

#[derive(Debug, Clone, Serialize)]
pub struct EmailConnectionStatus {
    pub connected: bool,
    pub provider: Option<String>,
    pub email: Option<String>,
    pub method: String,
}

#[derive(Debug, Clone, Serialize)]
pub struct OAuthAppSettings {
    pub google_client_id: Option<String>,
    pub google_client_secret_configured: bool,
    pub microsoft_client_id: Option<String>,
}

#[derive(serde::Deserialize)]
pub struct OAuthAppSettingsInput {
    pub google_client_id: Option<String>,
    /// `None` = ne pas modifier le secret enregistré ; chaîne non vide = enregistrer.
    pub google_client_secret: Option<String>,
    pub microsoft_client_id: Option<String>,
}

#[tauri::command]
pub fn get_email_connection_status(app_handle: AppHandle) -> Result<EmailConnectionStatus, String> {
    let oauth = EmailOAuthStore::load(&app_handle)?;
    if let Some(c) = &oauth.connection {
        return Ok(EmailConnectionStatus {
            connected: true,
            provider: Some(c.provider.clone()),
            email: Some(c.email.clone()),
            method: "oauth".into(),
        });
    }
    if SmtpConfig::load(&app_handle)?.is_some() {
        return Ok(EmailConnectionStatus {
            connected: true,
            provider: None,
            email: None,
            method: "smtp".into(),
        });
    }
    Ok(EmailConnectionStatus {
        connected: false,
        provider: None,
        email: None,
        method: "none".into(),
    })
}

#[tauri::command]
pub fn get_oauth_app_settings(app_handle: AppHandle) -> Result<OAuthAppSettings, String> {
    let store = EmailOAuthStore::load(&app_handle)?;
    Ok(OAuthAppSettings {
        google_client_id: store.google_client_id,
        google_client_secret_configured: store
            .google_client_secret
            .as_ref()
            .is_some_and(|s| !s.trim().is_empty()),
        microsoft_client_id: store.microsoft_client_id,
    })
}

#[tauri::command]
pub fn save_oauth_app_settings(
    app_handle: AppHandle,
    settings: OAuthAppSettingsInput,
) -> Result<(), String> {
    let mut store = EmailOAuthStore::load(&app_handle)?;
    store.google_client_id = settings
        .google_client_id
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty());
    store.microsoft_client_id = settings
        .microsoft_client_id
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty());
    if let Some(secret) = settings.google_client_secret {
        let trimmed = secret.trim();
        if !trimmed.is_empty() {
            store.google_client_secret = Some(trimmed.to_string());
        }
    }
    store.save(&app_handle)
}

#[tauri::command]
pub fn connect_email_oauth(
    app_handle: AppHandle,
    provider: String,
) -> Result<EmailConnectionStatus, String> {
    let conn = run_oauth_connect(&app_handle, &provider)?;
    Ok(EmailConnectionStatus {
        connected: true,
        provider: Some(conn.provider),
        email: Some(conn.email),
        method: "oauth".into(),
    })
}

#[tauri::command]
pub fn disconnect_email_oauth(app_handle: AppHandle) -> Result<(), String> {
    disconnect_oauth(&app_handle)
}

#[tauri::command]
pub fn fetch_gmail_signature_for_cgp(
    app_handle: AppHandle,
) -> Result<ImportedGmailSignature, String> {
    fetch_gmail_signature(&app_handle)
}

#[tauri::command]
pub fn test_email_connection(app_handle: AppHandle) -> Result<String, String> {
    let oauth = EmailOAuthStore::load(&app_handle)?;
    if oauth.connection.is_some() {
        return send_test_to_self(&app_handle);
    }
    let config =
        SmtpConfig::load(&app_handle)?.ok_or("Aucune connexion email (OAuth ou SMTP).".to_string())?;
    let sender = EmailSender::new(config.clone());
    sender.send_email(
        &config.from_email,
        Some(&config.from_name),
        "Test de connexion SMTP - CRM W.Y.S",
        "Ceci est un email de test SMTP.\n\nSi vous recevez cet email, la configuration est correcte.",
    )?;
    Ok("Email de test SMTP envoyé".into())
}

pub fn send_email_unified(
    app_handle: &AppHandle,
    to_email: &str,
    to_name: Option<&str>,
    subject: &str,
    body: &str,
    body_html: Option<&str>,
    thread_id: Option<&str>,
    in_reply_to_message_id: Option<&str>,
) -> Result<OAuthSendResult, String> {
    let oauth = EmailOAuthStore::load(app_handle)?;
    if oauth.connection.is_some() {
        let reply = super::oauth_send::GmailThreadReply {
            thread_id: thread_id.map(|s| s.to_string()),
            in_reply_to_message_id: in_reply_to_message_id.map(|s| s.to_string()),
        };
        let reply_ref = if reply.thread_id.is_some() || reply.in_reply_to_message_id.is_some() {
            Some(&reply)
        } else {
            None
        };
        return send_with_oauth(
            app_handle,
            to_email,
            to_name,
            subject,
            body,
            body_html,
            reply_ref,
        );
    }
    let config = SmtpConfig::load(app_handle)?.ok_or(
        "Aucune connexion email. Paramètres → Email : connectez Google/Microsoft ou SMTP.".to_string(),
    )?;
    let _ = body_html;
    EmailSender::new(config).send_email(to_email, to_name, subject, body)?;
    Ok(OAuthSendResult::default())
}
