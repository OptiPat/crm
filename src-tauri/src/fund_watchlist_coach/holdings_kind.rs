/// Classification des lignes Boursorama pour éviter des recherches RSS « entreprise »
/// sur des dérivés, obligations souveraines ou poches monétaires.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum HoldingLineKind {
    Company,
    Derivative,
    SovereignOrRate,
    CashOrLiquidity,
}

pub fn classify_holding_label(label: &str) -> HoldingLineKind {
    let upper = label.to_uppercase();
    if is_cash_or_liquidity(&upper) {
        return HoldingLineKind::CashOrLiquidity;
    }
    if is_sovereign_or_rate(&upper) {
        return HoldingLineKind::SovereignOrRate;
    }
    if is_derivative_or_index(&upper) {
        return HoldingLineKind::Derivative;
    }
    HoldingLineKind::Company
}

pub fn holding_skips_news_search(label: &str) -> bool {
    !matches!(
        classify_holding_label(label),
        HoldingLineKind::Company
    )
}

pub fn holding_actu_placeholder(kind: HoldingLineKind) -> &'static str {
    match kind {
        HoldingLineKind::Company => "Aucune actualité récente disponible.",
        HoldingLineKind::Derivative => {
            "Type : instrument de couverture / dérivé (pas d'actu entreprise)."
        }
        HoldingLineKind::SovereignOrRate => {
            "Type : ligne souveraine / taux (pas d'actu entreprise)."
        }
        HoldingLineKind::CashOrLiquidity => {
            "Type : poche monétaire / liquidités (pas d'actu entreprise)."
        }
    }
}

fn is_derivative_or_index(upper: &str) -> bool {
    upper.contains(" FUTURE")
        || upper.contains(" FUTURES")
        || upper.contains("EMINI")
        || upper.contains("E-MINI")
        || upper.contains(" SWAP")
        || upper.contains("SWAPS")
        || upper.contains("INDEX FUTURE")
        || upper.contains(" OPTION ")
        || upper.contains(" OPTIONS ")
        || upper.contains(" CALL ")
        || upper.contains(" PUT ")
}

fn is_sovereign_or_rate(upper: &str) -> bool {
    let sovereign = upper.contains("REPUBLIC OF")
        || upper.contains("KINGDOM OF")
        || upper.contains("FEDERAL REPUBLIC");
    sovereign && upper.contains("0%")
}

fn is_cash_or_liquidity(upper: &str) -> bool {
    upper.contains("LIQD")
        || upper.contains("LIQUIDIT")
        || upper.contains("TRESORERIE")
        || upper.contains("TRÉSORERIE")
        || upper.contains(" LVNAV")
        || upper.starts_with("RMM ")
        || upper.contains(" RMM ")
        || upper.contains("LIQUIDITES")
        || upper.contains("LIQUIDITÉS")
        || upper.contains("MONEY MARKET")
        || upper.contains("MONÉTAIRE")
        || upper.contains("MONETAIRE")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn btp_future_is_derivative() {
        assert_eq!(
            classify_holding_label("Long-Term Euro BTP Future Dec 25"),
            HoldingLineKind::Derivative
        );
    }

    #[test]
    fn russell_emini_is_derivative() {
        assert_eq!(
            classify_holding_label("RUSSELL 2000 EMINI CME SEP 26"),
            HoldingLineKind::Derivative
        );
    }

    #[test]
    fn sovereign_bond_skips_company_news() {
        assert_eq!(
            classify_holding_label("France (Republic Of) 0%"),
            HoldingLineKind::SovereignOrRate
        );
    }

    #[test]
    fn liquidity_fund_is_cash() {
        assert_eq!(
            classify_holding_label("RMM Court Terme IC"),
            HoldingLineKind::CashOrLiquidity
        );
    }

    #[test]
    fn tsmc_remains_company() {
        assert_eq!(
            classify_holding_label("Taiwan Semiconductor Manufacturing Co Ltd"),
            HoldingLineKind::Company
        );
        assert!(!holding_skips_news_search(
            "Taiwan Semiconductor Manufacturing Co Ltd"
        ));
    }

    #[test]
    fn portfolio_swap_is_derivative() {
        assert_eq!(
            classify_holding_label("UBS PORTFOLIO SWAP EUR"),
            HoldingLineKind::Derivative
        );
    }
}
