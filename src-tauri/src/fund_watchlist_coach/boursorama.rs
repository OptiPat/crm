use reqwest::blocking::Client;
use reqwest::header::{HeaderValue, USER_AGENT};

const BOURSORAMA_BASE: &str = "https://www.boursorama.com";
const BOURSORAMA_UA: &str =
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

#[derive(Debug, Clone, PartialEq)]
pub struct BoursoramaHoldingLine {
    pub label: String,
    pub weight_percent: Option<f64>,
}

#[derive(Debug, Clone, PartialEq)]
pub struct BoursoramaBreakdownSlice {
    pub label: String,
    pub weight_percent: f64,
}

#[derive(Debug, Clone, PartialEq)]
pub struct BoursoramaStyleBox {
    pub cap: String,
    pub style: String,
    pub label_fr: String,
}

#[derive(Debug, Clone, Default, PartialEq)]
pub struct BoursoramaExposition {
    pub geo: Vec<BoursoramaBreakdownSlice>,
    pub sectors: Vec<BoursoramaBreakdownSlice>,
    pub asset_breakdown: Vec<BoursoramaBreakdownSlice>,
    pub style_box: Option<BoursoramaStyleBox>,
}

#[derive(Debug, Clone)]
pub struct BoursoramaCompositionData {
    pub holdings: Vec<BoursoramaHoldingLine>,
    pub exposition: BoursoramaExposition,
}

pub fn boursorama_client() -> Result<Client, String> {
    Client::builder()
        .timeout(std::time::Duration::from_secs(20))
        .build()
        .map_err(|e| format!("Client HTTP Boursorama : {e}"))
}

pub fn fetch_html(client: &Client, url: &str) -> Result<String, String> {
    let response = client
        .get(url)
        .header(USER_AGENT, HeaderValue::from_static(BOURSORAMA_UA))
        .send()
        .map_err(|e| format!("Requête Boursorama : {e}"))?;
    let status = response.status();
    let body = response
        .text()
        .map_err(|e| format!("Lecture Boursorama : {e}"))?;
    if !status.is_success() {
        return Err(format!("Boursorama HTTP {} pour {url}", status.as_u16()));
    }
    Ok(body)
}

/// Résout le symbole interne Boursorama (ex. MP-829413) à partir de l'ISIN.
pub fn resolve_opcvm_symbol(client: &Client, isin: &str) -> Result<Option<String>, String> {
    let isin = isin.trim().to_uppercase();
    if isin.is_empty() {
        return Ok(None);
    }
    let url = format!("{BOURSORAMA_BASE}/recherche/_instruments/{isin}");
    let html = fetch_html(client, &url)?;
    parse_opcvm_symbol_from_search_html(&html, &isin)
}

pub fn composition_url(symbol: &str) -> String {
    format!("{BOURSORAMA_BASE}/bourse/opcvm/cours/composition/{symbol}/")
}

pub fn cours_url(symbol: &str) -> String {
    format!("{BOURSORAMA_BASE}/bourse/opcvm/cours/{symbol}/")
}

pub fn performances_risques_url(symbol: &str) -> String {
    format!("{BOURSORAMA_BASE}/bourse/opcvm/cours/performances-risques/{symbol}/")
}

#[derive(Debug, Clone, PartialEq, serde::Serialize, serde::Deserialize)]
pub struct BoursoramaCategoryYear {
    pub year: String,
    pub fund: Option<f64>,
    pub category: Option<f64>,
    /// Rang Morningstar dans la catégorie : 1 = meilleur, 100 = pire.
    pub rank: Option<f64>,
}

#[derive(Debug, Clone, Default, PartialEq, serde::Serialize, serde::Deserialize)]
pub struct BoursoramaCategoryHistory {
    pub years: Vec<BoursoramaCategoryYear>,
}

/// Années minimales pour qu'un rang moyen traduise une régularité plutôt qu'un millésime.
const CATEGORY_RANK_MIN_YEARS: usize = 3;

