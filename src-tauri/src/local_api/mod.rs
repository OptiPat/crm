//! API HTTP locale (lecture seule) pour n8n — anniversaires du jour.

mod config;
mod commands;

use crate::database::Database;
use config::{LocalApiConfig, LocalApiSettings};
use std::io::Result as IoResult;
use std::sync::atomic::{AtomicBool, AtomicU16, Ordering};
use std::sync::Mutex;
use std::thread::{self, JoinHandle};
use tauri::{AppHandle, Manager};
use tiny_http::{Header, Method, Request, Response, Server, StatusCode};

static SERVER_RUNNING: AtomicBool = AtomicBool::new(false);
static SERVER_PORT: AtomicU16 = AtomicU16::new(0);
static SERVER_HANDLE: Mutex<Option<JoinHandle<()>>> = Mutex::new(None);

pub use commands::{get_local_api_settings_cmd, regenerate_local_api_token_cmd, save_local_api_settings_cmd};

pub fn start_for_app(app: &AppHandle, db: &Database) -> Result<(), String> {
    stop();

    let settings = LocalApiSettings::load(db)?;
    if !settings.enabled {
        return Ok(());
    }

    let db_path = app
        .path()
        .app_data_dir()
        .map_err(|e| e.to_string())?
        .join("patrimoine-crm.db");
    if !db_path.exists() {
        return Err("Base de données introuvable.".to_string());
    }

    let config = LocalApiConfig {
        db_path,
        token: settings.token,
        port: settings.port,
    };

    let handle = thread::Builder::new()
        .name("local-api-n8n".into())
        .spawn(move || run_server(config))
        .map_err(|e| format!("Impossible de démarrer l'API locale : {e}"))?;

    if let Ok(mut guard) = SERVER_HANDLE.lock() {
        *guard = Some(handle);
    }
    Ok(())
}

pub fn stop() {
    SERVER_RUNNING.store(false, Ordering::SeqCst);
    let port = SERVER_PORT.load(Ordering::SeqCst);
    if port > 0 {
        // Débloque incoming_requests() (sinon join() peut attendre indéfiniment).
        let _ = std::net::TcpStream::connect(format!("127.0.0.1:{port}"));
    }
    if let Ok(mut guard) = SERVER_HANDLE.lock() {
        if let Some(handle) = guard.take() {
            let _ = handle.join();
        }
    }
    SERVER_PORT.store(0, Ordering::SeqCst);
}

pub fn restart_for_app(app: &AppHandle, db: &Database) -> Result<(), String> {
    start_for_app(app, db)
}

fn run_server(config: LocalApiConfig) {
    SERVER_PORT.store(config.port, Ordering::SeqCst);
    // 0.0.0.0 : n8n Docker (host.docker.internal) n'atteint pas toujours 127.0.0.1 sur Windows.
    // Acces protege par token Bearer ; lecture seule.
    let addr = format!("0.0.0.0:{}", config.port);
    let server = match Server::http(&addr) {
        Ok(s) => s,
        Err(e) => {
            eprintln!("❌ API locale n8n : écoute {addr} impossible : {e}");
            return;
        }
    };

    SERVER_RUNNING.store(true, Ordering::SeqCst);
    println!(
        "✅ API locale n8n sur http://127.0.0.1:{} (n8n Docker : host.docker.internal:{})",
        config.port, config.port
    );

    for request in server.incoming_requests() {
        if !SERVER_RUNNING.load(Ordering::SeqCst) {
            break;
        }
        let cfg = config.clone();
        thread::spawn(move || {
            let _ = handle_request(request, &cfg);
        });
    }
}

fn handle_request(request: Request, config: &LocalApiConfig) -> IoResult<()> {
    if request.method() == &Method::Options {
        let response = Response::empty(StatusCode(204))
            .with_header(Header::from_bytes("Access-Control-Allow-Origin", "*").unwrap())
            .with_header(
                Header::from_bytes("Access-Control-Allow-Headers", "Authorization, Content-Type")
                    .unwrap(),
            );
        return request.respond(response);
    }

    if !authorize(&request, &config.token) {
        return json_response(
            request,
            StatusCode(401),
            r#"{"error":"Unauthorized"}"#,
        );
    }

    match (request.method(), request.url()) {
        (&Method::Get, "/api/health") => {
            json_response(request, StatusCode(200), r#"{"status":"ok"}"#)
        }
        (&Method::Get, "/api/birthdays/today") => handle_birthdays_today(request, config),
        _ => json_response(request, StatusCode(404), r#"{"error":"Not found"}"#),
    }
}

fn handle_birthdays_today(
    request: Request,
    config: &LocalApiConfig,
) -> IoResult<()> {
    use rusqlite::{Connection, OpenFlags};

    let conn = match Connection::open_with_flags(&config.db_path, OpenFlags::SQLITE_OPEN_READ_ONLY)
    {
        Ok(c) => c,
        Err(e) => {
            return json_response(
                request,
                StatusCode(500),
                &format!(r#"{{"error":"{e}"}}"#),
            );
        }
    };

    let payload = match crate::database::birthdays::list_birthdays_today_from_connection(&conn) {
        Ok(contacts) => {
            let date = chrono::Local::now().format("%Y-%m-%d").to_string();
            let count = contacts.len();
            serde_json::json!({
                "date": date,
                "count": count,
                "contacts": contacts,
            })
        }
        Err(e) => {
            return json_response(
                request,
                StatusCode(500),
                &format!(r#"{{"error":"{e}"}}"#),
            );
        }
    };

    let body = match serde_json::to_string(&payload) {
        Ok(s) => s,
        Err(e) => {
            return json_response(
                request,
                StatusCode(500),
                &format!(r#"{{"error":"{e}"}}"#),
            );
        }
    };
    json_response(request, StatusCode(200), &body)
}

fn authorize(request: &Request, expected_token: &str) -> bool {
    let Some(auth) = request.headers().iter().find(|h| h.field.equiv("Authorization")) else {
        return false;
    };
    let value = auth.value.as_str();
    let Some(token) = value.strip_prefix("Bearer ") else {
        return false;
    };
    token.trim() == expected_token
}

fn json_response(
    request: Request,
    status: StatusCode,
    body: &str,
) -> IoResult<()> {
    let response = Response::from_string(body.to_string())
        .with_status_code(status)
        .with_header(
            Header::from_bytes("Content-Type", "application/json; charset=utf-8").unwrap(),
        )
        .with_header(Header::from_bytes("Access-Control-Allow-Origin", "*").unwrap());
    request.respond(response)
}
