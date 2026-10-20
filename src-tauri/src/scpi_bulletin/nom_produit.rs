//! Heuristiques nom SCPI / période (ex-n8n « Accumuler bulletin »).

use crate::database::investissement_produit_match::nom_produit_matches_same_scpi;

const FICHIER_SKIP_TOKENS: &[&str] = &[
    "bti", "bulletin", "trimestre", "trim", "scpi", "t1", "t2", "t3", "t4", "1er", "2e", "3e",
    "4e",
];

fn is_skipped_fichier_token(part: &str) -> bool {
    let lower = part.to_lowercase();
    if FICHIER_SKIP_TOKENS.contains(&lower.as_str()) {
        return true;
    }
    if lower.len() == 2
        && lower.starts_with('t')
        && lower.chars().nth(1).is_some_and(|c| c.is_ascii_digit())
    {
        return true;
    }
    lower.len() == 4
        && lower.starts_with("20")
        && lower.chars().all(|c| c.is_ascii_digit())
}

pub fn infer_from_summary(summary: &str) -> Option<String> {
    for line in summary.lines() {
        let mut t = line.trim();
        if t.starts_with("## ") {
            t = t.trim_start_matches('#').trim();
        }
        t = t.trim_matches('*').trim();
        if let Some(rest) = t.strip_prefix("1.") {
            t = rest.trim();
        }
        let dash_idx = t.find('–').or_else(|| t.find('-'));
        let name = if let Some(idx) = dash_idx {
            t[..idx].trim()
        } else {
            continue;
        };
        let cleaned = name
            .trim()
            .trim_start_matches("scpi ")
            .trim_start_matches("SCPI ")
            .to_string();
        if cleaned.len() >= 4 {
            return Some(cleaned);
        }
    }
    None
}

pub fn guess_nom_produit_from_file(file_name: &str, scpi_name: &str) -> String {
    let base = file_name
        .rsplit(['/', '\\'])
        .next()
        .unwrap_or(file_name)
        .trim()
        .strip_suffix(".pdf")
        .or_else(|| file_name.strip_suffix(".PDF"))
        .unwrap_or(file_name)
        .trim()
        .to_string();
    let fallback = if base.is_empty() {
        scpi_name.trim().to_string()
    } else {
        base.clone()
    };
    let parts: Vec<&str> = fallback
        .split(|c: char| {
            c.is_whitespace() || c == '_' || c == '-' || c == '–' || c == '—'
        })
        .filter(|s| !s.is_empty())
        .filter(|part| !is_skipped_fichier_token(part))
        .collect();
    if parts.is_empty() {
        fallback
    } else {
        parts.join(" ")
    }
}

fn names_overlap(a: &str, b: &str) -> bool {
    let al = a.to_lowercase();
    let bl = b.to_lowercase();
    if al == bl || al.contains(&bl) || bl.contains(&al) {
        return true;
    }
    let tokens: Vec<&str> = al.split_whitespace().filter(|t| t.len() >= 4).collect();
    !tokens.is_empty() && tokens.iter().all(|t| bl.contains(t))
}

pub fn pick_nom_produit(summary: &str, file_name: &str, scpi_name: &str) -> String {
    let from_summary = infer_from_summary(summary);
    let from_file = guess_nom_produit_from_file(file_name, scpi_name);
    match (from_summary.as_deref(), from_file.as_str()) {
        (Some(summary), file) if names_overlap(summary, file) => {
            if summary.len() >= file.len() {
                summary.to_string()
            } else {
                file.to_string()
            }
        }
        (Some(_), file) => file.to_string(),
        (None, file) => file.to_string(),
    }
}

pub fn guess_periode(file_name: &str, summary: &str) -> String {
    // Le nom de fichier prime : le résumé cite souvent le trimestre précédent (ex. « vs T1 2026 »).
    if let Some(p) = parse_t_period(file_name) {
        return p;
    }
    if let Some(p) = parse_trimestre_period(file_name) {
        return p;
    }
    let summary_head: String = summary.chars().take(800).collect();
    if let Some(p) = parse_t_period(&summary_head) {
        return p;
    }
    if let Some(p) = parse_trimestre_period(&summary_head) {
        return p;
    }
    "Trimestre".to_string()
}

/// Période exploitable : trimestre + année (sinon deux bulletins différents partagent la clé « Trimestre »).
pub fn periode_has_year(periode: &str) -> bool {
    periode
        .as_bytes()
        .windows(4)
        .any(|w| w.iter().all(u8::is_ascii_digit))
}

