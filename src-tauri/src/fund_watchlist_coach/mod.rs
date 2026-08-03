mod boursorama;
mod holdings_kind;
mod macro_news;
mod news;
mod prompt;

use std::sync::{Mutex, OnceLock};
use std::thread;
use std::time::Duration;

use boursorama::{boursorama_client, composition_url, fetch_top_holdings, resolve_opcvm_symbol};
use news::{fetch_google_news_rss, rss_client};
use prompt::{
    build_fund_context_block, build_user_prompt, short_term_score, FundCoachContext, HoldingNewsBlock,
    COACH_SYSTEM_PROMPT,
};
use reqwest::blocking::Client;
use serde::Serialize;
use tauri::{AppHandle, Emitter, Manager};

use crate::commands::DbState;
use crate::database::models::{FundWatchlistEntry, FundWatchlistFavoritesReport};
use crate::newsletter::llm::{call_chat_markdown, LlmProvider};
use crate::newsletter::store::NewsletterStore;

pub const REPORT_DONE_EVENT: &str = "fund-watchlist-coach-report-done";
pub const REPORT_PROGRESS_EVENT: &str = "fund-watchlist-coach-report-progress";

const MAX_FAVORITES: usize = 30;
const FUND_NEWS_LIMIT: usize = 3;
const MACRO_NEWS_PER_QUERY: usize = macro_news::MACRO_NEWS_PER_QUERY;
const HOLDINGS_FOR_INDIVIDUAL_NEWS: usize = 10;
const NEWS_PER_HOLDING_TOP5: usize = 3;
const NEWS_PER_HOLDING_REST: usize = 1;
const TOP_HOLDINGS_MANDATORY_ANALYSIS: usize = 5;
/// Pause entre fonds (Boursorama + rafale RSS).
const INTER_FUND_DELAY_MS: u64 = 150;
/// Pause entre requêtes RSS au sein d'un même fonds (anti rate-limit).
const RSS_INTER_REQUEST_DELAY_MS: u64 = 80;

static REPORT_RUNNING: OnceLock<Mutex<bool>> = OnceLock::new();

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FundWatchlistCoachReportEvent {
    pub ok: bool,
    pub report: Option<FundWatchlistFavoritesReport>,
    pub error: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FundWatchlistCoachProgressEvent {
    /// `collecting` ou `llm`
    pub phase: String,
    pub current: usize,
    pub total: usize,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub fund_name: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub fund_isin: Option<String>,
}

fn emit_progress(app: &AppHandle, event: FundWatchlistCoachProgressEvent) {
    let _ = app.emit(REPORT_PROGRESS_EVENT, event);
}

pub fn coach_report_in_progress() -> bool {
    *REPORT_RUNNING
        .get_or_init(|| Mutex::new(false))
        .lock()
        .unwrap_or_else(|e| e.into_inner())
}

fn set_report_running(running: bool) {
    if let Ok(mut guard) = REPORT_RUNNING.get_or_init(|| Mutex::new(false)).lock() {
        *guard = running;
    }
}

pub fn spawn_favorites_report(app: AppHandle) -> Result<(), String> {
    {
        let mut guard = REPORT_RUNNING
            .get_or_init(|| Mutex::new(false))
            .lock()
            .map_err(|_| "Verrou rapport Coach indisponible.".to_string())?;
        if *guard {
            return Err("Un rapport Coach est déjà en cours de génération.".into());
        }
        *guard = true;
    }

    if let Err(error) = thread::Builder::new()
        .name("fund-watchlist-coach".into())
        .spawn(move || {
            let payload = match std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
                generate_favorites_report(&app)
            })) {
                Ok(Ok(report)) => FundWatchlistCoachReportEvent {
                    ok: true,
                    report: Some(report),
                    error: None,
                },
                Ok(Err(error)) => FundWatchlistCoachReportEvent {
                    ok: false,
                    report: None,
                    error: Some(error),
                },
                Err(_) => FundWatchlistCoachReportEvent {
                    ok: false,
                    report: None,
                    error: Some(
                        "Erreur interne lors de la génération du rapport Coach.".into(),
                    ),
                },
            };
            let _ = app.emit(REPORT_DONE_EVENT, payload);
            set_report_running(false);
        })
        .map_err(|e| format!("Impossible de lancer le rapport Coach : {e}"))
    {
        set_report_running(false);
        return Err(error);
    }

    Ok(())
}

