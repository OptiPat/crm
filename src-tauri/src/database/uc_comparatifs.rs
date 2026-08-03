//! Historisation des comparatifs UC.

use rusqlite::{params, Result};

use super::models::UcComparatifRecord;

impl super::Database {
    pub fn migrate_uc_comparatifs_table(&self) -> Result<()> {
        self.conn.execute(
            "CREATE TABLE IF NOT EXISTS comparatifs_uc (
                id TEXT PRIMARY KEY,
                date_comparatif INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),
                scoring_version TEXT NOT NULL CHECK(scoring_version IN ('v1', 'v1.5')),
                confidence_index REAL NOT NULL,
                verdict TEXT NOT NULL CHECK(verdict IN (
                    'WINNER_DECLARED', 'TIE', 'INSUFFICIENT_DATA', 'CATEGORY_MISMATCH'
                )),
                winner_isin TEXT,
                payload_json TEXT NOT NULL
            )",
            [],
        )?;
        self.conn.execute(
            "CREATE INDEX IF NOT EXISTS comparatifs_uc_date_idx ON comparatifs_uc (date_comparatif DESC)",
            [],
        )?;
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
