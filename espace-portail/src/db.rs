use rusqlite::{params, Connection, Result};

pub struct PortalDb {
    conn: Connection,
}

impl PortalDb {
    pub fn open(path: &str) -> Result<Self> {
        let conn = Connection::open(path)?;
        let db = Self { conn };
        db.migrate()?;
        Ok(db)
    }

    fn migrate(&self) -> Result<()> {
        self.conn.execute_batch(
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
        let updated = self.conn.execute(
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
