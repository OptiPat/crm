use super::oauth_store::EmailOAuthStore;
use oauth2::basic::BasicClient;
use oauth2::{AuthUrl, ClientId, ClientSecret, TokenUrl};

pub fn oauth_endpoints(provider: &str) -> Result<(&'static str, &'static str), String> {
    match provider {
        "google" => Ok((
            "https://accounts.google.com/o/oauth2/v2/auth",
            "https://oauth2.googleapis.com/token",
        )),
        "microsoft" => Ok((
            "https://login.microsoftonline.com/common/oauth2/v2.0/authorize",
            "https://login.microsoftonline.com/common/oauth2/v2.0/token",
        )),
        _ => Err(format!("Fournisseur OAuth inconnu: {}", provider)),
    }
}

pub fn build_basic_client(provider: &str, store: &EmailOAuthStore) -> Result<BasicClient, String> {
    let oauth_provider = match provider {
        "google" | "google_calendar" => "google",
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
                    "Identifiant client Google manquant (Paramètres → Emails & envois → Connexion).".to_string()
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
            let id = store
                .microsoft_client_id
                .as_ref()
                .filter(|s| !s.trim().is_empty())
                .cloned()
                .ok_or_else(|| {
                    "Identifiant client Microsoft manquant (Paramètres → Emails & envois → Connexion).".to_string()
                })?;
            (id, None)
        }
        _ => return Err(format!("Fournisseur OAuth inconnu: {}", provider)),
    };

    let (auth_url, token_url) = oauth_endpoints(oauth_provider)?;
    Ok(BasicClient::new(
        ClientId::new(client_id),
        client_secret.map(ClientSecret::new),
        AuthUrl::new(auth_url.to_string()).map_err(|e| e.to_string())?,
        Some(TokenUrl::new(token_url.to_string()).map_err(|e| e.to_string())?),
    ))
}
