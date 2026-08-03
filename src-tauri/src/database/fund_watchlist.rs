//! Veille fonds (watchlist CGP — catalogue supports sans lien client).

use rusqlite::{params, Result};

use super::models::{FundWatchlistEntry, FundWatchlistImportResult, FundWatchlistImportRow};

const SELECT_COLS: &str = "id, isin, nom, categorie, notation_morningstar, sri,
    vl_previous, vl_recent, vl_date, perf_ytd, perf_1semaine, perf_1mois, perf_3mois, perf_1an, perf_3ans, perf_5ans,
    frais_gestion, sfdr, source_label, is_favorite, created_at, updated_at";

fn map_fund_watchlist_row(row: &rusqlite::Row<'_>) -> Result<FundWatchlistEntry> {
    Ok(FundWatchlistEntry {
        id: row.get(0)?,
        isin: row.get(1)?,
        nom: row.get(2)?,
        categorie: row.get(3)?,
        notation_morningstar: row.get(4)?,
        sri: row.get(5)?,
        vl_previous: row.get(6)?,
        vl_recent: row.get(7)?,
        vl_date: row.get(8)?,
        perf_ytd: row.get(9)?,
        perf_1semaine: row.get(10)?,
        perf_1mois: row.get(11)?,
        perf_3mois: row.get(12)?,
        perf_1an: row.get(13)?,
        perf_3ans: row.get(14)?,
        perf_5ans: row.get(15)?,
        frais_gestion: row.get(16)?,
        sfdr: row.get(17)?,
        source_label: row.get(18)?,
        is_favorite: row.get::<_, i64>(19)? != 0,
        created_at: row.get(20)?,
        updated_at: row.get(21)?,
    })
}

impl super::Database {
    pub fn get_all_fund_watchlist_entries(&self) -> Result<Vec<FundWatchlistEntry>> {
        let mut stmt = self.conn.prepare(&format!(
            "SELECT {SELECT_COLS} FROM fund_watchlist ORDER BY nom COLLATE NOCASE"
        ))?;
        let rows = stmt.query_map([], map_fund_watchlist_row)?;
        rows.collect()
    }

    pub fn import_fund_watchlist_entries(
        &self,
        rows: Vec<FundWatchlistImportRow>,
        source_label: &str,
    ) -> Result<FundWatchlistImportResult> {
        let source = source_label.trim();
        let source = if source.is_empty() {
            "import"
        } else {
            source
        };
        let now = chrono::Utc::now().timestamp();
        let mut inserted = 0usize;
        let mut updated = 0usize;

        for row in rows {
            let isin = row.isin.trim().to_uppercase();
            if isin.is_empty() {
                continue;
            }
            let nom = row.nom.trim();
            if nom.is_empty() {
                continue;
            }

            let existing: Option<i64> = self
                .conn
                .query_row(
                    "SELECT id FROM fund_watchlist WHERE isin = ?1",
                    params![&isin],
                    |r| r.get(0),
                )
                .ok();

            if existing.is_some() {
                self.conn.execute(
                    "UPDATE fund_watchlist SET
                        nom = ?2,
                        categorie = ?3,
                        notation_morningstar = ?4,
                        sri = ?5,
                        vl_previous = ?6,
                        vl_recent = ?7,
                        vl_date = ?8,
                        perf_ytd = ?9,
                        perf_1semaine = ?10,
                        perf_1mois = ?11,
                        perf_3mois = ?12,
                        perf_1an = ?13,
                        perf_3ans = ?14,
                        perf_5ans = ?15,
                        frais_gestion = ?16,
                        sfdr = ?17,
                        source_label = ?18,
                        updated_at = ?19
                     WHERE isin = ?1",
                    params![
                        &isin,
                        nom,
                        row.categorie,
                        row.notation_morningstar,
                        row.sri,
                        row.vl_previous,
                        row.vl_recent,
                        row.vl_date,
                        row.perf_ytd,
                        row.perf_1semaine,
                        row.perf_1mois,
                        row.perf_3mois,
                        row.perf_1an,
                        row.perf_3ans,
                        row.perf_5ans,
                        row.frais_gestion,
                        row.sfdr,
                        source,
                        now,
                    ],
                )?;
                updated += 1;
            } else {
                self.conn.execute(
                    "INSERT INTO fund_watchlist (
                        isin, nom, categorie, notation_morningstar, sri,
                        vl_previous, vl_recent, vl_date,
                        perf_ytd, perf_1semaine, perf_1mois, perf_3mois, perf_1an, perf_3ans, perf_5ans,
                        frais_gestion, sfdr, source_label, is_favorite, created_at, updated_at
                     ) VALUES (
                        ?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, ?17, ?18, 0, ?19, ?19
                     )",
                    params![
                        &isin,
                        nom,
                        row.categorie,
                        row.notation_morningstar,
                        row.sri,
                        row.vl_previous,
                        row.vl_recent,
                        row.vl_date,
                        row.perf_ytd,
                        row.perf_1semaine,
                        row.perf_1mois,
                        row.perf_3mois,
                        row.perf_1an,
                        row.perf_3ans,
                        row.perf_5ans,
                        row.frais_gestion,
                        row.sfdr,
                        source,
                        now,
                    ],
                )?;
                inserted += 1;
            }
        }

