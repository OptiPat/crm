//! Appels Mistral OCR + résumé bulletin SCPI.

use reqwest::blocking::{Client, multipart};
use serde::{Deserialize, Serialize};

/// Modèle chat n8n prod (« Mistral resume SCPI ») — indépendant du modèle newsletter.
pub const SCPI_BULLETIN_CHAT_MODEL: &str = "mistral-small-latest";

pub const SCPI_BULLETIN_SYSTEM_PROMPT: &str = r#"Tu es l'assistant d'un conseiller en gestion de patrimoine (CGP). Tu resumes des bulletins trimestriels SCPI a partir du texte OCR du PDF.

FORMAT (markdown court, sans markdown gras **) :
- Titre (sans numero) : nom SCPI + trimestre/periode sur une seule ligne (ex. Comete – T1 2026). Lis le bulletin, pas seulement le nom de fichier.
- 1. Chiffres cles : titre OBLIGATOIRE seul sur sa ligne, puis EXACTEMENT 3 puces dans cet ordre :
  - Collecte nette : X M€ — seulement si le bulletin ecrit un montant en euros (M€ / Md€ / millions d'euros). Si la nette n'est pas en € : Collecte brute : X M€ (si la brute est en €). Si aucun montant en € : Collecte : non communiquee en €. INTERDIT : convertir un nombre de parts en M€ (ex. 142 066 parts → 142 M€). INTERDIT : inventer ou arrondir un montant. INTERDIT : nombre d'associes.
  - Capitalisation : X M€ ou Md€ (uniquement si le bulletin l'ecrit en €, sinon : non communiquee)
  - Distribution : X €/part brut = le dividende / distribution du trimestre tel qu'affiche « brut ». Ajouter le net apres fiscalite etrangere UNIQUEMENT si le bulletin le donne sous cette forme. INTERDIT : prendre un sous-montant (loyers, plus-value, impot etranger) pour le brut ou le « net ».
  Rien d'autre dans cette section (pas de TOF, endettement, loyers, tresorerie, prix de part). Jamais « 274 M€ : collecte nette » sans le titre 1.
- 2. Ce trimestre : titre OBLIGATOIRE seul sur sa ligne, puis 2 a 4 phrases inspirees de l'editorial (1re page). Ne pas repeter les 3 chiffres deja donnes. Pas de pipeline / exclusivite / geographie non encore acquise. Ne jamais recopier le titre SCPI ici.
- 3. Acquisitions : ecrire uniquement le titre « 3. Acquisitions » (rien d'autre sur la ligne) s'il y a des acquisitions dans le bulletin ; sinon omettre toute la section. Puis une puce (-) par acquisition DU TRIMESTRE (toutes les villes, sans en oublier). Format EXACT : Pays, ville : typologie, occupation ou locataire notable (ex. Irlande, Dublin : Commerces, occupe a 89 %). Si extension d'un actif deja detenu, l'indiquer. Rien d'autre. Ne jamais recopier une consigne du prompt.

INTERDIT dans le resume :
- markdown gras (**), numerotation du titre SCPI
- repeter le nom SCPI + periode dans les sections 1/2/3
- pipeline, collecte a investir, dossiers en cours, exclusivite, geographie non acquise
- dans Chiffres cles : TOF, endettement, loyers, tresorerie, prix de part, nombre de parts, nombre d'associes, conversion parts → M€
- gouvernance, conseil de surveillance, renouvellement d'equipes
- conseil en investissement ou incitation a souscrire
- dans Acquisitions : surfaces (m², m2), prix d'acquisition, montants AEM, noms d'immeubles trop longs, certifications detaillees

REGLES :
- Informatif uniquement
- Pas de promesse de rendement
- Chiffres : uniquement collecte (en €, nette ou brute), capitalisation, distribution €/part (brut ou net apres fiscalite etrangere). Recopier l'unite du bulletin. En cas de doute → non communique. Mieux vaut omettre qu'afficher une valeur erronee.
- Collecte : montant en € seulement si le PDF l'ecrit en euros. Jamais transformer des parts en M€. Pas de parts × prix de souscription (source d'erreurs). Si seul un nombre de parts : Collecte : non communiquee en €
- Distribution : ne pas qualifier de « net » un montant de loyers ou une quote-part (plus-value, impot)
- Ne pas inventer de totaux (nombre de pays, montants agreges) : compter uniquement ce qui est liste, sinon omettre
- Acquisitions : toutes les villes du tableau du trimestre ; ne pas fusionner des villes au point d'en oublier une ; pas de m² ni de prix
- Info absente ou unite incertaine → non communique
- Ton professionnel et accessible
- Reponds UNIQUEMENT en markdown francais (sans bloc ```markdown)"#;

#[derive(Debug, Deserialize)]
struct MistralFileUploadResponse {
    id: String,
}

#[derive(Debug, Deserialize)]
struct MistralOcrPage {
    #[serde(default)]
    markdown: Option<String>,
    #[serde(default)]
    text: Option<String>,
}

#[derive(Debug, Deserialize)]
struct MistralOcrResponse {
    #[serde(default)]
    pages: Vec<MistralOcrPage>,
}

#[derive(Debug, Serialize)]
struct MistralOcrRequest {
    model: String,
    document: MistralOcrDocument,
}

#[derive(Debug, Serialize)]
struct MistralOcrDocument {
    #[serde(rename = "type")]
    doc_type: String,
    file_id: String,
}

#[derive(Debug, Serialize)]
struct MistralMessage {
    role: String,
    content: String,
}

#[derive(Debug, Serialize)]
struct MistralChatRequest {
    model: String,
    temperature: f32,
    messages: Vec<MistralMessage>,
}

#[derive(Debug, Deserialize)]
struct MistralChatResponse {
    choices: Vec<MistralChatChoice>,
}

#[derive(Debug, Deserialize)]
struct MistralChatChoice {
    message: MistralChatChoiceMessage,
}

#[derive(Debug, Deserialize)]
struct MistralChatChoiceMessage {
    content: String,
}

pub struct OcrBulletinText {
    pub first_page_text: String,
    pub bulletin_text: String,
    pub ocr_pages: usize,
}

fn http_client() -> Result<Client, String> {
    Client::builder()
        .timeout(std::time::Duration::from_secs(180))
        .build()
        .map_err(|e| format!("Client HTTP : {e}"))
}

fn mistral_auth_header(api_key: &str) -> String {
    format!("Bearer {}", api_key.trim())
}

fn truncate_for_user(text: &str, max: usize) -> String {
    let t = text.trim();
    if t.len() <= max {
        t.to_string()
    } else {
        format!("{}…", &t[..max])
    }
}

pub fn mistral_ocr_pdf(
    api_key: &str,
    pdf_bytes: &[u8],
    file_name: &str,
) -> Result<OcrBulletinText, String> {
    let client = http_client()?;
    let part = multipart::Part::bytes(pdf_bytes.to_vec())
        .file_name(file_name.to_string())
        .mime_str("application/pdf")
        .map_err(|e| format!("PDF illisible : {e}"))?;
    let form = multipart::Form::new()
        .text("purpose", "ocr")
        .part("file", part);

    let upload = client
        .post("https://api.mistral.ai/v1/files")
        .header("Authorization", mistral_auth_header(api_key))
        .multipart(form)
        .send()
        .map_err(|e| format!("Upload Mistral OCR : {e}"))?;

    let upload_status = upload.status();
    let upload_body = upload
        .text()
        .map_err(|e| format!("Réponse upload Mistral : {e}"))?;
    if !upload_status.is_success() {
        return Err(format!(
            "Mistral upload HTTP {} — {}",
            upload_status.as_u16(),
            truncate_for_user(&upload_body, 200)
        ));
    }

    let uploaded: MistralFileUploadResponse = serde_json::from_str(&upload_body)
        .map_err(|e| format!("Upload Mistral illisible : {e}"))?;

    let ocr_body = MistralOcrRequest {
        model: "mistral-ocr-latest".into(),
        document: MistralOcrDocument {
            doc_type: "file".into(),
            file_id: uploaded.id,
        },
    };

    let ocr = client
        .post("https://api.mistral.ai/v1/ocr")
        .header("Authorization", mistral_auth_header(api_key))
        .header("Content-Type", "application/json")
        .json(&ocr_body)
        .send()
        .map_err(|e| format!("OCR Mistral : {e}"))?;

    let ocr_status = ocr.status();
    let ocr_text = ocr
        .text()
        .map_err(|e| format!("Réponse OCR Mistral : {e}"))?;
    if !ocr_status.is_success() {
        return Err(format!(
            "Mistral OCR HTTP {} — {}",
            ocr_status.as_u16(),
            truncate_for_user(&ocr_text, 200)
        ));
    }

    let parsed: MistralOcrResponse = serde_json::from_str(&ocr_text)
        .map_err(|e| format!("OCR Mistral illisible : {e}"))?;

    let page_texts: Vec<String> = parsed
        .pages
        .iter()
        .map(|p| {
            p.markdown
                .as_deref()
                .or(p.text.as_deref())
                .unwrap_or("")
                .to_string()
        })
        .filter(|s| !s.is_empty())
        .collect();

    let first_page_text = page_texts
        .first()
        .map(|s| s.chars().take(5000).collect::<String>())
        .unwrap_or_default();
    let bulletin_text: String = page_texts
        .join("\n\n")
        .chars()
        .take(24000)
        .collect();

    if bulletin_text.len() < 80 {
        return Err(format!(
            "OCR vide ou trop court pour {file_name}. Vérifiez que le PDF est lisible."
        ));
    }

    Ok(OcrBulletinText {
        first_page_text,
        bulletin_text,
        ocr_pages: parsed.pages.len(),
    })
}

pub fn mistral_summarize_scpi_bulletin(
    api_key: &str,
    model: &str,
    file_name: &str,
    scpi_name: &str,
    ocr: &OcrBulletinText,
) -> Result<String, String> {
    let user = format!(
        "Fichier : {file_name}\nIndice nom fichier : {scpi_name}\nPages OCR : {}\n\n--- Descriptif 1re page (prioritaire pour \"Ce trimestre\") ---\n{}\n\n--- Texte complet bulletin (OCR) ---\n{}\n\nRedige le resume markdown pour les clients detenteurs de cette SCPI.",
        ocr.ocr_pages,
        if ocr.first_page_text.is_empty() {
            "(non extrait)".to_string()
        } else {
            ocr.first_page_text.clone()
        },
        ocr.bulletin_text
    );

    let body = MistralChatRequest {
        model: model.to_string(),
        temperature: 0.3,
        messages: vec![
            MistralMessage {
                role: "system".into(),
                content: SCPI_BULLETIN_SYSTEM_PROMPT.into(),
            },
            MistralMessage {
                role: "user".into(),
                content: user,
            },
        ],
    };

    let client = http_client()?;
    let response = client
        .post("https://api.mistral.ai/v1/chat/completions")
        .header("Authorization", mistral_auth_header(api_key))
        .header("Content-Type", "application/json")
        .json(&body)
        .send()
        .map_err(|e| format!("Résumé Mistral : {e}"))?;

    let status = response.status();
    let text = response
        .text()
        .map_err(|e| format!("Réponse résumé Mistral : {e}"))?;
    if !status.is_success() {
        let hint = if status.as_u16() == 401 {
            "Clé API Mistral invalide (Newsletter → Paramètres)."
        } else {
            "Vérifiez votre connexion et la clé API."
        };
        return Err(format!(
            "Mistral HTTP {} — {} ({})",
            status.as_u16(),
            truncate_for_user(&text, 200),
            hint
        ));
    }

    let parsed: MistralChatResponse = serde_json::from_str(&text)
        .map_err(|e| format!("Résumé Mistral illisible : {e}"))?;

    parsed
        .choices
        .first()
        .map(|c| c.message.content.trim().to_string())
        .filter(|c| !c.is_empty())
        .ok_or_else(|| "Mistral n'a renvoyé aucun résumé.".into())
}

#[cfg(test)]
mod tests {
    use super::SCPI_BULLETIN_SYSTEM_PROMPT;

    #[test]
    fn prompt_requires_three_kpi_and_complete_acquisitions() {
        let p = SCPI_BULLETIN_SYSTEM_PROMPT;
        assert!(p.contains("EXACTEMENT 3 puces"));
        assert!(p.contains("Collecte nette"));
        assert!(p.contains("Capitalisation"));
        assert!(p.contains("Distribution"));
        assert!(p.contains("brut ou net"));
        assert!(p.contains("convertir un nombre de parts en M€"));
        assert!(p.contains("non communiquee en €"));
        assert!(p.contains("sous-montant"));
        assert!(p.contains("pas de TOF, endettement"));
        assert!(!p.contains("taux d'occupation financier ASPIM"));
        assert!(p.contains("toutes les villes du tableau"));
        assert!(p.contains("extension d'un actif deja detenu"));
        assert!(p.contains("pas de m² ni de prix"));
        assert!(p.contains("titre OBLIGATOIRE"));
        assert!(!p.contains("Acquisitions (uniquement"));
    }
}
