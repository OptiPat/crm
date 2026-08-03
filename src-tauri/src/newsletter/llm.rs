use reqwest::blocking::Client;
use serde::{Deserialize, Serialize};
use std::thread;
use std::time::Duration;

const LLM_MAX_ATTEMPTS: u32 = 3;
const LLM_RETRY_BASE_DELAY_MS: u64 = 2_000;
const ANTHROPIC_MAX_OUTPUT_TOKENS: u32 = 16_384;

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
    call_chat(provider, api_key, model, messages, temperature, true)
}

pub fn call_chat_markdown(
    provider: LlmProvider,
    api_key: &str,
    model: &str,
    messages: Vec<(String, String)>,
    temperature: f32,
) -> Result<String, String> {
    call_chat(provider, api_key, model, messages, temperature, false)
}

fn call_chat(
    provider: LlmProvider,
    api_key: &str,
    model: &str,
    messages: Vec<(String, String)>,
    temperature: f32,
    json_mode: bool,
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
        LlmProvider::Mistral => call_openai_compatible_chat(
            provider,
            "https://api.mistral.ai/v1/chat/completions",
            &format!("Bearer {key}"),
            None,
            model,
            messages,
            temperature,
            json_mode,
        ),
        LlmProvider::OpenAi => call_openai_compatible_chat(
            provider,
            "https://api.openai.com/v1/chat/completions",
            &format!("Bearer {key}"),
            None,
            model,
            messages,
            temperature,
            json_mode,
        ),
        LlmProvider::Anthropic => {
            if json_mode {
                call_anthropic_json(key, model, messages, temperature)
            } else {
                call_anthropic_markdown(key, model, messages, temperature)
            }
        }
        LlmProvider::Google => {
            if json_mode {
                call_gemini_json(key, model, messages, temperature)
            } else {
                call_gemini_markdown(key, model, messages, temperature)
            }
        }
    }
}

fn call_openai_compatible_chat(
    provider: LlmProvider,
    url: &str,
    auth_header: &str,
    extra_header: Option<(&str, &str)>,
    model: &str,
    messages: Vec<(String, String)>,
    temperature: f32,
    json_mode: bool,
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
        #[serde(skip_serializing_if = "Option::is_none")]
        response_format: Option<ResponseFormat>,
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
        response_format: json_mode.then(|| ResponseFormat {
            format_type: "json_object".into(),
        }),
    };

    let client = http_client()?;
    let body_json = serde_json::to_string(&body)
        .map_err(|e| format!("Corps requête {} : {e}", provider.label()))?;

    for attempt in 0..LLM_MAX_ATTEMPTS {
        let mut req = client
            .post(url)
            .header("Authorization", auth_header)
            .header("Content-Type", "application/json");
        if let Some((name, value)) = extra_header {
            req = req.header(name, value);
        }
        let response = req
            .body(body_json.clone())
            .send()
            .map_err(|e| format!("Appel {} : {e}", provider.label()))?;
        let status = response.status();
        let text = response
            .text()
            .map_err(|e| format!("Lecture réponse {} : {e}", provider.label()))?;
        if !status.is_success() {
            if is_retryable_llm_status(status.as_u16()) && attempt + 1 < LLM_MAX_ATTEMPTS {
                llm_retry_delay(attempt);
                continue;
            }
            return Err(format_http_error(provider, status.as_u16(), &text));
        }
        let parsed: Response = serde_json::from_str(&text)
            .map_err(|e| format!("Réponse {} illisible : {e}", provider.label()))?;
        return extract_first_content(
            provider,
            parsed
                .choices
                .first()
                .map(|c| c.message.content.as_str()),
        );
    }

    Err(format!(
        "{} : échec après {LLM_MAX_ATTEMPTS} tentatives.",
        provider.label()
    ))
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
        max_tokens: ANTHROPIC_MAX_OUTPUT_TOKENS,
        temperature,
        system,
        messages: chat_messages
            .into_iter()
            .map(|(role, content)| Message { role, content })
            .collect(),
    };

    let client = http_client()?;
    let body_json = serde_json::to_string(&body)
        .map_err(|e| format!("Corps requête {} : {e}", provider.label()))?;

    for attempt in 0..LLM_MAX_ATTEMPTS {
        let response = client
            .post("https://api.anthropic.com/v1/messages")
            .header("x-api-key", api_key)
            .header("anthropic-version", "2023-06-01")
            .header("Content-Type", "application/json")
            .body(body_json.clone())
            .send()
            .map_err(|e| format!("Appel {} : {e}", provider.label()))?;
        let status = response.status();
        let text = response
            .text()
            .map_err(|e| format!("Lecture réponse {} : {e}", provider.label()))?;
        if !status.is_success() {
            if is_retryable_llm_status(status.as_u16()) && attempt + 1 < LLM_MAX_ATTEMPTS {
                llm_retry_delay(attempt);
                continue;
            }
            return Err(format_http_error(provider, status.as_u16(), &text));
        }
        let parsed: Response = serde_json::from_str(&text)
            .map_err(|e| format!("Réponse {} illisible : {e}", provider.label()))?;
        return extract_first_content(
            provider,
            parsed.content.first().map(|c| c.text.as_str()),
        );
    }

    Err(format!(
        "{} : échec après {LLM_MAX_ATTEMPTS} tentatives.",
        provider.label()
    ))
}

