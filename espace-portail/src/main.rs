mod auth;
mod db;
mod sync;

use std::net::SocketAddr;
use std::sync::Arc;

use axum::{
    routing::{get, post},
    Router,
};
use tracing_subscriber::EnvFilter;

use crate::db::PortalDb;

#[derive(Clone)]
pub struct AppState {
    pub db: Arc<PortalDb>,
    pub sync_secret: String,
}

#[tokio::main]
async fn main() {
    tracing_subscriber::fmt()
        .with_env_filter(EnvFilter::from_default_env().add_directive("espace_portail=info".parse().unwrap()))
        .init();

    let bind = std::env::var("ESPACE_PORTAL_BIND").unwrap_or_else(|_| "127.0.0.1:8787".into());
    let db_path =
        std::env::var("ESPACE_PORTAL_DB").unwrap_or_else(|_| "espace-portail.db".into());
    let sync_secret = std::env::var("ESPACE_SYNC_SECRET")
        .expect("ESPACE_SYNC_SECRET requis (même valeur que dans le CRM)");

    let db = Arc::new(PortalDb::open(&db_path).expect("ouverture base portail"));
    let state = AppState {
        db,
        sync_secret,
    };

    let app = Router::new()
        .route("/health", get(health))
        .route(
            "/api/v1/sync/contact/{contact_id}",
            post(sync::receive_contact_snapshot),
        )
        .with_state(state);

    let addr: SocketAddr = bind.parse().expect("ESPACE_PORTAL_BIND invalide");
    tracing::info!("Portail espace client sur http://{addr}");
    let listener = tokio::net::TcpListener::bind(addr)
        .await
        .expect("bind");
    axum::serve(listener, app).await.expect("serveur");
}

async fn health() -> &'static str {
    "ok"
}
