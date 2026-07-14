//! File d'envoi pilotée par le modèle email (sans étiquette obligatoire).

use super::email_schedule::resolve_email_date_prevue_for_contact;
use super::models::{Contact, EtiquetteEmailQueueItem};
use super::template_email_trigger::{
    etiquette_schedule_from_trigger, parse_template_email_trigger,
    template_trigger_resets_outside_period, TemplateEmailTriggerConfig,
};
use super::Database;
use rusqlite::{params, Result};

const TEMPLATE_QUEUE_COLOR: &str = "#6366F1";

/// Relance activée sur le modèle (clé absente = activée sauf campagne éphémère).
const TEMPLATE_RELANCE_ENABLED_SQL: &str = "COALESCE(
    json_extract(t.variables, '$.email_relance.enabled'),
    CASE WHEN COALESCE(json_extract(t.variables, '$.is_ephemeral'), 0) = 1 THEN 0 ELSE 1 END
) = 1";

/// Suivi réponse requis (clé absente = oui sauf campagne éphémère).
const TEMPLATE_ATTENDRE_REPONSE_SQL: &str = "COALESCE(
    json_extract(t.variables, '$.email_suivi_reponse.attendre_reponse'),
    CASE WHEN COALESCE(json_extract(t.variables, '$.is_ephemeral'), 0) = 1 THEN 0 ELSE 1 END
) = 1";

/// Filtre SQL partagé : déclencheur modèle actif OU campagne batch (`campaign_batch_key`).
pub(crate) const TEMPLATE_ENVOI_QUEUE_FILTER: &str = "(
    json_extract(t.variables, '$.email_trigger.enabled') = 1
    AND (
      json_extract(t.variables, '$.email_trigger.condition_type') IS NOT NULL
      OR json_extract(t.variables, '$.email_trigger.trigger_type') = 'EVENEMENT_SOUSCRIPTION'
    )
    OR (COALESCE(cte.campaign_batch_key, '') != '')
)";

