use reqwest::blocking::Client;
use serde::{Deserialize, Serialize};
use std::time::Duration;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum LlmProvider {
    Mistral,
    OpenAi,
    Anthropic,
    Google,
}

impl LlmProvider {
    pub fn parse(value: &str) -> Self {
        match value.trim().to_lowercase().as_str() {
            "openai" | "gpt" => Self::OpenAi,
            "anthropic" | "claude" => Self::Anthropic,
            "google" | "gemini" => Self::Google,
            _ => Self::Mistral,
        }
    }

    pub fn as_id(self) -> &'static str {
        match self {
            Self::Mistral => "mistral",
            Self::OpenAi => "openai",
            Self::Anthropic => "anthropic",
            Self::Google => "google",
        }
    }

    pub fn label(self) -> &'static str {
        match self {
            Self::Mistral => "Mistral",
            Self::OpenAi => "OpenAI (GPT)",
            Self::Anthropic => "Anthropic (Claude)",
            Self::Google => "Google (Gemini)",
        }
    }

    pub fn default_model(self) -> &'static str {
        match self {
            Self::Mistral => "mistral-small-latest",
            Self::OpenAi => "gpt-5.4-mini",
            Self::Anthropic => "claude-sonnet-4-5",
            Self::Google => "gemini-3.6-flash",
        }
    }
}

pub fn call_chat_json(
    provider: LlmProvider,
    api_key: &str,
    model: &str,
    messages: Vec<(String, String)>,
    temperature: f32,
) -> Result<String, String> {
    if messages.is_empty() {
        return Err(format!("Aucun message pour {}.", provider.label()));
    }
    let key = api_key.trim();
    if key.is_empty() {
        return Err(format!(
            "Clé API {} non configurée (Newsletter → Paramètres).",
            provider.label()
        ));
    }
    let model = model.trim();
    let model = if model.is_empty() {
        provider.default_model()
    } else {
        model
    };

    match provider {
        LlmProvider::Mistral => call_openai_compatible_json(
            provider,
            "https://api.mistral.ai/v1/chat/completions",
            &format!("Bearer {key}"),
            None,
            model,
            messages,
            temperature,
        ),
        LlmProvider::OpenAi => call_openai_compatible_json(
            provider,
            "https://api.openai.com/v1/chat/completions",
            &format!("Bearer {key}"),
            None,
            model,
            messages,
            temperature,
        ),
        LlmProvider::Anthropic => call_anthropic_json(key, model, messages, temperature),
        LlmProvider::Google => call_gemini_json(key, model, messages, temperature),
    }
}

fn call_openai_compatible_json(
    provider: LlmProvider,
    url: &str,
    auth_header: &str,
    extra_header: Option<(&str, &str)>,
    model: &str,
    messages: Vec<(String, String)>,
    temperature: f32,
) -> Result<String, String> {
    #[derive(Serialize)]
    struct Message {
        role: String,
        content: String,
    }
    #[derive(Serialize)]
    struct ResponseFormat {
        #[serde(rename = "type")]
        format_type: String,
    }
    #[derive(Serialize)]
    struct Request {
        model: String,
        temperature: f32,
        messages: Vec<Message>,
        response_format: ResponseFormat,
    }
    #[derive(Deserialize)]
    struct ChoiceMessage {
        content: String,
    }
    #[derive(Deserialize)]
    struct Choice {
        message: ChoiceMessage,
    }
    #[derive(Deserialize)]
    struct Response {
        choices: Vec<Choice>,
    }

    let body = Request {
        model: model.to_string(),
        temperature,
        messages: messages
            .into_iter()
            .map(|(role, content)| Message { role, content })
            .collect(),
        response_format: ResponseFormat {
            format_type: "json_object".into(),
        },
    };

    let client = http_client()?;
    let mut req = client
        .post(url)
        .header("Authorization", auth_header)
        .header("Content-Type", "application/json");
    if let Some((name, value)) = extra_header {
        req = req.header(name, value);
    }
    let response = req
        .json(&body)
        .send()
        .map_err(|e| format!("Appel {} : {e}", provider.label()))?;
    let status = response.status();
    let text = response
        .text()
        .map_err(|e| format!("Lecture réponse {} : {e}", provider.label()))?;
    if !status.is_success() {
        return Err(format_http_error(provider, status.as_u16(), &text));
    }
    let parsed: Response = serde_json::from_str(&text)
        .map_err(|e| format!("Réponse {} illisible : {e}", provider.label()))?;
    extract_first_content(
        provider,
        parsed
            .choices
            .first()
            .map(|c| c.message.content.as_str()),
    )
}