impl BoursoramaCategoryHistory {
    /// Moyenne simple des rangs disponibles : c'est la régularité du gérant qu'on cherche à
    /// mesurer, pas sa dernière année.
    pub fn rank_avg(&self) -> Option<f64> {
        let ranks: Vec<f64> = self
            .years
            .iter()
            .filter_map(|y| y.rank)
            .filter(|r| r.is_finite())
            .collect();
        if ranks.len() < CATEGORY_RANK_MIN_YEARS {
            return None;
        }
        Some(ranks.iter().sum::<f64>() / ranks.len() as f64)
    }

    /// Écart annuel moyen face à la catégorie (alpha), sur les années où les deux sont connues.
    pub fn alpha_avg(&self) -> Option<f64> {
        let deltas: Vec<f64> = self
            .years
            .iter()
            .filter_map(|y| Some(y.fund? - y.category?))
            .filter(|d| d.is_finite())
            .collect();
        if deltas.is_empty() {
            return None;
        }
        Some(deltas.iter().sum::<f64>() / deltas.len() as f64)
    }
}

pub fn fetch_category_history(
    client: &Client,
    symbol: &str,
) -> Result<Option<BoursoramaCategoryHistory>, String> {
    let html = fetch_html(client, &performances_risques_url(symbol))?;
    Ok(parse_category_history_html(&html))
}

/// Tableau « performances annuelles des 5 dernières années » : lignes Fonds / Catégorie / Rang.
/// Les blocs volatilité et mesure de risque de la même page sont vides hors session BoursoBank,
/// d'où le repli sur la pire année civile pour juger le risque.
pub fn parse_category_history_html(html: &str) -> Option<BoursoramaCategoryHistory> {
    let table = find_annual_history_table(html)?;
    let years = parse_annual_history_years(&table)?;
    let fund = parse_annual_history_row(&table, "Fonds");
    let category = parse_annual_history_row(&table, "Catégorie");
    let rank = parse_annual_history_row(&table, "Rang");
    if fund.is_none() && category.is_none() && rank.is_none() {
        return None;
    }
    let cell = |row: &Option<Vec<Option<f64>>>, idx: usize| -> Option<f64> {
        row.as_ref().and_then(|values| values.get(idx).copied().flatten())
    };
    Some(BoursoramaCategoryHistory {
        years: years
            .into_iter()
            .enumerate()
            .map(|(idx, year)| BoursoramaCategoryYear {
                year,
                fund: cell(&fund, idx),
                category: cell(&category, idx),
                rank: cell(&rank, idx),
            })
            .collect(),
    })
}

fn find_annual_history_table(html: &str) -> Option<String> {
    let anchor = html
        .find("<div id=\"historical\"")
        .or_else(|| html.find("id=\"historical\""))?;
    let rest = &html[anchor..];
    let table_start = rest.find("<table")?;
    let table_end = rest[table_start..].find("</table>")? + table_start + "</table>".len();
    Some(rest[table_start..table_end].to_string())
}

fn parse_annual_history_years(table_fragment: &str) -> Option<Vec<String>> {
    let thead_end = table_fragment.find("</thead>")?;
    let years: Vec<String> = table_fragment[..thead_end]
        .split("<th")
        .skip(1)
        .map(cell_text)
        .filter(|text| text.len() == 4 && text.chars().all(|c| c.is_ascii_digit()))
        .collect();
    if years.is_empty() {
        None
    } else {
        Some(years)
    }
}

fn parse_annual_history_row(table_fragment: &str, label: &str) -> Option<Vec<Option<f64>>> {
    let tbody_start = table_fragment.find("<tbody")?;
    for row in table_fragment[tbody_start..].split("<tr").skip(1) {
        let row = &row[..row.find("</tr>").unwrap_or(row.len())];
        let Some(header) = row.split("<th").nth(1).map(cell_text) else {
            continue;
        };
        if header != label {
            continue;
        }
        return Some(
            row.split("<td")
                .skip(1)
                .map(|cell| parse_french_percent(&cell_text(cell)))
                .collect(),
        );
    }
    None
}

/// Contenu d'une cellule, borné à sa propre balise de fermeture : sans cette borne, le texte de
/// l'en-tête de ligne débordait sur les cellules de valeurs qui la suivent.
fn cell_text(fragment: &str) -> String {
    let end = ["</th>", "</td>"]
        .iter()
        .filter_map(|tag| fragment.find(tag))
        .min()
        .unwrap_or(fragment.len());
    strip_tags_text(&fragment[..end])
}

