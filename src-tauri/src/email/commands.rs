use super::oauth_commands::send_email_unified;
use super::oauth_send::OutgoingEmailAttachment;
use crate::commands::DbState;
use crate::template_email_attachments::{
    resolve_attachment_for_send, MAX_MICROSOFT_ATTACHMENT_BYTES,
};
use tauri::{AppHandle, Manager, State};

#[derive(serde::Deserialize, Clone)]
pub struct SendEmailAttachmentInput {
    pub template_id: i64,
    pub stored_name: String,
}

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
    /// Pièces jointes du modèle email (mêmes fichiers pour tous les destinataires).
    #[serde(default)]
    pub attachments: Vec<SendEmailAttachmentInput>,
}

#[derive(serde::Serialize)]
pub struct SendEmailResult {
    pub gmail_message_id: Option<String>,
    pub gmail_thread_id: Option<String>,
}

#[tauri::command]
pub async fn send_email(
    app_handle: AppHandle,
    db: State<'_, DbState>,
    email_data: SendEmailInput,
) -> Result<SendEmailResult, String> {
    let attachment_plan: Vec<(i64, String, Option<String>)> = if email_data.attachments.is_empty() {
        vec![]
    } else {
        let db_guard = db.lock().unwrap();
        let database = db_guard.as_ref().ok_or("Database not initialized")?;
        email_data
            .attachments
            .iter()
            .map(|input| {
                let tpl = database
                    .get_template_email_by_id(input.template_id)
                    .map_err(|_| {
                        format!("Modèle email {} introuvable.", input.template_id)
                    })?;
                Ok((input.template_id, input.stored_name.clone(), tpl.variables))
            })
            .collect::<Result<Vec<_>, String>>()?
    };

    let app = app_handle.clone();
    tauri::async_runtime::spawn_blocking(move || {
        let app_data = app
            .path()
            .app_data_dir()
            .map_err(|e| format!("Répertoire applicatif introuvable : {e}"))?;

        let store = crate::email::oauth_store::EmailOAuthStore::load(&app)?;
        let provider = store
            .connection
            .as_ref()
            .map(|c| c.provider.clone())
            .unwrap_or_default();

        let mut resolved_attachments: Vec<OutgoingEmailAttachment> = Vec::new();
        for (template_id, stored_name, variables) in attachment_plan {
            let (filename, mime_type, data) = resolve_attachment_for_send(
                &app_data,
                template_id,
                &stored_name,
                variables.as_deref(),
            )?;
            if provider == "microsoft" && data.len() as u64 > MAX_MICROSOFT_ATTACHMENT_BYTES {
                return Err(format!(
                    "{filename} dépasse 4 Mo (limite Microsoft Graph)."
                ));
            }
            resolved_attachments.push(OutgoingEmailAttachment {
                filename,
                mime_type,
                data,
            });
        }

        let sent = send_email_unified(
            &app,
            &email_data.to_email,
            email_data.to_name.as_deref(),
            &email_data.subject,
            &email_data.body,
            email_data.body_html.as_deref(),
            email_data.thread_id.as_deref(),
            email_data.in_reply_to_message_id.as_deref(),
            &resolved_attachments,
        )?;
        Ok(SendEmailResult {
            gmail_message_id: sent.gmail_message_id,
            gmail_thread_id: sent.gmail_thread_id,
        })
    })
    .await
    .map_err(|e| format!("Envoi interrompu: {}", e))?
}
