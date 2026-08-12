use super::brevo::{
    list_brevo_templates, push_newsletter_campaign, test_brevo_api_key, BrevoRecipient,
    BrevoTemplateSummary, PushBrevoCampaignInput, PushBrevoCampaignResult,
};
use super::db::{
    CancelNewsletterPreparationResult, LastNewsletterEditionDuplicate, NewsletterAudienceFilters,
    NewsletterAudienceMember, NewsletterAudiencePreview, NewsletterEditionDetail,
    NewsletterEditionSummary, NewsletterUnsubscribedContact, PrepareNewsletterEditionResult,
};
use super::llm::LlmProvider;
use super::mistral::{generate_newsletter_json, refine_newsletter_json};
use super::store::{NewsletterSettingsInput, NewsletterSettingsPublic, NewsletterStore};
use crate::auth::session::{require_ui_session, UiSessionState};
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
pub fn get_newsletter_settings(
    app: AppHandle,
    session: State<'_, UiSessionState>,
) -> Result<NewsletterSettingsPublic, String> {
    require_ui_session(&session)?;
    NewsletterStore::load(&app).map(|s| s.to_public())
}

#[tauri::command]
pub fn save_newsletter_settings(
    app: AppHandle,
    session: State<'_, UiSessionState>,
    input: NewsletterSettingsInput,
) -> Result<NewsletterSettingsPublic, String> {
    require_ui_session(&session)?;
    let mut store = NewsletterStore::load(&app)?;
    let saves_llm_settings = input.llm_provider.is_some();
    let target_provider = input
        .llm_provider
        .as_deref()
        .map(|p| LlmProvider::parse(p).as_id().to_string())
        .unwrap_or_else(|| store.llm_provider.clone());
    if target_provider != store.llm_provider {
        let has_new_key = input
            .api_key
            .as_ref()
            .is_some_and(|k| !k.trim().is_empty());
        let has_existing = store.is_provider_api_key_configured(&target_provider);
        if !has_new_key && !has_existing {
            return Err(format!(
                "Changez de fournisseur IA : saisissez la clé API {}.",
                LlmProvider::parse(&target_provider).label()
            ));
        }
    }
    if let Some(provider) = input.llm_provider {
        let trimmed = provider.trim();
        if !trimmed.is_empty() {
            store.llm_provider = LlmProvider::parse(trimmed).as_id().to_string();
        }
    }
    if let Some(key) = input.api_key {
        let trimmed = key.trim();
        let provider_id = store.llm_provider.clone();
        if trimmed.is_empty() {
            store.set_provider_api_key(&provider_id, None);
        } else {
            store.set_provider_api_key(&provider_id, Some(trimmed.to_string()));
        }
    }
    if let Some(key) = input.mistral_api_key {
        let trimmed = key.trim();
        if trimmed.is_empty() {
            store.set_provider_api_key("mistral", None);
        } else {
            store.set_provider_api_key("mistral", Some(trimmed.to_string()));
        }
    }
    if saves_llm_settings
        && store.llm_provider != "mistral"
        && !store.is_provider_api_key_configured("mistral")
    {
        return Err(
            "Clé API Mistral absente — Newsletter → Paramètres → clé Mistral (OCR + résumés SCPI)."
                .to_string(),
        );
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
    if let Some(header) = input.header_color {
        let trimmed = header.trim();
        store.header_color = if trimmed.is_empty() {
            None
        } else {
            Some(trimmed.to_string())
        };
    }
    if let Some(header_text) = input.header_text_color {
        let trimmed = header_text.trim();
        store.header_text_color = if trimmed.is_empty() {
            None
        } else {
            Some(trimmed.to_string())
        };
    }
    if let Some(title) = input.title_color {
        let trimmed = title.trim();
        store.title_color = if trimmed.is_empty() {
            None
        } else {
            Some(trimmed.to_string())
        };
    }
    if let Some(separator) = input.separator_color {
        let trimmed = separator.trim();
        store.separator_color = if trimmed.is_empty() {
            None
        } else {
            Some(trimmed.to_string())
        };
    }
    if let Some(text) = input.text_color {
        let trimmed = text.trim();
        store.text_color = if trimmed.is_empty() {
            None
        } else {
            Some(trimmed.to_string())
        };
    }
    if let Some(button) = input.button_color {
        let trimmed = button.trim();
        store.button_color = if trimmed.is_empty() {
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
    if let Some(agenda_link_id) = input.agenda_link_id {
        let trimmed = agenda_link_id.trim();
        store.agenda_link_id = if trimmed.is_empty() {
            None
        } else {
            Some(trimmed.to_string())
        };
    }
    if let Some(key) = input.brevo_api_key {
        let trimmed = key.trim();
        if trimmed.is_empty() {
            store.brevo_api_key = None;
        } else {
            store.brevo_api_key = Some(trimmed.to_string());
        }
    }
    if let Some(name) = input.brevo_sender_name {
        let trimmed = name.trim();
        store.brevo_sender_name = if trimmed.is_empty() {
            None
        } else {
            Some(trimmed.to_string())
        };
    }
    if let Some(email) = input.brevo_sender_email {
        let trimmed = email.trim();
        store.brevo_sender_email = if trimmed.is_empty() {
            None
        } else {
            Some(trimmed.to_string())
        };
    }
    if let Some(template_id) = input.default_brevo_template_id {
        store.default_brevo_template_id = if template_id > 0 {
            Some(template_id)
        } else {
            None
        };
    }
    store.save(&app)?;
    NewsletterStore::load(&app).map(|s| s.to_public())
}

#[tauri::command]
pub fn generate_newsletter_content(
    app: AppHandle,
    session: State<'_, UiSessionState>,
    input: GenerateNewsletterInput,
) -> Result<GeneratedNewsletterContent, String> {
    require_ui_session(&session)?;
    let store = NewsletterStore::load(&app)?;
    let api_key = newsletter_api_key(&store)?;
    let provider = LlmProvider::parse(&store.llm_provider);

    let raw = generate_newsletter_json(
        provider,
        &api_key,
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
    session: State<'_, UiSessionState>,
    input: RefineNewsletterInput,
) -> Result<GeneratedNewsletterContent, String> {
    require_ui_session(&session)?;
    let store = NewsletterStore::load(&app)?;
    let api_key = newsletter_api_key(&store)?;
    let provider = LlmProvider::parse(&store.llm_provider);

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
        provider,
        &api_key,
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
                rendement_cible: None,
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
                rendement_cible: etiquette.rendement_cible.clone(),
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
                rendement_cible: etiquette.rendement_cible.clone(),
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
pub fn get_newsletter_send_queue(
    db: State<'_, DbState>,
    edition_id: i64,
) -> Result<Vec<crate::database::models::EtiquetteEmailQueueItem>, String> {
    let db_guard = db.lock().map_err(|e| format!("Erreur accès base: {}", e))?;
    let database = db_guard.as_ref().ok_or("Base de données non initialisée")?;
    database
        .get_newsletter_send_queue(edition_id)
        .map_err(|e| format!("File envoi newsletter: {}", e))
}

#[tauri::command]
pub fn count_newsletter_send_ready(
    db: State<'_, DbState>,
    etiquette_id: i64,
    edition_id: Option<i64>,
) -> Result<u32, String> {
    let db_guard = db.lock().map_err(|e| format!("Erreur accès base: {}", e))?;
    let database = db_guard.as_ref().ok_or("Base de données non initialisée")?;
    database
        .count_newsletter_send_ready(etiquette_id, edition_id)
        .map_err(|e| format!("Compteur file newsletter: {}", e))
}

#[tauri::command]
pub fn cancel_newsletter_preparation(
    db: State<'_, DbState>,
    etiquette_id: i64,
    edition_id: Option<i64>,
) -> Result<CancelNewsletterPreparationResult, String> {
    let db_guard = db.lock().map_err(|e| format!("Erreur accès base: {}", e))?;
    let database = db_guard.as_ref().ok_or("Base de données non initialisée")?;
    database
        .cancel_newsletter_preparation(etiquette_id, edition_id)
        .map_err(|e| format!("Annulation préparation newsletter: {}", e))
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

#[tauri::command]
pub fn list_brevo_email_templates(
    app: AppHandle,
    session: State<'_, UiSessionState>,
) -> Result<Vec<BrevoTemplateSummary>, String> {
    require_ui_session(&session)?;
    let store = NewsletterStore::load(&app)?;
    let api_key = brevo_api_key(&store)?;
    list_brevo_templates(&api_key)
}

#[tauri::command]
pub fn test_brevo_connection(
    app: AppHandle,
    session: State<'_, UiSessionState>,
) -> Result<String, String> {
    require_ui_session(&session)?;
    let store = NewsletterStore::load(&app)?;
    let api_key = brevo_api_key(&store)?;
    test_brevo_api_key(&api_key)
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PushNewsletterEditionToBrevoInput {
    pub edition_id: i64,
    pub template_id: Option<i64>,
    /// Contenu affiché dans le compositeur au moment du push (prioritaire sur l'édition en base).
    pub subject: Option<String>,
    pub plain_body: Option<String>,
    pub content_json: Option<String>,
}

#[tauri::command]
pub fn push_newsletter_edition_to_brevo(
    app: AppHandle,
    session: State<'_, UiSessionState>,
    db: State<'_, DbState>,
    input: PushNewsletterEditionToBrevoInput,
) -> Result<PushBrevoCampaignResult, String> {
    require_ui_session(&session)?;
    let store = NewsletterStore::load(&app)?;
    let api_key = brevo_api_key(&store)?;

    let template_id = input
        .template_id
        .or(store.default_brevo_template_id)
        .ok_or_else(|| "Sélectionnez un template Brevo.".to_string())?;

    let sender_name = store
        .brevo_sender_name
        .as_deref()
        .filter(|s| !s.trim().is_empty())
        .ok_or_else(|| "Renseignez le nom expéditeur Brevo (Newsletter → Paramètres).".to_string())?
        .to_string();
    let sender_email = store
        .brevo_sender_email
        .as_deref()
        .filter(|s| !s.trim().is_empty())
        .ok_or_else(|| {
            "Renseignez l'email expéditeur Brevo (Newsletter → Paramètres).".to_string()
        })?
        .to_string();
    validate_brevo_sender_email(&sender_email)?;

    let (push_input, prepared_recipient_count) = {
        let db_guard = db.lock().map_err(|e| format!("Erreur accès base: {}", e))?;
        let database = db_guard.as_ref().ok_or("Base de données non initialisée")?;
        let detail = database
            .get_newsletter_edition_detail(input.edition_id)
            .map_err(|e| format!("Édition newsletter: {}", e))?;

        if !edition_allows_brevo_push(&detail.status) {
            return Err(format!(
                "Cette édition n'est plus poussable vers Brevo (statut « {} »). Préparez une nouvelle campagne.",
                detail.status
            ));
        }

        let content_json = input
            .content_json
            .as_deref()
            .filter(|s| !s.trim().is_empty())
            .map(|s| s.to_string())
            .or_else(|| {
                detail
                    .content_json
                    .as_deref()
                    .filter(|s| !s.trim().is_empty())
                    .map(|s| s.to_string())
            })
            .ok_or_else(|| {
                "Contenu de l'édition introuvable — préparez à nouveau la campagne.".to_string()
            })?;

        let subject = input
            .subject
            .as_deref()
            .filter(|s| !s.trim().is_empty())
            .unwrap_or(detail.subject.as_str())
            .trim()
            .to_string();

        if input.content_json.is_some() || input.subject.is_some() || input.plain_body.is_some() {
            let plain_body = input
                .plain_body
                .as_deref()
                .filter(|s| !s.trim().is_empty())
                .unwrap_or(detail.plain_body.as_str())
                .trim()
                .to_string();
            database
                .update_newsletter_edition_content(
                    input.edition_id,
                    &subject,
                    &plain_body,
                    &content_json,
                )
                .map_err(|_| {
                    "Impossible de mettre à jour le contenu — l'édition n'est plus au statut « préparée »."
                        .to_string()
                })?;
        }

        let preheader = serde_json::from_str::<serde_json::Value>(&content_json)
            .ok()
            .and_then(|value| {
                value
                    .get("preheader")
                    .and_then(|v| v.as_str())
                    .map(|s| s.trim().to_string())
                    .filter(|s| !s.is_empty())
            });

        let prepared_recipient_count = detail.queued_count;

        let recipients: Vec<BrevoRecipient> = detail
            .recipients
            .into_iter()
            .filter(|r| !r.email.trim().is_empty())
            .map(|r| BrevoRecipient {
                email: r.email.trim().to_string(),
                prenom: r.prenom,
                nom: r.nom,
            })
            .collect();

        (PushBrevoCampaignInput {
            edition_id: input.edition_id,
            edition_label: detail.edition_label,
            subject,
            preheader,
            template_id,
            sender_name,
            sender_email,
            recipients,
        }, prepared_recipient_count)
    };

    let mut result = push_newsletter_campaign(&api_key, push_input)?;
    result.prepared_recipient_count = prepared_recipient_count;

    let record_warning = {
        let db_guard = db.lock().map_err(|e| format!("Erreur accès base: {}", e))?;
        let database = db_guard.as_ref().ok_or("Base de données non initialisée")?;
        let now = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map_err(|e| e.to_string())?
            .as_secs() as i64;
        match database.record_newsletter_brevo_push(
            input.edition_id,
            result.campaign_id,
            result.list_id,
            template_id,
            now,
        ) {
            Ok(()) => None,
            Err(e) => Some(format!(
                "Brouillon Brevo créé (#{}) mais non enregistré dans le CRM : {}",
                result.campaign_id, e
            )),
        }
    };

    result.record_warning = record_warning;
    Ok(result)
}

fn validate_brevo_sender_email(email: &str) -> Result<(), String> {
    if email.contains('@') && email.len() >= 5 && !email.chars().any(char::is_whitespace) {
        return Ok(());
    }
    Err("Email expéditeur Brevo invalide (Newsletter → Paramètres).".into())
}

fn edition_allows_brevo_push(status: &str) -> bool {
    matches!(status, "prepared" | "sending" | "partial")
}

fn brevo_api_key(store: &NewsletterStore) -> Result<String, String> {
    store
        .brevo_api_key
        .as_ref()
        .filter(|k| !k.trim().is_empty())
        .cloned()
        .ok_or_else(|| {
            if store.encrypted_brevo_api_key_present {
                "Clé API Brevo illisible — fermez et rouvrez le CRM avec votre mot de passe maître."
                    .to_string()
            } else {
                "Clé API Brevo non configurée (Newsletter → Paramètres).".to_string()
            }
        })
}

fn newsletter_api_key(store: &NewsletterStore) -> Result<String, String> {
    store.resolved_newsletter_api_key()
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
        .map_err(|e| format!("JSON IA invalide: {} — {}", e, truncate(raw, 120)))?;

    let subject = value
        .get("subject")
        .or_else(|| value.get("objet"))
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .trim()
        .to_string();
    if subject.is_empty() {
        return Err("L'IA n'a pas fourni de sujet (subject).".into());
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