/// Contenu textuel d'un fragment, balises internes retirées : les en-têtes d'année sont dans un
/// `<h3>` imbriqué, que `extract_tag_text` ne sait pas traverser.
fn strip_tags_text(fragment: &str) -> String {
    let start = fragment.find('>').map(|i| i + 1).unwrap_or(0);
    let mut text = String::new();
    let mut depth = 0usize;
    for ch in fragment[start..].chars() {
        match ch {
            '<' => depth += 1,
            '>' => depth = depth.saturating_sub(1),
            _ if depth == 0 => text.push(ch),
            _ => {}
        }
    }
    decode_html_entities(text.trim())
}

#[derive(Debug, Clone, PartialEq, serde::Serialize, serde::Deserialize)]
pub struct BoursoramaPerformancesSnapshot {
    pub perf_ytd: Option<f64>,
    pub perf_1mois: Option<f64>,
    pub perf_1an: Option<f64>,
    pub perf_3ans: Option<f64>,
    pub perf_5ans: Option<f64>,
}

#[derive(Debug, Clone, PartialEq, serde::Serialize, serde::Deserialize)]
pub struct BoursoramaCoursPerformances {
    pub fund: BoursoramaPerformancesSnapshot,
    /// Ligne « CATEGORIE » Boursorama (moyenne Morningstar de la catégorie).
    pub category: BoursoramaPerformancesSnapshot,
    pub source: String,
}

pub fn fetch_cours_performances(
    client: &Client,
    symbol: &str,
) -> Result<Option<BoursoramaCoursPerformances>, String> {
    let html = fetch_html(client, &cours_url(symbol))?;
    Ok(parse_cours_performances_html(&html))
}

pub fn parse_cours_performances_html(html: &str) -> Option<BoursoramaCoursPerformances> {
    let table = find_glissantes_performance_table(html)?;
    let fund = parse_performance_row_in_table(&table, "FONDS")?;
    let category = parse_performance_row_in_table(&table, "CATEGORIE")?;
    Some(BoursoramaCoursPerformances {
        fund,
        category,
        source: "boursorama_cours".to_string(),
    })
}

fn find_glissantes_performance_table(html: &str) -> Option<String> {
    let marker = "c-fund-performances__table";
    let mut search_from = 0;
    while let Some(rel) = html[search_from..].find(marker) {
        let table_start = search_from + rel;
        let table_end = html[table_start..]
            .find("</table>")
            .map(|idx| table_start + idx + "</table>".len())
            .unwrap_or_else(|| html.len().min(table_start + 8000));
        let table_fragment = html[table_start..table_end].to_string();
        if let Some(headers) = parse_performance_table_headers(&table_fragment) {
            if headers.iter().any(|h| h.contains("1 MOIS"))
                && headers.iter().any(|h| h.contains("3 ANS"))
            {
                return Some(table_fragment);
            }
        }
        search_from = table_start + marker.len();
    }
    None
}

fn parse_performance_row_in_table(
    table_fragment: &str,
    row_label: &str,
) -> Option<BoursoramaPerformancesSnapshot> {
    let needle = format!(">{row_label}<");
    let row_start = table_fragment.find(&needle)?;
    let row_fragment = &table_fragment[row_start..];
    let headers = parse_performance_table_headers(table_fragment)?;
    let values = parse_performance_row_cells(row_fragment)?;
    Some(BoursoramaPerformancesSnapshot {
        perf_ytd: value_at_header(&headers, &values, &["1ER JANV", "1ER JANV."]),
        perf_1mois: value_at_header(&headers, &values, &["1 MOIS"]),
        perf_1an: value_at_header(&headers, &values, &["1 AN"]),
        perf_3ans: value_at_header(&headers, &values, &["3 ANS"]),
        perf_5ans: value_at_header(&headers, &values, &["5 ANS"]),
    })
}

fn parse_performance_table_headers(table_fragment: &str) -> Option<Vec<String>> {
    let thead_end = table_fragment.find("</thead>")?;
    let thead = &table_fragment[..thead_end];
    let mut headers = Vec::new();
    for th in thead.split("<th").skip(1) {
        let inner = extract_tag_text(th)?;
        let normalized = normalize_performance_header(&inner);
        if !normalized.is_empty() {
            headers.push(normalized);
        }
    }
    if headers.len() < 4 {
        return None;
    }
    Some(headers)
}

