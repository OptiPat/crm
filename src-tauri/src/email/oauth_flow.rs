use super::oauth_store::{EmailOAuthConnection, EmailOAuthStore, OAUTH_REDIRECT_URI};
use oauth2::basic::BasicClient;
use oauth2::reqwest::http_client;
use oauth2::{
    AuthUrl, AuthorizationCode, ClientId, CsrfToken, PkceCodeChallenge, RedirectUrl, Scope,
    TokenResponse, TokenUrl,
};
use std::io::{Read, Write};
use std::net::TcpListener;
use std::time::Duration;
use tauri::AppHandle;
use url::Url;

struct ProviderOAuth {
    auth_url: &'static str,
    token_url: &'static str,
    scopes: &'static [&'static str],
}

fn provider_config(provider: &str) -> Result<ProviderOAuth, String> {
    match provider {
        "google" => Ok(ProviderOAuth {
            auth_url: "https://accounts.google.com/o/oauth2/v2/auth",
            token_url: "https://oauth2.googleapis.com/token",
            scopes: &[
                "https://www.googleapis.com/auth/gmail.send",
                "https://www.googleapis.com/auth/userinfo.email",
                "openid",
            ],
        }),
        "microsoft" => Ok(ProviderOAuth {
            auth_url: "https://login.microsoftonline.com/common/oauth2/v2.0/authorize",
            token_url: "https://login.microsoftonline.com/common/oauth2/v2.0/token",
            scopes: &[
                "offline_access",
                "https://graph.microsoft.com/Mail.Send",
                "https://graph.microsoft.com/User.Read",
                "openid",
                "email",
            ],
        }),
        _ => Err(format!("Fournisseur OAuth inconnu: {}", provider)),
    }
}

/// Ouvre l’URL OAuth dans le navigateur par défaut (sans plugin shell/opener déprécié).
fn open_authorization_url(url: &str) -> Result<(), String> {
    if cfg!(target_os = "windows") {
        std::process::Command::new("cmd")
            .args(["/C", "start", "", url])
            .spawn()
            .map_err(|e| format!("Ouverture du navigateur: {}", e))?;
    } else if cfg!(target_os = "macos") {
        std::process::Command::new("open")
            .arg(url)
            .spawn()
            .map_err(|e| format!("Ouverture du navigateur: {}", e))?;
    } else {
        std::process::Command::new("xdg-open")
            .arg(url)
            .spawn()
            .map_err(|e| format!("Ouverture du navigateur: {}", e))?;
    }
    Ok(())
}

fn client_id_for(store: &EmailOAuthStore, provider: &str) -> Result<String, String> {
    let id = match provider {
        "google" => store.google_client_id.as_ref(),
        "microsoft" => store.microsoft_client_id.as_ref(),
        _ => None,
    };
    id.filter(|s| !s.trim().is_empty())
        .cloned()
        .ok_or_else(|| {
            format!(
                "Identifiant client {} manquant. Renseignez-le dans Paramètres → Email (voir docs/EMAIL_OAUTH_SETUP.md).",
                provider
            )
        })
}

fn wait_for_callback(
    listener: &TcpListener,
    expected_state: &str,
) -> Result<(String, String), String> {
    let (mut stream, _) = listener
        .accept()
        .map_err(|e| format!("Écoute OAuth: {}", e))?;
    let _ = stream.set_read_timeout(Some(Duration::from_secs(120)));
    let _ = stream.set_write_timeout(Some(Duration::from_secs(5)));

    let mut buf = [0u8; 4096];
    let n = stream
        .read(&mut buf)
        .map_err(|e| format!("Lecture callback OAuth: {}", e))?;
    let req = String::from_utf8_lossy(&buf[..n]);
    let request_line = req.lines().next().unwrap_or("");
    let path = request_line
        .split_whitespace()
        .nth(1)
        .unwrap_or("/callback");

    let full_url = format!("http://127.0.0.1{}", path);
    let parsed = Url::parse(&full_url).map_err(|e| e.to_string())?;
    let mut code = None;
    let mut state = None;
    let mut err = None;
    for (k, v) in parsed.query_pairs() {
        match k.as_ref() {
            "code" => code = Some(v.to_string()),
            "state" => state = Some(v.to_string()),
            "error" => err = Some(v.to_string()),
            _ => {}
        }
    }

    let body = r#"<!DOCTYPE html><html lang="fr"><head><meta charset="utf-8"><title>CRM</title></head>
<body style="font-family:sans-serif;padding:2rem"><h1>Connexion réussie</h1>
<p>Vous pouvez fermer cet onglet et revenir au CRM.</p></body></html>"#;
    let response = format!(
        "HTTP/1.1 200 OK\r\nContent-Type: text/html; charset=utf-8\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}",
        body.len(),
        body
    );
    let _ = stream.write_all(response.as_bytes());
    let _ = stream.flush();

    if let Some(e) = err {
        return Err(format!("OAuth refusé: {}", e));
    }
    let state = state.ok_or("Paramètre state manquant")?;
    if state != expected_state {
        return Err("État OAuth invalide (CSRF)".into());
    }
    let code = code.ok_or("Code d'autorisation manquant")?;
    Ok((code, state))
}

