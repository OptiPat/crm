//! Planification relance stockée dans `templates_email.variables` (clé `email_relance`).

pub const DEFAULT_RELANCE_DELAI_JOURS: i64 = 5;

use super::email_schedule::{calendar_slot_on_anchor_day, send_at_eligibility_slot};
use super::models::EtiquetteEmailQueueItem;
use serde::Deserialize;

#[derive(Debug, Clone, Deserialize, Default)]
#[serde(default)]
pub struct TemplateEmailRelanceConfig {
    pub enabled: bool,
    pub delai_jours: Option<i64>,
    pub envoi_heure: Option<String>,
    pub envoi_jours_semaine: Option<String>,
}

pub fn parse_template_email_relance(variables: Option<&str>) -> TemplateEmailRelanceConfig {
    let Some(raw) = variables.filter(|s| !s.trim().is_empty()) else {
        return TemplateEmailRelanceConfig::default();
    };
    let Ok(meta) = serde_json::from_str::<serde_json::Value>(raw) else {
        return TemplateEmailRelanceConfig::default();
    };
    let Some(rel) = meta.get("email_relance") else {
        return TemplateEmailRelanceConfig::default();
    };
    serde_json::from_value(rel.clone()).unwrap_or_default()
}

/// Date/heure à partir de laquelle proposer la relance (après le 1er envoi).
pub fn resolve_relance_due_at(
    variables: Option<&str>,
    email_date_envoi: i64,
    default_delai_jours: i64,
) -> i64 {
    let cfg = parse_template_email_relance(variables);
    let delai = cfg.delai_jours.filter(|d| *d >= 0).unwrap_or(default_delai_jours);
    let anchor = email_date_envoi + delai * 86_400;
    let jours = cfg
        .envoi_jours_semaine
        .as_deref()
        .filter(|s| !s.trim().is_empty());
    if let Some(ref heure) = cfg.envoi_heure {
        if let Some(normalized) = super::email_schedule::normalize_email_heure(heure) {
            if delai > 0 {
                return calendar_slot_on_anchor_day(anchor, &normalized, jours).unwrap_or(anchor);
            }
            return send_at_eligibility_slot(email_date_envoi, &normalized, jours)
                .unwrap_or(anchor);
        }
    }
    anchor
}

pub fn matches_sent_followup_window(
    variables: Option<&str>,
    email_date_envoi: i64,
    now: i64,
    default_delai_jours: i64,
    want_followup: bool,
) -> bool {
    let due = resolve_relance_due_at(variables, email_date_envoi, default_delai_jours);
    if want_followup {
        now >= due
    } else {
        now < due
    }
}

pub fn filter_queue_by_relance_schedule(
    items: Vec<EtiquetteEmailQueueItem>,
    queue_status: &str,
    now: i64,
    default_delai_jours: i64,
) -> Vec<EtiquetteEmailQueueItem> {
    let want_followup = queue_status == "followup";
    items
        .into_iter()
        .filter(|item| {
            let Some(envoi) = item.email_date_envoi else {
                return false;
            };
            matches_sent_followup_window(
                item.template_variables.as_deref(),
                envoi,
                now,
                default_delai_jours,
                want_followup,
            )
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn relance_due_respects_delai_and_heure() {
        let vars = r#"{"email_relance":{"enabled":true,"delai_jours":7,"envoi_heure":"18:30"}}"#;
        let envoi = 1_700_000_000i64;
        let due = resolve_relance_due_at(Some(vars), envoi, 5);
        assert!(due > envoi + 6 * 86_400);
    }

    #[test]
    fn relance_due_falls_back_to_default_delai() {
        let envoi = 1_700_000_000i64;
        let due = resolve_relance_due_at(None, envoi, 5);
        assert_eq!(due, envoi + 5 * 86_400);
    }
}
