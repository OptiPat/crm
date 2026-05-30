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
    let decoded = decode_html_entities(html);
    let s = decoded
        .replace("<br>", "\n")
        .replace("<br/>", "\n")
        .replace("<br />", "\n")
        .replace("</p>", "\n")
        .replace("</div>", "\n");
    let mut out = String::new();
    let mut in_tag = false;
    for c in s.chars() {
        match c {
            '<' => in_tag = true,
            '>' => in_tag = false,
            _ if !in_tag => out.push(c),
            _ => {}
        }
    }
    out.lines()
        .map(|l| l.trim_end())
        .collect::<Vec<_>>()
        .join("\n")
        .trim()
        .to_string()
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
}
