//! Moteur d'étiquettes automatiques — recalcul complet ou incrémental (1000+ contacts).

use super::{
    email_schedule::resolve_email_date_prevue_for_contact,
    models::{Contact, Etiquette},
    Database,
};
use rusqlite::{params, Result};
use std::collections::{HashMap, HashSet};

type AssignmentKey = (i64, i64);
type AssignmentInfo = (i64, String);

/// Options recalc complet vs incrémental (1 contact).
struct SyncAutoPairOpts<'a> {
    log_eval: bool,
    exclusions: Option<&'a HashSet<(i64, i64)>>,
}

impl Default for SyncAutoPairOpts<'_> {
    fn default() -> Self {
        Self {
            log_eval: true,
            exclusions: None,
        }
    }
}

impl Database {
    pub(crate) fn etiquette_has_auto_rule(etiquette: &Etiquette) -> bool {
        etiquette.segment_id.is_some()
            || etiquette
                .auto_condition_type
                .as_ref()
                .map(|t| !t.trim().is_empty())
                .unwrap_or(false)
    }

    fn auto_etiquettes_table_exists(&self) -> Result<bool> {
        let table_exists: i64 = self
            .conn
            .query_row(
                "SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name='etiquettes'",
                [],
                |row| row.get(0),
            )
            .unwrap_or(0);
        Ok(table_exists > 0)
    }

    pub(crate) fn auto_etiquette_now_and_month() -> (i64, i32) {
        let now = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_secs() as i64;
        let current_month = chrono::DateTime::from_timestamp(now, 0)
            .unwrap_or_else(chrono::Utc::now)
            .format("%m")
            .to_string()
            .parse::<i32>()
            .unwrap_or(1);
        (now, current_month)
    }

    fn parse_auto_categories(etiquette: &Etiquette) -> Vec<String> {
        etiquette
            .auto_categories
            .as_ref()
            .and_then(|c| serde_json::from_str(c).ok())
            .unwrap_or_default()
    }

    pub(crate) fn contact_matches_auto_categories(contact: &Contact, categories: &[String]) -> bool {
        if categories.is_empty() {
            return false;
        }
        let cat_match = categories.iter().any(|c| c == &contact.categorie);
        let filleul_match = contact
            .filleul_categorie
            .as_ref()
            .map(|fc| categories.iter().any(|c| c == fc))
            .unwrap_or(false);
        cat_match || filleul_match
    }

    fn load_auto_assignment_map(&self) -> Result<HashMap<AssignmentKey, AssignmentInfo>> {
        let mut map = HashMap::new();
        let mut stmt = self.conn.prepare(
            "SELECT contact_id, etiquette_id, id, COALESCE(attribue_par, '') FROM contact_etiquettes",
        )?;
        let rows = stmt.query_map([], |row| {
            Ok((
                (row.get::<_, i64>(0)?, row.get::<_, i64>(1)?),
                (row.get(2)?, row.get(3)?),
            ))
        })?;
        for row in rows {
            let (key, info) = row?;
            map.insert(key, info);
        }
        Ok(map)
    }

    fn load_auto_exclusion_set(&self) -> Result<HashSet<(i64, i64)>> {
        let mut set = HashSet::new();
        let mut stmt = self
            .conn
            .prepare("SELECT contact_id, etiquette_id FROM contact_etiquette_auto_exclusions")?;
        let rows = stmt.query_map([], |row| {
            Ok((row.get::<_, i64>(0)?, row.get::<_, i64>(1)?))
        })?;
        for row in rows {
            set.insert(row?);
        }
        Ok(set)
    }

    fn get_assignment_from_map(
        map: &HashMap<AssignmentKey, AssignmentInfo>,
        contact_id: i64,
        etiquette_id: i64,
    ) -> Option<AssignmentInfo> {
        map.get(&(contact_id, etiquette_id)).cloned()
    }

