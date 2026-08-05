use crate::database::models::FundWatchlistEntry;
use crate::fund_watchlist_coach::boursorama::BoursoramaHoldingLine;
use crate::fund_watchlist_coach::holdings_kind::{self, HoldingLineKind};
use crate::fund_watchlist_coach::news::{format_headline_inline, format_news_date_prefix, NewsHeadline};
use crate::uc_comparator::category_table::volatility_class_for_category;
use serde::Deserialize;

const SPREAD_PENALTY: f64 = 0.4;
const NEGATIVE_PENALTY: f64 = 0.5;
const TOP_HOLDINGS_MANDATORY_ANALYSIS: usize = 5;

pub fn short_term_score(entry: &FundWatchlistEntry) -> Option<f64> {
    let values = [
        entry.perf_1semaine?,
        entry.perf_1mois?,
        entry.perf_3mois?,
        entry.perf_ytd?,
    ];
    if values.iter().any(|v| !v.is_finite()) {
        return None;
    }
    let mean = values.iter().sum::<f64>() / values.len() as f64;
    let min = values.iter().copied().fold(f64::INFINITY, f64::min);
    let max = values.iter().copied().fold(f64::NEG_INFINITY, f64::max);
    let spread = max - min;
    let negative_count = values.iter().filter(|v| **v < 0.0).count() as f64;
    Some(mean - SPREAD_PENALTY * spread - NEGATIVE_PENALTY * negative_count)
}

pub fn format_optional_percent(value: Option<f64>) -> String {
    match value {
        Some(v) if v.is_finite() => {
            let sign = if v > 0.0 { "+" } else { "" };
            format!("{sign}{v:.1} %")
        }
        _ => "—".into(),
    }
}

pub fn format_optional_score(value: Option<f64>) -> String {
    match value {
        Some(v) if v.is_finite() => {
            let sign = if v > 0.0 { "+" } else { "" };
            format!("{sign}{v:.1}")
        }
        _ => "—".into(),
    }
}

/// Volatilité : toujours positive, un signe « + » n'apporterait rien.
pub fn format_optional_volatility(value: Option<f64>) -> String {
    match value {
        Some(v) if v.is_finite() => format!("{v:.1} %"),
        _ => "—".into(),
    }
}

/// Diagnostic déterministe calculé côté frontend (source unique des règles, en TypeScript) et
/// transmis au coach pour qu'il décide avec la même information que le badge affiché.
#[derive(Debug, Clone, Deserialize)]
pub struct FundCoachDiagnostic {
    pub isin: String,
    pub status: String,
    #[serde(default)]
    pub delta_1an_vs_category: Option<f64>,
    #[serde(default)]
    pub delta_reference_label: Option<String>,
    #[serde(default)]
    pub trigger_reasons: Vec<String>,
    /// Motif retenu par le CRM quand il ne déclenche rien : sans lui, un statut « données
    /// insuffisantes » arriverait au modèle sans la raison de cette abstention.
    #[serde(default)]
    pub reasons: Vec<String>,
    /// Nuances que le badge affiche déjà au CGP (« correction 1 mois avec YTD encore solide »,
    /// « respiration court terme ») : sans elles le modèle ne voyait que le statut, et concluait
    /// plus durement que le badge posé juste à côté.
    #[serde(default)]
    pub context_reasons: Vec<String>,
}

/// Ordre d'analyse : les fonds les plus dégradés d'abord (ils sont aussi les premiers retenus
/// quand le nombre de favoris dépasse la limite envoyée au modèle). Un fonds non mesurable passe
/// en dernier : il n'a aucun signal à traiter en priorité, et le classer devant les fonds sains
/// leur faisait perdre leur place dans le rapport dès que les favoris dépassaient la limite.
pub fn diagnostic_severity_rank(status: &str) -> u8 {
    match status {
        "signal_arbitrage" => 0,
        "sous_surveillance" => 1,
        "conserver" => 2,
        _ => 3,
    }
}

fn diagnostic_status_label(status: &str) -> &'static str {
    match status {
        "signal_arbitrage" => "SIGNAL ARBITRAGE",
        "sous_surveillance" => "SOUS SURVEILLANCE",
        "conserver" => "CONSERVER",
        _ => "DONNÉES INSUFFISANTES",
    }
}

