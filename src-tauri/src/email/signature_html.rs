//! Signature Gmail : entités HTML et conversion texte.

/// Décode `&#39;`, `&#x27;`, `&nbsp;`, etc.
pub fn decode_html_entities(s: &str) -> String {
    if !s.contains('&') {
        return s.to_string();
    }
    let mut result = s.to_string();
    for (entity, ch) in [
        ("&nbsp;", " "),
        ("&amp;", "&"),
        ("&lt;", "<"),
        ("&gt;", ">"),
        ("&quot;", "\""),
        ("&apos;", "'"),
        ("&#39;", "'"),
    ] {
        result = result.replace(entity, ch);
    }
    let mut out = String::new();
    let mut rest = result.as_str();
    while let Some(start) = rest.find("&#") {
        out.push_str(&rest[..start]);
        rest = &rest[start..];
        if let Some(end) = rest.find(';') {
            let entity = &rest[..=end];
            let decoded = if entity.starts_with("&#x") || entity.starts_with("&#X") {
                u32::from_str_radix(&entity[3..entity.len() - 1], 16)
                    .ok()
                    .and_then(char::from_u32)
                    .map(|c| c.to_string())
            } else if entity.starts_with("&#") {
                entity[2..entity.len() - 1]
                    .parse::<u32>()
                    .ok()
                    .and_then(char::from_u32)
                    .map(|c| c.to_string())
            } else {
                None
            };
            if let Some(d) = decoded {
                out.push_str(&d);
                rest = &rest[end + 1..];
                continue;
            }
        }
        out.push_str(&rest[..1]);
        rest = &rest[1..];
    }
    out.push_str(rest);
    out
}

pub fn html_to_plain_signature(html: &str) -> String {
    html_to_plain_email(html)
}

/// Convertit le HTML d'un email reçu en texte lisible (supprime CSS, scripts, mise en page).
pub fn html_to_plain_email(html: &str) -> String {
    let mut s = remove_html_comments(html);
    for tag in ["style", "script", "head", "noscript", "svg"] {
        s = remove_tag_block(&s, tag);
    }
    let decoded = decode_html_entities(&s);
    let with_breaks = decoded
        .replace("<br>", "\n")
        .replace("<br/>", "\n")
        .replace("<br />", "\n")
        .replace("</p>", "\n")
        .replace("</div>", "\n")
        .replace("</tr>", "\n")
        .replace("</li>", "\n")
        .replace("</h1>", "\n")
        .replace("</h2>", "\n")
        .replace("</h3>", "\n");
    let mut out = String::new();
    let mut in_tag = false;
    for c in with_breaks.chars() {
        match c {
            '<' => in_tag = true,
            '>' => in_tag = false,
            _ if !in_tag => out.push(c),
            _ => {}
        }
    }
    let lines: Vec<String> = out
        .lines()
        .map(str::trim)
        .filter(|l| !l.is_empty() && !is_css_noise_line(l))
        .map(|l| l.to_string())
        .collect();
    collapse_blank_lines(&lines).join("\n").trim().to_string()
}

fn remove_html_comments(html: &str) -> String {
    let mut result = html.to_string();
    loop {
        let lower = result.to_lowercase();
        let Some(start) = lower.find("<!--") else {
            break;
        };
        let Some(end_rel) = lower[start + 4..].find("-->") else {
            result.truncate(start);
            break;
        };
        let end = start + 4 + end_rel + 3;
        result = format!("{}{}", &result[..start], &result[end..]);
    }
    result
}

fn remove_tag_block(html: &str, tag: &str) -> String {
    let open = format!("<{tag}");
    let close = format!("</{tag}>");
    let mut result = html.to_string();
    loop {
        let lower = result.to_lowercase();
        let Some(start) = lower.find(&open) else {
            break;
        };
        let after = start + open.len();
        if after >= result.len() {
            result.truncate(start);
            break;
        }
        let next = result.as_bytes()[after];
        if next != b'>' && next != b' ' && next != b'\t' && next != b'\n' && next != b'/' {
            result = format!("{}{}", &result[..start], &result[start + 1..]);
            continue;
        }
        let Some(close_rel) = lower[after..].find(&close) else {
            result.truncate(start);
            break;
        };
        let end = after + close_rel + close.len();
        result = format!("{}{}", &result[..start], &result[end..]);
    }
    result
}

fn is_css_noise_line(line: &str) -> bool {
    let t = line.trim();
    if t.is_empty() {
        return false;
    }
    if t.starts_with('@')
        || t.starts_with("*{")
        || t.starts_with("* {")
        || t.contains("@font-face")
        || t.contains("!important")
    {
        return true;
    }
    if !(t.contains('{') && t.contains('}')) {
        return false;
    }
    let word_chars = t.chars().filter(|c| c.is_alphabetic()).count();
    let punct = t
        .chars()
        .filter(|c| "{}:;#.%!-".contains(*c))
        .count();
    word_chars < 8 && punct > word_chars
}

fn collapse_blank_lines(lines: &[String]) -> Vec<String> {
    let mut out: Vec<String> = Vec::new();
    for line in lines {
        if line.is_empty() && out.last().is_some_and(|s| s.is_empty()) {
            continue;
        }
        out.push(line.clone());
    }
    out
}

pub fn normalize_signature_html(html: &str) -> String {
    decode_html_entities(html.trim())
}

fn escape_html_text(text: &str) -> String {
    text.replace('&', "&amp;")
        .replace('<', "&lt;")
        .replace('>', "&gt;")
        .replace('"', "&quot;")
}

fn plain_message_to_html(message: &str) -> String {
    message
        .split('\n')
        .map(|line| {
            if line.trim().is_empty() {
                "<br>".to_string()
            } else {
                format!(
                    "<p style=\"margin:0 0 0.5em 0\">{}</p>",
                    escape_html_text(line)
                )
            }
        })
        .collect::<Vec<_>>()
        .join("")
}

/// Message + signature CGP (texte et HTML optionnel).
pub fn build_outgoing_email_bodies(
    message_plain: &str,
    plain_signature: Option<&str>,
    html_signature: Option<&str>,
) -> (String, Option<String>) {
    let msg = message_plain.trim_end();
    let plain_sig = plain_signature.unwrap_or("").trim();
    let html_sig = html_signature.unwrap_or("").trim();

    let plain = if plain_sig.is_empty() {
        msg.to_string()
    } else if msg.ends_with(plain_sig) {
        msg.to_string()
    } else {
        format!("{msg}\n\n--\n{plain_sig}")
    };

    let html = if html_sig.is_empty() {
        None
    } else {
        Some(format!(
            "{}<br><br>{}",
            plain_message_to_html(msg),
            html_sig
        ))
    };

    (plain, html)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn decode_entities() {
        assert_eq!(decode_html_entities("l&#39;Orias"), "l'Orias");
        assert_eq!(decode_html_entities("a &amp; b"), "a & b");
    }

    #[test]
    fn html_to_plain_email_strips_style_blocks() {
        let html = r#"<html><head><style>
* { margin: 0; padding: 0; }
@media only screen { .hide { display: none !important; } }
</style></head><body>
<p>Bonjour Bruno,</p>
<p>Merci pour votre message.</p>
</body></html>"#;
        let plain = html_to_plain_email(html);
        assert!(plain.contains("Bonjour Bruno"));
        assert!(plain.contains("Merci pour votre message"));
        assert!(!plain.contains("margin: 0"));
        assert!(!plain.contains("@media"));
        assert!(!plain.contains("!important"));
    }
}
