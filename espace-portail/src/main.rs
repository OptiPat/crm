mod auth;
mod auth_store;
mod client_auth;
mod secrets;
mod db;
mod demande_store;
mod demande_reminder;
mod depot_crypto;
mod document_scan;
mod evenement_store;
mod documents;
mod file_sniff;
mod login_code;
mod mailer;
mod portal_branding;
mod privacy_config;
mod purge;
mod read;
mod security;
mod sync;
mod sync_auth;
mod scpi_declaration_store;
mod scpi_declarations;
mod avoir_catalogue;
mod avoir_declaration_store;
mod avoir_declarations;
mod avoir_retrait_store;

use std::net::SocketAddr;
use std::path::PathBuf;
use std::sync::Arc;

use axum::{
    extract::{DefaultBodyLimit, State},
    middleware,
    response::IntoResponse,
    routing::{get, post},
    Json, Router,
};
use tower_http::services::{ServeDir, ServeFile};
use tracing_subscriber::EnvFilter;

use crate::db::PortalDb;
use crate::portal_branding::PortalBrandingConfig;
use crate::privacy_config::PortalPrivacyConfig;
use crate::document_scan::require_clamd_available;
use crate::mailer::{Mailer, MailerConfig};
use crate::security::{parse_bool_env, IpRateLimiter, SecurityConfig};

const MAX_UPLOAD_BYTES: usize = 10 * 1024 * 1024;

#[derive(Clone)]
pub struct AppState {
    pub db: Arc<PortalDb>,
    pub sync_secret: String,
    /// Empreintes OTP et sessions — distinct de `sync_secret` en production.
    pub auth_secret: String,
    /// Mode développement : expose GET /api/v1/patrimoine/{id} sans auth client.
    pub dev_mode: bool,
    pub cookie_secure: bool,
    pub production: bool,
    pub data_dir: PathBuf,
    pub advisor_email: String,
    /// Envoi des codes de connexion. `None` = non configuré : acceptable en
    /// développement, bloquant en production (voir `reject_unusable_mailer`).
    pub mailer: Option<Mailer>,
    pub privacy: PortalPrivacyConfig,
    pub branding: PortalBrandingConfig,
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

/// Les pièces déposées par les clients ne doivent pas atterrir « quelque part »
/// : un chemin relatif dépend du répertoire de travail du service, que personne
/// ne vérifie. En production, l'emplacement est explicite et absolu.
fn resolve_data_dir(raw: Option<&str>, production: bool) -> Result<PathBuf, String> {
    let configured = raw.map(str::trim).filter(|value| !value.is_empty());

    match configured {
        Some(value) => {
            let path = PathBuf::from(value);
            // `is_absolute` dépend de la plateforme : un chemin Unix n'est pas
            // absolu pour Windows, où tournent les tests. La cible étant Linux,
            // on reconnaît explicitement la racine `/`.
            let absolute = path.is_absolute() || value.starts_with('/');
            if production && !absolute {
                return Err(format!(
                    "ESPACE_PORTAL_DATA doit être un chemin absolu en production (reçu « {value} »)."
                ));
            }
            Ok(path)
        }
        None if production => Err(
            "ESPACE_PORTAL_DATA est requis en production : sans lui, les pièces déposées \
             se retrouveraient dans le répertoire de travail du service."
                .into(),
        ),
        None => Ok(PathBuf::from("data")),
    }
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
    let auth_secret = secrets::load_auth_secret(&sync_secret, production);
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
    if let Err(message) = require_clamd_available(production) {
        panic!("{message}");
    }

    let data_dir = resolve_data_dir(std::env::var("ESPACE_PORTAL_DATA").ok().as_deref(), production)
        .unwrap_or_else(|message| panic!("{message}"));
    std::fs::create_dir_all(&data_dir).expect("création répertoire données portail");
    let advisor_email = std::env::var("ESPACE_ADVISOR_EMAIL").unwrap_or_default();

    let db = Arc::new(PortalDb::open(&db_path).expect("ouverture base portail"));
    let privacy = PortalPrivacyConfig::from_env();
    let branding = PortalBrandingConfig::from_env();

    let state = AppState {
        db,
        sync_secret,
        auth_secret,
        dev_mode,
        cookie_secure,
        production,
        data_dir,
        advisor_email,
        mailer,
        privacy,
        branding,
    };
    crate::demande_reminder::spawn_demande_reminder_loop(state.clone());

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
        .route(
            "/api/v1/sync/contact/{contact_id}/depots",
            get(sync_auth::get_depots),
        )
        .route(
            "/api/v1/sync/contact/{contact_id}/depots/{demande_id}/file",
            get(sync_auth::get_depot_file),
        )
        .route(
            "/api/v1/sync/contact/{contact_id}/depots/{demande_id}/ack",
            post(sync_auth::post_depot_ack),
        )
        .route(
            "/api/v1/sync/contact/{contact_id}/scpi-declarations",
            get(sync_auth::get_scpi_declarations),
        )
        .route(
            "/api/v1/sync/contact/{contact_id}/scpi-declarations/{declaration_id}/ack",
            post(sync_auth::post_scpi_declaration_ack),
        )
        .route(
            "/api/v1/scpi-declarations",
            post(scpi_declarations::post_scpi_declaration),
        )
        .route(
            "/api/v1/avoir-declarations",
            post(avoir_declarations::post_avoir_declaration),
        )
        .route(
            "/api/v1/avoir-declarations/retrait",
            post(avoir_declarations::post_avoir_retrait),
        )
        .route(
            "/api/v1/sync/contact/{contact_id}/avoir-declarations",
            get(sync_auth::get_avoir_declarations),
        )
        .route(
            "/api/v1/sync/contact/{contact_id}/avoir-declarations/{declaration_id}/ack",
            post(sync_auth::post_avoir_declaration_ack),
        )
        .route(
            "/api/v1/sync/contact/{contact_id}/avoir-retraits",
            get(sync_auth::get_avoir_retraits),
        )
        .route(
            "/api/v1/sync/contact/{contact_id}/avoir-retraits/{retrait_id}/ack",
            post(sync_auth::post_avoir_retrait_ack),
        )
        .route("/api/v1/demandes/me", get(documents::get_demandes_me))
        .route(
            "/api/v1/demandes/{demande_id}/upload",
            post(documents::post_demande_upload),
        )
        .layer(DefaultBodyLimit::max(MAX_UPLOAD_BYTES))
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
    Json(serde_json::json!({
        "devMode": state.dev_mode,
        "privacy": state.privacy,
        "branding": state.branding,
    }))
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
    fn production_requires_an_absolute_data_dir() {
        assert!(resolve_data_dir(None, false).is_ok());
        assert!(resolve_data_dir(Some("data"), false).is_ok());

        assert!(resolve_data_dir(None, true).is_err());
        assert!(resolve_data_dir(Some("  "), true).is_err());
        assert!(resolve_data_dir(Some("data"), true).is_err());
        assert!(resolve_data_dir(Some("/opt/espace-portail/data"), true).is_ok());
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