fn normalize_performance_header(raw: &str) -> String {
    decode_html_entities(raw)
        .to_uppercase()
        .replace(['.', '\n', '\r'], "")
        .trim()
        .to_string()
}

fn parse_performance_row_cells(row_fragment: &str) -> Option<Vec<Option<f64>>> {
    let row_end = row_fragment.find("</tr>").unwrap_or(row_fragment.len());
    let row = &row_fragment[..row_end];
    let mut values = Vec::new();
    for td in row.split("<td").skip(1) {
        let text = extract_tag_text(td)?;
        values.push(parse_french_percent(&text));
    }
    if values.is_empty() {
        return None;
    }
    Some(values)
}

fn value_at_header(
    headers: &[String],
    values: &[Option<f64>],
    aliases: &[&str],
) -> Option<f64> {
    let idx = headers.iter().position(|header| aliases.iter().any(|alias| header == alias))?;
    values.get(idx).and_then(|v| *v)
}

fn extract_tag_text(fragment: &str) -> Option<String> {
    let gt = fragment.find('>')? + 1;
    let lt = fragment[gt..].find('<')? + gt;
    Some(decode_html_entities(fragment[gt..lt].trim()))
}

/// Boursorama écrit ses nombres à la française : signe « moins » typographique (U+2212), espace
/// insécable devant le `%` et pour les milliers. `parse::<f64>` refuse tout cela, et une valeur
/// refusée se lit comme une donnée absente — une perte annuelle disparaissait silencieusement.
fn parse_french_percent(raw: &str) -> Option<f64> {
    let cleaned: String = raw
        .chars()
        .filter_map(|c| match c {
            // Le tiret cadratin sert aussi de « pas de valeur » : réduit à « - », il ressort None.
            '−' | '–' | '—' | '‐' | '‑' => Some('-'),
            ',' => Some('.'),
            '%' => None,
            c if c.is_whitespace() => None,
            c => Some(c),
        })
        .collect();
    if cleaned.is_empty() || cleaned == "-" {
        return None;
    }
    cleaned.parse::<f64>().ok()
}

pub fn fetch_top_holdings(
    client: &Client,
    symbol: &str,
) -> Result<Vec<BoursoramaHoldingLine>, String> {
    Ok(fetch_composition_data(client, symbol)?.holdings)
}

pub fn fetch_composition_data(
    client: &Client,
    symbol: &str,
) -> Result<BoursoramaCompositionData, String> {
    let html = fetch_html(client, &composition_url(symbol))?;
    Ok(parse_composition_html(&html))
}

pub fn parse_composition_html(html: &str) -> BoursoramaCompositionData {
    BoursoramaCompositionData {
        holdings: parse_top_holdings_from_composition_html(html),
        exposition: parse_exposition_from_composition_html(html),
    }
}

pub fn parse_opcvm_symbol_from_search_html(html: &str, isin: &str) -> Result<Option<String>, String> {
    let isin_upper = isin.to_uppercase();
    let mut isin_matches = Vec::new();
    let mut data_row_symbols = Vec::new();

    for row_html in html.split("<tr").skip(1) {
        // Ignorer les lignes d'en-tête (pas de résultat OPCVM exploitable).
        if row_html.contains("<th") {
            continue;
        }
        if !row_html.contains("/bourse/opcvm/cours/") {
            continue;
        }
        let Some(symbol) = extract_opcvm_symbol_from_href(row_html) else {
            continue;
        };
        data_row_symbols.push(symbol.clone());
        if row_html.to_uppercase().contains(&isin_upper) {
            isin_matches.push(symbol);
        }
    }

    if let Some(symbol) = isin_matches.into_iter().next() {
        return Ok(Some(symbol));
    }

    // Recherche par ISIN : Boursorama renvoie souvent une seule ligne OPCVM sans
    // afficher l'ISIN dans le `<tr>` (il est seulement dans l'URL de recherche).
    let mut unique = Vec::new();
    for symbol in data_row_symbols {
        if !unique.iter().any(|existing| existing == &symbol) {
            unique.push(symbol);
        }
    }
    if unique.len() == 1 {
        return Ok(Some(unique.remove(0)));
    }

    Ok(None)
}

