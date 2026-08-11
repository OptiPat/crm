//! Envoi des codes de connexion par le portail lui-même.
//!
//! Le CRM est une application de bureau, éteinte la nuit : il ne peut pas être
//! dans la boucle. Le portail envoie donc l'email au moment où le client
//! demande son code, avec ses propres identifiants Brevo.

use std::time::Duration;

const BREVO_ENDPOINT: &str = "https://api.brevo.com/v3/smtp/email";

#[derive(Clone)]
pub struct Mailer {
    api_key: String,
    from_email: String,
    from_name: String,
    client: reqwest::Client,
}

#[derive(Debug, Clone)]
pub struct MailerConfig {
    pub api_key: Option<String>,
    pub from_email: Option<String>,
    pub from_name: Option<String>,
}

impl MailerConfig {
    pub fn from_env() -> Self {
        fn var(name: &str) -> Option<String> {
            std::env::var(name)
                .ok()
                .map(|v| v.trim().to_string())
                .filter(|v| !v.is_empty())
        }
        Self {
            api_key: var("ESPACE_BREVO_API_KEY"),
            from_email: var("ESPACE_MAIL_FROM"),
            from_name: var("ESPACE_MAIL_FROM_NAME"),
        }
    }
}

impl Mailer {
    /// `None` si la configuration est incomplète : le portail démarre quand même
    /// (utile en développement), mais refusera d'envoyer en production.
    pub fn from_config(config: MailerConfig) -> Option<Self> {
        let api_key = config.api_key?;
        let from_email = config.from_email?;
        // Une clé collée dans une saisie masquée Windows peut contenir le
        // caractère de contrôle du Ctrl+V : l'en-tête HTTP serait rejeté par
        // `reqwest` avec un « builder error » indéchiffrable.
        if !is_valid_header_value(&api_key) {
            tracing::error!(
                "ESPACE_BREVO_API_KEY invalide (caractères de contrôle) — \
                 recopiez la clé depuis Brevo."
            );
            return None;
        }
        let client = reqwest::Client::builder()
            .timeout(Duration::from_secs(15))
            .build()
            .ok()?;
        Some(Self {
            api_key,
            from_email,
            from_name: config.from_name.unwrap_or_else(|| "Votre conseiller".into()),
            client,
        })
    }

    pub async fn send_login_code(&self, to: &str, code: &str) -> Result<(), String> {
        self.send_email(
            to,
            "Votre code de connexion",
            &login_code_text(&self.from_name, code),
            &login_code_html(&self.from_name, code),
        )
        .await
    }

    pub async fn send_document_request(
        &self,
        to: &str,
        prenom: &str,
        libelle: &str,
    ) -> Result<(), String> {
        let greeting = if prenom.trim().is_empty() {
            "Bonjour".to_string()
        } else {
            format!("Bonjour {}", prenom.trim())
        };
        let text = format!(
            "{greeting},\n\n\
             Votre conseiller vous demande de déposer le document suivant \
             sur votre espace client : {libelle}.\n\n\
             Connectez-vous à votre espace pour effectuer le dépôt \
             (PDF, JPEG ou PNG — 10 Mo maximum).\n\n\
             {cabinet}",
            cabinet = self.from_name
        );
        let html = format!(
            "<p>{greeting},</p>\
             <p>Votre conseiller vous demande de déposer le document suivant \
             sur votre espace client : <strong>{libelle}</strong>.</p>\
             <p>Connectez-vous à votre espace pour effectuer le dépôt \
             (PDF, JPEG ou PNG — 10 Mo maximum).</p>\
             <p>{cabinet}</p>",
            cabinet = self.from_name
        );
        self.send_email(to, "Document à déposer sur votre espace", &text, &html)
            .await
    }

    pub async fn send_depot_received(
        &self,
        advisor_email: &str,
        client_label: &str,
        libelle: &str,
    ) -> Result<(), String> {
        let text = format!(
            "Bonjour,\n\n\
             {client_label} a déposé le document demandé : {libelle}.\n\
             Importez-le depuis le CRM (panneau Espace client).\n"
        );
        let html = format!(
            "<p>Bonjour,</p>\
             <p><strong>{client_label}</strong> a déposé le document demandé : \
             <strong>{libelle}</strong>.</p>\
             <p>Importez-le depuis le CRM (panneau Espace client).</p>"
        );
        self.send_email(
            advisor_email,
            "Dépôt reçu sur l'espace client",
            &text,
            &html,
        )
        .await
    }

