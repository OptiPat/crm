use crate::uc_comparator::category_table::{family_for_normalized, normalize_category};
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

/// Volatilité 3 ans sous laquelle un fonds relève des produits de taux, quelle que soit son
/// étiquette (même coupure que le diagnostic frontend).
const RATES_VOLATILITY_CEILING: f64 = 5.0;

pub fn resolve_scoring_profile(funds: &[UcFundInput]) -> ScoringProfile {
    if !funds.is_empty() && funds.iter().all(is_bond_like) {
        return ScoringProfile::Obligations;
    }
    ScoringProfile::Equity
}

/// Le mot-clé « oblig » laissait au barème actions des fonds dont la dispersion se joue au
/// dixième de point : libellés obligataires anglais et fonds à capital garanti. Leur écart réel
/// passait alors sous le seuil de significativité actions et le comparateur ne départageait rien.
fn is_bond_like(fund: &UcFundInput) -> bool {
    if fund
        .vol_3ans
        .is_some_and(|v| v.is_finite() && v > 0.0 && v < RATES_VOLATILITY_CEILING)
    {
        return true;
    }
    let Some(categorie) = fund.categorie.as_deref() else {
        return false;
    };
    let normalized = normalize_category(categorie);
    if normalized.contains("oblig") {
        return true;
    }
    matches!(
        family_for_normalized(&normalized),
        Some(family) if family.starts_with("oblig_") || family == "capital_garanti_protege"
    )
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
    /// Barème courant : le Sharpe cesse d'écraser le classement, et le risque est jugé aussi par
    /// la volatilité mesurée et la pire année civile. Les critères absents de la v1 y valent 0,
    /// pour que les comparatifs archivés en v1 restent reproductibles à l'identique.
    pub weight_v2: f64,
    pub pilier: Pilier,
    /// Écart brut minimal (points de perf) pour que le min-max relatif départage les fonds.
    /// En dessous, tous les fonds sont notés 50 : 0,1 pt d'écart ne doit pas donner 0 contre 100.
    /// Calibré par classe d'actif — la dispersion obligataire est bien plus faible qu'en actions.
    /// `0.0` = pas de plancher (critère sur échelle absolue ou proportionnelle).
    pub min_significant_delta: f64,
}

const EQUITY_CRITERIA: [CriterionDef; 10] = [
    CriterionDef {
        key: "perf_1an",
        label: "Perf. 1 an",
        weight_v1: 0.08,
        weight_v15: 0.05,
        weight_v2: 0.06,
        pilier: Pilier::Performance,
        min_significant_delta: 1.5,
    },
    CriterionDef {
        key: "perf_3ans",
        label: "Perf. 3 ans",
        weight_v1: 0.16,
        weight_v15: 0.10,
        weight_v2: 0.12,
        pilier: Pilier::Performance,
        min_significant_delta: 3.0,
    },
    CriterionDef {
        key: "perf_5ans",
        label: "Perf. 5 ans",
        weight_v1: 0.16,
        weight_v15: 0.10,
        weight_v2: 0.12,
        pilier: Pilier::Performance,
        min_significant_delta: 5.0,
    },
    CriterionDef {
        key: "rang_categorie",
        label: "Rang dans la catégorie",
        weight_v1: 0.0,
        weight_v15: 0.0,
        weight_v2: 0.15,
        pilier: Pilier::Performance,
        min_significant_delta: 0.0,
    },
    CriterionDef {
        key: "sharpe_3y",
        label: "Sharpe 3 ans",
        weight_v1: 0.45,
        weight_v15: 0.35,
        weight_v2: 0.25,
        pilier: Pilier::Risque,
        min_significant_delta: 0.0,
    },
    CriterionDef {
        key: "vol_3ans",
        label: "Volatilité 3 ans",
        weight_v1: 0.0,
        weight_v15: 0.0,
        weight_v2: 0.08,
        pilier: Pilier::Risque,
        min_significant_delta: 1.0,
    },
    CriterionDef {
        key: "worst_year",
        label: "Pire année civile",
        weight_v1: 0.0,
        weight_v15: 0.0,
        weight_v2: 0.12,
        pilier: Pilier::Risque,
        min_significant_delta: 2.0,
    },
    CriterionDef {
        key: "max_drawdown",
        label: "Max drawdown",
        weight_v1: 0.0,
        weight_v15: 0.20,
        weight_v2: 0.0,
        pilier: Pilier::Risque,
        min_significant_delta: 0.0,
    },
    CriterionDef {
        key: "aum",
        label: "Encours",
        weight_v1: 0.0,
        weight_v15: 0.10,
        weight_v2: 0.0,
        pilier: Pilier::Structure,
        min_significant_delta: 0.0,
    },
    CriterionDef {
        key: "top10",
        label: "Concentration Top 10",
        weight_v1: 0.15,
        weight_v15: 0.10,
        weight_v2: 0.10,
        pilier: Pilier::Structure,
        min_significant_delta: 0.0,
    },
];

