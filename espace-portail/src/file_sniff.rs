//! Détection du type réel des pièces déposées (magic bytes).

const PDF: &[u8] = b"%PDF";
const PNG: &[u8] = b"\x89PNG\r\n\x1a\n";

pub fn validate_allowed_document(
    data: &[u8],
    declared_mime: &str,
    filename: &str,
) -> Result<String, String> {
    let sniffed = sniff_mime(data).ok_or_else(|| {
        "Format non reconnu (PDF, JPEG ou PNG uniquement)".to_string()
    })?;
    if !mime_compatible(sniffed, declared_mime) {
        return Err("Le type déclaré ne correspond pas au contenu du fichier".into());
    }
    if !extension_compatible(sniffed, filename) {
        return Err("L'extension ne correspond pas au contenu du fichier".into());
    }
    Ok(sniffed.to_string())
}

fn sniff_mime(data: &[u8]) -> Option<&'static str> {
    if data.starts_with(PDF) {
        return Some("application/pdf");
    }
    if data.len() >= 3 && data[0] == 0xFF && data[1] == 0xD8 && data[2] == 0xFF {
        return Some("image/jpeg");
    }
    if data.starts_with(PNG) {
        return Some("image/png");
    }
    None
}

fn mime_compatible(sniffed: &str, declared: &str) -> bool {
    let declared = declared.split(';').next().unwrap_or(declared).trim();
    if declared == "application/octet-stream" {
        return true;
    }
    sniffed == declared
        || (sniffed == "image/jpeg" && declared == "image/jpg")
}

fn extension_compatible(sniffed: &str, filename: &str) -> bool {
    let lower = filename.to_lowercase();
    match sniffed {
        "application/pdf" => lower.ends_with(".pdf"),
        "image/jpeg" => {
            lower.ends_with(".jpg") || lower.ends_with(".jpeg")
        }
        "image/png" => lower.ends_with(".png"),
        _ => false,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn detects_pdf_header() {
        let mime = validate_allowed_document(b"%PDF-1.4", "application/pdf", "doc.pdf").unwrap();
        assert_eq!(mime, "application/pdf");
    }

    #[test]
    fn rejects_mismatched_extension() {
        let err = validate_allowed_document(b"%PDF-1.4", "application/pdf", "doc.jpg")
            .unwrap_err();
        assert!(err.contains("extension"));
    }
}
