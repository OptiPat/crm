use crate::commands::DbState;
use crate::database::models::{UcComparatifRecord, UcMarketCacheRowDb};
use crate::fund_watchlist_market_cache_fetch::{
    apply_boursorama_cache_updates, category_history_from_cache_json, exposition_from_cache_json,
    fetch_boursorama_cache_for_isins, list_isins_missing_boursorama_data,
};
use crate::uc_comparator::{
    run_comparison, CompareRequest, CompareResponse, UcFundExpositionSnapshot, UcFundInput,
    UcFundMetricsSnapshot, UcMarketCacheRow, UcScoringVersion, UcVerdict,
};
use tauri::State;

fn verdict_to_string(verdict: UcVerdict) -> &'static str {
    match verdict {
        UcVerdict::WinnerDeclared => "WINNER_DECLARED",
        UcVerdict::Tie => "TIE",
        UcVerdict::InsufficientData => "INSUFFICIENT_DATA",
        UcVerdict::CategoryMismatch => "CATEGORY_MISMATCH",
    }
}

fn market_row_to_cache(row: &UcMarketCacheRowDb) -> UcMarketCacheRow {
    let history = category_history_from_cache_json(row.category_history_json.as_deref());
    UcMarketCacheRow {
        top10_percent: row.top10_percent,
        max_drawdown_3y: row.max_drawdown_3y,
        aum_meur: row.aum_meur,
        category_rank_avg: history.as_ref().and_then(|h| h.rank_avg()),
        category_alpha_avg: history.as_ref().and_then(|h| h.alpha_avg()),
    }
}

fn resolve_scoring_version(
    request: &CompareRequest,
    inputs: &[UcFundInput],
) -> UcScoringVersion {
    if let Some(ref forced) = request.force_version {
        if let Some(v) = UcScoringVersion::parse(forced) {
            return v;
        }
    }
    // Le rang catégorie n'entre pas dans la condition : il vient du web et son absence est
    // absorbée par la redistribution des poids, alors que volatilité et pire année viennent de
    // l'import et conditionnent l'intérêt du barème.
    let v2_ready = inputs
        .iter()
        .all(|f| f.vol_3ans.is_some() && f.worst_year_perf.is_some());
    if v2_ready {
        UcScoringVersion::V2
    } else {
        UcScoringVersion::V1
    }
}

fn new_comparatif_id(isins: &[String]) -> String {
    let now = chrono::Utc::now().timestamp_millis();
    let joined = isins.join("-");
    format!("uc-{now}-{joined}")
}

