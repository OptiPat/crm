use std::sync::{Mutex, MutexGuard};

use rusqlite::{params, Connection, Result};

/// `Connection` est `Send` mais pas `Sync` : le `Mutex` rend `PortalDb`
/// partageable dans l'état Axum, qui doit être `Send + Sync`.
pub struct PortalDb {
    conn: Mutex<Connection>,
}

impl PortalDb {
    pub fn open(path: &str) -> Result<Self> {
        let conn = Connection::open(path)?;
        let db = Self {
            conn: Mutex::new(conn),
        };
        db.migrate()?;
        Ok(db)
    }

    /// Un verrou empoisonné signale un panic passé, pas une base corrompue :
    /// la connexion reste exploitable.
    fn conn(&self) -> MutexGuard<'_, Connection> {
        self.conn.lock().unwrap_or_else(|e| e.into_inner())
    }

    fn migrate(&self) -> Result<()> {
        self.conn().execute_batch(
            "CREATE TABLE IF NOT EXISTS contact_snapshot (
                contact_id INTEGER PRIMARY KEY,
                sequence INTEGER NOT NULL,
                payload_json TEXT NOT NULL,
                synced_at INTEGER NOT NULL DEFAULT (unixepoch())
            );",
        )?;
        Ok(())
    }

    pub fn upsert_contact_snapshot(
        &self,
        contact_id: i64,
        sequence: i64,
        payload_json: &str,
    ) -> Result<bool> {
        let updated = self.conn().execute(
            "INSERT INTO contact_snapshot (contact_id, sequence, payload_json, synced_at)
             VALUES (?1, ?2, ?3, unixepoch())
             ON CONFLICT(contact_id) DO UPDATE SET
                sequence = excluded.sequence,
                payload_json = excluded.payload_json,
                synced_at = unixepoch()
             WHERE excluded.sequence >= contact_snapshot.sequence",
            params![contact_id, sequence, payload_json],
        )?;
        Ok(updated > 0)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn ignores_stale_sequence() {
        let db = PortalDb::open(":memory:").unwrap();
        assert!(db
            .upsert_contact_snapshot(1, 10, r#"{"v":1}"#)
            .unwrap());
        assert!(!db
            .upsert_contact_snapshot(1, 9, r#"{"v":2}"#)
            .unwrap());
        assert!(db
            .upsert_contact_snapshot(1, 11, r#"{"v":3}"#)
            .unwrap());
    }
}