/// Période de campagne : majorité des guesses fichiers (évite un 1er PDF mal parsé).
pub fn choose_campaign_periode(guesses: &[String]) -> String {
    // Voter parmi les périodes avec année ; « Trimestre » seulement si aucune n'en a.
    let with_year: Vec<String> = guesses
        .iter()
        .filter(|g| periode_has_year(g))
        .cloned()
        .collect();
    let guesses: &[String] = if with_year.is_empty() { guesses } else { &with_year };
    if guesses.is_empty() {
        return "Trimestre".into();
    }
    let mut best: Option<(&str, usize, bool)> = None;
    for guess in guesses {
        let count = guesses.iter().filter(|g| g.as_str() == guess.as_str()).count();
        let looks_like_t = guess.len() >= 6
            && guess.starts_with('T')
            && guess.chars().nth(1).is_some_and(|c| matches!(c, '1' | '2' | '3' | '4'));
        match best {
            None => best = Some((guess.as_str(), count, looks_like_t)),
            Some((_, best_count, best_t)) => {
                if count > best_count || (count == best_count && looks_like_t && !best_t) {
                    best = Some((guess.as_str(), count, looks_like_t));
                }
            }
        }
    }
    best.map(|(p, _, _)| p.to_string())
        .unwrap_or_else(|| guesses[0].clone())
}

fn parse_t_period(text: &str) -> Option<String> {
    let upper: Vec<char> = text.to_uppercase().chars().collect();
    let len = upper.len();
    let mut i = 0;
    while i + 2 < len {
        if upper[i] == 'T' {
            let mut j = i + 1;
            while j < len && (upper[j].is_whitespace() || upper[j] == '_') {
                j += 1;
            }
            if j < len && matches!(upper[j], '1' | '2' | '3' | '4') {
                let quarter = upper[j];
                let mut k = j + 1;
                while k < len && (upper[k].is_whitespace() || upper[k] == '_') {
                    k += 1;
                }
                if k + 3 < len {
                    let year: String = upper[k..=k + 3].iter().collect();
                    if year.starts_with("20") && year.chars().all(|c| c.is_ascii_digit()) {
                        return Some(format!("T{quarter} {year}"));
                    }
                }
            }
        }
        i += 1;
    }
    None
}

fn parse_trimestre_period(text: &str) -> Option<String> {
    let lower = text.to_lowercase();
    let idx = lower.find("trimestre")?;
    // Indice calculé sur `lower` : découper `lower` (pas `text`) sur une frontière de caractère,
    // sinon un accent avant « trimestre » fait paniquer (panic = abort → fermeture du CRM).
    let mut start = idx.saturating_sub(24);
    while !lower.is_char_boundary(start) {
        start -= 1;
    }
    let slice = &lower[start..];
    // Trimestre : ordinal juste avant « trimestre » (« 3ème », « troisième », « 1er »).
    // Ne pas prendre un chiffre de l'année (« troisième trimestre 2026 » ≠ T2).
    let before = &lower[start..idx];
    // Sinon « trimestre 3 2025 » : chiffre isolé juste après (jamais l'année).
    let after_digit = lower[idx + "trimestre".len()..]
        .split(|c: char| !c.is_alphanumeric())
        .find(|w| !w.is_empty())
        .filter(|w| w.len() == 1)
        .and_then(|w| w.chars().next())
        .filter(|c| matches!(c, '1' | '2' | '3' | '4'));
    let quarter = quarter_from_ordinal(before).or(after_digit)?;
    let year = find_four_digit_year(slice)?;
    Some(format!("T{quarter} {year}"))
}

fn quarter_from_ordinal(before: &str) -> Option<char> {
    const WORDS: [(&str, char); 5] = [
        ("premier", '1'),
        ("deuxième", '2'),
        ("second", '2'),
        ("troisième", '3'),
        ("quatrième", '4'),
    ];
    let last_word = before.split_whitespace().last()?;
    if let Some((_, q)) = WORDS.iter().find(|(w, _)| last_word.starts_with(w)) {
        return Some(*q);
    }
    let first = last_word.chars().next()?;
    matches!(first, '1' | '2' | '3' | '4').then_some(first)
}

fn find_four_digit_year(text: &str) -> Option<String> {
    // Découpe sur tout non-chiffre : « 2026.pdf », « trimestre_2_2026 ».
    for word in text.split(|c: char| !c.is_ascii_digit()) {
        if word.len() == 4
            && word.starts_with("20")
            && word.chars().all(|c| c.is_ascii_digit())
        {
            return Some(word.to_string());
        }
    }
    None
}

