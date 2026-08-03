use crate::uc_comparator::types::UcFundInput;

fn normalize_category(raw: &str) -> String {
    raw.trim().to_lowercase()
}

/// Tous les fonds doivent partager la même catégorie (y compris toutes `None`).
pub fn categories_match(funds: &[UcFundInput]) -> bool {
    if funds.len() < 2 {
        return true;
    }
    let first = funds[0]
        .categorie
        .as_deref()
        .map(normalize_category)
        .unwrap_or_default();
    funds.iter().all(|f| {
        let cat = f
            .categorie
            .as_deref()
            .map(normalize_category)
            .unwrap_or_default();
        cat == first
    })
}

pub fn shared_category_label(funds: &[UcFundInput]) -> Option<String> {
    funds.first()?.categorie.clone()
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
    fn rejects_mixed_categories() {
        assert!(!categories_match(&[
            fund(Some("Actions Europe")),
            fund(Some("Obligations Euro")),
        ]));
    }

    #[test]
    fn accepts_same_category() {
        assert!(categories_match(&[
            fund(Some("Actions Europe")),
            fund(Some("  actions europe ")),
        ]));
    }
}
