use std::sync::{Mutex, MutexGuard};

use rusqlite::{params, Connection, OptionalExtension, Result};
use serde_json::Value;

/// Snapshot patrimoine reçu du CRM.
pub struct ContactSnapshotRow {
    pub contact_id: i64,
    pub sequence: i64,
    pub payload: Value,
    pub synced_at: i64,
}

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

    pub fn get_contact_snapshot(&self, contact_id: i64) -> Result<Option<ContactSnapshotRow>> {
        let row = self
            .conn()
            .query_row(
                "SELECT contact_id, sequence, payload_json, synced_at
                 FROM contact_snapshot
                 WHERE contact_id = ?1",
                params![contact_id],
                |row| {
                    let payload_json: String = row.get(2)?;
                    Ok(ContactSnapshotRow {
                        contact_id: row.get(0)?,
                        sequence: row.get(1)?,
                        payload: serde_json::from_str(&payload_json).unwrap_or(Value::Null),
                        synced_at: row.get(3)?,
                    })
                },
            )
            .optional()?;
        Ok(row)
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

    #[test]
    fn get_contact_snapshot_returns_latest_payload() {
        let db = PortalDb::open(":memory:").unwrap();
        db.upsert_contact_snapshot(42, 1, r#"{"contact":{"contactId":42}}"#)
            .unwrap();
        let row = db.get_contact_snapshot(42).unwrap().expect("snapshot");
        assert_eq!(row.contact_id, 42);
        assert_eq!(row.sequence, 1);
        assert_eq!(row.payload["contact"]["contactId"], 42);
    }
}
