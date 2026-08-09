mod auth;
mod db;
mod read;
mod sync;

use std::net::SocketAddr;
use std::path::PathBuf;
use std::sync::Arc;

use axum::{
    routing::{get, post},
    Router,
};
use tower_http::services::{ServeDir, ServeFile};
use tracing_subscriber::EnvFilter;

use crate::db::PortalDb;

#[derive(Clone)]
pub struct AppState {
    pub db: Arc<PortalDb>,
    pub sync_secret: String,
    /// Mode développement : expose GET /api/v1/patrimoine/{id} sans auth client.
    pub dev_mode: bool,
}

fn static_dir() -> PathBuf {
    std::env::var("ESPACE_PORTAL_STATIC")
        .map(PathBuf::from)
        .unwrap_or_else(|_| PathBuf::from("web/dist"))
}

/// Le mode développement expose la lecture patrimoine sans authentification
/// client : il doit être demandé explicitement, jamais actif par défaut.
fn parse_dev_mode(raw: Option<&str>) -> bool {
    matches!(
        raw.map(|v| v.trim().to_lowercase()).as_deref(),
        Some("1" | "true" | "oui" | "yes")
    )
}

/// Rend impossible la combinaison catastrophique « lecture sans auth » +
/// « écoute sur une adresse joignable ». Un avertissement ne suffit pas.
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

    let addr: SocketAddr = bind.parse().expect("ESPACE_PORTAL_BIND invalide");
    if let Err(message) = reject_unsafe_dev_exposure(dev_mode, &addr) {
        panic!("{message}");
    }

    let db = Arc::new(PortalDb::open(&db_path).expect("ouverture base portail"));
    let state = AppState {
        db,
        sync_secret,
        dev_mode,
    };

    let static_root = static_dir();
    let index_path = static_root.join("index.html");
    let serve_ui = ServeDir::new(&static_root)
        .append_index_html_on_directories(true)
        .not_found_service(ServeFile::new(index_path));

    let api = Router::new()
        .route("/health", get(health))
        .route(
            "/api/v1/sync/contact/{contact_id}",
            post(sync::receive_contact_snapshot),
        )
        .route(
            "/api/v1/patrimoine/{contact_id}",
            get(read::get_patrimoine),
        )
        .with_state(state);

    let app = Router::new().merge(api).fallback_service(serve_ui);

    if dev_mode {
        tracing::warn!("ESPACE_PORTAL_DEV actif — lecture patrimoine sans auth client");
    }
    tracing::info!("Portail espace client sur http://{addr}");
    let listener = tokio::net::TcpListener::bind(addr)
        .await
        .expect("bind");
    axum::serve(listener, app).await.expect("serveur");
}

async fn health() -> &'static str {
    "ok"
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
    fn dev_mode_is_refused_on_a_reachable_address() {
        let loopback: SocketAddr = "127.0.0.1:8787".parse().unwrap();
        let public: SocketAddr = "0.0.0.0:8787".parse().unwrap();

        assert!(reject_unsafe_dev_exposure(true, &loopback).is_ok());
        assert!(reject_unsafe_dev_exposure(false, &public).is_ok());
        assert!(reject_unsafe_dev_exposure(true, &public).is_err());
    }
}