pub struct FundCoachContext {
    pub entry: FundWatchlistEntry,
    pub boursorama_url: Option<String>,
    pub holdings: Vec<BoursoramaHoldingLine>,
    pub macro_news: Vec<NewsHeadline>,
    pub fund_news: Vec<NewsHeadline>,
    pub holding_news: Vec<HoldingNewsBlock>,
    pub warnings: Vec<String>,
    pub diagnostic: Option<FundCoachDiagnostic>,
}

#[derive(Debug, Clone)]
pub struct HoldingNewsBlock {
    pub headlines: Vec<NewsHeadline>,
}

pub fn build_fund_context_block(ctx: &FundCoachContext) -> String {
    let now = chrono::Utc::now().timestamp();
    let entry = &ctx.entry;
    let mut block = String::new();
    block.push_str(&format!("### {} — {}\n", entry.isin, entry.nom));
    if let Some(cat) = entry.categorie.as_deref() {
        block.push_str(&format!("- Catégorie : {cat}\n"));
    }
    if let Some(sri) = entry.sri {
        block.push_str(&format!("- SRI : {sri}\n"));
    }
    if let Some(stars) = entry.notation_morningstar {
        block.push_str(&format!("- Morningstar : {stars}/5\n"));
    }
    block.push_str(&format!(
        "- Perfs : 1 sem {} | 1 mois {} | 3 mois {} | YTD {} | 1 an {} | 3 ans {} | 5 ans {}\n",
        format_optional_percent(entry.perf_1semaine),
        format_optional_percent(entry.perf_1mois),
        format_optional_percent(entry.perf_3mois),
        format_optional_percent(entry.perf_ytd),
        format_optional_percent(entry.perf_1an),
        format_optional_percent(entry.perf_3ans),
        format_optional_percent(entry.perf_5ans),
    ));
    block.push_str(&format!(
        "- Risque : Sharpe 3 ans {} | Volatilité 3 ans {} | Volatilité 1 an {}\n",
        format_optional_score(entry.sharpe_ratio),
        format_optional_volatility(entry.vol_3ans),
        format_optional_volatility(entry.vol_1an),
    ));
    block.push_str(&format!(
        "- Score court terme (4 horizons requis) : {}\n",
        format_optional_score(short_term_score(entry))
    ));
    match ctx.diagnostic.as_ref() {
        Some(diag) => {
            append_diagnostic_lines(&mut block, diag);
            // Un diagnostic « données insuffisantes » ne tranche rien : sans les heuristiques, le
            // modèle statuerait sur les seules performances brutes, sans aucun filet.
            if diagnostic_is_undecided(&diag.status) {
                append_decision_hints(&mut block, entry);
            }
        }
        // Sans diagnostic (catégorie exclue, libellé inconnu), les heuristiques servent de filet.
        None => append_decision_hints(&mut block, entry),
    }
    if let Some(url) = ctx.boursorama_url.as_deref() {
        block.push_str(&format!("- Fiche Boursorama : {url}\n"));
    }
    if ctx.macro_news.is_empty() {
        block.push_str("- Actualités macro / marché (ZoneBourse) : aucune trouvée\n");
    } else {
        block.push_str("- Actualités macro / marché (ZoneBourse) :\n");
        for item in &ctx.macro_news {
            block.push_str(&format!(
                "  - {}\n",
                format_headline_inline(item, now)
            ));
        }
    }
    if ctx.holdings.is_empty() {
        block.push_str("- Top 10 positions : non disponible (composition Boursorama introuvable)\n");
    } else {
        let top5_weight: f64 = ctx
            .holdings
            .iter()
            .take(TOP_HOLDINGS_MANDATORY_ANALYSIS)
            .filter_map(|line| line.weight_percent)
            .sum();
        block.push_str(&format!(
            "- Top 10 (Boursorama) — poids cumulé top 5 : {:.1} %\n",
            top5_weight
        ));
        block.push_str("- TOP 5 (format compact, analyse obligatoire) :\n");
        append_holdings_compact_lines(
            &mut block,
            &ctx.holdings,
            &ctx.holding_news,
            0,
            TOP_HOLDINGS_MANDATORY_ANALYSIS,
            now,
        );
        if ctx.holdings.len() > TOP_HOLDINGS_MANDATORY_ANALYSIS {
            block.push_str("- Positions 6 à 10 :\n");
            append_holdings_compact_lines(
                &mut block,
                &ctx.holdings,
                &ctx.holding_news,
                TOP_HOLDINGS_MANDATORY_ANALYSIS,
                ctx.holdings.len().min(10),
                now,
            );
        }
    }
    if ctx.fund_news.is_empty() {
        block.push_str("- Actualités fonds : aucune trouvée\n");
    } else {
        block.push_str("- Actualités fonds :\n");
        for item in &ctx.fund_news {
            block.push_str(&format!(
                "  - {}\n",
                format_headline_inline(item, now)
            ));
        }
    }
    if !ctx.warnings.is_empty() {
        block.push_str("- Avertissements collecte :\n");
        for warning in &ctx.warnings {
            block.push_str(&format!("  - {warning}\n"));
        }
    }
    block
}