fn call_anthropic_json(
    api_key: &str,
    model: &str,
    messages: Vec<(String, String)>,
    temperature: f32,
) -> Result<String, String> {
    let provider = LlmProvider::Anthropic;
    #[derive(Serialize)]
    struct Message {
        role: String,
        content: String,
    }
    #[derive(Serialize)]
    struct Request {
        model: String,
        max_tokens: u32,
        temperature: f32,
        system: String,
        messages: Vec<Message>,
    }
    #[derive(Deserialize)]
    struct ContentBlock {
        text: String,
    }
    #[derive(Deserialize)]
    struct Response {
        content: Vec<ContentBlock>,
    }

    let (system, chat_messages) = split_system_messages(messages);
    let body = Request {
        model: model.to_string(),
        max_tokens: 4096,
        temperature,
        system,
        messages: chat_messages
            .into_iter()
            .map(|(role, content)| Message { role, content })
            .collect(),
    };

    let client = http_client()?;
    let response = client
        .post("https://api.anthropic.com/v1/messages")
        .header("x-api-key", api_key)
        .header("anthropic-version", "2023-06-01")
        .header("Content-Type", "application/json")
        .json(&body)
        .send()
        .map_err(|e| format!("Appel {} : {e}", provider.label()))?;
    let status = response.status();
    let text = response
        .text()
        .map_err(|e| format!("Lecture réponse {} : {e}", provider.label()))?;
    if !status.is_success() {
        return Err(format_http_error(provider, status.as_u16(), &text));
    }
    let parsed: Response = serde_json::from_str(&text)
        .map_err(|e| format!("Réponse {} illisible : {e}", provider.label()))?;
    extract_first_content(
        provider,
        parsed.content.first().map(|c| c.text.as_str()),
    )
}

fn call_gemini_json(
    api_key: &str,
    model: &str,
    messages: Vec<(String, String)>,
    temperature: f32,
) -> Result<String, String> {
    let provider = LlmProvider::Google;
    #[derive(Serialize)]
    struct Part {
        text: String,
    }
    #[derive(Serialize)]
    struct Content {
        role: String,
        parts: Vec<Part>,
    }
    #[derive(Serialize)]
    struct SystemInstruction {
        parts: Vec<Part>,
    }
    #[derive(Serialize)]
    struct GenerationConfig {
        temperature: f32,
        response_mime_type: String,
    }
    #[derive(Serialize)]
    struct Request {
        #[serde(skip_serializing_if = "Option::is_none")]
        system_instruction: Option<SystemInstruction>,
        contents: Vec<Content>,
        generation_config: GenerationConfig,
    }
    #[derive(Deserialize)]
    struct ResponsePart {
        text: String,
    }
    #[derive(Deserialize)]
    struct ResponseContent {
        parts: Vec<ResponsePart>,
    }
    #[derive(Deserialize)]
    struct Candidate {
        content: ResponseContent,
    }
    #[derive(Deserialize)]
    struct Response {
        candidates: Vec<Candidate>,
    }

    let (system, chat_messages) = split_system_messages(messages);
    let contents = chat_messages
        .into_iter()
        .map(|(role, content)| Content {
            role: if role == "assistant" {
                "model".into()
            } else {
                "user".into()
            },
            parts: vec![Part { text: content }],
        })
        .collect();
    let body = Request {
        system_instruction: (!system.is_empty()).then(|| SystemInstruction {
            parts: vec![Part { text: system }],
        }),
        contents,
        generation_config: GenerationConfig {
            temperature,
            response_mime_type: "application/json".into(),
        },
    };

    let url = format!(
        "https://generativelanguage.googleapis.com/v1beta/models/{}:generateContent",
        model
    );
    let client = http_client()?;
    let response = client
        .post(url)
        .header("Content-Type", "application/json")
        .header("x-goog-api-key", api_key)
        .json(&body)
        .send()
        .map_err(|e| format!("Appel {} : {e}", provider.label()))?;
    let status = response.status();
    let text = response
        .text()
        .map_err(|e| format!("Lecture réponse {} : {e}", provider.label()))?;
    if !status.is_success() {
        return Err(format_http_error(provider, status.as_u16(), &text));
    }
    let parsed: Response = serde_json::from_str(&text)
        .map_err(|e| format!("Réponse {} illisible : {e}", provider.label()))?;
    extract_first_content(
        provider,
        parsed
            .candidates
            .first()
            .and_then(|c| c.content.parts.first())
            .map(|p| p.text.as_str()),
    )
}

