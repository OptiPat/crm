use crate::database::models::FundWatchlistEntry;
use crate::fund_watchlist_coach::boursorama::BoursoramaHoldingLine;

pub const MACRO_NEWS_QUERY_LIMIT: usize = 3;
pub const MACRO_NEWS_PER_QUERY: usize = 2;

const ZONEBOURSE_SITE: &str = "site:zonebourse.com";

/// Requêtes RSS macro (priorité ZoneBourse via opérateur `site:` Google News).
pub fn build_macro_news_queries(
    entry: &FundWatchlistEntry,
    holdings: &[BoursoramaHoldingLine],
) -> Vec<String> {
    let mut topics: Vec<String> = Vec::new();
    let cat = entry
        .categorie
        .as_deref()
        .unwrap_or("")
        .to_lowercase();
    let nom = entry.nom.to_lowercase();

    push_topic(&mut topics, topics_from_category(&cat, &nom));
    push_topic(&mut topics, topics_from_holdings(holdings));

    let mut queries = Vec::new();
    for topic in topics.into_iter().take(MACRO_NEWS_QUERY_LIMIT) {
        queries.push(zonebourse_query(&topic));
    }
    queries
}

fn zonebourse_query(topic: &str) -> String {
    format!("{ZONEBOURSE_SITE} {topic}")
}

fn push_topic(topics: &mut Vec<String>, additions: Vec<String>) {
    for topic in additions {
        if topics.len() >= MACRO_NEWS_QUERY_LIMIT {
            break;
        }
        let normalized = topic.trim().to_lowercase();
        if normalized.is_empty() {
            continue;
        }
        if topics.iter().any(|t| t.to_lowercase() == normalized) {
            continue;
        }
        topics.push(topic);
    }
}

fn topics_from_category(cat: &str, nom: &str) -> Vec<String> {
    let mut out = Vec::new();
    if cat.contains("asie hors japon") || cat.contains("asia ex") {
        out.push("marché asiatique semi-conducteurs".into());
        out.push("Corée du Sud Kospi liquidité".into());
    } else if cat.contains("japon") {
        out.push("marché japonais Bourse".into());
    } else if cat.contains("italie") {
        out.push("marché italien banques Bourse".into());
    } else if cat.contains("nord") {
        out.push("marché nordique Bourse".into());
    } else if cat.contains("bancaire") || cat.contains("finance") {
        out.push("banques européennes Bourse".into());
    } else if cat.contains("états-unis") || cat.contains("etats-unis") || cat.contains("us ") {
        out.push("Wall Street valeurs américaines".into());
    } else if cat.contains("technolog") {
        out.push("secteur technologique Bourse".into());
    } else if cat.contains("eau") {
        out.push("secteur eau Bourse".into());
    } else if cat.contains("ressources") || cat.contains("matières premières") || cat.contains("or et") {
        out.push("or matières premières marché".into());
    } else if cat.contains("énergie") || cat.contains("energie") || nom.contains("clean energy") {
        out.push("énergies renouvelables marché".into());
    } else if cat.contains("long/short") || cat.contains("alternatif") || cat.contains("market neutral") {
        out.push("marchés actions Europe volatilité".into());
    } else if cat.contains("france") && (cat.contains("petites") || cat.contains("moy")) {
        out.push("PME françaises Bourse".into());
    } else if cat.contains("europe") {
        out.push("marché européen actions".into());
    } else if cat.contains("monde") || cat.contains("international") || cat.contains("global") {
        out.push("marchés actions mondiaux".into());
    } else if cat.contains("flexible") || cat.contains("allocation") {
        out.push("marchés actions Europe".into());
    }

    if nom.contains("space") || cat.contains("spatial") {
        push_topic(&mut out, vec!["secteur spatial Bourse".into()]);
    }

    out
}

fn topics_from_holdings(holdings: &[BoursoramaHoldingLine]) -> Vec<String> {
    let mut blob = String::new();
    for line in holdings.iter().take(5) {
        blob.push(' ');
        blob.push_str(&line.label.to_uppercase());
    }
    let mut out = Vec::new();
    if blob.contains("SK HYNIX")
        || blob.contains("SAMSUNG")
        || blob.contains("SK SQUARE")
        || blob.contains("HYNIX")
    {
        out.push("Corée du Sud Kospi liquidations forcées".into());
    }
    if blob.contains("TAIWAN") || blob.contains("TSMC") {
        out.push("Taïwan semi-conducteurs Bourse".into());
    }
    if blob.contains("HSBC")
        || blob.contains("NATWEST")
        || blob.contains("LLOYDS")
        || blob.contains("NORDEA")
        || blob.contains("UNICREDIT")
        || blob.contains("INTESA")
    {
        out.push("banques européennes résultats Bourse".into());
    }
    if blob.contains("NVIDIA")
        || blob.contains("MICRON")
        || blob.contains("ALPHABET")
        || blob.contains("AMAZON")
    {
        out.push("valeurs technologiques américaines Bourse".into());
    }
    if blob.contains("NEWMONT") || blob.contains("BARRICK") || blob.contains("GOLD") {
        out.push("or minières marché".into());
    }
    if blob.contains("ROCKET LAB") || blob.contains("VIASAT") || blob.contains("L3HARRIS") {
        out.push("secteur spatial défense Bourse".into());
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::fund_watchlist_coach::boursorama::BoursoramaHoldingLine;

    fn sample_entry(categorie: &str, nom: &str) -> FundWatchlistEntry {
        FundWatchlistEntry {
            id: 1,
            isin: "LU0336083810".into(),
            nom: nom.into(),
            categorie: Some(categorie.into()),
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
            frais_gestion: None,
            sfdr: None,
            source_label: "t".into(),
            is_favorite: true,
            created_at: 0,
            updated_at: 0,
        }
    }

    #[test]
    fn carmignac_asia_includes_korea_zonebourse_macro() {
        let entry = sample_entry(
            "Actions Asie hors Japon Petites & Moy. Cap.",
            "Carmignac Portfolio Asia Discovery A EUR Acc",
        );
        let holdings = vec![
            BoursoramaHoldingLine {
                label: "Taiwan Semiconductor Manufacturing Co Ltd".into(),
                weight_percent: Some(9.5),
            },
            BoursoramaHoldingLine {
                label: "SK Hynix Inc".into(),
                weight_percent: Some(7.2),
            },
        ];
        let queries = build_macro_news_queries(&entry, &holdings);
        assert!(!queries.is_empty());
        assert!(queries.iter().all(|q| q.starts_with(ZONEBOURSE_SITE)));
        assert!(
            queries
                .iter()
                .any(|q| q.contains("Corée") || q.contains("Kospi") || q.contains("asiatique"))
        );
    }

    #[test]
    fn european_banks_category_yields_bank_macro() {
        let entry = sample_entry("Actions Secteur Finance", "Axiom European Banks");
        let queries = build_macro_news_queries(&entry, &[]);
        assert!(queries.iter().any(|q| q.contains("banques")));
    }
}
