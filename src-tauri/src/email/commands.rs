use super::oauth_commands::send_email_unified;
use super::{EmailSender, SmtpConfig};
use base64::Engine;
use tauri::AppHandle;

#[derive(serde::Deserialize)]
pub struct SmtpConfigInput {
    pub provider: String,
    pub smtp_server: String,
    pub smtp_port: u16,
    pub username: String,
    pub password: String,
    pub from_name: String,
    pub from_email: String,
    pub use_tls: bool,
}

#[tauri::command]
pub fn get_smtp_config(app_handle: AppHandle) -> Result<Option<SmtpConfig>, String> {
    SmtpConfig::load(&app_handle)
}

#[tauri::command]
pub fn save_smtp_config(app_handle: AppHandle, config: SmtpConfigInput) -> Result<(), String> {
    // Si le mot de passe est vide, essayer de garder l'ancien
    let password_encoded = if config.password.is_empty() {
        // Charger la config existante pour récupérer l'ancien mot de passe
        match SmtpConfig::load(&app_handle) {
            Ok(Some(existing)) => {
                println!("📧 Keeping existing password");
                existing.password // Déjà encodé
            }
            _ => {
                // Pas de config existante, utiliser un mot de passe vide (erreur probable plus tard)
                println!("⚠️ No existing password found, using empty");
                String::new()
            }
        }
    } else {
        // Nouveau mot de passe fourni, l'encoder
        println!("📧 Encoding new password");
        base64::engine::general_purpose::STANDARD.encode(&config.password)
    };

    let smtp_config = SmtpConfig {
        provider: config.provider,
        smtp_server: config.smtp_server,
        smtp_port: config.smtp_port,
        username: config.username,
        password: password_encoded,
        from_name: config.from_name,
        from_email: config.from_email,
        use_tls: config.use_tls,
    };

    smtp_config.save(&app_handle)?;
    println!("✅ SMTP config saved successfully");
    Ok(())
}

#[tauri::command]
pub fn delete_smtp_config(app_handle: AppHandle) -> Result<(), String> {
    SmtpConfig::delete(&app_handle)?;
    println!("✅ SMTP config deleted successfully");
    Ok(())
}

#[tauri::command]
pub fn test_smtp_connection(app_handle: AppHandle) -> Result<String, String> {
    let config =
        SmtpConfig::load(&app_handle)?.ok_or("SMTP configuration not found".to_string())?;

    let sender = EmailSender::new(config.clone());

    // Envoyer un email de test à soi-même
    sender.send_email(
        &config.from_email,
        Some(&config.from_name),
        "Test de connexion SMTP - CRM W.Y.S",
        "Ceci est un email de test pour vérifier la configuration SMTP.\n\nSi vous recevez cet email, la configuration est correcte !",
    )?;

    Ok("Email de test envoyé avec succès".to_string())
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
