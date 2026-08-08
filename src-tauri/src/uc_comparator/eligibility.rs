use crate::uc_comparator::category_table::{
    family_for_normalized, is_excluded_normalized, label_for_family, normalize_category,
};
use crate::uc_comparator::types::UcFundInput;

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct CategoryEligibility {
    pub compatible: bool,
    pub exact_match: bool,
    pub meta_key: Option<String>,
    pub display_label: Option<String>,
    pub subcategory_warning: Option<String>,
}

/// Méta-catégorie pour regrouper des libellés Morningstar/Boursorama proches.
fn meta_category_key(normalized: &str) -> Option<&'static str> {
    if normalized.is_empty() {
        return None;
    }

    // Table explicite d'abord ; les mots-clés ci-dessous ne servent plus qu'aux libellés
    // absents de la table (Boursorama / Morningstar hors catalogue Cristalliance).
    if let Some(family) = family_for_normalized(normalized) {
        return Some(family);
    }

    let rules: [(&[&str], &str); 10] = [
        (
            &[
                "actions secteur technolog",
                "secteur technolog",
                "actions technolog",
                "technologie",
            ],
            "actions_tech",
        ),
        (
            &[
                "asie hors japon",
                "asia pacific",
                "asia ex japan",
                "actions asie",
                "actions asiatique",
                "asiatique",
                "asian",
                "asie pacifique",
                "marches emergents asie",
                "marche emergent asie",
                "emergents asie",
                "asia discovery",
                "asia growth",
                "actions japon",
                "japon",
                "japan",
            ],
            "actions_asie_pacifique",
        ),
        (
            &[
                "actions international",
                "international gdes cap",
                "international grandes cap",
                "global large",
                "global equity",
                "world large",
                "world equity",
                "foreign large",
                "actions monde",
            ],
            "actions_international",
        ),
        (
            &["actions europe", "europe grandes", "eurozone", "zone euro"],
            "actions_europe",
        ),
        (
            &["actions amerique", "actions usa", "etats-unis", "north america"],
            "actions_us",
        ),
        (&["obligations euro", "oblig euro"], "oblig_euro"),
        (&["obligations"], "oblig"),
        (&["monetaire", "monétaire", "tresorerie"], "monetaire"),
        (&["diversifie", "diversifié", "allocation"], "diversifie"),
        (&["immobilier", "reits"], "immobilier"),
    ];

    for (needles, key) in rules {
        if needles.iter().any(|needle| normalized.contains(needle)) {
            return Some(key);
        }
    }

    if normalized.contains("asie")
        || normalized.contains("asia")
        || normalized.contains("japon")
        || normalized.contains("japan")
    {
        return Some("actions_asie_pacifique");
    }

    None
}

fn meta_category_label(key: &str) -> &'static str {
    if let Some(label) = label_for_family(key) {
        return label;
    }
    match key {
        "actions_tech" => "Actions Secteur Technologies",
        "actions_asie_pacifique" => "Actions Asie / Japon",
        "actions_international" => "Actions International",
        "actions_europe" => "Actions Europe",
        "actions_us" => "Actions États-Unis",
        "oblig_euro" => "Obligations Euro",
        "oblig" => "Obligations",
        "monetaire" => "Monétaire",
        "diversifie" => "Diversifié",
        "immobilier" => "Immobilier",
        _ => "Autre",
    }
}

fn normalized_categories(funds: &[UcFundInput]) -> Vec<String> {
    funds
        .iter()
        .map(|f| {
            f.categorie
                .as_deref()
                .map(normalize_category)
                .unwrap_or_default()
        })
        .collect()
}

fn unique_nonempty(values: &[String]) -> Vec<String> {
    let mut out = Vec::new();
    for value in values {
        if value.is_empty() {
            continue;
        }
        if !out.iter().any(|existing| existing == value) {
            out.push(value.clone());
        }
    }
    out
}

fn fund_has_category(fund: &UcFundInput) -> bool {
    fund.categorie
        .as_ref()
        .map(|c| !c.trim().is_empty())
        .unwrap_or(false)
}

fn all_funds_have_category(funds: &[UcFundInput]) -> bool {
    funds.iter().all(fund_has_category)
}

