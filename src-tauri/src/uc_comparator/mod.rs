//! Comparateur UC — moteur déterministe de scoring (v1 archivé, v2 courant).

pub mod alerts;
pub mod bond_strategy;
pub mod category_table;
pub mod eligibility;
pub mod engine;
pub mod normalize;
pub mod scoring_profile;
pub mod types;

pub use engine::run_comparison;
pub use types::{
    CompareRequest, CompareResponse, UcFundExpositionSnapshot, UcFundInput, UcFundMetricsSnapshot,
    UcMarketCacheRow, UcScoringVersion, UcVerdict,
};
