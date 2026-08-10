use axum::{
    extract::{ConnectInfo, State},
    http::{header::SET_COOKIE, HeaderMap, StatusCode},
    response::IntoResponse,
    Json,
};
use serde::{Deserialize, Serialize};
use std::net::SocketAddr;

use crate::auth_store::LoginCodeOutcome;
use crate::AppState;

pub const SESSION_COOKIE: &str = "espace_session";
/// Durée de vie absolue d'un appareil reconnu : au-delà, nouveau code exigé.
/// 30 jours — assez long pour ne pas décourager la consultation, assez court
/// pour qu'un téléphone perdu ou revendu cesse d'être autorisé.
pub const SESSION_TTL_SECS: i64 = 30 * 24 * 3600;
/// Inactivité tolérée : protège le téléphone laissé déverrouillé sur une table.
pub const SESSION_IDLE_SECS: i64 = 30 * 60;

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LoginRequest {
    pub email: String,
    pub code: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AuthMeResponse {
    pub contact_id: i64,
    pub email: String,
    pub prenom: String,
    pub nom: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct LoginResponse {
    contact_id: i64,
    email: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RequestCodeRequest {
    pub email: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct RequestCodeResponse {
    message: String,
}

/// Réponse unique, quelle que soit l'issue : sans cela, comparer les réponses
/// révèle quelles adresses possèdent un espace client.
const REQUEST_CODE_MESSAGE: &str =
    "Si un espace existe pour cette adresse, un code vient d'être envoyé.";

/// Message unique renvoyé au client en cas d'échec de connexion, quelle qu'en
/// soit la cause — code faux, accès révoqué, ou panne interne.
pub const LOGIN_REFUSED: &str = "Email ou code incorrect.";

pub async fn post_request_code(
    State(state): State<AppState>,
    Json(body): Json<RequestCodeRequest>,
) -> impl IntoResponse {
    let email = body.email.trim().to_lowercase();
    if email.is_empty() || !email.contains('@') {
        return (
            StatusCode::BAD_REQUEST,
            Json(serde_json::json!({ "error": "Email invalide" })),
        )
            .into_response();
    }

    match state.db.prepare_login_code(&state.sync_secret, &email) {
        Ok(LoginCodeOutcome::Send { contact_id, code }) => {
            deliver_login_code(&state, &email, contact_id, &code).await;
        }
        Ok(LoginCodeOutcome::Skip(reason)) => {
            tracing::info!("Demande de code ignorée ({reason})");
        }
        Err(error) => {
            tracing::error!("Demande de code en échec : {error}");
        }
    }

    (
        StatusCode::OK,
        Json(RequestCodeResponse {
            message: REQUEST_CODE_MESSAGE.into(),
        }),
    )
        .into_response()
}

async fn deliver_login_code(state: &AppState, email: &str, contact_id: i64, code: &str) {
    let Some(mailer) = state.mailer.as_ref() else {
        if state.dev_mode {
            tracing::warn!("DEV — pas d'envoi configuré, code pour {email} : {code}");
        } else {
            tracing::error!(
                "Envoi impossible : ESPACE_BREVO_API_KEY / ESPACE_MAIL_FROM absents. \
                 Le client ne recevra jamais son code."
            );
        }
        return;
    };

    match mailer.send_login_code(email, code).await {
        Ok(()) => tracing::info!("Code de connexion envoyé (contact {contact_id})"),
        Err(error) => tracing::error!("Envoi du code impossible (contact {contact_id}) : {error}"),
    }
}

pub async fn post_login(
    State(state): State<AppState>,
    ConnectInfo(addr): ConnectInfo<SocketAddr>,
    headers: HeaderMap,
    Json(body): Json<LoginRequest>,
) -> impl IntoResponse {
    let email = body.email.trim().to_lowercase();
    let code = body.code.trim();
    if email.is_empty() || code.len() != 6 || !code.chars().all(|c| c.is_ascii_digit()) {
        return (
            StatusCode::BAD_REQUEST,
            Json(serde_json::json!({ "error": "Email ou code invalide" })),
        )
            .into_response();
    }

    let user_agent = headers
        .get("user-agent")
        .and_then(|v| v.to_str().ok())
        .map(str::to_string);
    let ip = Some(addr.ip().to_string());

    match state.db.try_login(
        &state.sync_secret,
        &email,
        code,
        ip.as_deref(),
        user_agent.as_deref(),
    ) {
        Ok(result) => {
            let cookie = session_cookie(&result.token, state.cookie_secure);
            let mut response = (
                StatusCode::OK,
                Json(LoginResponse {
                    contact_id: result.contact_id,
                    email: result.email,
                }),
            )
                .into_response();
            response
                .headers_mut()
                .insert(SET_COOKIE, cookie.parse().unwrap());
            response
        }
        Err(message) => {
            // Le detail interne reste dans les logs : une erreur technique
            // affichee au client fuite la structure de la base, et distinguer
            // les causes revient a confirmer l'existence d'un espace (R13).
            if message != LOGIN_REFUSED {
                tracing::error!("Connexion refusée ({message})");
            }
            (
                StatusCode::UNAUTHORIZED,
                Json(serde_json::json!({ "error": LOGIN_REFUSED })),
            )
                .into_response()
        }
    }
}

pub async fn post_logout(State(state): State<AppState>, headers: HeaderMap) -> impl IntoResponse {
    if let Some(token) = parse_session_cookie(&headers) {
        let _ = state.db.revoke_session(&token, &state.sync_secret);
    }
    let mut response = StatusCode::NO_CONTENT.into_response();
    response.headers_mut().insert(
        SET_COOKIE,
        clear_session_cookie(state.cookie_secure).parse().unwrap(),
    );
    response
}

pub async fn get_me(State(state): State<AppState>, headers: HeaderMap) -> impl IntoResponse {
    match resolve_session(&state, &headers) {
        Ok(contact_id) => match state.db.auth_me(contact_id) {
            Ok(Some(me)) => (StatusCode::OK, Json(me)).into_response(),
            Ok(None) => unauthorized(),
            Err(error) => (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(serde_json::json!({ "error": error.to_string() })),
            )
                .into_response(),
        },
        Err(response) => response,
    }
}

pub fn resolve_session(state: &AppState, headers: &HeaderMap) -> Result<i64, axum::response::Response> {
    let token = parse_session_cookie(headers).ok_or_else(unauthorized)?;
    state
        .db
        .contact_id_for_session(&token, &state.sync_secret)
        .map_err(|_| unauthorized_response())?
        .ok_or_else(unauthorized_response)
}

fn unauthorized() -> axum::response::Response {
    unauthorized_response()
}

fn unauthorized_response() -> axum::response::Response {
    (
        StatusCode::UNAUTHORIZED,
        Json(serde_json::json!({ "error": "Session requise" })),
    )
        .into_response()
}

pub fn parse_session_cookie(headers: &HeaderMap) -> Option<String> {
    let raw = headers.get("cookie")?.to_str().ok()?;
    for part in raw.split(';') {
        let (key, value) = part.trim().split_once('=')?;
        if key == SESSION_COOKIE {
            return Some(value.to_string());
        }
    }
    None
}

pub fn session_cookie(token: &str, secure: bool) -> String {
    let secure_flag = if secure { "; Secure" } else { "" };
    format!(
        "{SESSION_COOKIE}={token}; HttpOnly; Path=/; Max-Age={SESSION_TTL_SECS}; SameSite=Lax{secure_flag}"
    )
}

fn clear_session_cookie(secure: bool) -> String {
    let secure_flag = if secure { "; Secure" } else { "" };
    format!(
        "{SESSION_COOKIE}=; HttpOnly; Path=/; Max-Age=0; SameSite=Lax{secure_flag}"
    )
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_session_cookie() {
        let mut headers = HeaderMap::new();
        headers.insert(
            "cookie",
            "foo=bar; espace_session=abc123; other=1".parse().unwrap(),
        );
        assert_eq!(parse_session_cookie(&headers).as_deref(), Some("abc123"));
    }
}