pub fn evaluate_categories(funds: &[UcFundInput]) -> CategoryEligibility {
    if funds.len() < 2 {
        return CategoryEligibility {
            compatible: true,
            exact_match: true,
            meta_key: None,
            display_label: funds.first().and_then(|f| f.categorie.clone()),
            subcategory_warning: None,
        };
    }

    if !all_funds_have_category(funds) {
        return CategoryEligibility {
            compatible: false,
            exact_match: false,
            meta_key: None,
            display_label: None,
            subcategory_warning: None,
        };
    }

    let normalized = normalized_categories(funds);

    // Valorisation trimestrielle et lissée : un score de performance relative n'y a pas de sens,
    // au même titre que le badge de diagnostic qui n'est pas calculé pour ces catégories.
    if normalized.iter().any(|c| is_excluded_normalized(c)) {
        return CategoryEligibility {
            compatible: false,
            exact_match: false,
            meta_key: None,
            display_label: None,
            subcategory_warning: None,
        };
    }

    let unique_exact = unique_nonempty(&normalized);

    if unique_exact.len() <= 1 {
        let label = funds
            .iter()
            .find_map(|f| f.categorie.clone())
            .or_else(|| unique_exact.first().cloned());
        return CategoryEligibility {
            compatible: true,
            exact_match: true,
            meta_key: normalized
                .iter()
                .find_map(|c| meta_category_key(c))
                .map(str::to_string),
            display_label: label,
            subcategory_warning: None,
        };
    }

    let meta_keys: Vec<Option<&str>> = normalized.iter().map(|c| meta_category_key(c)).collect();
    let unique_meta: Vec<&str> = meta_keys
        .iter()
        .filter_map(|k| *k)
        .fold(Vec::new(), |mut acc, key| {
            if !acc.contains(&key) {
                acc.push(key);
            }
            acc
        });

    if unique_meta.len() == 1 {
        let meta = unique_meta[0];
        let raw_labels: Vec<String> = funds
            .iter()
            .filter_map(|f| f.categorie.clone())
            .collect();
        let unique_raw: Vec<String> = raw_labels
            .iter()
            .fold(Vec::new(), |mut acc, label| {
                if !acc.iter().any(|existing| existing == label) {
                    acc.push(label.clone());
                }
                acc
            });
        let warning = if unique_raw.len() > 1 {
            Some(format!(
                "Sous-catégories distinctes mais comparables : {}.",
                unique_raw.join(" · ")
            ))
        } else {
            None
        };
        return CategoryEligibility {
            compatible: true,
            exact_match: false,
            meta_key: Some(meta.to_string()),
            display_label: Some(meta_category_label(meta).to_string()),
            subcategory_warning: warning,
        };
    }

    CategoryEligibility {
        compatible: false,
        exact_match: false,
        meta_key: None,
        display_label: None,
        subcategory_warning: None,
    }
}

/// Compatibilité de comparaison (méta-catégorie ou libellé strictement identique).
pub fn categories_match(funds: &[UcFundInput]) -> bool {
    evaluate_categories(funds).compatible
}