    /// Recalc bulk : skip si catégorie incompatible, sauf retrait AUTO ou contact en pause/archivé.
    fn should_skip_bulk_auto_pair(
        contact: &Contact,
        etiquette_id: i64,
        categories: &[String],
        assignments: &HashMap<AssignmentKey, AssignmentInfo>,
    ) -> bool {
        if categories.is_empty() || Self::contact_matches_auto_categories(contact, categories) {
            return false;
        }
        let Some(contact_id) = contact.id else {
            return true;
        };
        if contact.statut_suivi == "EN_PAUSE" || contact.statut_suivi == "ARCHIVE" {
            return false;
        }
        match Self::get_assignment_from_map(assignments, contact_id, etiquette_id) {
            Some((_, source)) if source.eq_ignore_ascii_case("AUTO") => false,
            _ => true,
        }
    }

    pub(crate) fn evaluate_auto_etiquette_condition(
        &self,
        contact: &Contact,
        contact_id: i64,
        condition_type: &str,
        config: Option<&String>,
        categories: &[String],
        now: i64,
        current_month: i32,
    ) -> Result<bool> {
        let should_assign = match condition_type {
            "DELAI_SANS_CONTACT" => {
                if let Some(config_str) = config {
                    if let Ok(parsed) = serde_json::from_str::<serde_json::Value>(config_str) {
                        let jours = parsed["jours"].as_i64().unwrap_or(365);
                        let inclure_sans_date = parsed["inclure_sans_date"].as_bool().unwrap_or(true);
                        let filleul_only = categories.iter().any(|c| c.contains("FILLEUL"))
                            && !categories.iter().any(|c| {
                                c == "CLIENT" || c == "PROSPECT_CLIENT" || c == "SUSPECT_CLIENT"
                            });
                        let last_contact = if filleul_only {
                            contact.date_dernier_contact_filleul
                        } else {
                            contact.date_dernier_contact
                        };
                        if let Some(last_contact) = last_contact {
                            let diff_days = (now - last_contact) / (24 * 60 * 60);
                            diff_days >= jours
                        } else {
                            inclure_sans_date
                        }
                    } else {
                        false
                    }
                } else {
                    false
                }
            }
            // Champs contact uniquement — pas date_fin_demembrement (voir DATE_APPROCHE_INVESTISSEMENT).
            "DATE_APPROCHE" => {
                if let Some(config_str) = config {
                    if let Ok(parsed) = serde_json::from_str::<serde_json::Value>(config_str) {
                        let champ = parsed["champ"].as_str().unwrap_or("");
                        let jours_avant = parsed["jours_avant"].as_i64().unwrap_or(30);
                        let date_value = match champ {
                            "date_prochain_suivi" => contact.date_prochain_suivi,
                            "date_prochain_suivi_filleul" => contact.date_prochain_suivi_filleul,
                            "date_dernier_contact_filleul" => contact.date_dernier_contact_filleul,
                            "date_naissance" => contact.date_naissance,
                            _ => None,
                        };
                        if let Some(target_date) = date_value {
                            let diff_seconds = target_date - now;
                            let diff_days = diff_seconds / (24 * 60 * 60);
                            diff_days >= 0 && diff_days <= jours_avant
                        } else {
                            false
                        }
                    } else {
                        false
                    }
                } else {
                    false
                }
            }
            "PERIODE_ANNEE" => {
                if let Some(config_str) = config {
                    if let Ok(parsed) = serde_json::from_str::<serde_json::Value>(config_str) {
                        let mois_debut = parsed["mois_debut"].as_i64().unwrap_or(1) as i32;
                        let mois_fin = parsed["mois_fin"].as_i64().unwrap_or(12) as i32;
                        if mois_debut <= mois_fin {
                            current_month >= mois_debut && current_month <= mois_fin
                        } else {
                            current_month >= mois_debut || current_month <= mois_fin
                        }
                    } else {
                        false
                    }
                } else {
                    false
                }
            }
            "TYPE_PRODUIT" => {
                if let Some(config_str) = config {
                    if let Ok(parsed) = serde_json::from_str::<serde_json::Value>(config_str) {
                        let types: Vec<String> = parsed["types"]
                            .as_array()
                            .map(|arr| {
                                arr.iter()
                                    .filter_map(|v| v.as_str().map(String::from))
                                    .collect()
                            })
                            .unwrap_or_default();
                        self.contact_has_investment_types(contact_id, contact.foyer_id, &types)
                            .unwrap_or(false)
                    } else {
                        false
                    }
                } else {
                    false
                }
            }
            "DATE_APPROCHE_INVESTISSEMENT" => {
                if let Some(config_str) = config {
                    if let Ok(parsed) = serde_json::from_str::<serde_json::Value>(config_str) {
                        let champ = parsed["champ"].as_str().unwrap_or("");
                        let jours_avant = parsed["jours_avant"].as_i64().unwrap_or(180);
                        let types_produit: Vec<String> = parsed["types_produit"]
                            .as_array()
                            .map(|arr| {
                                arr.iter()
                                    .filter_map(|v| v.as_str().map(String::from))
                                    .collect()
                            })
                            .unwrap_or_default();
                        self.contact_has_investment_date_approaching(
                            contact_id,
                            contact.foyer_id,
                            champ,
                            jours_avant,
                            &types_produit,
                            now,
                        )
                        .unwrap_or(false)
                    } else {
                        false
                    }
                } else {
                    false
                }
            }
            "JAMAIS_CONTACT" => {
                let filleul_only = categories.iter().any(|c| c.contains("FILLEUL"))
                    && !categories.iter().any(|c| {
                        c == "CLIENT" || c == "PROSPECT_CLIENT" || c == "SUSPECT_CLIENT"
                    });
                let last = if filleul_only {
                    contact.date_dernier_contact_filleul
                } else {
                    contact.date_dernier_contact
                };
                last.is_none()
            }
            "A_ETIQUETTE" => {
                if let Some(config_str) = config {
                    if let Ok(parsed) = serde_json::from_str::<serde_json::Value>(config_str) {
                        let etiquette_id = parsed["etiquette_id"].as_i64().unwrap_or(0);
                        let present = parsed["present"].as_bool().unwrap_or(true);
                        if etiquette_id <= 0 {
                            return Ok(false);
                        }
                        let has: i64 = self.conn.query_row(
                            "SELECT COUNT(*) FROM contact_etiquettes WHERE contact_id = ?1 AND etiquette_id = ?2",
                            params![contact_id, etiquette_id],
                            |row| row.get(0),
                        )?;
                        return Ok(if present { has > 0 } else { has == 0 });
                    }
                }
                false
            }
            // Champ personnalisé du contact (texte stocké, comparaison insensible à la casse).
            "CHAMP_PERSO" => {
                if let Some(config_str) = config {
                    if let Ok(parsed) = serde_json::from_str::<serde_json::Value>(config_str) {
                        let field_key = parsed["field_key"].as_str().unwrap_or("");
                        if field_key.is_empty() {
                            return Ok(false);
                        }
                        let operator = parsed["operator"].as_str().unwrap_or("rempli");
                        let target = parsed["value"].as_str().unwrap_or("").trim().to_lowercase();
                        let current = self
                            .get_contact_custom_value_by_key(contact_id, field_key)?
                            .map(|v| v.trim().to_string())
                            .filter(|v| !v.is_empty());
                        let current_lc = current.as_ref().map(|v| v.to_lowercase());
                        match operator {
                            "rempli" => current.is_some(),
                            "vide" => current.is_none(),
                            "egal" => current_lc.as_deref() == Some(target.as_str()),
                            "different" => current_lc.as_deref() != Some(target.as_str()),
                            "contient" => {
                                current_lc.map(|v| v.contains(&target)).unwrap_or(false)
                            }
                            _ => false,
                        }
                    } else {
                        false
                    }
                } else {
                    false
                }
            }
            // Déclenché uniquement à l'enregistrement d'une souscription (voir apply_souscription_event_etiquettes).
            "EVENEMENT_SOUSCRIPTION" => false,
            "AGE_APPROCHE" => {
                if let Some(config_str) = config {
                    if let Ok(parsed) = serde_json::from_str::<serde_json::Value>(config_str) {
                        let age_cible = parsed["age"].as_i64().unwrap_or(69);
                        let jours_avant = parsed["jours_avant"].as_i64().unwrap_or(30);
                        if let Some(date_naissance) = contact.date_naissance {
                            use chrono::{DateTime, Datelike, Utc};
                            let birth = DateTime::<Utc>::from_timestamp(date_naissance, 0);
                            if let Some(birth_dt) = birth {
                                let target_year = birth_dt.year() + age_cible as i32;
                                if let Some(target_birthday) =
                                    birth_dt.with_year(target_year).map(|d| d.timestamp())
                                {
                                    let diff_seconds = target_birthday - now;
                                    let diff_days = diff_seconds / (24 * 60 * 60);
                                    diff_days >= 0 && diff_days <= jours_avant
                                } else {
                                    false
                                }
                            } else {
                                false
                            }
                        } else {
                            false
                        }
                    } else {
                        false
                    }
                } else {
                    false
                }
            }
            _ => false,
        };
        Ok(should_assign)
    }

