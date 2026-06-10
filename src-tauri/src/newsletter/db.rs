use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NewsletterAudienceFilters {
    #[serde(default)]
    pub exclude_prescripteurs: bool,
    #[serde(default)]
    pub exclude_suspects: bool,
    #[serde(default = "default_true")]
    pub exclude_archived: bool,
    #[serde(default)]
    pub exclude_contact_ids: Vec<i64>,
}

fn default_true() -> bool {
    true
}

impl Default for NewsletterAudienceFilters {
    fn default() -> Self {
        Self {
            exclude_prescripteurs: false,
            exclude_suspects: false,
            exclude_archived: false,
            exclude_contact_ids: vec![],
        }
    }
}

impl NewsletterAudienceFilters {
    pub fn merged_with(&self, other: &Self) -> Self {
        let mut ids: std::collections::HashSet<i64> =
            self.exclude_contact_ids.iter().copied().collect();
        ids.extend(&other.exclude_contact_ids);
        Self {
            exclude_prescripteurs: self.exclude_prescripteurs || other.exclude_prescripteurs,
            exclude_suspects: self.exclude_suspects || other.exclude_suspects,
            exclude_archived: self.exclude_archived || other.exclude_archived,
            exclude_contact_ids: ids.into_iter().collect(),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NewsletterAudienceMember {
    pub contact_id: i64,
    pub nom: String,
    pub prenom: String,
    pub email: Option<String>,
    pub categorie: String,
    pub filleul_categorie: Option<String>,
    pub statut_suivi: Option<String>,
    pub has_email: bool,
    pub unsubscribed: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NewsletterEligibleContact {
    pub contact_id: i64,
    pub nom: String,
    pub prenom: String,
    pub email: String,
    pub categorie: String,
    pub filleul_categorie: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NewsletterAudiencePreview {
    pub total_contacts: u32,
    pub with_email: u32,
    pub without_email: u32,
    pub permanent_excluded: u32,
    pub excluded_by_filters: u32,
    pub eligible: u32,
    pub recipients: Vec<NewsletterEligibleContact>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NewsletterUnsubscribedContact {
    pub contact_id: i64,
    pub nom: String,
    pub prenom: String,
    pub email: Option<String>,
    pub unsubscribed_at: i64,
    pub source: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PrepareNewsletterEditionResult {
    pub queued: u32,
    pub skipped_no_email: u32,
    pub etiquette_id: i64,
    pub edition_id: i64,
    pub template_id: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NewsletterEditionSummary {
    pub id: i64,
    pub edition_label: String,
    pub subject: String,
    pub prepared_at: i64,
    pub send_completed_at: Option<i64>,
    pub queued_count: u32,
    pub sent_count: u32,
    pub error_count: u32,
    pub status: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NewsletterEditionRecipient {
    pub contact_id: i64,
    pub contact_etiquette_id: i64,
    pub nom: String,
    pub prenom: String,
    pub email: String,
    pub sent_at: Option<i64>,
    pub error_message: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NewsletterEditionDetail {
    pub id: i64,
    pub edition_label: String,
    pub subject: String,
    pub plain_body: String,
    pub theme: Option<String>,
    pub edition_instructions: Option<String>,
    pub prepared_at: i64,
    pub send_started_at: Option<i64>,
    pub send_completed_at: Option<i64>,
    pub queued_count: u32,
    pub sent_count: u32,
    pub error_count: u32,
    pub status: String,
    pub recipients: Vec<NewsletterEditionRecipient>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LastNewsletterEditionDuplicate {
    pub edition_label: String,
    pub subject: String,
    pub plain_body: String,
    pub content_json: String,
    pub theme: Option<String>,
    pub edition_instructions: Option<String>,
    pub prepared_at: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CancelNewsletterPreparationResult {
    pub edition_id: i64,
    pub cancelled_queue_count: u32,
    pub edition_label: String,
    pub subject: String,
    pub plain_body: String,
    pub content_json: String,
    pub theme: Option<String>,
    pub edition_instructions: Option<String>,
    pub audience_filters: NewsletterAudienceFilters,
}

pub struct QueuedNewsletterContact {
    pub contact_id: i64,
    pub contact_etiquette_id: i64,
    pub nom: String,
    pub prenom: String,
    pub email: String,
}

pub struct ContactAudienceRow {
    pub id: i64,
    pub nom: String,
    pub prenom: String,
    pub categorie: String,
    pub filleul_categorie: Option<String>,
    pub statut_suivi: Option<String>,
    pub newsletter_desinscrit_at: Option<i64>,
    pub email: Option<String>,
}

pub fn is_newsletter_unsubscribe_request(subject: Option<&str>, body: Option<&str>) -> bool {
    let subj = normalize_unsubscribe_match(subject.unwrap_or(""));
    let body_norm = normalize_unsubscribe_match(body.unwrap_or(""));

    // Objet du mailto « Se désinscrire » (buildUnsubscribeMailto dans newsletter-html.ts)
    if subj.contains("desinscription newsletter") {
        return true;
    }

    // Corps prérempli du mailto
    if body_norm.contains("retirer de votre liste newsletter") {
        return true;
    }

    false
}

fn normalize_unsubscribe_match(s: &str) -> String {
    s.to_lowercase()
        .replace(['é', 'è', 'ê', 'ë'], "e")
        .replace(['à', 'â'], "a")
        .replace('ù', "u")
        .replace('ô', "o")
        .replace('î', "i")
        .replace('ç', "c")
}

#[cfg(test)]
mod tests {
    use super::is_newsletter_unsubscribe_request;

    #[test]
    fn detects_unsubscribe_mailto_content() {
        assert!(is_newsletter_unsubscribe_request(
            Some("Désinscription newsletter"),
            None
        ));
        assert!(is_newsletter_unsubscribe_request(
            None,
            Some("Bonjour,\n\nMerci de me retirer de votre liste newsletter.\n\nCordialement")
        ));
        assert!(!is_newsletter_unsubscribe_request(
            Some("Re: Votre newsletter"),
            Some("Merci pour la newsletter, très claire.")
        ));
        assert!(!is_newsletter_unsubscribe_request(
            Some("Re: Newsletter"),
            Some("Je ne souhaite pas de desinscription mais un rdv")
        ));
    }
}