fn extract_opcvm_symbol_from_href(html: &str) -> Option<String> {
    for fragment in html.split("/bourse/opcvm/cours/").skip(1) {
        let symbol = fragment.split(['/', '"', '?', '\'']).next()?.trim();
        if symbol.is_empty() {
            continue;
        }
        return Some(symbol.to_string());
    }
    None
}

pub fn fetch_composition_for_isin(
    client: &Client,
    isin: &str,
) -> Result<Option<BoursoramaCompositionData>, String> {
    let Some(symbol) = resolve_opcvm_symbol(client, isin)? else {
        return Ok(None);
    };
    fetch_composition_data(client, &symbol).map(Some)
}

/// Somme des poids des 10 premières lignes de composition (en % du portefeuille).
pub fn top10_concentration_percent(holdings: &[BoursoramaHoldingLine]) -> Option<f64> {
    let sum: f64 = holdings.iter().filter_map(|line| line.weight_percent).sum();
    if sum > 0.0 && sum <= 100.0 {
        Some((sum * 100.0).round() / 100.0)
    } else {
        None
    }
}

pub fn parse_top_holdings_from_composition_html(html: &str) -> Vec<BoursoramaHoldingLine> {
    let marker = "Composition (les 10 premi";
    let Some(start) = html.find(marker) else {
        return Vec::new();
    };
    let section = &html[start..];
    let mut lines = Vec::new();
    let mut search_from = 0;
    while lines.len() < 10 {
        let Some(header_idx) = section[search_from..]
            .find("c-table-gauge__cell--header")
        else {
            break;
        };
        let offset = search_from + header_idx;
        let after_header = &section[offset..];
        let Some(gt) = after_header.find('>') else { break };
        let after_gt = &after_header[gt + 1..];
        let Some(lt) = after_gt.find('<') else { break };
        let label = decode_html_entities(after_gt[..lt].trim());
        if label.is_empty() {
            search_from = offset + 1;
            continue;
        }
        let weight = extract_gauge_weight(after_header);
        lines.push(BoursoramaHoldingLine {
            label,
            weight_percent: weight,
        });
        search_from = offset + 1;
    }
    lines
}

fn extract_gauge_weight(fragment: &str) -> Option<f64> {
    let marker = "data-gauge-current-step=\"";
    let start = fragment.find(marker)? + marker.len();
    let end = fragment[start..].find('"')? + start;
    fragment[start..end].trim().parse::<f64>().ok()
}

fn decode_html_entities(text: &str) -> String {
    text.replace("&#039;", "'")
        // Espace insécable : laissée telle quelle, elle faisait échouer la lecture des nombres.
        .replace("&nbsp;", " ")
        .replace("&#160;", " ")
        .replace("&amp;", "&")
        .replace("&quot;", "\"")
        .replace("&lt;", "<")
        .replace("&gt;", ">")
}

pub fn parse_exposition_from_composition_html(html: &str) -> BoursoramaExposition {
    BoursoramaExposition {
        geo: parse_pie_chart_slices(html, "regional"),
        sectors: parse_pie_chart_slices(html, "sector"),
        asset_breakdown: parse_pie_chart_slices(html, "portfolio"),
        style_box: parse_morningstar_style_box(html),
    }
}