    fn apply_auto_etiquette_decision(
        &self,
        contact_id: i64,
        etiquette_id: i64,
        should_assign: bool,
        assignment_info: Option<AssignmentInfo>,
        assignments: Option<&mut HashMap<AssignmentKey, AssignmentInfo>>,
        now: i64,
    ) -> Result<usize> {
        let mut newly_assigned = 0;
        match (should_assign, assignment_info) {
            (true, None) => {
                if self
                    .attribuer_etiquette(contact_id, etiquette_id, Some("AUTO".to_string()), None)
                    .is_ok()
                {
                    newly_assigned = 1;
                    // Action « tâche » éventuelle (dédupliquée par liaison).
                    let _ = self.apply_etiquette_tache_action(contact_id, etiquette_id, now);
                    if let Some(map) = assignments {
                        if let Ok(row) = self.conn.query_row(
                            "SELECT id, COALESCE(attribue_par, '') FROM contact_etiquettes WHERE contact_id = ?1 AND etiquette_id = ?2",
                            params![contact_id, etiquette_id],
                            |row| Ok((row.get(0)?, row.get(1)?)),
                        ) {
                            map.insert((contact_id, etiquette_id), row);
                        }
                    }
                }
            }
            (true, Some((assignment_id, _source))) => {
                if !should_assign {
                    return Ok(newly_assigned);
                }
                if let Ok((email_envoye, email_annule, email_suivi_ignore, date_attr)) =
                    self.conn.query_row(
                        "SELECT email_envoye, COALESCE(email_annule, 0), COALESCE(email_suivi_ignore, 0),
                                date_attribution
                         FROM contact_etiquettes WHERE id = ?1",
                        params![assignment_id],
                        |row| {
                            Ok((
                                row.get::<_, i64>(0)?,
                                row.get::<_, i64>(1)?,
                                row.get::<_, i64>(2)?,
                                row.get::<_, i64>(3)?,
                            ))
                        },
                    )
                {
                    if email_suivi_ignore != 0 {
                        return Ok(newly_assigned);
                    }
                    // Envoi retiré manuellement (email_annule) : ne pas remettre en file au
                    // recalcul auto — l'utilisateur choisit « Remettre en file » ou ✕ définitif.
                    if email_envoye == 0 && email_annule != 0 {
                        return Ok(newly_assigned);
                    } else if email_envoye != 0 {
                        let _ = self.try_reopen_sent_campaign_if_still_eligible(
                            assignment_id,
                            etiquette_id,
                        );
                    } else if let Ok(etiquette) = self.get_etiquette_by_id(etiquette_id) {
                        if etiquette.email_actif {
                            let prevue =
                                resolve_email_date_prevue_for_contact(&etiquette, date_attr);
                            let _ = self.conn.execute(
                                "UPDATE contact_etiquettes SET email_date_prevue = ?1
                                 WHERE id = ?2 AND email_envoye = 0 AND COALESCE(email_annule, 0) = 0
                                   AND COALESCE(email_suivi_ignore, 0) = 0",
                                params![prevue, assignment_id],
                            );
                        }
                    }
                }
            }
            (false, Some((assignment_id, source))) if source == "AUTO" => {
                let _ = self.conn.execute(
                    "DELETE FROM contact_etiquettes WHERE id = ?1",
                    params![assignment_id],
                );
                if let Some(map) = assignments {
                    map.remove(&(contact_id, etiquette_id));
                }
            }
            _ => {}
        }
        Ok(newly_assigned)
    }

