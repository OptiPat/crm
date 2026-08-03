use reqwest::blocking::Client;
use std::time::Duration;

fn encode_query(query: &str) -> String {
    url::form_urlencoded::byte_serialize(query.as_bytes()).collect()
}

/// Client dédié Google News RSS (timeout court — évite de bloquer toute la chaîne).
pub fn rss_client() -> Result<Client, String> {
    Client::builder()
        .timeout(Duration::from_secs(8))
        .build()
        .map_err(|e| format!("Client HTTP RSS : {e}"))
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct NewsHeadline {
    pub title: String,
    pub link: String,
    /// Horodatage Unix (pubDate RSS), si disponible.
    pub published_at: Option<i64>,
}

pub fn fetch_google_news_rss(
    client: &Client,
    query: &str,
    limit: usize,
) -> Result<Vec<NewsHeadline>, String> {
    let query = query.trim();
    if query.is_empty() {
        return Ok(Vec::new());
    }
    let url = format!(
        "https://news.google.com/rss/search?q={}&hl=fr&gl=FR&ceid=FR:fr",
        encode_query(query)
    );
    let response = client
        .get(url)
        .send()
        .map_err(|e| format!("Google News RSS : {e}"))?;
    let status = response.status();
    let body = response
        .text()
        .map_err(|e| format!("Lecture Google News : {e}"))?;
    if !status.is_success() {
        return Err(format!("Google News HTTP {}", status.as_u16()));
    }
    Ok(parse_google_news_rss(&body, limit))
}

pub fn parse_google_news_rss(xml: &str, limit: usize) -> Vec<NewsHeadline> {
    let mut out = Vec::new();
    for item in xml.split("<item>").skip(1) {
        let title = extract_xml_tag(item, "title");
        let link = extract_xml_tag(item, "link");
        let pub_date_raw = extract_xml_tag(item, "pubDate");
        if title.is_empty() {
            continue;
        }
        out.push(NewsHeadline {
            title,
            link,
            published_at: parse_pub_date(&pub_date_raw),
        });
        if out.len() >= limit {
            break;
        }
    }
    out
}

fn extract_xml_tag(fragment: &str, tag: &str) -> String {
    let open = format!("<{tag}>");
    let close = format!("</{tag}>");
    let Some(start) = fragment.find(&open) else {
        return String::new();
    };
    let content_start = start + open.len();
    let Some(end) = fragment[content_start..].find(&close) else {
        return String::new();
    };
    decode_xml_entities(fragment[content_start..content_start + end].trim())
}

fn decode_xml_entities(text: &str) -> String {
    text.replace("&amp;", "&")
        .replace("&lt;", "<")
        .replace("&gt;", ">")
        .replace("&quot;", "\"")
        .replace("&#39;", "'")
}

fn parse_pub_date(raw: &str) -> Option<i64> {
    let raw = raw.trim();
    if raw.is_empty() {
        return None;
    }
    if let Ok(dt) = chrono::DateTime::parse_from_rfc2822(raw) {
        return Some(dt.timestamp());
    }
    if let Ok(dt) = chrono::DateTime::parse_from_rfc3339(raw) {
        return Some(dt.timestamp());
    }
    None
}

/// Préfixe temporel pour le prompt LLM : [JJ/MM/AAAA] ou [il y a X j].
pub fn format_news_date_prefix(published_at: Option<i64>, now: i64) -> String {
    let Some(ts) = published_at else {
        return String::new();
    };
    let days = ((now - ts).max(0)) / 86_400;
    if days == 0 {
        return "[aujourd'hui] ".into();
    }
    if days == 1 {
        return "[hier] ".into();
    }
    if days < 14 {
        return format!("[il y a {days} j] ");
    }
    chrono::DateTime::from_timestamp(ts, 0)
        .map(|dt| format!("[{}] ", dt.format("%d/%m/%Y")))
        .unwrap_or_default()
}

pub fn format_headline_inline(headline: &NewsHeadline, now: i64) -> String {
    let date = format_news_date_prefix(headline.published_at, now);
    format!("{date}{}", headline.title.trim())
}

#[cfg(test)]
mod tests {
    use super::*;
    use chrono::TimeZone;

    #[test]
    fn parse_rss_items_with_pub_date() {
        let xml = r#"
        <rss><channel>
          <item>
            <title>Actu fonds A</title>
            <link>https://example.com/a</link>
            <pubDate>Mon, 03 Aug 2026 08:00:00 GMT</pubDate>
          </item>
        </channel></rss>
        "#;
        let items = parse_google_news_rss(xml, 5);
        assert_eq!(items.len(), 1);
        assert_eq!(items[0].title, "Actu fonds A");
        assert!(items[0].published_at.is_some());
    }

    #[test]
    fn format_news_date_prefix_recent() {
        let now = chrono::Utc.with_ymd_and_hms(2026, 8, 3, 12, 0, 0).unwrap().timestamp();
        let three_days_ago = now - 3 * 86_400;
        assert_eq!(
            format_news_date_prefix(Some(three_days_ago), now),
            "[il y a 3 j] "
        );
    }
}
