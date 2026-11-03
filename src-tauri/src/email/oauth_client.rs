use super::oauth_store::EmailOAuthStore;
use crate::workspace::oauth::microsoft_team_oauth_tenant;
use oauth2::basic::BasicClient;
use oauth2::{AuthUrl, ClientId, ClientSecret, EndpointNotSet, EndpointSet, TokenUrl};

/// Client OAuth avec endpoints d'autorisation et de jeton renseignés.
pub type ConfiguredOAuthClient =
    BasicClient<EndpointSet, EndpointNotSet, EndpointNotSet, EndpointNotSet, EndpointSet>;

/// Client HTTP des échanges de jetons : sans redirections (prévention SSRF,
/// comme l'ancien `oauth2::reqwest::http_client`). Créé à chaque appel, hors runtime async.
pub fn oauth_http_client() -> Result<reqwest::blocking::Client, String> {
    reqwest::blocking::Client::builder()
        .redirect(reqwest::redirect::Policy::none())
        .build()
        .map_err(|e| format!("Client HTTP OAuth: {e}"))
}

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
) -> Result<ConfiguredOAuthClient, String> {
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

    basic_client_for_endpoints(client_id, client_secret, auth_url, token_url)
}

fn basic_client_for_endpoints(
    client_id: String,
    client_secret: Option<String>,
    auth_url: String,
    token_url: String,
) -> Result<ConfiguredOAuthClient, String> {
    let client = BasicClient::new(ClientId::new(client_id))
        .set_auth_uri(AuthUrl::new(auth_url).map_err(|e| e.to_string())?)
        .set_token_uri(TokenUrl::new(token_url).map_err(|e| e.to_string())?);
    Ok(match client_secret {
        Some(secret) => client.set_client_secret(ClientSecret::new(secret)),
        None => client,
    })
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

    use crate::email::oauth_store::OAUTH_REDIRECT_URI;
    use crate::workspace::sharepoint::test_server::{ScriptedGraphServer, ScriptedResponse};
    use base64::Engine;
    use oauth2::{
        AuthorizationCode, CsrfToken, PkceCodeChallenge, PkceCodeVerifier, RedirectUrl,
        RefreshToken, RequestTokenError, Scope, TokenResponse,
    };

    const TOKEN_JSON: &str = r#"{"access_token":"at-1","token_type":"Bearer","expires_in":3600,"refresh_token":"rt-2","scope":"openid"}"#;

    fn google_store() -> EmailOAuthStore {
        EmailOAuthStore {
            google_client_id: Some("google-id".into()),
            google_client_secret: Some("google-secret".into()),
            microsoft_client_id: Some("ms-id".into()),
            ..Default::default()
        }
    }

    fn client_on(server: &ScriptedGraphServer, secret: Option<&str>) -> ConfiguredOAuthClient {
        basic_client_for_endpoints(
            "client-id".into(),
            secret.map(str::to_string),
            "https://login.example.test/authorize".into(),
            format!("{}/token", server.base_url),
        )
        .expect("client OAuth de test")
    }

    fn request_body(request: &str) -> &str {
        request.split_once("\r\n\r\n").map(|(_, body)| body).unwrap_or("")
    }

    fn header<'a>(request: &'a str, name: &str) -> Option<&'a str> {
        request.lines().find_map(|line| {
            let (key, value) = line.split_once(':')?;
            key.eq_ignore_ascii_case(name).then(|| value.trim())
        })
    }

    #[test]
    fn google_authorize_url_carries_client_redirect_and_pkce() {
        let client = build_basic_client("google", &google_store())
            .expect("client Google")
            .set_redirect_uri(RedirectUrl::new(OAUTH_REDIRECT_URI.into()).unwrap());
        let (challenge, _verifier) = PkceCodeChallenge::new_random_sha256();
        let (url, _csrf) = client
            .authorize_url(CsrfToken::new_random)
            .add_scope(Scope::new("openid".into()))
            .set_pkce_challenge(challenge)
            .url();
        let url = url.as_str();
        assert!(url.starts_with("https://accounts.google.com/o/oauth2/v2/auth?"));
        assert!(url.contains("client_id=google-id"));
        assert!(url.contains("redirect_uri=http%3A%2F%2F127.0.0.1%3A3847%2Fcallback"));
        assert!(url.contains("code_challenge_method=S256"));
        assert!(url.contains("response_type=code"));
    }

    #[test]
    fn microsoft_authorize_url_targets_the_flow_tenant() {
        let client = build_basic_client("microsoft_onedrive", &google_store()).expect("client MS");
        let (url, _) = client.authorize_url(CsrfToken::new_random).url();
        assert!(url
            .as_str()
            .starts_with("https://login.microsoftonline.com/consumers/oauth2/v2.0/authorize?"));
        assert!(url.as_str().contains("client_id=ms-id"));
    }

    #[test]
    fn google_without_secret_is_rejected_before_any_request() {
        let store = EmailOAuthStore {
            google_client_secret: None,
            ..google_store()
        };
        let error = build_basic_client("google", &store).err().expect("secret requis");
        assert!(error.contains("Code secret client Google manquant"));
    }

    #[test]
    fn code_exchange_sends_pkce_and_basic_auth_then_parses_tokens() {
        let server = ScriptedGraphServer::spawn(vec![ScriptedResponse::json(200, TOKEN_JSON)]);
        let token = client_on(&server, Some("s3cret"))
            .set_redirect_uri(RedirectUrl::new(OAUTH_REDIRECT_URI.into()).unwrap())
            .exchange_code(AuthorizationCode::new("code-abc".into()))
            .set_pkce_verifier(PkceCodeVerifier::new("verifier-xyz".into()))
            .request(&oauth_http_client().unwrap())
            .expect("échange du code");
        assert_eq!(token.access_token().secret(), "at-1");
        assert_eq!(token.refresh_token().map(|t| t.secret().as_str()), Some("rt-2"));
        assert_eq!(token.expires_in().map(|d| d.as_secs()), Some(3600));

        let requests = server.finish();
        assert_eq!(requests.len(), 1);
        let request = &requests[0];
        assert!(request.starts_with("POST /token "));
        let expected_auth = format!(
            "Basic {}",
            base64::engine::general_purpose::STANDARD.encode("client-id:s3cret")
        );
        assert_eq!(header(request, "authorization"), Some(expected_auth.as_str()));
        let body = request_body(request);
        assert!(body.contains("grant_type=authorization_code"));
        assert!(body.contains("code=code-abc"));
        assert!(body.contains("code_verifier=verifier-xyz"));
        assert!(body.contains("redirect_uri=http%3A%2F%2F127.0.0.1%3A3847%2Fcallback"));
    }

    #[test]
    fn refresh_without_secret_sends_client_id_and_scopes_in_body() {
        let server = ScriptedGraphServer::spawn(vec![ScriptedResponse::json(200, TOKEN_JSON)]);
        let token = client_on(&server, None)
            .exchange_refresh_token(&RefreshToken::new("rt-1".into()))
            .add_scope(Scope::new("offline_access".into()))
            .request(&oauth_http_client().unwrap())
            .expect("rafraîchissement");
        assert_eq!(token.access_token().secret(), "at-1");

        let requests = server.finish();
        let request = &requests[0];
        assert_eq!(header(request, "authorization"), None);
        let body = request_body(request);
        assert!(body.contains("grant_type=refresh_token"));
        assert!(body.contains("refresh_token=rt-1"));
        assert!(body.contains("client_id=client-id"));
        assert!(body.contains("scope=offline_access"));
    }

    #[test]
    fn provider_error_is_reported_as_server_response() {
        let server = ScriptedGraphServer::spawn(vec![ScriptedResponse::json(
            400,
            r#"{"error":"invalid_grant","error_description":"Token has been expired or revoked."}"#,
        )]);
        let error = client_on(&server, None)
            .exchange_refresh_token(&RefreshToken::new("rt-old".into()))
            .request(&oauth_http_client().unwrap())
            .expect_err("jeton révoqué");
        server.finish();
        match error {
            RequestTokenError::ServerResponse(resp) => {
                assert_eq!(resp.error().to_string(), "invalid_grant");
                assert_eq!(
                    resp.error_description().map(String::as_str),
                    Some("Token has been expired or revoked.")
                );
            }
            other => panic!("erreur inattendue : {other:?}"),
        }
    }

    #[test]
    fn token_endpoint_redirects_are_not_followed() {
        let server = ScriptedGraphServer::spawn(vec![
            // Le faux serveur n'écrit qu'un Content-Type : l'en-tête Location y est accolé.
            ScriptedResponse {
                status: 302,
                content_type: "application/json\r\nLocation: /token",
                body: Vec::new(),
            },
            ScriptedResponse::json(200, TOKEN_JSON),
        ]);
        let result = client_on(&server, None)
            .exchange_refresh_token(&RefreshToken::new("rt-1".into()))
            .request(&oauth_http_client().unwrap());
        assert!(result.is_err(), "une redirection ne doit pas aboutir à un jeton");
        // Débloque la 2e réponse scriptée, jamais consommée par le client.
        let address = server.base_url.trim_start_matches("http://").to_string();
        let mut stream = std::net::TcpStream::connect(address).expect("connexion de déblocage");
        std::io::Write::write_all(&mut stream, b"GET / HTTP/1.1\r\n\r\n").unwrap();
        assert_eq!(server.finish().len(), 2);
    }
}
