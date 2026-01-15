use super::SmtpConfig;
use lettre::message::header::ContentType;
use lettre::transport::smtp::authentication::Credentials;
use lettre::{Message, SmtpTransport, Transport};

pub struct EmailSender {
    config: SmtpConfig,
}

impl EmailSender {
    pub fn new(config: SmtpConfig) -> Self {
        Self { config }
    }

    pub fn send_email(
        &self,
        to_email: &str,
        to_name: Option<&str>,
        subject: &str,
        body: &str,
    ) -> Result<(), String> {
        // Construire le message
        let email_builder = Message::builder()
            .from(
                format!("{} <{}>", self.config.from_name, self.config.from_email)
                    .parse()
                    .map_err(|e| format!("Invalid from address: {}", e))?,
            )
            .to(if let Some(name) = to_name {
                format!("{} <{}>", name, to_email)
                    .parse()
                    .map_err(|e| format!("Invalid to address: {}", e))?
            } else {
                to_email
                    .parse()
                    .map_err(|e| format!("Invalid to address: {}", e))?
            })
            .subject(subject);

        let email = email_builder
            .header(ContentType::TEXT_PLAIN)
            .body(body.to_string())
            .map_err(|e| format!("Failed to build email: {}", e))?;

        // Configurer le transport SMTP
        let decoded_password = self
            .config
            .decode_password()
            .map_err(|e| format!("Failed to decode password: {}", e))?;

        let creds = Credentials::new(self.config.username.clone(), decoded_password);

        let transport = if self.config.use_tls {
            SmtpTransport::starttls_relay(&self.config.smtp_server)
                .map_err(|e| format!("Failed to create SMTP transport: {}", e))?
                .credentials(creds)
                .port(self.config.smtp_port)
                .build()
        } else {
            SmtpTransport::builder_dangerous(&self.config.smtp_server)
                .credentials(creds)
                .port(self.config.smtp_port)
                .build()
        };

        // Envoyer l'email
        transport
            .send(&email)
            .map_err(|e| format!("Failed to send email: {}", e))?;

        println!("✅ Email sent successfully to {}", to_email);

        Ok(())
    }
}
