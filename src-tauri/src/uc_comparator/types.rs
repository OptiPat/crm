use serde::{Deserialize, Serialize};
use std::collections::HashMap;

use crate::database::models::FundWatchlistEntry;

/// Données d'entrée normalisées pour un fonds dans une comparaison UC.
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
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
    /// Volatilité 3 ans mesurée (import Cristalliance) — décide du barème, cf. `scoring_profile`.
    #[serde(default)]
    pub vol_3ans: Option<f64>,
    pub top10_percent: Option<f64>,
    pub max_drawdown_3y: Option<f64>,
    pub aum_meur: Option<f64>,
    /// Pire performance civile annuelle observée — substitut vérifiable du max drawdown, que
    /// Boursorama réserve à ses clients.
    #[serde(default)]
    pub worst_year_perf: Option<f64>,
    /// Rang Morningstar moyen dans la catégorie (1 = meilleur, 100 = pire).
    #[serde(default)]
    pub category_rank_avg: Option<f64>,
    #[serde(default)]
    pub category_alpha_avg: Option<f64>,
}

/// Années minimales pour que la pire année civile mesure un risque plutôt qu'un accident isolé.
const WORST_YEAR_MIN_YEARS: usize = 3;

fn worst_year_perf(perf_annual: &Option<HashMap<String, f64>>) -> Option<f64> {
    let years = perf_annual.as_ref()?;
    let values: Vec<f64> = years.values().copied().filter(|v| v.is_finite()).collect();
    if values.len() < WORST_YEAR_MIN_YEARS {
        return None;
    }
    values.into_iter().reduce(f64::min)
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
            vol_3ans: entry.vol_3ans,
            top10_percent: market.top10_percent,
            max_drawdown_3y: market.max_drawdown_3y,
            aum_meur: market.aum_meur,
            worst_year_perf: worst_year_perf(&entry.perf_annual),
            category_rank_avg: market.category_rank_avg,
            category_alpha_avg: market.category_alpha_avg,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UcMarketCacheRow {
    pub top10_percent: Option<f64>,
    pub max_drawdown_3y: Option<f64>,
    pub aum_meur: Option<f64>,
    #[serde(default)]
    pub category_rank_avg: Option<f64>,
    #[serde(default)]
    pub category_alpha_avg: Option<f64>,
}

impl Default for UcMarketCacheRow {
    fn default() -> Self {
        Self {
            top10_percent: None,
            max_drawdown_3y: None,
            aum_meur: None,
            category_rank_avg: None,
            category_alpha_avg: None,
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
/// La v1.5 (max drawdown + encours) n'a jamais eu de writer : aucun comparatif archivé ne la
/// porte, et ses deux critères sont désormais remplacés par la volatilité mesurée et la pire
/// année civile. Elle est retirée plutôt que laissée en barème mort atteignable de force.
pub enum UcScoringVersion {
    V1,
    V2,
}

impl UcScoringVersion {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::V1 => "v1",
            Self::V2 => "v2",
        }
    }

    pub fn parse(raw: &str) -> Option<Self> {
        match raw.trim() {
            "v1" | "V1" => Some(Self::V1),
            "v2" | "V2" => Some(Self::V2),
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
    /// `false` quand tous les fonds obtiennent le même score : le critère ne départage rien.
    /// Défaut `true` pour rester compatible avec les comparatifs archivés avant ce champ.
    #[serde(default = "default_criterion_discriminant")]
    pub discriminant: bool,
}

fn default_criterion_discriminant() -> bool {
    true
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
    /// Écart annuel moyen face à la catégorie. Hors classement — deux fonds d'une même famille
    /// partagent leur référence, la soustraire ne changerait pas l'ordre — mais il dit si le
    /// gagnant bat son marché ou s'il est seulement le moins en retard.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub category_alpha_avg: Option<f64>,
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
    // Critères du barème v2 : sans eux le tableau affiche un score sans la valeur qui le motive.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub vol_3ans: Option<f64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub worst_year_perf: Option<f64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub category_rank_avg: Option<f64>,
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
            vol_3ans: fund.vol_3ans,
            worst_year_perf: fund.worst_year_perf,
            category_rank_avg: fund.category_rank_avg,
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