#[tauri::command]
pub fn run_uc_comparison(
    db: State<'_, DbState>,
    request: CompareRequest,
) -> Result<CompareResponse, String> {
    let isins: Vec<String> = request
        .isins
        .iter()
        .map(|s| s.trim().to_uppercase())
        .filter(|s| !s.is_empty())
        .collect();
    if isins.len() < 2 || isins.len() > 4 {
        return Err("Sélectionnez entre 2 et 4 ISIN.".to_string());
    }

    let entries = {
        let db_guard = db.lock().unwrap();
        let database = db_guard.as_ref().ok_or("Database not initialized")?;
        let entries = database
            .get_fund_watchlist_entries_by_isins(&isins)
            .map_err(|e| format!("Lecture watchlist : {e}"))?;
        if entries.len() != isins.len() {
            let found: std::collections::HashSet<_> =
                entries.iter().map(|e| e.isin.as_str()).collect();
            let missing: Vec<_> = isins
                .iter()
                .filter(|i| !found.contains(i.as_str()))
                .cloned()
                .collect();
            return Err(format!(
                "ISIN introuvable(s) en watchlist : {}.",
                missing.join(", ")
            ));
        }
        entries
    };

    let missing_boursorama = {
        let db_guard = db.lock().unwrap();
        let database = db_guard.as_ref().ok_or("Database not initialized")?;
        list_isins_missing_boursorama_data(database, &isins)?
    };
    if !missing_boursorama.is_empty() {
        let updates = fetch_boursorama_cache_for_isins(&missing_boursorama)?;
        if !updates.is_empty() {
            let db_guard = db.lock().unwrap();
            let database = db_guard.as_ref().ok_or("Database not initialized")?;
            apply_boursorama_cache_updates(database, &updates)?;
        }
    }

    let db_guard = db.lock().unwrap();
    let database = db_guard.as_ref().ok_or("Database not initialized")?;

    let cache_rows = database
        .get_fund_watchlist_market_cache_bulk(&isins)
        .map_err(|e| format!("Lecture cache marché : {e}"))?;
    let cache_by_isin: std::collections::HashMap<String, UcMarketCacheRowDb> = cache_rows
        .into_iter()
        .map(|r| (r.isin.clone(), r))
        .collect();

    let mut inputs: Vec<UcFundInput> = entries
        .iter()
        .map(|entry| {
            let market = cache_by_isin
                .get(&entry.isin)
                .map(market_row_to_cache)
                .unwrap_or_default();
            UcFundInput::from_watchlist_entry(entry, &market)
        })
        .collect();

    inputs.sort_by(|a, b| a.isin.cmp(&b.isin));

    let version = resolve_scoring_version(&request, &inputs);
    let comparison = run_comparison(&inputs, version)?;

    let comparatif_id = new_comparatif_id(&isins);
    let record = UcComparatifRecord {
        id: comparatif_id.clone(),
        date_comparatif: chrono::Utc::now().timestamp(),
        scoring_version: version.as_str().to_string(),
        confidence_index: comparison.confidence_index,
        verdict: verdict_to_string(comparison.verdict).to_string(),
        winner_isin: comparison.winner_isin.clone(),
        payload_json: comparison.raw_json_payload.clone(),
    };
    database
        .save_uc_comparatif(&record)
        .map_err(|e| format!("Sauvegarde comparatif : {e}"))?;

    let fund_order: Vec<String> = inputs.iter().map(|f| f.isin.clone()).collect();
    let metrics: Vec<UcFundMetricsSnapshot> = inputs
        .iter()
        .map(UcFundMetricsSnapshot::from_fund_input)
        .collect();
    let exposition: Vec<UcFundExpositionSnapshot> = inputs
        .iter()
        .map(|fund| {
            let cached = cache_by_isin.get(&fund.isin);
            let parsed = cached
                .and_then(|row| exposition_from_cache_json(row.exposition_json.as_deref()))
                .unwrap_or_default();
            UcFundExpositionSnapshot::from_exposition(&fund.isin, &parsed)
        })
        .collect();

    Ok(CompareResponse {
        comparatif_id,
        scoring_version: version.as_str().to_string(),
        scoring_profile: comparison.scoring_profile.clone(),
        confidence_index: comparison.confidence_index,
        verdict: verdict_to_string(comparison.verdict).to_string(),
        winner_isin: comparison.winner_isin,
        is_category_matched: comparison.is_same_category,
        category: comparison.category,
        category_warning: comparison.category_warning,
        score_gap: comparison.score_gap,
        fund_order,
        criteria: comparison.criteria,
        metrics,
        exposition,
        results: comparison.funds,
        raw_json_payload: comparison.raw_json_payload,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    fn input(vol_3ans: Option<f64>, worst_year_perf: Option<f64>) -> UcFundInput {
        UcFundInput {
            isin: "FR001".into(),
            nom: "Test".into(),
            categorie: Some("Actions Europe".into()),
            perf_1an: Some(10.0),
            perf_3ans: Some(20.0),
            perf_5ans: Some(30.0),
            sharpe_3y: Some(0.5),
            vol_3ans,
            top10_percent: Some(40.0),
            worst_year_perf,
            ..Default::default()
        }
    }

    fn request(force_version: Option<&str>) -> CompareRequest {
        CompareRequest {
            isins: vec!["FR001".into(), "FR002".into()],
            force_version: force_version.map(str::to_string),
        }
    }

    /// Verrou : sans volatilité mesurée ni historique annuel, le pilier risque de la v2 serait
    /// vide. On reste alors sur la v1, qui reproduit les comparatifs archivés à l'identique.
    #[test]
    fn resolves_v1_without_measured_volatility_or_annual_history() {
        let inputs = [input(None, None), input(None, None)];
        assert_eq!(
            resolve_scoring_version(&request(None), &inputs),
            UcScoringVersion::V1
        );
    }

    #[test]
    fn resolves_v2_only_when_every_fund_has_volatility_and_worst_year() {
        let complete = [input(Some(12.0), Some(-18.0)), input(Some(9.0), Some(-25.0))];
        assert_eq!(
            resolve_scoring_version(&request(None), &complete),
            UcScoringVersion::V2
        );

        let partial = [input(Some(12.0), Some(-18.0)), input(None, Some(-25.0))];
        assert_eq!(
            resolve_scoring_version(&request(None), &partial),
            UcScoringVersion::V1
        );
    }

    /// La v1.5 (max drawdown + encours) n'a jamais eu de writer : elle n'est plus atteignable que
    /// par une demande explicite, et le rang catégorie remplace l'encours comme critère utile.
    #[test]
    fn force_version_overrides_data_detection() {
        let inputs = [input(None, None), input(None, None)];
        assert_eq!(
            resolve_scoring_version(&request(Some("v1.5")), &inputs),
            UcScoringVersion::V15
        );
        let ready = [input(Some(12.0), Some(-18.0)), input(Some(9.0), Some(-25.0))];
        assert_eq!(
            resolve_scoring_version(&request(Some("v1")), &ready),
            UcScoringVersion::V1
        );
    }
}
