//! Campagnes email bulletins SCPI (digest par contact, file modèle sans étiquette).

use super::investissement_produit_match::{
    nom_produit_matches, normalize_produit_match_key, MIN_PRODUIT_MATCH_LEN,
};
use super::models::NewTemplateEmail;
use super::Database;
use rusqlite::{params, Result};
use serde::{Deserialize, Serialize};

pub const SCPI_BULLETIN_TEMPLATE_NOM: &str = "Bulletin SCPI trimestriel";
pub const SCPI_BULLETIN_TEMPLATE_TU_NOM: &str = "Bulletin SCPI trimestriel (tu)";

#[derive(Debug, Clone, Deserialize)]
pub struct ScpiBulletinInput {
    pub nom_produit: String,
    pub summary_markdown: String,
    /// Nom de fichier PDF source (n8n) — secours si le titre Mistral est ambigu.
    #[serde(default)]
    pub fichier_source: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct PrepareScpiCampaignInput {
    pub periode: String,
    pub bulletins: Vec<ScpiBulletinInput>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PrepareScpiCampaignResult {
    pub periode: String,
    pub batch_key: String,
    pub bulletins_count: usize,
    pub contacts_matched: u64,
    pub contacts_queued: u64,
    pub contacts_no_email: u64,
    pub contacts_skipped_already_sent: u64,
    pub template_nom: String,
    pub message: String,
}

fn normalize_batch_key(periode: &str) -> String {
    normalize_produit_match_key(periode)
}

/// SCPI rattachées au foyer (`foyer_id`) : visibles par les adultes du foyer, pas par les enfants.
/// Les SCPI au nom du contact (`contact_id`) restent éligibles pour tout le monde, y compris un enfant.
pub fn contact_inherits_foyer_scpi_investments(role_foyer: Option<&str>) -> bool {
    !matches!(
        role_foyer.map(str::trim).filter(|s| !s.is_empty()),
        Some("ENFANT")
    )
}

fn pick_display_produit_nom(investissement_noms: &[String], bulletin_key: &str) -> String {
    investissement_noms
        .iter()
        .filter(|nom| nom_produit_matches(nom, bulletin_key))
        .max_by_key(|nom| nom.len())
        .cloned()
        .unwrap_or_else(|| bulletin_key.trim().to_string())
}

fn clean_inferred_produit_name(name: &str) -> String {
    let name = name.trim().trim_matches('*').trim();
    let lower = name.to_lowercase();
    if let Some(rest) = lower.strip_prefix("scpi ") {
        return name[name.len() - rest.len()..].trim().to_string();
    }
    name.to_string()
}

/// Extrait le nom SCPI depuis le titre du résumé Mistral (## ou « 1. Nom – période »).
fn infer_produit_from_summary(summary: &str) -> Option<String> {
    for line in summary.lines() {
        let mut t = line.trim();
        if t.starts_with("## ") {
            t = t.trim_start_matches('#').trim();
        }
        t = t.trim_matches('*').trim();
        if let Some(rest) = t.strip_prefix("1.") {
            t = rest.trim();
        }
        let name = if let Some(dash_idx) = t
            .find('–')
            .or_else(|| t.find('—'))
            .or_else(|| t.find('-'))
        {
            t[..dash_idx].trim()
        } else {
            continue;
        };
        let name = clean_inferred_produit_name(name);
        if name.len() >= MIN_PRODUIT_MATCH_LEN {
            return Some(name);
        }
    }
    None
}

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

/// Extrait le nom SCPI depuis le nom de fichier PDF (ex. « BTI Transitions Europe T1 2026.pdf »).
fn infer_produit_from_fichier(fichier: &str) -> Option<String> {
    let base = fichier
        .rsplit(['/', '\\'])
        .next()
        .unwrap_or(fichier)
        .trim();
    let base = base
        .strip_suffix(".pdf")
        .or_else(|| base.strip_suffix(".PDF"))
        .unwrap_or(base)
        .trim();
    if base.is_empty() {
        return None;
    }
    let kept: Vec<&str> = base
        .split(|c: char| {
            c.is_whitespace() || c == '_' || c == '-' || c == '–' || c == '—'
        })
        .filter(|s| !s.is_empty())
        .filter(|part| !is_skipped_fichier_token(part))
        .collect();
    if kept.is_empty() {
        return Some(base.to_string());
    }
    Some(kept.join(" "))
}

fn pick_longer_produit_name(a: &str, b: &str) -> String {
    if a.len() >= b.len() {
        a.to_string()
    } else {
        b.to_string()
    }
}

fn bulletin_match_key(bulletin: &ScpiBulletinInput) -> String {
    let from_summary = infer_produit_from_summary(&bulletin.summary_markdown);
    let from_fichier = bulletin
        .fichier_source
        .as_deref()
        .and_then(infer_produit_from_fichier);
    match (from_summary, from_fichier) {
        (Some(summary), Some(fichier)) if !nom_produit_matches(&fichier, &summary) => fichier,
        (Some(summary), Some(fichier)) => pick_longer_produit_name(&summary, &fichier),
        (Some(summary), None) => summary,
        (None, Some(fichier)) => fichier,
        (None, None) => bulletin.nom_produit.trim().to_string(),
    }
}

const SUBSECTION_TITLES: &[&str] = &["Chiffres clés", "Ce trimestre", "Acquisitions"];

fn subsection_title_candidate(rest: &str) -> &str {
    rest.trim().trim_end_matches(':').trim()
}

fn fold_subsection_key(s: &str) -> String {
    s.to_lowercase()
        .chars()
        .map(|c| match c {
            'é' | 'è' | 'ê' | 'ë' => 'e',
            'à' | 'â' | 'ä' => 'a',
            'ù' | 'û' | 'ü' => 'u',
            'ô' | 'ö' => 'o',
            'î' | 'ï' => 'i',
            'ç' => 'c',
            other => other,
        })
        .collect()
}

fn is_subsection_title(rest: &str) -> bool {
    canonical_subsection_title(rest).is_some()
}

fn canonical_subsection_title(rest: &str) -> Option<&'static str> {
    let key = fold_subsection_key(subsection_title_candidate(rest));
    match key.as_str() {
        "chiffres cles" => Some("Chiffres clés"),
        "ce trimestre" => Some("Ce trimestre"),
        "acquisitions" => Some("Acquisitions"),
        _ => None,
    }
}

fn unwrap_mistral_markdown_line(line: &str) -> String {
    let mut t = line.trim().to_string();
    if t.is_empty() || t == "**" || t == "*" || t == "***" {
        return String::new();
    }
    if t.starts_with("**") && t.ends_with("**") && t.len() > 4 {
        return t[2..t.len() - 2].trim().to_string();
    }
    while t.starts_with("**") {
        t = t.trim_start_matches('*').trim().to_string();
    }
    while t.ends_with("**") {
        t.truncate(t.len().saturating_sub(2));
        t = t.trim_end().to_string();
    }
    t
}

fn preprocess_mistral_bulletin_line(line: &str) -> Option<String> {
    let t = line.trim();
    if t.is_empty() {
        return Some(String::new());
    }
    if t == "-"
        || t == "–"
        || t == "—"
        || t == "**"
        || t == "*"
        || t == "***"
    {
        return None;
    }
    if let Some(stripped) = t.strip_prefix("- ").or_else(|| t.strip_prefix("* ")) {
        let unwrapped = unwrap_mistral_markdown_line(stripped);
        if unwrapped.starts_with("1.")
            || unwrapped.starts_with("2.")
            || unwrapped.starts_with("3.")
            || unwrapped.starts_with("4.")
        {
            return if unwrapped.is_empty() {
                None
            } else {
                Some(unwrapped)
            };
        }
        return Some(line.to_string());
    }
    let unwrapped = unwrap_mistral_markdown_line(line);
    if unwrapped.is_empty() {
        None
    } else {
        Some(unwrapped)
    }
}

fn normalize_dash_chars(s: &str) -> String {
    s.chars()
        .map(|c| match c {
            '\u{2010}'..='\u{2015}' | '\u{2212}' | '\u{FE58}' | '\u{FE63}' | '\u{FF0D}' => '–',
            c => c,
        })
        .collect()
}

fn product_title_detection_line(line: &str) -> String {
    let mut t = normalize_dash_chars(line.trim());
    while t.ends_with("**") {
        t.truncate(t.len().saturating_sub(2));
        t = t.trim_end().to_string();
    }
    if t.starts_with("## ") {
        t = t.trim_start_matches('#').trim().to_string();
    } else if let Some(rest) = t.strip_prefix("1.") {
        t = rest.trim().to_string();
    }
    if let Some(rest) = t.strip_prefix("- ") {
        t = rest.trim().to_string();
    } else if let Some(rest) = t.strip_prefix("* ") {
        t = rest.trim().to_string();
    }
    t.trim_matches('*').trim().to_string()
}

fn fold_product_title_key(line: &str, periode: &str) -> String {
    let bare = format_product_title_line(line, "", periode)
        .trim_start_matches("## ")
        .trim()
        .replace('–', "-");
    fold_subsection_key(&bare)
}

fn prefer_product_title_line(candidate: &str, current: &str) -> bool {
    let c = candidate.trim();
    let cur = current.trim();
    if c.starts_with("## ") && !cur.starts_with("## ") {
        return true;
    }
    if !c.starts_with("## ") && cur.starts_with("## ") {
        return false;
    }
    let accent_count = |s: &str| {
        s.chars()
            .filter(|ch| matches!(ch, 'à' | 'â' | 'ä' | 'é' | 'è' | 'ê' | 'ë' | 'ï' | 'î' | 'ô' | 'ù' | 'û' | 'ü' | 'ç'))
            .count()
    };
    let c_accents = accent_count(c);
    let cur_accents = accent_count(cur);
    if c_accents != cur_accents {
        return c_accents > cur_accents;
    }
    c.len() > cur.len()
}

fn dedupe_product_title_lines(lines: Vec<String>, periode: &str) -> Vec<String> {
    let mut out: Vec<String> = Vec::new();
    let mut seen_in_block: std::collections::HashSet<String> = std::collections::HashSet::new();
    let mut i = 0usize;
    while i < lines.len() {
        let line = lines[i].clone();
        let t = line.trim();
        if t == "---" {
            seen_in_block.clear();
            out.push(line);
            i += 1;
            continue;
        }
        if is_product_title_line(t) {
            let key = fold_product_title_key(t, periode);
            let mut best = line.clone();
            let mut j = i + 1;
            while j < lines.len() {
                let tj = lines[j].trim();
                if tj.is_empty() {
                    j += 1;
                    continue;
                }
                if !is_product_title_line(tj) {
                    break;
                }
                if fold_product_title_key(tj, periode) != key {
                    break;
                }
                if prefer_product_title_line(&lines[j], &best) {
                    best = lines[j].clone();
                }
                j += 1;
            }
            if seen_in_block.contains(&key) {
                i = j;
                continue;
            }
            seen_in_block.insert(key);
            out.push(best);
            i = j;
            continue;
        }
        out.push(line);
        i += 1;
    }
    out
}

fn strip_trailing_product_title_lines(lines: &[String]) -> Vec<String> {
    let mut end = lines.len();
    while end > 0 {
        let t = lines[end - 1].trim();
        if t.is_empty() {
            end -= 1;
            continue;
        }
        if is_product_title_line(t) {
            end -= 1;
            continue;
        }
        break;
    }
    lines[..end].to_vec()
}

/// Mistral laisse parfois le titre dupliqué en fin de résumé, avec « ** » orphelins.
fn strip_trailing_duplicate_title(text: &str, _periode: &str) -> String {
    let lines: Vec<String> = text.lines().map(String::from).collect();
    strip_trailing_product_title_lines(&lines).join("\n")
}

fn looks_like_period_label(s: &str) -> bool {
    let t = s.trim();
    if t.is_empty() {
        return false;
    }
    let lower = t.to_lowercase();
    if lower.contains("trimestre") || lower.contains("semestre") {
        return true;
    }
    if t.len() == 4 && t.chars().all(|c| c.is_ascii_digit()) && t.starts_with("20") {
        return true;
    }
    if t.len() >= 2
        && (lower.starts_with('t') || lower.starts_with("t"))
        && lower.as_bytes().get(1).is_some_and(|b| b.is_ascii_digit())
    {
        return t.contains("20") || t.len() <= 3;
    }
    false
}

fn period_part_after_dash(line: &str, dash_idx: usize) -> &str {
    line[dash_idx..]
        .trim()
        .trim_start_matches(['–', '—', '-'])
        .trim()
}

fn looks_like_product_period_line(s: &str) -> bool {
    let t = s.trim();
    if t.is_empty() || is_subsection_title(t) || t.starts_with("- ") || t.starts_with("* ") {
        return false;
    }
    if t.contains(':') && !t.contains('–') && !t.contains('—') {
        return false;
    }
    for idx in [t.find('–'), t.find('—'), t.find('-')] {
        if let Some(i) = idx {
            if i == 0 || i >= t.len().saturating_sub(1) {
                continue;
            }
            if looks_like_period_label(period_part_after_dash(t, i)) {
                return true;
            }
            let period = period_part_after_dash(t, i);
            if !period.is_empty() && period.len() <= 6 && !period.contains(':') {
                return true;
            }
        }
    }
    false
}

fn is_subsection_heading_line(line: &str) -> bool {
    subsection_heading_canonical(line).is_some()
}

fn subsection_heading_canonical(line: &str) -> Option<&'static str> {
    let t = line.trim();
    for n in 1..=3 {
        let prefix = format!("{n}.");
        if let Some(rest) = t.strip_prefix(&prefix) {
            if let Some(title) = canonical_subsection_title(rest.trim()) {
                return Some(title);
            }
        }
    }
    None
}

