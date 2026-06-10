use super::db::{
    LastNewsletterEditionDuplicate, NewsletterAudienceFilters, NewsletterAudienceMember,
    NewsletterAudiencePreview, NewsletterEditionDetail, NewsletterEditionSummary,
    NewsletterUnsubscribedContact, PrepareNewsletterEditionResult,
};
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
    #[serde(default)]
    pub highlight: bool,
    #[serde(default)]
    pub image_url: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GeneratedNewsletterContent {
    pub subject: String,
    #[serde(default)]
    pub preheader: Option<String>,
    #[serde(default)]
    pub edition_title: Option<String>,
    #[serde(default)]
    pub header_image_url: Option<String>,
    #[serde(default)]
    pub layout: Option<String>,
    #[serde(default)]
    pub images: Option<Vec<serde_json::Value>>,
    #[serde(default)]
    pub blocks: Option<Vec<serde_json::Value>>,
    pub intro: String,
    pub sections: Vec<GeneratedNewsletterSection>,
    pub cta: String,
    #[serde(default)]
    pub include_cta: Option<bool>,
    #[serde(default)]
    pub include_conseiller: Option<bool>,
    #[serde(default)]
    pub conseiller_name: Option<String>,
    #[serde(default)]
    pub conseiller_phone: Option<String>,
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
    if let Some(filters) = input.default_audience_filters {
        store.default_audience_filters = filters;
    }
    if let Some(accent) = input.accent_color {
        let trimmed = accent.trim();
        store.accent_color = if trimmed.is_empty() {
            None
        } else {
            Some(trimmed.to_string())
        };
    }
    if let Some(secondary) = input.secondary_color {
        let trimmed = secondary.trim();
        store.secondary_color = if trimmed.is_empty() {
            None
        } else {
            Some(trimmed.to_string())
        };
    }
    if let Some(layout) = input.default_layout {
        let trimmed = layout.trim();
        store.default_layout = if trimmed.is_empty() {
            None
        } else {
            Some(trimmed.to_string())
        };
    }
    if let Some(body_font) = input.body_font {
        let trimmed = body_font.trim();
        store.body_font = if trimmed.is_empty() {
            None
        } else {
            Some(trimmed.to_string())
        };
    }
    if let Some(title_font) = input.title_font {
        let trimmed = title_font.trim();
        store.title_font = if trimmed.is_empty() {
            None
        } else {
            Some(trimmed.to_string())
        };
    }
    if let Some(body_font_size) = input.body_font_size {
        let trimmed = body_font_size.trim();
        store.body_font_size = if trimmed.is_empty() {
            None
        } else {
            Some(trimmed.to_string())
        };
    }
    if let Some(line_height) = input.line_height {
        let trimmed = line_height.trim();
        store.line_height = if trimmed.is_empty() {
            None
        } else {
            Some(trimmed.to_string())
        };
    }
    if let Some(section_spacing) = input.section_spacing {
        let trimmed = section_spacing.trim();
        store.section_spacing = if trimmed.is_empty() {
            None
        } else {
            Some(trimmed.to_string())
        };
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
        database
            .protect_newsletter_etiquette(id)
            .map_err(|e| format!("Protection étiquette Newsletter: {}", e))?;
        (id, false)
    } else {
        let created_etiq = database
            .create_etiquette(NewEtiquette {
                nom: nom.clone(),
                couleur: Some("#6366F1".to_string()),
                icone: Some("📰".to_string()),
                description: Some(
                    "File d'envoi newsletter (attributions automatiques à la préparation).".into(),
                ),
                priorite: Some(50),
                auto_condition_type: None,
                auto_condition_config: None,
                auto_categories: None,
                email_template_id: None,
                email_delai_jours: Some(0),
                email_envoi_prevu: None,
                email_envoi_heure: None,
                email_envoi_jours_semaine: None,
                email_actif: Some(false),
                is_default: Some(true),
                actif: Some(true),
                segment_id: None,
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
                email_envoi_jours_semaine: None,
                email_actif: Some(true),
                is_default: Some(etiquette.is_default),
                actif: Some(etiquette.actif),
                segment_id: etiquette.segment_id,
            },
        )
        .map_err(|e| format!("Activation campagne: {}", e))?;

    Ok(())
}

#[tauri::command]
pub fn get_newsletter_audience_members(
    db: State<'_, DbState>,
) -> Result<Vec<NewsletterAudienceMember>, String> {
    let db_guard = db.lock().map_err(|e| format!("Erreur accès base: {}", e))?;
    let database = db_guard.as_ref().ok_or("Base de données non initialisée")?;
    database
        .list_newsletter_audience_members()
        .map_err(|e| format!("Liste audience: {}", e))
}

#[tauri::command]
pub fn get_newsletter_audience_preview(
    db: State<'_, DbState>,
    filters: NewsletterAudienceFilters,
) -> Result<NewsletterAudiencePreview, String> {
    let db_guard = db.lock().map_err(|e| format!("Erreur accès base: {}", e))?;
    let database = db_guard.as_ref().ok_or("Base de données non initialisée")?;
    database
        .preview_newsletter_audience(&filters)
        .map_err(|e| format!("Aperçu audience: {}", e))
}

#[tauri::command]
pub fn get_newsletter_unsubscribed(
    db: State<'_, DbState>,
) -> Result<Vec<NewsletterUnsubscribedContact>, String> {
    let db_guard = db.lock().map_err(|e| format!("Erreur accès base: {}", e))?;
    let database = db_guard.as_ref().ok_or("Base de données non initialisée")?;
    database
        .list_newsletter_unsubscribed()
        .map_err(|e| format!("Liste désinscriptions: {}", e))
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PrepareNewsletterEditionInput {
    pub etiquette_id: i64,
    pub edition_label: String,
    pub subject: String,
    pub plain_body: String,
    pub content_json: String,
    pub html_meta: String,
    pub theme: Option<String>,
    pub edition_instructions: Option<String>,
    pub filters: NewsletterAudienceFilters,
}

#[tauri::command]
pub fn prepare_newsletter_edition(
    app: AppHandle,
    db: State<'_, DbState>,
    input: PrepareNewsletterEditionInput,
) -> Result<PrepareNewsletterEditionResult, String> {
    let now = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_err(|e| e.to_string())?
        .as_secs() as i64;

    let settings_filters = NewsletterStore::load(&app)?.default_audience_filters;
    let filters = settings_filters.merged_with(&input.filters);

    let db_guard = db.lock().map_err(|e| format!("Erreur accès base: {}", e))?;
    let database = db_guard.as_ref().ok_or("Base de données non initialisée")?;

    let template_id = database
        .upsert_newsletter_template(
            input.etiquette_id,
            input.subject.trim(),
            input.plain_body.trim(),
            input.html_meta.trim(),
        )
        .map_err(|e| format!("Modèle newsletter: {}", e))?;

    let etiquette = database
        .get_etiquette_by_id(input.etiquette_id)
        .map_err(|e| format!("Étiquette introuvable: {}", e))?;

    database
        .update_etiquette(
            input.etiquette_id,
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
                email_delai_jours: Some(0),
                email_envoi_prevu: Some(now),
                email_envoi_heure: None,
                email_envoi_jours_semaine: None,
                email_actif: Some(true),
                is_default: Some(etiquette.is_default),
                actif: Some(etiquette.actif),
                segment_id: etiquette.segment_id,
            },
        )
        .map_err(|e| format!("Activation campagne: {}", e))?;

    let filters_json = serde_json::to_string(&filters)
        .map_err(|e| format!("Filtres audience: {}", e))?;

    let (queued, skipped_no_email, queued_contacts) = database
        .queue_newsletter_edition(input.etiquette_id, now, &filters)
        .map_err(|e| format!("File newsletter: {}", e))?;

    let edition_id = database
        .create_newsletter_edition(
            input.etiquette_id,
            template_id,
            input.edition_label.trim(),
            input.subject.trim(),
            input.plain_body.trim(),
            input.content_json.trim(),
            input.theme.as_deref(),
            input.edition_instructions.as_deref(),
            &filters_json,
            now,
            &queued_contacts,
        )
        .map_err(|e| format!("Historique édition: {}", e))?;

    Ok(PrepareNewsletterEditionResult {
        queued,
        skipped_no_email,
        etiquette_id: input.etiquette_id,
        edition_id,
        template_id,
    })
}

#[tauri::command]
pub fn list_newsletter_editions(
    db: State<'_, DbState>,
    limit: Option<u32>,
) -> Result<Vec<NewsletterEditionSummary>, String> {
    let db_guard = db.lock().map_err(|e| format!("Erreur accès base: {}", e))?;
    let database = db_guard.as_ref().ok_or("Base de données non initialisée")?;
    database
        .list_newsletter_editions(limit.unwrap_or(20))
        .map_err(|e| format!("Historique newsletter: {}", e))
}

#[tauri::command]
pub fn get_newsletter_edition_detail(
    db: State<'_, DbState>,
    edition_id: i64,
) -> Result<NewsletterEditionDetail, String> {
    let db_guard = db.lock().map_err(|e| format!("Erreur accès base: {}", e))?;
    let database = db_guard.as_ref().ok_or("Base de données non initialisée")?;
    database
        .get_newsletter_edition_detail(edition_id)
        .map_err(|e| format!("Détail édition: {}", e))
}

#[tauri::command]
pub fn get_last_newsletter_edition_duplicate(
    db: State<'_, DbState>,
) -> Result<Option<LastNewsletterEditionDuplicate>, String> {
    let db_guard = db.lock().map_err(|e| format!("Erreur accès base: {}", e))?;
    let database = db_guard.as_ref().ok_or("Base de données non initialisée")?;
    database
        .get_last_newsletter_edition_duplicate()
        .map_err(|e| format!("Dernière édition: {}", e))
}

#[tauri::command]
pub fn start_newsletter_edition_send(
    db: State<'_, DbState>,
    edition_id: i64,
) -> Result<(), String> {
    let now = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_err(|e| e.to_string())?
        .as_secs() as i64;
    let db_guard = db.lock().map_err(|e| format!("Erreur accès base: {}", e))?;
    let database = db_guard.as_ref().ok_or("Base de données non initialisée")?;
    database
        .start_newsletter_edition_send(edition_id, now)
        .map_err(|e| format!("Démarrage envoi: {}", e))
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RecordNewsletterEditionSendInput {
    pub edition_id: i64,
    pub contact_etiquette_id: i64,
    pub gmail_message_id: Option<String>,
    pub error_message: Option<String>,
}

#[tauri::command]
pub fn record_newsletter_edition_send(
    db: State<'_, DbState>,
    input: RecordNewsletterEditionSendInput,
) -> Result<(), String> {
    let now = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_err(|e| e.to_string())?
        .as_secs() as i64;
    let db_guard = db.lock().map_err(|e| format!("Erreur accès base: {}", e))?;
    let database = db_guard.as_ref().ok_or("Base de données non initialisée")?;
    database
        .record_newsletter_edition_send(
            input.edition_id,
            input.contact_etiquette_id,
            now,
            input.gmail_message_id.as_deref(),
            input.error_message.as_deref(),
        )
        .map_err(|e| format!("Enregistrement envoi: {}", e))
}

#[tauri::command]
pub fn finish_newsletter_edition_send(
    db: State<'_, DbState>,
    edition_id: i64,
    cancelled: bool,
) -> Result<NewsletterEditionSummary, String> {
    let now = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_err(|e| e.to_string())?
        .as_secs() as i64;
    let db_guard = db.lock().map_err(|e| format!("Erreur accès base: {}", e))?;
    let database = db_guard.as_ref().ok_or("Base de données non initialisée")?;
    database
        .finish_newsletter_edition_send(edition_id, now, cancelled)
        .map_err(|e| format!("Clôture envoi: {}", e))
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

    let preheader = value
        .get("preheader")
        .and_then(|v| v.as_str())
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty());

    let edition_title = value
        .get("editionTitle")
        .or_else(|| value.get("edition_title"))
        .or_else(|| value.get("titre"))
        .and_then(|v| v.as_str())
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty());

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
                    let highlight = item
                        .get("highlight")
                        .and_then(|v| v.as_bool())
                        .unwrap_or(false);
                    let image_url = item
                        .get("imageUrl")
                        .or_else(|| item.get("image_url"))
                        .and_then(|v| v.as_str())
                        .map(|s| s.trim().to_string())
                        .filter(|s| !s.is_empty());
                    if title.is_empty() && body.is_empty() {
                        None
                    } else {
                        Some(GeneratedNewsletterSection {
                            title,
                            body,
                            highlight,
                            image_url,
                        })
                    }
                })
                .collect()
        })
        .unwrap_or_default();

    let header_image_url = value
        .get("headerImageUrl")
        .or_else(|| value.get("header_image_url"))
        .and_then(|v| v.as_str())
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty());

    Ok(GeneratedNewsletterContent {
        subject,
        preheader,
        edition_title,
        header_image_url,
        layout: None,
        images: None,
        blocks: None,
        intro,
        sections,
        cta,
        include_cta: None,
        include_conseiller: None,
        conseiller_name: None,
        conseiller_phone: None,
    })
}

fn truncate(s: &str, max: usize) -> String {
    if s.len() <= max {
        return s.to_string();
    }
    format!("{}…", &s[..max])
}