fn parse_pie_chart_slices(html: &str, chart_id: &str) -> Vec<BoursoramaBreakdownSlice> {
    let id_needle = format!(r#""id":"{chart_id}""#);
    let Some(id_pos) = html.find(&id_needle) else {
        return Vec::new();
    };
    let window = &html[id_pos..(id_pos + 2500).min(html.len())];
    let marker = r#""amChartData":["#;
    let Some(data_pos) = window.find(marker) else {
        return Vec::new();
    };
    let array_start = data_pos + marker.len() - 1;
    parse_name_value_array(&window[array_start..])
}

fn parse_name_value_array(fragment: &str) -> Vec<BoursoramaBreakdownSlice> {
    let Some(end) = find_matching_bracket(fragment, '[', ']') else {
        return Vec::new();
    };
    let body = &fragment[1..end];
    let mut slices = Vec::new();
    let mut search = 0;
    while let Some(obj_start) = body[search..].find('{') {
        let off = search + obj_start;
        let Some(obj_end) = find_matching_bracket(&body[off..], '{', '}') else {
            break;
        };
        let obj = &body[off..=off + obj_end];
        if let Some((label, weight_percent)) = parse_name_value_object(obj) {
            slices.push(BoursoramaBreakdownSlice {
                label,
                weight_percent,
            });
        }
        search = off + obj_end + 1;
    }
    slices
}

fn parse_name_value_object(obj: &str) -> Option<(String, f64)> {
    #[derive(serde::Deserialize)]
    struct ChartItem {
        name: String,
        value: f64,
    }
    let item: ChartItem = serde_json::from_str(obj).ok()?;
    let weight = ((item.value * 100.0).round()) / 100.0;
    Some((item.name, weight))
}

fn find_matching_bracket(text: &str, open: char, close: char) -> Option<usize> {
    let first = text.find(open)?;
    let mut depth = 0;
    for (idx, ch) in text[first..].char_indices() {
        if ch == open {
            depth += 1;
        } else if ch == close {
            depth -= 1;
            if depth == 0 {
                return Some(first + idx);
            }
        }
    }
    None
}

pub fn parse_morningstar_style_box(html: &str) -> Option<BoursoramaStyleBox> {
    let marker = r#"<table class="c-morningstar-box""#;
    let start = html.find(marker).or_else(|| html.find("c-morningstar-box\">"))?;
    let section = &html[start..(start + 4000).min(html.len())];
    for row in section.split("<tr").skip(1) {
        if !row.contains("c-morningstar-box__cell--full") {
            continue;
        }
        let cap_key = if row.contains("Grandes") {
            "large_cap"
        } else if row.contains("Moyennes") {
            "mid_cap"
        } else if row.contains("Petites") {
            "small_cap"
        } else {
            continue;
        };
        let mut style_col = None;
        let mut col = 0;
        for part in row.split("<td") {
            if part.contains("c-morningstar-box__cell")
                && !part.contains("c-morningstar-box__text")
            {
                if part.contains("--full") {
                    style_col = Some(col);
                }
                col += 1;
            }
        }
        let style_col = style_col?;
        let style_key = match style_col {
            0 => "value",
            1 => "blend",
            _ => "growth",
        };
        return Some(BoursoramaStyleBox {
            cap: cap_key.to_string(),
            style: style_key.to_string(),
            label_fr: style_box_label_fr(cap_key, style_key),
        });
    }
    None
}

fn style_box_label_fr(cap: &str, style: &str) -> String {
    let cap_label = match cap {
        "large_cap" => "Grandes cap.",
        "mid_cap" => "Moyennes cap.",
        _ => "Petites cap.",
    };
    let style_label = match style {
        "value" => "Valeur",
        "blend" => "Mixte",
        _ => "Croissance",
    };
    format!("{cap_label} / {style_label}")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parse_search_html_extracts_opcvm_symbol() {
        let html = r#"
        <table data-result-search>
          <tbody class="c-table__body">
            <tr class="c-table__row">
              <td><a class="c-link" href="/bourse/opcvm/cours/MP-829413/">Carmignac Patrimoine</a></td>
              <td>FR0010135103</td>
              <td>OPCVM</td>
            </tr>
          </tbody>
        </table>
        "#;
        assert_eq!(
            parse_opcvm_symbol_from_search_html(html, "FR0010135103").unwrap(),
            Some("MP-829413".into())
        );
    }

    #[test]
    fn parse_search_html_single_opcvm_without_isin_in_row() {
        let html = r#"
        <tr class="c-table__row">
          <td><a href="/bourse/opcvm/cours/MP-191553/">Carmignac Pf Asia Discovery A EUR Acc</a></td>
          <td>OPCVM</td>
        </tr>
        "#;
        assert_eq!(
            parse_opcvm_symbol_from_search_html(html, "LU0336083810").unwrap(),
            Some("MP-191553".into())
        );
    }

    #[test]
    fn parse_search_html_multiple_opcvm_without_isin_returns_none() {
        let html = r#"
        <tr><td><a href="/bourse/opcvm/cours/MP-WRONG/">Autre fonds</a></td><td>OPCVM</td></tr>
        <tr><td><a href="/bourse/opcvm/cours/MP-OTHER/">Encore un</a></td><td>OPCVM</td></tr>
        "#;
        assert_eq!(
            parse_opcvm_symbol_from_search_html(html, "LU0336083810").unwrap(),
            None
        );
    }

    #[test]
    fn parse_search_html_ignores_opcvm_without_isin() {
        let html = r#"
        <tr><td><a href="/bourse/opcvm/cours/MP-WRONG/">Autre fonds</a></td><td>OPCVM</td></tr>
        <tr><td><a href="/bourse/opcvm/cours/MP-RIGHT/">Bon fonds</a></td><td>LU0336083810</td></tr>
        "#;
        assert_eq!(
            parse_opcvm_symbol_from_search_html(html, "LU0336083810").unwrap(),
            Some("MP-RIGHT".into())
        );
    }

    #[test]
    fn parse_composition_html_extracts_holdings() {
        let html = r#"
        Composition (les 10 premières lignes)
        <td class="c-table-gauge__cell c-table-gauge__cell--header">Taiwan Semiconductor Manufacturing Co Ltd</td>
        <div data-gauge-current-step="5.85"></div>
        <td class="c-table-gauge__cell c-table-gauge__cell--header">NVIDIA Corp</td>
        <div data-gauge-current-step="3.35"></div>
        "#;
        let lines = parse_top_holdings_from_composition_html(html);
        assert_eq!(lines.len(), 2);
        assert!(lines[0].label.contains("Taiwan"));
        assert_eq!(lines[0].weight_percent, Some(5.85));
        assert_eq!(lines[1].weight_percent, Some(3.35));
    }

    #[test]
    fn top10_concentration_sums_holdings_weights() {
        let holdings = vec![
            BoursoramaHoldingLine {
                label: "A".into(),
                weight_percent: Some(9.5),
            },
            BoursoramaHoldingLine {
                label: "B".into(),
                weight_percent: Some(7.2),
            },
        ];
        assert_eq!(top10_concentration_percent(&holdings), Some(16.7));
    }

    #[test]
    fn parse_exposition_extracts_geo_and_sectors_from_chart_json() {
        let html = r#"
        JSON.parse('{"data":{"amChartConfig":{"brs":{"id":"regional"}},"amChartData":[{"name":"Etats-Unis","value":72.25},{"name":"Allemagne","value":6.37}]}}');
        JSON.parse('{"data":{"amChartConfig":{"brs":{"id":"sector"}},"amChartData":[{"name":"Technologie","value":83.66},{"name":"Sant\u00e9","value":4.83}]}}');
        "#;
        let expo = parse_exposition_from_composition_html(html);
        assert_eq!(expo.geo.len(), 2);
        assert_eq!(expo.geo[0].label, "Etats-Unis");
        assert_eq!(expo.geo[0].weight_percent, 72.25);
        assert_eq!(expo.sectors.len(), 2);
        assert_eq!(expo.sectors[0].label, "Technologie");
        assert_eq!(expo.sectors[1].label, "Santé");
    }

    #[test]
    fn parse_composition_fixture_extracts_full_exposition() {
        let html = include_str!("fixtures/boursorama_composition_minimal.html");
        let data = parse_composition_html(html);
        assert_eq!(top10_concentration_percent(&data.holdings), Some(16.7));
        assert_eq!(data.exposition.geo.len(), 2);
        assert_eq!(data.exposition.sectors.len(), 2);
        assert_eq!(data.exposition.asset_breakdown.len(), 2);
        let style = data.exposition.style_box.expect("style box");
        assert_eq!(style.cap, "large_cap");
        assert_eq!(style.style, "growth");
    }

    #[test]
    fn parse_morningstar_style_box_reads_filled_cell() {
        let html = r#"
        <table class="c-morningstar-box">
          <tr>
            <td class="c-morningstar-box__text--top">Valeur</td>
            <td class="c-morningstar-box__text--top">Mixte</td>
            <td class="c-morningstar-box__text--top">Croiss</td>
          </tr>
          <tr>
            <td class="c-morningstar-box__cell"></td>
            <td class="c-morningstar-box__cell"></td>
            <td class="c-morningstar-box__cell c-morningstar-box__cell--full"></td>
            <td class="c-morningstar-box__text--right">Grandes<br>Capitalisations</td>
          </tr>
        </table>
        "#;
        let style = parse_morningstar_style_box(html).expect("style box");
        assert_eq!(style.cap, "large_cap");
        assert_eq!(style.style, "growth");
        assert!(style.label_fr.contains("Grandes"));
    }

    #[test]
    fn parse_cours_performances_extracts_fund_and_category() {
        let html = include_str!("fixtures/boursorama_cours_performances_minimal.html");
        let parsed = parse_cours_performances_html(html).expect("performances");
        assert_eq!(parsed.fund.perf_1an, Some(75.84));
        assert_eq!(parsed.category.perf_1an, Some(2.73));
        assert_eq!(parsed.fund.perf_3ans, Some(122.56));
        assert_eq!(parsed.category.perf_5ans, Some(31.47));
    }

    fn category_history_fixture() -> BoursoramaCategoryHistory {
        parse_category_history_html(include_str!(
            "fixtures/boursorama_performances_risques_minimal.html"
        ))
        .expect("historique catégorie")
    }

    #[test]
    fn parse_category_history_extracts_years_fund_category_and_rank() {
        let history = category_history_fixture();
        assert_eq!(history.years.len(), 5);
        let first = &history.years[0];
        assert_eq!(first.year, "2021");
        assert_eq!(first.fund, Some(-0.88));
        assert_eq!(first.category, Some(9.41));
        assert_eq!(first.rank, Some(99.0));
        let last = &history.years[4];
        assert_eq!(last.year, "2025");
        assert_eq!(last.fund, Some(12.12));
        // Catégorie non encore publiée pour l'année en cours.
        assert_eq!(last.category, None);
        assert_eq!(last.rank, Some(7.0));
    }

    #[test]
    fn rank_avg_averages_available_years() {
        let avg = category_history_fixture().rank_avg().expect("rang moyen");
        assert!((avg - 57.4).abs() < 0.01, "rang moyen inattendu : {avg}");
    }

    #[test]
    fn rank_avg_needs_three_years_to_mean_regularity() {
        let history = BoursoramaCategoryHistory {
            years: vec![
                BoursoramaCategoryYear {
                    year: "2024".into(),
                    fund: Some(5.0),
                    category: Some(4.0),
                    rank: Some(20.0),
                },
                BoursoramaCategoryYear {
                    year: "2025".into(),
                    fund: Some(6.0),
                    category: Some(4.0),
                    rank: Some(10.0),
                },
            ],
        };
        assert_eq!(history.rank_avg(), None);
    }

    #[test]
    fn alpha_avg_ignores_years_without_category() {
        let alpha = category_history_fixture().alpha_avg().expect("alpha");
        // (-0,88-9,41) + (-9,38+12,94) + (2,20-8,34) + (7,06-8,53) sur 4 années publiées.
        assert!((alpha - (-3.585)).abs() < 0.01, "alpha inattendu : {alpha}");
    }

    #[test]
    fn parse_category_history_returns_none_without_the_block() {
        assert_eq!(parse_category_history_html("<html><body/></html>"), None);
    }

    /// Boursorama écrit « −12,4 % » avec le vrai signe moins et une espace insécable : refusés par
    /// `parse::<f64>`, ces nombres se lisaient comme des données absentes et privaient le
    /// comparateur de son pilier risque sans le signaler.
    #[test]
    fn parse_french_percent_reads_typographic_minus_and_hard_spaces() {
        assert_eq!(parse_french_percent("\u{2212}12,4 %"), Some(-12.4));
        assert_eq!(parse_french_percent("+8,10\u{00a0}%"), Some(8.1));
        assert_eq!(parse_french_percent("1\u{202f}234,5"), Some(1234.5));
        assert_eq!(
            parse_french_percent(&decode_html_entities("12,4&nbsp;%")),
            Some(12.4)
        );
        // Le tiret cadratin est le « pas de valeur » de Boursorama, pas un nombre.
        assert_eq!(parse_french_percent("—"), None);
        assert_eq!(parse_french_percent(""), None);
    }
}