fn is_acquisition_content_line(line: &str) -> bool {
    let t = line.trim();
    if t.is_empty() || t.starts_with("- ") || t.starts_with("* ") {
        return false;
    }
    if subsection_heading_canonical(t).is_some() {
        return false;
    }
    if t.starts_with("## ") || is_product_title_line(t) {
        return false;
    }
    t.contains(": ") && t.contains(',')
}

fn prefix_acquisition_bullets(lines: Vec<String>) -> Vec<String> {
    let mut out: Vec<String> = Vec::new();
    let mut in_acquisitions = false;
    for line in lines {
        let trimmed = line.trim();
        if let Some(section) = subsection_heading_canonical(trimmed) {
            in_acquisitions = section == "Acquisitions";
            out.push(line);
            continue;
        }
        if trimmed.starts_with("## ") || is_product_title_line(trimmed) {
            in_acquisitions = false;
            out.push(line);
            continue;
        }
        if in_acquisitions && is_acquisition_content_line(trimmed) && !trimmed.starts_with("- ") {
            out.push(format!("- {trimmed}"));
            continue;
        }
        out.push(line);
    }
    out
}

fn remove_empty_subsection_headings(lines: Vec<String>) -> Vec<String> {
    let mut out: Vec<String> = Vec::new();
    let mut i = 0usize;
    while i < lines.len() {
        let t = lines[i].trim();
        if is_subsection_heading_line(t) {
            let mut j = i + 1;
            while j < lines.len() && lines[j].trim().is_empty() {
                j += 1;
            }
            let next = lines.get(j).map(|l| l.trim()).unwrap_or("");
            if next.is_empty()
                || is_subsection_heading_line(next)
                || next.starts_with("## ")
                || is_product_title_line(next)
            {
                i += 1;
                continue;
            }
        }
        out.push(lines[i].clone());
        i += 1;
    }
    out
}

fn legacy_subsection_number(num: u32, rest: &str) -> Option<u32> {
    if !(1..=4).contains(&num) || !is_subsection_title(rest) {
        return None;
    }
    canonical_subsection_title(rest).map(|title| match title {
        "Chiffres clés" => 1,
        "Ce trimestre" => 2,
        "Acquisitions" => 3,
        _ => num,
    })
}

fn normalize_subsection_line(line: &str) -> String {
    let trimmed = unwrap_mistral_markdown_line(line);
    if trimmed.is_empty() {
        return String::new();
    }
    if let Some(title) = canonical_subsection_title(&trimmed) {
        let num = match title {
            "Chiffres clés" => 1,
            "Ce trimestre" => 2,
            "Acquisitions" => 3,
            _ => return trimmed,
        };
        return format!("{num}. {title}");
    }
    if let Some(dot_idx) = trimmed.find('.') {
        let num_str = trimmed[..dot_idx].trim();
        if let Ok(num) = num_str.parse::<u32>() {
            let rest = trimmed[dot_idx + 1..].trim();
            if let Some(canonical) = canonical_subsection_title(rest) {
                if let Some(normalized) = legacy_subsection_number(num, rest) {
                    return format!("{normalized}. {canonical}");
                }
            }
        }
    }
    trimmed
}

fn should_use_crm_periode(period_clean: &str, periode: &str) -> bool {
    if periode.trim().is_empty() {
        return false;
    }
    let lower = period_clean.to_lowercase();
    if lower.contains("trimestre") || lower.contains("semestre") {
        return true;
    }
    period_clean.len() < 4 || !period_clean.chars().any(|c| c.is_ascii_digit())
}

fn is_product_title_line(line: &str) -> bool {
    looks_like_product_period_line(&product_title_detection_line(line))
}

fn canonicalize_product_title_lines(
    lines: Vec<String>,
    display_name: &str,
    periode: &str,
) -> Vec<String> {
    lines
        .into_iter()
        .map(|line| {
            let t = line.trim();
            if t == "---" {
                return line;
            }
            if is_product_title_line(t) {
                format_product_title_line(t, display_name, periode)
            } else {
                line
            }
        })
        .collect()
}

fn format_product_title_line(line: &str, display_name: &str, periode: &str) -> String {
    let rest = product_title_detection_line(line);
    if let Some(dash_idx) = rest
        .find('–')
        .or_else(|| rest.find('—'))
        .or_else(|| rest.find('-'))
    {
        let name = if display_name.trim().is_empty() {
            rest[..dash_idx].trim()
        } else {
            display_name.trim()
        };
        let period_clean = rest[dash_idx..]
            .trim()
            .trim_start_matches(['–', '—', '-'])
            .trim();
        if should_use_crm_periode(period_clean, periode) {
            return format!("## {} – {}", name, periode.trim());
        }
        return format!("## {} – {}", name, period_clean);
    }
    let name = if display_name.trim().is_empty() {
        rest
    } else {
        display_name.trim().to_string()
    };
    format!("## {} – {}", name, periode.trim())
}

fn fix_glued_year_subsection(line: &str) -> String {
    let mut result = line.to_string();
    for title in SUBSECTION_TITLES {
        for num in 1..=4 {
            let needle = format!("{num}. {title}");
            if let Some(pos) = result.find(&needle) {
                if pos >= 4 {
                    let before = &result[pos - 4..pos];
                    if before.chars().all(|c| c.is_ascii_digit()) {
                        result.insert(pos, '\n');
                    }
                }
            }
        }
    }
    result
}

/// Mistral/OCR : année « 2026 » répartie sur plusieurs lignes (2 / 0 / 2 / 6).
fn collapse_vertical_year_lines(text: &str) -> String {
    let lines: Vec<String> = text.replace("\r\n", "\n").lines().map(String::from).collect();
    let mut out: Vec<String> = Vec::new();
    let mut i = 0usize;
    while i < lines.len() {
        if let Some((merged, consumed)) = try_merge_vertical_year_block(&lines, i) {
            out.push(merged);
            i += consumed;
            continue;
        }
        out.push(lines[i].clone());
        i += 1;
    }
    merge_orphan_year_with_previous_line(out).join("\n")
}

fn merge_orphan_year_with_previous_line(lines: Vec<String>) -> Vec<String> {
    let mut out: Vec<String> = Vec::new();
    for line in lines {
        let trimmed = line.trim();
        let is_year_start_line = trimmed.len() >= 4
            && trimmed.chars().take(4).all(|c| c.is_ascii_digit())
            && trimmed.starts_with("20");
        if is_year_start_line {
            if let Some(prev) = out.last_mut() {
                let year = &trimmed[..4];
                if !prev.trim().ends_with(year) {
                    prev.push(' ');
                    prev.push_str(trimmed);
                    continue;
                }
            }
        }
        out.push(line);
    }
    out
}

fn try_merge_vertical_year_block(lines: &[String], i: usize) -> Option<(String, usize)> {
    if i + 3 >= lines.len() {
        return None;
    }
    let mut year = String::new();
    for k in 0..3 {
        let t = lines[i + k].trim();
        if t.len() != 1 || !t.chars().all(|c| c.is_ascii_digit()) {
            return None;
        }
        year.push(t.chars().next()?);
    }
    let fourth = lines[i + 3].trim();
    let suffix = if fourth.len() == 1 && fourth.chars().all(|c| c.is_ascii_digit()) {
        year.push(fourth.chars().next()?);
        String::new()
    } else {
        let mut chars = fourth.chars();
        let d = chars.next()?;
        if !d.is_ascii_digit() {
            return None;
        }
        year.push(d);
        chars.as_str().to_string()
    };
    if year.len() != 4 || !year.starts_with("20") {
        return None;
    }
    Some((format!("{year}{suffix}"), 4))
}

