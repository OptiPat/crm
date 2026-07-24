//! Politique d'identité d'envoi email (mode local / équipe).

use crate::database::workspace::WorkspaceConfig;
use crate::workspace::mode::WorkspaceMode;
use crate::workspace::team::TeamRole;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum SendMailboxRoute {
    Primary,
    OfficeShared,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ResolvedSendIdentity {
    pub route: SendMailboxRoute,
    pub sender_email: String,
}

fn normalize_email(email: &str) -> Option<String> {
    let trimmed = email.trim();
    if trimmed.is_empty() || !trimmed.contains('@') {
        None
    } else {
        Some(trimmed.to_lowercase())
    }
}

pub fn encode_graph_user_path_segment(user_id: &str) -> String {
    url::form_urlencoded::byte_serialize(user_id.as_bytes()).collect()
}

pub fn microsoft_graph_send_mail_url(route: SendMailboxRoute, sender_email: &str) -> String {
    match route {
        SendMailboxRoute::Primary => "https://graph.microsoft.com/v1.0/me/sendMail".to_string(),
        SendMailboxRoute::OfficeShared => {
            let encoded = encode_graph_user_path_segment(sender_email);
            format!("https://graph.microsoft.com/v1.0/users/{encoded}/sendMail")
        }
    }
}

pub fn resolve_send_identity(
    config: &WorkspaceConfig,
    primary_email: Option<&str>,
    requested_sender: Option<&str>,
) -> Result<ResolvedSendIdentity, String> {
    let primary = primary_email.and_then(normalize_email);
    let office = config
        .office_mailbox_email
        .as_deref()
        .and_then(normalize_email);
    let requested = requested_sender.and_then(normalize_email);

    if config.mode == WorkspaceMode::Local {
        let primary = primary.ok_or_else(|| {
            "Aucune connexion email. Paramètres → Emails & envois → Connexion.".to_string()
        })?;
        if let Some(req) = requested {
            if req != primary {
                return Err("Adresse d'envoi non autorisée.".to_string());
            }
        }
        return Ok(ResolvedSendIdentity {
            route: SendMailboxRoute::Primary,
            sender_email: primary,
        });
    }

    match config.effective_role() {
        TeamRole::Secretary => {
            let office = office.ok_or_else(|| {
                "Boîte cabinet Microsoft 365 non configurée (Paramètres → Mode équipe).".to_string()
            })?;
            if let Some(req) = requested {
                if req != office {
                    return Err(
                        "En mode secrétaire, seule la boîte cabinet est autorisée.".to_string(),
                    );
                }
            }
            Ok(ResolvedSendIdentity {
                route: SendMailboxRoute::OfficeShared,
                sender_email: office,
            })
        }
        TeamRole::Advisor => match requested {
            None => {
                let primary = primary.ok_or_else(|| {
                    "Aucune connexion email. Paramètres → Emails & envois → Connexion.".to_string()
                })?;
                Ok(ResolvedSendIdentity {
                    route: SendMailboxRoute::Primary,
                    sender_email: primary,
                })
            }
            Some(req) => {
                if let Some(ref primary) = primary {
                    if req == *primary {
                        return Ok(ResolvedSendIdentity {
                            route: SendMailboxRoute::Primary,
                            sender_email: primary.clone(),
                        });
                    }
                }
                let office = office.ok_or_else(|| {
                    "Boîte cabinet non configurée (Paramètres → Mode équipe).".to_string()
                })?;
                if req == office {
                    Ok(ResolvedSendIdentity {
                        route: SendMailboxRoute::OfficeShared,
                        sender_email: office,
                    })
                } else {
                    Err("Adresse d'envoi non autorisée.".to_string())
                }
            }
        },
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::workspace::mode::WorkspaceMode;
    use crate::workspace::team::TeamRole;

    fn team_config(role: TeamRole, office: Option<&str>) -> WorkspaceConfig {
        WorkspaceConfig {
            mode: WorkspaceMode::TeamSharepoint,
            role: Some(role),
            site_hostname: Some("contoso.sharepoint.com".into()),
            site_path: Some("/sites/crm".into()),
            site_id: Some("site-1".into()),
            site_name: None,
            office_mailbox_email: office.map(str::to_string),
            ..Default::default()
        }
    }

    #[test]
    fn local_mode_always_uses_primary() {
        let config = WorkspaceConfig::default();
        let identity = resolve_send_identity(&config, Some("Conseiller@Example.com"), None).unwrap();
        assert_eq!(identity.route, SendMailboxRoute::Primary);
        assert_eq!(identity.sender_email, "conseiller@example.com");
    }

    #[test]
    fn local_mode_rejects_non_primary_sender() {
        let config = WorkspaceConfig::default();
        let err = resolve_send_identity(
            &config,
            Some("cgp@example.com"),
            Some("other@example.com"),
        )
        .unwrap_err();
        assert!(err.contains("non autorisée"));
    }

    #[test]
    fn secretary_defaults_to_office_mailbox() {
        let config = team_config(TeamRole::Secretary, Some("cabinet@example.com"));
        let identity = resolve_send_identity(&config, None, None).unwrap();
        assert_eq!(identity.route, SendMailboxRoute::OfficeShared);
        assert_eq!(identity.sender_email, "cabinet@example.com");
    }

    #[test]
    fn secretary_rejects_primary_sender() {
        let config = team_config(TeamRole::Secretary, Some("cabinet@example.com"));
        let err = resolve_send_identity(&config, Some("cgp@example.com"), Some("cgp@example.com"))
            .unwrap_err();
        assert!(err.contains("secrétaire"));
    }

    #[test]
    fn secretary_requires_office_mailbox_configured() {
        let config = team_config(TeamRole::Secretary, None);
        let err = resolve_send_identity(&config, Some("cgp@example.com"), None).unwrap_err();
        assert!(err.contains("cabinet"));
    }

    #[test]
    fn advisor_defaults_to_primary() {
        let config = team_config(TeamRole::Advisor, Some("cabinet@example.com"));
        let identity =
            resolve_send_identity(&config, Some("cgp@example.com"), None).unwrap();
        assert_eq!(identity.route, SendMailboxRoute::Primary);
        assert_eq!(identity.sender_email, "cgp@example.com");
    }

    #[test]
    fn advisor_can_choose_office_mailbox() {
        let config = team_config(TeamRole::Advisor, Some("cabinet@example.com"));
        let identity = resolve_send_identity(
            &config,
            Some("cgp@example.com"),
            Some("cabinet@example.com"),
        )
        .unwrap();
        assert_eq!(identity.route, SendMailboxRoute::OfficeShared);
        assert_eq!(identity.sender_email, "cabinet@example.com");
    }

    #[test]
    fn advisor_rejects_arbitrary_sender() {
        let config = team_config(TeamRole::Advisor, Some("cabinet@example.com"));
        let err = resolve_send_identity(
            &config,
            Some("cgp@example.com"),
            Some("attacker@example.com"),
        )
        .unwrap_err();
        assert!(err.contains("non autorisée"));
    }

    #[test]
    fn graph_user_path_encodes_at_sign() {
        assert_eq!(
            encode_graph_user_path_segment("cabinet@contoso.com"),
            "cabinet%40contoso.com"
        );
    }

    #[test]
    fn graph_user_path_encodes_utf8_bytes() {
        assert_eq!(encode_graph_user_path_segment("équipe@example.com"), "%C3%A9quipe%40example.com");
    }

    #[test]
    fn shared_mailbox_url_uses_encoded_user_segment() {
        let url = microsoft_graph_send_mail_url(
            SendMailboxRoute::OfficeShared,
            "cabinet@contoso.com",
        );
        assert_eq!(
            url,
            "https://graph.microsoft.com/v1.0/users/cabinet%40contoso.com/sendMail"
        );
    }

    #[test]
    fn primary_microsoft_url_uses_me_endpoint() {
        let url = microsoft_graph_send_mail_url(SendMailboxRoute::Primary, "ignored@example.com");
        assert_eq!(url, "https://graph.microsoft.com/v1.0/me/sendMail");
    }
}
