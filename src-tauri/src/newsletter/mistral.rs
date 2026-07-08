use reqwest::blocking::Client;
use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize)]
struct MistralMessage {
    role: String,
    content: String,
}

#[derive(Debug, Serialize)]
struct MistralRequest {
    model: String,
    temperature: f32,
    messages: Vec<MistralMessage>,
    response_format: MistralResponseFormat,
}

#[derive(Debug, Serialize)]
struct MistralResponseFormat {
    #[serde(rename = "type")]
    format_type: String,
}

#[derive(Debug, Deserialize)]
struct MistralResponse {
    choices: Vec<MistralChoice>,
}

#[derive(Debug, Deserialize)]
struct MistralChoice {
    message: MistralChoiceMessage,
}

#[derive(Debug, Deserialize)]
struct MistralChoiceMessage {
    content: String,
}

pub const REFINE_NEWSLETTER_SYSTEM_PROMPT: &str = r#"Tu es un assistant d'édition de newsletter pour un CGP.
L'utilisateur te soumet une newsletter en JSON et te demande des modifications ciblées.

RÈGLES :
- Applique UNIQUEMENT ce qui est demandé ; conserve le reste tel quel sauf si la demande implique un ajustement global (ex. « raccourcir tout »).
- Réponds en JSON strict (sans markdown) avec exactement : subject, preheader, editionTitle, intro, sections [{title, body, highlight?}], cta
- Garde le ton défini dans le style du conseiller (professionnel, accessible, légère ironie si déjà présente)
- Conserve {{prenom}} dans l'intro si déjà utilisé
- Pas de signature (ajoutée automatiquement)
- sections : 2 ou 3 éléments maximum"#;

pub fn call_mistral_chat_json(
    api_key: &str,
    model: &str,
    messages: Vec<(String, String)>,
    temperature: f32,
) -> Result<String, String> {
    if messages.is_empty() {
        return Err("Aucun message pour Mistral.".into());
    }

    let body = MistralRequest {
        model: model.to_string(),
        temperature,
        messages: messages
            .into_iter()
            .map(|(role, content)| MistralMessage { role, content })
            .collect(),
        response_format: MistralResponseFormat {
            format_type: "json_object".into(),
        },
    };

    let client = Client::builder()
        .timeout(std::time::Duration::from_secs(120))
        .build()
        .map_err(|e| format!("Client HTTP: {}", e))?;

    let response = client
        .post("https://api.mistral.ai/v1/chat/completions")
        .header("Authorization", format!("Bearer {}", api_key.trim()))
        .header("Content-Type", "application/json")
        .json(&body)
        .send()
        .map_err(|e| format!("Appel Mistral: {}", e))?;

    let status = response.status();
    let text = response
        .text()
        .map_err(|e| format!("Lecture réponse Mistral: {}", e))?;

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

    let parsed: MistralResponse =
        serde_json::from_str(&text).map_err(|e| format!("Réponse Mistral illisible: {}", e))?;

    let content = parsed
        .choices
        .first()
        .map(|c| c.message.content.trim())
        .filter(|c| !c.is_empty())
        .ok_or("Mistral n'a renvoyé aucun contenu.")?;

    Ok(content.to_string())
}

pub fn generate_newsletter_json(
    api_key: &str,
    model: &str,
    system_prompt: &str,
    theme: &str,
    edition_instructions: Option<&str>,
) -> Result<String, String> {
    let theme = theme.trim();
    if theme.is_empty() {
        return Err("Indiquez un sujet ou thème pour la newsletter.".into());
    }

    let mut user_content = format!("Rédige une newsletter pour mes clients sur ce thème :\n\n{theme}");
    if let Some(extra) = edition_instructions.filter(|s| !s.trim().is_empty()) {
        user_content.push_str("\n\nInstructions pour cette édition :\n");
        user_content.push_str(extra.trim());
    }

    call_mistral_chat_json(
        api_key,
        model,
        vec![
            ("system".into(), system_prompt.to_string()),
            ("user".into(), user_content),
        ],
        0.8,
    )
}

pub fn refine_newsletter_json(
    api_key: &str,
    model: &str,
    style_prompt: &str,
    current_json: &str,
    user_message: &str,
    history: &[(String, String)],
) -> Result<String, String> {
    let user_message = user_message.trim();
    if user_message.is_empty() {
        return Err("Décrivez la modification souhaitée.".into());
    }

    let mut messages: Vec<(String, String)> = vec![(
        "system".into(),
        format!(
            "{REFINE_NEWSLETTER_SYSTEM_PROMPT}\n\nStyle de référence du conseiller :\n{}",
            style_prompt
        ),
    )];

    for (role, content) in history.iter().take(12) {
        let r = role.trim();
        if r == "user" || r == "assistant" {
            messages.push((r.to_string(), content.clone()));
        }
    }

    messages.push((
        "user".into(),
        format!(
            "Newsletter actuelle (JSON) :\n{current_json}\n\nDemande de modification :\n{user_message}"
        ),
    ));

    call_mistral_chat_json(api_key, model, messages, 0.65)
}

fn truncate_for_user(text: &str, max: usize) -> String {
    let t = text.trim();
    if t.len() <= max {
        return t.to_string();
    }
    format!("{}…", &t[..max])
}
