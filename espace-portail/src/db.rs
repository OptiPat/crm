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
    pub(crate) fn conn(&self) -> MutexGuard<'_, Connection> {
        self.conn.lock().unwrap_or_else(|e| e.into_inner())
    }

    fn migrate(&self) -> Result<()> {
        self.conn().execute_batch(
            "CREATE TABLE IF NOT EXISTS contact_snapshot (
                contact_id INTEGER PRIMARY KEY,
                sequence INTEGER NOT NULL,
                payload_json TEXT NOT NULL,
                synced_at INTEGER NOT NULL DEFAULT (unixepoch())
            );
            CREATE TABLE IF NOT EXISTS espace_acces (
                contact_id INTEGER PRIMARY KEY,
                statut TEXT NOT NULL,
                email TEXT NOT NULL DEFAULT '',
                activation_code_hash TEXT,
                premiere_connexion_at INTEGER,
                updated_at INTEGER NOT NULL DEFAULT (unixepoch())
            );
            CREATE TABLE IF NOT EXISTS espace_session (
                token_hash TEXT PRIMARY KEY,
                contact_id INTEGER NOT NULL,
                expires_at INTEGER NOT NULL,
                last_seen_at INTEGER NOT NULL DEFAULT 0,
                created_at INTEGER NOT NULL DEFAULT (unixepoch())
            );
            CREATE TABLE IF NOT EXISTS espace_login_code (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                contact_id INTEGER NOT NULL,
                code_hash TEXT NOT NULL,
                expires_at INTEGER NOT NULL,
                used_at INTEGER,
                created_at INTEGER NOT NULL DEFAULT (unixepoch())
            );
            CREATE TABLE IF NOT EXISTS espace_connexion_log (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                contact_id INTEGER NOT NULL,
                event TEXT NOT NULL,
                detail TEXT,
                ip TEXT,
                user_agent TEXT,
                created_at INTEGER NOT NULL DEFAULT (unixepoch())
            );
            CREATE TABLE IF NOT EXISTS espace_login_guard (
                email TEXT PRIMARY KEY,
                failures INTEGER NOT NULL DEFAULT 0,
                blocked_until INTEGER,
                updated_at INTEGER NOT NULL DEFAULT (unixepoch())
            );
            CREATE TABLE IF NOT EXISTS espace_trusted_device (
                contact_id INTEGER NOT NULL,
                device_hash TEXT NOT NULL,
                first_seen_at INTEGER NOT NULL DEFAULT (unixepoch()),
                last_seen_at INTEGER NOT NULL DEFAULT (unixepoch()),
                PRIMARY KEY (contact_id, device_hash)
            );
            ",
        )?;

        // Le portail envoie lui-même les codes : plus de file d'attente, et
        // surtout plus de code de connexion stocké en clair sur le serveur.
        self.conn()
            .execute_batch("DROP TABLE IF EXISTS espace_email_outbox;")?;

        self.conn().execute_batch(
            "CREATE TABLE IF NOT EXISTS espace_portal_config (
                cle TEXT PRIMARY KEY,
                valeur TEXT NOT NULL,
                updated_at INTEGER NOT NULL DEFAULT (unixepoch())
            );",
        )?;

        // Bases créées avant l'expiration d'inactivité.
        if !self.has_column("espace_session", "last_seen_at")? {
            self.conn().execute_batch(
                "ALTER TABLE espace_session ADD COLUMN last_seen_at INTEGER NOT NULL DEFAULT 0;",
            )?;
        }
        self.migrate_scpi_declarations()?;
        Ok(())
    }

    /// Clé publique du CRM, transmise par la synchronisation. Le portail s'en
    /// sert pour sceller les dépôts et ne détient jamais la clé privée.
    pub fn set_depot_public_key(&self, hex_key: &str) -> Result<()> {
        self.conn().execute(
            "INSERT INTO espace_portal_config (cle, valeur, updated_at)
             VALUES ('depot_public_key', ?1, unixepoch())
             ON CONFLICT(cle) DO UPDATE SET valeur = excluded.valeur, updated_at = unixepoch()",
            params![hex_key],
        )?;
        Ok(())
    }

    pub fn depot_public_key(&self) -> Result<Option<String>> {
        let value: Option<String> = self
            .conn()
            .query_row(
                "SELECT valeur FROM espace_portal_config WHERE cle = 'depot_public_key'",
                [],
                |row| row.get(0),
            )
            .optional()?;
        Ok(value.filter(|v| !v.trim().is_empty()))
    }

    pub(crate) fn has_column(&self, table: &str, column: &str) -> Result<bool> {
        let conn = self.conn();
        let mut stmt = conn.prepare(&format!("PRAGMA table_info(\"{table}\")"))?;
        let mut rows = stmt.query([])?;
        while let Some(row) = rows.next()? {
            if row.get::<_, String>(1)? == column {
                return Ok(true);
            }
        }
        Ok(false)
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
        if updated > 0 {
            if let Ok(value) = serde_json::from_str::<serde_json::Value>(payload_json) {
                if let Some(acces) = value.get("acces") {
                    let statut = acces
                        .get("statut")
                        .and_then(|v| v.as_str())
                        .unwrap_or("inactif");
                    let email = acces.get("emailUtilise").and_then(|v| v.as_str());
                    let activation_code_hash =
                        acces.get("activationCodeHash").and_then(|v| v.as_str());
                    let premiere_connexion_at =
                        acces.get("premiereConnexionAt").and_then(|v| v.as_i64());
                    self.upsert_acces_from_sync(
                        contact_id,
                        statut,
                        email,
                        activation_code_hash,
                        premiere_connexion_at,
                    )?;
                }
            }
        }
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