fn sort_favorites_for_coach(favorites: &mut [FundWatchlistEntry]) {
    favorites.sort_by(|left, right| {
        let sl = short_term_score(left);
        let sr = short_term_score(right);
        match (sl, sr) {
            (Some(l), Some(r)) => l
                .partial_cmp(&r)
                .unwrap_or(std::cmp::Ordering::Equal)
                .then_with(|| left.nom.cmp(&right.nom)),
            (None, Some(_)) => std::cmp::Ordering::Greater,
            (Some(_), None) => std::cmp::Ordering::Less,
            (None, None) => left.nom.cmp(&right.nom),
        }
    });
}

fn load_favorites_snapshot(
    app: &AppHandle,
) -> Result<(Vec<FundWatchlistEntry>, usize), String> {
    let db_state = app.state::<DbState>();
    let db_guard = db_state
        .inner()
        .lock()
        .map_err(|_| "Base de données indisponible.".to_string())?;
    let database = db_guard
        .as_ref()
        .ok_or("Database not initialized")?;
    let mut favorites = database
        .get_fund_watchlist_favorites()
        .map_err(|e| format!("Lecture favoris : {e}"))?;
    let total_favorites = favorites.len();
    sort_favorites_for_coach(&mut favorites);
    favorites.truncate(MAX_FAVORITES);
    Ok((favorites, total_favorites))
}

fn generate_favorites_report(app: &AppHandle) -> Result<FundWatchlistFavoritesReport, String> {
    // Lecture DB brève — le verrou est relâché avant toute requête HTTP / appel LLM.
    let (favorites, total_favorites) = load_favorites_snapshot(app)?;

    if favorites.is_empty() {
        return Err("Aucun fonds favori — épinglez des fonds avec l'étoile.".into());
    }

    let store = NewsletterStore::load(app)?;
    let provider = LlmProvider::parse(&store.llm_provider);
    let api_key = store
        .api_key
        .clone()
        .filter(|k| !k.trim().is_empty())
        .ok_or_else(|| {
            if store.encrypted_api_key_present {
                "Clé API illisible — rouvrez le CRM avec votre mot de passe.".into()
            } else {
                format!(
                    "Configurez votre clé API {} dans Newsletter → Paramètres.",
                    provider.label()
                )
            }
        })?;
    let model = {
        let trimmed = store.model.trim();
        if trimmed.is_empty() {
            provider.default_model()
        } else {
            trimmed
        }
    };

    let mut warnings = Vec::new();
    if total_favorites > MAX_FAVORITES {
        warnings.push(format!(
            "Seuls les {MAX_FAVORITES} premiers favoris (tri score CT croissant — priorité surveillance) ont été analysés sur {total_favorites}."
        ));
    }

    let boursorama_http = boursorama_client()?;
    let rss_http = rss_client()?;
    let total = favorites.len();
    emit_progress(
        app,
        FundWatchlistCoachProgressEvent {
            phase: "collecting".into(),
            current: 0,
            total,
            fund_name: None,
            fund_isin: None,
        },
    );

    let mut contexts = Vec::with_capacity(favorites.len());
    for (index, entry) in favorites.iter().enumerate() {
        if index > 0 {
            thread::sleep(Duration::from_millis(INTER_FUND_DELAY_MS));
        }
        emit_progress(
            app,
            FundWatchlistCoachProgressEvent {
                phase: "collecting".into(),
                current: index + 1,
                total,
                fund_name: Some(entry.nom.clone()),
                fund_isin: Some(entry.isin.clone()),
            },
        );
        contexts.push(collect_fund_context(&boursorama_http, &rss_http, entry)?);
    }

    emit_progress(
        app,
        FundWatchlistCoachProgressEvent {
            phase: "llm".into(),
            current: total,
            total,
            fund_name: None,
            fund_isin: None,
        },
    );

    let favorite_names: Vec<String> = favorites.iter().map(|e| e.nom.clone()).collect();
    let context_blocks: Vec<String> = contexts.iter().map(build_fund_context_block).collect();
    for ctx in &contexts {
        warnings.extend(ctx.warnings.clone());
    }

    let user_prompt = build_user_prompt(&context_blocks, &favorite_names);
    let markdown = call_chat_markdown(
        provider,
        &api_key,
        model,
        vec![
            ("system".into(), COACH_SYSTEM_PROMPT.into()),
            ("user".into(), user_prompt),
        ],
        0.35,
    )?;

    let report = FundWatchlistFavoritesReport {
        markdown,
        generated_at: chrono::Utc::now().timestamp(),
        favorite_count: favorites.len(),
        warnings,
    };
    persist_last_report(app, &report)?;
    Ok(report)
}

