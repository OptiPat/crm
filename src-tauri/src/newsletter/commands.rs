use super::mistral::{generate_newsletter_json, refine_newsletter_json};
use super::store::{NewsletterSettingsInput, NewsletterSettingsPublic, NewsletterStore};
use crate::commands::DbState;
use crate::database::models::NewEtiquette;
use serde::{Deserialize, Serialize};
use std::time::{SystemTime, UNIX_EPOCH};
use tauri::{AppHandle, State};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GenerateNewsletterInput {
    pub theme: String,
    pub edition_instructions: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GeneratedNewsletterSection {
    pub title: String,
    pub body: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GeneratedNewsletterContent {
    pub subject: String,
    pub intro: String,
    pub sections: Vec<GeneratedNewsletterSection>,
    pub cta: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EnsureNewsletterEtiquetteResult {
    pub etiquette_id: i64,
    pub etiquette_nom: String,
    pub contact_count: u32,
    pub created: bool,
}

#[tauri::command]
pub fn get_newsletter_settings(app: AppHandle) -> Result<NewsletterSettingsPublic, String> {
    NewsletterStore::load(&app).map(|s| s.to_public())
}

#[tauri::command]
pub fn save_newsletter_settings(
    app: AppHandle,
    input: NewsletterSettingsInput,
) -> Result<NewsletterSettingsPublic, String> {
    let mut store = NewsletterStore::load(&app)?;
    if let Some(key) = input.api_key {
        let trimmed = key.trim();
        if trimmed.is_empty() {
            store.api_key = None;
        } else {
            store.api_key = Some(trimmed.to_string());
        }
    }
    if let Some(style) = input.style_prompt {
        let trimmed = style.trim();
        if !trimmed.is_empty() {
            store.style_prompt = trimmed.to_string();
        }
    }
    if let Some(model) = input.model {
        let trimmed = model.trim();
        if !trimmed.is_empty() {
            store.model = trimmed.to_string();
        }
    }
    if let Some(nom) = input.etiquette_nom {
        let trimmed = nom.trim();
        if !trimmed.is_empty() {
            store.etiquette_nom = trimmed.to_string();
        }
    }
    if let Some(delay) = input.send_delay_ms {
        store.send_delay_ms = delay.max(500);
    }
    store.save(&app)?;
    NewsletterStore::load(&app).map(|s| s.to_public())
}

#[tauri::command]
pub fn generate_newsletter_content(
    app: AppHandle,
    input: GenerateNewsletterInput,
) -> Result<GeneratedNewsletterContent, String> {
    let store = NewsletterStore::load(&app)?;
    let api_key = store
        .api_key
        .as_ref()
        .filter(|k| !k.trim().is_empty())
        .ok_or_else(|| {
            if store.encrypted_api_key_present {
                "Clé API illisible — fermez et rouvrez le CRM avec votre mot de passe maître."
                    .to_string()
            } else {
                "Configurez votre clé API Mistral dans Paramètres → Newsletter.".to_string()
            }
        })?;

    let raw = generate_newsletter_json(
        api_key,
        &store.model,
        &store.style_prompt,
        &input.theme,
        input.edition_instructions.as_deref(),
    )?;

    parse_generated_newsletter(&raw)
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NewsletterChatTurn {
    pub role: String,
    pub content: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RefineNewsletterInput {
    pub current: GeneratedNewsletterContent,
    pub message: String,
    #[serde(default)]
    pub history: Vec<NewsletterChatTurn>,
}

#[tauri::command]
pub fn refine_newsletter_content(
    app: AppHandle,
    input: RefineNewsletterInput,
) -> Result<GeneratedNewsletterContent, String> {
    let store = NewsletterStore::load(&app)?;
    let api_key = store
        .api_key
        .as_ref()
        .filter(|k| !k.trim().is_empty())
        .ok_or_else(|| {
            if store.encrypted_api_key_present {
                "Clé API illisible — fermez et rouvrez le CRM avec votre mot de passe maître."
                    .to_string()
            } else {
                "Configurez votre clé API Mistral dans Paramètres → Newsletter.".to_string()
            }
        })?;

    let message = input.message.trim();
    if message.is_empty() {
        return Err("Décrivez la modification souhaitée.".into());
    }

    let current_json = serde_json::to_string(&input.current)
        .map_err(|e| format!("Sérialisation newsletter: {}", e))?;

    let history: Vec<(String, String)> = input
        .history
        .iter()
        .map(|t| (t.role.clone(), t.content.clone()))
        .collect();

    let raw = refine_newsletter_json(
        api_key,
        &store.model,
        &store.style_prompt,
        &current_json,
        message,
        &history,
    )?;

    parse_generated_newsletter(&raw)
}

#[tauri::command]
pub fn ensure_newsletter_etiquette(
    app: AppHandle,
    db: State<'_, DbState>,
    etiquette_nom: Option<String>,
) -> Result<EnsureNewsletterEtiquetteResult, String> {
    let store = NewsletterStore::load(&app)?;
    let nom = etiquette_nom
        .filter(|n| !n.trim().is_empty())
        .unwrap_or_else(|| store.etiquette_nom.clone());

    let db_guard = db.lock().map_err(|e| format!("Erreur accès base: {}", e))?;
    let database = db_guard.as_ref().ok_or("Base de données non initialisée")?;

    let existing_id = database
        .get_etiquette_id_by_nom_insensitive(&nom)
        .map_err(|e| format!("Recherche étiquette: {}", e))?;

    let (etiquette_id, created) = if let Some(id) = existing_id {
        (id, false)
    } else {
        let created_etiq = database
            .create_etiquette(NewEtiquette {
                nom: nom.clone(),
                couleur: Some("#6366F1".to_string()),
                icone: Some("📰".to_string()),
                description: Some("Abonnés à la newsletter".to_string()),
                priorite: Some(50),
                auto_condition_type: None,
                auto_condition_config: None,
                auto_categories: None,
                email_template_id: None,
                email_delai_jours: Some(0),
                email_envoi_prevu: None,
                email_envoi_heure: None,
                email_actif: Some(false),
                is_default: Some(false),
                actif: Some(true),
            })
            .map_err(|e| format!("Création étiquette Newsletter: {}", e))?;
        (created_etiq.id, true)
    };

    let contact_count = database
        .count_contacts_for_etiquette(etiquette_id)
        .map_err(|e| format!("Comptage contacts: {}", e))?;

    Ok(EnsureNewsletterEtiquetteResult {
        etiquette_id,
        etiquette_nom: nom,
        contact_count,
        created,
    })
}

#[tauri::command]
pub fn activate_newsletter_campaign(
    db: State<'_, DbState>,
    etiquette_id: i64,
    template_id: i64,
) -> Result<(), String> {
    let now = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_err(|e| e.to_string())?
        .as_secs() as i64;

    let db_guard = db.lock().map_err(|e| format!("Erreur accès base: {}", e))?;
    let database = db_guard.as_ref().ok_or("Base de données non initialisée")?;

    let etiquette = database
        .get_etiquette_by_id(etiquette_id)
        .map_err(|e| format!("Étiquette introuvable: {}", e))?;

    database
        .update_etiquette(
            etiquette_id,
            &NewEtiquette {
                nom: etiquette.nom,
                couleur: Some(etiquette.couleur),
                icone: etiquette.icone,
                description: etiquette.description,
                priorite: Some(etiquette.priorite),
                auto_condition_type: etiquette.auto_condition_type,
                auto_condition_config: etiquette.auto_condition_config,
                auto_categories: etiquette.auto_categories,
                email_template_id: Some(template_id),
                email_delai_jours: Some(etiquette.email_delai_jours),
                email_envoi_prevu: Some(now),
                email_envoi_heure: None,
                email_actif: Some(true),
                is_default: Some(etiquette.is_default),
                actif: Some(etiquette.actif),
            },
        )
        .map_err(|e| format!("Activation campagne: {}", e))?;

    Ok(())
}

fn parse_generated_newsletter(raw: &str) -> Result<GeneratedNewsletterContent, String> {
    let trimmed = raw.trim();
    let json_str = if trimmed.starts_with("```") {
        trimmed
            .trim_start_matches("```json")
            .trim_start_matches("```")
            .trim_end_matches("```")
            .trim()
    } else {
        trimmed
    };

    let value: serde_json::Value = serde_json::from_str(json_str)
        .map_err(|e| format!("JSON Mistral invalide: {} — {}", e, truncate(raw, 120)))?;

    let subject = value
        .get("subject")
        .or_else(|| value.get("objet"))
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .trim()
        .to_string();
    if subject.is_empty() {
        return Err("Mistral n'a pas fourni de sujet (subject).".into());
    }

    let intro = value
        .get("intro")
        .or_else(|| value.get("introduction"))
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .trim()
        .to_string();

    let cta = value
        .get("cta")
        .or_else(|| value.get("conclusion"))
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .trim()
        .to_string();

    let sections = value
        .get("sections")
        .and_then(|v| v.as_array())
        .map(|arr| {
            arr.iter()
                .filter_map(|item| {
                    let title = item
                        .get("title")
                        .or_else(|| item.get("titre"))
                        .and_then(|v| v.as_str())
                        .unwrap_or("")
                        .trim()
                        .to_string();
                    let body = item
                        .get("body")
                        .or_else(|| item.get("corps"))
                        .and_then(|v| v.as_str())
                        .unwrap_or("")
                        .trim()
                        .to_string();
                    if title.is_empty() && body.is_empty() {
                        None
                    } else {
                        Some(GeneratedNewsletterSection { title, body })
                    }
                })
                .collect()
        })
        .unwrap_or_default();

    Ok(GeneratedNewsletterContent {
        subject,
        intro,
        sections,
        cta,
    })
}

fn truncate(s: &str, max: usize) -> String {
    if s.len() <= max {
        return s.to_string();
    }
    format!("{}…", &s[..max])
}
