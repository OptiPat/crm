use crate::auth::session::{require_ui_session, UiSessionState};
use super::google_calendar_probe::probe_google_calendar_access;
use super::oauth_flow::{disconnect_google_calendar_oauth, disconnect_oauth, run_oauth_connect};
use super::oauth_send::{
    fetch_gmail_signature, send_test_to_self, send_with_oauth, ImportedGmailSignature, OAuthSendResult,
};
use super::oauth_store::EmailOAuthStore;
use serde::Serialize;
use tauri::{AppHandle, State};

#[derive(Debug, Clone, Serialize)]
pub struct EmailConnectionStatus {
    pub connected: bool,
    pub provider: Option<String>,
    pub email: Option<String>,
    pub method: String,
    pub google_calendar_connected: bool,
    pub google_calendar_email: Option<String>,
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
    /// Absent du JSON = conserver la valeur enregistrée (ne pas effacer OneDrive).
    pub microsoft_client_id: Option<String>,
}

#[tauri::command]
pub fn get_email_connection_status(app_handle: AppHandle) -> Result<EmailConnectionStatus, String> {
    let oauth = EmailOAuthStore::load(&app_handle)?;
    let calendar = oauth.google_calendar_connection.as_ref();
    if let Some(c) = &oauth.connection {
        return Ok(EmailConnectionStatus {
            connected: true,
            provider: Some(c.provider.clone()),
            email: Some(c.email.clone()),
            method: "oauth".into(),
            google_calendar_connected: calendar.is_some()
                || c.provider == "google",
            google_calendar_email: if c.provider == "google" {
                Some(c.email.clone())
            } else {
                calendar.map(|cal| cal.email.clone())
            },
        });
    }
    Ok(EmailConnectionStatus {
        connected: false,
        provider: None,
        email: None,
        method: "none".into(),
        google_calendar_connected: calendar.is_some(),
        google_calendar_email: calendar.map(|c| c.email.clone()),
    })
}

#[tauri::command]
pub fn get_oauth_app_settings(
    app_handle: AppHandle,
    session: State<'_, UiSessionState>,
) -> Result<OAuthAppSettings, String> {
    require_ui_session(&session)?;
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
pub fn save_microsoft_oauth_client_id(
    app_handle: AppHandle,
    session: State<'_, UiSessionState>,
    client_id: String,
) -> Result<(), String> {
    require_ui_session(&session)?;
    let trimmed = client_id.trim();
    if trimmed.is_empty() {
        return Err("Client ID Microsoft vide.".into());
    }
    let mut store = EmailOAuthStore::load(&app_handle)?;
    store.microsoft_client_id = Some(trimmed.to_string());
    store.save(&app_handle)
}

#[tauri::command]
pub fn save_oauth_app_settings(
    app_handle: AppHandle,
    session: State<'_, UiSessionState>,
    settings: OAuthAppSettingsInput,
) -> Result<(), String> {
    require_ui_session(&session)?;
    let mut store = EmailOAuthStore::load(&app_handle)?;
    if let Some(google_id) = settings.google_client_id {
        store.google_client_id = if google_id.trim().is_empty() {
            None
        } else {
            Some(google_id.trim().to_string())
        };
    }
    if let Some(ms_id) = settings.microsoft_client_id {
        store.microsoft_client_id = if ms_id.trim().is_empty() {
            None
        } else {
            Some(ms_id.trim().to_string())
        };
    }
    if let Some(secret) = settings.google_client_secret {
        let trimmed = secret.trim();
        if !trimmed.is_empty() {
            store.google_client_secret = Some(trimmed.to_string());
        }
    }
    store.save(&app_handle)
}

#[tauri::command]
pub async fn connect_email_oauth(
    app_handle: AppHandle,
    session: State<'_, UiSessionState>,
    provider: String,
    force_consent: Option<bool>,
) -> Result<EmailConnectionStatus, String> {
    require_ui_session(&session)?;
    let force = force_consent.unwrap_or(false);
    tauri::async_runtime::spawn_blocking(move || {
        run_oauth_connect(&app_handle, &provider, force)?;
        get_email_connection_status(app_handle)
    })
    .await
    .map_err(|e| format!("OAuth interrompu: {}", e))?
}

#[tauri::command]
pub fn disconnect_email_oauth(
    app_handle: AppHandle,
    session: State<'_, UiSessionState>,
) -> Result<(), String> {
    require_ui_session(&session)?;
    disconnect_oauth(&app_handle)
}

#[tauri::command]
pub async fn connect_google_calendar_oauth(
    app_handle: AppHandle,
    session: State<'_, UiSessionState>,
    force_consent: Option<bool>,
) -> Result<EmailConnectionStatus, String> {
    require_ui_session(&session)?;
    let force = force_consent.unwrap_or(false);
    tauri::async_runtime::spawn_blocking(move || {
        run_oauth_connect(&app_handle, "google_calendar", force)?;
        get_email_connection_status(app_handle)
    })
    .await
    .map_err(|e| format!("OAuth Agenda interrompu: {}", e))?
}

#[tauri::command]
pub fn disconnect_google_calendar_oauth_cmd(
    app_handle: AppHandle,
    session: State<'_, UiSessionState>,
) -> Result<(), String> {
    require_ui_session(&session)?;
    disconnect_google_calendar_oauth(&app_handle)?;
    Ok(())
}

#[tauri::command]
pub fn fetch_gmail_signature_for_cgp(
    app_handle: AppHandle,
    session: State<'_, UiSessionState>,
) -> Result<ImportedGmailSignature, String> {
    require_ui_session(&session)?;
    fetch_gmail_signature(&app_handle)
}

#[tauri::command]
pub fn test_email_connection(
    app_handle: AppHandle,
    session: State<'_, UiSessionState>,
) -> Result<String, String> {
    require_ui_session(&session)?;
    let oauth = EmailOAuthStore::load(&app_handle)?;
    let Some(ref conn) = oauth.connection else {
        return Err(
            "Aucune connexion email. Paramètres → Emails & envois → Connexion : connectez Google ou Microsoft.".into(),
        );
    };
    let mail_msg = send_test_to_self(&app_handle)?;
    if conn.provider == "google" {
        probe_google_calendar_access(&app_handle)?;
        return Ok(format!("{mail_msg} Accès Google Agenda OK."));
    }
    if oauth.google_calendar_connection.is_some() {
        probe_google_calendar_access(&app_handle)?;
        return Ok(format!("{mail_msg} Accès Google Agenda OK."));
    }
    Ok(format!(
        "{mail_msg} Connectez Google Agenda pour la détection RDV (Paramètres → Emails & envois → Connexion)."
    ))
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
    attachments: &[super::oauth_send::OutgoingEmailAttachment],
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
            attachments,
        );
    }
    Err("Aucune connexion email. Paramètres → Emails & envois → Connexion : connectez Google ou Microsoft.".into())
}