pub fn shared_category_label(funds: &[UcFundInput]) -> Option<String> {
    evaluate_categories(funds).display_label
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
    fn rejects_obligations_vs_actions() {
        assert!(!categories_match(&[
            fund(Some("Actions Europe")),
            fund(Some("Obligations Euro")),
        ]));
    }

    #[test]
    fn accepts_same_category_exact() {
        assert!(categories_match(&[
            fund(Some("Actions Europe")),
            fund(Some("  actions europe ")),
        ]));
    }

    #[test]
    fn rejects_when_any_category_missing() {
        assert!(!categories_match(&[
            fund(Some("Actions Europe")),
            fund(None),
        ]));
        assert!(!categories_match(&[fund(None), fund(None)]));
    }

    #[test]
    fn refuses_categories_excluded_from_diagnostic() {
        assert!(!categories_match(&[fund(Some("FCPR")), fund(Some("FCPR"))]));
    }

    #[test]
    fn groups_through_the_explicit_table() {
        let eval = evaluate_categories(&[
            fund(Some("Actions France Grandes Cap.")),
            fund(Some("Actions Europe Gdes Cap. Mixte")),
        ]);
        assert!(eval.compatible);
        assert_eq!(eval.meta_key.as_deref(), Some("actions_europe_grandes"));
        assert_eq!(
            eval.display_label.as_deref(),
            Some("Actions Europe grandes cap.")
        );
    }

    #[test]
    fn separates_labels_the_keyword_rules_confused() {
        // « zone euro » était testé avant « immobilier » : l'immobilier tombait dans les actions.
        assert!(!categories_match(&[
            fund(Some("Immobilier - Indirect Zone Euro")),
            fund(Some("Actions Zone Euro Grandes Cap.")),
        ]));
        // « diversified » contient « diversifie » : ce fonds obligataire passait pour un diversifié.
        assert!(!categories_match(&[
            fund(Some("Global Diversified Bond")),
            fund(Some("Allocation EUR Flexible")),
        ]));
        // Grandes et petites capitalisations européennes ne se comparent plus.
        assert!(!categories_match(&[
            fund(Some("Actions Europe Gdes Cap. Mixte")),
            fund(Some("Actions Europe Petites Cap.")),
        ]));
    }

    #[test]
    fn accepts_asia_subcategory_variants() {
        let eval = evaluate_categories(&[
            fund(Some("Actions Asie Hors Japon Grandes Capitalisations")),
            fund(Some("Actions Asie Croissance")),
        ]);
        assert!(eval.compatible);
        assert!(!eval.exact_match);
        assert_eq!(eval.meta_key.as_deref(), Some("actions_asie_pacifique"));
        assert!(eval.subcategory_warning.is_some());
    }

    #[test]
    fn accepts_japan_morningstar_subcategory_variants() {
        let eval = evaluate_categories(&[
            fund(Some("Japan Large-Cap Growth Equity")),
            fund(Some("Japan Large-Cap Blend Equity")),
        ]);
        assert!(eval.compatible);
        assert!(!eval.exact_match);
        assert_eq!(eval.meta_key.as_deref(), Some("actions_asie_pacifique"));
        assert_eq!(
            eval.display_label.as_deref(),
            Some("Actions Asie / Chine / Japon")
        );
    }

    #[test]
    fn accepts_japan_with_asia_pacific_in_same_bucket() {
        assert!(categories_match(&[
            fund(Some("Japan Large-Cap Blend Equity")),
            fund(Some("Actions Asie Pacifique")),
        ]));
    }

    #[test]
    fn accepts_templeton_vs_carmignac_asia_style_labels() {
        let eval = evaluate_categories(&[
            fund(Some("Actions Asie Pacifique")),
            fund(Some("Actions Marchés Emergents Asie")),
        ]);
        assert!(eval.compatible);
        assert_eq!(
            eval.display_label.as_deref(),
            Some("Actions Asie / Chine / Japon")
        );
    }

    #[test]
    fn accepts_tech_sector_variants() {
        // Deux libellés hors table : les mots-clés les rapprochent toujours.
        assert!(categories_match(&[
            fund(Some("Actions Technologie")),
            fund(Some("Actions Secteur Technologie Monde")),
        ]));
    }

    #[test]
    fn refuses_table_label_paired_with_foreign_label() {
        // « Actions Secteur Technologies » vient du catalogue Cristalliance, l'autre non : rien
        // ne prouve qu'ils couvrent le même univers (les mots-clés confondent d'ailleurs
        // technologie et biotechnologie). Mieux vaut refuser la comparaison que la fausser.
        assert!(!categories_match(&[
            fund(Some("Actions Secteur Technologies")),
            fund(Some("Actions Technologie")),
        ]));
    }

    #[test]
    fn accepts_international_large_cap_growth_and_blend() {
        let eval = evaluate_categories(&[
            fund(Some("Actions International Gdes Cap. Croissance")),
            fund(Some("Actions International Gdes Cap. Mixte")),
            fund(Some("Actions International Gdes Cap. Croissance")),
        ]);
        assert!(eval.compatible);
        assert!(!eval.exact_match);
        assert_eq!(eval.meta_key.as_deref(), Some("actions_international"));
        assert_eq!(eval.display_label.as_deref(), Some("Actions International"));
        assert!(eval.subcategory_warning.is_some());
    }

    #[test]
    fn accepts_comgest_ecofi_echiquier_world_labels() {
        assert!(categories_match(&[
            fund(Some("Actions International Gdes Cap. Croissance")),
            fund(Some("Actions International Gdes Cap. Mixte")),
            fund(Some("World Large-Cap Growth Equity")),
        ]));
    }
}
