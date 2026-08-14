//! Favori d'extranet par placement — données du client, jamais du CRM.
//!
//! Table locale + overlay à la lecture. Aucun endpoint dans `sync_auth`.

use rusqlite::{params, Result};

#[derive(Debug, Clone)]
pub struct ExtranetBookmarkRow {
    pub contact_id: i64,
    pub investissement_id: i64,
    pub url: String,
    pub type_produit: String,
    pub nom_produit_norm: String,
}

impl super::db::PortalDb {
    pub fn migrate_extranet_bookmarks(&self) -> Result<()> {
        self.conn().execute_batch(
            "CREATE TABLE IF NOT EXISTS espace_investissement_extranet (
                contact_id INTEGER NOT NULL,
                investissement_id INTEGER NOT NULL,
                url TEXT NOT NULL,
                type_produit TEXT NOT NULL DEFAULT '',
                nom_produit_norm TEXT NOT NULL DEFAULT '',
                updated_at INTEGER NOT NULL DEFAULT (unixepoch()),
                PRIMARY KEY (contact_id, investissement_id)
            );",
        )?;
        Ok(())
    }

    pub fn upsert_extranet_bookmark(
        &self,
        contact_id: i64,
        investissement_id: i64,
        url: &str,
        type_produit: &str,
        nom_produit_norm: &str,
    ) -> Result<()> {
        self.migrate_extranet_bookmarks()?;
        self.conn().execute(
            "INSERT INTO espace_investissement_extranet
                (contact_id, investissement_id, url, type_produit, nom_produit_norm, updated_at)
             VALUES (?1, ?2, ?3, ?4, ?5, unixepoch())
             ON CONFLICT(contact_id, investissement_id) DO UPDATE SET
                url = excluded.url,
                type_produit = excluded.type_produit,
                nom_produit_norm = excluded.nom_produit_norm,
                updated_at = unixepoch()",
            params![
                contact_id,
                investissement_id,
                url,
                type_produit,
                nom_produit_norm
            ],
        )?;
        Ok(())
    }

    pub fn delete_extranet_bookmark(
        &self,
        contact_id: i64,
        investissement_id: i64,
    ) -> Result<()> {
        self.migrate_extranet_bookmarks()?;
        self.conn().execute(
            "DELETE FROM espace_investissement_extranet
             WHERE contact_id = ?1 AND investissement_id = ?2",
            params![contact_id, investissement_id],
        )?;
        Ok(())
    }

    pub fn list_extranet_bookmarks(
        &self,
        contact_id: i64,
    ) -> Result<Vec<ExtranetBookmarkRow>> {
        self.migrate_extranet_bookmarks()?;
        let conn = self.conn();
        let mut stmt = conn.prepare(
            "SELECT contact_id, investissement_id, url, type_produit, nom_produit_norm
             FROM espace_investissement_extranet
             WHERE contact_id = ?1",
        )?;
        let rows = stmt.query_map(params![contact_id], |row| {
            Ok(ExtranetBookmarkRow {
                contact_id: row.get(0)?,
                investissement_id: row.get(1)?,
                url: row.get(2)?,
                type_produit: row.get(3)?,
                nom_produit_norm: row.get(4)?,
            })
        })?;
        rows.collect()
    }

    /// Après import CRM : l'id overlay négatif devient l'id positif du snapshot.
    pub fn rematch_extranet_bookmark(
        &self,
        contact_id: i64,
        from_id: i64,
        to_id: i64,
    ) -> Result<()> {
        if from_id == to_id {
            return Ok(());
        }
        self.migrate_extranet_bookmarks()?;
        let conn = self.conn();
        let dest_exists: i64 = conn.query_row(
            "SELECT COUNT(*) FROM espace_investissement_extranet
             WHERE contact_id = ?1 AND investissement_id = ?2",
            params![contact_id, to_id],
            |row| row.get(0),
        )?;
        if dest_exists > 0 {
            conn.execute(
                "DELETE FROM espace_investissement_extranet
                 WHERE contact_id = ?1 AND investissement_id = ?2",
                params![contact_id, from_id],
            )?;
            return Ok(());
        }
        conn.execute(
            "UPDATE espace_investissement_extranet
             SET investissement_id = ?3
             WHERE contact_id = ?1 AND investissement_id = ?2",
            params![contact_id, from_id, to_id],
        )?;
        Ok(())
    }
}
