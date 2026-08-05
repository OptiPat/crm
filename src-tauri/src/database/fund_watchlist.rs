//! Veille fonds (watchlist CGP — catalogue supports sans lien client).

use rusqlite::{params, Result};
use std::collections::HashMap;

use super::models::{FundWatchlistEntry, FundWatchlistFavoritesReport, FundWatchlistImportResult, FundWatchlistImportRow};

pub const FUND_WATCHLIST_COACH_LAST_REPORT_SETTING: &str = "fund_watchlist_coach_last_report";

const SELECT_COLS: &str = "id, isin, nom, categorie, notation_morningstar, sri,
    vl_previous, vl_recent, vl_date, perf_ytd, perf_1semaine, perf_1mois, perf_3mois, perf_1an, perf_3ans, perf_5ans,
    vol_5ans, vol_3ans, vol_1an, sharpe_ratio, perf_annual_json,
    frais_gestion, sfdr, source_label, is_favorite, created_at, updated_at,
    (SELECT COUNT(*) FROM contrat_supports cs WHERE cs.isin = fund_watchlist.isin),
    (SELECT COUNT(DISTINCT cs.contact_id) FROM contrat_supports cs WHERE cs.isin = fund_watchlist.isin),
    (SELECT COALESCE(SUM(cs.encours), 0) FROM contrat_supports cs WHERE cs.isin = fund_watchlist.isin)";

/// Bruit flottant ignoré : seule une vraie variation de perf 1 an périme la référence catégorie.
fn perf_1an_changed(previous: Option<f64>, next: Option<f64>) -> bool {
    match (previous, next) {
        (Some(a), Some(b)) => (a - b).abs() > 1e-9,
        (None, None) => false,
        _ => true,
    }
}

fn parse_perf_annual_json(raw: Option<String>) -> Result<Option<HashMap<String, f64>>> {
    match raw {
        Some(json) if !json.trim().is_empty() => {
            let parsed = serde_json::from_str(&json).map_err(|e| {
                rusqlite::Error::InvalidParameterName(format!("JSON parse error: {e}"))
            })?;
            Ok(Some(parsed))
        }
        _ => Ok(None),
    }
}

fn serialize_perf_annual_json(
    perf_annual: &Option<HashMap<String, f64>>,
) -> Result<Option<String>> {
    match perf_annual {
        Some(map) if !map.is_empty() => Ok(Some(serde_json::to_string(map).map_err(|e| {
            rusqlite::Error::InvalidParameterName(format!("JSON serialize error: {e}"))
        })?)),
        _ => Ok(None),
    }
}

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
        vol_5ans: row.get(16)?,
        vol_3ans: row.get(17)?,
        vol_1an: row.get(18)?,
        sharpe_ratio: row.get(19)?,
        perf_annual: parse_perf_annual_json(row.get(20)?)?,
        frais_gestion: row.get(21)?,
        sfdr: row.get(22)?,
        source_label: row.get(23)?,
        is_favorite: row.get::<_, i64>(24)? != 0,
        created_at: row.get(25)?,
        updated_at: row.get(26)?,
        detention: map_fund_watchlist_detention(row)?,
    })
}

fn map_fund_watchlist_detention(
    row: &rusqlite::Row<'_>,
) -> Result<Option<super::models::FundWatchlistDetention>> {
    let contrats: i64 = row.get(27)?;
    if contrats == 0 {
        return Ok(None);
    }
    Ok(Some(super::models::FundWatchlistDetention {
        contrats,
        clients: row.get(28)?,
        encours: row.get(29)?,
    }))
}

impl super::Database {
    pub fn get_all_fund_watchlist_entries(&self) -> Result<Vec<FundWatchlistEntry>> {
        let mut stmt = self.conn.prepare(&format!(
            "SELECT {SELECT_COLS} FROM fund_watchlist ORDER BY nom COLLATE NOCASE"
        ))?;
        let rows = stmt.query_map([], map_fund_watchlist_row)?;
        rows.collect()
    }

    pub fn get_fund_watchlist_favorites(&self) -> Result<Vec<FundWatchlistEntry>> {
        let mut stmt = self.conn.prepare(&format!(
            "SELECT {SELECT_COLS} FROM fund_watchlist WHERE is_favorite = 1 ORDER BY nom COLLATE NOCASE"
        ))?;
        let rows = stmt.query_map([], map_fund_watchlist_row)?;
        rows.collect()
    }

