//! Jeton SharePoint REST (audience `{hostname}`) distinct du jeton Graph.

use crate::email::oauth_client::build_basic_client;
use crate::email::oauth_store::EmailOAuthStore;
use crate::workspace::oauth::{microsoft_team_flow_provider, sharepoint_rest_scope};
use oauth2::reqwest::http_client;
use oauth2::{RefreshToken, Scope, TokenResponse};
use tauri::AppHandle;

const CONSENT_HINT: &str = "\
Dans Entra → Inscriptions d'applications → Patrimoine CRM → Autorisations de l'API, \
ajoutez SharePoint (Office 365 SharePoint Online) → AllSites.Manage (déléguée), \
puis Accorder le consentement administrateur. \
Ensuite dans le CRM : Déconnecter, Connecter Microsoft, Provisionner.";

pub fn map_sharepoint_token_error(error: &str) -> String {
    let lower = error.to_ascii_lowercase();
    if lower.contains("65001")
        || lower.contains("650053")
        || lower.contains("consent")
        || lower.contains("invalid_grant")
        || lower.contains("unauthorized_client")
        || lower.contains("scope")
    {
        format!("Jeton SharePoint REST refusé. {CONSENT_HINT} Détail : {error}")
    } else {
        format!("Jeton SharePoint REST impossible : {error}")
    }
}

pub fn exchange_sharepoint_rest_token(
    app: &AppHandle,
    hostname: &str,
) -> Result<String, String> {
    let scope = sharepoint_rest_scope(hostname)?;
    let store = EmailOAuthStore::load(app)?;
    let refresh = store
        .microsoft_team_connection
        .as_ref()
        .and_then(|connection| connection.refresh_token.clone())
        .filter(|token| !token.trim().is_empty())
        .ok_or_else(|| {
            format!(
                "Reconnectez Microsoft (jeton de rafraîchissement manquant). {CONSENT_HINT}"
            )
        })?;
    let client = build_basic_client(microsoft_team_flow_provider(), &store)?;
    let token = client
        .exchange_refresh_token(&RefreshToken::new(refresh))
        .add_scope(Scope::new(scope))
        .add_scope(Scope::new("offline_access".into()))
        .request(http_client)
        .map_err(|error| map_sharepoint_token_error(&error.to_string()))?;
    Ok(token.access_token().secret().clone())
}

#[cfg(test)]
mod tests {
    use super::map_sharepoint_token_error;

    #[test]
    fn consent_errors_point_to_all_sites_manage() {
        let message = map_sharepoint_token_error(
            "AADSTS65001: The user or administrator has not consented",
        );
        assert!(message.contains("AllSites.Manage"));
        assert!(message.contains("Connecter Microsoft"));
    }
}