        Ok(FundWatchlistImportResult {
            inserted,
            updated,
            total: inserted + updated,
        })
    }

    pub fn set_fund_watchlist_favorite(&self, isin: &str, is_favorite: bool) -> Result<()> {
        let isin = isin.trim().to_uppercase();
        let now = chrono::Utc::now().timestamp();
        let changed = self.conn.execute(
            "UPDATE fund_watchlist SET is_favorite = ?2, updated_at = ?3 WHERE isin = ?1",
            params![&isin, if is_favorite { 1 } else { 0 }, now],
        )?;
        if changed == 0 {
            return Err(rusqlite::Error::QueryReturnedNoRows);
        }
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::database::models::FundWatchlistImportRow;
    use crate::database::Database;

    #[test]
    fn import_upserts_and_preserves_favorite() {
        let db = Database::open_in_memory_for_tests().unwrap();
        let row = FundWatchlistImportRow {
            isin: "FR0010135103".into(),
            nom: "Fonds Test A".into(),
            categorie: Some("Actions Europe".into()),
            notation_morningstar: Some(4),
            sri: Some(5),
            vl_previous: Some(100.0),
            vl_recent: Some(102.5),
            vl_date: Some(1_704_067_200),
            perf_ytd: Some(2.5),
            perf_1semaine: Some(-0.4),
            perf_1mois: Some(0.6),
            perf_3mois: Some(1.2),
            perf_1an: Some(8.0),
            perf_3ans: Some(15.0),
            perf_5ans: Some(22.0),
            frais_gestion: Some(1.8),
            sfdr: Some("Article 8".into()),
        };

        let first = db
            .import_fund_watchlist_entries(vec![row.clone()], "cristalliance")
            .unwrap();
        assert_eq!(first.inserted, 1);
        assert_eq!(first.updated, 0);

        db.set_fund_watchlist_favorite("FR0010135103", true).unwrap();

        let mut updated_row = row;
        updated_row.nom = "Fonds Test A Renommé".into();
        updated_row.vl_recent = Some(103.0);
        let second = db
            .import_fund_watchlist_entries(vec![updated_row], "cristalliance")
            .unwrap();
        assert_eq!(second.inserted, 0);
        assert_eq!(second.updated, 1);

        let entries = db.get_all_fund_watchlist_entries().unwrap();
        assert_eq!(entries.len(), 1);
        assert_eq!(entries[0].nom, "Fonds Test A Renommé");
        assert!((entries[0].vl_recent.unwrap() - 103.0).abs() < f64::EPSILON);
        assert!((entries[0].perf_1semaine.unwrap() + 0.4).abs() < f64::EPSILON);
        assert!(entries[0].is_favorite);
    }
}