fn persist_last_report(app: &AppHandle, report: &FundWatchlistFavoritesReport) -> Result<(), String> {
    let db_state = app.state::<DbState>();
    let db_guard = db_state
        .inner()
        .lock()
        .map_err(|_| "Base de données indisponible.".to_string())?;
    let database = db_guard
        .as_ref()
        .ok_or("Database not initialized")?;
    database
        .save_fund_watchlist_coach_last_report(report)
        .map_err(|e| format!("Sauvegarde rapport Coach : {e}"))
}

fn collect_fund_context(
    boursorama_http: &Client,
    rss_http: &Client,
    entry: &FundWatchlistEntry,
) -> Result<FundCoachContext, String> {
    let mut warnings = Vec::new();
    let mut boursorama_url = None;
    let mut holdings = Vec::new();

    match resolve_opcvm_symbol(boursorama_http, &entry.isin) {
        Ok(Some(symbol)) => {
            boursorama_url = Some(composition_url(&symbol));
            match fetch_top_holdings(boursorama_http, &symbol) {
                Ok(lines) if lines.is_empty() => {
                    warnings.push(format!(
                        "{} : page composition Boursorama sans lignes exploitables.",
                        entry.isin
                    ));
                }
                Ok(lines) => holdings = lines,
                Err(err) => {
                    warnings.push(format!("{} : composition Boursorama — {err}", entry.isin))
                }
            }
        }
        Ok(None) => warnings.push(format!(
            "{} : symbole Boursorama introuvable (recherche ISIN).",
            entry.isin
        )),
        Err(err) => warnings.push(format!("{} : recherche Boursorama — {err}", entry.isin)),
    }

    let mut rss_pacer = RssRequestPacer::new();
    let macro_news =
        collect_macro_news(&mut rss_pacer, rss_http, entry, &holdings, &mut warnings);
    let fund_news = match rss_pacer.fetch(rss_http, &build_fund_news_query(entry), FUND_NEWS_LIMIT)
    {
        Ok(items) => items,
        Err(err) => {
            warnings.push(format!("{} : actualités fonds — {err}", entry.isin));
            Vec::new()
        }
    };

    let holding_news = collect_holding_news(&mut rss_pacer, rss_http, &holdings);

    Ok(FundCoachContext {
        entry: entry.clone(),
        boursorama_url,
        holdings,
        macro_news,
        fund_news,
        holding_news,
        warnings,
    })
}

fn collect_macro_news(
    rss_pacer: &mut RssRequestPacer,
    rss_http: &Client,
    entry: &FundWatchlistEntry,
    holdings: &[boursorama::BoursoramaHoldingLine],
    warnings: &mut Vec<String>,
) -> Vec<news::NewsHeadline> {
    use std::collections::HashSet;

    let queries = macro_news::build_macro_news_queries(entry, holdings);
    let mut seen = HashSet::new();
    let mut headlines = Vec::new();
    for query in queries {
        match rss_pacer.fetch(rss_http, &query, MACRO_NEWS_PER_QUERY) {
            Ok(batch) => {
                for item in batch {
                    let key = item.title.to_lowercase();
                    if seen.insert(key) {
                        headlines.push(item);
                    }
                }
            }
            Err(err) => warnings.push(format!(
                "{} : actualités macro ZoneBourse ({query}) — {err}",
                entry.isin
            )),
        }
    }
    headlines
}

fn collect_holding_news(
    rss_pacer: &mut RssRequestPacer,
    rss_http: &Client,
    holdings: &[boursorama::BoursoramaHoldingLine],
) -> Vec<HoldingNewsBlock> {
    let mut blocks = Vec::new();
    for (index, line) in holdings.iter().take(HOLDINGS_FOR_INDIVIDUAL_NEWS).enumerate() {
        if holdings_kind::holding_skips_news_search(&line.label) {
            blocks.push(HoldingNewsBlock { headlines: Vec::new() });
            continue;
        }
        let limit = if index < TOP_HOLDINGS_MANDATORY_ANALYSIS {
            NEWS_PER_HOLDING_TOP5
        } else {
            NEWS_PER_HOLDING_REST
        };
        let query = format!("\"{}\"", holding_news_label(&line.label));
        let headlines = rss_pacer
            .fetch(rss_http, &query, limit)
            .unwrap_or_default();
        blocks.push(HoldingNewsBlock { headlines });
    }
    blocks
}