    fn lookup_assignment(
        &self,
        contact_id: i64,
        etiquette_id: i64,
        assignments: Option<&HashMap<AssignmentKey, AssignmentInfo>>,
    ) -> Option<AssignmentInfo> {
        if let Some(map) = assignments {
            return Self::get_assignment_from_map(map, contact_id, etiquette_id);
        }
        self.conn
            .query_row(
                "SELECT id, COALESCE(attribue_par, '') FROM contact_etiquettes WHERE contact_id = ?1 AND etiquette_id = ?2",
                params![contact_id, etiquette_id],
                |row| Ok((row.get(0)?, row.get(1)?)),
            )
            .ok()
    }

    fn sync_auto_pair(
        &self,
        contact: &Contact,
        etiquette: &Etiquette,
        now: i64,
        current_month: i32,
        assignments: Option<&mut HashMap<AssignmentKey, AssignmentInfo>>,
        opts: &SyncAutoPairOpts<'_>,
    ) -> Result<usize> {
        let contact_id = match contact.id {
            Some(id) => id,
            None => return Ok(0),
        };
        let excluded = if let Some(set) = opts.exclusions {
            set.contains(&(contact_id, etiquette.id))
        } else {
            self.is_auto_etiquette_excluded(contact_id, etiquette.id)?
        };
        if excluded {
            return Ok(0);
        }
        if contact.statut_suivi == "EN_PAUSE" || contact.statut_suivi == "ARCHIVE" {
            let assignment_info =
                self.lookup_assignment(contact_id, etiquette.id, assignments.as_deref());
            return self.apply_auto_etiquette_decision(
                contact_id,
                etiquette.id,
                false,
                assignment_info,
                assignments,
                now,
            );
        }
        let Some(rule) = self.resolve_etiquette_auto_rule(etiquette)? else {
            return Ok(0);
        };
        let assignment_info =
            self.lookup_assignment(contact_id, etiquette.id, assignments.as_deref());
        let should_assign =
            self.contact_matches_rule_tree(contact, &rule.tree, now, current_month)?;
        if opts.log_eval {
            let _ = self.log_auto_etiquette_event(
                contact_id,
                etiquette.id,
                should_assign,
                if should_assign {
                    "rule_match"
                } else {
                    "rule_no_match"
                },
            );
        }
        self.apply_auto_etiquette_decision(
            contact_id,
            etiquette.id,
            should_assign,
            assignment_info,
            assignments,
            now,
        )
    }

