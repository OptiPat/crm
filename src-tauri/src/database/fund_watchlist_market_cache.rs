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
            "SELECT isin, aum_meur, top10_percent, max_drawdown_3y, source, updated_at
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
                source: row.get(4)?,
                updated_at: row.get(5)?,
            })
        })?;
        rows.collect()
    }

    pub fn upsert_fund_watchlist_market_cache_top10(
        &self,
        isin: &str,
        top10_percent: f64,
        source: &str,
    ) -> Result<()> {
        let isin = isin.trim().to_uppercase();
        self.conn.execute(
            "INSERT INTO fund_watchlist_market_cache (isin, top10_percent, source, updated_at)
             VALUES (?1, ?2, ?3, strftime('%s', 'now'))
             ON CONFLICT(isin) DO UPDATE SET
               top10_percent = excluded.top10_percent,
               source = excluded.source,
               updated_at = excluded.updated_at",
            rusqlite::params![isin, top10_percent, source],
        )?;
        Ok(())
    }
}
