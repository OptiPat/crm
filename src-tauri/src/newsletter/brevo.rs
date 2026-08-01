use reqwest::blocking::Client;
use serde::{Deserialize, Serialize};
use serde_json::{json, Map, Value};
use std::collections::HashSet;
use std::time::Duration;

const BREVO_API_BASE: &str = "https://api.brevo.com/v3";
const CRM_FOLDER_NAME: &str = "Patrimoine CRM";

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BrevoTemplateSummary {
    pub id: i64,
    pub name: String,
    pub subject: String,
    pub is_active: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BrevoRecipient {
    pub email: String,
    pub prenom: String,
    pub nom: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PushBrevoCampaignInput {
    pub edition_id: i64,
    pub edition_label: String,
    pub subject: String,
    pub preheader: Option<String>,
    pub template_id: i64,
    pub sender_name: String,
    pub sender_email: String,
    pub recipients: Vec<BrevoRecipient>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PushBrevoCampaignResult {
    pub campaign_id: i64,
    pub list_id: i64,
    pub recipient_count: u32,
    pub prepared_recipient_count: u32,
    pub campaign_url: String,
    pub campaign_list_url: String,
    pub template_edit_url: String,
    pub campaign_name: String,
    pub sample_recipient_email: String,
    pub sample_recipient_firstname: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub record_warning: Option<String>,
}

/// Clés d'attributs contact réellement présentes sur le compte Brevo (GET /contacts/attributes).
#[derive(Debug, Clone)]
struct BrevoContactFieldKeys {
    firstname: String,
    lastname: String,
}

struct BrevoClient {
    client: Client,
    api_key: String,
}

impl BrevoClient {
    fn new(api_key: &str) -> Result<Self, String> {
        let trimmed = api_key.trim();
        if trimmed.is_empty() {
            return Err("Clé API Brevo non configurée (Newsletter → Paramètres).".into());
        }
        let client = Client::builder()
            .timeout(Duration::from_secs(120))
            .build()
            .map_err(|e| format!("Client HTTP Brevo: {}", e))?;
        Ok(Self {
            client,
            api_key: trimmed.to_string(),
        })
    }

    fn get(&self, path: &str) -> Result<Value, String> {
        self.request("GET", path, None)
    }

    fn post(&self, path: &str, body: Value) -> Result<Value, String> {
        self.request("POST", path, Some(body))
    }

    fn request(&self, method: &str, path: &str, body: Option<Value>) -> Result<Value, String> {
        let url = format!("{BREVO_API_BASE}{path}");
        let mut req = self
            .client
            .request(
                method
                    .parse()
                    .map_err(|_| format!("Méthode HTTP invalide: {method}"))?,
                &url,
            )
            .header("api-key", &self.api_key)
            .header("Content-Type", "application/json")
            .header("Accept", "application/json");

        if let Some(payload) = body {
            req = req.json(&payload);
        }

        let response = req.send().map_err(|e| format!("Appel Brevo: {}", e))?;
        let status = response.status();
        let text = response
            .text()
            .map_err(|e| format!("Lecture réponse Brevo: {}", e))?;

        if status == reqwest::StatusCode::NO_CONTENT || text.trim().is_empty() {
            return Ok(Value::Null);
        }

        let value: Value = serde_json::from_str(&text).unwrap_or_else(|_| json!({ "raw": text }));

        if !status.is_success() {
            let hint = match status.as_u16() {
                401 => "Clé API Brevo invalide (Newsletter → Paramètres).",
                402 => "Crédits Brevo insuffisants ou plan limité.",
                404 => "Ressource Brevo introuvable (template ou liste).",
                _ => "Vérifiez la clé API, le domaine expéditeur et le template Brevo.",
            };
            let message = value
                .get("message")
                .and_then(|v| v.as_str())
                .unwrap_or(&text);
            return Err(format!(
                "Brevo HTTP {} — {} ({})",
                status.as_u16(),
                truncate(message, 240),
                hint
            ));
        }

        Ok(value)
    }
}

pub fn list_brevo_templates(api_key: &str) -> Result<Vec<BrevoTemplateSummary>, String> {
    let client = BrevoClient::new(api_key)?;
    let response = client.get("/smtp/templates?limit=100&sort=desc")?;
    parse_smtp_templates_response(response)
}

fn parse_smtp_templates_response(response: Value) -> Result<Vec<BrevoTemplateSummary>, String> {
    let templates = response
        .get("templates")
        .and_then(|v| v.as_array())
        .cloned()
        .unwrap_or_default();

    let mut out = Vec::new();
    for item in templates {
        let id = item.get("id").and_then(|v| v.as_i64());
        let name = item.get("name").and_then(|v| v.as_str()).unwrap_or("").trim();
        if id.is_none() || name.is_empty() {
            continue;
        }
        out.push(BrevoTemplateSummary {
            id: id.unwrap_or(0),
            name: name.to_string(),
            subject: item
                .get("subject")
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .trim()
                .to_string(),
            is_active: item
                .get("isActive")
                .and_then(|v| v.as_bool())
                .unwrap_or(true),
        });
    }
    Ok(out)
}

/// Vérifie la clé API (compte) — utile pour diagnostiquer 401/403.
pub fn test_brevo_api_key(api_key: &str) -> Result<String, String> {
    let client = BrevoClient::new(api_key)?;
    let account = client.get("/account")?;
    let email = account
        .get("email")
        .and_then(|v| v.as_str())
        .unwrap_or("compte Brevo");
    let _templates = list_brevo_templates(api_key)?;
    Ok(format!("Connexion OK — {email}"))
}

pub fn push_newsletter_campaign(
    api_key: &str,
    input: PushBrevoCampaignInput,
) -> Result<PushBrevoCampaignResult, String> {
    if input.recipients.is_empty() {
        return Err("Aucun destinataire à envoyer vers Brevo.".into());
    }
    if input.template_id <= 0 {
        return Err("Sélectionnez un template Brevo.".into());
    }
    if input.sender_email.trim().is_empty() {
        return Err("Renseignez l'email expéditeur Brevo (Newsletter → Paramètres).".into());
    }
    if input.sender_name.trim().is_empty() {
        return Err("Renseignez le nom expéditeur Brevo (Newsletter → Paramètres).".into());
    }

    let client = BrevoClient::new(api_key)?;
    let contact_fields = resolve_contact_field_keys(&client)?;
    let folder_id = ensure_crm_folder(&client)?;
    let label = sanitize_list_name(&input.edition_label);
    let list_name = format!("CRM — {label} (#{})", input.edition_id);
    let list_id = create_contact_list(&client, &list_name, folder_id)?;
    upsert_contacts_on_list(&client, list_id, &input.recipients, &contact_fields)?;

    let template_html = fetch_smtp_template_html(&client, input.template_id)?;

    let campaign_name = format!("CRM — {label} (#{})", input.edition_id);
    let campaign_id = create_campaign_draft(
        &client,
        &campaign_name,
        input.subject.trim(),
        input.preheader.as_deref(),
        input.template_id,
        &input.sender_name,
        input.sender_email.trim(),
        list_id,
        &contact_fields,
    )?;

    let sample_recipient = input
        .recipients
        .iter()
        .find(|r| !r.email.trim().is_empty())
        .ok_or_else(|| "Aucun destinataire à envoyer vers Brevo.".to_string())?;
    let sample_recipient_email = sample_recipient.email.trim().to_string();
    let sample_recipient_firstname =
        contact_firstname_for_brevo(&sample_recipient.prenom, &sample_recipient.nom);

    Ok(PushBrevoCampaignResult {
        campaign_id,
        list_id,
        recipient_count: input.recipients.len() as u32,
        prepared_recipient_count: 0,
        campaign_url: brevo_campaign_list_url().to_string(),
        campaign_list_url: brevo_campaign_list_url().to_string(),
        template_edit_url: brevo_template_edit_url(input.template_id, &template_html),
        campaign_name: campaign_name.clone(),
        sample_recipient_email,
        sample_recipient_firstname,
        record_warning: None,
    })
}

fn ensure_crm_folder(client: &BrevoClient) -> Result<i64, String> {
    let response = client.get("/contacts/folders?limit=50&offset=0&sort=desc")?;
    if let Some(folders) = response.get("folders").and_then(|v| v.as_array()) {
        for folder in folders {
            let name = folder.get("name").and_then(|v| v.as_str()).unwrap_or("");
            if name.eq_ignore_ascii_case(CRM_FOLDER_NAME) {
                if let Some(id) = folder.get("id").and_then(|v| v.as_i64()) {
                    return Ok(id);
                }
            }
        }
    }

    let created = client.post("/contacts/folders", json!({ "name": CRM_FOLDER_NAME }))?;
    created
        .get("id")
        .and_then(|v| v.as_i64())
        .ok_or_else(|| "Brevo n'a pas renvoyé l'identifiant du dossier contacts.".into())
}

fn create_contact_list(client: &BrevoClient, name: &str, folder_id: i64) -> Result<i64, String> {
    let created = client.post(
        "/contacts/lists",
        json!({
            "name": name,
            "folderId": folder_id,
        }),
    )?;
    created
        .get("id")
        .and_then(|v| v.as_i64())
        .ok_or_else(|| "Brevo n'a pas renvoyé l'identifiant de la liste.".into())
}

fn upsert_contacts_on_list(
    client: &BrevoClient,
    list_id: i64,
    recipients: &[BrevoRecipient],
    contact_fields: &BrevoContactFieldKeys,
) -> Result<(), String> {
    let mut imported = 0u32;
    for recipient in recipients {
        let email = recipient.email.trim();
        if email.is_empty() {
            continue;
        }
        let firstname = contact_firstname_for_brevo(&recipient.prenom, &recipient.nom);
        let lastname = recipient.nom.trim();
        let attributes = contact_attributes_json(contact_fields, &firstname, lastname);
        client
            .post(
                "/contacts",
                json!({
                    "email": email,
                    "attributes": attributes,
                    "listIds": [list_id],
                    "updateEnabled": true,
                }),
            )
            .map_err(|e| format!("Contact {email} : {e}"))?;
        imported += 1;
    }
    if imported == 0 {
        return Err("Aucun email valide à importer vers Brevo.".into());
    }

    if let Some(first) = recipients.iter().find(|r| !r.email.trim().is_empty()) {
        let expected = contact_firstname_for_brevo(&first.prenom, &first.nom);
        if !expected.is_empty() {
            verify_contact_has_firstname(
                client,
                first.email.trim(),
                &expected,
                contact_fields,
            )?;
        }
    }

    Ok(())
}

fn resolve_contact_field_keys(client: &BrevoClient) -> Result<BrevoContactFieldKeys, String> {
    let names = fetch_contact_attribute_names(client)?;
    let firstname = pick_firstname_attribute(&names).ok_or_else(|| {
        format!(
            "Aucun attribut prénom sur Brevo (attendu FIRSTNAME, FIRST_NAME, FNAME ou PRENOM). Attributs trouvés : {}. Créez-les dans Brevo → Paramètres → Contacts → Attributs contact.",
            summarize_attribute_names(&names)
        )
    })?;
    let lastname = pick_lastname_attribute(&names).ok_or_else(|| {
        format!(
            "Aucun attribut nom sur Brevo (attendu LASTNAME, LAST_NAME, LNAME ou NOM). Attributs trouvés : {}.",
            summarize_attribute_names(&names)
        )
    })?;
    Ok(BrevoContactFieldKeys {
        firstname,
        lastname,
    })
}

fn fetch_contact_attribute_names(client: &BrevoClient) -> Result<HashSet<String>, String> {
    let response = client.get("/contacts/attributes")?;
    let mut names = HashSet::new();
    if let Some(items) = response.get("attributes").and_then(|v| v.as_array()) {
        for item in items {
            if let Some(name) = item.get("name").and_then(|v| v.as_str()) {
                let trimmed = name.trim();
                if !trimmed.is_empty() {
                    names.insert(trimmed.to_uppercase());
                }
            }
        }
    }
    Ok(names)
}

fn pick_firstname_attribute(names: &HashSet<String>) -> Option<String> {
    for candidate in ["FIRSTNAME", "FIRST_NAME", "FNAME", "PRENOM"] {
        if names.contains(candidate) {
            return Some(candidate.to_string());
        }
    }
    None
}

fn pick_lastname_attribute(names: &HashSet<String>) -> Option<String> {
    for candidate in ["LASTNAME", "LAST_NAME", "LNAME", "NOM"] {
        if names.contains(candidate) {
            return Some(candidate.to_string());
        }
    }
    None
}

fn summarize_attribute_names(names: &HashSet<String>) -> String {
    let mut list: Vec<&String> = names.iter().collect();
    list.sort();
    if list.is_empty() {
        return "(aucun)".to_string();
    }
    list.iter()
        .take(12)
        .map(|s| s.as_str())
        .collect::<Vec<_>>()
        .join(", ")
}

fn contact_attributes_json(
    contact_fields: &BrevoContactFieldKeys,
    firstname: &str,
    lastname: &str,
) -> Value {
    let mut attrs = Map::new();
    if !firstname.is_empty() {
        attrs.insert(
            contact_fields.firstname.clone(),
            Value::String(firstname.to_string()),
        );
    }
    if !lastname.is_empty() {
        attrs.insert(
            contact_fields.lastname.clone(),
            Value::String(lastname.to_string()),
        );
    }
    Value::Object(attrs)
}

fn verify_contact_has_firstname(
    client: &BrevoClient,
    email: &str,
    expected: &str,
    contact_fields: &BrevoContactFieldKeys,
) -> Result<(), String> {
    let contact = client.get(&format!("/contacts/{}", encode_path_segment(email)))?;
    let attrs = contact.get("attributes").and_then(|v| v.as_object());
    let stored = attrs
        .and_then(|a| {
            a.get(&contact_fields.firstname)
                .or_else(|| a.get("FIRSTNAME"))
                .or_else(|| a.get("FIRST_NAME"))
                .or_else(|| a.get("FNAME"))
                .or_else(|| a.get("PRENOM"))
                .and_then(|v| v.as_str())
        })
        .unwrap_or("")
        .trim();
    if stored.is_empty() {
        return Err(format!(
            "Brevo n'a pas enregistré le prénom « {expected} » pour {email}. Attributs utilisés : {} / {}. Vérifiez Brevo → Contacts → Paramètres → Attributs contact.",
            contact_fields.firstname, contact_fields.lastname
        ));
    }
    Ok(())
}

fn contact_firstname_for_brevo(prenom: &str, nom: &str) -> String {
    let prenom = prenom.trim();
    if !prenom.is_empty() {
        return prenom.to_string();
    }
    let nom = nom.trim();
    if nom.is_empty() {
        return String::new();
    }
    nom.to_string()
}

fn encode_path_segment(value: &str) -> String {
    value
        .chars()
        .map(|c| match c {
            'A'..='Z' | 'a'..='z' | '0'..='9' | '-' | '_' | '.' | '~' => c.to_string(),
            _ => format!("%{:02X}", c as u32),
        })
        .collect()
}

fn fetch_smtp_template_html(client: &BrevoClient, template_id: i64) -> Result<String, String> {
    let response = client
        .get(&format!("/smtp/templates/{template_id}"))
        .map_err(|e| format!("Lecture template Brevo #{template_id} : {e}"))?;
    response
        .get("htmlContent")
        .and_then(|v| v.as_str())
        .map(|s| s.trim().to_string())
        .filter(|s| s.len() > 10)
        .ok_or_else(|| {
            format!(
                "Template Brevo #{template_id} introuvable ou sans HTML — créez-le dans Transactionnel → Templates (actif), puis utilisez son ID."
            )
        })
}

fn create_campaign_draft(
    client: &BrevoClient,
    name: &str,
    subject: &str,
    preheader: Option<&str>,
    template_id: i64,
    sender_name: &str,
    sender_email: &str,
    list_id: i64,
    contact_fields: &BrevoContactFieldKeys,
) -> Result<i64, String> {
    let to_field = format!(
        "{{{{ contact.{} }}}} {{{{ contact.{} }}}}",
        contact_fields.firstname, contact_fields.lastname
    );
    let mut create_body = json!({
        "name": name,
        "subject": subject,
        "sender": {
            "name": sender_name.trim(),
            "email": sender_email.trim(),
        },
        "templateId": template_id,
        "toField": to_field,
        "recipients": {
            "listIds": [list_id],
        },
    });
    if let Some(preheader) = preheader.filter(|s| !s.trim().is_empty()) {
        if let Some(obj) = create_body.as_object_mut() {
            obj.insert("previewText".to_string(), Value::String(preheader.trim().to_string()));
        }
    }

    let created = client
        .post("/emailCampaigns", create_body)
        .map_err(|e| format!("Création campagne Brevo : {e}"))?;
    created
        .get("id")
        .and_then(|v| v.as_i64())
        .ok_or_else(|| "Brevo n'a pas renvoyé l'identifiant de la campagne.".to_string())
}

fn sanitize_list_name(value: &str) -> String {
    let trimmed = value.trim();
    if trimmed.is_empty() {
        return "Newsletter".to_string();
    }
    trimmed
        .chars()
        .map(|c| if c.is_control() { ' ' } else { c })
        .collect::<String>()
        .split_whitespace()
        .collect::<Vec<_>>()
        .join(" ")
}

fn brevo_campaign_list_url() -> &'static str {
    "https://app.brevo.com/campaigns/listing/email"
}

/// URL d'édition du template transactionnel (SMTP). Dépend du type d'éditeur Brevo.
fn brevo_template_edit_url(template_id: i64, html: &str) -> String {
    if html.contains("nl2go") {
        return format!("https://app.brevo.com/editor/newsletters/{template_id}");
    }
    format!("https://app.brevo.com/editor/classic/html/{template_id}")
}

fn truncate(value: &str, max_bytes: usize) -> String {
    if value.len() <= max_bytes {
        return value.to_string();
    }
    let mut end = max_bytes;
    while end > 0 && !value.is_char_boundary(end) {
        end -= 1;
    }
    format!("{}…", &value[..end])
}

#[cfg(test)]
mod tests {
    use super::*;

    fn names_of(values: &[&str]) -> HashSet<String> {
        values.iter().map(|s| s.to_string()).collect()
    }

    #[test]
    fn contact_firstname_prefers_prenom_then_nom() {
        assert_eq!(contact_firstname_for_brevo("Jean", "DUPONT"), "Jean");
        assert_eq!(contact_firstname_for_brevo("", "DUPONT"), "DUPONT");
        assert_eq!(contact_firstname_for_brevo("", ""), "");
    }

    #[test]
    fn pick_firstname_attribute_prefers_standard_keys() {
        assert_eq!(
            pick_firstname_attribute(&names_of(&["PRENOM", "FIRSTNAME"])),
            Some("FIRSTNAME".to_string())
        );
        assert_eq!(
            pick_firstname_attribute(&names_of(&["FIRST_NAME", "FNAME"])),
            Some("FIRST_NAME".to_string())
        );
        assert_eq!(
            pick_firstname_attribute(&names_of(&["EMAIL", "SMS"])),
            None
        );
    }

    #[test]
    fn contact_attributes_json_uses_resolved_keys_only() {
        let fields = BrevoContactFieldKeys {
            firstname: "FIRST_NAME".to_string(),
            lastname: "LAST_NAME".to_string(),
        };
        let value = contact_attributes_json(&fields, "Pauline", "Dupont");
        let obj = value.as_object().expect("object");
        assert_eq!(obj.get("FIRST_NAME").and_then(|v| v.as_str()), Some("Pauline"));
        assert_eq!(obj.get("LAST_NAME").and_then(|v| v.as_str()), Some("Dupont"));
        assert!(!obj.contains_key("FNAME"));
        assert!(!obj.contains_key("FIRSTNAME"));
    }

    #[test]
    fn brevo_campaign_list_url_points_to_email_campaigns() {
        assert_eq!(
            brevo_campaign_list_url(),
            "https://app.brevo.com/campaigns/listing/email"
        );
    }

    #[test]
    fn brevo_template_edit_url_uses_newsletters_editor_for_nl2go() {
        assert_eq!(
            brevo_template_edit_url(42, r#"<td class="nl2go-default-textstyle">"#),
            "https://app.brevo.com/editor/newsletters/42"
        );
    }

    #[test]
    fn brevo_template_edit_url_uses_classic_html_otherwise() {
        assert_eq!(
            brevo_template_edit_url(42, "<p>Bonjour</p>"),
            "https://app.brevo.com/editor/classic/html/42"
        );
    }

    #[test]
    fn truncate_respects_utf8_char_boundaries() {
        let accented = "échec de connexion à l'API Brevo";
        let truncated = truncate(accented, 10);
        assert!(truncated.ends_with('…'));
        assert!(std::str::from_utf8(truncated.as_bytes()).is_ok());
        assert!(truncated.len() <= 14);
    }
}
