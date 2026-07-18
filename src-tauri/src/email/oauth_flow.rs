use super::oauth_client::build_basic_client;
use super::oauth_store::{EmailOAuthConnection, EmailOAuthStore, OAUTH_REDIRECT_URI};
use oauth2::reqwest::http_client;
use oauth2::{
    AuthorizationCode, CsrfToken, PkceCodeChallenge, RedirectUrl, RequestTokenError, Scope,
    TokenResponse,
};
use std::io::{Read, Write};
use std::net::{TcpListener, TcpStream};
use std::time::Duration;
use tauri::AppHandle;
use url::Url;

struct ProviderOAuth {
    scopes: &'static [&'static str],
}

fn provider_config(provider: &str) -> Result<ProviderOAuth, String> {
    match provider {
        "google" => Ok(ProviderOAuth {
            scopes: &[
                "https://www.googleapis.com/auth/gmail.send",
                "https://www.googleapis.com/auth/gmail.readonly",
                "https://www.googleapis.com/auth/gmail.settings.basic",
                "https://www.googleapis.com/auth/calendar.readonly",
                "https://www.googleapis.com/auth/calendar.events",
                "https://www.googleapis.com/auth/contacts",
                "https://www.googleapis.com/auth/drive.readonly",
                "https://www.googleapis.com/auth/userinfo.email",
                "openid",
            ],
        }),
        "google_calendar" => Ok(ProviderOAuth {
            scopes: &[
                "https://www.googleapis.com/auth/calendar.readonly",
                "https://www.googleapis.com/auth/calendar.events",
                "https://www.googleapis.com/auth/userinfo.email",
                "openid",
            ],
        }),
        "microsoft" => Ok(ProviderOAuth {
            scopes: &[
                "offline_access",
                "https://graph.microsoft.com/Mail.Send",
                "https://graph.microsoft.com/Mail.Read",
                "https://graph.microsoft.com/User.Read",
                "openid",
                "email",
            ],
        }),
        "microsoft_onedrive" => Ok(ProviderOAuth {
            scopes: &[
                "offline_access",
                "openid",
                "https://graph.microsoft.com/Files.ReadWrite",
                "https://graph.microsoft.com/User.Read",
            ],
        }),
        _ => Err(format!("Fournisseur OAuth inconnu: {}", provider)),
    }
}

