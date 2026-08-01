use super::llm::{call_chat_json, LlmProvider};

pub const REFINE_NEWSLETTER_SYSTEM_PROMPT: &str = r#"Tu es un assistant d'édition de newsletter pour un CGP.
L'utilisateur te soumet une newsletter en JSON et te demande des modifications ciblées.

RÈGLES :
- Applique UNIQUEMENT ce qui est demandé ; conserve le reste tel quel sauf si la demande implique un ajustement global (ex. « raccourcir tout »).
- Réponds en JSON strict (sans markdown) avec exactement : subject, preheader, editionTitle, intro, sections [{title, body, highlight?}], cta
- Garde le ton défini dans le style du conseiller (professionnel, accessible, légère ironie si déjà présente)
- Conserve {{prenom}} dans l'intro si déjà utilisé
- Pas de signature (ajoutée automatiquement)
- sections : 2 ou 3 éléments maximum"#;

pub fn generate_newsletter_json(
    provider: LlmProvider,
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

    call_chat_json(
        provider,
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
    provider: LlmProvider,
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
            "{REFINE_NEWSLETTER_SYSTEM_PROMPT}\n\nStyle de référence du conseiller :\n{style_prompt}"
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

    call_chat_json(provider, api_key, model, messages, 0.65)
}
