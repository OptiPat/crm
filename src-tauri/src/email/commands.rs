use super::oauth_commands::send_email_unified;
use tauri::AppHandle;

#[derive(serde::Deserialize)]
pub struct SendEmailInput {
    pub to_email: String,
    pub to_name: Option<String>,
    pub subject: String,
    pub body: String,
    /// Corps HTML (signature avec logo) — optionnel.
    pub body_html: Option<String>,
    /// Fil Gmail existant (réponse dans le même fil).
    pub thread_id: Option<String>,
    pub in_reply_to_message_id: Option<String>,
}

#[derive(serde::Serialize)]
pub struct SendEmailResult {
    pub gmail_message_id: Option<String>,
    pub gmail_thread_id: Option<String>,
}

#[tauri::command]
pub fn send_email(app_handle: AppHandle, email_data: SendEmailInput) -> Result<SendEmailResult, String> {
    let sent = send_email_unified(
        &app_handle,
        &email_data.to_email,
        email_data.to_name.as_deref(),
        &email_data.subject,
        &email_data.body,
        email_data.body_html.as_deref(),
        email_data.thread_id.as_deref(),
        email_data.in_reply_to_message_id.as_deref(),
    )?;
    Ok(SendEmailResult {
        gmail_message_id: sent.gmail_message_id,
        gmail_thread_id: sent.gmail_thread_id,
    })
}