    fn check_and_apply_auto_etiquettes_inner(&self) -> Result<usize> {
        let _ = self.ensure_default_etiquettes();
        let (now, current_month) = Self::auto_etiquette_now_and_month();
        let mut total_assigned = 0;
        let mut assignments = self.load_auto_assignment_map()?;
        let exclusions = self.load_auto_exclusion_set()?;
        let bulk_opts = SyncAutoPairOpts {
            log_eval: false,
            exclusions: Some(&exclusions),
        };

        let etiquettes = self.get_all_etiquettes()?;
        let auto_etiquettes: Vec<_> = etiquettes
            .into_iter()
            .filter(|e| e.actif && Self::etiquette_has_auto_rule(e))
            .collect();
        let contacts = self.get_all_contacts()?;

        for etiquette in &auto_etiquettes {
            let categories = Self::parse_auto_categories(etiquette);
            for contact in &contacts {
                if Self::should_skip_bulk_auto_pair(contact, etiquette.id, &categories, &assignments)
                {
                    continue;
                }
                total_assigned += self.sync_auto_pair(
                    contact,
                    etiquette,
                    now,
                    current_month,
                    Some(&mut assignments),
                    &bulk_opts,
                )?;
            }
        }

        let _ = self.sync_pending_email_dates_for_all_active_campaigns();

        for contact in &contacts {
            if let Some(cid) = contact.id {
                total_assigned += self.sync_template_email_triggers_for_contact(cid)?;
            }
        }

        if total_assigned > 0 {
            println!(
                "🏷️ Moteur automatique (complet): {} nouvelles attributions",
                total_assigned
            );
        }
        Ok(total_assigned)
    }