/// Ouvre l’URL OAuth dans le navigateur par défaut (sans plugin shell/opener déprécié).
fn open_authorization_url(url: &str) -> Result<(), String> {
    if cfg!(target_os = "windows") {
        // `cmd start` tronque souvent l’URL au premier `&` → Google renvoie « Missing parameter: scope ».
        let escaped = url.replace('\'', "''");
        std::process::Command::new("powershell")
            .args([
                "-NoProfile",
                "-ExecutionPolicy",
                "Bypass",
                "-Command",
                &format!("Start-Process '{escaped}'"),
            ])
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

fn write_http_response(stream: &mut TcpStream, status: &str, body: &str) {
    let response = format!(
        "HTTP/1.1 {status}\r\nContent-Type: text/html; charset=utf-8\r\nContent-Security-Policy: default-src 'none'; style-src 'unsafe-inline'\r\nX-Content-Type-Options: nosniff\r\nReferrer-Policy: no-referrer\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{body}",
        body.len()
    );
    let _ = stream.write_all(response.as_bytes());
    let _ = stream.flush();
}

fn escape_html_text(value: &str) -> String {
    let mut escaped = String::with_capacity(value.len());
    for character in value.chars() {
        match character {
            '&' => escaped.push_str("&amp;"),
            '<' => escaped.push_str("&lt;"),
            '>' => escaped.push_str("&gt;"),
            '"' => escaped.push_str("&quot;"),
            '\'' => escaped.push_str("&#39;"),
            _ => escaped.push(character),
        }
    }
    escaped
}

fn try_read_oauth_callback(
    stream: &mut TcpStream,
    expected_state: &str,
) -> Result<Option<String>, String> {
    let _ = stream.set_read_timeout(Some(Duration::from_secs(30)));
    let _ = stream.set_write_timeout(Some(Duration::from_secs(5)));

    let mut buf = [0u8; 8192];
    let n = stream
        .read(&mut buf)
        .map_err(|e| format!("Lecture callback OAuth: {}", e))?;
    let req = String::from_utf8_lossy(&buf[..n]);
    let request_line = req.lines().next().unwrap_or("");
    let path = request_line
        .split_whitespace()
        .nth(1)
        .unwrap_or("/");

    if !path.starts_with("/callback") {
        write_http_response(stream, "404 Not Found", "");
        return Ok(None);
    }

    let full_url = format!("http://127.0.0.1{path}");
    let parsed = Url::parse(&full_url).map_err(|e| e.to_string())?;
    let mut code = None;
    let mut state = None;
    let mut err = None;
    let mut err_desc = None;
    for (k, v) in parsed.query_pairs() {
        match k.as_ref() {
            "code" => code = Some(v.to_string()),
            "state" => state = Some(v.to_string()),
            "error" => err = Some(v.to_string()),
            "error_description" => err_desc = Some(v.to_string()),
            _ => {}
        }
    }

    let success_body = r#"<!DOCTYPE html><html lang="fr"><head><meta charset="utf-8"><title>CRM</title></head>
<body style="font-family:sans-serif;padding:2rem"><h1>Connexion réussie</h1>
<p>Vous pouvez fermer cet onglet et revenir au CRM.</p></body></html>"#;
    let error_body = |message: &str| {
        format!(
            r#"<!DOCTYPE html><html lang="fr"><head><meta charset="utf-8"><title>CRM</title></head>
<body style="font-family:sans-serif;padding:2rem"><h1>Connexion refusée</h1>
<p>{message}</p><p>Fermez cet onglet et réessayez depuis le CRM.</p></body></html>"#
        )
    };

    if let Some(e) = err {
        let desc = err_desc
            .map(|d| format!(" — {d}"))
            .unwrap_or_default();
        let hint = if e == "invalid_request" {
            " Vérifiez Azure → Authentication : plateforme « Applications clientes publiques/mobiles et de bureau », URI http://127.0.0.1:3847/callback, flux client public activé."
        } else {
            ""
        };
        let message = format!("{e}{desc}{hint}");
        write_http_response(
            stream,
            "400 Bad Request",
            &error_body(&escape_html_text(&message)),
        );
        return Err(format!("OAuth refusé: {message}"));
    }

    let render_callback_error = |stream: &mut TcpStream, message: &str| {
        write_http_response(
            stream,
            "400 Bad Request",
            &error_body(&escape_html_text(message)),
        );
    };
    let state = match state {
        Some(state) => state,
        None => {
            let message = "Paramètre state manquant dans le callback";
            render_callback_error(stream, message);
            return Err(message.into());
        }
    };
    if state != expected_state {
        let message = "État OAuth invalide (CSRF). Réessayez Connecter.";
        render_callback_error(stream, message);
        return Err(message.into());
    }
    let code = match code {
        Some(code) => code,
        None => {
            let message = "Code d'autorisation manquant. Ne rechargez pas la page : recliquez Connecter dans le CRM.";
            render_callback_error(stream, message);
            return Err(message.into());
        }
    };
    write_http_response(stream, "200 OK", success_body);
    Ok(Some(code))
}

/// Ignore les requêtes parasites (favicon, etc.) jusqu'au vrai `/callback`.
fn wait_for_callback(listener: &TcpListener, expected_state: &str) -> Result<String, String> {
    let deadline = std::time::Instant::now() + Duration::from_secs(120);
    listener
        .set_nonblocking(true)
        .map_err(|e| format!("Écoute OAuth: {}", e))?;

    loop {
        if std::time::Instant::now() > deadline {
            return Err(
                "Délai OAuth dépassé (120 s). Fermez l'onglet du navigateur et réessayez.".into(),
            );
        }
        match listener.accept() {
            Ok((mut stream, _)) => {
                match try_read_oauth_callback(&mut stream, expected_state)? {
                    Some(code) => return Ok(code),
                    None => continue,
                }
            }
            Err(e) if e.kind() == std::io::ErrorKind::WouldBlock => {
                std::thread::sleep(Duration::from_millis(150));
            }
            Err(e) => return Err(format!("Écoute OAuth: {}", e)),
        }
    }
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

pub fn run_oauth_connect(
    app: &AppHandle,
    provider: &str,
    force_consent: bool,
) -> Result<EmailOAuthConnection, String> {
    let calendar_only = provider == "google_calendar";
    let onedrive_only = provider == "microsoft_onedrive";
    let oauth_provider = if calendar_only {
        "google"
    } else if onedrive_only {
        "microsoft"
    } else {
        provider
    };
    let mut store = EmailOAuthStore::load(app)?;
    let cfg = provider_config(provider)?;

    let oauth_client = build_basic_client(provider, &store)?
        .set_redirect_uri(RedirectUrl::new(OAUTH_REDIRECT_URI.to_string()).map_err(|e| e.to_string())?);

    let (pkce_challenge, pkce_verifier) = PkceCodeChallenge::new_random_sha256();
    let scopes: Vec<Scope> = cfg
        .scopes
        .iter()
        .map(|s| Scope::new((*s).to_string()))
        .collect();
    let mut auth = oauth_client
        .authorize_url(CsrfToken::new_random)
        .add_scopes(scopes)
        .set_pkce_challenge(pkce_challenge);
    // Paramètre Google uniquement — provoque invalid_request chez Microsoft.
    if oauth_provider == "google" {
        auth = auth.add_extra_param("access_type", "offline");
    }
    if force_consent {
        auth = auth.add_extra_param("prompt", "consent");
    }
    let (auth_url, csrf_token) = auth.url();

    let listener = TcpListener::bind(format!("127.0.0.1:{}", super::oauth_store::OAUTH_REDIRECT_PORT))
        .map_err(|e| {
            format!(
                "Impossible d'ouvrir le port {} pour OAuth. Fermez l'autre application ou réessayez. {}",
                super::oauth_store::OAUTH_REDIRECT_PORT,
                e
            )
        })?;

    open_authorization_url(auth_url.as_ref())?;

    let code = wait_for_callback(&listener, csrf_token.secret())?;

    let token = oauth_client
        .exchange_code(AuthorizationCode::new(code))
        .set_pkce_verifier(pkce_verifier)
        .request(http_client)
        .map_err(|e| match &e {
            RequestTokenError::ServerResponse(resp) => {
                let code = resp.error().to_string();
                let desc = resp
                    .error_description()
                    .map(|c| c.to_string())
                    .unwrap_or_default();
                let hint = match code.as_str() {
                    "redirect_uri_mismatch" => {
                        if oauth_provider == "microsoft" {
                            " Ajoutez http://127.0.0.1:3847/callback dans Azure → App registrations → Authentication → URI de redirection (application de bureau)."
                        } else {
                            " Ajoutez http://127.0.0.1:3847/callback dans Google Cloud → Clients → URI de redirection."
                        }
                    }
                    "invalid_grant" => {
                        if oauth_provider == "microsoft" {
                            " Fermez l'onglet Microsoft, attendez 5 s, recliquez Connecter une seule fois."
                        } else {
                            " Fermez l'onglet Google, attendez 5 s, recliquez Connecter Google une seule fois."
                        }
                    }
                    "invalid_request" => {
                        if oauth_provider == "microsoft" {
                            " Vérifiez l'URI de redirection Azure (http://127.0.0.1:3847/callback, application de bureau) et les permissions Graph."
                        } else {
                            ""
                        }
                    }
                    "invalid_client" => {
                        if oauth_provider == "microsoft" {
                            " Vérifiez le Client ID Azure (application de bureau / comptes personnels)."
                        } else {
                            " Vérifiez le Client ID (Application de bureau)."
                        }
                    }
                    _ => "",
                };
                if desc.is_empty() {
                    format!("Échange du code OAuth: {code}{hint}")
                } else {
                    format!("Échange du code OAuth: {code} — {desc}{hint}")
                }
            }
            RequestTokenError::Request(err) => format!("Échange du code OAuth (réseau): {err}"),
            RequestTokenError::Parse(err, raw) => format!(
                "Échange du code OAuth (réponse illisible): {err} — {}",
                String::from_utf8_lossy(raw)
            ),
            RequestTokenError::Other(msg) => format!("Échange du code OAuth: {msg}"),
        })?;

    let access_token = token.access_token().secret().clone();
    let refresh_token = token.refresh_token().map(|t| t.secret().clone());
    let expires_at = token
        .expires_in()
        .map(|d| EmailOAuthStore::now_unix() + d.as_secs() as i64)
        .unwrap_or(EmailOAuthStore::now_unix() + 3500);

    let email = fetch_user_email(oauth_provider, &access_token)?;

    let connection = EmailOAuthConnection {
        provider: oauth_provider.to_string(),
        email,
        access_token,
        refresh_token,
        expires_at,
    };

    if calendar_only {
        store.google_calendar_connection = Some(connection.clone());
    } else if onedrive_only {
        store.microsoft_onedrive_connection = Some(connection.clone());
    } else {
        store.connection = Some(connection.clone());
    }
    store.save(app)?;

    Ok(connection)
}

pub fn disconnect_oauth(app: &AppHandle) -> Result<(), String> {
    crate::email::google_contacts::clear_session_index();
    let mut store = EmailOAuthStore::load(app)?;
    store.connection = None;
    store.save(app)
}

pub fn disconnect_google_calendar_oauth(app: &AppHandle) -> Result<(), String> {
    let mut store = EmailOAuthStore::load(app)?;
    store.google_calendar_connection = None;
    store.save(app)
}

pub fn disconnect_microsoft_onedrive_oauth(app: &AppHandle) -> Result<(), String> {
    let mut store = EmailOAuthStore::load(app)?;
    store.microsoft_onedrive_connection = None;
    store.save(app)
}

#[cfg(test)]
mod tests {
    use super::escape_html_text;

    #[test]
    fn oauth_error_text_is_escaped_before_html_rendering() {
        assert_eq!(
            escape_html_text(r#"<script>alert("x")</script> & 'test'"#),
            "&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt; &amp; &#39;test&#39;"
        );
    }
}
