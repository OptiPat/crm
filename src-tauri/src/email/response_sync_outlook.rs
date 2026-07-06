//! Détection des réponses campagne via Microsoft Graph (Outlook).

use super::response_sync::{email_matches, gmail_reply_has_thread_scope};
use crate::database::models::PendingCampaignResponseCheck;
use crate::newsletter::db::is_newsletter_unsubscribe_request;
use serde::Deserialize;

#[derive(Debug, Clone)]
pub struct OutlookReplyFound {
    pub message_id: String,
    pub body_text: String,
    pub subject: Option<String>,
}

#[derive(Debug, Deserialize)]
struct GraphMessageList {
    value: Vec<GraphMessage>,
    #[serde(rename = "@odata.nextLink", default)]
    next_link: Option<String>,
}

#[derive(Debug, Deserialize)]
struct GraphMessage {
    id: String,
    #[serde(rename = "conversationId", default)]
    conversation_id: Option<String>,
    #[serde(default)]
    subject: Option<String>,
    #[serde(rename = "bodyPreview", default)]
    body_preview: Option<String>,
    #[serde(rename = "receivedDateTime", default)]
    received_date_time: Option<String>,
    #[serde(rename = "sentDateTime", default)]
    sent_date_time: Option<String>,
    #[serde(default)]
    from: Option<GraphEmailAddressWrapper>,
    #[serde(default)]
    body: Option<GraphBody>,
}

#[derive(Debug, Deserialize)]
struct GraphEmailAddressWrapper {
    #[serde(rename = "emailAddress", default)]
    email_address: Option<GraphEmailAddress>,
}

#[derive(Debug, Deserialize)]
struct GraphEmailAddress {
    #[serde(default)]
    address: Option<String>,
}

#[derive(Debug, Deserialize)]
struct GraphBody {
    #[serde(rename = "contentType", default)]
    content_type: Option<String>,
    #[serde(default)]
    content: Option<String>,
}

fn parse_graph_datetime(s: &str) -> Option<i64> {
    chrono::DateTime::parse_from_rfc3339(s)
        .ok()
        .map(|dt| dt.timestamp())
}

fn message_datetime(msg: &GraphMessage) -> Option<i64> {
    msg.received_date_time
        .as_deref()
        .or(msg.sent_date_time.as_deref())
        .and_then(parse_graph_datetime)
}

fn from_address(msg: &GraphMessage) -> String {
    msg.from
        .as_ref()
        .and_then(|w| w.email_address.as_ref())
        .and_then(|a| a.address.as_ref())
        .map(|s| s.as_str())
        .unwrap_or("")
        .to_string()
}

fn is_reply_from_contact(from_header: &str, contact_email: &str) -> bool {
    email_matches(from_header, contact_email)
}

fn normalize_body_text(raw: &str, content_type: Option<&str>) -> String {
    let trimmed = raw.trim();
    if trimmed.is_empty() {
        return String::new();
    }
    let is_html = content_type
        .map(|t| t.eq_ignore_ascii_case("html"))
        .unwrap_or_else(|| {
            let t = trimmed.to_lowercase();
            t.starts_with('<') || t.contains("<html") || t.contains("<!doctype")
        });
    if is_html {
        super::signature_html::html_to_plain_email(trimmed)
    } else {
        trimmed.to_string()
    }
}

pub fn outlook_fetch_message_body_and_subject(
    client: &reqwest::blocking::Client,
    token: &str,
    message_id: &str,
) -> Result<(String, Option<String>), String> {
    let url = format!(
        "https://graph.microsoft.com/v1.0/me/messages/{message_id}?$select=subject,body,bodyPreview"
    );
    let res = client
        .get(&url)
        .bearer_auth(token)
        .send()
        .map_err(|e| e.to_string())?;
    if !res.status().is_success() {
        return Err(format!("Outlook message: {}", res.text().unwrap_or_default()));
    }
    let msg: GraphMessage = res.json().map_err(|e| e.to_string())?;
    let subject = msg.subject.filter(|s| !s.trim().is_empty());
    let body_text = if let Some(ref body) = msg.body {
        if let Some(ref content) = body.content {
            if !content.trim().is_empty() {
                normalize_body_text(content, body.content_type.as_deref())
            } else {
                msg.body_preview
                    .as_deref()
                    .map(|s| normalize_body_text(s, None))
                    .unwrap_or_default()
            }
        } else {
            msg.body_preview
                .as_deref()
                .map(|s| normalize_body_text(s, None))
                .unwrap_or_default()
        }
    } else {
        msg.body_preview
            .as_deref()
            .map(|s| normalize_body_text(s, None))
            .unwrap_or_default()
    };
    Ok((body_text, subject))
}

fn list_messages_by_conversation(
    client: &reqwest::blocking::Client,
    token: &str,
    conversation_id: &str,
) -> Result<Vec<GraphMessage>, String> {
    let filter = format!("conversationId eq '{}'", conversation_id.replace('\'', "''"));
    let res = client
        .get("https://graph.microsoft.com/v1.0/me/messages")
        .query(&[
            ("$filter", filter.as_str()),
            (
                "$select",
                "id,from,receivedDateTime,sentDateTime,conversationId",
            ),
            ("$top", "50"),
        ])
        .bearer_auth(token)
        .header("ConsistencyLevel", "eventual")
        .send()
        .map_err(|e| e.to_string())?;
    if !res.status().is_success() {
        return Ok(vec![]);
    }
    let list: GraphMessageList = res.json().map_err(|e| e.to_string())?;
    Ok(list.value)
}

