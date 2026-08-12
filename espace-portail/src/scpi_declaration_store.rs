use rusqlite::{params, OptionalExtension, Result};

#[derive(Debug, Clone)]
pub struct ScpiDeclarationRow {
    pub id: i64,
    pub contact_id: i64,
    pub investissement_id: i64,
    pub date_ts: i64,
    pub valorisation_centimes: i64,
    pub revenu_percu_centimes: Option<i64>,
    pub loyer_mensuel_centimes: Option<i64>,
    pub mensualite_credit_centimes: Option<i64>,
    pub date_fin_pret: Option<i64>,
    pub clear_date_fin_pret: bool,
    pub created_at: i64,
}

impl super::db::PortalDb {
    pub fn migrate_scpi_declarations(&self) -> Result<()> {
        self.conn().execute_batch(
            "CREATE TABLE IF NOT EXISTS espace_scpi_declaration (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                contact_id INTEGER NOT NULL,
                investissement_id INTEGER NOT NULL,
                date_ts INTEGER NOT NULL,
                valorisation_centimes INTEGER NOT NULL,
                revenu_percu_centimes INTEGER,
                created_at INTEGER NOT NULL DEFAULT (unixepoch()),
                acked_at INTEGER
            );
            CREATE UNIQUE INDEX IF NOT EXISTS espace_scpi_declaration_day_idx
                ON espace_scpi_declaration (
                    contact_id,
                    investissement_id,
                    date(date_ts, 'unixepoch')
                )
                WHERE acked_at IS NULL;
            CREATE INDEX IF NOT EXISTS espace_scpi_declaration_pending_idx
                ON espace_scpi_declaration (contact_id, acked_at);
            ",
        )?;
        // Colonnes immobilières : bases déjà déployées n'ont que le schéma SCPI.
        for column_sql in [
            "ALTER TABLE espace_scpi_declaration ADD COLUMN loyer_mensuel_centimes INTEGER",
            "ALTER TABLE espace_scpi_declaration ADD COLUMN mensualite_credit_centimes INTEGER",
            "ALTER TABLE espace_scpi_declaration ADD COLUMN date_fin_pret INTEGER",
            "ALTER TABLE espace_scpi_declaration ADD COLUMN clear_date_fin_pret INTEGER NOT NULL DEFAULT 0",
        ] {
            let _ = self.conn().execute(column_sql, []);
        }
        Ok(())
    }

    pub fn insert_scpi_declaration(
        &self,
        contact_id: i64,
        investissement_id: i64,
        date_ts: i64,
        valorisation_centimes: i64,
        revenu_percu_centimes: Option<i64>,
        loyer_mensuel_centimes: Option<i64>,
        mensualite_credit_centimes: Option<i64>,
        date_fin_pret: Option<i64>,
        clear_date_fin_pret: bool,
    ) -> Result<i64> {
        let conn = self.conn();
        if let Some(existing) = conn
            .query_row(
                "SELECT id FROM espace_scpi_declaration
                 WHERE contact_id = ?1 AND investissement_id = ?2
                   AND date(date_ts, 'unixepoch') = date(?3, 'unixepoch')
                   AND acked_at IS NULL",
                params![contact_id, investissement_id, date_ts],
                |row| row.get::<_, i64>(0),
            )
            .optional()?
        {
            // COALESCE : une correction de la seule valorisation ne doit pas
            // effacer revenu / loyer / crédit déjà déclarés le même jour.
            conn.execute(
                "UPDATE espace_scpi_declaration
                 SET valorisation_centimes = ?1,
                     revenu_percu_centimes = COALESCE(?2, revenu_percu_centimes),
                     loyer_mensuel_centimes = COALESCE(?3, loyer_mensuel_centimes),
                     mensualite_credit_centimes = COALESCE(?4, mensualite_credit_centimes),
                     date_fin_pret = CASE
                         WHEN ?5 != 0 THEN NULL
                         WHEN ?6 IS NOT NULL THEN ?6
                         ELSE date_fin_pret
                     END,
                     clear_date_fin_pret = CASE
                         WHEN ?5 != 0 THEN 1
                         WHEN ?6 IS NOT NULL THEN 0
                         ELSE clear_date_fin_pret
                     END,
                     created_at = unixepoch()
                 WHERE id = ?7",
                params![
                    valorisation_centimes,
                    revenu_percu_centimes,
                    loyer_mensuel_centimes,
                    mensualite_credit_centimes,
                    clear_date_fin_pret as i64,
                    date_fin_pret,
                    existing
                ],
            )?;
            return Ok(existing);
        }

        conn.execute(
            "INSERT INTO espace_scpi_declaration (
                contact_id, investissement_id, date_ts,
                valorisation_centimes, revenu_percu_centimes,
                loyer_mensuel_centimes, mensualite_credit_centimes,
                date_fin_pret, clear_date_fin_pret
             ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)",
            params![
                contact_id,
                investissement_id,
                date_ts,
                valorisation_centimes,
                revenu_percu_centimes,
                loyer_mensuel_centimes,
                mensualite_credit_centimes,
                date_fin_pret,
                clear_date_fin_pret as i64
            ],
        )?;
        Ok(conn.last_insert_rowid())
    }

    pub fn list_scpi_declarations_for_contact(
        &self,
        contact_id: i64,
    ) -> Result<Vec<ScpiDeclarationRow>> {
        let conn = self.conn();
        let mut stmt = conn.prepare(
            "SELECT id, contact_id, investissement_id, date_ts,
                    valorisation_centimes, revenu_percu_centimes,
                    loyer_mensuel_centimes, mensualite_credit_centimes,
                    date_fin_pret, clear_date_fin_pret, created_at
             FROM espace_scpi_declaration
             WHERE contact_id = ?1 AND acked_at IS NULL
             ORDER BY date_ts DESC, id DESC",
        )?;
        let rows = stmt.query_map(params![contact_id], |row| {
            Ok(ScpiDeclarationRow {
                id: row.get(0)?,
                contact_id: row.get(1)?,
                investissement_id: row.get(2)?,
                date_ts: row.get(3)?,
                valorisation_centimes: row.get(4)?,
                revenu_percu_centimes: row.get(5)?,
                loyer_mensuel_centimes: row.get(6)?,
                mensualite_credit_centimes: row.get(7)?,
                date_fin_pret: row.get(8)?,
                clear_date_fin_pret: row.get::<_, i64>(9)? != 0,
                created_at: row.get(10)?,
            })
        })?;
        rows.collect()
    }

    pub fn list_scpi_declarations_pending_sync(
        &self,
        contact_id: i64,
    ) -> Result<Vec<ScpiDeclarationRow>> {
        self.list_scpi_declarations_for_contact(contact_id)
    }

    pub fn ack_scpi_declaration(&self, contact_id: i64, declaration_id: i64) -> Result<bool> {
        let updated = self.conn().execute(
            "UPDATE espace_scpi_declaration
             SET acked_at = unixepoch()
             WHERE id = ?1 AND contact_id = ?2 AND acked_at IS NULL",
            params![declaration_id, contact_id],
        )?;
        Ok(updated > 0)
    }
}

