//! Cache léger des métriques marché / structure (scrape Boursorama, Quantalys, saisie manuelle).

use rusqlite::Result;

use super::models::UcMarketCacheRowDb;

impl super::Database {
    pub fn migrate_fund_watchlist_market_cache_table(&self) -> Result<()> {
        self.conn.execute(
            "CREATE TABLE IF NOT EXISTS fund_watchlist_market_cache (
                isin TEXT PRIMARY KEY,
                aum_meur REAL,
                top10_percent REAL,
                max_drawdown_3y REAL,
                exposition_json TEXT,
                source TEXT NOT NULL DEFAULT 'manual',
                updated_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now'))
            )",
            [],
        )?;
        self.conn.execute(
            "CREATE INDEX IF NOT EXISTS fund_watchlist_market_cache_updated_idx
                ON fund_watchlist_market_cache (updated_at)",
            [],
        )?;
        if !self.table_has_column("fund_watchlist_market_cache", "exposition_json")? {
            self.conn.execute(
                "ALTER TABLE fund_watchlist_market_cache ADD COLUMN exposition_json TEXT",
                [],
            )?;
            println!("✅ Migration: colonne exposition_json sur fund_watchlist_market_cache");
        }
        if !self.table_has_column("fund_watchlist_market_cache", "benchmark_json")? {
            self.conn.execute(
                "ALTER TABLE fund_watchlist_market_cache ADD COLUMN benchmark_json TEXT",
                [],
            )?;
            println!("✅ Migration: colonne benchmark_json sur fund_watchlist_market_cache");
        }
        if !self.table_has_column("fund_watchlist_market_cache", "category_history_json")? {
            self.conn.execute(
                "ALTER TABLE fund_watchlist_market_cache ADD COLUMN category_history_json TEXT",
                [],
            )?;
            println!("✅ Migration: colonne category_history_json sur fund_watchlist_market_cache");
        }
        Ok(())
    }

    pub fn get_fund_watchlist_market_cache_bulk(
        &self,
        isins: &[String],
    ) -> Result<Vec<UcMarketCacheRowDb>> {
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
            "SELECT isin, aum_meur, top10_percent, max_drawdown_3y, exposition_json, benchmark_json, category_history_json, source, updated_at
             FROM fund_watchlist_market_cache WHERE isin IN ({placeholders})"
        );
        let mut stmt = self.conn.prepare(&sql)?;
        let params: Vec<&dyn rusqlite::ToSql> = normalized
            .iter()
            .map(|s| s as &dyn rusqlite::ToSql)
            .collect();
        let rows = stmt.query_map(params.as_slice(), |row| {
            Ok(UcMarketCacheRowDb {
                isin: row.get(0)?,
                aum_meur: row.get(1)?,
                top10_percent: row.get(2)?,
                max_drawdown_3y: row.get(3)?,
                exposition_json: row.get(4)?,
                benchmark_json: row.get(5)?,
                category_history_json: row.get(6)?,
                source: row.get(7)?,
                updated_at: row.get(8)?,
            })
        })?;
        rows.collect()
    }

    pub fn upsert_fund_watchlist_market_cache_boursorama(
        &self,
        isin: &str,
        top10_percent: Option<f64>,
        exposition_json: Option<&str>,
        benchmark_json: Option<&str>,
        category_history_json: Option<&str>,
    ) -> Result<()> {
        let isin = isin.trim().to_uppercase();
        self.conn.execute(
            "INSERT INTO fund_watchlist_market_cache (isin, top10_percent, exposition_json, benchmark_json, category_history_json, source, updated_at)
             VALUES (?1, ?2, ?3, ?4, ?5, 'boursorama', strftime('%s', 'now'))
             ON CONFLICT(isin) DO UPDATE SET
               top10_percent = COALESCE(excluded.top10_percent, fund_watchlist_market_cache.top10_percent),
               exposition_json = COALESCE(excluded.exposition_json, fund_watchlist_market_cache.exposition_json),
               benchmark_json = COALESCE(excluded.benchmark_json, fund_watchlist_market_cache.benchmark_json),
               category_history_json = COALESCE(excluded.category_history_json, fund_watchlist_market_cache.category_history_json),
               source = 'boursorama',
               updated_at = excluded.updated_at",
            rusqlite::params![
                isin,
                top10_percent,
                exposition_json,
                benchmark_json,
                category_history_json
            ],
        )?;
        Ok(())
    }
}
