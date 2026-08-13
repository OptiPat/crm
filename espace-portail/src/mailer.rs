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

    fn cabinet_html(&self) -> String {
        escape_html(&self.from_name)
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
            greeting = escape_html(&greeting),
            libelle = escape_html(libelle),
            cabinet = self.cabinet_html()
        );
        self.send_email(to, "Document à déposer sur votre espace", &text, &html)
            .await
    }

    /// Événement ajouté par le conseiller à l'espace du client.
    ///
    /// Le mot « échéance » reste au CRM : côté client, une échéance évoque une
    /// obligation ou une dette, là où il s'agit d'un rendez-vous à préparer.
    pub async fn send_evenement(
        &self,
        to: &str,
        prenom: &str,
        titre: &str,
        message: Option<&str>,
        date_label: &str,
    ) -> Result<(), String> {
        let greeting = if prenom.trim().is_empty() {
            "Bonjour".to_string()
        } else {
            format!("Bonjour {}", prenom.trim())
        };
        let precision_text = message
            .map(str::trim)
            .filter(|m| !m.is_empty())
            .map(|m| format!("{m}\n\n"))
            .unwrap_or_default();
        let precision_html = message
            .map(str::trim)
            .filter(|m| !m.is_empty())
            .map(|m| format!("<p>{}</p>", escape_html(m)))
            .unwrap_or_default();

        let text = format!(
            "{greeting},\n\n\
             Votre conseiller a ajouté un événement à votre espace client :\n\
             {titre} — {date_label}.\n\n\
             {precision_text}\
             Connectez-vous à votre espace pour le consulter.\n\n\
             {cabinet}",
            cabinet = self.from_name
        );
        let html = format!(
            "<p>{greeting},</p>\
             <p>Votre conseiller a ajouté un événement à votre espace client :<br/>\
             <strong>{titre}</strong> — {date_label}.</p>\
             {precision_html}\
             <p>Connectez-vous à votre espace pour le consulter.</p>\
             <p>{cabinet}</p>",
            greeting = escape_html(&greeting),
            titre = escape_html(titre),
            date_label = escape_html(date_label),
            cabinet = self.cabinet_html()
        );
        self.send_email(to, "Nouvel événement sur votre espace", &text, &html)
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
             <p>Importez-le depuis le CRM (panneau Espace client).</p>",
            client_label = escape_html(client_label),
            libelle = escape_html(libelle)
        );
        self.send_email(
            advisor_email,
            "Dépôt reçu sur l'espace client",
            &text,
            &html,
        )
        .await
    }

    pub async fn send_scpi_declaration_received(
        &self,
        advisor_email: &str,
        client_label: &str,
        nom_produit: &str,
        date_label: &str,
        valorisation_euros: f64,
        revenu_euros: Option<f64>,
    ) -> Result<(), String> {
        self.send_client_declaration_received(
            advisor_email,
            client_label,
            nom_produit,
            "une SCPI",
            date_label,
            valorisation_euros,
            revenu_euros,
            None,
            None,
            None,
            false,
        )
        .await
    }

    /// Notification générique : SCPI, encours à côté, ou immobilier.
    ///
    /// `kind` est la nature du placement telle qu'elle se lit dans la phrase
    /// (« une SCPI », « un bien immobilier »). Elle est décidée par l'appelant,
    /// qui la tient de la photo : recopier ici une liste de types reviendrait à
    /// en oublier.
    #[allow(clippy::too_many_arguments)]
    pub async fn send_client_declaration_received(
        &self,
        advisor_email: &str,
        client_label: &str,
        nom_produit: &str,
        kind: &str,
        date_label: &str,
        valorisation_euros: f64,
        revenu_euros: Option<f64>,
        loyer_euros: Option<f64>,
        mensualite_euros: Option<f64>,
        date_fin_pret_label: Option<String>,
        clear_date_fin_pret: bool,
    ) -> Result<(), String> {
        let mut extras_text = String::new();
        let mut extras_html = String::new();
        if let Some(v) = revenu_euros.filter(|v| *v > 0.0) {
            extras_text.push_str(&format!("\nRevenu perçu : {v:.2} €"));
            extras_html.push_str(&format!("<br/><strong>Revenu perçu :</strong> {v:.2} €"));
        }
        if let Some(v) = loyer_euros {
            extras_text.push_str(&format!("\nLoyer mensuel : {v:.2} €"));
            extras_html.push_str(&format!("<br/><strong>Loyer mensuel :</strong> {v:.2} €"));
        }
        if let Some(v) = mensualite_euros {
            extras_text.push_str(&format!("\nMensualité de crédit : {v:.2} €"));
            extras_html
                .push_str(&format!("<br/><strong>Mensualité de crédit :</strong> {v:.2} €"));
        }
        if clear_date_fin_pret {
            extras_text.push_str("\nFin de prêt : (effacée)");
            extras_html.push_str("<br/><strong>Fin de prêt :</strong> (effacée)");
        } else if let Some(label) = date_fin_pret_label {
            extras_text.push_str(&format!("\nFin de prêt : {label}"));
            extras_html.push_str(&format!(
                "<br/><strong>Fin de prêt :</strong> {}",
                escape_html(&label)
            ));
        }

        let text = format!(
            "Bonjour,\n\n\
             {client_label} a mis à jour {kind} depuis l'espace client.\n\
             Produit : {nom_produit}\n\
             Date : {date_label}\n\
             Valorisation : {valorisation_euros:.2} €{extras_text}\n\n\
             Importez la déclaration depuis le CRM (panneau Espace client) pour mettre à jour le dossier.\n"
        );
        let html = format!(
            "<p>Bonjour,</p>\
             <p><strong>{client_label}</strong> a mis à jour {kind} depuis l'espace client.</p>\
             <p><strong>Produit :</strong> {nom_produit}<br/>\
             <strong>Date :</strong> {date_label}<br/>\
             <strong>Valorisation :</strong> {valorisation_euros:.2} €{extras_html}</p>\
             <p>Importez la déclaration depuis le CRM (panneau Espace client) pour mettre à jour le dossier.</p>",
            client_label = escape_html(client_label),
            kind = kind,
            nom_produit = escape_html(nom_produit),
            date_label = escape_html(date_label),
            extras_html = extras_html
        );
        self.send_email(
            advisor_email,
            "Mise à jour patrimoine — espace client",
            &text,
            &html,
        )
        .await
    }

    #[allow(clippy::too_many_arguments)]
    pub async fn send_avoir_declared(
        &self,
        advisor_email: &str,
        client_label: &str,
        nom_produit: &str,
        kind: &str,
        valorisation_euros: f64,
        loyer_euros: Option<f64>,
        mensualite_euros: Option<f64>,
        date_fin_pret_label: Option<String>,
    ) -> Result<(), String> {
        let mut extras_text = String::new();
        let mut extras_html = String::new();
        if let Some(v) = loyer_euros {
            extras_text.push_str(&format!("\nLoyer mensuel : {v:.2} €"));
            extras_html.push_str(&format!("<br/><strong>Loyer mensuel :</strong> {v:.2} €"));
        }
        if let Some(v) = mensualite_euros {
            extras_text.push_str(&format!("\nMensualité de crédit : {v:.2} €"));
            extras_html
                .push_str(&format!("<br/><strong>Mensualité de crédit :</strong> {v:.2} €"));
        }
        if let Some(label) = date_fin_pret_label {
            extras_text.push_str(&format!("\nFin de prêt : {label}"));
            extras_html.push_str(&format!(
                "<br/><strong>Fin de prêt :</strong> {}",
                escape_html(&label)
            ));
        }
        let text = format!(
            "Bonjour,\n\n\
             {client_label} a déclaré {kind} depuis l'espace client.\n\
             Produit : {nom_produit}\n\
             Valorisation : {valorisation_euros:.2} €{extras_text}\n\n\
             Importez la déclaration depuis le CRM (panneau Espace client) pour l'ajouter au dossier.\n"
        );
        let html = format!(
            "<p>Bonjour,</p>\
             <p><strong>{client_label}</strong> a déclaré {kind} depuis l'espace client.</p>\
             <p><strong>Produit :</strong> {nom_produit}<br/>\
             <strong>Valorisation :</strong> {valorisation_euros:.2} €{extras_html}</p>\
             <p>Importez la déclaration depuis le CRM (panneau Espace client) pour l'ajouter au dossier.</p>",
            client_label = escape_html(client_label),
            kind = kind,
            nom_produit = escape_html(nom_produit),
            extras_html = extras_html
        );
        self.send_email(
            advisor_email,
            "Nouvel avoir déclaré — espace client",
            &text,
            &html,
        )
        .await
    }

    pub async fn send_avoir_retire(
        &self,
        advisor_email: &str,
        client_label: &str,
        nom_produit: &str,
        type_produit: &str,
    ) -> Result<(), String> {
        let text = format!(
            "Bonjour,\n\n\
             {client_label} a retiré un avoir déclaré depuis l'espace client.\n\
             Produit : {nom_produit} ({type_produit})\n\n\
             S'il n'était pas encore dans le dossier, ignorez le mail de déclaration.\n\
             S'il y était déjà, importez depuis le CRM (panneau Espace client) pour clôturer la ligne.\n"
        );
        let html = format!(
            "<p>Bonjour,</p>\
             <p><strong>{client_label}</strong> a retiré un avoir déclaré depuis l'espace client.</p>\
             <p><strong>Produit :</strong> {nom_produit} ({type_produit})</p>\
             <p>S'il n'était pas encore dans le dossier, ignorez le mail de déclaration.<br/>\
             S'il y était déjà, importez depuis le CRM (panneau Espace client) pour clôturer la ligne.</p>",
            client_label = escape_html(client_label),
            nom_produit = escape_html(nom_produit),
            type_produit = escape_html(type_produit)
        );
        self.send_email(
            advisor_email,
            "Avoir retiré — espace client",
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
            // L'adresse et surtout le navigateur viennent de la requête : un
            // visiteur choisit son User-Agent, et ce message part dans la boîte
            // du client.
            ip_html = ip
                .filter(|value| !value.is_empty())
                .map(|value| {
                    format!(
                        "<strong>Adresse réseau :</strong> {}<br/>",
                        escape_html(value)
                    )
                })
                .unwrap_or_default(),
            ua_html = user_agent
                .filter(|value| !value.is_empty())
                .map(|value| {
                    format!("<strong>Navigateur :</strong> {}<br/>", escape_html(value))
                })
                .unwrap_or_default(),
            cabinet = self.cabinet_html()
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
         <p>{cabinet}</p>",
        code = escape_html(code),
        cabinet = escape_html(cabinet)
    )
}