impl Database {
    pub fn migrate_contact_template_envois(&self) -> Result<()> {
        self.conn.execute(
            "CREATE TABLE IF NOT EXISTS contact_template_envois (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                contact_id INTEGER NOT NULL,
                template_id INTEGER NOT NULL,
                investissement_id INTEGER,
                trigger_event_at INTEGER NOT NULL,
                email_envoye INTEGER NOT NULL DEFAULT 0,
                email_date_prevue INTEGER,
                email_date_envoi INTEGER,
                email_relance_active INTEGER NOT NULL DEFAULT 0,
                email_gmail_message_id TEXT,
                email_gmail_thread_id TEXT,
                email_sent_subject TEXT,
                email_sent_body TEXT,
                email_sent_template_nom TEXT,
                email_reponse_at INTEGER,
                email_reponse_type TEXT,
                email_reponse_body TEXT,
                email_reponse_gmail_message_id TEXT,
                email_suivi_ignore INTEGER NOT NULL DEFAULT 0,
                email_annule INTEGER NOT NULL DEFAULT 0,
                relance_canal TEXT,
                relance_canal_at INTEGER,
                relance_canal_message TEXT,
                created_at INTEGER NOT NULL DEFAULT (unixepoch()),
                FOREIGN KEY (contact_id) REFERENCES contacts(id) ON DELETE CASCADE,
                FOREIGN KEY (template_id) REFERENCES templates_email(id) ON DELETE CASCADE
            )",
            [],
        )?;
        self.conn.execute(
            "CREATE UNIQUE INDEX IF NOT EXISTS contact_template_envois_unique
             ON contact_template_envois (contact_id, template_id, COALESCE(investissement_id, -1))",
            [],
        )?;
        self.conn.execute(
            "CREATE INDEX IF NOT EXISTS contact_template_envois_contact_idx
             ON contact_template_envois (contact_id)",
            [],
        )?;
        if !self.table_has_column("contact_template_envois", "relance_canal")? {
            self.conn.execute(
                "ALTER TABLE contact_template_envois ADD COLUMN relance_canal TEXT",
                [],
            )?;
            println!("✅ Migration: relance_canal sur contact_template_envois");
        }
        if !self.table_has_column("contact_template_envois", "relance_canal_at")? {
            self.conn.execute(
                "ALTER TABLE contact_template_envois ADD COLUMN relance_canal_at INTEGER",
                [],
            )?;
            println!("✅ Migration: relance_canal_at sur contact_template_envois");
        }
        if !self.table_has_column("contact_template_envois", "relance_canal_message")? {
            self.conn.execute(
                "ALTER TABLE contact_template_envois ADD COLUMN relance_canal_message TEXT",
                [],
            )?;
            println!("✅ Migration: relance_canal_message sur contact_template_envois");
        }
        Ok(())
    }

    fn template_trigger_matches_souscription(
        &self,
        contact: &Contact,
        trigger: &TemplateEmailTriggerConfig,
        type_produit: &str,
        organisation_self_id: Option<i64>,
    ) -> bool {
        if !trigger.is_event_souscription() {
            return false;
        }
        if !Self::contact_matches_auto_categories(
            contact,
            &trigger.categories,
            organisation_self_id,
        ) {
            return false;
        }
        let types = trigger.souscription_types_filter();
        if !types.is_empty() && !types.iter().any(|t| t == type_produit) {
            return false;
        }
        true
    }

    fn upsert_contact_template_envoi(
        &self,
        contact_id: i64,
        template_id: i64,
        investissement_id: Option<i64>,
        eligible_at: i64,
        email_date_prevue: Option<i64>,
        a_chaque_souscription: bool,
    ) -> Result<bool> {
        let existing_id: Option<i64> = if a_chaque_souscription {
            self.conn
                .query_row(
                    "SELECT id FROM contact_template_envois
                     WHERE contact_id = ?1 AND template_id = ?2 AND investissement_id = ?3",
                    params![contact_id, template_id, investissement_id],
                    |row| row.get(0),
                )
                .ok()
        } else {
            self.conn
                .query_row(
                    "SELECT id FROM contact_template_envois
                     WHERE contact_id = ?1 AND template_id = ?2 AND investissement_id IS NULL",
                    params![contact_id, template_id],
                    |row| row.get(0),
                )
                .ok()
        };

        if let Some(id) = existing_id {
            self.conn.execute(
                "UPDATE contact_template_envois SET
                    trigger_event_at = ?1,
                    email_date_prevue = CASE
                        WHEN email_envoye = 0 AND COALESCE(email_annule, 0) = 0 THEN ?2
                        ELSE email_date_prevue
                    END
                 WHERE id = ?3",
                params![eligible_at, email_date_prevue, id],
            )?;
            Ok(false)
        } else {
            self.conn.execute(
                "INSERT INTO contact_template_envois (
                    contact_id, template_id, investissement_id, trigger_event_at, email_date_prevue
                 ) VALUES (?1, ?2, ?3, ?4, ?5)",
                params![contact_id, template_id, investissement_id, eligible_at, email_date_prevue],
            )?;
            Ok(true)
        }
    }

    /// Hors éligibilité (hors période, mauvaise catégorie…) : efface la campagne modèle périodique pour la saison suivante.
    fn clear_periodic_template_envoi(
        &self,
        contact_id: i64,
        template_id: i64,
    ) -> Result<()> {
        self.conn.execute(
            "DELETE FROM contact_template_envois
             WHERE contact_id = ?1 AND template_id = ?2 AND investissement_id IS NULL",
            params![contact_id, template_id],
        )?;
        Ok(())
    }

    /// Envois modèle non envoyés (toutes lignes investissement comprises).
    fn clear_pending_template_envois_for_contact_template(
        &self,
        contact_id: i64,
        template_id: i64,
    ) -> Result<()> {
        self.conn.execute(
            "DELETE FROM contact_template_envois
             WHERE contact_id = ?1 AND template_id = ?2 AND email_envoye = 0",
            params![contact_id, template_id],
        )?;
        Ok(())
    }

    pub fn purge_excluded_template_trigger_envois(&self, template_id: i64) -> Result<usize> {
        let tpl = self.get_template_email_by_id(template_id)?;
        let trigger = parse_template_email_trigger(tpl.variables.as_deref());
        let mut total = 0usize;
        for contact_id in &trigger.excluded_contact_ids {
            total += self.conn.execute(
                "DELETE FROM contact_template_envois
                 WHERE contact_id = ?1 AND template_id = ?2 AND email_envoye = 0",
                params![contact_id, template_id],
            )?;
        }
        Ok(total)
    }

    /// Planifie ou purge l'envoi d'un modèle pour un contact (hors souscription).
    fn sync_template_email_trigger_for_contact(
        &self,
        contact_id: i64,
        template_id: i64,
        trigger: &super::template_email_trigger::TemplateEmailTriggerConfig,
        contact: &Contact,
        now: i64,
        current_month: i32,
        org_self_id: Option<i64>,
    ) -> Result<bool> {
        if !trigger.is_active() {
            return Ok(false);
        }
        let Some(ref condition_type) = trigger.resolved_condition_type() else {
            return Ok(false);
        };
        if condition_type == "EVENEMENT_SOUSCRIPTION" {
            return Ok(false);
        }
        if trigger.is_contact_excluded(contact_id) {
            self.clear_pending_template_envois_for_contact_template(contact_id, template_id)?;
            return Ok(false);
        }
        let category_ok = Self::contact_matches_auto_categories(
            contact,
            &trigger.categories,
            org_self_id,
        );
        let config_ref = trigger.resolved_condition_config();
        let condition_ok = if condition_type == "RULE_TREE" {
            if let Some(cfg) = config_ref.as_ref() {
                use super::etiquette_rule_ast::parse_rule_json;
                match parse_rule_json(Some(cfg), None, None, None) {
                    Ok(tree) => self.contact_matches_rule_tree(
                        contact,
                        &tree,
                        now,
                        current_month,
                        org_self_id,
                    )?,
                    Err(_) => false,
                }
            } else {
                false
            }
        } else if category_ok {
            self.evaluate_auto_etiquette_condition(
                contact,
                contact_id,
                condition_type,
                config_ref.as_ref(),
                &trigger.categories,
                now,
                current_month,
            )?
        } else {
            false
        };
        let eligible = if condition_type == "RULE_TREE" {
            condition_ok
        } else {
            category_ok && condition_ok
        };
        if !eligible {
            if template_trigger_resets_outside_period(condition_type) {
                self.clear_periodic_template_envoi(contact_id, template_id)?;
            }
            return Ok(false);
        }

        let sent: i64 = self.conn.query_row(
            "SELECT COUNT(*) FROM contact_template_envois
             WHERE contact_id = ?1 AND template_id = ?2 AND email_envoye = 1",
            params![contact_id, template_id],
            |row| row.get(0),
        )?;
        if sent > 0 {
            return Ok(false);
        }

        let sched = etiquette_schedule_from_trigger(trigger);
        let email_date_prevue = resolve_email_date_prevue_for_contact(&sched, now);
        self.upsert_contact_template_envoi(
            contact_id,
            template_id,
            None,
            now,
            email_date_prevue,
            false,
        )
    }

    /// Recalcule la file d'envoi d'un modèle pour tous les contacts (ex. retrait d'une exclusion).
    pub fn sync_template_email_trigger_for_all_contacts(&self, template_id: i64) -> Result<usize> {
        let tpl = self.get_template_email_by_id(template_id)?;
        let trigger = parse_template_email_trigger(tpl.variables.as_deref());
        let (now, current_month) = Self::auto_etiquette_now_and_month();
        let org_self_id = self.resolve_organisation_self_contact_id()?;

        let contact_ids: Vec<i64> = {
            let mut stmt = self.conn.prepare("SELECT id FROM contacts")?;
            let rows = stmt.query_map([], |row| row.get(0))?;
            rows.collect::<Result<Vec<_>, _>>()?
        };

        let mut scheduled = 0usize;
        for contact_id in contact_ids {
            let contact = self.get_contact_by_id(contact_id)?;
            if self.sync_template_email_trigger_for_contact(
                contact_id,
                template_id,
                &trigger,
                &contact,
                now,
                current_month,
                org_self_id,
            )? {
                scheduled += 1;
            }
        }
        Ok(scheduled)
    }

    /// Règles modèle (hors « nouvelle souscription ») : même moteur que les étiquettes auto.
    pub fn sync_template_email_triggers_for_contact(&self, contact_id: i64) -> Result<usize> {
        let contact = self.get_contact_by_id(contact_id)?;
        let (now, current_month) = Self::auto_etiquette_now_and_month();
        let org_self_id = self.resolve_organisation_self_contact_id()?;

        let mut stmt = self.conn.prepare(
            "SELECT id, variables FROM templates_email ORDER BY nom",
        )?;
        let templates: Vec<(i64, Option<String>)> = stmt
            .query_map([], |row| Ok((row.get(0)?, row.get(1)?)))?
            .collect::<Result<Vec<_>, _>>()?;

        let mut scheduled = 0usize;
        for (template_id, variables) in templates {
            let trigger = parse_template_email_trigger(variables.as_deref());
            if self.sync_template_email_trigger_for_contact(
                contact_id,
                template_id,
                &trigger,
                &contact,
                now,
                current_month,
                org_self_id,
            )? {
                scheduled += 1;
            }
        }
        Ok(scheduled)
    }

    /// Planifie les modèles « événement souscription » actifs pour ce contact.
    pub fn schedule_template_souscription_events(
        &self,
        contact_id: i64,
        investissement_id: i64,
        type_produit: &str,
        date_souscription: Option<i64>,
    ) -> Result<usize> {
        if !self.investissement_eligible_souscription_event(investissement_id)? {
            return Ok(0);
        }
        let contact = self.get_contact_by_id(contact_id)?;
        let org_self_id = self.resolve_organisation_self_contact_id()?;
        let now = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_secs() as i64;
        let eligible_at = date_souscription.unwrap_or(now);

        let mut stmt = self.conn.prepare(
            "SELECT id, variables FROM templates_email ORDER BY nom",
        )?;
        let templates: Vec<(i64, Option<String>)> = stmt
            .query_map([], |row| Ok((row.get(0)?, row.get(1)?)))?
            .collect::<Result<Vec<_>, _>>()?;

        let mut scheduled = 0usize;
        for (template_id, variables) in templates {
            let trigger = parse_template_email_trigger(variables.as_deref());
            if !self.template_trigger_matches_souscription(
                &contact,
                &trigger,
                type_produit,
                org_self_id,
            ) {
                continue;
            }
            if trigger.is_contact_excluded(contact_id) {
                self.clear_pending_template_envois_for_contact_template(contact_id, template_id)?;
                continue;
            }

            let sched = etiquette_schedule_from_trigger(&trigger);
            let email_date_prevue = resolve_email_date_prevue_for_contact(&sched, eligible_at);
            let a_chaque = trigger.a_chaque_souscription_resolved();
            if !a_chaque {
                let exists: i64 = self.conn.query_row(
                    "SELECT COUNT(*) FROM contact_template_envois
                     WHERE contact_id = ?1 AND template_id = ?2 AND investissement_id IS NULL",
                    params![contact_id, template_id],
                    |row| row.get(0),
                )?;
                if exists > 0 {
                    continue;
                }
            }
            let inv_key = if a_chaque {
                Some(investissement_id)
            } else {
                None
            };
            if self.upsert_contact_template_envoi(
                contact_id,
                template_id,
                inv_key,
                eligible_at,
                email_date_prevue,
                a_chaque,
            )? {
                scheduled += 1;
            }
        }
        Ok(scheduled)
    }

    /// Recalcule `email_date_prevue` des envois non envoyés après modification du déclencheur modèle.
    pub fn resync_pending_template_envois_for_template(&self, template_id: i64) -> Result<usize> {
        let tpl = self.get_template_email_by_id(template_id)?;
        let trigger = parse_template_email_trigger(tpl.variables.as_deref());
        if !trigger.is_active() {
            return Ok(0);
        }
        let sched = etiquette_schedule_from_trigger(&trigger);

        let mut stmt = self.conn.prepare(
            "SELECT id, COALESCE(trigger_event_at, 0)
             FROM contact_template_envois
             WHERE template_id = ?1 AND email_envoye = 0",
        )?;
        let rows: Vec<(i64, i64)> = stmt
            .query_map(params![template_id], |row| Ok((row.get(0)?, row.get(1)?)))?
            .collect::<Result<Vec<_>, _>>()?;

        let mut updated = 0usize;
        for (row_id, eligible_at) in rows {
            let email_date_prevue = resolve_email_date_prevue_for_contact(&sched, eligible_at);
            let n = self.conn.execute(
                "UPDATE contact_template_envois SET email_date_prevue = ?1
                 WHERE id = ?2 AND email_envoye = 0 AND COALESCE(email_annule, 0) = 0",
                params![email_date_prevue, row_id],
            )?;
            updated += n;
        }
        Ok(updated)
    }

    pub fn mark_template_email_sent(
        &self,
        row_id: i64,
        gmail_message_id: Option<&str>,
        gmail_thread_id: Option<&str>,
        email_subject: Option<&str>,
        email_body: Option<&str>,
        batch_id: Option<&str>,
        send_mode: Option<&str>,
    ) -> Result<()> {
        let now = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_secs() as i64;

        let (contact_id, template_id, template_nom): (i64, i64, String) = self.conn.query_row(
            "SELECT cte.contact_id, cte.template_id, t.nom
             FROM contact_template_envois cte
             INNER JOIN templates_email t ON t.id = cte.template_id
             WHERE cte.id = ?1",
            params![row_id],
            |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)),
        )?;

        let sujet = email_subject.unwrap_or("");
        let body_stored = email_body.filter(|s| !s.trim().is_empty());

        let updated = self.conn.execute(
            "UPDATE contact_template_envois SET
                email_envoye = 1, email_date_envoi = ?1,
                email_reponse_at = NULL, email_reponse_type = NULL,
                email_reponse_body = NULL, email_reponse_gmail_message_id = NULL,
                email_suivi_ignore = 0, email_relance_active = 0,
                email_gmail_message_id = ?3, email_gmail_thread_id = ?4,
                email_sent_subject = ?5, email_sent_body = ?6, email_sent_template_nom = ?7
             WHERE id = ?2 AND email_envoye = 0",
            params![
                now,
                row_id,
                gmail_message_id,
                gmail_thread_id,
                sujet,
                body_stored,
                template_nom.as_str(),
            ],
        )?;
        if updated == 0 {
            return Err(rusqlite::Error::InvalidParameterName(format!(
                "envoi modèle introuvable ou déjà envoyé: {}",
                row_id
            )));
        }

        let contenu = format!(
            "Modèle « {} » — email envoyé depuis Suivi → Envois.",
            template_nom
        );
        self.insert_campaign_interaction(contact_id, "EMAIL", sujet, &contenu, now)?;
        let mode = send_mode.unwrap_or("individual");
        let _ = self.insert_email_send_log(
            contact_id,
            None,
            None,
            None,
            Some(template_nom.as_str()),
            Some(sujet),
            "success",
            None,
            gmail_message_id,
            batch_id,
            mode,
        );
        let _ = self.try_auto_archive_ephemeral_campaign(template_id);
        if let Err(e) = self.try_apply_template_email_tache_for_sent_row(row_id, now) {
            eprintln!(
                "⚠️ Tâche modèle email non créée après envoi (ligne {}): {}",
                row_id, e
            );
        }
        Ok(())
    }

    pub fn get_template_email_queue(
        &self,
        queue_status: &str,
        now: i64,
        default_delai_jours: i64,
    ) -> Result<Vec<EtiquetteEmailQueueItem>> {
        const TRIGGER_FILTER: &str = super::template_email_queue::TEMPLATE_ENVOI_QUEUE_FILTER;

        use super::template_formality_sql::{
            template_queue_fields_simple_sql, template_queue_fields_sql_cte,
            TEMPLATE_TU_RELANCE_JOINS,
        };
        let template_fields = template_queue_fields_sql_cte();
        let template_fields_simple = template_queue_fields_simple_sql();
        let template_joins = format!(
            "INNER JOIN templates_email t ON cte.template_id = t.id
                 {TEMPLATE_TU_RELANCE_JOINS}
                 INNER JOIN contacts c ON cte.contact_id = c.id"
        );

        let sql = match queue_status {
            "ready" => format!(
                "SELECT cte.id, cte.contact_id, c.nom, c.prenom, c.email, c.telephone,
                        t.id, ('Modèle · ' || t.nom), cte.email_date_prevue, cte.email_date_envoi,
                        {template_fields},
                        NULL,
                        cte.email_reponse_at, cte.email_reponse_type, c.date_dernier_contact,
                        c.registre,
                        COALESCE(cte.email_relance_active, 0),
                        cte.campaign_variables,
                        NULL,
                        NULL,
                        NULL,
                        cte.relance_canal, cte.relance_canal_at, cte.relance_canal_message
                 FROM contact_template_envois cte
                 {template_joins}
                 WHERE {TRIGGER_FILTER}
                   AND cte.email_envoye = 0
                   AND COALESCE(cte.email_annule, 0) = 0
                   AND COALESCE(cte.email_suivi_ignore, 0) = 0
                   AND cte.email_date_prevue IS NOT NULL
                   AND cte.email_date_prevue <= ?1
                   AND c.email IS NOT NULL AND TRIM(c.email) != ''"
            ),
            "scheduled" => format!(
                "SELECT cte.id, cte.contact_id, c.nom, c.prenom, c.email, c.telephone,
                        t.id, ('Modèle · ' || t.nom), cte.email_date_prevue, cte.email_date_envoi,
                        {template_fields_simple},
                        'SCHEDULED',
                        cte.email_reponse_at, cte.email_reponse_type, c.date_dernier_contact,
                        c.registre,
                        0,
                        cte.campaign_variables,
                        NULL,
                        NULL,
                        NULL,
                        cte.relance_canal, cte.relance_canal_at, cte.relance_canal_message
                 FROM contact_template_envois cte
                 INNER JOIN templates_email t ON cte.template_id = t.id
                 LEFT JOIN templates_email t_tu ON t.tutoiement_template_id = t_tu.id
                 INNER JOIN contacts c ON cte.contact_id = c.id
                 WHERE {TRIGGER_FILTER}
                   AND cte.email_envoye = 0
                   AND COALESCE(cte.email_annule, 0) = 0
                   AND COALESCE(cte.email_suivi_ignore, 0) = 0
                   AND cte.email_date_prevue IS NOT NULL
                   AND cte.email_date_prevue > ?1
                   AND c.email IS NOT NULL AND TRIM(c.email) != ''"
            ),
            "incomplete" => format!(
                "SELECT cte.id, cte.contact_id, c.nom, c.prenom, c.email, c.telephone,
                        t.id, ('Modèle · ' || t.nom), cte.email_date_prevue, cte.email_date_envoi,
                        {template_fields_simple},
                        CASE
                          WHEN c.email IS NULL OR TRIM(c.email) = '' THEN 'NO_EMAIL'
                          WHEN cte.email_date_prevue IS NULL THEN 'NO_DATE'
                          ELSE 'OTHER'
                        END,
                        cte.email_reponse_at, cte.email_reponse_type, c.date_dernier_contact,
                        c.registre,
                        0,
                        cte.campaign_variables,
                        NULL,
                        NULL,
                        NULL,
                        cte.relance_canal, cte.relance_canal_at, cte.relance_canal_message
                 FROM contact_template_envois cte
                 INNER JOIN templates_email t ON cte.template_id = t.id
                 LEFT JOIN templates_email t_tu ON t.tutoiement_template_id = t_tu.id
                 INNER JOIN contacts c ON cte.contact_id = c.id
                 WHERE {TRIGGER_FILTER}
                   AND cte.email_envoye = 0
                   AND COALESCE(cte.email_annule, 0) = 0
                   AND COALESCE(cte.email_suivi_ignore, 0) = 0
                   AND (
                     c.email IS NULL OR TRIM(c.email) = ''
                     OR cte.email_date_prevue IS NULL
                   )
                   AND ?1 IS NOT NULL"
            ),
            "cancelled" => format!(
                "SELECT cte.id, cte.contact_id, c.nom, c.prenom, c.email, c.telephone,
                        t.id, ('Modèle · ' || t.nom), cte.email_date_prevue, cte.email_date_envoi,
                        {template_fields_simple},
                        'CANCELLED',
                        cte.email_reponse_at, cte.email_reponse_type, c.date_dernier_contact,
                        c.registre,
                        0,
                        cte.campaign_variables,
                        NULL,
                        NULL,
                        NULL,
                        cte.relance_canal, cte.relance_canal_at, cte.relance_canal_message
                 FROM contact_template_envois cte
                 INNER JOIN templates_email t ON cte.template_id = t.id
                 LEFT JOIN templates_email t_tu ON t.tutoiement_template_id = t_tu.id
                 INNER JOIN contacts c ON cte.contact_id = c.id
                 WHERE {TRIGGER_FILTER}
                   AND cte.email_envoye = 0
                   AND cte.email_annule = 1
                   AND COALESCE(cte.email_suivi_ignore, 0) = 0
                   AND ?1 IS NOT NULL"
            ),
            "sent" | "followup" => {
                let relance_filter = if queue_status == "followup" {
                    format!(" AND {TEMPLATE_RELANCE_ENABLED_SQL}")
                } else {
                    String::new()
                };
                format!(
                    "SELECT cte.id, cte.contact_id, c.nom, c.prenom, c.email, c.telephone,
                            t.id, ('Modèle · ' || t.nom), cte.email_date_prevue, cte.email_date_envoi,
                            COALESCE(t.sujet, ''), COALESCE(t.corps, ''), t.agenda_link_id,
                            t.variables, t.categorie, NULL,
                            cte.email_reponse_at, cte.email_reponse_type, c.date_dernier_contact,
                            c.registre,
                            0,
                            cte.campaign_variables,
                            cte.email_gmail_message_id,
                            cte.email_gmail_thread_id,
                            cte.email_sent_subject,
                            cte.relance_canal, cte.relance_canal_at, cte.relance_canal_message
                     FROM contact_template_envois cte
                     INNER JOIN templates_email t ON cte.template_id = t.id
                     INNER JOIN contacts c ON cte.contact_id = c.id
                     WHERE {TRIGGER_FILTER}
                       AND cte.email_envoye = 1
                       AND cte.email_date_envoi IS NOT NULL
                       AND cte.email_reponse_at IS NULL
                       AND COALESCE(cte.email_suivi_ignore, 0) = 0
                       AND COALESCE(t.categorie, '') != 'NEWSLETTER'
                       AND {TEMPLATE_ATTENDRE_REPONSE_SQL}
                       {relance_filter}
                       AND c.email IS NOT NULL AND TRIM(c.email) != ''"
                )
            }
            _ => return Ok(vec![]),
        };

        let map_row = |row: &rusqlite::Row<'_>| -> rusqlite::Result<EtiquetteEmailQueueItem> {
            Ok(EtiquetteEmailQueueItem {
                queue_row_kind: "template".to_string(),
                contact_etiquette_id: row.get(0)?,
                contact_id: row.get(1)?,
                contact_nom: row.get(2)?,
                contact_prenom: row.get(3)?,
                contact_email: row.get(4)?,
                contact_telephone: row.get(5)?,
                etiquette_id: row.get(6)?,
                etiquette_nom: row.get(7)?,
                etiquette_couleur: TEMPLATE_QUEUE_COLOR.to_string(),
                email_date_prevue: row.get(8)?,
                email_date_envoi: row.get(9)?,
                template_sujet: row.get(10)?,
                template_corps: row.get(11)?,
                template_agenda_link_id: row.get(12)?,
                template_variables: row.get(13)?,
                template_categorie: row.get(14)?,
                queue_issue: row.get(15)?,
                email_reponse_at: row.get(16)?,
                email_reponse_type: row.get(17)?,
                contact_date_dernier_contact: row.get(18)?,
                contact_registre: row.get(19)?,
                email_is_relance: row.get::<_, i64>(20).unwrap_or(0) != 0,
                campaign_variables: row.get(21).ok(),
                email_gmail_message_id: row.get(22).ok(),
                email_gmail_thread_id: row.get(23).ok(),
                email_sent_subject: row.get(24).ok(),
                rendement_exceltis: String::new(),
                relance_canal: row.get(25).ok(),
                relance_canal_at: row.get(26).ok(),
                relance_canal_message: row.get(27).ok(),
            })
        };

        if queue_status == "sent" || queue_status == "followup" {
            let mut stmt = self.conn.prepare(&sql)?;
            let rows = stmt.query_map([], map_row)?;
            let raw = rows.collect::<Result<Vec<_>, _>>()?;
            return Ok(super::template_email_relance::filter_queue_by_relance_schedule(
                raw,
                queue_status,
                now,
                default_delai_jours,
            ));
        }

        let mut stmt = self.conn.prepare(&sql)?;
        let rows = stmt.query_map(params![now], map_row)?;
        rows.collect()
    }

    pub fn prepare_template_envoi_relance(&self, row_id: i64) -> Result<()> {
        let now = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_secs() as i64;
        let updated = self.conn.execute(
            &format!(
                "UPDATE contact_template_envois SET
                email_envoye = 0,
                email_date_prevue = ?1,
                email_reponse_at = NULL,
                email_reponse_type = NULL,
                email_suivi_ignore = 0,
                email_relance_active = 1,
                email_gmail_message_id = NULL,
                email_gmail_thread_id = NULL
             WHERE id = ?2 AND email_envoye = 1
               AND (relance_canal IS NULL OR TRIM(relance_canal) = '')
               AND EXISTS (
                 SELECT 1 FROM templates_email t
                 WHERE t.id = contact_template_envois.template_id
                   AND {TEMPLATE_RELANCE_ENABLED_SQL}
               )"
            ),
            params![now, row_id],
        )?;
        if updated == 0 {
            return Err(rusqlite::Error::InvalidParameterName(format!(
                "Envoi modèle introuvable ou relance désactivée: {}",
                row_id
            )));
        }
        Ok(())
    }

    pub fn template_envoi_response_already_recorded(&self, row_id: i64) -> Result<bool> {
        let n: i64 = self.conn.query_row(
            "SELECT COUNT(*) FROM contact_template_envois
             WHERE id = ?1 AND email_envoye = 1 AND email_reponse_at IS NOT NULL",
            params![row_id],
            |row| row.get(0),
        )?;
        Ok(n > 0)
    }

    pub fn patch_template_envoi_response_details(
        &self,
        row_id: i64,
        reponse_body: Option<&str>,
        reponse_gmail_message_id: Option<&str>,
    ) -> Result<()> {
        self.conn.execute(
            "UPDATE contact_template_envois SET
                email_reponse_body = COALESCE(?1, email_reponse_body),
                email_reponse_gmail_message_id = COALESCE(?2, email_reponse_gmail_message_id)
             WHERE id = ?3",
            params![reponse_body, reponse_gmail_message_id, row_id],
        )?;
        Ok(())
    }

    pub fn mark_template_envoi_response(
        &self,
        row_id: i64,
        response_type: &str,
        reponse_body: Option<&str>,
        reponse_gmail_message_id: Option<&str>,
        reponse_subject: Option<&str>,
        rdv_event_at: Option<i64>,
    ) -> Result<()> {
        let now = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_secs() as i64;

        let contact_id: i64 = self.conn.query_row(
            "SELECT contact_id FROM contact_template_envois WHERE id = ?1",
            params![row_id],
            |row| row.get(0),
        )?;

        self.conn.execute("BEGIN IMMEDIATE", [])?;

        let mark_result = (|| -> Result<()> {
            let updated = self.conn.execute(
                "UPDATE contact_template_envois SET email_reponse_at = ?1, email_reponse_type = ?2,
                 email_reponse_body = ?4, email_reponse_gmail_message_id = ?5
                 WHERE id = ?3 AND email_envoye = 1 AND email_reponse_at IS NULL",
                params![
                    now,
                    response_type,
                    row_id,
                    reponse_body,
                    reponse_gmail_message_id
                ],
            )?;
            if updated == 0 {
                return Err(rusqlite::Error::InvalidParameterName(format!(
                    "Envoi modèle introuvable ou déjà traité: {}",
                    row_id
                )));
            }

            if response_type == "rdv" {
                let _ = self.advance_pipeline_on_rdv(contact_id);
                if let Some(rdv_at) = rdv_event_at {
                    self.touch_contact_last_contact(contact_id, rdv_at)?;
                    self.auto_close_obsolete_suivi_alertes_for_contact(contact_id)?;
                }
            }

            if response_type == "mail" {
                let _ = self.try_newsletter_unsubscribe_from_template_reply(
                    row_id,
                    reponse_subject,
                    reponse_body,
                )?;
            }
            Ok(())
        })();

        match mark_result {
            Ok(()) => {
                self.conn.execute("COMMIT", [])?;
                if response_type == "rdv" && rdv_event_at.is_some() {
                    let _ = self.check_auto_etiquettes_for_contact(contact_id);
                }
                Ok(())
            }
            Err(e) => {
                let _ = self.conn.execute("ROLLBACK", []);
                Err(e)
            }
        }
    }

}