/// Espace les requêtes RSS (80 ms entre chaque, pas avant la première d'un fonds).
struct RssRequestPacer {
    pause_before_next: bool,
}

impl RssRequestPacer {
    fn new() -> Self {
        Self {
            pause_before_next: false,
        }
    }

    fn fetch(
        &mut self,
        client: &Client,
        query: &str,
        limit: usize,
    ) -> Result<Vec<news::NewsHeadline>, String> {
        if self.pause_before_next {
            thread::sleep(Duration::from_millis(RSS_INTER_REQUEST_DELAY_MS));
        } else {
            self.pause_before_next = true;
        }
        fetch_google_news_rss(client, query, limit)
    }
}

fn truncate_query_prefix(text: &str, max_bytes: usize) -> String {
    if text.len() <= max_bytes {
        return text.to_string();
    }
    let mut end = max_bytes;
    while end > 0 && !text.is_char_boundary(end) {
        end -= 1;
    }
    text[..end].to_string()
}

fn build_fund_news_query(entry: &FundWatchlistEntry) -> String {
    const MAX_NOM_BYTES: usize = 80;
    let nom = entry.nom.trim();
    if nom.len() > MAX_NOM_BYTES {
        format!(
            "\"{}\" OR {}",
            truncate_query_prefix(nom, MAX_NOM_BYTES),
            entry.isin
        )
    } else {
        format!("\"{nom}\" OR {}", entry.isin)
    }
}

