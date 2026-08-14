//! Matching fuzzy des noms produit (étiquettes auto, campagnes SCPI, etc.).

pub const MIN_PRODUIT_MATCH_LEN: usize = 4;

pub fn normalize_produit_match_key(value: &str) -> String {
    value
        .to_lowercase()
        .chars()
        .filter_map(|c| match c {
            'à' | 'á' | 'â' | 'ä' | 'ã' | 'å' => Some('a'),
            'ç' => Some('c'),
            'è' | 'é' | 'ê' | 'ë' => Some('e'),
            'ì' | 'í' | 'î' | 'ï' => Some('i'),
            'ò' | 'ó' | 'ô' | 'ö' | 'õ' => Some('o'),
            'ù' | 'ú' | 'û' | 'ü' => Some('u'),
            'ÿ' => Some('y'),
            'œ' => Some('o'),
            'æ' => Some('a'),
            c if c.is_alphanumeric() => Some(c),
            _ => None,
        })
        .collect()
}

fn produit_match_tokens(value: &str) -> Vec<String> {
    value
        .split(|c: char| !c.is_alphanumeric())
        .filter(|s| !s.is_empty())
        .map(|s| normalize_produit_match_key(s))
        .filter(|s| s.len() >= MIN_PRODUIT_MATCH_LEN)
        .collect()
}

/// Préfixes d’enveloppe / canal, pas une SCPI distincte.
const PRODUIT_IGNORABLE_TOKENS: &[&str] = &["scpi", "alpsi", "cif"];

fn significant_produit_tokens(value: &str) -> Vec<String> {
    let mut tokens: Vec<String> = produit_match_tokens(value)
        .into_iter()
        .filter(|t| !PRODUIT_IGNORABLE_TOKENS.contains(&t.as_str()))
        .collect();
    tokens.sort();
    tokens.dedup();
    tokens
}

pub fn nom_produit_matches(investissement_nom: &str, target: &str) -> bool {
    let target_norm = normalize_produit_match_key(target);
    if target_norm.is_empty() {
        return false;
    }
    let inv_norm = normalize_produit_match_key(investissement_nom);
    if inv_norm == target_norm {
        return true;
    }
    if target_norm.len() < MIN_PRODUIT_MATCH_LEN {
        return false;
    }
    let target_tokens = produit_match_tokens(target);
    if target_tokens.is_empty() {
        return false;
    }
    let inv_tokens = produit_match_tokens(investissement_nom);
    target_tokens
        .iter()
        .all(|token| inv_tokens.iter().any(|it| it == token))
}

/// Même SCPI (campagnes bulletins) : « Épargne Pierre » ≠ « Épargne Pierre Europe ».
/// Les préfixes SCPI / ALPSI / CIF restent ignorés (« SCPI Comète » = « Comète »).
pub fn nom_produit_matches_same_scpi(investissement_nom: &str, bulletin_key: &str) -> bool {
    let inv_norm = normalize_produit_match_key(investissement_nom);
    let target_norm = normalize_produit_match_key(bulletin_key);
    if inv_norm.is_empty() || target_norm.is_empty() {
        return false;
    }
    if inv_norm == target_norm {
        return true;
    }
    let inv_sig = significant_produit_tokens(investissement_nom);
    let target_sig = significant_produit_tokens(bulletin_key);
    if inv_sig.is_empty() || target_sig.is_empty() {
        return nom_produit_matches(investissement_nom, bulletin_key);
    }
    inv_sig == target_sig
}

#[cfg(test)]
mod tests {
    use super::{nom_produit_matches, nom_produit_matches_same_scpi};

    #[test]
    fn nom_produit_matches_fuzzy() {
        assert!(nom_produit_matches("SCPI Comète", "Comète"));
        assert!(nom_produit_matches("Comete", "Comète"));
        assert!(nom_produit_matches("Corum Origin", "Corum"));
        assert!(!nom_produit_matches("Primovie", "Comète"));
        assert!(!nom_produit_matches("Primovie", "Vie"));
        assert!(!nom_produit_matches("Primovie", "vie"));
    }

    #[test]
    fn nom_produit_matches_exact_short_name() {
        assert!(nom_produit_matches("Vie", "Vie"));
        assert!(nom_produit_matches("Contrat Vie", "Contrat Vie"));
    }

    #[test]
    fn nom_produit_matches_same_scpi_distinguishes_nested_names() {
        assert!(nom_produit_matches("Epargne Pierre Europe", "Epargne Pierre"));
        assert!(!nom_produit_matches_same_scpi(
            "Epargne Pierre Europe",
            "Epargne Pierre"
        ));
        assert!(nom_produit_matches_same_scpi(
            "Epargne Pierre Europe",
            "Epargne Pierre Europe"
        ));
        assert!(nom_produit_matches_same_scpi(
            "Épargne Pierre Europe ALPSI",
            "Epargne Pierre Europe"
        ));
        assert!(nom_produit_matches_same_scpi("SCPI Comète", "Comète"));
        assert!(nom_produit_matches_same_scpi("Comète", "SCPI Comète"));
        assert!(!nom_produit_matches_same_scpi(
            "Transitions Europe",
            "Europe"
        ));
        assert!(!nom_produit_matches_same_scpi("Corum Origin", "Corum"));
    }
}
