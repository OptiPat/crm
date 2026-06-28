//! Heuristiques nom SCPI / période (ex-n8n « Accumuler bulletin »).

use crate::database::investissement_produit_match::nom_produit_matches;

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
    let summary_head: String = summary.chars().take(800).collect();
    let text = format!("{file_name} {summary_head}");
    if let Some(p) = parse_t_period(&text) {
        return p;
    }
    if let Some(p) = parse_trimestre_period(&text) {
        return p;
    }
    if let Some(year) = find_four_digit_year(&text) {
        return format!("T1 {year}");
    }
    "Trimestre".to_string()
}

fn parse_t_period(text: &str) -> Option<String> {
    let upper = text.to_uppercase();
    let bytes = upper.as_bytes();
    let len = bytes.len();
    let mut i = 0;
    while i + 2 < len {
        if bytes[i].eq_ignore_ascii_case(&b't') {
            let mut j = i + 1;
            while j < len && (bytes[j].is_ascii_whitespace() || bytes[j] == b'_') {
                j += 1;
            }
            if j < len && matches!(bytes[j], b'1' | b'2' | b'3' | b'4') {
                let quarter = bytes[j] as char;
                let mut k = j + 1;
                while k < len && (bytes[k].is_ascii_whitespace() || bytes[k] == b'_') {
                    k += 1;
                }
                if k + 3 < len && &bytes[k..k + 2] == b"20" {
                    let year: String = upper.chars().skip(k).take(4).collect();
                    if year.len() == 4 && year.chars().all(|c| c.is_ascii_digit()) {
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
    let slice = &text[idx.saturating_sub(24)..];
    let quarter = slice.chars().find(|c| matches!(c, '1' | '2' | '3' | '4'))?;
    let year = find_four_digit_year(slice)?;
    Some(format!("T{quarter} {year}"))
}

fn find_four_digit_year(text: &str) -> Option<String> {
    for word in text.split_whitespace() {
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
        .filter(|p| nom_produit_matches(p, guess))
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
    }
}