/// Statuts sur lesquels le CRM ne se prononce pas : le coach doit alors le dire, pas trancher seul.
fn diagnostic_is_undecided(status: &str) -> bool {
    !matches!(
        status,
        "signal_arbitrage" | "sous_surveillance" | "conserver"
    )
}

fn append_decision_hints(block: &mut String, entry: &FundWatchlistEntry) {
    for hint in decision_hints(entry) {
        block.push_str(&format!("- Indice décision (heuristique CRM) : {hint}\n"));
    }
}

fn append_diagnostic_lines(block: &mut String, diag: &FundCoachDiagnostic) {
    block.push_str(&format!(
        "- Diagnostic déterministe CRM (fait autorité sur l'écart de performance) : {}\n",
        diagnostic_status_label(&diag.status)
    ));
    if let Some(delta) = diag.delta_1an_vs_category.filter(|d| d.is_finite()) {
        let reference = diag
            .delta_reference_label
            .as_deref()
            .unwrap_or("référence catégorie");
        let sign = if delta > 0.0 { "+" } else { "" };
        block.push_str(&format!(
            "- Écart 1 an vs {reference} : {sign}{delta:.1} pt\n"
        ));
    }
    if !diag.trigger_reasons.is_empty() {
        block.push_str(&format!(
            "- Déclencheurs du diagnostic : {}\n",
            diag.trigger_reasons.join(" · ")
        ));
    } else if !diag.reasons.is_empty() {
        block.push_str(&format!(
            "- Motif du diagnostic : {}\n",
            diag.reasons.join(" · ")
        ));
    }
    if !diag.context_reasons.is_empty() {
        block.push_str(&format!(
            "- Nuances relevées par le CRM : {}\n",
            diag.context_reasons.join(" · ")
        ));
    }
}

fn append_holdings_compact_lines(
    block: &mut String,
    holdings: &[BoursoramaHoldingLine],
    holding_news: &[HoldingNewsBlock],
    from: usize,
    to: usize,
    now: i64,
) {
    for (index, line) in holdings.iter().enumerate().skip(from).take(to.saturating_sub(from)) {
        let weight = match line.weight_percent {
            Some(w) => format!("{w:.1} %"),
            None => "—".into(),
        };
        block.push_str("  - ");
        block.push_str(&line.label);
        block.push_str(&format!(" ({weight})"));
        let kind = holdings_kind::classify_holding_label(&line.label);
        if kind != HoldingLineKind::Company {
            block.push_str(" | Actu : ");
            block.push_str(holdings_kind::holding_actu_placeholder(kind));
            block.push('\n');
            continue;
        }
        let news = holding_news.get(index).map(|b| b.headlines.as_slice()).unwrap_or(&[]);
        if news.is_empty() {
            block.push_str(" | Actu : Aucune actualité récente disponible.\n");
        } else {
            block.push_str(" | Actu : ");
            for (i, headline) in news.iter().enumerate() {
                if i > 0 {
                    block.push_str(" · ");
                }
                let date = format_news_date_prefix(headline.published_at, now);
                block.push_str(&date);
                block.push_str(headline.title.trim());
            }
            block.push('\n');
        }
    }
}

pub const COACH_SYSTEM_PROMPT: &str = r#"Tu es le Coach Patrimonial intégré au CRM Patrimoine (outil interne CGP).

Objectif : aider le CGP à décider CONSERVER / SOUS SURVEILLANCE / ARBITRAGE CONSEILLÉ sur sa watchlist favoris.