fn call_anthropic_markdown(
    api_key: &str,
    model: &str,
    messages: Vec<(String, String)>,
    temperature: f32,
) -> Result<String, String> {
    call_anthropic_json(api_key, model, messages, temperature)
}

fn call_gemini_markdown(
    api_key: &str,
    model: &str,
    messages: Vec<(String, String)>,
    temperature: f32,
) -> Result<String, String> {
    call_gemini_chat(api_key, model, messages, temperature, false)
}

fn call_gemini_json(
    api_key: &str,
    model: &str,
    messages: Vec<(String, String)>,
    temperature: f32,
) -> Result<String, String> {
    call_gemini_chat(api_key, model, messages, temperature, true)
}

fn call_gemini_chat(
    api_key: &str,
    model: &str,
    messages: Vec<(String, String)>,
    temperature: f32,
    json_mode: bool,
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
        #[serde(skip_serializing_if = "Option::is_none")]
        response_mime_type: Option<String>,
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
            response_mime_type: json_mode.then(|| "application/json".into()),
        },
    };

    let model = resolve_gemini_model(model);
    let url = format!(
        "https://generativelanguage.googleapis.com/v1beta/models/{}:generateContent",
        model
    );
    let client = http_client()?;
    let body_json = serde_json::to_string(&body)
        .map_err(|e| format!("Corps requête {} : {e}", provider.label()))?;

    for attempt in 0..LLM_MAX_ATTEMPTS {
        let response = client
            .post(&url)
            .header("Content-Type", "application/json")
            .header("x-goog-api-key", api_key)
            .body(body_json.clone())
            .send()
            .map_err(format_gemini_transport_error)?;
        let status = response.status();
        let text = response
            .text()
            .map_err(|e| format!("Lecture réponse {} : {e}", provider.label()))?;
        if !status.is_success() {
            if is_retryable_llm_status(status.as_u16()) && attempt + 1 < LLM_MAX_ATTEMPTS {
                llm_retry_delay(attempt);
                continue;
            }
            return Err(format_http_error(provider, status.as_u16(), &text));
        }
        let parsed: Response = serde_json::from_str(&text)
            .map_err(|e| format!("Réponse {} illisible : {e}", provider.label()))?;
        return extract_first_content(
            provider,
            parsed
                .candidates
                .first()
                .and_then(|c| c.content.parts.first())
                .map(|p| p.text.as_str()),
        );
    }

    Err(format!(
        "{} : échec après {LLM_MAX_ATTEMPTS} tentatives.",
        provider.label()
    ))
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

fn is_retryable_llm_status(status: u16) -> bool {
    matches!(status, 429 | 502 | 503 | 504)
}

fn llm_retry_delay(attempt: u32) {
    let factor = 1u64 << attempt.min(4);
    thread::sleep(Duration::from_millis(LLM_RETRY_BASE_DELAY_MS * factor));
}

