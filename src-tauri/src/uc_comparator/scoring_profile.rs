use crate::uc_comparator::eligibility::evaluate_categories;
use crate::uc_comparator::types::UcFundInput;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ScoringProfile {
    Equity,
    Obligations,
}

impl ScoringProfile {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::Equity => "equity",
            Self::Obligations => "obligations",
        }
    }

    pub fn confidence_threshold(self) -> f64 {
        match self {
            Self::Equity => 0.70,
            Self::Obligations => 0.60,
        }
    }
}

pub fn resolve_scoring_profile(funds: &[UcFundInput]) -> ScoringProfile {
    let meta = evaluate_categories(funds).meta_key;
    match meta.as_deref() {
        Some("oblig" | "oblig_euro") => ScoringProfile::Obligations,
        _ => ScoringProfile::Equity,
    }
}

#[derive(Clone, Copy)]
pub enum Pilier {
    Performance,
    Risque,
    Structure,
}

pub struct CriterionDef {
    pub key: &'static str,
    pub label: &'static str,
    pub weight_v1: f64,
    pub weight_v15: f64,
    pub pilier: Pilier,
}

const EQUITY_CRITERIA: [CriterionDef; 7] = [
    CriterionDef {
        key: "perf_1an",
        label: "Perf. 1 an",
        weight_v1: 0.08,
        weight_v15: 0.05,
        pilier: Pilier::Performance,
    },
    CriterionDef {
        key: "perf_3ans",
        label: "Perf. 3 ans",
        weight_v1: 0.16,
        weight_v15: 0.10,
        pilier: Pilier::Performance,
    },
    CriterionDef {
        key: "perf_5ans",
        label: "Perf. 5 ans",
        weight_v1: 0.16,
        weight_v15: 0.10,
        pilier: Pilier::Performance,
    },
    CriterionDef {
        key: "sharpe_3y",
        label: "Sharpe 3 ans",
        weight_v1: 0.45,
        weight_v15: 0.35,
        pilier: Pilier::Risque,
    },
    CriterionDef {
        key: "max_drawdown",
        label: "Max drawdown",
        weight_v1: 0.0,
        weight_v15: 0.20,
        pilier: Pilier::Risque,
    },
    CriterionDef {
        key: "aum",
        label: "Encours",
        weight_v1: 0.0,
        weight_v15: 0.10,
        pilier: Pilier::Structure,
    },
    CriterionDef {
        key: "top10",
        label: "Concentration Top 10",
        weight_v1: 0.15,
        weight_v15: 0.10,
        pilier: Pilier::Structure,
    },
];

const OBLIGATIONS_CRITERIA: [CriterionDef; 5] = [
    CriterionDef {
        key: "perf_1an",
        label: "Perf. 1 an",
        weight_v1: 0.30,
        weight_v15: 0.20,
        pilier: Pilier::Performance,
    },
    CriterionDef {
        key: "perf_3ans",
        label: "Perf. 3 ans",
        weight_v1: 0.20,
        weight_v15: 0.15,
        pilier: Pilier::Performance,
    },
    CriterionDef {
        key: "sharpe_3y",
        label: "Sharpe 3 ans",
        weight_v1: 0.50,
        weight_v15: 0.30,
        pilier: Pilier::Risque,
    },
    CriterionDef {
        key: "max_drawdown",
        label: "Max drawdown",
        weight_v1: 0.0,
        weight_v15: 0.25,
        pilier: Pilier::Risque,
    },
    CriterionDef {
        key: "aum",
        label: "Encours",
        weight_v1: 0.0,
        weight_v15: 0.10,
        pilier: Pilier::Structure,
    },
];

pub fn criteria_for_profile(profile: ScoringProfile) -> &'static [CriterionDef] {
    match profile {
        ScoringProfile::Equity => &EQUITY_CRITERIA,
        ScoringProfile::Obligations => &OBLIGATIONS_CRITERIA,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::uc_comparator::types::UcFundInput;

    fn fund(cat: Option<&str>) -> UcFundInput {
        UcFundInput {
            isin: "FR001".into(),
            nom: "Test".into(),
            categorie: cat.map(str::to_string),
            sri: None,
            perf_1an: None,
            perf_3ans: None,
            perf_5ans: None,
            perf_ytd: None,
            sharpe_3y: None,
            top10_percent: None,
            max_drawdown_3y: None,
            aum_meur: None,
        }
    }

    #[test]
    fn obligations_profile_from_meta_category() {
        let profile = resolve_scoring_profile(&[
            fund(Some("Obligations Euro")),
            fund(Some("Obligations")),
        ]);
        assert_eq!(profile, ScoringProfile::Obligations);
    }

    #[test]
    fn equity_profile_for_actions() {
        let profile = resolve_scoring_profile(&[
            fund(Some("Actions Europe")),
            fund(Some("Actions Europe")),
        ]);
        assert_eq!(profile, ScoringProfile::Equity);
    }
}
