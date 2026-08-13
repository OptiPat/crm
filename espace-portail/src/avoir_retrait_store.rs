use rusqlite::{params, OptionalExtension, Result};

#[derive(Debug, Clone)]
pub struct AvoirRetraitRow {
    pub id: i64,
    pub contact_id: i64,
    pub investissement_id: i64,
    pub type_produit: String,
    pub nom_produit: String,
    pub created_at: i64,
}

impl super::db::PortalDb {
    pub fn migrate_avoir_retraits(&self) -> Result<()> {
        self.conn().execute_batch(
            "CREATE TABLE IF NOT EXISTS espace_avoir_retrait (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                contact_id INTEGER NOT NULL,
                investissement_id INTEGER NOT NULL,
                type_produit TEXT NOT NULL,
                nom_produit TEXT NOT NULL,
                created_at INTEGER NOT NULL DEFAULT (unixepoch()),
                acked_at INTEGER
            );
            CREATE UNIQUE INDEX IF NOT EXISTS espace_avoir_retrait_pending_idx
                ON espace_avoir_retrait (contact_id, investissement_id)
                WHERE acked_at IS NULL;
            ",
        )?;
        Ok(())
    }

    /// `(id, created)` — `created = false` si un retrait pending existait déjà.
    pub fn insert_avoir_retrait(
        &self,
        contact_id: i64,
        investissement_id: i64,
        type_produit: &str,
        nom_produit: &str,
    ) -> Result<(i64, bool)> {
        let conn = self.conn();
        if let Some(existing) = conn
            .query_row(
                "SELECT id FROM espace_avoir_retrait
                 WHERE contact_id = ?1 AND investissement_id = ?2 AND acked_at IS NULL",
                params![contact_id, investissement_id],
                |row| row.get::<_, i64>(0),
            )
            .optional()?
        {
            return Ok((existing, false));
        }
        conn.execute(
            "INSERT INTO espace_avoir_retrait (
                contact_id, investissement_id, type_produit, nom_produit
             ) VALUES (?1, ?2, ?3, ?4)",
            params![contact_id, investissement_id, type_produit, nom_produit],
        )?;
        Ok((conn.last_insert_rowid(), true))
    }

    pub fn list_avoir_retraits_for_contact(
        &self,
        contact_id: i64,
    ) -> Result<Vec<AvoirRetraitRow>> {
        let conn = self.conn();
        let mut stmt = conn.prepare(
            "SELECT id, contact_id, investissement_id, type_produit, nom_produit, created_at
             FROM espace_avoir_retrait
             WHERE contact_id = ?1 AND acked_at IS NULL
             ORDER BY created_at ASC, id ASC",
        )?;
        let rows = stmt.query_map(params![contact_id], |row| {
            Ok(AvoirRetraitRow {
                id: row.get(0)?,
                contact_id: row.get(1)?,
                investissement_id: row.get(2)?,
                type_produit: row.get(3)?,
                nom_produit: row.get(4)?,
                created_at: row.get(5)?,
            })
        })?;
        rows.collect()
    }

    pub fn ack_avoir_retrait(&self, contact_id: i64, retrait_id: i64) -> Result<bool> {
        let updated = self.conn().execute(
            "UPDATE espace_avoir_retrait
             SET acked_at = unixepoch()
             WHERE id = ?1 AND contact_id = ?2 AND acked_at IS NULL",
            params![retrait_id, contact_id],
        )?;
        Ok(updated > 0)
    }
}

#[cfg(test)]
mod tests {
    use super::super::db::PortalDb;

    #[test]
    fn pending_retrait_is_idempotent() {
        let db = PortalDb::open(":memory:").unwrap();
        let (first, created) = db.insert_avoir_retrait(1, 42, "PER", "Swisslife").unwrap();
        let (second, again) = db.insert_avoir_retrait(1, 42, "PER", "Swisslife").unwrap();
        assert!(created);
        assert!(!again);
        assert_eq!(first, second);
        assert_eq!(db.list_avoir_retraits_for_contact(1).unwrap().len(), 1);
        assert!(db.ack_avoir_retrait(1, first).unwrap());
        assert!(db.list_avoir_retraits_for_contact(1).unwrap().is_empty());
    }
}