pub fn holding_news_label(label: &str) -> String {
    let mut clean = label.trim().to_string();
    for suffix in [
        " Inc",
        " Corp",
        " Ltd",
        " PLC",
        " SA",
        " SE",
        " AG",
        " NV",
        " SpA",
    ] {
        if let Some(stripped) = clean.strip_suffix(suffix) {
            clean = stripped.trim().to_string();
        }
    }
    if clean.len() > 48 {
        clean.truncate(48);
        clean = clean.trim_end().to_string();
    }
    clean
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn build_fund_news_query_truncates_utf8_safely() {
        let nom = "é".repeat(80);
        let entry = FundWatchlistEntry {
            id: 1,
            isin: "LU0336083810".into(),
            nom,
            categorie: None,
            notation_morningstar: None,
            sri: None,
            vl_previous: None,
            vl_recent: None,
            vl_date: None,
            perf_ytd: None,
            perf_1semaine: None,
            perf_1mois: None,
            perf_3mois: None,
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
        };
        let q = build_fund_news_query(&entry);
        assert!(q.contains("LU0336083810"));
        assert!(std::str::from_utf8(q.as_bytes()).is_ok());
    }

    #[test]
    fn build_fund_news_query_includes_isin() {
        let entry = FundWatchlistEntry {
            id: 1,
            isin: "FR0010135103".into(),
            nom: "Carmignac Patrimoine A".into(),
            categorie: None,
            notation_morningstar: None,
            sri: None,
            vl_previous: None,
            vl_recent: None,
            vl_date: None,
            perf_ytd: None,
            perf_1semaine: None,
            perf_1mois: None,
            perf_3mois: None,
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
        };
        let q = build_fund_news_query(&entry);
        assert!(q.contains("FR0010135103"));
        assert!(q.contains("Carmignac"));
    }

    #[test]
    fn holding_news_label_strips_suffix() {
        assert_eq!(holding_news_label("NVIDIA Corp"), "NVIDIA");
    }

    #[test]
    fn sort_favorites_puts_lowest_ct_first() {
        fn sample(nom: &str, perfs: [Option<f64>; 4]) -> FundWatchlistEntry {
            FundWatchlistEntry {
                id: 0,
                isin: "FR0000000000".into(),
                nom: nom.into(),
                categorie: None,
                notation_morningstar: None,
                sri: None,
                vl_previous: None,
                vl_recent: None,
                vl_date: None,
                perf_ytd: perfs[3],
                perf_1semaine: perfs[0],
                perf_1mois: perfs[1],
                perf_3mois: perfs[2],
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
            }
        }
        let mut favorites = vec![
            sample("Bon", [Some(1.0), Some(2.0), Some(3.0), Some(4.0)]),
            sample("Mauvais", [Some(-9.0), Some(-14.0), Some(-2.0), Some(28.0)]),
        ];
        sort_favorites_for_coach(&mut favorites);
        assert_eq!(favorites[0].nom, "Mauvais");
        assert_eq!(favorites[1].nom, "Bon");
    }

    /// Vérification terrain live (Boursorama + RSS) — `cargo test coach_live_sample -- --ignored --nocapture`
    #[test]
    #[ignore]
    fn coach_live_sample_holdings_and_rss() {
        use crate::fund_watchlist_coach::news::fetch_google_news_rss;

        let samples: &[(&str, &str)] = &[
            ("FR0010011171", "AXA Or"),
            ("LU1876459303", "Axiom Banks"),
            ("FR0010174144", "BDL Rempart"),
            ("LU0336083810", "Carmignac Asia"),
            ("LU2466448532", "Echiquier Space"),
            ("LU0171296949", "BlackRock US Flexible"),
        ];
        let boursorama = boursorama_client().expect("boursorama client");
        let rss = rss_client().expect("rss client");
        for (isin, label) in samples {
            eprintln!("\n=== {isin} — {label} ===");
            let symbol = resolve_opcvm_symbol(&boursorama, isin).expect("resolve");
            let Some(symbol) = symbol else {
                eprintln!("  symbole introuvable");
                continue;
            };
            eprintln!("  symbole: {symbol}");
            let holdings = fetch_top_holdings(&boursorama, &symbol).expect("holdings");
            for (i, line) in holdings.iter().enumerate() {
                let w = line
                    .weight_percent
                    .map(|x| format!("{x:.1} %"))
                    .unwrap_or_else(|| "?".into());
                eprintln!("  {}. {} ({w})", i + 1, line.label);
                if i < 3 {
                    let q = format!("\"{}\"", holding_news_label(&line.label));
                    if let Ok(news) = fetch_google_news_rss(&rss, &q, 2) {
                        for n in &news {
                            eprintln!("      RSS: {}", n.title);
                        }
                    }
                    thread::sleep(Duration::from_millis(RSS_INTER_REQUEST_DELAY_MS));
                }
            }
            thread::sleep(Duration::from_millis(INTER_FUND_DELAY_MS));
        }
    }

    /// Vérifie les titres RSS bruts pour les lignes avec chiffres dans le rapport Coach.
    #[test]
    #[ignore]
    fn coach_live_verify_number_claims() {
        use crate::fund_watchlist_coach::news::fetch_google_news_rss;

        let queries: &[(&str, &str)] = &[
            ("TSMC juin 68", "\"Taiwan Semiconductor Manufacturing\""),
            ("SK Hynix 557", "\"SK Hynix\""),
            ("Micron 5.9", "\"Micron Technology\""),
            ("Lloyds 1 milliard", "\"LLOYDS BANKING GROUP\""),
            ("Oracle 7 milliards Pentagon", "\"Oracle\""),
            ("Societe Generale 1.5 milliard", "\"Societe Generale\""),
            ("Linde 1 milliard Arizona", "\"Linde\""),
            ("JNJ 5.5 milliards talc", "\"Johnson & Johnson\""),
            ("Cardinal Health 360 millions", "\"Cardinal Health\""),
            ("Prysmian 3.8 milliards", "\"Prysmian\""),
            ("Exxon 4 ans T2", "\"Exxon Mobil\""),
            ("Chevron benefice net", "\"Chevron\""),
            ("NatWest T2 benefice", "\"NATWEST GROUP\""),
            ("HSBC restructuration IA", "\"HSBC HOLDINGS\""),
        ];
        let rss = rss_client().expect("rss");
        for (label, query) in queries {
            eprintln!("\n--- {label} ({query}) ---");
            match fetch_google_news_rss(&rss, query, 5) {
                Ok(news) if news.is_empty() => eprintln!("  (aucun titre)"),
                Ok(news) => {
                    for n in news {
                        eprintln!("  • {}", n.title);
                    }
                }
                Err(e) => eprintln!("  ERREUR: {e}"),
            }
            thread::sleep(Duration::from_millis(RSS_INTER_REQUEST_DELAY_MS));
        }
    }
}
