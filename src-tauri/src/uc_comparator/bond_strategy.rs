//! Inférence qualité crédit (HY / IG) et stratégie obligataire depuis catégorie + nom.

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct BondFundProfile {
    pub credit_quality: Option<String>,
    pub strategy: Option<String>,
}

fn normalize_text(raw: &str) -> String {
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

fn contains_any(haystack: &str, needles: &[&str]) -> bool {
    needles.iter().any(|needle| haystack.contains(needle))
}

fn infer_credit_quality(normalized: &str) -> Option<String> {
    if contains_any(
        normalized,
        &[
            "high yield",
            "high-yield",
            "haut rendement",
            "hauts rendements",
            "rendement eleve",
            "rendements eleves",
            "sub investment",
            "sub-investment",
            "speculative grade",
            "speculative",
            "hy bond",
            " hy ",
        ],
    ) {
        return Some("High Yield".to_string());
    }
    if contains_any(
        normalized,
        &[
            "investment grade",
            "investment-grade",
            "invest grade",
            "investissement",
            " ig ",
            "investment quality",
            "quality bond",
        ],
    ) {
        return Some("Investment Grade".to_string());
    }
    None
}

fn has_target_maturity_year(normalized: &str) -> bool {
    for year in 2020..=2045 {
        let token = year.to_string();
        if normalized.contains(&token) {
            return true;
        }
    }
    false
}

fn infer_strategy(normalized: &str) -> Option<String> {
    if contains_any(
        normalized,
        &[
            "ultra short",
            "ultra-short",
            "ultra court",
            "ultra-court",
            "money market",
            "monetaire",
            "monétaire",
            "tresorerie",
            "trésorerie",
            "cash plus",
        ],
    ) {
        return Some("Ultra court terme / monétaire".to_string());
    }
    if contains_any(
        normalized,
        &["short term", "short-term", "court terme", "courterme", "courte duree"],
    ) {
        return Some("Court terme".to_string());
    }
    if contains_any(normalized, &["convertible", "convertibles"]) {
        return Some("Convertibles".to_string());
    }
    if contains_any(normalized, &["credit", "crédit", "corporate"])
        && has_target_maturity_year(normalized)
    {
        return Some("Crédit à échéance".to_string());
    }
    if contains_any(
        normalized,
        &[
            "gouvernement",
            "government",
            "souverain",
            "sovereign",
            "treasury",
            "treasuries",
            "btp",
            "bund",
        ],
    ) {
        return Some("Souverain / taux".to_string());
    }
    if contains_any(normalized, &["credit", "crédit", "corporate"]) {
        return Some("Crédit corporate".to_string());
    }
    if contains_any(
        normalized,
        &[
            "flexible",
            "international",
            "internationales",
            "global",
            "multistrateg",
            "multi-strateg",
        ],
    ) {
        return Some("Flexible / global".to_string());
    }
    if contains_any(normalized, &["obligations euro", "oblig euro", "euro bond"]) {
        return Some("Obligations euro".to_string());
    }
    if normalized.contains("obligations") || normalized.contains("oblig ") {
        return Some("Obligations".to_string());
    }
    None
}

/// Déduit qualité crédit et stratégie à partir de la catégorie Morningstar et du nom commercial.
pub fn infer_bond_fund_profile(categorie: Option<&str>, nom: &str) -> BondFundProfile {
    let haystack = format!(
        "{} {}",
        categorie.unwrap_or_default(),
        nom
    );
    let normalized = normalize_text(&haystack);
    BondFundProfile {
        credit_quality: infer_credit_quality(&normalized),
        strategy: infer_strategy(&normalized),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn detects_high_yield_from_category() {
        let profile = infer_bond_fund_profile(
            Some("EUR Corporate Bond - High Yield"),
            "Some Fund A",
        );
        assert_eq!(profile.credit_quality.as_deref(), Some("High Yield"));
    }

    #[test]
    fn detects_investment_grade_from_french_label() {
        let profile = infer_bond_fund_profile(
            Some("Obligations Euro Investissement"),
            "Fonds IG",
        );
        assert_eq!(profile.credit_quality.as_deref(), Some("Investment Grade"));
    }

    #[test]
    fn detects_ultra_short_strategy() {
        let profile = infer_bond_fund_profile(
            Some("Obligations"),
            "Ostrum Credit Ultra Short Plus RE",
        );
        assert_eq!(
            profile.strategy.as_deref(),
            Some("Ultra court terme / monétaire")
        );
    }

    #[test]
    fn detects_target_maturity_credit() {
        let profile = infer_bond_fund_profile(
            Some("Obligations"),
            "Carmignac Credit 2027 A EUR Acc",
        );
        assert_eq!(profile.strategy.as_deref(), Some("Crédit à échéance"));
    }

    #[test]
    fn detects_short_term_and_flexible() {
        let short = infer_bond_fund_profile(Some("Obligations"), "Schelcher Short Term Z");
        assert_eq!(short.strategy.as_deref(), Some("Court terme"));

        let flex = infer_bond_fund_profile(
            Some("Obligations"),
            "Amundi Oblig Internationales Flexible EUR-P-C",
        );
        assert_eq!(flex.strategy.as_deref(), Some("Flexible / global"));
    }
}