/// Choisit le nom CRM le plus long qui matche le bulletin.
pub fn align_nom_produit_with_portfolio(guess: &str, products: &[String]) -> String {
    products
        .iter()
        .filter(|p| nom_produit_matches_same_scpi(p, guess))
        .max_by_key(|p| p.len())
        .cloned()
        .unwrap_or_else(|| guess.trim().to_string())
}

pub fn scpi_name_from_file_name(file_name: &str) -> String {
    let base = file_name
        .rsplit(['/', '\\'])
        .next()
        .unwrap_or(file_name)
        .trim()
        .strip_suffix(".pdf")
        .or_else(|| file_name.strip_suffix(".PDF"))
        .unwrap_or(file_name);
    base.replace(['_', '-'], " ")
        .split_whitespace()
        .collect::<Vec<_>>()
        .join(" ")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn guess_nom_produit_skips_trimestre_tokens() {
        assert_eq!(
            guess_nom_produit_from_file("BTI Transitions Europe T1 2026.pdf", ""),
            "Transitions Europe"
        );
    }

    #[test]
    fn pick_nom_produit_prefers_file_when_summary_diverges() {
        let summary = "1. Comète – T1 2026\n\n**Chiffres clés**";
        assert_eq!(
            pick_nom_produit(summary, "BTI Epargne Pierre Europe T1 2026.pdf", "BTI Epargne Pierre Europe T1 2026"),
            "Epargne Pierre Europe"
        );
    }

    #[test]
    fn guess_periode_from_filename() {
        assert_eq!(
            guess_periode("Comete_T1_2026.pdf", ""),
            "T1 2026"
        );
        assert_eq!(
            guess_periode("Comète T2 2026.pdf", "Capitalisation +7 % vs T1 2026"),
            "T2 2026"
        );
        assert_eq!(
            guess_periode("Épargne Pierre Europe T2 2026.pdf", ""),
            "T2 2026"
        );
    }

    #[test]
    fn guess_periode_does_not_default_year_to_t1() {
        assert_eq!(guess_periode("bulletin 2026.pdf", ""), "Trimestre");
        assert!(!periode_has_year("Trimestre"));
        assert!(periode_has_year("T2 2026"));
        assert_eq!(
            choose_campaign_periode(&["Trimestre".into(), "Trimestre".into(), "T2 2026".into()]),
            "T2 2026"
        );
        assert_eq!(guess_periode("x.pdf", "Bilan du troisième trimestre 2026"), "T3 2026");
        assert_eq!(guess_periode("x.pdf", "Bilan du premier trimestre 2026"), "T1 2026");
        assert_eq!(guess_periode("x.pdf", "Au 2ème trimestre 2026"), "T2 2026");
        assert_eq!(guess_periode("Comète 1er trimestre 2026.pdf", ""), "T1 2026");
    }

    #[test]
    fn choose_campaign_periode_majority_prefers_tx() {
        assert_eq!(
            choose_campaign_periode(&["T1 2026".into(), "T2 2026".into(), "T2 2026".into()]),
            "T2 2026"
        );
    }

    #[test]
    fn guess_periode_from_trimestre_wording() {
        assert_eq!(
            guess_periode(
                "bulletin.pdf",
                "1. Comète – 1er trimestre 2026\n\n2. Chiffres clés"
            ),
            "T1 2026"
        );
    }

    #[test]
    fn align_picks_longest_portfolio_match() {
        let products = vec![
            "Europe".into(),
            "Transitions Europe".into(),
        ];
        assert_eq!(
            align_nom_produit_with_portfolio("Transitions Europe", &products),
            "Transitions Europe"
        );
        let nested = vec![
            "Epargne Pierre".into(),
            "Epargne Pierre Europe".into(),
        ];
        assert_eq!(
            align_nom_produit_with_portfolio("Epargne Pierre", &nested),
            "Epargne Pierre"
        );
        assert_eq!(
            align_nom_produit_with_portfolio("Epargne Pierre Europe", &nested),
            "Epargne Pierre Europe"
        );
    }

    #[test]
    fn trimestre_period_with_accents_does_not_panic() {
        let text = "Au cours du deuxième et dernier élément du 2ème trimestre 2026, la SCPI…";
        let _ = guess_periode("bulletin.pdf", text);
        let accents = "ééééééééééééééééééééé trimestre 3 2025";
        assert_eq!(guess_periode("x.pdf", accents), "T3 2025");
    }
}
