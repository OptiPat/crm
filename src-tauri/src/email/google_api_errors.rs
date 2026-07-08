//! Messages d'erreur Google API (Gmail, Calendar, …) compréhensibles côté UI.

pub fn calendar_access_error(status: reqwest::StatusCode, body: &str) -> String {
    let lower = body.to_lowercase();
    if lower.contains("accessnotconfigured")
        || lower.contains("has not been used in project")
        || lower.contains("it is disabled")
        || lower.contains("calendar-json.googleapis.com")
    {
        return "Google Calendar API désactivée dans le projet Google Cloud du Client ID OAuth. \
                Activez « Google Calendar API » dans Google Cloud Console → APIs & Services → Library \
                (même projet que le Client ID CRM), puis réessayez."
            .into();
    }
    if lower.contains("insufficient")
        || lower.contains("insufficientpermissions")
        || status == reqwest::StatusCode::FORBIDDEN
    {
        return "Accès Agenda refusé pour ce token OAuth. Paramètres → Emails & envois → Connexion → « Reconnecter Google » \
                (cochez bien Google Agenda), ou supprimez l'accès CRM dans \
                https://myaccount.google.com/permissions puis reconnectez."
            .into();
    }
    if status == reqwest::StatusCode::UNAUTHORIZED {
        return "Session Google expirée. Paramètres → Emails & envois → Connexion → Reconnecter Google.".into();
    }
    let snippet: String = body.chars().take(280).collect();
    format!(
        "Google Agenda ({}) : {}",
        status.as_u16(),
        if snippet.is_empty() {
            "erreur inconnue".into()
        } else {
            snippet
        }
    )
}

pub fn missing_calendar_scopes(scopes: &[&str]) -> Option<String> {
    let has_read = scopes.iter().any(|s| s.contains("calendar.readonly"));
    let has_events = scopes.iter().any(|s| s.contains("calendar.events"));
    if has_read || has_events {
        return None;
    }
    Some(
        "Le token OAuth actuel n'inclut pas Google Agenda. Paramètres → Emails & envois → Connexion → Reconnecter Google."
            .into(),
    )
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn detects_calendar_api_not_enabled() {
        let body = r#"{"error":{"code":403,"message":"Google Calendar API has not been used in project 123 before or it is disabled","errors":[{"reason":"accessNotConfigured"}]}}"#;
        let msg = calendar_access_error(reqwest::StatusCode::FORBIDDEN, body);
        assert!(msg.contains("Google Calendar API désactivée"));
    }

    #[test]
    fn detects_insufficient_scope() {
        let body = r#"{"error":{"errors":[{"reason":"insufficientPermissions"}]}}"#;
        let msg = calendar_access_error(reqwest::StatusCode::FORBIDDEN, body);
        assert!(msg.contains("Reconnecter Google"));
    }
}
