//! Historisation des comparatifs UC.

use rusqlite::{params, OptionalExtension, Result};

use super::models::UcComparatifRecord;

const CREATE_COMPARATIFS_UC_COLUMNS: &str = "
    id TEXT PRIMARY KEY,
    date_comparatif INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),
    scoring_version TEXT NOT NULL,
    confidence_index REAL NOT NULL,
    verdict TEXT NOT NULL CHECK(verdict IN (
        'WINNER_DECLARED', 'TIE', 'INSUFFICIENT_DATA', 'CATEGORY_MISMATCH'
    )),
    winner_isin TEXT,
    payload_json TEXT NOT NULL
";

impl super::Database {
    pub fn migrate_uc_comparatifs_table(&self) -> Result<()> {
        self.conn.execute(
            &format!("CREATE TABLE IF NOT EXISTS comparatifs_uc ({CREATE_COMPARATIFS_UC_COLUMNS})"),
            [],
        )?;
        self.migrate_uc_comparatifs_drop_frozen_version_check()?;
        self.conn.execute(
            "CREATE INDEX IF NOT EXISTS comparatifs_uc_date_idx ON comparatifs_uc (date_comparatif DESC)",
            [],
        )?;
        Ok(())
    }

    /// Le schéma d'origine figeait la liste des barèmes dans un `CHECK(scoring_version IN …)` :
    /// tout barème ajouté ensuite était rejeté à l'enregistrement, la comparaison échouait après
    /// avoir été calculée. SQLite ne sait pas modifier une contrainte, d'où la reconstruction. La
    /// version reste validée côté Rust par `UcScoringVersion`.
    fn migrate_uc_comparatifs_drop_frozen_version_check(&self) -> Result<()> {
        let schema: Option<String> = self
            .conn
            .query_row(
                "SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'comparatifs_uc'",
                [],
                |row| row.get(0),
            )
            .optional()?;
        let has_frozen_check = schema
            .map(|sql| sql.contains("scoring_version TEXT NOT NULL CHECK"))
            .unwrap_or(false);
        if !has_frozen_check {
            return Ok(());
        }

        println!("🔄 Migration : comparatifs_uc, libération de scoring_version...");
        self.conn.execute_batch(&format!(
            "CREATE TABLE comparatifs_uc_new ({CREATE_COMPARATIFS_UC_COLUMNS});
             INSERT INTO comparatifs_uc_new (
                 id, date_comparatif, scoring_version, confidence_index, verdict, winner_isin,
                 payload_json
             )
             SELECT id, date_comparatif, scoring_version, confidence_index, verdict, winner_isin,
                    payload_json
               FROM comparatifs_uc;
             DROP TABLE comparatifs_uc;
             ALTER TABLE comparatifs_uc_new RENAME TO comparatifs_uc;"
        ))?;
        println!("✅ Migration comparatifs_uc appliquée");
        Ok(())
    }

    pub fn save_uc_comparatif(&self, record: &UcComparatifRecord) -> Result<()> {
        self.conn.execute(
            "INSERT INTO comparatifs_uc (
                id, date_comparatif, scoring_version, confidence_index, verdict, winner_isin, payload_json
            ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
            params![
                record.id,
                record.date_comparatif,
                record.scoring_version,
                record.confidence_index,
                record.verdict,
                record.winner_isin,
                record.payload_json,
            ],
        )?;
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::database::Database;

    fn record(id: &str, version: &str) -> UcComparatifRecord {
        UcComparatifRecord {
            id: id.to_string(),
            date_comparatif: 1_700_000_000,
            scoring_version: version.to_string(),
            confidence_index: 0.8,
            verdict: "WINNER_DECLARED".to_string(),
            winner_isin: Some("FR0010135103".to_string()),
            payload_json: "{}".to_string(),
        }
    }

    /// Recrée le schéma historique, celui installé chez les utilisateurs existants.
    fn install_legacy_schema(db: &Database) {
        db.connection()
            .execute_batch(
                "DROP TABLE IF EXISTS comparatifs_uc;
                 CREATE TABLE comparatifs_uc (
                     id TEXT PRIMARY KEY,
                     date_comparatif INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),
                     scoring_version TEXT NOT NULL CHECK(scoring_version IN ('v1', 'v1.5')),
                     confidence_index REAL NOT NULL,
                     verdict TEXT NOT NULL CHECK(verdict IN (
                         'WINNER_DECLARED', 'TIE', 'INSUFFICIENT_DATA', 'CATEGORY_MISMATCH'
                     )),
                     winner_isin TEXT,
                     payload_json TEXT NOT NULL
                 );",
            )
            .expect("schéma historique");
    }

    #[test]
    fn migration_accepts_a_new_scoring_version_and_keeps_archives() {
        let db = Database::open_in_memory_for_tests().expect("db");
        install_legacy_schema(&db);
        db.save_uc_comparatif(&record("ancien", "v1"))
            .expect("archive v1");

        db.migrate_uc_comparatifs_table().expect("migration");

        db.save_uc_comparatif(&record("nouveau", "v2"))
            .expect("un barème v2 doit pouvoir être enregistré");
        let count: i64 = db
            .connection()
            .query_row("SELECT COUNT(*) FROM comparatifs_uc", [], |row| row.get(0))
            .expect("count");
        assert_eq!(count, 2, "l'archive v1 doit survivre à la reconstruction");
    }

    #[test]
    fn migration_is_idempotent_on_the_current_schema() {
        let db = Database::open_in_memory_for_tests().expect("db");
        db.save_uc_comparatif(&record("v2", "v2")).expect("save v2");
        db.migrate_uc_comparatifs_table().expect("migration");
        db.migrate_uc_comparatifs_table().expect("migration bis");
        let count: i64 = db
            .connection()
            .query_row("SELECT COUNT(*) FROM comparatifs_uc", [], |row| row.get(0))
            .expect("count");
        assert_eq!(count, 1);
    }
}