    /// Recalcul complet (import, bouton « Recalculer ») — transaction SQLite.
    pub fn check_and_apply_auto_etiquettes(&self) -> Result<usize> {
        if !self.auto_etiquettes_table_exists()? {
            return Ok(0);
        }
        self.conn.execute("BEGIN IMMEDIATE", [])?;
        match self.check_and_apply_auto_etiquettes_inner() {
            Ok(n) => {
                self.conn.execute("COMMIT", [])?;
                Ok(n)
            }
            Err(e) => {
                let _ = self.conn.execute("ROLLBACK", []);
                Err(e)
            }
        }
    }

    /// Recalcul pour un seul contact (~8 règles max).
    pub fn check_auto_etiquettes_for_contact(&self, contact_id: i64) -> Result<usize> {
        if !self.auto_etiquettes_table_exists()? {
            return Ok(0);
        }
        let contact = self.get_contact_by_id(contact_id)?;
        let (now, current_month) = Self::auto_etiquette_now_and_month();
        let mut total = 0;
        let etiquettes = self.get_all_etiquettes()?;
        for etiquette in etiquettes
            .into_iter()
            .filter(|e| e.actif && Self::etiquette_has_auto_rule(e))
        {
            total += self.sync_auto_pair(
                &contact,
                &etiquette,
                now,
                current_month,
                None,
                &SyncAutoPairOpts::default(),
            )?;
        }
        total += self.sync_template_email_triggers_for_contact(contact_id)?;
        Ok(total)
    }

    /// Recalcul pour une étiquette auto (après modification de règle).
    pub fn check_auto_etiquettes_for_etiquette(&self, etiquette_id: i64) -> Result<usize> {
        if !self.auto_etiquettes_table_exists()? {
            return Ok(0);
        }
        let etiquette = self.get_etiquette_by_id(etiquette_id)?;
        if !etiquette.actif || !Self::etiquette_has_auto_rule(&etiquette) {
            return Ok(0);
        }
        let (now, current_month) = Self::auto_etiquette_now_and_month();
        let mut total = 0;
        let mut assignments = self.load_auto_assignment_map()?;
        let exclusions = self.load_auto_exclusion_set()?;
        let bulk_opts = SyncAutoPairOpts {
            log_eval: false,
            exclusions: Some(&exclusions),
        };
        let contacts = self.get_all_contacts()?;
        let categories = Self::parse_auto_categories(&etiquette);
        for contact in &contacts {
            if Self::should_skip_bulk_auto_pair(contact, etiquette.id, &categories, &assignments) {
                continue;
            }
            total += self.sync_auto_pair(
                contact,
                &etiquette,
                now,
                current_month,
                Some(&mut assignments),
                &bulk_opts,
            )?;
        }
        Ok(total)
    }

    fn contact_ids_for_foyer(&self, foyer_id: i64) -> Result<Vec<i64>> {
        let mut stmt = self
            .conn
            .prepare("SELECT id FROM contacts WHERE foyer_id = ?1")?;
        let ids = stmt
            .query_map(params![foyer_id], |row| row.get(0))?
            .collect::<Result<Vec<i64>, _>>()?;
        Ok(ids)
    }

    /// Investissement éligible aux campagnes « nouvelle souscription » :
    /// uniquement `MON_CONSEIL` avec contact (jamais « à côté »).
    /// Le mode une fois / à chaque souscription est géré par étiquette ou modèle.
    pub fn investissement_eligible_souscription_event(
        &self,
        investissement_id: i64,
    ) -> Result<bool> {
        let inv = self.get_investissement_by_id(investissement_id)?;
        if inv.origine != "MON_CONSEIL" {
            return Ok(false);
        }
        Ok(inv.contact_id.is_some())
    }

