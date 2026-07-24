use super::oauth_store::EmailOAuthStore;
use crate::workspace::oauth::microsoft_team_oauth_tenant;
use oauth2::basic::BasicClient;
use oauth2::{AuthUrl, ClientId, ClientSecret, TokenUrl};

pub fn microsoft_oauth_tenant(oauth_flow_provider: &str) -> &'static str {
    // App Azure « comptes personnels uniquement » → endpoint /consumers obligatoire.
    match oauth_flow_provider {
        "microsoft_onedrive" => "consumers",
        "microsoft_team" => microsoft_team_oauth_tenant(),
        _ => "common",
    }
}

pub fn build_basic_client(
    oauth_flow_provider: &str,
    store: &EmailOAuthStore,
) -> Result<BasicClient, String> {
    let oauth_provider = match oauth_flow_provider {
        "google" | "google_calendar" => "google",
        "microsoft" | "microsoft_onedrive" | "microsoft_team" => "microsoft",
        other => other,
    };
    let (client_id, client_secret) = match oauth_provider {
        "google" => {
            let id = store
                .google_client_id
                .as_ref()
                .filter(|s| !s.trim().is_empty())
                .cloned()
                .ok_or_else(|| {
                    "Identifiant client Google manquant (Paramètres → Emails & envois → Connexion)."
                        .to_string()
                })?;
            let secret = store
                .google_client_secret
                .as_ref()
                .filter(|s| !s.trim().is_empty())
                .cloned()
                .ok_or_else(|| {
                    "Code secret client Google manquant. Google Cloud → Clients → CRM Bureau → \
                     copiez le « Code secret du client » dans Paramètres → Emails & envois → Connexion."
                        .to_string()
                })?;
            (id, Some(secret))
        }
        "microsoft" => {
            let missing = match oauth_flow_provider {
                "microsoft_onedrive" => {
                    "Identifiant client Microsoft manquant (Paramètres → Intégrations → Dossiers clients OneDrive)."
                }
                "microsoft_team" => {
                    "Identifiant client Microsoft manquant (Paramètres → Mode équipe → Connexion Microsoft 365)."
                }
                _ => {
                    "Identifiant client Microsoft manquant (Paramètres → Emails & envois → Connexion)."
                }
            };
            let id = store
                .microsoft_client_id
                .as_ref()
                .filter(|s| !s.trim().is_empty())
                .cloned()
                .ok_or_else(|| missing.to_string())?;
            (id, None)
        }
        _ => return Err(format!("Fournisseur OAuth inconnu: {}", oauth_provider)),
    };

    let (auth_url, token_url) = match oauth_provider {
        "google" => (
            "https://accounts.google.com/o/oauth2/v2/auth".to_string(),
            "https://oauth2.googleapis.com/token".to_string(),
        ),
        "microsoft" => {
            let tenant = microsoft_oauth_tenant(oauth_flow_provider);
            (
                format!("https://login.microsoftonline.com/{tenant}/oauth2/v2.0/authorize"),
                format!("https://login.microsoftonline.com/{tenant}/oauth2/v2.0/token"),
            )
        }
        _ => return Err(format!("Fournisseur OAuth inconnu: {}", oauth_provider)),
    };

    Ok(BasicClient::new(
        ClientId::new(client_id),
        client_secret.map(ClientSecret::new),
        AuthUrl::new(auth_url).map_err(|e| e.to_string())?,
        Some(TokenUrl::new(token_url).map_err(|e| e.to_string())?),
    ))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn microsoft_tenant_routes_personal_onedrive_and_team_flows() {
        assert_eq!(microsoft_oauth_tenant("microsoft"), "common");
        assert_eq!(microsoft_oauth_tenant("microsoft_onedrive"), "consumers");
        assert_eq!(microsoft_oauth_tenant("microsoft_team"), "organizations");
    }
}
