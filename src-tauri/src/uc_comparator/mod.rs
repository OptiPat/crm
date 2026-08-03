//! Comparateur UC — moteur déterministe de scoring (V1 / V1.5).

pub mod alerts;
pub mod eligibility;
pub mod engine;
pub mod normalize;
pub mod types;

pub use engine::run_comparison;
pub use types::{
    CompareRequest, CompareResponse, UcFundInput, UcFundMetricsSnapshot, UcMarketCacheRow,
    UcScoringVersion, UcVerdict,
};