fn format_http_error(provider: LlmProvider, status: u16, text: &str) -> String {
    let hint = http_error_hint(provider, status);
    let detail = truncate_for_user(text, 200);
    if detail.is_empty() {
        format!("{} HTTP {status} — {hint}", provider.label())
    } else {
        format!("{} HTTP {status} — {detail} ({hint})", provider.label())
    }
}

fn http_error_hint(provider: LlmProvider, status: u16) -> String {
    match status {
        401 => format!(
            "Clé API {} invalide — vérifiez Newsletter → Paramètres.",
            provider.label()
        ),
        429 => match provider {
            LlmProvider::Google => "Quota Gemini dépassé — attendez (souvent 1 min ou jusqu'à minuit PT), \
                vérifiez usage/facturation sur Google AI Studio, ou changez de fournisseur (Newsletter → Paramètres). \
                Rapport Coach : réduisez les favoris si le quota est serré."
                .to_string(),
            _ => format!(
                "Quota ou limite de requêtes {} dépassé — attendez puis réessayez, \
                ou changez de fournisseur (Newsletter → Paramètres).",
                provider.label()
            ),
        },
        402 | 403 => format!(
            "Accès {} refusé ou facturation requise — vérifiez le forfait et les droits de la clé API (Newsletter → Paramètres).",
            provider.label()
        ),
        502 | 503 | 504 => format!(
            "Service {} temporairement indisponible — réessayez dans quelques minutes.",
            provider.label()
        ),
        _ => "Vérifiez votre connexion, la clé API (Newsletter → Paramètres) et le message ci-dessus.".to_string(),
    }
}

fn http_client() -> Result<Client, String> {
    http_client_with_timeout(Duration::from_secs(300))
}

fn http_client_with_timeout(timeout: Duration) -> Result<Client, String> {
    Client::builder()
        .timeout(timeout)
        .build()
        .map_err(|e| format!("Client HTTP : {e}"))
}

fn resolve_gemini_model(model: &str) -> &str {
    let trimmed = model.trim();
    if trimmed.is_empty() {
        LlmProvider::Google.default_model()
    } else {
        trimmed
    }
}

fn format_gemini_transport_error(error: reqwest::Error) -> String {
    if error.is_timeout() {
        return "Appel Google (Gemini) : délai dépassé — le rapport Coach envoie beaucoup de données (20 fonds). Réessayez ou réduisez les favoris.".into();
    }
    if error.is_connect() {
        return "Appel Google (Gemini) : connexion impossible — vérifiez Internet/VPN/pare-feu. La clé API est probablement OK si la newsletter fonctionne.".into();
    }
    format!("Appel Google (Gemini) : {error}")
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
    fn is_retryable_llm_status_matches_overload_codes() {
        assert!(is_retryable_llm_status(503));
        assert!(is_retryable_llm_status(429));
        assert!(!is_retryable_llm_status(401));
    }

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
    fn resolve_gemini_model_uses_default_when_empty() {
        assert_eq!(resolve_gemini_model(""), "gemini-3.6-flash");
        assert_eq!(resolve_gemini_model("gemini-3.6-flash"), "gemini-3.6-flash");
    }

    #[test]
    fn http_error_hint_429_gemini_mentions_quota() {
        let hint = http_error_hint(LlmProvider::Google, 429);
        assert!(hint.contains("Quota Gemini"));
        assert!(hint.contains("Newsletter"));
        assert!(!hint.contains("connexion"));
    }

    #[test]
    fn http_error_hint_401_mentions_invalid_key() {
        let hint = http_error_hint(LlmProvider::Mistral, 401);
        assert!(hint.contains("invalide"));
    }

    #[test]
    fn format_http_error_includes_hint_for_429() {
        let msg = format_http_error(
            LlmProvider::Google,
            429,
            r#"{"error":{"code":429,"message":"quota"}}"#,
        );
        assert!(msg.contains("HTTP 429"));
        assert!(msg.contains("Quota Gemini"));
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