/// Après OCR : « ## Comète – T » puis « 1 » / « 2026 » sur des lignes séparées.
fn remove_split_period_fragments(lines: Vec<String>) -> Vec<String> {
    if lines.is_empty() {
        return lines;
    }
    let first = lines[0].trim();
    if !is_product_title_line(first) {
        return lines;
    }
    let rest = if first.starts_with("## ") {
        first.trim_start_matches('#').trim()
    } else if first.starts_with("1.") {
        first.strip_prefix("1.").unwrap_or(first).trim()
    } else {
        first
    };
    let period_clean = rest
        .find('–')
        .or_else(|| rest.find('-'))
        .map(|idx| {
            rest[idx..]
                .trim()
                .trim_start_matches(['–', '—', '-'])
                .trim()
        })
        .unwrap_or("");
    if period_clean.len() >= 4 && period_clean.chars().any(|c| c.is_ascii_digit()) {
        return lines;
    }
    let mut skip = 1usize;
    while skip < lines.len() {
        let t = lines[skip].trim();
        if t.is_empty() {
            skip += 1;
            continue;
        }
        if t.len() <= 4 && t.chars().all(|c| c.is_ascii_digit()) {
            skip += 1;
            continue;
        }
        break;
    }
    if skip <= 1 {
        return lines;
    }
    let mut out = vec![lines[0].clone()];
    out.extend(lines.into_iter().skip(skip));
    out
}

fn normalize_bulletin_summary_markdown(
    summary: &str,
    display_name: &str,
    periode: &str,
    ensure_product_header: bool,
) -> String {
    let collapsed = collapse_vertical_year_lines(summary);
    let lines: Vec<String> = remove_split_period_fragments(
        collapsed
            .lines()
            .map(|l| fix_glued_year_subsection(l))
            .collect(),
    );

    let mut start = 0usize;
    while start < lines.len() {
        let t = lines[start].trim();
        if t.starts_with("## ") {
            let rest = t.trim_start_matches('#').trim();
            if looks_like_product_period_line(rest) {
                break;
            }
            start += 1;
            continue;
        }
        if t.starts_with("1.") {
            let rest = t.strip_prefix("1.").unwrap_or(t).trim();
            if looks_like_product_period_line(rest) {
                break;
            }
        }
        if looks_like_product_period_line(&product_title_detection_line(t)) {
            break;
        }
        if t.is_empty() {
            start += 1;
            continue;
        }
        break;
    }

    let mut out: Vec<String> = Vec::new();
    let mut saw_product_title = false;
    for line in lines.into_iter().skip(start) {
        let Some(preprocessed) = preprocess_mistral_bulletin_line(&line) else {
            continue;
        };
        if preprocessed.trim().is_empty() {
            if out.last().is_some_and(|l| !l.trim().is_empty()) {
                out.push(String::new());
            }
            continue;
        }
        let mut normalized = normalize_subsection_line(&preprocessed);
        if normalized.trim().is_empty() {
            continue;
        }
        if is_product_title_line(&normalized) {
            normalized = format_product_title_line(&normalized, display_name, periode);
            saw_product_title = true;
        }
        out.push(normalized);
    }

    let body = remove_empty_subsection_headings(prefix_acquisition_bullets(
        canonicalize_product_title_lines(
            dedupe_product_title_lines(out, periode),
            display_name,
            periode,
        ),
    ))
    .join("\n")
    .replace("\n\n\n", "\n\n")
    .trim()
    .to_string();

    if !saw_product_title && ensure_product_header {
        return format!(
            "## {} – {}\n\n{}",
            display_name.trim(),
            periode.trim(),
            body
        );
    }
    strip_trailing_duplicate_title(&body, periode)
}

fn build_bulletin_resume(bulletins: &[ScpiBulletinInput], periode: &str) -> String {
    if bulletins.is_empty() {
        return String::new();
    }
    if bulletins.len() == 1 {
        return normalize_bulletin_summary_markdown(
            bulletins[0].summary_markdown.trim(),
            bulletins[0].nom_produit.trim(),
            periode,
            false,
        );
    }
    bulletins
        .iter()
        .map(|b| {
            normalize_bulletin_summary_markdown(
                b.summary_markdown.trim(),
                b.nom_produit.trim(),
                periode,
                true,
            )
        })
        .collect::<Vec<_>>()
        .join("\n\n---\n\n")
}

fn scpi_intro_phrases(count: usize) -> (String, String) {
    if count <= 1 {
        (
            "Voici les points clés du bulletin trimestriel de ta SCPI".into(),
            "Voici les points clés du bulletin trimestriel de votre SCPI".into(),
        )
    } else {
        (
            "Voici les points clés des bulletins trimestriels de tes SCPI".into(),
            "Voici les points clés des bulletins trimestriels de vos SCPI".into(),
        )
    }
}

const SCPI_TEMPLATE_VERSION: i64 = 4;
/// Version du JSON `campaign_variables` (digest). Incrémenter si le format change.
pub const SCPI_CAMPAIGN_DIGEST_VERSION: i64 = 2;
pub const SCPI_LAST_PREPARE_SETTING: &str = "scpi_last_campaign_prepare";

fn build_scpi_campaign_variables_json(
    bulletins: &[ScpiBulletinInput],
    periode: &str,
    prepared_at: i64,
) -> String {
    let count = bulletins.len();
    let (intro_tu, intro_vous) = scpi_intro_phrases(count);
    let bulletin_resume = build_bulletin_resume(bulletins, periode);
    serde_json::json!({
        "periode": periode.trim(),
        "scpi_count": count,
        "scpi_intro_tu": intro_tu,
        "scpi_intro_vous": intro_vous,
        "bulletin_resume": bulletin_resume,
        "prepared_at": prepared_at,
        "digest_version": SCPI_CAMPAIGN_DIGEST_VERSION,
    })
    .to_string()
}

const SCPI_VOUS_CORPS_HTML: &str = r#"<div dir="ltr"><div style="line-height:1.5;margin:0;padding:0">Bonjour {{prenom}} {{nom}},</div><div style="line-height:1.5;margin:0;padding:0"><br></div><div style="line-height:1.5;margin:0;padding:0">{{scpi_intro_vous}} (<strong>{{periode}}</strong>) :</div><div style="line-height:1.5;margin:0;padding:0"><br></div><div style="line-height:1.5;margin:0;padding:0">{{bulletin_resume_html}}</div><div style="line-height:1.5;margin:0;padding:0"><br></div><div style="line-height:1.5;margin:0;padding:0">—</div><div style="line-height:1.5;margin:0;padding:0">Résumé informatif — se référer aux bulletins officiels. Ce texte ne constitue pas un conseil en investissement.</div></div>"#;

const SCPI_TU_CORPS_HTML: &str = r#"<div dir="ltr"><div style="line-height:1.5;margin:0;padding:0">Bonjour {{prenom}},</div><div style="line-height:1.5;margin:0;padding:0"><br></div><div style="line-height:1.5;margin:0;padding:0">{{scpi_intro_tu}} (<strong>{{periode}}</strong>) :</div><div style="line-height:1.5;margin:0;padding:0"><br></div><div style="line-height:1.5;margin:0;padding:0">{{bulletin_resume_html}}</div><div style="line-height:1.5;margin:0;padding:0"><br></div><div style="line-height:1.5;margin:0;padding:0">—</div><div style="line-height:1.5;margin:0;padding:0">Résumé informatif — se référer aux bulletins officiels. Ce texte ne constitue pas un conseil en investissement.</div></div>"#;

fn scpi_template_variables_json(corps_html: &str) -> String {
    serde_json::json!({
        "corps_html": corps_html,
        "scpi_template_version": SCPI_TEMPLATE_VERSION,
        "email_suivi_reponse": { "attendre_reponse": false },
        "email_relance": { "enabled": false },
    })
    .to_string()
}

fn scpi_template_needs_upgrade(variables: Option<&str>) -> bool {
    let Some(raw) = variables.filter(|s| !s.trim().is_empty()) else {
        return true;
    };
    let Ok(parsed) = serde_json::from_str::<serde_json::Value>(raw) else {
        return true;
    };
    if parsed
        .get("scpi_template_user_customized")
        .and_then(|v| v.as_bool())
        == Some(true)
    {
        return false;
    }
    let corps_html = parsed.get("corps_html").and_then(|v| v.as_str());
    if corps_html.map(str::trim).filter(|s| !s.is_empty()).is_none() {
        return true;
    }
    parsed
        .get("scpi_template_version")
        .and_then(|v| v.as_i64())
        .unwrap_or(0)
        < SCPI_TEMPLATE_VERSION
}

fn scpi_vous_corps_plain() -> &'static str {
    "Bonjour {{prenom}} {{nom}},\n\n\
{{scpi_intro_vous}} ({{periode}}) :\n\n\
{{bulletin_resume}}\n\n\
---\n\
Résumé informatif — se référer aux bulletins officiels. Ce texte ne constitue pas un conseil en investissement."
}

fn scpi_tu_corps_plain() -> &'static str {
    "Bonjour {{prenom}},\n\n\
{{scpi_intro_tu}} ({{periode}}) :\n\n\
{{bulletin_resume}}\n\n\
---\n\
Résumé informatif — se référer aux bulletins officiels. Ce texte ne constitue pas un conseil en investissement."
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ScpiProductsListResponse {
    pub count: usize,
    pub products: Vec<String>,
}

impl Database {
    /// Noms SCPI distincts en portefeuille (matching campagnes n8n ↔ investissements).
    pub fn list_scpi_product_names(&self) -> Result<Vec<String>> {
        let mut stmt = self.conn.prepare(
            "SELECT DISTINCT TRIM(nom_produit) FROM investissements
             WHERE type_produit IN ('SCPI', 'SCPI_DEMEMBREMENT', 'SCPI_FISCALE')
               AND COALESCE(statut, 'ACTIF') = 'ACTIF'
               AND TRIM(COALESCE(nom_produit, '')) != ''
             ORDER BY nom_produit COLLATE NOCASE",
        )?;
        let rows = stmt.query_map([], |row| row.get(0))?;
        rows.collect()
    }

    pub fn migrate_scpi_campaign_envois(&self) -> Result<()> {
        let mut needs_index = false;
        if !self.table_has_column("contact_template_envois", "campaign_batch_key")? {
            self.conn.execute(
                "ALTER TABLE contact_template_envois ADD COLUMN campaign_batch_key TEXT",
                [],
            )?;
            println!("✅ Migration: campaign_batch_key sur contact_template_envois");
            needs_index = true;
        }
        if !self.table_has_column("contact_template_envois", "campaign_variables")? {
            self.conn.execute(
                "ALTER TABLE contact_template_envois ADD COLUMN campaign_variables TEXT",
                [],
            )?;
            println!("✅ Migration: campaign_variables sur contact_template_envois");
            needs_index = true;
        }
        if needs_index {
            self.recreate_scpi_campaign_unique_index()?;
        }
        let exists: i64 = self.conn.query_row(
            "SELECT COUNT(*) FROM templates_email WHERE nom = ?1",
            params![SCPI_BULLETIN_TEMPLATE_NOM],
            |row| row.get(0),
        )?;
        if exists > 0 {
            self.upgrade_scpi_bulletin_email_templates()?;
        }
        Ok(())
    }