    pub fn get_fund_watchlist_entries_by_isins(
        &self,
        isins: &[String],
    ) -> Result<Vec<FundWatchlistEntry>> {
        if isins.is_empty() {
            return Ok(Vec::new());
        }
        let normalized: Vec<String> = isins
            .iter()
            .map(|s| s.trim().to_uppercase())
            .filter(|s| !s.is_empty())
            .collect();
        if normalized.is_empty() {
            return Ok(Vec::new());
        }
        let placeholders = normalized
            .iter()
            .enumerate()
            .map(|(i, _)| format!("?{}", i + 1))
            .collect::<Vec<_>>()
            .join(", ");
        let sql = format!(
            "SELECT {SELECT_COLS} FROM fund_watchlist WHERE isin IN ({placeholders})"
        );
        let mut stmt = self.conn.prepare(&sql)?;
        let params: Vec<&dyn rusqlite::ToSql> = normalized
            .iter()
            .map(|s| s as &dyn rusqlite::ToSql)
            .collect();
        let rows = stmt.query_map(params.as_slice(), map_fund_watchlist_row)?;
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

        let tx = self.conn.unchecked_transaction()?;

        for row in rows {
            let isin = row.isin.trim().to_uppercase();
            if isin.is_empty() {
                continue;
            }
            let nom = row.nom.trim();
            if nom.is_empty() {
                continue;
            }
            let perf_annual_json = serialize_perf_annual_json(&row.perf_annual)?;

            let existing: Option<(i64, Option<f64>)> = tx
                .query_row(
                    "SELECT id, perf_1an FROM fund_watchlist WHERE isin = ?1",
                    params![&isin],
                    |r| Ok((r.get(0)?, r.get(1)?)),
                )
                .ok();

            if let Some((_, previous_perf_1an)) = existing {
                tx.execute(
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
                        vol_5ans = ?16,
                        vol_3ans = ?17,
                        vol_1an = ?18,
                        sharpe_ratio = ?19,
                        perf_annual_json = ?20,
                        frais_gestion = ?21,
                        sfdr = ?22,
                        source_label = ?23,
                        updated_at = ?24
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
                        row.vol_5ans,
                        row.vol_3ans,
                        row.vol_1an,
                        row.sharpe_ratio,
                        perf_annual_json,
                        row.frais_gestion,
                        row.sfdr,
                        source,
                        now,
                    ],
                )?;
                updated += 1;

                // La référence catégorie Boursorama a été captée à une autre date. Dès que la
                // perf 1 an bouge, l'écart affiché comparerait deux photos décalées : on périme
                // la référence, le diagnostic retombe sur la médiane watchlist (fraîche, issue du
                // même import) jusqu'à la prochaine synchronisation Boursorama.
                // L'historique annuel subit le même décalage : le comparateur en tire le rang de
                // catégorie et l'alpha, qui décriraient un fonds dont les performances ont bougé.
                if perf_1an_changed(previous_perf_1an, row.perf_1an) {
                    tx.execute(
                        "UPDATE fund_watchlist_market_cache
                            SET benchmark_json = NULL,
                                category_history_json = NULL
                          WHERE isin = ?1",
                        params![&isin],
                    )?;
                }
            } else {
                tx.execute(
                    "INSERT INTO fund_watchlist (
                        isin, nom, categorie, notation_morningstar, sri,
                        vl_previous, vl_recent, vl_date,
                        perf_ytd, perf_1semaine, perf_1mois, perf_3mois, perf_1an, perf_3ans, perf_5ans,
                        vol_5ans, vol_3ans, vol_1an, sharpe_ratio, perf_annual_json,
                        frais_gestion, sfdr, source_label, is_favorite, created_at, updated_at
                     ) VALUES (
                        ?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15,
                        ?16, ?17, ?18, ?19, ?20, ?21, ?22, ?23, 0, ?24, ?24
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
                        row.vol_5ans,
                        row.vol_3ans,
                        row.vol_1an,
                        row.sharpe_ratio,
                        perf_annual_json,
                        row.frais_gestion,
                        row.sfdr,
                        source,
                        now,
                    ],
                )?;
                inserted += 1;
            }
        }

        tx.commit()?;

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

    pub fn save_fund_watchlist_coach_last_report(
        &self,
        report: &FundWatchlistFavoritesReport,
    ) -> Result<()> {
        let json = serde_json::to_string(report).map_err(|e| {
            rusqlite::Error::InvalidParameterName(format!("JSON serialize error: {e}"))
        })?;
        self.set_setting(FUND_WATCHLIST_COACH_LAST_REPORT_SETTING, &json)
    }

    pub fn get_fund_watchlist_coach_last_report(&self) -> Result<Option<FundWatchlistFavoritesReport>> {
        match self.get_setting(FUND_WATCHLIST_COACH_LAST_REPORT_SETTING)? {
            Some(raw) => {
                let parsed = serde_json::from_str(&raw).map_err(|e| {
                    rusqlite::Error::InvalidParameterName(format!("JSON parse error: {e}"))
                })?;
                Ok(Some(parsed))
            }
            None => Ok(None),
        }
    }
}

#[cfg(test)]
mod tests {
    use std::collections::HashMap;

    use crate::database::models::FundWatchlistImportRow;
    use crate::database::Database;