const OBLIGATIONS_CRITERIA: [CriterionDef; 8] = [
    CriterionDef {
        key: "perf_1an",
        label: "Perf. 1 an",
        weight_v1: 0.30,
        weight_v15: 0.20,
        weight_v2: 0.20,
        pilier: Pilier::Performance,
        min_significant_delta: 0.5,
    },
    CriterionDef {
        key: "perf_3ans",
        label: "Perf. 3 ans",
        weight_v1: 0.20,
        weight_v15: 0.15,
        weight_v2: 0.15,
        pilier: Pilier::Performance,
        min_significant_delta: 1.0,
    },
    CriterionDef {
        key: "rang_categorie",
        label: "Rang dans la catégorie",
        weight_v1: 0.0,
        weight_v15: 0.0,
        weight_v2: 0.15,
        pilier: Pilier::Performance,
        min_significant_delta: 0.0,
    },
    CriterionDef {
        key: "sharpe_3y",
        label: "Sharpe 3 ans",
        weight_v1: 0.50,
        weight_v15: 0.30,
        weight_v2: 0.25,
        pilier: Pilier::Risque,
        min_significant_delta: 0.0,
    },
    CriterionDef {
        key: "vol_3ans",
        label: "Volatilité 3 ans",
        weight_v1: 0.0,
        weight_v15: 0.0,
        weight_v2: 0.10,
        pilier: Pilier::Risque,
        min_significant_delta: 0.4,
    },
    CriterionDef {
        key: "worst_year",
        label: "Pire année civile",
        weight_v1: 0.0,
        weight_v15: 0.0,
        weight_v2: 0.15,
        pilier: Pilier::Risque,
        min_significant_delta: 0.8,
    },
    CriterionDef {
        key: "max_drawdown",
        label: "Max drawdown",
        weight_v1: 0.0,
        weight_v15: 0.25,
        weight_v2: 0.0,
        pilier: Pilier::Risque,
        min_significant_delta: 0.0,
    },
    CriterionDef {
        key: "aum",
        label: "Encours",
        weight_v1: 0.0,
        weight_v15: 0.10,
        weight_v2: 0.0,
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
            vol_3ans: None,
            top10_percent: None,
            max_drawdown_3y: None,
            aum_meur: None,
            ..Default::default()
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
    fn obligations_profile_for_english_bond_labels_from_the_table() {
        // Sans « oblig » dans le libellé, ces fonds héritaient du barème actions et de son seuil
        // de significativité de 1,5 pt — ils n'étaient donc jamais départagés.
        assert_eq!(
            resolve_scoring_profile(&[
                fund(Some("Global Diversified Bond")),
                fund(Some("EUR Subordinated Bond")),
            ]),
            ScoringProfile::Obligations
        );
        assert_eq!(
            resolve_scoring_profile(&[
                fund(Some("FONDS A CAPITAL GARANTI")),
                fund(Some("FONDS A CAPITAL PROTEGE")),
            ]),
            ScoringProfile::Obligations
        );
    }

    #[test]
    fn obligations_profile_when_measured_volatility_is_low() {
        let mut calme = fund(Some("Allocation Autres"));
        calme.vol_3ans = Some(2.4);
        assert_eq!(
            resolve_scoring_profile(&[calme]),
            ScoringProfile::Obligations
        );
    }

    #[test]
    fn equity_profile_stays_for_a_single_equity_fund_in_the_pair() {
        assert_eq!(
            resolve_scoring_profile(&[
                fund(Some("Global Diversified Bond")),
                fund(Some("Actions Europe Gdes Cap. Mixte")),
            ]),
            ScoringProfile::Equity
        );
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
        for key in ["perf_1an", "perf_3ans", "vol_3ans", "worst_year"] {
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
                let expects_floor = matches!(
                    def.key,
                    "perf_1an" | "perf_3ans" | "perf_5ans" | "vol_3ans" | "worst_year"
                );
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
