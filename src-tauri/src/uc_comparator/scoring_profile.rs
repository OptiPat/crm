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
    if !funds.is_empty()
        && funds.iter().all(|f| {
            f.categorie
                .as_deref()
                .is_some_and(|c| normalized_oblig_category(c).contains("oblig"))
        })
    {
        return ScoringProfile::Obligations;
    }
    ScoringProfile::Equity
}

fn normalized_oblig_category(raw: &str) -> String {
    raw.trim()
        .to_lowercase()
        .replace('’', "'")
        .replace(['é', 'è', 'ê', 'ë'], "e")
        .replace(['à', 'â'], "a")
        .replace(['ù', 'û'], "u")
        .replace(['î', 'ï'], "i")
        .replace(['ô', 'ö'], "o")
        .replace('ç', "c")
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
    /// Écart brut minimal (points de perf) pour que le min-max relatif départage les fonds.
    /// En dessous, tous les fonds sont notés 50 : 0,1 pt d'écart ne doit pas donner 0 contre 100.
    /// Calibré par classe d'actif — la dispersion obligataire est bien plus faible qu'en actions.
    /// `0.0` = pas de plancher (critère sur échelle absolue ou proportionnelle).
    pub min_significant_delta: f64,
}

const EQUITY_CRITERIA: [CriterionDef; 7] = [
    CriterionDef {
        key: "perf_1an",
        label: "Perf. 1 an",
        weight_v1: 0.08,
        weight_v15: 0.05,
        pilier: Pilier::Performance,
        min_significant_delta: 1.5,
    },
    CriterionDef {
        key: "perf_3ans",
        label: "Perf. 3 ans",
        weight_v1: 0.16,
        weight_v15: 0.10,
        pilier: Pilier::Performance,
        min_significant_delta: 3.0,
    },
    CriterionDef {
        key: "perf_5ans",
        label: "Perf. 5 ans",
        weight_v1: 0.16,
        weight_v15: 0.10,
        pilier: Pilier::Performance,
        min_significant_delta: 5.0,
    },
    CriterionDef {
        key: "sharpe_3y",
        label: "Sharpe 3 ans",
        weight_v1: 0.45,
        weight_v15: 0.35,
        pilier: Pilier::Risque,
        min_significant_delta: 0.0,
    },
    CriterionDef {
        key: "max_drawdown",
        label: "Max drawdown",
        weight_v1: 0.0,
        weight_v15: 0.20,
        pilier: Pilier::Risque,
        min_significant_delta: 0.0,
    },
    CriterionDef {
        key: "aum",
        label: "Encours",
        weight_v1: 0.0,
        weight_v15: 0.10,
        pilier: Pilier::Structure,
        min_significant_delta: 0.0,
    },
    CriterionDef {
        key: "top10",
        label: "Concentration Top 10",
        weight_v1: 0.15,
        weight_v15: 0.10,
        pilier: Pilier::Structure,
        min_significant_delta: 0.0,
    },
];

const OBLIGATIONS_CRITERIA: [CriterionDef; 5] = [
    CriterionDef {
        key: "perf_1an",
        label: "Perf. 1 an",
        weight_v1: 0.30,
        weight_v15: 0.20,
        pilier: Pilier::Performance,
        min_significant_delta: 0.5,
    },
    CriterionDef {
        key: "perf_3ans",
        label: "Perf. 3 ans",
        weight_v1: 0.20,
        weight_v15: 0.15,
        pilier: Pilier::Performance,
        min_significant_delta: 1.0,
    },
    CriterionDef {
        key: "sharpe_3y",
        label: "Sharpe 3 ans",
        weight_v1: 0.50,
        weight_v15: 0.30,
        pilier: Pilier::Risque,
        min_significant_delta: 0.0,
    },
    CriterionDef {
        key: "max_drawdown",
        label: "Max drawdown",
        weight_v1: 0.0,
        weight_v15: 0.25,
        pilier: Pilier::Risque,
        min_significant_delta: 0.0,
    },
    CriterionDef {
        key: "aum",
        label: "Encours",
        weight_v1: 0.0,
        weight_v15: 0.10,
        pilier: Pilier::Structure,
        min_significant_delta: 0.0,
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

    fn delta(profile: ScoringProfile, key: &str) -> f64 {
        criteria_for_profile(profile)
            .iter()
            .find(|c| c.key == key)
            .expect(key)
            .min_significant_delta
    }

    /// La dispersion obligataire est bien plus faible qu'en actions : un seuil calé sur les
    /// actions effacerait des écarts obligataires réellement significatifs.
    #[test]
    fn obligations_thresholds_are_tighter_than_equity() {
        for key in ["perf_1an", "perf_3ans"] {
            assert!(
                delta(ScoringProfile::Obligations, key) < delta(ScoringProfile::Equity, key),
                "{key}"
            );
        }
    }

    /// Les critères sur échelle absolue ou proportionnelle n'ont pas de plancher d'écart.
    #[test]
    fn only_min_max_criteria_have_a_significance_floor() {
        for profile in [ScoringProfile::Equity, ScoringProfile::Obligations] {
            for def in criteria_for_profile(profile) {
                let expects_floor = matches!(def.key, "perf_1an" | "perf_3ans" | "perf_5ans");
                assert_eq!(
                    def.min_significant_delta > 0.0,
                    expects_floor,
                    "{} / {}",
                    profile.as_str(),
                    def.key
                );
            }
        }
    }
}
