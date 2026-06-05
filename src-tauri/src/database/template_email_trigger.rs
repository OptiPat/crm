//! DÃ©clencheur email stockÃ© dans `templates_email.variables` (clÃ© `email_trigger`).

use super::models::Etiquette;
use serde::Deserialize;
use serde_json::json;

#[derive(Debug, Clone, Deserialize, Default)]
#[serde(default)]
pub struct TemplateEmailTriggerConfig {
    pub enabled: bool,
    pub condition_type: Option<String>,
    pub condition_config: Option<String>,
    pub categories: Vec<String>,
    pub delai_jours: i64,
    pub envoi_heure: Option<String>,
    #[serde(default)]
    pub envoi_jours_semaine: Option<String>,
    pub a_chaque_souscription: bool,
    /// Ancien format
    pub trigger_type: String,
    pub event_types: Vec<String>,
}

impl TemplateEmailTriggerConfig {
    pub fn resolved_condition_type(&self) -> Option<String> {
        if let Some(ref t) = self.condition_type {
            let t = t.trim();
            if !t.is_empty() && t != "NONE" {
                return Some(t.to_string());
            }
        }
        if self.enabled && self.trigger_type == "EVENEMENT_SOUSCRIPTION" {
            return Some("EVENEMENT_SOUSCRIPTION".to_string());
        }
        None
    }

    pub fn resolved_condition_config(&self) -> Option<String> {
        if self
            .condition_config
            .as_ref()
            .map(|s| !s.trim().is_empty())
            .unwrap_or(false)
        {
            return self.condition_config.clone();
        }
        if self.resolved_condition_type().as_deref() == Some("EVENEMENT_SOUSCRIPTION") {
            return Some(
                json!({
                    "types": self.event_types,
                    "a_chaque_souscription": self.a_chaque_souscription,
                })
                .to_string(),
            );
        }
        None
    }

    pub fn is_active(&self) -> bool {
        self.enabled && self.resolved_condition_type().is_some()
    }

    pub fn is_event_souscription(&self) -> bool {
        self.is_active()
            && self.resolved_condition_type().as_deref() == Some("EVENEMENT_SOUSCRIPTION")
    }

    pub fn souscription_types_filter(&self) -> Vec<String> {
        let Some(cfg) = self.resolved_condition_config() else {
            return vec![];
        };
        let Ok(parsed) = serde_json::from_str::<serde_json::Value>(&cfg) else {
            return vec![];
        };
        parsed["types"]
            .as_array()
            .map(|arr| {
                arr.iter()
                    .filter_map(|v| v.as_str().map(String::from))
                    .collect()
            })
            .unwrap_or_default()
    }

    pub fn a_chaque_souscription_resolved(&self) -> bool {
        if let Some(cfg) = self.resolved_condition_config() {
            if let Ok(parsed) = serde_json::from_str::<serde_json::Value>(&cfg) {
                if let Some(v) = parsed["a_chaque_souscription"].as_bool() {
                    return v;
                }
            }
        }
        self.a_chaque_souscription
    }
}

pub fn parse_template_email_trigger(variables: Option<&str>) -> TemplateEmailTriggerConfig {
    let Some(raw) = variables.filter(|s| !s.trim().is_empty()) else {
        return TemplateEmailTriggerConfig::default();
    };
    let Ok(v) = serde_json::from_str::<serde_json::Value>(raw) else {
        return TemplateEmailTriggerConfig::default();
    };
    let Some(trigger_val) = v.get("email_trigger") else {
        return TemplateEmailTriggerConfig::default();
    };
    serde_json::from_value(trigger_val.clone()).unwrap_or_default()
}

/// ParamÃ¨tres de planification rÃ©utilisant `resolve_email_date_prevue_for_contact`.
pub fn etiquette_schedule_from_trigger(trigger: &TemplateEmailTriggerConfig) -> Etiquette {
    Etiquette {
        id: 0,
        nom: String::new(),
        couleur: String::new(),
        icone: None,
        description: None,
        priorite: 0,
        auto_condition_type: None,
        auto_condition_config: None,
        auto_categories: None,
        email_template_id: None,
        email_delai_jours: trigger.delai_jours.max(0),
        email_envoi_prevu: None,
        email_envoi_heure: trigger.envoi_heure.clone().filter(|s| !s.trim().is_empty()),
        email_envoi_jours_semaine: trigger
            .envoi_jours_semaine
            .as_ref()
            .and_then(|s| super::email_schedule::normalize_email_envoi_jours_semaine(s)),
        email_actif: trigger.enabled,
        is_default: false,
        actif: true,
        segment_id: None,
        pipeline_actif: false,
        created_at: 0,
        updated_at: 0,
    }
}
