mod auth;
mod auth_store;
mod client_auth;
mod db;
mod document_scan; // Phase 2 — dépôt documents (ClamAV)
mod login_code;
mod mailer;
mod read;
mod security;
mod sync;
mod sync_auth;

use std::net::SocketAddr;
use std::path::PathBuf;
use std::sync::Arc;

use axum::{
    extract::State,
    middleware,
    response::IntoResponse,
    routing::{get, post},
    Json, Router,
};
use tower_http::services::{ServeDir, ServeFile};
use tracing_subscriber::EnvFilter;

use crate::db::PortalDb;
use crate::mailer::{Mailer, MailerConfig};
use crate::security::{parse_bool_env, IpRateLimiter, SecurityConfig};

#[derive(Clone)]
pub struct AppState {
    pub db: Arc<PortalDb>,
    pub sync_secret: String,
    /// Mode développement : expose GET /api/v1/patrimoine/{id} sans auth client.
    pub dev_mode: bool,
    pub cookie_secure: bool,
    /// Envoi des codes de connexion. `None` = non configuré : acceptable en
    /// développement, bloquant en production (voir `reject_unusable_mailer`).
    pub mailer: Option<Mailer>,
}

fn static_dir() -> PathBuf {
    std::env::var("ESPACE_PORTAL_STATIC")
        .map(PathBuf::from)
        .unwrap_or_else(|_| PathBuf::from("web/dist"))
}

fn parse_dev_mode(raw: Option<&str>) -> bool {
    matches!(
        raw.map(|v| v.trim().to_lowercase()).as_deref(),
        Some("1" | "true" | "oui" | "yes")
    )
}

fn parse_cookie_secure(raw: Option<&str>, addr: &SocketAddr) -> bool {
    if let Some(value) = raw {
        return matches!(
            value.trim().to_lowercase().as_str(),
            "1" | "true" | "oui" | "yes"
        );
    }
    !addr.ip().is_loopback()
}

/// Sans envoi configuré, aucun client ne peut jamais se connecter : autant le
/// découvrir au démarrage plutôt qu'au premier appel d'un client bloqué.
fn reject_unusable_mailer(mailer: &Option<Mailer>, dev_mode: bool) -> Result<(), String> {
    if mailer.is_none() && !dev_mode {
        return Err("ESPACE_BREVO_API_KEY et ESPACE_MAIL_FROM sont requis : sans eux, \
                    aucun code de connexion ne peut partir et l'espace est inutilisable."
            .into());
    }
    Ok(())
}

fn reject_unsafe_dev_exposure(dev_mode: bool, addr: &SocketAddr) -> Result<(), String> {
    if dev_mode && !addr.ip().is_loopback() {
        return Err(format!(
            "ESPACE_PORTAL_DEV expose le patrimoine sans authentification : \
             interdit sur {addr}, uniquement sur une adresse de boucle locale."
        ));
    }
    Ok(())
}