    pub async fn send_new_device_alert(
        &self,
        to: &str,
        ip: Option<&str>,
        user_agent: Option<&str>,
    ) -> Result<(), String> {
        let when = chrono::Local::now().format("%d/%m/%Y à %H:%M").to_string();
        let ip_line = ip
            .filter(|value| !value.is_empty())
            .map(|value| format!("Adresse réseau : {value}\n"))
            .unwrap_or_default();
        let ua_line = user_agent
            .filter(|value| !value.is_empty())
            .map(|value| format!("Navigateur : {value}\n"))
            .unwrap_or_default();
        let text = format!(
            "Bonjour,\n\n\
             Une connexion à votre espace investisseur vient d'être effectuée \
             depuis un appareil ou un navigateur que nous n'avions pas encore vu.\n\n\
             Date : {when}\n\
             {ip_line}\
             {ua_line}\
             Si vous êtes à l'origine de cette connexion, vous pouvez ignorer ce message.\n\
             Sinon, contactez immédiatement votre conseiller pour faire révoquer l'accès.\n\n\
             {cabinet}",
            cabinet = self.from_name
        );
        let html = format!(
            "<p>Bonjour,</p>\
             <p>Une connexion à votre espace investisseur vient d'être effectuée \
             depuis un appareil ou un navigateur que nous n'avions pas encore vu.</p>\
             <p><strong>Date :</strong> {when}<br/>\
             {ip_html}\
             {ua_html}\
             </p>\
             <p>Si vous êtes à l'origine de cette connexion, vous pouvez ignorer ce message.</p>\
             <p>Sinon, contactez immédiatement votre conseiller pour faire révoquer l'accès.</p>\
             <p>{cabinet}</p>",
            ip_html = ip
                .filter(|value| !value.is_empty())
                .map(|value| format!("<strong>Adresse réseau :</strong> {value}<br/>"))
                .unwrap_or_default(),
            ua_html = user_agent
                .filter(|value| !value.is_empty())
                .map(|value| format!("<strong>Navigateur :</strong> {value}<br/>"))
                .unwrap_or_default(),
            cabinet = self.from_name
        );
        self.send_email(to, "Nouvelle connexion à votre espace", &text, &html)
            .await
    }

    async fn send_email(
        &self,
        to: &str,
        subject: &str,
        text: &str,
        html: &str,
    ) -> Result<(), String> {
        let body = serde_json::json!({
            "sender": { "name": self.from_name, "email": self.from_email },
            "to": [{ "email": to }],
            "subject": subject,
            "textContent": text,
            "htmlContent": html,
        });

        let response = self
            .client
            .post(BREVO_ENDPOINT)
            .header("api-key", &self.api_key)
            .header("accept", "application/json")
            .json(&body)
            .send()
            .await
            .map_err(|e| format!("Envoi Brevo impossible : {}", error_chain(&e)))?;

        let status = response.status();
        if status.is_success() {
            return Ok(());
        }
        let detail = response.text().await.unwrap_or_default();
        Err(format!("Brevo a refusé l'envoi ({status}) : {detail}"))
    }
}

fn is_valid_header_value(value: &str) -> bool {
    !value.is_empty() && value.chars().all(|c| (' '..='~').contains(&c))
}

/// `reqwest` résume ses échecs en « builder error » ou « error sending request » :
/// la cause réelle n'est que dans la chaîne de sources.
fn error_chain(error: &dyn std::error::Error) -> String {
    let mut parts = vec![error.to_string()];
    let mut current = error.source();
    while let Some(cause) = current {
        parts.push(cause.to_string());
        current = cause.source();
    }
    parts.join(" -> ")
}

pub fn login_code_text(cabinet: &str, code: &str) -> String {
    format!(
        "Votre code de connexion est : {code}\n\n\
         Il est valable 15 minutes et ne fonctionne qu'une seule fois.\n\
         Si vous n'êtes pas à l'origine de cette demande, ignorez cet email.\n\n\
         {cabinet}"
    )
}

pub fn login_code_html(cabinet: &str, code: &str) -> String {
    format!(
        "<p>Votre code de connexion est :</p>\
         <p style=\"font-size:28px;font-weight:700;letter-spacing:6px\">{code}</p>\
         <p>Il est valable 15 minutes et ne fonctionne qu'une seule fois.</p>\
         <p>Si vous n'êtes pas à l'origine de cette demande, ignorez cet email.</p>\
         <p>{cabinet}</p>"
    )
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn mailer_requires_key_and_sender() {
        let incomplete = MailerConfig {
            api_key: Some("k".into()),
            from_email: None,
            from_name: None,
        };
        assert!(Mailer::from_config(incomplete).is_none());

        let complete = MailerConfig {
            api_key: Some("k".into()),
            from_email: Some("cabinet@example.com".into()),
            from_name: None,
        };
        assert!(Mailer::from_config(complete).is_some());
    }

    #[test]
    fn a_key_captured_from_ctrl_v_is_rejected() {
        // 0x16 = SYN, ce que la console Windows capte quand on fait Ctrl+V
        // dans une saisie masquée.
        assert!(!is_valid_header_value("\u{16}"));
        assert!(!is_valid_header_value(""));
        assert!(is_valid_header_value("xkeysib-abc123"));

        let ctrl_v = MailerConfig {
            api_key: Some("\u{16}".into()),
            from_email: Some("cabinet@example.com".into()),
            from_name: None,
        };
        assert!(Mailer::from_config(ctrl_v).is_none());
    }

    #[test]
    fn message_carries_the_code_and_never_a_link() {
        let text = login_code_text("Cabinet", "123456");
        assert!(text.contains("123456"));
        // Pas de lien : les antivirus de messagerie pré-ouvrent les URL et
        // consommeraient un jeton à usage unique.
        assert!(!text.contains("http"));
        assert!(!login_code_html("Cabinet", "123456").contains("href"));
    }
}