fn fetch_user_email(provider: &str, access_token: &str) -> Result<String, String> {
    let client = reqwest::blocking::Client::new();
    match provider {
        "google" => {
            let res = client
                .get("https://www.googleapis.com/oauth2/v2/userinfo")
                .bearer_auth(access_token)
                .send()
                .map_err(|e| e.to_string())?;
            let json: serde_json::Value = res.json().map_err(|e| e.to_string())?;
            json.get("email")
                .and_then(|v| v.as_str())
                .map(|s| s.to_string())
                .ok_or_else(|| "Email Google introuvable dans le profil".into())
        }
        "microsoft" => {
            let res = client
                .get("https://graph.microsoft.com/v1.0/me?$select=mail,userPrincipalName")
                .bearer_auth(access_token)
                .send()
                .map_err(|e| e.to_string())?;
            let json: serde_json::Value = res.json().map_err(|e| e.to_string())?;
            if let Some(mail) = json.get("mail").and_then(|v| v.as_str()) {
                if !mail.is_empty() {
                    return Ok(mail.to_string());
                }
            }
            json.get("userPrincipalName")
                .and_then(|v| v.as_str())
                .map(|s| s.to_string())
                .ok_or_else(|| "Email Microsoft introuvable".into())
        }
        _ => Err("Fournisseur inconnu".into()),
    }
}

pub fn run_oauth_connect(app: &AppHandle, provider: &str) -> Result<EmailOAuthConnection, String> {
    let mut store = EmailOAuthStore::load(app)?;
    let client_id = client_id_for(&store, provider)?;
    let cfg = provider_config(provider)?;

    let oauth_client = BasicClient::new(
        ClientId::new(client_id),
        None,
        AuthUrl::new(cfg.auth_url.to_string()).map_err(|e| e.to_string())?,
        Some(TokenUrl::new(cfg.token_url.to_string()).map_err(|e| e.to_string())?),
    )
    .set_redirect_uri(RedirectUrl::new(OAUTH_REDIRECT_URI.to_string()).map_err(|e| e.to_string())?);

    let (pkce_challenge, pkce_verifier) = PkceCodeChallenge::new_random_sha256();
    let mut auth_request = oauth_client.authorize_url(CsrfToken::new_random);
    for scope in cfg.scopes {
        auth_request = auth_request.add_scope(Scope::new((*scope).to_string()));
    }
    let (auth_url, csrf_token) = auth_request.set_pkce_challenge(pkce_challenge).url();

    let listener = TcpListener::bind(format!("127.0.0.1:{}", super::oauth_store::OAUTH_REDIRECT_PORT))
        .map_err(|e| {
            format!(
                "Impossible d'ouvrir le port {} pour OAuth. Fermez l'autre application ou réessayez. {}",
                super::oauth_store::OAUTH_REDIRECT_PORT,
                e
            )
        })?;

    open_authorization_url(auth_url.as_ref())?;

    let (code, _) = wait_for_callback(&listener, csrf_token.secret())?;

    let token = oauth_client
        .exchange_code(AuthorizationCode::new(code))
        .set_pkce_verifier(pkce_verifier)
        .request(http_client)
        .map_err(|e| format!("Échange du code OAuth: {}", e))?;

    let access_token = token.access_token().secret().clone();
    let refresh_token = token.refresh_token().map(|t| t.secret().clone());
    let expires_at = token
        .expires_in()
        .map(|d| EmailOAuthStore::now_unix() + d.as_secs() as i64)
        .unwrap_or(EmailOAuthStore::now_unix() + 3500);

    let email = fetch_user_email(provider, &access_token)?;

    let connection = EmailOAuthConnection {
        provider: provider.to_string(),
        email,
        access_token,
        refresh_token,
        expires_at,
    };

    store.connection = Some(connection.clone());
    store.save(app)?;

    Ok(connection)
}

pub fn disconnect_oauth(app: &AppHandle) -> Result<(), String> {
    let mut store = EmailOAuthStore::load(app)?;
    store.connection = None;
    store.save(app)
}
