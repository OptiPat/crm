use crate::database::Database;
use rusqlite::hooks::{AuthAction, AuthContext, Authorization};
use rusqlite::Connection;
use std::sync::atomic::{AtomicBool, Ordering};

static WRITE_ALLOWED: AtomicBool = AtomicBool::new(true);
static WORKSPACE_WRITE_ALLOWED: AtomicBool = AtomicBool::new(true);
static BYPASS_AUTHORIZER: AtomicBool = AtomicBool::new(false);

pub fn is_write_allowed(db: &Database) -> bool {
    match super::load_state_for_gate(db) {
        Ok(None) => false,
        Ok(Some(mut state)) => {
            if !super::keys::verify_state_integrity(&state) {
                return false;
            }
            let now = chrono::Utc::now().timestamp();
            state.refresh_validity(now);
            state.is_valid_at(now)
        }
        Err(_) => false,
    }
}

pub fn refresh_write_gate(db: &Database) {
    WRITE_ALLOWED.store(is_write_allowed(db), Ordering::SeqCst);
}

pub fn set_workspace_write_allowed(allowed: bool) {
    WORKSPACE_WRITE_ALLOWED.store(allowed, Ordering::SeqCst);
}

pub fn bypass_authorizer<R>(f: impl FnOnce() -> R) -> R {
    BYPASS_AUTHORIZER.store(true, Ordering::SeqCst);
    let result = f();
    BYPASS_AUTHORIZER.store(false, Ordering::SeqCst);
    result
}

pub fn install_authorizer(conn: &Connection) {
    conn.authorizer(Some(license_authorizer));
}

fn license_authorizer(ctx: AuthContext<'_>) -> Authorization {
    if BYPASS_AUTHORIZER.load(Ordering::SeqCst) {
        return Authorization::Allow;
    }
    let table_name = match ctx.action {
        AuthAction::Insert { table_name } => table_name,
        AuthAction::Update { table_name, .. } => table_name,
        AuthAction::Delete { table_name } => table_name,
        _ => return Authorization::Allow,
    };
    if table_name == "settings" {
        Authorization::Allow
    } else if WRITE_ALLOWED.load(Ordering::SeqCst)
        && WORKSPACE_WRITE_ALLOWED.load(Ordering::SeqCst)
    {
        Authorization::Allow
    } else {
        Authorization::Deny
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use rusqlite::Connection;
    use std::process::Command;

    const CHILD_ENV: &str = "CRM_WORKSPACE_GATE_CHILD";

    #[test]
    fn revoked_team_identity_denies_crm_writes_at_sqlite_level() {
        if std::env::var_os(CHILD_ENV).is_none() {
            let status = Command::new(std::env::current_exe().unwrap())
                .args([
                    "--exact",
                    "licensing::gate::tests::revoked_team_identity_denies_crm_writes_at_sqlite_level",
                    "--nocapture",
                ])
                .env(CHILD_ENV, "1")
                .status()
                .unwrap();
            assert!(status.success());
            return;
        }

        let connection = Connection::open_in_memory().unwrap();
        connection
            .execute_batch(
                "CREATE TABLE contacts (id INTEGER PRIMARY KEY, nom TEXT);
                 CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT);",
            )
            .unwrap();
        WRITE_ALLOWED.store(true, Ordering::SeqCst);
        WORKSPACE_WRITE_ALLOWED.store(false, Ordering::SeqCst);
        install_authorizer(&connection);

        assert!(connection
            .execute("INSERT INTO contacts (nom) VALUES ('DUPONT')", [])
            .is_err());
        assert!(connection
            .execute("INSERT INTO settings (key, value) VALUES ('ui', 'ok')", [])
            .is_ok());
    }
}