    fn sample_import_row() -> FundWatchlistImportRow {
        let mut perf_annual = HashMap::new();
        perf_annual.insert("2024".into(), 8.7);
        perf_annual.insert("2025".into(), 11.2);
        FundWatchlistImportRow {
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
            vol_5ans: Some(14.7),
            vol_3ans: Some(12.5),
            vol_1an: Some(13.6),
            sharpe_ratio: Some(1.12),
            perf_annual: Some(perf_annual),
            frais_gestion: Some(1.8),
            sfdr: Some("Article 8".into()),
        }
    }

    #[test]
    fn import_upserts_and_preserves_favorite() {
        let db = Database::open_in_memory_for_tests().unwrap();
        let row = sample_import_row();

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
        assert!((entries[0].sharpe_ratio.unwrap() - 1.12).abs() < f64::EPSILON);
        assert_eq!(entries[0].perf_annual.as_ref().unwrap().get("2025"), Some(&11.2));
        assert!(entries[0].is_favorite);
    }

    fn cached_benchmark(db: &Database, isin: &str) -> Option<String> {
        db.get_fund_watchlist_market_cache_bulk(&[isin.to_string()])
            .unwrap()
            .into_iter()
            .next()
            .and_then(|row| row.benchmark_json)
    }

    fn cached_category_history(db: &Database, isin: &str) -> Option<String> {
        db.get_fund_watchlist_market_cache_bulk(&[isin.to_string()])
            .unwrap()
            .into_iter()
            .next()
            .and_then(|row| row.category_history_json)
    }

    fn seed_benchmark(db: &Database, isin: &str) {
        db.upsert_fund_watchlist_market_cache_boursorama(
            isin,
            Some(40.0),
            None,
            Some(r#"{"category":{"perf_1an":12.0}}"#),
            Some(r#"{"years":[{"year":"2024","fund":8.0,"category":6.0,"rank":30.0}]}"#),
        )
        .unwrap();
    }

    /// Une perf 1 an qui bouge rend l'écart vs référence incohérent : la référence doit être
    /// périmée par l'import lui-même, sinon le badge compare deux dates différentes.
    #[test]
    fn import_expires_category_benchmark_when_perf_1an_moves() {
        let db = Database::open_in_memory_for_tests().unwrap();
        let row = sample_import_row();
        db.import_fund_watchlist_entries(vec![row.clone()], "cristalliance")
            .unwrap();
        seed_benchmark(&db, "FR0010135103");
        assert!(cached_benchmark(&db, "FR0010135103").is_some());
        assert!(cached_category_history(&db, "FR0010135103").is_some());

        let mut moved = row;
        moved.perf_1an = Some(9.4);
        db.import_fund_watchlist_entries(vec![moved], "cristalliance")
            .unwrap();

        assert_eq!(cached_benchmark(&db, "FR0010135103"), None);
        // Le rang de catégorie et l'alpha du comparateur viennent de cette série annuelle.
        assert_eq!(cached_category_history(&db, "FR0010135103"), None);
    }

    /// Réimporter le même fichier ne doit pas jeter des références encore valables.
    #[test]
    fn import_keeps_benchmark_when_perf_1an_unchanged() {
        let db = Database::open_in_memory_for_tests().unwrap();
        let row = sample_import_row();
        db.import_fund_watchlist_entries(vec![row.clone()], "cristalliance")
            .unwrap();
        seed_benchmark(&db, "FR0010135103");

        let mut renamed = row;
        renamed.nom = "Fonds Test A (nouveau libellé)".into();
        renamed.vl_recent = Some(103.0);
        db.import_fund_watchlist_entries(vec![renamed], "cristalliance")
            .unwrap();

        assert!(cached_benchmark(&db, "FR0010135103").is_some());
        assert!(cached_category_history(&db, "FR0010135103").is_some());
    }

    /// Épingler un favori touche `updated_at` mais ne change aucune perf : rien à périmer.
    #[test]
    fn setting_favorite_does_not_expire_benchmark() {
        let db = Database::open_in_memory_for_tests().unwrap();
        db.import_fund_watchlist_entries(vec![sample_import_row()], "cristalliance")
            .unwrap();
        seed_benchmark(&db, "FR0010135103");

        db.set_fund_watchlist_favorite("FR0010135103", true).unwrap();

        assert!(cached_benchmark(&db, "FR0010135103").is_some());
    }

    #[test]
    fn coach_last_report_roundtrip() {
        use super::super::models::FundWatchlistFavoritesReport;

        let db = Database::open_in_memory_for_tests().unwrap();
        let report = FundWatchlistFavoritesReport {
            markdown: "# Test\n\nContenu.".into(),
            generated_at: 1_700_000_000,
            favorite_count: 3,
            warnings: vec!["avertissement".into()],
        };
        db.save_fund_watchlist_coach_last_report(&report).unwrap();
        let loaded = db.get_fund_watchlist_coach_last_report().unwrap().unwrap();
        assert_eq!(loaded.markdown, report.markdown);
        assert_eq!(loaded.generated_at, report.generated_at);
        assert_eq!(loaded.favorite_count, 3);
        assert_eq!(loaded.warnings, report.warnings);
    }
}
