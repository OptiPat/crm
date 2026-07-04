//! Campagnes email éphémères (modèle jetable, file sans étiquette).

use super::contact_row::{map_contact_row, CONTACT_SELECT};
use super::investissement_produit_match::nom_produit_matches;
use super::models::Contact;
use super::Database;
use rusqlite::{params, Result};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::collections::HashSet;

pub const IS_EPHEMERAL_TEMPLATE_KEY: &str = "is_ephemeral";
pub const EPHEMERAL_CAMPAIGN_KEY: &str = "ephemeral_campaign";

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum EphemeralProduitsMatchMode {
    All,
    Any,
}

impl Default for EphemeralProduitsMatchMode {
    fn default() -> Self {
        Self::All
    }
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum EphemeralReinvestFilter {
    Any,
    Inactive,
    Active,
}

impl Default for EphemeralReinvestFilter {
    fn default() -> Self {
        Self::Any
    }
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum EphemeralVersementProgrammeFilter {
    Any,
    Inactive,
    Active,
}

impl Default for EphemeralVersementProgrammeFilter {
    fn default() -> Self {
        Self::Any
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub struct EphemeralCampaignAudience {
    #[serde(default = "default_categories")]
    pub categories: Vec<String>,
    #[serde(default, alias = "typesProduit")]
    pub types_produit: Vec<String>,
    #[serde(default, alias = "nomsProduit")]
    pub noms_produit: Vec<String>,
    #[serde(default, alias = "produitsMatchMode")]
    pub produits_match_mode: EphemeralProduitsMatchMode,
    #[serde(default, alias = "reinvestissementDividendes")]
    pub reinvestissement_dividendes: EphemeralReinvestFilter,
    #[serde(default, alias = "versementProgramme")]
    pub versement_programme: EphemeralVersementProgrammeFilter,
}

fn default_categories() -> Vec<String> {
    vec!["CLIENT".to_string()]
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub struct EphemeralCampaignConfig {
    #[serde(default)]
    pub status: String,
    #[serde(default, alias = "batchKey")]
    pub batch_key: Option<String>,
    pub audience: EphemeralCampaignAudience,
    #[serde(default, alias = "excludedContactIds")]
    pub excluded_contact_ids: Vec<i64>,
    #[serde(default, alias = "sendAt")]
    pub send_at: Option<i64>,
    #[serde(default, alias = "preparedAt")]
    pub prepared_at: Option<i64>,
    #[serde(default, alias = "archivedAt")]
    pub archived_at: Option<i64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub struct EphemeralCampaignAudienceMember {
    pub contact_id: i64,
    pub nom: String,
    pub prenom: String,
    pub email: Option<String>,
    pub matched_produits: Vec<String>,
    pub excluded: bool,
    pub has_email: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub struct EphemeralCampaignAudiencePreview {
    pub eligible_count: u64,
    pub excluded_count: u64,
    pub no_email_count: u64,
    pub queued_count: u64,
    pub members: Vec<EphemeralCampaignAudienceMember>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub struct SyncEphemeralCampaignResult {
    pub batch_key: String,
    pub contacts_matched: u64,
    pub contacts_queued: u64,
    pub contacts_cancelled: u64,
    pub contacts_no_email: u64,
    pub auto_archived: bool,
    pub message: String,
}

struct ScopedInvestment {
    type_produit: String,
    nom_produit: String,
    reinvestissement_dividendes: bool,
    versement_programme: bool,
}

const INVESTISSEMENT_SCOPE_WHERE: &str =
    "(contact_id = ?1 OR (?2 IS NOT NULL AND foyer_id = ?2)) AND COALESCE(statut, 'ACTIF') = 'ACTIF'";

impl Database {
    pub fn template_is_ephemeral(&self, variables: Option<&str>) -> bool {
        parse_template_meta(variables)
            .get(IS_EPHEMERAL_TEMPLATE_KEY)
            .and_then(|v| v.as_bool())
            .unwrap_or(false)
    }

    pub fn parse_ephemeral_campaign_config(
        &self,
        variables: Option<&str>,
    ) -> Option<EphemeralCampaignConfig> {
        if !self.template_is_ephemeral(variables) {
            return None;
        }
        let meta = parse_template_meta(variables);
        let raw = meta.get(EPHEMERAL_CAMPAIGN_KEY)?;
        serde_json::from_value(raw.clone()).ok()
    }

    fn patch_ephemeral_campaign_in_variables(
        &self,
        template_id: i64,
        patch: impl Fn(&mut EphemeralCampaignConfig),
    ) -> Result<()> {
        let variables: Option<String> = self.conn.query_row(
            "SELECT variables FROM templates_email WHERE id = ?1",
            params![template_id],
            |row| row.get(0),
        )?;
        let Some(mut cfg) = self.parse_ephemeral_campaign_config(variables.as_deref()) else {
            return Err(rusqlite::Error::InvalidParameterName(
                "Modèle éphémère introuvable".into(),
            ));
        };
        patch(&mut cfg);
        let mut meta = parse_template_meta(variables.as_deref());
        meta[EPHEMERAL_CAMPAIGN_KEY] = serde_json::to_value(&cfg).unwrap_or(json!({}));
        let next = serde_json::to_string(&meta).unwrap_or_else(|_| "{}".to_string());
        self.conn.execute(
            "UPDATE templates_email SET variables = ?1, updated_at = unixepoch() WHERE id = ?2",
            params![next, template_id],
        )?;
        Ok(())
    }

    fn ephemeral_batch_key(template_id: i64, cfg: &EphemeralCampaignConfig) -> String {
        cfg.batch_key
            .as_deref()
            .filter(|s| !s.trim().is_empty())
            .map(String::from)
            .unwrap_or_else(|| format!("ephemeral-{template_id}"))
    }

    fn load_scoped_investments(
        &self,
        contact_id: i64,
        foyer_id: Option<i64>,
    ) -> Result<Vec<ScopedInvestment>> {
        let sql = format!(
            "SELECT type_produit, TRIM(COALESCE(nom_produit, '')),
                    reinvestissement_dividendes, versement_programme
             FROM investissements
             WHERE {}",
            INVESTISSEMENT_SCOPE_WHERE
        );
        let mut stmt = self.conn.prepare(&sql)?;
        let rows = stmt.query_map(params![contact_id, foyer_id], |row| {
            Ok(ScopedInvestment {
                type_produit: row.get(0)?,
                nom_produit: row.get(1)?,
                reinvestissement_dividendes: row.get::<_, i64>(2)? != 0,
                versement_programme: row.get::<_, i64>(3)? != 0,
            })
        })?;
        rows.collect()
    }

    fn investment_matches_type_and_nom(
        inv: &ScopedInvestment,
        types: &[String],
        nom: &str,
    ) -> bool {
        let type_ok = types.is_empty() || types.iter().any(|t| t == &inv.type_produit);
        let nom_ok = nom.trim().is_empty() || nom_produit_matches(&inv.nom_produit, nom);
        type_ok && nom_ok
    }

    fn collect_matched_produit_labels(
        investments: &[ScopedInvestment],
        types: &[String],
        noms: &[String],
    ) -> Vec<String> {
        let mut labels = Vec::new();
        for inv in investments {
            let type_ok = types.is_empty() || types.iter().any(|t| t == &inv.type_produit);
            if !type_ok {
                continue;
            }
            if noms.is_empty() {
                if !inv.nom_produit.is_empty() {
                    labels.push(inv.nom_produit.clone());
                } else {
                    labels.push(inv.type_produit.clone());
                }
                continue;
            }
            for nom in noms {
                if nom_produit_matches(&inv.nom_produit, nom) {
                    labels.push(inv.nom_produit.clone());
                }
            }
        }
        labels.sort();
        labels.dedup();
        labels
    }

    fn matching_investments_for_audience<'a>(
        investments: &'a [ScopedInvestment],
        audience: &EphemeralCampaignAudience,
    ) -> Vec<&'a ScopedInvestment> {
        investments
            .iter()
            .filter(|inv| {
                let type_ok = audience.types_produit.is_empty()
                    || audience.types_produit.iter().any(|t| t == &inv.type_produit);
                if !type_ok {
                    return false;
                }
                if audience.noms_produit.is_empty() {
                    return true;
                }
                audience
                    .noms_produit
                    .iter()
                    .any(|nom| nom_produit_matches(&inv.nom_produit, nom))
            })
            .collect()
    }

    fn passes_tri_state_filter<F>(
        matching: &[&ScopedInvestment],
        filter: EphemeralReinvestFilter,
        predicate: F,
    ) -> bool
    where
        F: Fn(&ScopedInvestment) -> bool,
    {
        match filter {
            EphemeralReinvestFilter::Any => true,
            EphemeralReinvestFilter::Inactive => matching.iter().any(|inv| !predicate(inv)),
            EphemeralReinvestFilter::Active => matching.iter().any(|inv| predicate(inv)),
        }
    }

    fn passes_versement_filter(
        matching: &[&ScopedInvestment],
        filter: EphemeralVersementProgrammeFilter,
    ) -> bool {
        match filter {
            EphemeralVersementProgrammeFilter::Any => true,
            EphemeralVersementProgrammeFilter::Inactive => {
                matching.iter().any(|inv| !inv.versement_programme)
            }
            EphemeralVersementProgrammeFilter::Active => {
                matching.iter().any(|inv| inv.versement_programme)
            }
        }
    }

    fn filter_audience_categories(categories: &[String], side: &[&str]) -> Vec<String> {
        categories
            .iter()
            .filter(|c| side.contains(&c.as_str()))
            .cloned()
            .collect()
    }

    fn contact_matches_ephemeral_client_patrimoine(
        &self,
        contact: &Contact,
        audience: &EphemeralCampaignAudience,
    ) -> Result<bool> {
        if audience.types_produit.is_empty() && audience.noms_produit.is_empty() {
            return Ok(false);
        }

        let Some(contact_id) = contact.id else {
            return Ok(false);
        };
        let investments = self.load_scoped_investments(contact_id, contact.foyer_id)?;

        let product_ok = if !audience.noms_produit.is_empty() {
            match audience.produits_match_mode {
                EphemeralProduitsMatchMode::All => audience.noms_produit.iter().all(|nom| {
                    investments.iter().any(|inv| {
                        Self::investment_matches_type_and_nom(
                            inv,
                            &audience.types_produit,
                            nom,
                        )
                    })
                }),
                EphemeralProduitsMatchMode::Any => audience.noms_produit.iter().any(|nom| {
                    investments.iter().any(|inv| {
                        Self::investment_matches_type_and_nom(
                            inv,
                            &audience.types_produit,
                            nom,
                        )
                    })
                }),
            }
        } else {
            investments.iter().any(|inv| {
                audience
                    .types_produit
                    .iter()
                    .any(|t| t == &inv.type_produit)
            })
        };

        if !product_ok {
            return Ok(false);
        }

        let matching = Self::matching_investments_for_audience(&investments, audience);
        Ok(
            Self::passes_tri_state_filter(&matching, audience.reinvestissement_dividendes, |inv| {
                inv.reinvestissement_dividendes
            }) && Self::passes_versement_filter(&matching, audience.versement_programme),
        )
    }

    pub(crate) fn contact_matches_ephemeral_audience(
        &self,
        contact: &Contact,
        audience: &EphemeralCampaignAudience,
        organisation_self_id: Option<i64>,
    ) -> Result<bool> {
        const CLIENT_SIDE: &[&str] = &["CLIENT", "PROSPECT_CLIENT", "SUSPECT_CLIENT"];
        const FILLEUL_SIDE: &[&str] = &[
            "FILLEUL",
            "PROSPECT_FILLEUL",
            "SUSPECT_FILLEUL",
            "FILLEUL_DESINSCRIT",
            "FILLEUL_MANAGER",
            "FILLEUL_PREMIER_NIVEAU",
        ];

        if audience.categories.is_empty()
            || !Self::contact_matches_auto_categories(
                contact,
                &audience.categories,
                organisation_self_id,
            )
        {
            return Ok(false);
        }

        let client_cats = Self::filter_audience_categories(&audience.categories, CLIENT_SIDE);
        let filleul_cats = Self::filter_audience_categories(&audience.categories, FILLEUL_SIDE);

        let filleul_ok = !filleul_cats.is_empty()
            && Self::contact_matches_auto_categories(
                contact,
                &filleul_cats,
                organisation_self_id,
            );

        let client_ok = !client_cats.is_empty()
            && Self::contact_matches_auto_categories(
                contact,
                &client_cats,
                organisation_self_id,
            )
            && self.contact_matches_ephemeral_client_patrimoine(contact, audience)?;

        Ok(filleul_ok || client_ok)
    }

    pub fn preview_ephemeral_campaign_audience(
        &self,
        template_id: i64,
    ) -> Result<EphemeralCampaignAudiencePreview> {
        let tpl = self.get_template_email_by_id(template_id)?;
        let cfg = self
            .parse_ephemeral_campaign_config(tpl.variables.as_deref())
            .ok_or_else(|| {
                rusqlite::Error::InvalidParameterName("Modèle éphémère requis".into())
            })?;
        if cfg.status == "archived" {
            return Err(rusqlite::Error::InvalidParameterName(
                "Campagne éphémère archivée".into(),
            ));
        }

        let batch_key = Self::ephemeral_batch_key(template_id, &cfg);
        let excluded: HashSet<i64> = cfg.excluded_contact_ids.iter().copied().collect();

        let queued: HashSet<i64> = {
            let mut stmt = self.conn.prepare(
                "SELECT contact_id FROM contact_template_envois
                 WHERE template_id = ?1
                   AND COALESCE(campaign_batch_key, '') = ?2
                   AND email_envoye = 0
                   AND COALESCE(email_annule, 0) = 0",
            )?;
            let rows = stmt.query_map(params![template_id, batch_key], |row| row.get(0))?;
            rows.collect::<Result<HashSet<_>, _>>()?
        };

        let mut stmt = self.conn.prepare(&format!(
            "SELECT {CONTACT_SELECT} FROM contacts ORDER BY nom, prenom"
        ))?;
        let contacts = stmt.query_map([], map_contact_row)?;
        let mut members = Vec::new();
        let mut eligible_count = 0u64;
        let mut excluded_count = 0u64;
        let mut no_email_count = 0u64;
        let org_self_id = self.resolve_organisation_self_contact_id()?;

        for contact in contacts {
            let contact = contact?;
            let Some(contact_id) = contact.id else {
                continue;
            };
            if !self.contact_matches_ephemeral_audience(
                &contact,
                &cfg.audience,
                org_self_id,
            )? {
                continue;
            }
            let is_excluded = excluded.contains(&contact_id);
            let has_email = contact
                .email
                .as_deref()
                .map(str::trim)
                .filter(|s| !s.is_empty())
                .is_some();
            if is_excluded {
                excluded_count += 1;
            } else {
                eligible_count += 1;
                if !has_email {
                    no_email_count += 1;
                }
            }
            let investments = self.load_scoped_investments(contact_id, contact.foyer_id)?;
            members.push(EphemeralCampaignAudienceMember {
                contact_id,
                nom: contact.nom.clone(),
                prenom: contact.prenom.clone(),
                email: contact.email.clone(),
                matched_produits: Self::collect_matched_produit_labels(
                    &investments,
                    &cfg.audience.types_produit,
                    &cfg.audience.noms_produit,
                ),
                excluded: is_excluded,
                has_email,
            });
        }

        Ok(EphemeralCampaignAudiencePreview {
            eligible_count,
            excluded_count,
            no_email_count,
            queued_count: queued.len() as u64,
            members,
        })
    }

    pub fn sync_ephemeral_campaign_queue(
        &self,
        template_id: i64,
    ) -> Result<SyncEphemeralCampaignResult> {
        let tpl = self.get_template_email_by_id(template_id)?;
        let mut cfg = self
            .parse_ephemeral_campaign_config(tpl.variables.as_deref())
            .ok_or_else(|| {
                rusqlite::Error::InvalidParameterName("Modèle éphémère requis".into())
            })?;
        if cfg.status == "archived" {
            return Err(rusqlite::Error::InvalidParameterName(
                "Campagne éphémère archivée".into(),
            ));
        }

        let batch_key = Self::ephemeral_batch_key(template_id, &cfg);
        cfg.batch_key = Some(batch_key.clone());

        let now = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_secs() as i64;
        let email_date_prevue = cfg.send_at.unwrap_or(now);
        let excluded: HashSet<i64> = cfg.excluded_contact_ids.iter().copied().collect();

        let mut eligible_ids = HashSet::new();
        let mut contacts_matched = 0u64;
        let mut contacts_no_email = 0u64;
        let org_self_id = self.resolve_organisation_self_contact_id()?;

        let mut stmt = self.conn.prepare(&format!(
            "SELECT {CONTACT_SELECT} FROM contacts"
        ))?;
        let contacts = stmt.query_map([], map_contact_row)?;
        for contact in contacts {
            let contact = contact?;
            let Some(contact_id) = contact.id else {
                continue;
            };
            if !self.contact_matches_ephemeral_audience(
                &contact,
                &cfg.audience,
                org_self_id,
            )? {
                continue;
            }
            contacts_matched += 1;
            if excluded.contains(&contact_id) {
                continue;
            }
            let has_email = contact
                .email
                .as_deref()
                .map(str::trim)
                .filter(|s| !s.is_empty())
                .is_some();
            if !has_email {
                contacts_no_email += 1;
                continue;
            }
            eligible_ids.insert(contact_id);
        }

        self.conn.execute("BEGIN IMMEDIATE", [])?;
        let result = (|| -> Result<SyncEphemeralCampaignResult> {
            let mut contacts_queued = 0u64;
            let mut contacts_cancelled = 0u64;

            for contact_id in &eligible_ids {
                let existing: Option<(i64, i64, i64)> = self
                    .conn
                    .query_row(
                        "SELECT id, email_envoye, COALESCE(email_annule, 0)
                         FROM contact_template_envois
                         WHERE contact_id = ?1 AND template_id = ?2
                           AND COALESCE(investissement_id, -1) = -1
                           AND COALESCE(campaign_batch_key, '') = ?3",
                        params![contact_id, template_id, batch_key],
                        |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)),
                    )
                    .ok();

                match existing {
                    Some((_row_id, sent, _cancelled)) if sent != 0 => {}
                    Some((row_id, _, _)) => {
                        self.conn.execute(
                            "UPDATE contact_template_envois SET email_date_prevue = ?1 WHERE id = ?2",
                            params![email_date_prevue, row_id],
                        )?;
                        contacts_queued += 1;
                    }
                    None => {
                        self.conn.execute(
                            "INSERT INTO contact_template_envois (
                                contact_id, template_id, investissement_id, trigger_event_at,
                                email_date_prevue, campaign_batch_key
                             ) VALUES (?1, ?2, NULL, ?3, ?4, ?5)",
                            params![contact_id, template_id, now, email_date_prevue, batch_key],
                        )?;
                        contacts_queued += 1;
                    }
                }
            }

            let mut cancel_stmt = self.conn.prepare(
                "SELECT id, contact_id FROM contact_template_envois
                 WHERE template_id = ?1
                   AND COALESCE(campaign_batch_key, '') = ?2
                   AND email_envoye = 0
                   AND COALESCE(email_annule, 0) = 0",
            )?;
            let pending = cancel_stmt.query_map(params![template_id, batch_key], |row| {
                Ok((row.get::<_, i64>(0)?, row.get::<_, i64>(1)?))
            })?;
            for row in pending {
                let (row_id, contact_id) = row?;
                if !eligible_ids.contains(&contact_id) {
                    self.conn.execute(
                        "DELETE FROM contact_template_envois WHERE id = ?1",
                        params![row_id],
                    )?;
                    contacts_cancelled += 1;
                }
            }

            cfg.status = "prepared".to_string();
            cfg.prepared_at = Some(now);
            let mut meta = parse_template_meta(tpl.variables.as_deref());
            meta[IS_EPHEMERAL_TEMPLATE_KEY] = json!(true);
            meta[EPHEMERAL_CAMPAIGN_KEY] = serde_json::to_value(&cfg).unwrap_or(json!({}));
            let next_vars = serde_json::to_string(&meta).unwrap_or_else(|_| "{}".to_string());
            self.conn.execute(
                "UPDATE templates_email SET variables = ?1, updated_at = unixepoch() WHERE id = ?2",
                params![next_vars, template_id],
            )?;

            Ok(SyncEphemeralCampaignResult {
                batch_key,
                contacts_matched,
                contacts_queued,
                contacts_cancelled,
                contacts_no_email,
                auto_archived: false,
                message: format!(
                    "{} contact(s) en file · {} sans email · {} retiré(s)",
                    contacts_queued, contacts_no_email, contacts_cancelled
                ),
            })
        })();

        match result {
            Ok(mut sync) => {
                self.conn.execute("COMMIT", [])?;
                if self.try_auto_archive_ephemeral_campaign(template_id)? {
                    sync.auto_archived = true;
                    sync.message.push_str(" · campagne archivée");
                }
                Ok(sync)
            }
            Err(e) => {
                let _ = self.conn.execute("ROLLBACK", []);
                Err(e)
            }
        }
    }

    fn cancel_ephemeral_pending_envois(&self, template_id: i64, batch_key: &str) -> Result<usize> {
        self.conn.execute(
            "DELETE FROM contact_template_envois
             WHERE template_id = ?1
               AND COALESCE(campaign_batch_key, '') = ?2
               AND email_envoye = 0",
            params![template_id, batch_key],
        )
    }

    /// Variantes tu / relance créées pour une campagne éphémère (modèles auxiliaires).
    fn ephemeral_linked_template_ids(&self, tpl: &super::models::TemplateEmail) -> Vec<i64> {
        let mut ids = Vec::new();
        if let Some(tu_id) = tpl.tutoiement_template_id {
            ids.push(tu_id);
        }
        if let Some(rel_id) = tpl.relance_template_id {
            if let Ok(rel_tpl) = self.get_template_email_by_id(rel_id) {
                if let Some(rel_tu_id) = rel_tpl.tutoiement_template_id {
                    ids.push(rel_tu_id);
                }
            }
            ids.push(rel_id);
        }
        ids
    }

    pub(crate) fn delete_ephemeral_linked_templates(
        &self,
        tpl: &super::models::TemplateEmail,
    ) -> Result<()> {
        let child_ids = self.ephemeral_linked_template_ids(tpl);
        self.conn.execute(
            "UPDATE templates_email SET tutoiement_template_id = NULL, relance_template_id = NULL WHERE id = ?1",
            params![tpl.id],
        )?;
        for child_id in child_ids {
            if self.template_linked_by_other_parent(child_id, tpl.id)? {
                continue;
            }
            self.delete_auxiliary_template_email(child_id)?;
        }
        Ok(())
    }

    pub fn archive_ephemeral_campaign(&self, template_id: i64) -> Result<()> {
        let tpl = self.get_template_email_by_id(template_id)?;
        let cfg = self
            .parse_ephemeral_campaign_config(tpl.variables.as_deref())
            .ok_or_else(|| {
                rusqlite::Error::InvalidParameterName("Modèle éphémère introuvable".into())
            })?;
        let batch_key = Self::ephemeral_batch_key(template_id, &cfg);
        self.cancel_ephemeral_pending_envois(template_id, &batch_key)?;

        let now = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_secs() as i64;
        self.patch_ephemeral_campaign_in_variables(template_id, |cfg| {
            cfg.status = "archived".to_string();
            cfg.archived_at = Some(now);
        })?;
        self.delete_ephemeral_linked_templates(&tpl)
    }

    pub(crate) fn try_auto_archive_ephemeral_campaign(&self, template_id: i64) -> Result<bool> {
        let tpl = self.get_template_email_by_id(template_id)?;
        let cfg = match self.parse_ephemeral_campaign_config(tpl.variables.as_deref()) {
            Some(c) if c.status != "archived" => c,
            _ => return Ok(false),
        };
        let batch_key = Self::ephemeral_batch_key(template_id, &cfg);

        let pending_unsent: i64 = self.conn.query_row(
            "SELECT COUNT(*) FROM contact_template_envois
             WHERE template_id = ?1
               AND COALESCE(campaign_batch_key, '') = ?2
               AND email_envoye = 0
               AND COALESCE(email_annule, 0) = 0",
            params![template_id, batch_key],
            |row| row.get(0),
        )?;
        if pending_unsent > 0 {
            return Ok(false);
        }

        let any_rows: i64 = self.conn.query_row(
            "SELECT COUNT(*) FROM contact_template_envois
             WHERE template_id = ?1 AND COALESCE(campaign_batch_key, '') = ?2",
            params![template_id, batch_key],
            |row| row.get(0),
        )?;
        if any_rows == 0 {
            return Ok(false);
        }

        self.archive_ephemeral_campaign(template_id)?;
        Ok(true)
    }
}

fn parse_template_meta(variables: Option<&str>) -> Value {
    variables
        .and_then(|s| serde_json::from_str::<Value>(s).ok())
        .and_then(|v| v.as_object().cloned())
        .map(Value::Object)
        .unwrap_or_else(|| json!({}))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::database::models::{NewContact, NewInvestissement};

    fn sample_contact(nom: &str, prenom: &str, email: &str) -> NewContact {
        NewContact {
            categorie: "CLIENT".into(),
            nom: nom.into(),
            prenom: prenom.into(),
            email: Some(email.into()),
            ..Default::default()
        }
    }

    fn scpi_inv(contact_id: i64, nom: &str, reinvest: bool) -> NewInvestissement {
        NewInvestissement {
            contact_id: Some(contact_id),
            foyer_id: None,
            type_produit: "SCPI".into(),
            partenaire_id: None,
            nom_produit: nom.into(),
            numero_contrat: None,
            montant_initial: None,
            date_souscription: None,
            date_fin_demembrement: None,
            date_fin_pret: None,
            mensualite_credit: None,
            credit_crd: None,
            loyer_mensuel: None,
            versement_programme: None,
            montant_versement_programme: None,
            frequence_versement: None,
            reinvestissement_dividendes: Some(reinvest),
            notes: None,
            origine: None,
        }
    }

    #[test]
    fn ephemeral_category_only_filleul_without_products() {
        let db = Database::open_in_memory_for_tests().unwrap();
        let audience = EphemeralCampaignAudience {
            categories: vec!["FILLEUL".into(), "FILLEUL_MANAGER".into()],
            types_produit: vec![],
            noms_produit: vec![],
            produits_match_mode: EphemeralProduitsMatchMode::All,
            reinvestissement_dividendes: EphemeralReinvestFilter::Any,
            versement_programme: EphemeralVersementProgrammeFilter::Any,
        };

        let mut filleul = sample_contact("MANAGER", "Alice", "a@example.com");
        filleul.categorie = "AUCUN".into();
        filleul.filleul_categorie = Some("FILLEUL".into());
        filleul.filleul_titre = Some("SENIOR".into());
        let c1 = db.create_contact(filleul).unwrap();
        let contact = db.get_contact_by_id(c1.id.unwrap()).unwrap();
        assert!(db
            .contact_matches_ephemeral_audience(&contact, &audience, None)
            .unwrap());

        let mut junior = sample_contact("JUNIOR", "Bob", "b@example.com");
        junior.categorie = "AUCUN".into();
        junior.filleul_categorie = Some("FILLEUL".into());
        junior.filleul_titre = Some("JUNIOR".into());
        let c2 = db.create_contact(junior).unwrap();
        let contact2 = db.get_contact_by_id(c2.id.unwrap()).unwrap();
        assert!(!db
            .contact_matches_ephemeral_audience(&contact2, &audience, None)
            .unwrap());
    }

    #[test]
    fn ephemeral_client_plus_filleul_filleul_sans_patrimoine() {
        let db = Database::open_in_memory_for_tests().unwrap();
        let audience = EphemeralCampaignAudience {
            categories: vec!["CLIENT".into(), "FILLEUL".into()],
            types_produit: vec!["SCPI".into()],
            noms_produit: vec![],
            produits_match_mode: EphemeralProduitsMatchMode::All,
            reinvestissement_dividendes: EphemeralReinvestFilter::Any,
            versement_programme: EphemeralVersementProgrammeFilter::Any,
        };

        let mut filleul_only = sample_contact("RESEAU", "Bob", "b@example.com");
        filleul_only.categorie = "AUCUN".into();
        filleul_only.filleul_categorie = Some("FILLEUL".into());
        let c1 = db.create_contact(filleul_only).unwrap();
        let contact = db.get_contact_by_id(c1.id.unwrap()).unwrap();
        assert!(db
            .contact_matches_ephemeral_audience(&contact, &audience, None)
            .unwrap());

        let client_no_scpi = db
            .create_contact(sample_contact("CLIENT", "Jean", "j@example.com"))
            .unwrap();
        let c2_id = client_no_scpi.id.unwrap();
        let contact2 = db.get_contact_by_id(c2_id).unwrap();
        assert!(!db
            .contact_matches_ephemeral_audience(&contact2, &audience, None)
            .unwrap());
    }

    fn ephemeral_audience_all_scpi(noms: &[&str]) -> EphemeralCampaignAudience {
        EphemeralCampaignAudience {
            categories: vec!["CLIENT".to_string()],
            types_produit: vec!["SCPI".to_string()],
            noms_produit: noms.iter().map(|s| s.to_string()).collect(),
            produits_match_mode: EphemeralProduitsMatchMode::All,
            reinvestissement_dividendes: EphemeralReinvestFilter::Inactive,
            versement_programme: EphemeralVersementProgrammeFilter::Any,
        }
    }

    fn scpi_inv_with_options(
        contact_id: i64,
        nom: &str,
        reinvest: bool,
        versement_programme: bool,
    ) -> NewInvestissement {
        let mut inv = scpi_inv(contact_id, nom, reinvest);
        inv.versement_programme = Some(versement_programme);
        inv
    }

    #[test]
    fn ephemeral_requires_all_products_and_one_without_reinvest() {
        let db = Database::open_in_memory_for_tests().unwrap();
        let audience = ephemeral_audience_all_scpi(&["Epargne Pierre", "Epargne Pierre Europe"]);

        let c1 = db
            .create_contact(sample_contact("ALPHA", "Jean", "a@example.com"))
            .unwrap();
        let c1_id = c1.id.expect("contact id");
        db.create_investissement(scpi_inv(c1_id, "Epargne Pierre", true))
            .unwrap();
        db.create_investissement(scpi_inv(c1_id, "Epargne Pierre Europe", false))
            .unwrap();
        let contact = db.get_contact_by_id(c1_id).unwrap();
        assert!(db
            .contact_matches_ephemeral_audience(&contact, &audience, None)
            .unwrap());

        let c2 = db
            .create_contact(sample_contact("BETA", "Luc", "b@example.com"))
            .unwrap();
        let c2_id = c2.id.expect("contact id");
        db.create_investissement(scpi_inv(c2_id, "Epargne Pierre", true))
            .unwrap();
        db.create_investissement(scpi_inv(c2_id, "Epargne Pierre Europe", true))
            .unwrap();
        let contact2 = db.get_contact_by_id(c2_id).unwrap();
        assert!(!db
            .contact_matches_ephemeral_audience(&contact2, &audience, None)
            .unwrap());

        let c3 = db
            .create_contact(sample_contact("GAMMA", "Paul", "c@example.com"))
            .unwrap();
        let c3_id = c3.id.expect("contact id");
        db.create_investissement(scpi_inv(c3_id, "Epargne Pierre", false))
            .unwrap();
        let contact3 = db.get_contact_by_id(c3_id).unwrap();
        assert!(!db
            .contact_matches_ephemeral_audience(&contact3, &audience, None)
            .unwrap());
    }

    fn ephemeral_template_variables(audience: &EphemeralCampaignAudience) -> String {
        let cfg = EphemeralCampaignConfig {
            status: "draft".to_string(),
            batch_key: None,
            audience: audience.clone(),
            excluded_contact_ids: vec![],
            send_at: None,
            prepared_at: None,
            archived_at: None,
        };
        let mut meta = json!({ IS_EPHEMERAL_TEMPLATE_KEY: true });
        meta[EPHEMERAL_CAMPAIGN_KEY] = serde_json::to_value(&cfg).unwrap();
        meta.to_string()
    }

    fn create_ephemeral_template(
        db: &Database,
        audience: &EphemeralCampaignAudience,
    ) -> i64 {
        use crate::database::models::NewTemplateEmail;
        db.create_template_email(NewTemplateEmail {
            nom: "Campagne test".into(),
            sujet: "Objet".into(),
            corps: "Corps".into(),
            categorie: "INFO".into(),
            variables: Some(ephemeral_template_variables(audience)),
            agenda_link_id: None,
            relance_template_id: None,
            tutoiement_template_id: None,
        })
        .unwrap()
        .id
    }

    #[test]
    fn ephemeral_sync_skips_cancelled_and_deletes_ineligible() {
        let db = Database::open_in_memory_for_tests().unwrap();
        let audience = ephemeral_audience_all_scpi(&["Epargne Pierre"]);
        let template_id = create_ephemeral_template(&db, &audience);

        let c1 = db
            .create_contact(sample_contact("ALPHA", "Jean", "a@example.com"))
            .unwrap();
        let c1_id = c1.id.expect("contact id");
        db.create_investissement(scpi_inv(c1_id, "Epargne Pierre", false))
            .unwrap();

        let c2 = db
            .create_contact(sample_contact("BETA", "Luc", "b@example.com"))
            .unwrap();
        let c2_id = c2.id.expect("contact id");
        db.create_investissement(scpi_inv(c2_id, "Epargne Pierre", false))
            .unwrap();

        db.sync_ephemeral_campaign_queue(template_id).unwrap();

        let row_c1: i64 = db
            .conn
            .query_row(
                "SELECT id FROM contact_template_envois WHERE contact_id = ?1 AND template_id = ?2",
                params![c1_id, template_id],
                |row| row.get(0),
            )
            .unwrap();
        db.conn
            .execute(
                "UPDATE contact_template_envois SET email_annule = 1 WHERE id = ?1",
                params![row_c1],
            )
            .unwrap();

        db.sync_ephemeral_campaign_queue(template_id).unwrap();

        let cancelled: i64 = db
            .conn
            .query_row(
                "SELECT COALESCE(email_annule, 0) FROM contact_template_envois WHERE id = ?1",
                params![row_c1],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(cancelled, 1);

        db.conn
            .execute(
                "UPDATE investissements SET nom_produit = 'Autre SCPI' WHERE contact_id = ?1",
                params![c2_id],
            )
            .unwrap();
        db.sync_ephemeral_campaign_queue(template_id).unwrap();

        let c2_rows: i64 = db
            .conn
            .query_row(
                "SELECT COUNT(*) FROM contact_template_envois WHERE contact_id = ?1 AND template_id = ?2",
                params![c2_id, template_id],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(c2_rows, 0);
    }

    #[test]
    fn ephemeral_delete_blocked_until_archived() {
        let db = Database::open_in_memory_for_tests().unwrap();
        let audience = ephemeral_audience_all_scpi(&["Epargne Pierre"]);
        let template_id = create_ephemeral_template(&db, &audience);

        assert!(db.delete_template_email(template_id).is_err());
        db.archive_ephemeral_campaign(template_id).unwrap();
        db.delete_template_email(template_id).unwrap();
    }

    #[test]
    fn ephemeral_archive_removes_linked_tutoiement_from_library() {
        use crate::database::models::NewTemplateEmail;

        let db = Database::open_in_memory_for_tests().unwrap();
        let audience = ephemeral_audience_all_scpi(&["Epargne Pierre"]);
        let template_id = create_ephemeral_template(&db, &audience);
        let tu = db
            .create_template_email(NewTemplateEmail {
                nom: "Campagne test (tu)".into(),
                sujet: "Objet tu".into(),
                corps: "Corps tu".into(),
                categorie: "INFO".into(),
                variables: None,
                agenda_link_id: None,
                relance_template_id: None,
                tutoiement_template_id: None,
            })
            .unwrap();
        let parent = db.get_template_email_by_id(template_id).unwrap();
        db.update_template_email(
            template_id,
            &NewTemplateEmail {
                nom: parent.nom,
                sujet: parent.sujet,
                corps: parent.corps,
                categorie: parent.categorie,
                variables: parent.variables,
                agenda_link_id: parent.agenda_link_id,
                relance_template_id: parent.relance_template_id,
                tutoiement_template_id: Some(tu.id),
            },
        )
        .unwrap();

        db.archive_ephemeral_campaign(template_id).unwrap();

        let visible = db.get_all_templates_email().unwrap();
        assert!(visible.iter().all(|t| t.id != template_id && t.id != tu.id));
        assert!(db.get_template_email_by_id(tu.id).is_err());
    }

    #[test]
    fn ephemeral_archive_keeps_shared_tutoiement_used_by_permanent() {
        use crate::database::models::NewTemplateEmail;

        let db = Database::open_in_memory_for_tests().unwrap();
        let audience = ephemeral_audience_all_scpi(&["Epargne Pierre"]);
        let tu = db
            .create_template_email(NewTemplateEmail {
                nom: "Suivi (tu)".into(),
                sujet: "Objet tu".into(),
                corps: "Corps tu".into(),
                categorie: "SUIVI_ANNUEL".into(),
                variables: None,
                agenda_link_id: None,
                relance_template_id: None,
                tutoiement_template_id: None,
            })
            .unwrap();
        let permanent_id = db
            .create_template_email(NewTemplateEmail {
                nom: "Suivi permanent".into(),
                sujet: "Objet".into(),
                corps: "Corps".into(),
                categorie: "SUIVI_ANNUEL".into(),
                variables: None,
                agenda_link_id: None,
                relance_template_id: None,
                tutoiement_template_id: Some(tu.id),
            })
            .unwrap()
            .id;
        let ephemeral_id = create_ephemeral_template(&db, &audience);
        let parent = db.get_template_email_by_id(ephemeral_id).unwrap();
        db.update_template_email(
            ephemeral_id,
            &NewTemplateEmail {
                nom: parent.nom,
                sujet: parent.sujet,
                corps: parent.corps,
                categorie: parent.categorie,
                variables: parent.variables,
                agenda_link_id: parent.agenda_link_id,
                relance_template_id: parent.relance_template_id,
                tutoiement_template_id: Some(tu.id),
            },
        )
        .unwrap();

        db.archive_ephemeral_campaign(ephemeral_id).unwrap();

        assert!(db.get_template_email_by_id(tu.id).is_ok());
        let permanent = db.get_template_email_by_id(permanent_id).unwrap();
        assert_eq!(permanent.tutoiement_template_id, Some(tu.id));
    }

    #[test]
    fn ephemeral_config_deserializes_snake_case_from_ui() {
        let json = r#"{
            "status": "draft",
            "batch_key": null,
            "audience": {
                "categories": ["CLIENT"],
                "types_produit": ["SCPI"],
                "noms_produit": ["Epargne Pierre"],
                "produits_match_mode": "all",
                "reinvestissement_dividendes": "inactive",
                "versement_programme": "active"
            },
            "excluded_contact_ids": [12],
            "send_at": null,
            "prepared_at": null,
            "archived_at": null
        }"#;
        let cfg: EphemeralCampaignConfig = serde_json::from_str(json).unwrap();
        assert_eq!(cfg.excluded_contact_ids, vec![12]);
        assert_eq!(cfg.audience.noms_produit, vec!["Epargne Pierre"]);
        assert_eq!(
            cfg.audience.versement_programme,
            EphemeralVersementProgrammeFilter::Active
        );
    }

    #[test]
    fn ephemeral_archive_clears_pending_queue() {
        let db = Database::open_in_memory_for_tests().unwrap();
        let audience = ephemeral_audience_all_scpi(&["Epargne Pierre"]);
        let template_id = create_ephemeral_template(&db, &audience);
        let c1 = db
            .create_contact(sample_contact("ALPHA", "Jean", "a@example.com"))
            .unwrap();
        let c1_id = c1.id.expect("contact id");
        db.create_investissement(scpi_inv(c1_id, "Epargne Pierre", false))
            .unwrap();
        db.sync_ephemeral_campaign_queue(template_id).unwrap();

        let pending_before: i64 = db
            .conn
            .query_row(
                "SELECT COUNT(*) FROM contact_template_envois
                 WHERE template_id = ?1 AND email_envoye = 0",
                params![template_id],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(pending_before, 1);

        db.archive_ephemeral_campaign(template_id).unwrap();

        let pending_after: i64 = db
            .conn
            .query_row(
                "SELECT COUNT(*) FROM contact_template_envois
                 WHERE template_id = ?1 AND email_envoye = 0",
                params![template_id],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(pending_after, 0);
    }

    #[test]
    fn ephemeral_auto_archives_after_all_sent_without_waiting_reply() {
        let db = Database::open_in_memory_for_tests().unwrap();
        let audience = ephemeral_audience_all_scpi(&["Epargne Pierre"]);
        let template_id = create_ephemeral_template(&db, &audience);
        let c1 = db
            .create_contact(sample_contact("ALPHA", "Jean", "a@example.com"))
            .unwrap();
        let c1_id = c1.id.expect("contact id");
        db.create_investissement(scpi_inv(c1_id, "Epargne Pierre", false))
            .unwrap();
        db.sync_ephemeral_campaign_queue(template_id).unwrap();

        let row_id: i64 = db
            .conn
            .query_row(
                "SELECT id FROM contact_template_envois WHERE contact_id = ?1 AND template_id = ?2",
                params![c1_id, template_id],
                |row| row.get(0),
            )
            .unwrap();

        db.mark_template_email_sent(row_id, None, None, Some("Objet"), None, None, None)
            .unwrap();

        let cfg = db
            .parse_ephemeral_campaign_config(
                db.get_template_email_by_id(template_id)
                    .unwrap()
                    .variables
                    .as_deref(),
            )
            .unwrap();
        assert_eq!(cfg.status, "archived");
    }

    #[test]
    fn ephemeral_versement_programme_filter_any_product_type() {
        let db = Database::open_in_memory_for_tests().unwrap();
        let mut audience = ephemeral_audience_all_scpi(&["Fonds Test"]);
        audience.types_produit = vec!["OPCVM".to_string()];
        audience.reinvestissement_dividendes = EphemeralReinvestFilter::Any;
        audience.versement_programme = EphemeralVersementProgrammeFilter::Inactive;

        let c1 = db
            .create_contact(sample_contact("ALPHA", "Jean", "a@example.com"))
            .unwrap();
        let c1_id = c1.id.expect("contact id");
        let mut inv = scpi_inv_with_options(c1_id, "Fonds Test", false, false);
        inv.type_produit = "OPCVM".into();
        db.create_investissement(inv).unwrap();

        let c2 = db
            .create_contact(sample_contact("BETA", "Luc", "b@example.com"))
            .unwrap();
        let c2_id = c2.id.expect("contact id");
        let mut inv2 = scpi_inv_with_options(c2_id, "Fonds Test", false, true);
        inv2.type_produit = "OPCVM".into();
        db.create_investissement(inv2).unwrap();

        let contact1 = db.get_contact_by_id(c1_id).unwrap();
        let contact2 = db.get_contact_by_id(c2_id).unwrap();
        assert!(db
            .contact_matches_ephemeral_audience(&contact1, &audience, None)
            .unwrap());
        assert!(!db
            .contact_matches_ephemeral_audience(&contact2, &audience, None)
            .unwrap());
    }
}