#[tokio::main]
async fn main() {
    tracing_subscriber::fmt()
        .with_env_filter(
            EnvFilter::from_default_env().add_directive("espace_portail=info".parse().unwrap()),
        )
        .init();

    let bind = std::env::var("ESPACE_PORTAL_BIND").unwrap_or_else(|_| "127.0.0.1:8787".into());
    let db_path =
        std::env::var("ESPACE_PORTAL_DB").unwrap_or_else(|_| "espace-portail.db".into());
    let sync_secret = std::env::var("ESPACE_SYNC_SECRET")
        .expect("ESPACE_SYNC_SECRET requis (même valeur que dans le CRM)");
    let dev_mode = parse_dev_mode(std::env::var("ESPACE_PORTAL_DEV").ok().as_deref());

    let production = parse_bool_env(std::env::var("ESPACE_PRODUCTION").ok().as_deref());
    let trust_proxy = parse_bool_env(std::env::var("ESPACE_TRUST_PROXY").ok().as_deref())
        || production;

    let addr: SocketAddr = bind.parse().expect("ESPACE_PORTAL_BIND invalide");
    if production && !addr.ip().is_loopback() && !trust_proxy {
        panic!(
            "ESPACE_PRODUCTION exige ESPACE_TRUST_PROXY=1 lorsque le portail \
             écoute sur une adresse non locale (reverse proxy attendu)."
        );
    }
    if let Err(message) = reject_unsafe_dev_exposure(dev_mode, &addr) {
        panic!("{message}");
    }
    let cookie_secure = if production {
        true
    } else {
        parse_cookie_secure(
            std::env::var("ESPACE_PORTAL_COOKIE_SECURE").ok().as_deref(),
            &addr,
        )
    };

    let mailer = Mailer::from_config(MailerConfig::from_env());
    if let Err(message) = reject_unusable_mailer(&mailer, dev_mode) {
        panic!("{message}");
    }

    let db = Arc::new(PortalDb::open(&db_path).expect("ouverture base portail"));
    let state = AppState {
        db,
        sync_secret,
        dev_mode,
        cookie_secure,
        mailer,
    };

    let static_root = static_dir();
    let index_path = static_root.join("index.html");
    let serve_ui = ServeDir::new(&static_root)
        .append_index_html_on_directories(true)
        .not_found_service(ServeFile::new(index_path));

    let api = Router::new()
        .route("/health", get(health))
        .route("/api/v1/auth/request-code", post(client_auth::post_request_code))
        .route("/api/v1/auth/login", post(client_auth::post_login))
        .route("/api/v1/auth/logout", post(client_auth::post_logout))
        .route("/api/v1/auth/me", get(client_auth::get_me))
        .route("/api/v1/portal-config", get(portal_config))
        .route(
            "/api/v1/sync/contact/{contact_id}",
            post(sync::receive_contact_snapshot),
        )
        .route(
            "/api/v1/sync/contact/{contact_id}/revoke-acces",
            post(sync_auth::revoke_acces),
        )
        .route(
            "/api/v1/sync/contact/{contact_id}/connexions",
            get(sync_auth::get_connexions),
        )
        .route("/api/v1/patrimoine/me", get(read::get_patrimoine_me))
        .route(
            "/api/v1/patrimoine/{contact_id}",
            get(read::get_patrimoine_dev),
        )
        .with_state(state);

    let security_config = SecurityConfig {
        production,
        trust_proxy,
    };
    let rate_limiter = Arc::new(IpRateLimiter::default());

    let app = Router::new()
        .merge(api)
        .fallback_service(serve_ui)
        .layer(middleware::from_fn_with_state(
            security_config,
            security::security_headers_middleware,
        ))
        .layer(middleware::from_fn_with_state(
            (rate_limiter, security_config),
            security::rate_limit_middleware,
        ));

    if dev_mode {
        tracing::warn!("ESPACE_PORTAL_DEV actif — lecture patrimoine sans auth client");
    }
    tracing::info!("Portail espace client sur http://{addr}");
    let listener = tokio::net::TcpListener::bind(addr)
        .await
        .expect("bind");
    axum::serve(
        listener,
        app.into_make_service_with_connect_info::<SocketAddr>(),
    )
    .await
    .expect("serveur");
}

async fn health() -> &'static str {
    "ok"
}

async fn portal_config(State(state): State<AppState>) -> impl IntoResponse {
    Json(serde_json::json!({ "devMode": state.dev_mode }))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn dev_mode_is_off_unless_explicitly_requested() {
        assert!(!parse_dev_mode(None));
        assert!(!parse_dev_mode(Some("")));
        assert!(!parse_dev_mode(Some("0")));
        assert!(!parse_dev_mode(Some("non")));
        assert!(parse_dev_mode(Some("1")));
        assert!(parse_dev_mode(Some(" TRUE ")));
    }

    #[test]
    fn production_refuses_to_start_without_a_mailer() {
        assert!(reject_unusable_mailer(&None, true).is_ok());
        assert!(reject_unusable_mailer(&None, false).is_err());
    }

    #[test]
    fn dev_mode_is_refused_on_a_reachable_address() {
        let loopback: SocketAddr = "127.0.0.1:8787".parse().unwrap();
        let public: SocketAddr = "0.0.0.0:8787".parse().unwrap();

        assert!(reject_unsafe_dev_exposure(true, &loopback).is_ok());
        assert!(reject_unsafe_dev_exposure(false, &public).is_ok());
        assert!(reject_unsafe_dev_exposure(true, &public).is_err());
    }
}