fn split_system_messages(messages: Vec<(String, String)>) -> (String, Vec<(String, String)>) {
    let mut system_parts = Vec::new();
    let mut chat = Vec::new();
    for (role, content) in messages {
        if role == "system" {
            system_parts.push(content);
        } else {
            chat.push((role, content));
        }
    }
    (system_parts.join("\n\n"), chat)
}

fn extract_first_content(provider: LlmProvider, content: Option<&str>) -> Result<String, String> {
    let text = content.unwrap_or("").trim();
    if text.is_empty() {
        return Err(format!("{} n'a renvoyé aucun contenu.", provider.label()));
    }
    Ok(text.to_string())
}

fn format_http_error(provider: LlmProvider, status: u16, text: &str) -> String {
    let hint = if status == 401 {
        format!(
            "Clé API {} invalide (Newsletter → Paramètres).",
            provider.label()
        )
    } else {
        "Vérifiez votre connexion et la clé API.".to_string()
    };
    format!(
        "{} HTTP {status} — {} ({hint})",
        provider.label(),
        truncate_for_user(text, 200)
    )
}

fn http_client() -> Result<Client, String> {
    Client::builder()
        .timeout(Duration::from_secs(120))
        .build()
        .map_err(|e| format!("Client HTTP : {e}"))
}

fn truncate_for_user(text: &str, max_bytes: usize) -> String {
    let t = text.trim();
    if t.len() <= max_bytes {
        return t.to_string();
    }
    let mut end = max_bytes;
    while end > 0 && !t.is_char_boundary(end) {
        end -= 1;
    }
    format!("{}…", &t[..end])
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn truncate_for_user_respects_utf8_char_boundaries() {
        let s = "é".repeat(120);
        let out = truncate_for_user(&s, 100);
        assert!(out.ends_with('…'));
        assert!(std::str::from_utf8(out.as_bytes()).is_ok());
    }

    #[test]
    fn parse_provider_aliases() {
        assert_eq!(LlmProvider::parse("mistral"), LlmProvider::Mistral);
        assert_eq!(LlmProvider::parse("openai"), LlmProvider::OpenAi);
        assert_eq!(LlmProvider::parse("gpt"), LlmProvider::OpenAi);
        assert_eq!(LlmProvider::parse("claude"), LlmProvider::Anthropic);
        assert_eq!(LlmProvider::parse("anthropic"), LlmProvider::Anthropic);
        assert_eq!(LlmProvider::parse("gemini"), LlmProvider::Google);
        assert_eq!(LlmProvider::parse("unknown"), LlmProvider::Mistral);
    }

    #[test]
    fn split_system_messages_groups_system_prompt() {
        let (system, chat) = split_system_messages(vec![
            ("system".into(), "Tu es CGP".into()),
            ("user".into(), "Bonjour".into()),
            ("assistant".into(), "OK".into()),
        ]);
        assert_eq!(system, "Tu es CGP");
        assert_eq!(chat.len(), 2);
    }
}
