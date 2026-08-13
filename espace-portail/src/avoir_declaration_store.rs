use rusqlite::{params, OptionalExtension, Result};

#[derive(Debug, Clone)]
pub struct AvoirDeclarationRow {
    pub id: i64,
    pub contact_id: i64,
    pub panier: String,
    pub type_produit: String,
    pub nom_produit: String,
    pub valorisation_centimes: i64,
    pub date_souscription: Option<i64>,
    pub loyer_mensuel_centimes: Option<i64>,
    pub mensualite_credit_centimes: Option<i64>,
    pub date_fin_pret: Option<i64>,
    pub created_at: i64,
}

impl super::db::PortalDb {
    pub fn migrate_avoir_declarations(&self) -> Result<()> {
        self.conn().execute_batch(
            "CREATE TABLE IF NOT EXISTS espace_avoir_declaration (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                contact_id INTEGER NOT NULL,
                panier TEXT NOT NULL,
                type_produit TEXT NOT NULL,
                nom_produit TEXT NOT NULL,
                nom_produit_norm TEXT NOT NULL,
                valorisation_centimes INTEGER NOT NULL,
                date_souscription INTEGER,
                created_at INTEGER NOT NULL DEFAULT (unixepoch()),
                acked_at INTEGER
            );
            CREATE UNIQUE INDEX IF NOT EXISTS espace_avoir_declaration_pending_idx
                ON espace_avoir_declaration (contact_id, type_produit, nom_produit_norm)
                WHERE acked_at IS NULL;
            ",
        )?;
        for column_sql in [
            "ALTER TABLE espace_avoir_declaration ADD COLUMN loyer_mensuel_centimes INTEGER",
            "ALTER TABLE espace_avoir_declaration ADD COLUMN mensualite_credit_centimes INTEGER",
            "ALTER TABLE espace_avoir_declaration ADD COLUMN date_fin_pret INTEGER",
        ] {
            let _ = self.conn().execute(column_sql, []);
        }
        Ok(())
    }

    #[allow(clippy::too_many_arguments)]
    pub fn insert_avoir_declaration(
        &self,
        contact_id: i64,
        panier: &str,
        type_produit: &str,
        nom_produit: &str,
        nom_produit_norm: &str,
        valorisation_centimes: i64,
        date_souscription: Option<i64>,
        loyer_mensuel_centimes: Option<i64>,
        mensualite_credit_centimes: Option<i64>,
        date_fin_pret: Option<i64>,
    ) -> Result<i64> {
        let conn = self.conn();
        if let Some(existing) = conn
            .query_row(
                "SELECT id FROM espace_avoir_declaration
                 WHERE contact_id = ?1 AND type_produit = ?2 AND nom_produit_norm = ?3
                   AND acked_at IS NULL",
                params![contact_id, type_produit, nom_produit_norm],
                |row| row.get::<_, i64>(0),
            )
            .optional()?
        {
            conn.execute(
                "UPDATE espace_avoir_declaration
                 SET panier = ?1, nom_produit = ?2, valorisation_centimes = ?3,
                     date_souscription = ?4, loyer_mensuel_centimes = ?5,
                     mensualite_credit_centimes = ?6, date_fin_pret = ?7
                 WHERE id = ?8",
                params![
                    panier,
                    nom_produit,
                    valorisation_centimes,
                    date_souscription,
                    loyer_mensuel_centimes,
                    mensualite_credit_centimes,
                    date_fin_pret,
                    existing
                ],
            )?;
            return Ok(existing);
        }

        conn.execute(
            "INSERT INTO espace_avoir_declaration (
                contact_id, panier, type_produit, nom_produit, nom_produit_norm,
                valorisation_centimes, date_souscription, loyer_mensuel_centimes,
                mensualite_credit_centimes, date_fin_pret
             ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)",
            params![
                contact_id,
                panier,
                type_produit,
                nom_produit,
                nom_produit_norm,
                valorisation_centimes,
                date_souscription,
                loyer_mensuel_centimes,
                mensualite_credit_centimes,
                date_fin_pret
            ],
        )?;
        Ok(conn.last_insert_rowid())
    }

    pub fn list_avoir_declarations_for_contact(
        &self,
        contact_id: i64,
    ) -> Result<Vec<AvoirDeclarationRow>> {
        let conn = self.conn();
        let mut stmt = conn.prepare(
            "SELECT id, contact_id, panier, type_produit, nom_produit,
                    valorisation_centimes, date_souscription, created_at,
                    loyer_mensuel_centimes, mensualite_credit_centimes, date_fin_pret
             FROM espace_avoir_declaration
             WHERE contact_id = ?1 AND acked_at IS NULL
             ORDER BY created_at ASC, id ASC",
        )?;
        let rows = stmt.query_map(params![contact_id], |row| {
            Ok(AvoirDeclarationRow {
                id: row.get(0)?,
                contact_id: row.get(1)?,
                panier: row.get(2)?,
                type_produit: row.get(3)?,
                nom_produit: row.get(4)?,
                valorisation_centimes: row.get(5)?,
                date_souscription: row.get(6)?,
                created_at: row.get(7)?,
                loyer_mensuel_centimes: row.get(8)?,
                mensualite_credit_centimes: row.get(9)?,
                date_fin_pret: row.get(10)?,
            })
        })?;
        rows.collect()
    }

    pub fn ack_avoir_declaration(&self, contact_id: i64, declaration_id: i64) -> Result<bool> {
        let updated = self.conn().execute(
            "UPDATE espace_avoir_declaration
             SET acked_at = unixepoch()
             WHERE id = ?1 AND contact_id = ?2 AND acked_at IS NULL",
            params![declaration_id, contact_id],
        )?;
        Ok(updated > 0)
    }
}