#[cfg(test)]
mod tests {
    use crate::db::PortalDb;

    const JOUR: i64 = 1_781_481_600;

    #[test]
    fn correcting_the_valuation_keeps_the_declared_income() {
        let db = PortalDb::open(":memory:").unwrap();

        db.insert_scpi_declaration(1, 5, JOUR, 1_200_000, Some(12_000), None, None, None, false)
            .unwrap();
        db.insert_scpi_declaration(1, 5, JOUR, 1_250_000, None, None, None, None, false)
            .unwrap();

        let rows = db.list_scpi_declarations_for_contact(1).unwrap();
        assert_eq!(rows.len(), 1, "une seule ligne par jour");
        assert_eq!(rows[0].valorisation_centimes, 1_250_000);
        assert_eq!(rows[0].revenu_percu_centimes, Some(12_000));
    }

    #[test]
    fn a_new_income_replaces_the_previous_one() {
        let db = PortalDb::open(":memory:").unwrap();

        db.insert_scpi_declaration(1, 5, JOUR, 1_200_000, Some(12_000), None, None, None, false)
            .unwrap();
        db.insert_scpi_declaration(1, 5, JOUR, 1_200_000, Some(9_000), None, None, None, false)
            .unwrap();

        let rows = db.list_scpi_declarations_for_contact(1).unwrap();
        assert_eq!(rows[0].revenu_percu_centimes, Some(9_000));
    }

    #[test]
    fn immo_fields_survive_a_valuation_only_correction() {
        let db = PortalDb::open(":memory:").unwrap();
        db.insert_scpi_declaration(
            1,
            8,
            JOUR,
            200_000_00,
            None,
            Some(850_00),
            Some(1_200_00),
            Some(JOUR + 86_400),
            false,
        )
        .unwrap();
        db.insert_scpi_declaration(1, 8, JOUR, 210_000_00, None, None, None, None, false)
            .unwrap();
        let rows = db.list_scpi_declarations_for_contact(1).unwrap();
        assert_eq!(rows[0].loyer_mensuel_centimes, Some(850_00));
        assert_eq!(rows[0].mensualite_credit_centimes, Some(1_200_00));
        assert_eq!(rows[0].date_fin_pret, Some(JOUR + 86_400));
    }
}