/// Tout texte libre inséré dans un corps HTML passe par ici : titres et
/// messages écrits par le conseiller, mais aussi le navigateur annoncé par le
/// visiteur, que rien n'empêche de contenir du balisage.
fn escape_html(value: &str) -> String {
    let mut escaped = String::with_capacity(value.len());
    for c in value.chars() {
        match c {
            '&' => escaped.push_str("&amp;"),
            '<' => escaped.push_str("&lt;"),
            '>' => escaped.push_str("&gt;"),
            '"' => escaped.push_str("&quot;"),
            '\'' => escaped.push_str("&#39;"),
            _ => escaped.push(c),
        }
    }
    escaped
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Un titre ou un navigateur contenant du balisage ne doit pas pouvoir
    /// réécrire l'email qui arrive dans la boîte du client.
    #[test]
    fn free_text_cannot_inject_markup() {
        assert_eq!(
            escape_html("<script>alert('x')</script>"),
            "&lt;script&gt;alert(&#39;x&#39;)&lt;/script&gt;"
        );
        assert_eq!(escape_html("Dupont & fils"), "Dupont &amp; fils");
        assert_eq!(escape_html("Bilan annuel"), "Bilan annuel");
    }

    #[test]
    fn login_code_email_escapes_the_cabinet_name() {
        let html = login_code_html("<b>Cabinet</b>", "123456");
        assert!(html.contains("&lt;b&gt;Cabinet&lt;/b&gt;"));
        assert!(html.contains("123456"));
    }

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