    fn recreate_scpi_campaign_unique_index(&self) -> Result<()> {
        self.conn
            .execute("DROP INDEX IF EXISTS contact_template_envois_unique", [])?;
        self.conn.execute(
            "CREATE UNIQUE INDEX IF NOT EXISTS contact_template_envois_unique
             ON contact_template_envois (
                contact_id,
                template_id,
                COALESCE(investissement_id, -1),
                COALESCE(campaign_batch_key, '')
             )",
            [],
        )?;
        Ok(())
    }

    fn upgrade_scpi_bulletin_email_templates(&self) -> Result<()> {
        let tu_row: Option<(i64, Option<String>)> = self
            .conn
            .query_row(
                "SELECT id, variables FROM templates_email WHERE nom = ?1",
                params![SCPI_BULLETIN_TEMPLATE_TU_NOM],
                |row| Ok((row.get(0)?, row.get(1)?)),
            )
            .ok();
        let vous_row: Option<(i64, Option<String>, Option<i64>)> = self
            .conn
            .query_row(
                "SELECT id, variables, tutoiement_template_id FROM templates_email WHERE nom = ?1",
                params![SCPI_BULLETIN_TEMPLATE_NOM],
                |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)),
            )
            .ok();

        let Some((vous_id, vous_vars, tu_link)) = vous_row else {
            return Ok(());
        };

        let tu_id = if let Some((id, tu_vars)) = tu_row {
            if scpi_template_needs_upgrade(tu_vars.as_deref()) {
                self.conn.execute(
                    "UPDATE templates_email SET sujet = ?1, corps = ?2, variables = ?3, updated_at = unixepoch()
                     WHERE id = ?4",
                    params![
                        "Tes bulletins SCPI — {{periode}}, {{prenom}}",
                        scpi_tu_corps_plain(),
                        scpi_template_variables_json(SCPI_TU_CORPS_HTML),
                        id
                    ],
                )?;
            }
            Some(id)
        } else {
            let tu = self.create_template_email(NewTemplateEmail {
                nom: SCPI_BULLETIN_TEMPLATE_TU_NOM.into(),
                sujet: "Tes bulletins SCPI — {{periode}}, {{prenom}}".into(),
                corps: scpi_tu_corps_plain().into(),
                categorie: "BULLETINS".into(),
                variables: Some(scpi_template_variables_json(SCPI_TU_CORPS_HTML)),
                agenda_link_id: None,
                relance_template_id: None,
                tutoiement_template_id: None,
            })?;
            Some(tu.id)
        };

        if scpi_template_needs_upgrade(vous_vars.as_deref()) {
            self.conn.execute(
                "UPDATE templates_email SET sujet = ?1, corps = ?2, variables = ?3,
                    tutoiement_template_id = ?4, categorie = 'BULLETINS', updated_at = unixepoch()
                 WHERE id = ?5",
                params![
                    "Vos bulletins SCPI — {{periode}}, {{prenom}}",
                    scpi_vous_corps_plain(),
                    scpi_template_variables_json(SCPI_VOUS_CORPS_HTML),
                    tu_id,
                    vous_id
                ],
            )?;
            println!("✅ Modèle Bulletin SCPI trimestriel mis à jour (HTML + variables)");
        } else if tu_link.is_none() {
            if let Some(tu_id) = tu_id {
                self.conn.execute(
                    "UPDATE templates_email SET tutoiement_template_id = ?1, updated_at = unixepoch()
                     WHERE id = ?2",
                    params![tu_id, vous_id],
                )?;
            }
        }
        Ok(())
    }

    pub fn ensure_scpi_bulletin_email_templates(&self) -> Result<()> {
        let exists: i64 = self.conn.query_row(
            "SELECT COUNT(*) FROM templates_email WHERE nom = ?1",
            params![SCPI_BULLETIN_TEMPLATE_NOM],
            |row| row.get(0),
        )?;
        if exists > 0 {
            return self.upgrade_scpi_bulletin_email_templates();
        }

        let tu = self.create_template_email(NewTemplateEmail {
            nom: SCPI_BULLETIN_TEMPLATE_TU_NOM.into(),
            sujet: "Tes bulletins SCPI — {{periode}}, {{prenom}}".into(),
            corps: scpi_tu_corps_plain().into(),
            categorie: "BULLETINS".into(),
            variables: Some(scpi_template_variables_json(SCPI_TU_CORPS_HTML)),
            agenda_link_id: None,
            relance_template_id: None,
            tutoiement_template_id: None,
        })?;

        let _vous = self.create_template_email(NewTemplateEmail {
            nom: SCPI_BULLETIN_TEMPLATE_NOM.into(),
            sujet: "Vos bulletins SCPI — {{periode}}, {{prenom}}".into(),
            corps: scpi_vous_corps_plain().into(),
            categorie: "BULLETINS".into(),
            variables: Some(scpi_template_variables_json(SCPI_VOUS_CORPS_HTML)),
            agenda_link_id: None,
            relance_template_id: None,
            tutoiement_template_id: Some(tu.id),
        })?;

        Ok(())
    }

    fn get_scpi_bulletin_template_id(&self) -> Result<i64> {
        self.ensure_scpi_bulletin_email_templates()?;
        self.conn.query_row(
            "SELECT id FROM templates_email WHERE nom = ?1",
            params![SCPI_BULLETIN_TEMPLATE_NOM],
            |row| row.get(0),
        )
    }

    fn matched_bulletins_for_contact(
        &self,
        contact_id: i64,
        foyer_id: Option<i64>,
        role_foyer: Option<&str>,
        bulletins: &[ScpiBulletinInput],
    ) -> Result<Vec<ScpiBulletinInput>> {
        let mut stmt = self.conn.prepare(
            "SELECT DISTINCT TRIM(nom_produit) FROM investissements
             WHERE contact_id = ?1
               AND type_produit IN ('SCPI', 'SCPI_DEMEMBREMENT', 'SCPI_FISCALE')
               AND COALESCE(statut, 'ACTIF') = 'ACTIF'
               AND TRIM(nom_produit) != ''",
        )?;
        let mut noms: Vec<String> = stmt
            .query_map(params![contact_id], |row| row.get(0))?
            .collect::<Result<Vec<_>, _>>()?;

        if contact_inherits_foyer_scpi_investments(role_foyer) {
            if let Some(fid) = foyer_id {
                let mut foyer_stmt = self.conn.prepare(
                    "SELECT DISTINCT TRIM(nom_produit) FROM investissements
                     WHERE foyer_id = ?1
                       AND type_produit IN ('SCPI', 'SCPI_DEMEMBREMENT', 'SCPI_FISCALE')
                       AND COALESCE(statut, 'ACTIF') = 'ACTIF'
                       AND TRIM(nom_produit) != ''",
                )?;
                let foyer_noms: Vec<String> = foyer_stmt
                    .query_map(params![fid], |row| row.get(0))?
                    .collect::<Result<Vec<_>, _>>()?;
                for nom in foyer_noms {
                    if !noms.iter().any(|existing| existing == &nom) {
                        noms.push(nom);
                    }
                }
            }
        }

        let mut matched = Vec::new();
        for bulletin in bulletins {
            let key = bulletin_match_key(bulletin);
            if noms.iter().any(|nom| nom_produit_matches(nom, &key)) {
                matched.push(ScpiBulletinInput {
                    nom_produit: pick_display_produit_nom(&noms, &key),
                    ..bulletin.clone()
                });
            }
        }
        Ok(matched)
    }

    fn upsert_scpi_campaign_envoi(
        &self,
        contact_id: i64,
        template_id: i64,
        batch_key: &str,
        campaign_variables: &str,
        email_date_prevue: Option<i64>,
        now: i64,
    ) -> Result<&'static str> {
        let existing: Option<(i64, i64)> = self
            .conn
            .query_row(
                "SELECT id, email_envoye FROM contact_template_envois
                 WHERE contact_id = ?1 AND template_id = ?2 AND investissement_id IS NULL
                   AND COALESCE(campaign_batch_key, '') = ?3",
                params![contact_id, template_id, batch_key],
                |row| Ok((row.get(0)?, row.get(1)?)),
            )
            .ok();

        if let Some((id, sent)) = existing {
            if sent != 0 {
                return Ok("already_sent");
            }
            // n8n prepare = rafraîchissement campagne trimestre : remet en file même
            // après Retiré ou « Ne plus proposer » (comme un nouveau cycle de préparation).
            self.conn.execute(
                "UPDATE contact_template_envois SET
                    campaign_variables = ?1,
                    trigger_event_at = ?2,
                    email_date_prevue = ?3,
                    email_annule = 0,
                    email_suivi_ignore = 0
                 WHERE id = ?4",
                params![campaign_variables, now, email_date_prevue, id],
            )?;
            return Ok("updated");
        }

        self.conn.execute(
            "INSERT INTO contact_template_envois (
                contact_id, template_id, investissement_id, trigger_event_at,
                email_date_prevue, campaign_batch_key, campaign_variables
             ) VALUES (?1, ?2, NULL, ?3, ?4, ?5, ?6)",
            params![
                contact_id,
                template_id,
                now,
                email_date_prevue,
                batch_key,
                campaign_variables
            ],
        )?;
        Ok("created")
    }

    pub fn prepare_scpi_bulletin_campaign(
        &self,
        input: PrepareScpiCampaignInput,
    ) -> Result<PrepareScpiCampaignResult> {
        let periode = input.periode.trim();
        if periode.is_empty() {
            return Err(rusqlite::Error::InvalidParameterName(
                "periode obligatoire".into(),
            ));
        }
        if input.bulletins.is_empty() {
            return Err(rusqlite::Error::InvalidParameterName(
                "bulletins vide".into(),
            ));
        }

        let template_id = self.get_scpi_bulletin_template_id()?;
        let batch_key = normalize_batch_key(periode);
        let now = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_secs() as i64;

        let mut stmt = self.conn.prepare(
            "SELECT id, foyer_id, email, role_foyer FROM contacts
             WHERE categorie IN ('CLIENT', 'PROSPECT_CLIENT')",
        )?;
        let contacts: Vec<(i64, Option<i64>, Option<String>, Option<String>)> = stmt
            .query_map([], |row| {
                Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?))
            })?
            .collect::<Result<Vec<_>, _>>()?;

        let mut contacts_matched = 0u64;
        let mut contacts_queued = 0u64;
        let mut contacts_no_email = 0u64;
        let mut contacts_skipped_already_sent = 0u64;

        for (contact_id, foyer_id, email, role_foyer) in contacts {
            let matched = self.matched_bulletins_for_contact(
                contact_id,
                foyer_id,
                role_foyer.as_deref(),
                &input.bulletins,
            )?;
            if matched.is_empty() {
                continue;
            }
            contacts_matched += 1;

            let campaign_variables =
                build_scpi_campaign_variables_json(&matched, periode, now);

            let has_email = email
                .as_deref()
                .map(str::trim)
                .filter(|s| !s.is_empty())
                .is_some();
            if !has_email {
                contacts_no_email += 1;
            }

            let email_date_prevue = Some(now);
            match self.upsert_scpi_campaign_envoi(
                contact_id,
                template_id,
                &batch_key,
                &campaign_variables,
                email_date_prevue,
                now,
            )? {
                "already_sent" => contacts_skipped_already_sent += 1,
                "created" | "updated" => {
                    if has_email {
                        contacts_queued += 1;
                    }
                }
                _ => {}
            }
        }

        let bulletins_count = input.bulletins.len();
        let message = format!(
            "Campagne {} : {} contact(s) cible(s), {} pret(s) a envoyer, {} sans email, {} deja envoye(s).",
            periode, contacts_matched, contacts_queued, contacts_no_email, contacts_skipped_already_sent
        );

        let snapshot = ScpiLastPrepareSnapshot {
            periode: periode.to_string(),
            batch_key: batch_key.clone(),
            prepared_at: now,
            bulletins_count,
            contacts_matched,
            contacts_queued,
            contacts_no_email,
            contacts_skipped_already_sent,
            digest_version: SCPI_CAMPAIGN_DIGEST_VERSION,
        };
        self.save_scpi_last_prepare_snapshot(&snapshot)?;

        Ok(PrepareScpiCampaignResult {
            periode: periode.to_string(),
            batch_key,
            bulletins_count,
            contacts_matched,
            contacts_queued,
            contacts_no_email,
            contacts_skipped_already_sent,
            template_nom: SCPI_BULLETIN_TEMPLATE_NOM.to_string(),
            message,
        })
    }

    fn save_scpi_last_prepare_snapshot(&self, snapshot: &ScpiLastPrepareSnapshot) -> Result<()> {
        let json = serde_json::to_string(snapshot).map_err(|e| {
            rusqlite::Error::InvalidParameterName(format!("JSON serialize error: {e}"))
        })?;
        self.set_setting(SCPI_LAST_PREPARE_SETTING, &json)
    }

    fn load_scpi_last_prepare_snapshot(&self) -> Result<Option<ScpiLastPrepareSnapshot>> {
        match self.get_setting(SCPI_LAST_PREPARE_SETTING)? {
            Some(raw) => {
                let parsed = serde_json::from_str(&raw).map_err(|e| {
                    rusqlite::Error::InvalidParameterName(format!("JSON parse error: {e}"))
                })?;
                Ok(Some(parsed))
            }
            None => Ok(None),
        }
    }

    fn count_scpi_ready_for_batch(&self, batch_key: &str) -> Result<u64> {
        let now = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_secs() as i64;
        self.conn.query_row(
            "SELECT COUNT(*) FROM contact_template_envois cte
             INNER JOIN templates_email t ON t.id = cte.template_id
             INNER JOIN contacts c ON c.id = cte.contact_id
             WHERE t.nom IN (?1, ?2)
               AND cte.campaign_batch_key = ?3
               AND cte.email_envoye = 0
               AND COALESCE(cte.email_annule, 0) = 0
               AND COALESCE(cte.email_suivi_ignore, 0) = 0
               AND cte.email_date_prevue IS NOT NULL
               AND cte.email_date_prevue <= ?4
               AND c.email IS NOT NULL AND TRIM(c.email) != ''",
            params![
                SCPI_BULLETIN_TEMPLATE_NOM,
                SCPI_BULLETIN_TEMPLATE_TU_NOM,
                batch_key,
                now,
            ],
            |row| row.get(0),
        )
    }

    /// Envois réussis du batch trimestre courant (file modèle), pas le journal global.
    fn count_scpi_sent_for_batch(&self, batch_key: &str) -> Result<u64> {
        self.conn.query_row(
            "SELECT COUNT(*) FROM contact_template_envois cte
             INNER JOIN templates_email t ON t.id = cte.template_id
             WHERE t.nom IN (?1, ?2)
               AND COALESCE(cte.campaign_batch_key, '') = ?3
               AND cte.email_envoye = 1",
            params![
                SCPI_BULLETIN_TEMPLATE_NOM,
                SCPI_BULLETIN_TEMPLATE_TU_NOM,
                batch_key,
            ],
            |row| row.get(0),
        )
    }

    pub fn get_scpi_campaign_dashboard(&self) -> Result<ScpiCampaignDashboard> {
        let last_prepare = self.load_scpi_last_prepare_snapshot()?;
        let ready_count = match last_prepare.as_ref() {
            Some(snap) => self.count_scpi_ready_for_batch(&snap.batch_key)?,
            None => 0,
        };
        let sent_since_prepare = match last_prepare.as_ref() {
            Some(snap) => self.count_scpi_sent_for_batch(&snap.batch_key)?,
            None => 0,
        };
        Ok(ScpiCampaignDashboard {
            last_prepare,
            ready_count,
            sent_since_prepare,
            current_digest_version: SCPI_CAMPAIGN_DIGEST_VERSION,
        })
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ScpiLastPrepareSnapshot {
    pub periode: String,
    pub batch_key: String,
    pub prepared_at: i64,
    pub bulletins_count: usize,
    pub contacts_matched: u64,
    pub contacts_queued: u64,
    pub contacts_no_email: u64,
    pub contacts_skipped_already_sent: u64,
    pub digest_version: i64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ScpiCampaignDashboard {
    pub last_prepare: Option<ScpiLastPrepareSnapshot>,
    pub ready_count: u64,
    pub sent_since_prepare: u64,
    pub current_digest_version: i64,
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::database::models::{NewContact, NewInvestissement};
    use crate::database::Database;

    fn mem_db() -> Database {
        let conn = rusqlite::Connection::open_in_memory().unwrap();
        conn.execute("PRAGMA foreign_keys = ON", []).unwrap();
        let db = Database { conn };
        db.init_tables().unwrap();
        db
    }

    #[test]
    fn list_scpi_product_names_distinct_sorted() {
        let db = mem_db();
        let cid = db
            .create_contact(NewContact {
                categorie: "CLIENT".into(),
                nom: "DUPONT".into(),
                prenom: "Jean".into(),
                email: Some("j@example.com".into()),
                ..Default::default()
            })
            .unwrap()
            .id
            .unwrap();
        db.create_investissement(NewInvestissement {
            contact_id: Some(cid),
            foyer_id: None,
            type_produit: "SCPI".into(),
            partenaire_id: None,
            nom_produit: "Comète".into(),
            numero_contrat: None,
            montant_initial: None,
            date_souscription: None,
            date_fin_demembrement: None,
            date_fin_pret: None,
            mensualite_credit: None,
            credit_crd: None,
            loyer_mensuel: None,
            prevoyance_perso: None,
            prevoyance_pro: None,
            prevoyance_versement_mensuel: None,
            versement_programme: None,
            montant_versement_programme: None,
            frequence_versement: None,
            reinvestissement_dividendes: None,
            notes: None,
            origine: None,
        })
        .unwrap();
        db.create_investissement(NewInvestissement {
            contact_id: Some(cid),
            foyer_id: None,
            type_produit: "SCPI".into(),
            partenaire_id: None,
            nom_produit: "Comète".into(),
            numero_contrat: None,
            montant_initial: None,
            date_souscription: None,
            date_fin_demembrement: None,
            date_fin_pret: None,
            mensualite_credit: None,
            credit_crd: None,
            loyer_mensuel: None,
            prevoyance_perso: None,
            prevoyance_pro: None,
            prevoyance_versement_mensuel: None,
            versement_programme: None,
            montant_versement_programme: None,
            frequence_versement: None,
            reinvestissement_dividendes: None,
            notes: None,
            origine: None,
        })
        .unwrap();
        db.create_investissement(NewInvestissement {
            contact_id: Some(cid),
            foyer_id: None,
            type_produit: "SCPI".into(),
            partenaire_id: None,
            nom_produit: "Transitions Europe".into(),
            numero_contrat: None,
            montant_initial: None,
            date_souscription: None,
            date_fin_demembrement: None,
            date_fin_pret: None,
            mensualite_credit: None,
            credit_crd: None,
            loyer_mensuel: None,
            prevoyance_perso: None,
            prevoyance_pro: None,
            prevoyance_versement_mensuel: None,
            versement_programme: None,
            montant_versement_programme: None,
            frequence_versement: None,
            reinvestissement_dividendes: None,
            notes: None,
            origine: None,
        })
        .unwrap();

        let names = db.list_scpi_product_names().unwrap();
        assert_eq!(names, vec!["Comète", "Transitions Europe"]);
    }

    #[test]
    fn bulletin_summary_keeps_acquisition_lines_with_hyphens() {
        let bulletins = vec![ScpiBulletinInput {
            nom_produit: "Comète".into(),
            summary_markdown: [
                "Comete – T1 2026",
                "",
                "1. Chiffres clés",
                "Collecte : 132 M€",
                "2. Ce trimestre",
                "Dynamique au Canada.",
                "3. Acquisitions",
                "Canada, Trans-Canada : entrepôt.",
                "Royaume-Uni, Édimbourg : mixte.",
            ]
            .join("\n"),
            fichier_source: None,
        }];
        let resume = build_bulletin_resume(
            &vec![
                bulletins[0].clone(),
                ScpiBulletinInput {
                    nom_produit: "Transitions Europe".into(),
                    summary_markdown: "Transitions Europe – T1 2026\n\n1. Chiffres clés\nOK".into(),
                    fichier_source: None,
                },
            ],
            "T1 2026",
        );
        assert!(resume.contains("Trans-Canada"));
        assert!(resume.contains("Royaume-Uni"));
        assert_eq!(resume.matches("Comète – T1 2026").count(), 1);
    }

    #[test]
    fn bulletin_summary_normalizes_broken_mistral_bold_and_repeated_titles() {
        let bulletins = vec![
            ScpiBulletinInput {
                nom_produit: "Comète".into(),
                summary_markdown: [
                    "Comete – T1 2026",
                    "",
                    "**",
                    "1. Chiffres clés**",
                    "Collecte nette de 132,2 M€.",
                    "**",
                    "2. Ce trimestre**",
                    "Comete – T1 2026",
                    "**",
                    "3. Acquisitions**",
                    "Pologne, Tarnobrzeg : actif logistique.",
                    "Comete – T1 2026",
                    "Comete – T1 2026",
                    "Espagne, Getafe : loisirs.",
                ]
                .join("\n"),
                fichier_source: None,
            },
            ScpiBulletinInput {
                nom_produit: "Transitions Europe".into(),
                summary_markdown:
                    "Transitions Europe – T1 2026\n\n1. Chiffres clés\nCollecte : 147 M€".into(),
                fichier_source: None,
            },
        ];
        let resume = build_bulletin_resume(&bulletins, "T1 2026");
        assert!(!resume.contains("**"));
        assert!(resume.contains("1. Chiffres clés"));
        assert!(resume.contains("Pologne, Tarnobrzeg"));
        assert_eq!(resume.matches("Comète – T1 2026").count(), 1);
    }

    #[test]
    fn bulletin_summary_normalizes_mistral_dash_format_and_duplicate_title() {
        let bulletins = vec![ScpiBulletinInput {
            nom_produit: "Comète".into(),
            summary_markdown: [
                "Comete – T1 2026",
                "",
                "-",
                "1. Chiffres clés :",
                "La collecte nette atteint 132,2 M€.",
                "-",
                "2. Ce trimestre :",
                "Comete – T1 2026",
                "-",
                "3. Acquisitions :",
                "Pologne, Tarnobrzeg : Actif logistique.",
            ]
            .join("\n"),
            fichier_source: None,
        }];
        let resume = build_bulletin_resume(
            &vec![
                bulletins[0].clone(),
                ScpiBulletinInput {
                    nom_produit: "Transitions Europe".into(),
                    summary_markdown: "Transitions Europe – T1 2026\n\n1. Chiffres clés\nCollecte : 147 M€".into(),
                    fichier_source: None,
                },
            ],
            "T1 2026",
        );
        assert!(resume.contains("## Comète – T1 2026"));
        assert!(resume.contains("1. Chiffres clés"));
        assert!(!resume.contains("1. Chiffres clés :"));
        assert!(!resume.contains("\n-\n"));
        assert!(!resume.contains("2. Ce trimestre\nComete – T1 2026"));
    }

    #[test]
    fn build_bulletin_resume_dedupes_bullet_prefixed_titles() {
        let bulletins = vec![ScpiBulletinInput {
            nom_produit: "Comète".into(),
            summary_markdown: [
                "- Comete – T1 2026",
                "",
                "- Comète – T1 2026",
                "",
                "1. Chiffres clés",
                "- Collecte nette : 132 M€",
            ]
            .join("\n"),
            fichier_source: None,
        }];
        let resume = build_bulletin_resume(&bulletins, "T1 2026");
        assert!(resume.contains("## Comète – T1 2026"));
        assert!(!resume.contains("- Comete"));
        assert!(!resume.contains("- Comète"));
        assert_eq!(resume.matches("Comète – T1 2026").count(), 1);
    }

    #[test]
    fn build_bulletin_resume_single_omits_product_header() {
        let bulletins = vec![ScpiBulletinInput {
            nom_produit: "Comète".into(),
            summary_markdown: "2. Chiffres clés\n- Collecte : 132 M€".into(),
            fichier_source: None,
        }];
        let resume = build_bulletin_resume(&bulletins, "T1 2026");
        assert!(!resume.contains("## Comète"));
        assert!(resume.contains("1. Chiffres clés"));
        assert!(resume.contains("Collecte : 132 M€"));
    }

    #[test]
    fn collapse_vertical_year_in_bulletin_summary() {
        let bulletins = vec![ScpiBulletinInput {
            nom_produit: "Comète".into(),
            summary_markdown: [
                "1. Comète – T",
                "1",
                "2026",
                "",
                "3. Ce trimestre",
                "Objectif de distribution",
                "2",
                "0",
                "2",
                "6. Malgré un contexte incertain.",
            ]
            .join("\n"),
            fichier_source: None,
        }];
        let resume = build_bulletin_resume(&bulletins, "T1 2026");
        assert!(resume.contains("## Comète – T1 2026"));
        assert!(resume.contains("distribution 2026. Malgré"));
        assert!(!resume.contains("– T\n1\n2026"));
    }

    #[test]
    fn bulletin_summary_strips_trailing_duplicate_title_and_verbose_period() {
        let bulletins = vec![ScpiBulletinInput {
            nom_produit: "Epargne Pierre Europe".into(),
            summary_markdown: [
                "1. Epargne Pierre Europe – 1er trimestre 2026**",
                "",
                "2. Chiffres clés",
                "- Collecte : 75 M€",
                "",
                "1. Epargne Pierre Europe – 1er trimestre 2026**",
            ]
            .join("\n"),
            fichier_source: None,
        }];
        let resume = build_bulletin_resume(&bulletins, "T1 2026");
        assert!(resume.contains("## Epargne Pierre Europe – T1 2026"));
        assert!(resume.contains("1. Chiffres clés"));
        assert!(!resume.contains("1er trimestre"));
        assert!(!resume.contains("2026**"));
        assert_eq!(
            resume.matches("## Epargne Pierre Europe – T1 2026").count(),
            1
        );
    }

    #[test]
    fn build_bulletin_resume_multi_uses_crm_name_and_no_hash_headers() {
        let bulletins = vec![
            ScpiBulletinInput {
                nom_produit: "Comète".into(),
                summary_markdown: "1. Comète – T1 2026\n\n2. Chiffres clés\n- Collecte : 132 M€".into(),
                fichier_source: None,
            },
            ScpiBulletinInput {
                nom_produit: "Transitions Europe".into(),
                summary_markdown:
                    "## Europe\n\n1. Europe – T1 2026\n\n2. Chiffres clés\n- Collecte : 147 M€".into(),
                fichier_source: None,
            },
        ];
        let resume = build_bulletin_resume(&bulletins, "T1 2026");
        assert!(!resume.contains("## Europe"));
        assert!(resume.contains("## Comète – T1 2026"));
        assert!(resume.contains("## Transitions Europe – T1 2026"));
        assert!(resume.contains("1. Chiffres clés"));
        assert!(resume.contains("\n\n---\n\n"));
    }

    #[test]
    fn pick_display_produit_nom_prefers_longest_crm_label() {
        let noms = vec!["Transitions Europe".into(), "Europe".into()];
        assert_eq!(
            pick_display_produit_nom(&noms, "Europe"),
            "Transitions Europe"
        );
    }

    #[test]
    fn bulletin_match_key_uses_summary_title_not_ambiguous_filename_token() {
        let bulletin = ScpiBulletinInput {
            nom_produit: "Europe".into(),
            summary_markdown:
                "1. Transitions Europe – 1er trimestre 2026**\n\n2. Chiffres clés\n- Collecte : 147 M€".into(),
            fichier_source: Some("BTI 2026 Transitions Europe.pdf".into()),
        };
        assert_eq!(bulletin_match_key(&bulletin), "Transitions Europe");

        let noms = vec![
            "Transitions Europe".into(),
            "Epargne Pierre Europe".into(),
        ];
        assert_eq!(
            pick_display_produit_nom(&noms, &bulletin_match_key(&bulletin)),
            "Transitions Europe"
        );

        let bulletin2 = ScpiBulletinInput {
            nom_produit: "Europe".into(),
            summary_markdown:
                "1. Epargne Pierre Europe – 1er trimestre 2026**\n\n2. Chiffres clés\n- Capitalisation : 635 M€"
                    .into(),
            fichier_source: Some("BTI Epargne Pierre Europe.pdf".into()),
        };
        assert_eq!(bulletin_match_key(&bulletin2), "Epargne Pierre Europe");
        assert_eq!(
            pick_display_produit_nom(&noms, &bulletin_match_key(&bulletin2)),
            "Epargne Pierre Europe"
        );
    }

    #[test]
    fn bulletin_match_key_prefers_fichier_when_summary_title_conflicts() {
        let bulletin = ScpiBulletinInput {
            nom_produit: "Europe".into(),
            summary_markdown:
                "1. Transitions Europe – 1er trimestre 2026**\n\n2. Chiffres clés\n- Capitalisation : 635 M€"
                    .into(),
            fichier_source: Some("BTI Epargne Pierre Europe T1 2026.pdf".into()),
        };
        assert_eq!(bulletin_match_key(&bulletin), "Epargne Pierre Europe");
    }

    #[test]
    fn infer_produit_from_fichier_strips_bti_and_period() {
        assert_eq!(
            infer_produit_from_fichier("BTI Transitions Europe T1 2026.pdf"),
            Some("Transitions Europe".into())
        );
    }

    #[test]
    fn infer_produit_from_summary_strips_scpi_prefix() {
        assert_eq!(
            infer_produit_from_summary("1. SCPI Comète – T1 2026\n\n2. Chiffres clés"),
            Some("Comète".into())
        );
    }

    #[test]
    fn scpi_intro_singular_vs_plural() {
        let (tu, vous) = scpi_intro_phrases(1);
        assert!(tu.contains("ta SCPI"));
        assert!(vous.contains("votre SCPI"));
        assert!(!tu.contains("tes SCPI"));
        let (tu2, vous2) = scpi_intro_phrases(2);
        assert!(tu2.contains("tes SCPI"));
        assert!(vous2.contains("vos SCPI"));
    }

    #[test]
    fn scpi_template_user_customized_blocks_upgrade() {
        let vars = r#"{"corps_html":"<p>x</p>","scpi_template_version":1,"scpi_template_user_customized":true}"#;
        assert!(!scpi_template_needs_upgrade(Some(vars)));
    }

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
    fn contact_inherits_foyer_scpi_investments_excludes_enfant() {
        assert!(contact_inherits_foyer_scpi_investments(Some("DECLARANT_1")));
        assert!(contact_inherits_foyer_scpi_investments(Some("DECLARANT_2")));
        assert!(contact_inherits_foyer_scpi_investments(Some("AUTRE")));
        assert!(contact_inherits_foyer_scpi_investments(None));
        assert!(!contact_inherits_foyer_scpi_investments(Some("ENFANT")));
    }

    #[test]
    fn prepare_campaign_excludes_enfants_from_foyer_scpi() {
        use crate::database::models::{NewContact, NewFoyer, NewInvestissement};

        fn sample_client(nom: &str, prenom: &str) -> NewContact {
            NewContact {
                categorie: "CLIENT".into(),
                nom: nom.into(),
                prenom: prenom.into(),
                statut_suivi: Some("ACTIF".into()),
                ..Default::default()
            }
        }

        let db = mem_db();
        let foyer = db
            .create_foyer(NewFoyer {
                nom: "Foyer MARTIN".into(),
                type_foyer: "COUPLE".into(),
                nombre_parts_fiscales: None,
                tranche_imposition: None,
                revenu_fiscal_reference: None,
                ir_net_a_payer: None,
                situation_patrimoniale: None,
                objectifs_patrimoniaux: None,
                notes: None,
            })
            .unwrap();

        let parent1 = db
            .create_contact(NewContact {
                foyer_id: Some(foyer.id),
                role_foyer: Some("DECLARANT_1".into()),
                email: Some("amandine@example.com".into()),
                ..sample_client("MARTIN", "Amandine")
            })
            .unwrap()
            .id
            .unwrap();
        let parent2 = db
            .create_contact(NewContact {
                foyer_id: Some(foyer.id),
                role_foyer: Some("DECLARANT_2".into()),
                email: Some("tony@example.com".into()),
                ..sample_client("MARTIN", "Tony")
            })
            .unwrap()
            .id
            .unwrap();
        let enfant = db
            .create_contact(NewContact {
                foyer_id: Some(foyer.id),
                role_foyer: Some("ENFANT".into()),
                email: Some("enfant@example.com".into()),
                ..sample_client("MARTIN", "Lucas")
            })
            .unwrap()
            .id
            .unwrap();

        db.create_investissement(NewInvestissement {
            contact_id: None,
            foyer_id: Some(foyer.id),
            type_produit: "SCPI".into(),
            partenaire_id: None,
            nom_produit: "Comète".into(),
            numero_contrat: None,
            montant_initial: None,
            date_souscription: None,
            date_fin_demembrement: None,
            date_fin_pret: None,
            mensualite_credit: None,
            credit_crd: None,
            loyer_mensuel: None,
            prevoyance_perso: None,
            prevoyance_pro: None,
            prevoyance_versement_mensuel: None,
            versement_programme: None,
            montant_versement_programme: None,
            frequence_versement: None,
            reinvestissement_dividendes: None,
            notes: None,
            origine: None,
        })
        .unwrap();

        let result = db
            .prepare_scpi_bulletin_campaign(PrepareScpiCampaignInput {
                periode: "T1 2026".into(),
                bulletins: vec![ScpiBulletinInput {
                    nom_produit: "Comète".into(),
                    summary_markdown: "Collecte stable".into(),
                    fichier_source: None,
                }],
            })
            .unwrap();

        assert_eq!(result.contacts_matched, 2);
        assert_eq!(result.contacts_queued, 2);

        let queued: Vec<i64> = db
            .conn
            .prepare(
                "SELECT contact_id FROM contact_template_envois
                 WHERE COALESCE(campaign_batch_key, '') != ''",
            )
            .unwrap()
            .query_map([], |row| row.get(0))
            .unwrap()
            .collect::<Result<Vec<_>, _>>()
            .unwrap();
        assert!(queued.contains(&parent1));
        assert!(queued.contains(&parent2));
        assert!(!queued.contains(&enfant));
    }

    #[test]
    fn prepare_campaign_includes_enfant_with_personal_scpi() {
        use crate::database::models::{NewContact, NewFoyer, NewInvestissement};

        let db = mem_db();
        let foyer = db
            .create_foyer(NewFoyer {
                nom: "Foyer DUPONT".into(),
                type_foyer: "COUPLE".into(),
                nombre_parts_fiscales: None,
                tranche_imposition: None,
                revenu_fiscal_reference: None,
                ir_net_a_payer: None,
                situation_patrimoniale: None,
                objectifs_patrimoniaux: None,
                notes: None,
            })
            .unwrap();

        let enfant = db
            .create_contact(NewContact {
                foyer_id: Some(foyer.id),
                role_foyer: Some("ENFANT".into()),
                email: Some("lucas@example.com".into()),
                categorie: "CLIENT".into(),
                nom: "DUPONT".into(),
                prenom: "Lucas".into(),
                statut_suivi: Some("ACTIF".into()),
                ..Default::default()
            })
            .unwrap()
            .id
            .unwrap();

        db.create_investissement(NewInvestissement {
            contact_id: None,
            foyer_id: Some(foyer.id),
            type_produit: "SCPI".into(),
            partenaire_id: None,
            nom_produit: "Comète".into(),
            numero_contrat: None,
            montant_initial: None,
            date_souscription: None,
            date_fin_demembrement: None,
            date_fin_pret: None,
            mensualite_credit: None,
            credit_crd: None,
            loyer_mensuel: None,
            prevoyance_perso: None,
            prevoyance_pro: None,
            prevoyance_versement_mensuel: None,
            versement_programme: None,
            montant_versement_programme: None,
            frequence_versement: None,
            reinvestissement_dividendes: None,
            notes: None,
            origine: None,
        })
        .unwrap();
        db.create_investissement(NewInvestissement {
            contact_id: Some(enfant),
            foyer_id: None,
            type_produit: "SCPI".into(),
            partenaire_id: None,
            nom_produit: "Primovie".into(),
            numero_contrat: None,
            montant_initial: None,
            date_souscription: None,
            date_fin_demembrement: None,
            date_fin_pret: None,
            mensualite_credit: None,
            credit_crd: None,
            loyer_mensuel: None,
            prevoyance_perso: None,
            prevoyance_pro: None,
            prevoyance_versement_mensuel: None,
            versement_programme: None,
            montant_versement_programme: None,
            frequence_versement: None,
            reinvestissement_dividendes: None,
            notes: None,
            origine: None,
        })
        .unwrap();

        let result = db
            .prepare_scpi_bulletin_campaign(PrepareScpiCampaignInput {
                periode: "T1 2026".into(),
                bulletins: vec![
                    ScpiBulletinInput {
                        nom_produit: "Comète".into(),
                        summary_markdown: "Parents".into(),
                        fichier_source: None,
                    },
                    ScpiBulletinInput {
                        nom_produit: "Primovie".into(),
                        summary_markdown: "Lucas".into(),
                        fichier_source: None,
                    },
                ],
            })
            .unwrap();

        assert_eq!(result.contacts_matched, 1);
        assert_eq!(result.contacts_queued, 1);

        let vars: String = db
            .conn
            .query_row(
                "SELECT campaign_variables FROM contact_template_envois WHERE contact_id = ?1",
                params![enfant],
                |row| row.get(0),
            )
            .unwrap();
        assert!(vars.contains("Lucas"));
        assert!(!vars.contains("Parents"));
        assert!(vars.contains("\"scpi_count\":1"));
    }

    #[test]
    fn prepare_campaign_restores_retired_or_dismissed_on_n8n_rerun() {
        use crate::database::models::{NewContact, NewInvestissement};

        let db = mem_db();
        let cid = db
            .create_contact(NewContact {
                email: Some("client@example.com".into()),
                categorie: "CLIENT".into(),
                nom: "CARNEROS".into(),
                prenom: "Patrick".into(),
                statut_suivi: Some("ACTIF".into()),
                ..Default::default()
            })
            .unwrap()
            .id
            .unwrap();

        db.create_investissement(NewInvestissement {
            contact_id: Some(cid),
            foyer_id: None,
            type_produit: "SCPI".into(),
            partenaire_id: None,
            nom_produit: "Comète".into(),
            numero_contrat: None,
            montant_initial: None,
            date_souscription: None,
            date_fin_demembrement: None,
            date_fin_pret: None,
            mensualite_credit: None,
            credit_crd: None,
            loyer_mensuel: None,
            prevoyance_perso: None,
            prevoyance_pro: None,
            prevoyance_versement_mensuel: None,
            versement_programme: None,
            montant_versement_programme: None,
            frequence_versement: None,
            reinvestissement_dividendes: None,
            notes: None,
            origine: None,
        })
        .unwrap();

        let input = PrepareScpiCampaignInput {
            periode: "T1 2026".into(),
            bulletins: vec![ScpiBulletinInput {
                nom_produit: "Comète".into(),
                summary_markdown: "V1".into(),
                fichier_source: None,
            }],
        };
        db.prepare_scpi_bulletin_campaign(input.clone()).unwrap();
        let row_id = db.get_etiquette_email_queue("ready").unwrap()[0].contact_etiquette_id;

        db.cancel_pending_email_campaign(row_id, Some("template"))
            .unwrap();
        db.dismiss_cancelled_pending_email_campaign(row_id, Some("template"))
            .unwrap();
        assert!(db.get_etiquette_email_queue("ready").unwrap().is_empty());
        assert!(db.get_etiquette_email_queue("cancelled").unwrap().is_empty());

        db.prepare_scpi_bulletin_campaign(PrepareScpiCampaignInput {
            periode: "T1 2026".into(),
            bulletins: vec![ScpiBulletinInput {
                nom_produit: "Comète".into(),
                summary_markdown: "V2 trimestre".into(),
                fichier_source: None,
            }],
        })
        .unwrap();

        let ready = db.get_etiquette_email_queue("ready").unwrap();
        assert_eq!(ready.len(), 1);
        assert_eq!(ready[0].contact_id, cid);
        assert!(ready[0].campaign_variables.as_deref().unwrap_or("").contains("V2 trimestre"));
    }

    #[test]
    fn prepare_new_period_after_dismiss_requeues_contact() {
        use crate::database::models::{NewContact, NewInvestissement};

        let db = mem_db();
        let cid = db
            .create_contact(NewContact {
                email: Some("patrick@example.com".into()),
                categorie: "CLIENT".into(),
                nom: "CARNEROS".into(),
                prenom: "Patrick".into(),
                statut_suivi: Some("ACTIF".into()),
                ..Default::default()
            })
            .unwrap()
            .id
            .unwrap();

        db.create_investissement(NewInvestissement {
            contact_id: Some(cid),
            foyer_id: None,
            type_produit: "SCPI".into(),
            partenaire_id: None,
            nom_produit: "Comète".into(),
            numero_contrat: None,
            montant_initial: None,
            date_souscription: None,
            date_fin_demembrement: None,
            date_fin_pret: None,
            mensualite_credit: None,
            credit_crd: None,
            loyer_mensuel: None,
            prevoyance_perso: None,
            prevoyance_pro: None,
            prevoyance_versement_mensuel: None,
            versement_programme: None,
            montant_versement_programme: None,
            frequence_versement: None,
            reinvestissement_dividendes: None,
            notes: None,
            origine: None,
        })
        .unwrap();

        db.prepare_scpi_bulletin_campaign(PrepareScpiCampaignInput {
            periode: "T1 2026".into(),
            bulletins: vec![ScpiBulletinInput {
                nom_produit: "Comète".into(),
                summary_markdown: "Digest T1".into(),
                fichier_source: None,
            }],
        })
        .unwrap();
        let t1_row = db.get_etiquette_email_queue("ready").unwrap()[0].contact_etiquette_id;
        db.cancel_pending_email_campaign(t1_row, Some("template"))
            .unwrap();
        db.dismiss_cancelled_pending_email_campaign(t1_row, Some("template"))
            .unwrap();
        assert!(db.get_etiquette_email_queue("ready").unwrap().is_empty());

        db.prepare_scpi_bulletin_campaign(PrepareScpiCampaignInput {
            periode: "T2 2026".into(),
            bulletins: vec![ScpiBulletinInput {
                nom_produit: "Comète".into(),
                summary_markdown: "Digest T2".into(),
                fichier_source: None,
            }],
        })
        .unwrap();

        let ready = db.get_etiquette_email_queue("ready").unwrap();
        assert_eq!(ready.len(), 1);
        assert_eq!(ready[0].contact_id, cid);
        assert!(ready[0]
            .campaign_variables
            .as_deref()
            .unwrap_or("")
            .contains("Digest T2"));

        let row_count: i64 = db
            .conn
            .query_row(
                "SELECT COUNT(*) FROM contact_template_envois WHERE contact_id = ?1",
                params![cid],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(row_count, 2);
    }

    #[test]
    fn scpi_sent_envoi_excluded_from_sent_and_followup_queues() {
        use crate::database::models::{NewContact, NewInvestissement};

        let db = mem_db();
        db.ensure_scpi_bulletin_email_templates().unwrap();
        let tpl_vars: String = db
            .conn
            .query_row(
                "SELECT variables FROM templates_email WHERE nom = ?1",
                params![SCPI_BULLETIN_TEMPLATE_NOM],
                |row| row.get(0),
            )
            .unwrap();
        assert!(tpl_vars.contains("\"attendre_reponse\":false"));

        let cid = db
            .create_contact(NewContact {
                email: Some("client@example.com".into()),
                categorie: "CLIENT".into(),
                nom: "DUPONT".into(),
                prenom: "Jean".into(),
                statut_suivi: Some("ACTIF".into()),
                ..Default::default()
            })
            .unwrap()
            .id
            .unwrap();

        db.create_investissement(NewInvestissement {
            contact_id: Some(cid),
            foyer_id: None,
            type_produit: "SCPI".into(),
            partenaire_id: None,
            nom_produit: "Comète".into(),
            numero_contrat: None,
            montant_initial: None,
            date_souscription: None,
            date_fin_demembrement: None,
            date_fin_pret: None,
            mensualite_credit: None,
            credit_crd: None,
            loyer_mensuel: None,
            prevoyance_perso: None,
            prevoyance_pro: None,
            prevoyance_versement_mensuel: None,
            versement_programme: None,
            montant_versement_programme: None,
            frequence_versement: None,
            reinvestissement_dividendes: None,
            notes: None,
            origine: None,
        })
        .unwrap();

        db.prepare_scpi_bulletin_campaign(PrepareScpiCampaignInput {
            periode: "T1 2026".into(),
            bulletins: vec![ScpiBulletinInput {
                nom_produit: "Comète".into(),
                summary_markdown: "Digest".into(),
                fichier_source: None,
            }],
        })
        .unwrap();
        let row_id = db.get_etiquette_email_queue("ready").unwrap()[0].contact_etiquette_id;
        db.mark_template_email_sent(row_id, None, None, Some("Sujet"), None, None, None)
            .unwrap();

        assert!(db.get_etiquette_email_queue("sent").unwrap().is_empty());
        assert!(db.get_etiquette_email_queue("followup").unwrap().is_empty());
    }

    #[test]
    fn prepare_campaign_digest_one_mail_per_contact() {
        let db = mem_db();
        let cid = db
            .create_contact(NewContact {
                categorie: "CLIENT".into(),
                nom: "DUPONT".into(),
                prenom: "Jean".into(),
                email: Some("j.dupont@example.com".into()),
                ..Default::default()
            })
            .unwrap()
            .id
            .expect("contact id");

        db.create_investissement(NewInvestissement {
            contact_id: Some(cid),
            foyer_id: None,
            type_produit: "SCPI".into(),
            partenaire_id: None,
            nom_produit: "Comète".into(),
            numero_contrat: None,
            montant_initial: None,
            date_souscription: None,
            date_fin_demembrement: None,
            date_fin_pret: None,
            mensualite_credit: None,
            credit_crd: None,
            loyer_mensuel: None,
            prevoyance_perso: None,
            prevoyance_pro: None,
            prevoyance_versement_mensuel: None,
            versement_programme: None,
            montant_versement_programme: None,
            frequence_versement: None,
            reinvestissement_dividendes: None,
            notes: None,
            origine: None,
        })
        .unwrap();
        db.create_investissement(NewInvestissement {
            contact_id: Some(cid),
            foyer_id: None,
            type_produit: "SCPI".into(),
            partenaire_id: None,
            nom_produit: "Primovie".into(),
            numero_contrat: None,
            montant_initial: None,
            date_souscription: None,
            date_fin_demembrement: None,
            date_fin_pret: None,
            mensualite_credit: None,
            credit_crd: None,
            loyer_mensuel: None,
            prevoyance_perso: None,
            prevoyance_pro: None,
            prevoyance_versement_mensuel: None,
            versement_programme: None,
            montant_versement_programme: None,
            frequence_versement: None,
            reinvestissement_dividendes: None,
            notes: None,
            origine: None,
        })
        .unwrap();

        let result = db
            .prepare_scpi_bulletin_campaign(PrepareScpiCampaignInput {
                periode: "T1 2026".into(),
                bulletins: vec![
                    ScpiBulletinInput {
                        nom_produit: "Comète".into(),
                        summary_markdown: "Collecte 132 M€".into(),
                        fichier_source: None,
                    },
                    ScpiBulletinInput {
                        nom_produit: "Primovie".into(),
                        summary_markdown: "TD stable".into(),
                        fichier_source: None,
                    },
                ],
            })
            .unwrap();

        assert_eq!(result.contacts_matched, 1);
        assert_eq!(result.contacts_queued, 1);

        let vars: String = db
            .conn
            .query_row(
                "SELECT campaign_variables FROM contact_template_envois WHERE contact_id = ?1",
                params![cid],
                |row| row.get(0),
            )
            .unwrap();
        assert!(vars.contains("Comète"));
        assert!(vars.contains("Primovie"));
        assert!(vars.contains("Collecte 132 M€"));
        assert!(vars.contains("scpi_intro_tu"));
        assert!(vars.contains("tes SCPI"));

        let count: i64 = db
            .conn
            .query_row(
                "SELECT COUNT(*) FROM contact_template_envois WHERE contact_id = ?1",
                params![cid],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(count, 1);
    }

    #[test]
    fn prepare_campaign_stores_digest_version_and_dashboard_snapshot() {
        use crate::database::models::{NewContact, NewInvestissement};

        let db = mem_db();
        let cid = db
            .create_contact(NewContact {
                email: Some("client@example.com".into()),
                categorie: "CLIENT".into(),
                nom: "DUPONT".into(),
                prenom: "Jean".into(),
                statut_suivi: Some("ACTIF".into()),
                ..Default::default()
            })
            .unwrap()
            .id
            .unwrap();

        db.create_investissement(NewInvestissement {
            contact_id: Some(cid),
            foyer_id: None,
            type_produit: "SCPI".into(),
            partenaire_id: None,
            nom_produit: "Comète".into(),
            numero_contrat: None,
            montant_initial: None,
            date_souscription: None,
            date_fin_demembrement: None,
            date_fin_pret: None,
            mensualite_credit: None,
            credit_crd: None,
            loyer_mensuel: None,
            prevoyance_perso: None,
            prevoyance_pro: None,
            prevoyance_versement_mensuel: None,
            versement_programme: None,
            montant_versement_programme: None,
            frequence_versement: None,
            reinvestissement_dividendes: None,
            notes: None,
            origine: None,
        })
        .unwrap();

        db.prepare_scpi_bulletin_campaign(PrepareScpiCampaignInput {
            periode: "T1 2026".into(),
            bulletins: vec![ScpiBulletinInput {
                nom_produit: "Comète".into(),
                summary_markdown: "1. SCPI Comète – T1 2026\n\n2. Chiffres clés\n- Collecte".into(),
                fichier_source: None,
            }],
        })
        .unwrap();

        let vars: String = db
            .conn
            .query_row(
                "SELECT campaign_variables FROM contact_template_envois WHERE contact_id = ?1",
                params![cid],
                |row| row.get(0),
            )
            .unwrap();
        assert!(vars.contains(&format!("\"digest_version\":{}", SCPI_CAMPAIGN_DIGEST_VERSION)));
        assert!(vars.contains("\"prepared_at\":"));

        let dash = db.get_scpi_campaign_dashboard().unwrap();
        assert!(dash.last_prepare.is_some());
        assert_eq!(dash.last_prepare.as_ref().unwrap().periode, "T1 2026");
        assert_eq!(dash.ready_count, 1);
        assert_eq!(dash.sent_since_prepare, 0);
    }

    #[test]
    fn dashboard_sent_count_follows_batch_not_journal() {
        use crate::database::models::{NewContact, NewInvestissement};

        let db = mem_db();
        let cid = db
            .create_contact(NewContact {
                email: Some("client@example.com".into()),
                categorie: "CLIENT".into(),
                nom: "DUPONT".into(),
                prenom: "Jean".into(),
                statut_suivi: Some("ACTIF".into()),
                ..Default::default()
            })
            .unwrap()
            .id
            .unwrap();

        db.create_investissement(NewInvestissement {
            contact_id: Some(cid),
            foyer_id: None,
            type_produit: "SCPI".into(),
            partenaire_id: None,
            nom_produit: "Comète".into(),
            numero_contrat: None,
            montant_initial: None,
            date_souscription: None,
            date_fin_demembrement: None,
            date_fin_pret: None,
            mensualite_credit: None,
            credit_crd: None,
            loyer_mensuel: None,
            prevoyance_perso: None,
            prevoyance_pro: None,
            prevoyance_versement_mensuel: None,
            versement_programme: None,
            montant_versement_programme: None,
            frequence_versement: None,
            reinvestissement_dividendes: None,
            notes: None,
            origine: None,
        })
        .unwrap();

        db.prepare_scpi_bulletin_campaign(PrepareScpiCampaignInput {
            periode: "T1 2026".into(),
            bulletins: vec![ScpiBulletinInput {
                nom_produit: "Comète".into(),
                summary_markdown: "1. Comète – T1 2026\n\n2. Chiffres clés".into(),
                fichier_source: None,
            }],
        })
        .unwrap();

        let _ = db
            .insert_email_send_log(
                cid,
                None,
                None,
                None,
                Some(SCPI_BULLETIN_TEMPLATE_NOM),
                Some("Sujet journal orphelin"),
                "success",
                None,
                None,
                None,
                "individual",
            )
            .unwrap();

        let dash = db.get_scpi_campaign_dashboard().unwrap();
        assert_eq!(dash.sent_since_prepare, 0);

        let row_id = db.get_etiquette_email_queue("ready").unwrap()[0].contact_etiquette_id;
        db.mark_template_email_sent(row_id, None, None, Some("Sujet"), None, None, None)
            .unwrap();

        let dash = db.get_scpi_campaign_dashboard().unwrap();
        assert_eq!(dash.sent_since_prepare, 1);
        assert_eq!(dash.ready_count, 0);
    }
}