    /// Après création/mise à jour d'un investissement (contact + membres du foyer).
    /// Pose les étiquettes « événement : nouvelle souscription » et calcule la date d'envoi.
    pub fn apply_souscription_event_etiquettes(
        &self,
        contact_id: i64,
        investissement_id: i64,
    ) -> Result<usize> {
        if !self.investissement_eligible_souscription_event(investissement_id)? {
            return Ok(0);
        }
        let inv = self.get_investissement_by_id(investissement_id)?;
        let Some(inv_contact_id) = inv.contact_id else {
            return Ok(0);
        };
        if inv_contact_id != contact_id {
            return Ok(0);
        }
        let contact = self.get_contact_by_id(contact_id)?;

        let now = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_secs() as i64;
        let eligible_at = inv.date_souscription.unwrap_or(now);

        let etiquettes: Vec<Etiquette> = self
            .get_all_etiquettes()?
            .into_iter()
            .filter(|e| {
                e.actif
                    && e.auto_condition_type.as_deref() == Some("EVENEMENT_SOUSCRIPTION")
            })
            .collect();

        let mut assigned = 0usize;
        for etiqu in etiquettes {
            let categories = Self::parse_auto_categories(&etiqu);
            if !Self::contact_matches_auto_categories(&contact, &categories) {
                continue;
            }

            let (types_filter, a_chaque): (Vec<String>, bool) =
                if let Some(ref cfg) = etiqu.auto_condition_config {
                    if let Ok(parsed) = serde_json::from_str::<serde_json::Value>(cfg) {
                        let types: Vec<String> = parsed["types"]
                            .as_array()
                            .map(|arr| {
                                arr.iter()
                                    .filter_map(|v| v.as_str().map(String::from))
                                    .collect()
                            })
                            .unwrap_or_default();
                        let a_chaque = parsed["a_chaque_souscription"].as_bool().unwrap_or(true);
                        (types, a_chaque)
                    } else {
                        (vec![], true)
                    }
                } else {
                    (vec![], true)
                };

            if !types_filter.is_empty() && !types_filter.iter().any(|t| t == &inv.type_produit) {
                continue;
            }

            if !a_chaque {
                let exists: i64 = self.conn.query_row(
                    "SELECT COUNT(*) FROM contact_etiquettes WHERE contact_id = ?1 AND etiquette_id = ?2",
                    params![contact_id, etiqu.id],
                    |row| row.get(0),
                )?;
                if exists > 0 {
                    continue;
                }
            }

            if self
                .attribuer_etiquette(
                    contact_id,
                    etiqu.id,
                    Some("AUTO".to_string()),
                    Some(eligible_at),
                )
                .is_ok()
            {
                assigned += 1;
                let _ = self.apply_etiquette_tache_action(contact_id, etiqu.id, eligible_at);
            }
        }
        Ok(assigned)
    }

    pub fn sync_auto_etiquettes_after_investissement(
        &self,
        contact_id: Option<i64>,
        foyer_id: Option<i64>,
        trigger_investissement_id: Option<i64>,
    ) -> Result<usize> {
        let mut total = 0;
        if let Some(iid) = trigger_investissement_id {
            if self.investissement_eligible_souscription_event(iid)? {
                if let Ok(inv) = self.get_investissement_by_id(iid) {
                    if let Some(cid) = inv.contact_id {
                        total += self.apply_souscription_event_etiquettes(cid, iid)?;
                        total += self.schedule_template_souscription_events(
                            cid,
                            iid,
                            &inv.type_produit,
                            inv.date_souscription,
                        )?;
                    }
                }
            }
        }
        let mut seen = Vec::new();
        if let Some(cid) = contact_id {
            total += self.check_auto_etiquettes_for_contact(cid)?;
            seen.push(cid);
        }
        if let Some(fid) = foyer_id {
            for cid in self.contact_ids_for_foyer(fid)? {
                if !seen.contains(&cid) {
                    total += self.check_auto_etiquettes_for_contact(cid)?;
                    seen.push(cid);
                }
            }
        }
        Ok(total)
    }
}