Pour CHAQUE fonds, respecte STRICTEMENT la structure suivante :

### [ISIN] — [Nom du fonds]

#### Pourquoi le fonds monte ou baisse ?
- Analyse temporelle : commence par la tendance récente (1 sem, 1 mois, 3 mois) puis confronte-la aux horizons plus longs (YTD, 1 an).
- Contexte macro / marché : une puce synthétique basée UNIQUEMENT sur la section « Actualités macro / marché (ZoneBourse) » fournie (liquidité, indices, régulation, flux sectoriels, chocs géographiques). Si aucune actu macro : « Pas d'actualité macro récente disponible. » Ne confonds pas ce contexte avec les résultats d'entreprise du top 5.
- Top 5 holdings : une puce par entreprise avec son poids (%) et l'impact de son actualité/performance récente sur le fonds. Pour chaque ligne du top 5, appuie-toi UNIQUEMENT sur les actualités fournies (avec date). Si la ligne indique « Aucune actualité récente disponible », écris-le explicitement sans inventer de catalyseur sectoriel.
- Positions 6 à 10 : cite-les uniquement si leur impact explique une part significative de la performance globale.
- Règle de pondération : analyse prioritairement les lignes à fort poids (ex. : 9 % a plus d'impact que 0,7 %).
- Interdiction de déduire une tendance sectorielle macro sans la rattacher explicitement aux lignes du portefeuille OU aux actualités macro fournies.
- Respecte la fraîcheur des actus : ne relie pas une baisse récente à une actualité datée de plus de 3 semaines sauf si explicitement pertinent.
- Chiffres dans les actus : ne cite aucun montant ni pourcentage s'il n'apparaît pas textuellement dans les titres d'actualité fournis ; sinon reste qualitatif ou indique « actualité récente sans chiffre exploitable ».
- Si un titre mélange plusieurs métriques (CA, résultat opérationnel, bénéfice net, cours), ne simplifie pas : reprends la formulation du titre ou reste vague — n'attribue jamais un chiffre à la mauvaise métrique.
- Devises étrangères : recopie l'unité exacte du titre (Md, Mds, million, billion) ; ne confonds jamais « milliards » et « millions », ni les abréviations anglaises (bn, B) avec le français.

#### Décision
- Statut : CONSERVER | SOUS SURVEILLANCE | ARBITRAGE CONSEILLÉ
- Règles d'attribution du statut :
  * CONSERVER : performance globale acceptable (YTD ou 1 an positifs, ou fonds défensif jouant son rôle) et absence de dégradation structurelle sur le top 5.
  * SOUS SURVEILLANCE : correction court terme, volatilité ponctuelle, ou incertitude sur quelques lignes — sans dégradation structurelle de la thèse de gestion.
  * ARBITRAGE CONSEILLÉ (exceptionnel) : uniquement en cas de faiblesse avérée et durable sur plusieurs horizons (1 mois ET 3 mois ET YTD dégradés, ou 1 an nettement négatif) COMBINÉE à une rupture fondamentale sur les principales lignes. Un score court terme négatif ne suffit JAMAIS à justifier un arbitrage.
- Interdiction : si la performance 1 an ou YTD reste solide malgré une baisse à 1 mois, le statut maximum est SOUS SURVEILLANCE (pas d'arbitrage de « sécurisation »).
- Diagnostic déterministe CRM : quand un fonds en fournit un, il fait autorité sur l'écart de performance face à sa catégorie. Tu ne peux pas conclure CONSERVER sur un fonds diagnostiqué SIGNAL ARBITRAGE, ni ARBITRAGE CONSEILLÉ sur un fonds diagnostiqué CONSERVER, sans exposer en une phrase ce qui, dans les positions ou les actualités fournies, justifie de t'en écarter.
- Diagnostic DONNÉES INSUFFISANTES : le CRM n'a trouvé aucune référence de catégorie fiable pour ce fonds. Tu peux conclure à partir de ses performances et de ses positions, mais tu dis alors en une phrase qu'aucune comparaison de catégorie n'était disponible, et tu n'affirmes jamais qu'il devance ou retarde sa catégorie.
- Nuances relevées par le CRM : quand elles sont fournies, elles reprennent ce que le badge affiche déjà au CGP (correction récente sur une année encore solide, respiration court terme, fonds au-dessus de sa référence). Prends-les en compte avant de durcir un statut — un rapport qui contredit le badge affiché juste à côté n'est pas exploitable.
- Référence de l'écart : si la référence de l'écart 1 an mentionne « watchlist », elle ne compare le fonds qu'aux autres fonds de la watchlist et non à son marché — le nombre de fonds retenus est indiqué, et plus il est faible plus tu dois rester prudent dans tes conclusions. Mesuré contre une catégorie Boursorama, c'est une véritable référence de marché.
- Risque : sers-toi du Sharpe et de la volatilité pour distinguer une performance obtenue calmement d'une performance heurtée. Un Sharpe négatif sur 3 ans renforce un diagnostic de dégradation, mais ne suffit jamais seul à justifier un arbitrage.
- Justification CGP : 1 phrase synthétique appuyée sur les positions et la cohérence des horizons de performance.
- Argumentaire client : 2 à 3 phrases, ton professionnel et mesuré, sans promesse de rendement, explicatif et rassurant.

---

### SYNTHÈSE GLOBALE
- Fonds solides (moteur de performance / stabilité)
- Fonds sous surveillance (corrections temporaires / à suivre)
- Reprends la consigne générale sur le score court terme : jamais un nombre nu.
- Arbitrages suggérés (exclusivement les fonds structurellement dégradés)
- Propositions de rotation : uniquement si un arbitrage est formellement validé et qu'une alternative pertinente existe dans la watchlist

Règles de rédaction et contraintes :
- Français soigné et orthographe irréprochable (gestion des apostrophes : l'Asie, d'or, n'a pas).
- Formats Markdown acceptés : titres (##, ###, ####), listes à puces (-). N'utilise JAMAIS de texte en gras (**).
- Exclusions strictes : ne parle ni de réglementation SFDR, ni de frais. Ne propose aucun achat hors de la watchlist fournie.
- Aucune invention : appuie-toi exclusivement sur les données (positions, performances, actualités datées) fournies en entrée.
- Noms propres : ne cite aucune société, aucun indice et aucun organisme qui n'apparaisse pas dans les positions du fonds ou dans un titre d'actualité fourni. Si un thème te vient à l'esprit sans entité listée pour l'illustrer, décris le thème sans nommer personne.
- Score court terme : où que tu le mentionnes, jamais un nombre nu. Écris « dynamique court terme en recul (−12,2) », « stable » ou « porteuse », pour qu'un chiffre négatif se lise comme une baisse des dernières semaines et non comme un mauvais fonds — un fonds solide peut afficher un score court terme très négatif après une correction.
- Posture CGP : sois pragmatique. Un conseiller n'arbitre pas à la moindre baisse ; ne dramatise pas une respiration de marché après une période de hausse.
- Si des « indices décision (heuristique CRM) » sont fournis pour un fonds, prends-les en compte pour nuancer le statut."#;
/// Seuils de performance absolue du profil de volatilité du fonds, alignés sur ceux du diagnostic
/// frontend (`fund-watchlist-diagnostic-thresholds.ts`). Un seuil unique donnait deux sens opposés
/// au même chiffre : −3 % en un mois est une respiration pour un fonds actions, un accident pour un
/// fonds prudent.
struct HintThresholds {
    /// Recul sur un horizon au-delà duquel il compte comme faible.
    weak_horizon: f64,
    /// Recul à 1 mois signant une correction plutôt qu'une dégradation.
    correction: f64,
    /// Performance annuelle encore considérée comme solide malgré ce recul.
    solid_year: f64,
}

const HINTS_ACTIONS: HintThresholds = HintThresholds {
    weak_horizon: -5.0,
    correction: -8.0,
    solid_year: 10.0,
};
const HINTS_DIVERSIFIED: HintThresholds = HintThresholds {
    weak_horizon: -3.0,
    correction: -5.0,
    solid_year: 6.0,
};
const HINTS_RATES: HintThresholds = HintThresholds {
    weak_horizon: -1.5,
    correction: -2.5,
    solid_year: 3.0,
};

/// Mêmes coupures de volatilité 3 ans mesurée que le diagnostic frontend.
const HINTS_RATES_CEILING: f64 = 5.0;
const HINTS_ACTIONS_FLOOR: f64 = 12.0;

fn hint_thresholds(entry: &FundWatchlistEntry) -> HintThresholds {
    let measured = entry
        .vol_3ans
        .filter(|v| v.is_finite() && *v > 0.0)
        .map(|v| {
            if v < HINTS_RATES_CEILING {
                "rates"
            } else if v < HINTS_ACTIONS_FLOOR {
                "diversified"
            } else {
                "actions"
            }
        });
    // Sans volatilité mesurée, la table de catégories tranche ; sinon on garde le profil le plus
    // large, qui déclenche le moins d'indices.
    let class = measured
        .or_else(|| {
            entry
                .categorie
                .as_deref()
                .and_then(volatility_class_for_category)
        })
        .unwrap_or("actions");
    match class {
        "rates" => HINTS_RATES,
        "diversified" => HINTS_DIVERSIFIED,
        _ => HINTS_ACTIONS,
    }
}

pub fn decision_hints(entry: &FundWatchlistEntry) -> Vec<String> {
    let mut hints = Vec::new();
    let thresholds = hint_thresholds(entry);
    let m1 = entry.perf_1mois;
    let m3 = entry.perf_3mois;
    let ytd = entry.perf_ytd;
    let y1 = entry.perf_1an;

    if let (Some(m1), Some(y1)) = (m1, y1) {
        if m1 <= thresholds.correction && y1 >= thresholds.solid_year * 1.5 {
            hints.push(
                "Baisse court terme mais performance 1 an encore très élevée pour son profil de volatilité — privilégier SOUS SURVEILLANCE plutôt qu'ARBITRAGE.".into(),
            );
        }
    }
    if let (Some(m1), Some(ytd)) = (m1, ytd) {
        if m1 <= thresholds.correction && ytd >= thresholds.solid_year {
            hints.push(
                "Correction sur 1 mois mais YTD toujours nettement positif — ne pas arbitrer sur la seule base du score CT.".into(),
            );
        }
    }
    let weak_horizons = [m1, m3, ytd]
        .into_iter()
        .flatten()
        .filter(|v| *v < thresholds.weak_horizon)
        .count();
    if weak_horizons >= 2 {
        hints.push(
            "Recul supérieur au seuil de son profil de volatilité sur au moins 2 horizons récents (1 mois, 3 mois, YTD) — arbitrage envisageable seulement si les actus des top 5 confirment une rupture durable, pas une simple prise de bénéfices.".into(),
        );
    }
    if let (Some(y1), Some(m1)) = (y1, m1) {
        if y1 < 0.0 && m1 < 0.0 {
            hints.push(
                "Performance négative sur 1 mois ET 1 an — arbitrage plus crédible si le fonds ne montre aucun rebond sur 3 mois.".into(),
            );
        }
    }
    if hints.is_empty() {
        hints.push(
            "Pas de signal d'arbitrage automatique — trancher au vu des top 5 et des actus.".into(),
        );
    }
    hints
}

pub fn build_user_prompt(context_blocks: &[String], favorite_names: &[String]) -> String {
    let mut prompt = String::from("Génère le rapport Coach Patrimonial pour ces fonds favoris.\n\n");
    prompt.push_str("Univers favoris (noms) :\n");
    for name in favorite_names {
        prompt.push_str(&format!("- {name}\n"));
    }
    prompt.push('\n');
    for block in context_blocks {
        prompt.push_str(block);
        prompt.push('\n');
    }
    prompt
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::database::models::FundWatchlistEntry;

    fn entry(partial: FundWatchlistEntry) -> FundWatchlistEntry {
        partial
    }

    #[test]
    fn short_term_score_requires_four_horizons() {
        let e = entry(FundWatchlistEntry {
            id: 1,
            isin: "FR001".into(),
            nom: "Test".into(),
            categorie: None,
            notation_morningstar: None,
            sri: None,
            vl_previous: None,
            vl_recent: None,
            vl_date: None,
            perf_ytd: Some(2.0),
            perf_1semaine: Some(1.0),
            perf_1mois: None,
            perf_3mois: Some(1.5),
            perf_1an: None,
            perf_3ans: None,
            perf_5ans: None,
            vol_5ans: None,
            vol_3ans: None,
            vol_1an: None,
            sharpe_ratio: None,
            perf_annual: None,
            frais_gestion: None,
            sfdr: None,
            source_label: "t".into(),
            is_favorite: true,
            created_at: 0,
            updated_at: 0,
        });
        assert!(short_term_score(&e).is_none());
    }

    #[test]
    fn decision_hints_warns_on_short_term_dip_with_strong_year() {
        let entry = FundWatchlistEntry {
            id: 1,
            isin: "LU0336083810".into(),
            nom: "Carmignac Asia".into(),
            categorie: None,
            notation_morningstar: None,
            sri: None,
            vl_previous: None,
            vl_recent: None,
            vl_date: None,
            perf_ytd: Some(28.7),
            perf_1semaine: Some(-9.0),
            perf_1mois: Some(-14.7),
            perf_3mois: Some(-2.0),
            perf_1an: Some(42.4),
            perf_3ans: None,
            perf_5ans: None,
            vol_5ans: None,
            vol_3ans: None,
            vol_1an: None,
            sharpe_ratio: None,
            perf_annual: None,
            frais_gestion: None,
            sfdr: None,
            source_label: "t".into(),
            is_favorite: true,
            created_at: 0,
            updated_at: 0,
        };
        let hints = decision_hints(&entry);
        assert!(hints.iter().any(|h| h.contains("SOUS SURVEILLANCE")));
    }

    /// Profil qui déclenche une heuristique « SOUS SURVEILLANCE » (repli à 1 mois, année solide).
    fn dip_entry() -> FundWatchlistEntry {
        FundWatchlistEntry {
            id: 1,
            isin: "LU0336083810".into(),
            nom: "Carmignac Asia".into(),
            categorie: Some("Actions Asie hors Japon".into()),
            notation_morningstar: None,
            sri: None,
            vl_previous: None,
            vl_recent: None,
            vl_date: None,
            perf_ytd: Some(28.7),
            perf_1semaine: Some(-9.0),
            perf_1mois: Some(-14.7),
            perf_3mois: Some(-2.0),
            perf_1an: Some(42.4),
            perf_3ans: None,
            perf_5ans: None,
            vol_5ans: None,
            vol_3ans: Some(16.4),
            vol_1an: Some(18.2),
            sharpe_ratio: Some(-0.3),
            perf_annual: None,
            frais_gestion: None,
            sfdr: None,
            source_label: "t".into(),
            is_favorite: true,
            created_at: 0,
            updated_at: 0,
        }
    }

    fn context(diagnostic: Option<FundCoachDiagnostic>) -> FundCoachContext {
        FundCoachContext {
            entry: dip_entry(),
            boursorama_url: None,
            holdings: Vec::new(),
            macro_news: Vec::new(),
            fund_news: Vec::new(),
            holding_news: Vec::new(),
            warnings: Vec::new(),
            diagnostic,
        }
    }

    #[test]
    fn context_block_exposes_risk_metrics() {
        let block = build_fund_context_block(&context(None));
        assert!(block.contains("Sharpe 3 ans -0.3"));
        assert!(block.contains("Volatilité 3 ans 16.4 %"));
        assert!(block.contains("Volatilité 1 an 18.2 %"));
    }

    #[test]
    fn context_block_prefers_diagnostic_over_heuristic_hints() {
        let block = build_fund_context_block(&context(Some(FundCoachDiagnostic {
            isin: "LU0336083810".into(),
            status: "signal_arbitrage".into(),
            delta_1an_vs_category: Some(-6.2),
            delta_reference_label: Some("Actions Asie hors Japon (Boursorama)".into()),
            trigger_reasons: vec!["Faiblesse sur 3 horizons".into()],
            reasons: Vec::new(),
            context_reasons: Vec::new(),
        })));
        assert!(block.contains("Diagnostic déterministe CRM"));
        assert!(block.contains("SIGNAL ARBITRAGE"));
        assert!(block.contains("Écart 1 an vs Actions Asie hors Japon (Boursorama) : -6.2 pt"));
        assert!(block.contains("Déclencheurs du diagnostic : Faiblesse sur 3 horizons"));
        assert!(!block.contains("heuristique CRM"));
    }

    #[test]
    fn context_block_keeps_hints_when_the_diagnostic_does_not_decide() {
        let block = build_fund_context_block(&context(Some(FundCoachDiagnostic {
            isin: "LU0336083810".into(),
            status: "inconnu".into(),
            delta_1an_vs_category: None,
            delta_reference_label: None,
            trigger_reasons: Vec::new(),
            reasons: vec!["Pas de référence catégorie : 2 pair(s) comparable(s) (min. 4)".into()],
            context_reasons: vec!["Respiration court terme (score CT négatif)".into()],
        })));
        assert!(block.contains("DONNÉES INSUFFISANTES"));
        assert!(block.contains("Motif du diagnostic : Pas de référence catégorie"));
        // Le CRM ne tranche pas : les heuristiques restent le seul filet du modèle.
        assert!(block.contains("heuristique CRM"));
        // Les nuances du badge doivent parvenir au modèle, sinon il conclut plus durement.
        assert!(block.contains("Nuances relevées par le CRM : Respiration court terme"));
    }

    #[test]
    fn context_block_falls_back_to_hints_without_diagnostic() {
        let block = build_fund_context_block(&context(None));
        assert!(block.contains("heuristique CRM"));
        assert!(!block.contains("Diagnostic déterministe CRM"));
    }

    /// Un fonds non mesurable n'a aucun signal à traiter : il passe après les fonds sains, sinon
    /// il leur volait leur place dans le rapport dès que les favoris dépassaient la limite.
    #[test]
    fn severity_rank_puts_arbitrage_first_and_unmeasurable_last() {
        assert!(diagnostic_severity_rank("signal_arbitrage") < diagnostic_severity_rank("sous_surveillance"));
        assert!(diagnostic_severity_rank("sous_surveillance") < diagnostic_severity_rank("conserver"));
        assert!(diagnostic_severity_rank("conserver") < diagnostic_severity_rank("inconnu"));
    }

    fn hint_entry(vol_3ans: Option<f64>, perf_1mois: f64, perf_3mois: f64) -> FundWatchlistEntry {
        FundWatchlistEntry {
            id: 1,
            isin: "FR0000000001".into(),
            nom: "Fonds test".into(),
            categorie: None,
            notation_morningstar: None,
            sri: None,
            vl_previous: None,
            vl_recent: None,
            vl_date: None,
            perf_ytd: Some(0.5),
            perf_1semaine: None,
            perf_1mois: Some(perf_1mois),
            perf_3mois: Some(perf_3mois),
            perf_1an: Some(1.0),
            perf_3ans: None,
            perf_5ans: None,
            vol_5ans: None,
            vol_3ans,
            vol_1an: None,
            sharpe_ratio: None,
            perf_annual: None,
            frais_gestion: None,
            sfdr: None,
            source_label: "t".into(),
            is_favorite: true,
            created_at: 0,
            updated_at: 0,
        }
    }

    /// −2 % sur deux horizons est du bruit pour un fonds actions et un décrochage pour un fonds
    /// prudent : un seuil unique soufflait « faiblesse » au modèle dans les deux cas.
    #[test]
    fn decision_hints_scale_the_weakness_threshold_with_measured_volatility() {
        let calme = decision_hints(&hint_entry(Some(3.0), -2.0, -2.0));
        assert!(calme.iter().any(|h| h.contains("au moins 2 horizons")));

        let volatil = decision_hints(&hint_entry(Some(20.0), -2.0, -2.0));
        assert!(!volatil.iter().any(|h| h.contains("au moins 2 horizons")));
        assert!(volatil.iter().any(|h| h.contains("Pas de signal d'arbitrage")));
    }

    /// Sans volatilité mesurée, la table de catégories donne le profil ; un libellé inconnu garde
    /// le profil le plus large, qui déclenche le moins d'indices.
    #[test]
    fn decision_hints_fall_back_on_the_category_table() {
        let mut prudent = hint_entry(None, -2.0, -2.0);
        prudent.categorie = Some("Obligations EUR Très Court Terme".into());
        assert!(decision_hints(&prudent)
            .iter()
            .any(|h| h.contains("au moins 2 horizons")));

        let mut inconnu = hint_entry(None, -2.0, -2.0);
        inconnu.categorie = Some("Libellé jamais vu".into());
        assert!(!decision_hints(&inconnu)
            .iter()
            .any(|h| h.contains("au moins 2 horizons")));
    }
}