fn fetch_message_conversation_id(
    client: &reqwest::blocking::Client,
    token: &str,
    message_id: &str,
) -> Result<Option<String>, String> {
    let url = format!(
        "https://graph.microsoft.com/v1.0/me/messages/{message_id}?$select=conversationId"
    );
    let res = client
        .get(&url)
        .bearer_auth(token)
        .send()
        .map_err(|e| e.to_string())?;
    if !res.status().is_success() {
        return Ok(None);
    }
    let msg: GraphMessage = res.json().map_err(|e| e.to_string())?;
    Ok(msg
        .conversation_id
        .filter(|s| !s.trim().is_empty()))
}

fn outlook_find_reply_in_conversation(
    client: &reqwest::blocking::Client,
    token: &str,
    item: &PendingCampaignResponseCheck,
    conversation_id: &str,
) -> Result<Option<String>, String> {
    let contact = item.contact_email.trim();
    if contact.is_empty() {
        return Ok(None);
    }
    for msg in list_messages_by_conversation(client, token, conversation_id)? {
        let after_sent = message_datetime(&msg)
            .map(|ts| ts > item.email_date_envoi)
            .unwrap_or(true);
        if after_sent && is_reply_from_contact(&from_address(&msg), contact) {
            return Ok(Some(msg.id));
        }
    }
    Ok(None)
}

fn search_messages_from_contact(
    client: &reqwest::blocking::Client,
    token: &str,
    contact_email: &str,
) -> Result<Vec<GraphMessage>, String> {
    let search = format!("from:{}", contact_email.trim());
    let res = client
        .get("https://graph.microsoft.com/v1.0/me/messages")
        .header("ConsistencyLevel", "eventual")
        .query(&[
            ("$search", search.as_str()),
            ("$top", "10"),
            ("$select", "id,from,receivedDateTime,sentDateTime"),
        ])
        .bearer_auth(token)
        .send()
        .map_err(|e| e.to_string())?;
    if !res.status().is_success() {
        return Ok(vec![]);
    }
    let list: GraphMessageList = res.json().map_err(|e| e.to_string())?;
    Ok(list.value)
}

fn outlook_find_reply_message_id(
    client: &reqwest::blocking::Client,
    token: &str,
    item: &PendingCampaignResponseCheck,
) -> Result<Option<String>, String> {
    let contact = item.contact_email.trim();
    if contact.is_empty() {
        return Ok(None);
    }

    if gmail_reply_has_thread_scope(item) {
        if let Some(ref conversation_id) = item
            .email_gmail_thread_id
            .as_ref()
            .filter(|s| !s.trim().is_empty())
        {
            return outlook_find_reply_in_conversation(client, token, item, conversation_id);
        }

        if let Some(ref message_id) = item
            .email_gmail_message_id
            .as_ref()
            .filter(|s| !s.trim().is_empty())
        {
            if let Some(conversation_id) =
                fetch_message_conversation_id(client, token, message_id)?
            {
                return outlook_find_reply_in_conversation(client, token, item, &conversation_id);
            }
            return Ok(None);
        }

        return Ok(None);
    }

    for msg in search_messages_from_contact(client, token, contact)? {
        let after_sent = message_datetime(&msg)
            .map(|ts| ts > item.email_date_envoi)
            .unwrap_or(true);
        if after_sent && is_reply_from_contact(&from_address(&msg), contact) {
            return Ok(Some(msg.id));
        }
    }
    Ok(None)
}

pub fn outlook_find_contact_reply(
    client: &reqwest::blocking::Client,
    token: &str,
    item: &PendingCampaignResponseCheck,
) -> Result<Option<OutlookReplyFound>, String> {
    let Some(message_id) = outlook_find_reply_message_id(client, token, item)? else {
        return Ok(None);
    };
    let (body_text, subject) =
        outlook_fetch_message_body_and_subject(client, token, &message_id)?;
    if body_text.trim().is_empty()
        && !is_newsletter_unsubscribe_request(subject.as_deref(), None)
    {
        return Ok(None);
    }
    Ok(Some(OutlookReplyFound {
        message_id,
        body_text,
        subject,
    }))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::database::models::PendingCampaignResponseCheck;

    #[test]
    fn outlook_reply_uses_same_thread_scope_fields() {
        let with_thread = PendingCampaignResponseCheck {
            contact_etiquette_id: 1,
            contact_email: "a@example.com".into(),
            email_date_envoi: 1_700_000_000,
            email_gmail_thread_id: Some("conv1".into()),
            email_gmail_message_id: None,
            queue_row_kind: "etiquette".into(),
        };
        assert!(gmail_reply_has_thread_scope(&with_thread));
    }

    #[test]
    fn normalize_html_body_to_plain() {
        let text = normalize_body_text("<p>Bonjour</p>", Some("html"));
        assert!(text.contains("Bonjour"));
    }
}
