use serde::{Deserialize, Serialize};

use crate::database::models::FundWatchlistEntry;

/// Données d'entrée normalisées pour un fonds dans une comparaison UC.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UcFundInput {
    pub isin: String,
    pub nom: String,
    pub categorie: Option<String>,
    pub sri: Option<i64>,
    pub perf_1an: Option<f64>,
    pub perf_3ans: Option<f64>,
    pub perf_5ans: Option<f64>,
    pub perf_ytd: Option<f64>,
    pub sharpe_3y: Option<f64>,
    pub top10_percent: Option<f64>,
    pub max_drawdown_3y: Option<f64>,
    pub aum_meur: Option<f64>,
}

impl UcFundInput {
    pub fn from_watchlist_entry(entry: &FundWatchlistEntry, market: &UcMarketCacheRow) -> Self {
        Self {
            isin: entry.isin.clone(),
            nom: entry.nom.clone(),
            categorie: entry.categorie.clone(),
            sri: entry.sri,
            perf_1an: entry.perf_1an,
            perf_3ans: entry.perf_3ans,
            perf_5ans: entry.perf_5ans,
            perf_ytd: entry.perf_ytd,
            sharpe_3y: entry.sharpe_ratio,
            top10_percent: market.top10_percent,
            max_drawdown_3y: market.max_drawdown_3y,
            aum_meur: market.aum_meur,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UcMarketCacheRow {
    pub top10_percent: Option<f64>,
    pub max_drawdown_3y: Option<f64>,
    pub aum_meur: Option<f64>,
}

impl Default for UcMarketCacheRow {
    fn default() -> Self {
        Self {
            top10_percent: None,
            max_drawdown_3y: None,
            aum_meur: None,
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum UcScoringVersion {
    V1,
    #[serde(rename = "v1.5")]
    V15,
}

impl UcScoringVersion {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::V1 => "v1",
            Self::V15 => "v1.5",
        }
    }

    pub fn parse(raw: &str) -> Option<Self> {
        match raw.trim() {
            "v1" | "V1" => Some(Self::V1),
            "v1.5" | "V1.5" => Some(Self::V15),
            _ => None,
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum UcVerdict {
    WinnerDeclared,
    Tie,
    InsufficientData,
    CategoryMismatch,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UcCriterionScore {
    pub key: String,
    pub label: String,
    pub weight_global: f64,
    pub scores: Vec<f64>,
    pub available: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UcFundResultScore {
    pub isin: String,
    pub nom: String,
    pub rank: usize,
    pub score_relative_total: f64,
    pub pilier_scores: UcPilierScores,
    pub criterion_scores: Vec<f64>,
    pub alerts: Vec<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub bond_credit_quality: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub bond_strategy: Option<String>,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct UcPilierScores {
    pub performance: Option<f64>,
    pub risque: Option<f64>,
    pub structure: Option<f64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UcComparisonResult {
    pub scoring_version: UcScoringVersion,
    #[serde(default = "default_scoring_profile")]
    pub scoring_profile: String,
    pub category: Option<String>,
    pub is_same_category: bool,
    #[serde(default)]
    pub category_warning: Option<String>,
    pub confidence_index: f64,
    pub verdict: UcVerdict,
    pub winner_isin: Option<String>,
    pub score_gap: Option<f64>,
    pub funds: Vec<UcFundResultScore>,
    pub criteria: Vec<UcCriterionScore>,
    pub raw_json_payload: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UcFundMetricsSnapshot {
    pub isin: String,
    pub perf_1an: Option<f64>,
    pub perf_3ans: Option<f64>,
    pub perf_5ans: Option<f64>,
    pub perf_ytd: Option<f64>,
    pub sharpe_3y: Option<f64>,
    pub top10_percent: Option<f64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub max_drawdown_3y: Option<f64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub aum_meur: Option<f64>,
}

impl UcFundMetricsSnapshot {
    pub fn from_fund_input(fund: &UcFundInput) -> Self {
        Self {
            isin: fund.isin.clone(),
            perf_1an: fund.perf_1an,
            perf_3ans: fund.perf_3ans,
            perf_5ans: fund.perf_5ans,
            perf_ytd: fund.perf_ytd,
            sharpe_3y: fund.sharpe_3y,
            top10_percent: fund.top10_percent,
            max_drawdown_3y: fund.max_drawdown_3y,
            aum_meur: fund.aum_meur,
        }
    }
}

fn default_scoring_profile() -> String {
    "equity".to_string()
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CompareRequest {
    pub isins: Vec<String>,
    pub force_version: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UcExposureSlice {
    pub label: String,
    pub weight_percent: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UcStyleBox {
    pub cap: String,
    pub style: String,
    pub label_fr: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct UcFundExposition {
    pub geo: Vec<UcExposureSlice>,
    pub sectors: Vec<UcExposureSlice>,
    #[serde(default)]
    pub asset_breakdown: Vec<UcExposureSlice>,
    #[serde(default)]
    pub holdings: Vec<UcExposureSlice>,
    pub style_box: Option<UcStyleBox>,
    #[serde(default)]
    pub source: String,
}

impl UcFundExposition {
    pub fn is_complete(&self) -> bool {
        !self.geo.is_empty() && !self.sectors.is_empty()
    }

    pub fn needs_boursorama_refresh(&self) -> bool {
        if !self.is_complete() {
            return false;
        }
        self.style_box.is_none() || self.holdings.is_empty()
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct UcFundExpositionSnapshot {
    pub isin: String,
    pub geo: Vec<UcExposureSlice>,
    pub sectors: Vec<UcExposureSlice>,
    #[serde(default)]
    pub asset_breakdown: Vec<UcExposureSlice>,
    #[serde(default)]
    pub holdings: Vec<UcExposureSlice>,
    pub style_box: Option<UcStyleBox>,
    pub source: Option<String>,
    pub complete: bool,
}

impl UcFundExpositionSnapshot {
    pub fn from_exposition(isin: &str, exposition: &UcFundExposition) -> Self {
        Self {
            isin: isin.to_string(),
            geo: exposition.geo.clone(),
            sectors: exposition.sectors.clone(),
            asset_breakdown: exposition.asset_breakdown.clone(),
            holdings: exposition.holdings.clone(),
            style_box: exposition.style_box.clone(),
            source: if exposition.source.is_empty() {
                None
            } else {
                Some(exposition.source.clone())
            },
            complete: exposition.is_complete(),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CompareResponse {
    pub comparatif_id: String,
    pub scoring_version: String,
    #[serde(default = "default_scoring_profile")]
    pub scoring_profile: String,
    pub confidence_index: f64,
    pub verdict: String,
    pub winner_isin: Option<String>,
    pub is_category_matched: bool,
    pub category: Option<String>,
    #[serde(default)]
    pub category_warning: Option<String>,
    pub score_gap: Option<f64>,
    /// ISIN dans le même ordre que `criteria[].scores`.
    pub fund_order: Vec<String>,
    pub criteria: Vec<UcCriterionScore>,
    pub metrics: Vec<UcFundMetricsSnapshot>,
    pub exposition: Vec<UcFundExpositionSnapshot>,
    pub results: Vec<UcFundResultScore>,
    pub raw_json_payload: String,
}
