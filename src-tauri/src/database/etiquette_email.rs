use super::email_schedule::resolve_email_date_prevue_for_contact;
use super::models::EtiquetteEmailQueueItem;
use super::template_email_relance::{
    matches_sent_followup_window, DEFAULT_RELANCE_DELAI_JOURS,
};
use super::Database;
use rusqlite::{params, OptionalExtension, Result};

impl Database {
    pub fn get_etiquette_email_queue(
        &self,
        queue_status: &str,
    ) -> Result<Vec<EtiquetteEmailQueueItem>> {
        let now = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_secs() as i64;

        let default_delai_jours = super::template_email_relance::DEFAULT_RELANCE_DELAI_JOURS;

        use super::template_formality_sql::{
            template_queue_fields_simple_sql, template_queue_fields_sql, TEMPLATE_TU_RELANCE_JOINS,
        };
        const TEMPLATE_JOINS: &str = "
                 LEFT JOIN templates_email t ON e.email_template_id = t.id";
        let template_fields = template_queue_fields_sql();
        let template_fields_simple = template_queue_fields_simple_sql();
        let template_joins_full = format!("{TEMPLATE_JOINS}{TEMPLATE_TU_RELANCE_JOINS}");

        let sql = match queue_status {
            "ready" => {
                format!(
                    "SELECT ce.id, ce.contact_id, c.nom, c.prenom, c.email, c.telephone,
                        e.id, e.nom, e.couleur, ce.email_date_prevue, ce.email_date_envoi,
                        {template_fields}, NULL,
                        ce.email_reponse_at, ce.email_reponse_type, c.date_dernier_contact,
                        c.registre,
                        COALESCE(ce.email_relance_active, 0)
                 FROM contact_etiquettes ce
                 INNER JOIN etiquettes e ON ce.etiquette_id = e.id
                 INNER JOIN contacts c ON ce.contact_id = c.id
                 {template_joins_full}
                 WHERE e.actif = 1 AND e.email_actif = 1
                   AND ce.email_envoye = 0
                   AND COALESCE(ce.email_annule, 0) = 0
                   AND COALESCE(ce.email_suivi_ignore, 0) = 0
                   AND ce.email_date_prevue IS NOT NULL
                   AND ce.email_date_prevue <= ?1
                   AND e.email_template_id IS NOT NULL
                   AND c.email IS NOT NULL
                   AND TRIM(c.email) != ''
                 ORDER BY ce.email_date_prevue ASC, c.nom, c.prenom"
                )
            }
            "scheduled" => {
                format!(
                    "SELECT ce.id, ce.contact_id, c.nom, c.prenom, c.email, c.telephone,
                        e.id, e.nom, e.couleur, ce.email_date_prevue, ce.email_date_envoi,
                        {template_fields_simple},
                        'SCHEDULED',
                        ce.email_reponse_at, ce.email_reponse_type, c.date_dernier_contact,
                        c.registre,
                        COALESCE(ce.email_relance_active, 0)
                 FROM contact_etiquettes ce
                 INNER JOIN etiquettes e ON ce.etiquette_id = e.id
                 INNER JOIN contacts c ON ce.contact_id = c.id
                 LEFT JOIN templates_email t ON e.email_template_id = t.id
                 LEFT JOIN templates_email t_tu ON t.tutoiement_template_id = t_tu.id
                 WHERE e.actif = 1 AND e.email_actif = 1
                   AND ce.email_envoye = 0
                   AND COALESCE(ce.email_annule, 0) = 0
                   AND COALESCE(ce.email_suivi_ignore, 0) = 0
                   AND ce.email_date_prevue IS NOT NULL
                   AND ce.email_date_prevue > ?1
                   AND e.email_template_id IS NOT NULL
                   AND c.email IS NOT NULL
                   AND TRIM(c.email) != ''
                 ORDER BY ce.email_date_prevue ASC, c.nom, c.prenom"
                )
            }
            "incomplete" => {
                format!(
                    "SELECT ce.id, ce.contact_id, c.nom, c.prenom, c.email, c.telephone,
                        e.id, e.nom, e.couleur, ce.email_date_prevue, ce.email_date_envoi,
                        {template_fields_simple},
                        CASE
                          WHEN c.email IS NULL OR TRIM(c.email) = '' THEN 'NO_EMAIL'
                          WHEN e.email_template_id IS NULL THEN 'NO_TEMPLATE'
                          WHEN ce.email_date_prevue IS NULL THEN 'NO_DATE'
                          ELSE 'OTHER'
                        END,
                        ce.email_reponse_at, ce.email_reponse_type, c.date_dernier_contact,
                        c.registre,
                        COALESCE(ce.email_relance_active, 0)
                 FROM contact_etiquettes ce
                 INNER JOIN etiquettes e ON ce.etiquette_id = e.id
                 INNER JOIN contacts c ON ce.contact_id = c.id
                 LEFT JOIN templates_email t ON e.email_template_id = t.id
                 LEFT JOIN templates_email t_tu ON t.tutoiement_template_id = t_tu.id
                 WHERE e.actif = 1 AND e.email_actif = 1
                   AND ce.email_envoye = 0
                   AND COALESCE(ce.email_annule, 0) = 0
                   AND COALESCE(ce.email_suivi_ignore, 0) = 0
                   AND (
                     c.email IS NULL OR TRIM(c.email) = ''
                     OR e.email_template_id IS NULL
                     OR ce.email_date_prevue IS NULL
                   )
                   AND ?1 IS NOT NULL
                 ORDER BY ce.email_date_prevue ASC, c.nom, c.prenom"
                )
            }
            "sent" => {
                format!(
                    "SELECT ce.id, ce.contact_id, c.nom, c.prenom, c.email, c.telephone,
                        e.id, e.nom, e.couleur, ce.email_date_prevue, ce.email_date_envoi,
                        COALESCE(t.sujet, ''), COALESCE(t.corps, ''), t.agenda_link_id,
                        t.variables, t.categorie, NULL,
                        ce.email_reponse_at, ce.email_reponse_type, c.date_dernier_contact,
                        c.registre,
                        0
                 FROM contact_etiquettes ce
                 INNER JOIN etiquettes e ON ce.etiquette_id = e.id
                 INNER JOIN contacts c ON ce.contact_id = c.id
                 {template_joins_full}
                 WHERE e.actif = 1 AND e.email_actif = 1
                   AND ce.email_envoye = 1
                   AND ce.email_date_envoi IS NOT NULL
                   AND ce.email_reponse_at IS NULL
                   AND COALESCE(ce.email_suivi_ignore, 0) = 0
                   AND COALESCE(t.categorie, '') != 'NEWSLETTER'
                   AND COALESCE(json_extract(t.variables, '$.email_suivi_reponse.attendre_reponse'), 1) = 1
                   AND c.email IS NOT NULL
                   AND TRIM(c.email) != ''
                 ORDER BY ce.email_date_envoi DESC
                 LIMIT 200"
                )
            }
            "followup" => {
                format!(
                    "SELECT ce.id, ce.contact_id, c.nom, c.prenom, c.email, c.telephone,
                        e.id, e.nom, e.couleur, ce.email_date_prevue, ce.email_date_envoi,
                        COALESCE(t.sujet, ''), COALESCE(t.corps, ''), t.agenda_link_id,
                        t.variables, t.categorie, 'FOLLOWUP',
                        ce.email_reponse_at, ce.email_reponse_type, c.date_dernier_contact,
                        c.registre,
                        0
                 FROM contact_etiquettes ce
                 INNER JOIN etiquettes e ON ce.etiquette_id = e.id
                 INNER JOIN contacts c ON ce.contact_id = c.id
                 LEFT JOIN templates_email t ON e.email_template_id = t.id
                 WHERE e.actif = 1 AND e.email_actif = 1
                   AND ce.email_envoye = 1
                   AND ce.email_date_envoi IS NOT NULL
                   AND ce.email_reponse_at IS NULL
                   AND COALESCE(ce.email_suivi_ignore, 0) = 0
                   AND COALESCE(t.categorie, '') != 'NEWSLETTER'
                   AND COALESCE(json_extract(t.variables, '$.email_suivi_reponse.attendre_reponse'), 1) = 1
                   AND COALESCE(json_extract(t.variables, '$.email_relance.enabled'), 1) = 1
                   AND c.email IS NOT NULL
                   AND TRIM(c.email) != ''
                 ORDER BY ce.email_date_envoi ASC, c.nom, c.prenom
                 LIMIT 200"
                )
            }
            "cancelled" => {
                format!(
                    "SELECT ce.id, ce.contact_id, c.nom, c.prenom, c.email, c.telephone,
                        e.id, e.nom, e.couleur, ce.email_date_prevue, ce.email_date_envoi,
                        {template_fields_simple},
                        'CANCELLED',
                        ce.email_reponse_at, ce.email_reponse_type, c.date_dernier_contact,
                        c.registre,
                        COALESCE(ce.email_relance_active, 0)
                 FROM contact_etiquettes ce
                 INNER JOIN etiquettes e ON ce.etiquette_id = e.id
                 INNER JOIN contacts c ON ce.contact_id = c.id
                 LEFT JOIN templates_email t ON e.email_template_id = t.id
                 LEFT JOIN templates_email t_tu ON t.tutoiement_template_id = t_tu.id
                 WHERE e.actif = 1 AND e.email_actif = 1
                   AND ce.email_envoye = 0
                   AND ce.email_annule = 1
                   AND COALESCE(ce.email_suivi_ignore, 0) = 0
                   AND e.email_template_id IS NOT NULL
                   AND c.email IS NOT NULL
                   AND TRIM(c.email) != ''
                   AND ?1 IS NOT NULL
                 ORDER BY ce.email_date_prevue ASC, c.nom, c.prenom"
                )
            }
            _ => {
                return Err(rusqlite::Error::InvalidParameterName(format!(
                    "queue_status invalide: {}",
                    queue_status
                )))
            }
        };

        let map_row = |row: &rusqlite::Row<'_>| -> rusqlite::Result<EtiquetteEmailQueueItem> {
            Ok(EtiquetteEmailQueueItem {
                queue_row_kind: "etiquette".to_string(),
                contact_etiquette_id: row.get(0)?,
                contact_id: row.get(1)?,
                contact_nom: row.get(2)?,
                contact_prenom: row.get(3)?,
                contact_email: row.get(4)?,
                contact_telephone: row.get(5)?,
                etiquette_id: row.get(6)?,
                etiquette_nom: row.get(7)?,
                etiquette_couleur: row.get(8)?,
                email_date_prevue: row.get(9)?,
                email_date_envoi: row.get(10)?,
                template_sujet: row.get(11)?,
                template_corps: row.get(12)?,
                template_agenda_link_id: row.get(13)?,
                template_variables: row.get(14)?,
                template_categorie: row.get(15)?,
                queue_issue: row.get(16)?,
                email_reponse_at: row.get(17)?,
                email_reponse_type: row.get(18)?,
                contact_date_dernier_contact: row.get(19)?,
                contact_registre: row.get(20)?,
                email_is_relance: row.get::<_, i64>(21)? != 0,
            })
        };

        let mut items = if queue_status == "sent" || queue_status == "followup" {
            let mut stmt = self.conn.prepare(&sql)?;
            let rows = stmt.query_map(params![], map_row)?;
            let raw = rows.collect::<Result<Vec<_>, _>>()?;
            super::template_email_relance::filter_queue_by_relance_schedule(
                raw,
                queue_status,
                now,
                default_delai_jours,
            )
        } else {
            let mut stmt = self.conn.prepare(&sql)?;
            let rows = stmt.query_map(params![now], map_row)?;
            rows.collect::<Result<Vec<_>, _>>()?
        };

        let mut template_items =
            self.get_template_email_queue(queue_status, now, default_delai_jours)?;
        items.append(&mut template_items);

        items.sort_by(|a, b| {
            let da = a.email_date_prevue.unwrap_or(i64::MAX);
            let db = b.email_date_prevue.unwrap_or(i64::MAX);
            da.cmp(&db)
                .then_with(|| a.contact_nom.cmp(&b.contact_nom))
                .then_with(|| a.contact_prenom.cmp(&b.contact_prenom))
        });

        if queue_status == "sent" {
            items.truncate(100);
        }

        Ok(items)
    }

    /// Une seule transaction IPC : toutes les files ou ready + onglet actif.
    pub fn get_envois_snapshot(
        &self,
        active_status: Option<&str>,
    ) -> Result<super::models::EnvoisSnapshot> {
        use super::models::EnvoisSnapshot;

        let ready = self.get_etiquette_email_queue("ready")?;
        let fetch_all = active_status.is_none();

        let mut snap = EnvoisSnapshot {
            ready,
            scheduled: None,
            incomplete: None,
            cancelled: None,
            sent: None,
            followup: None,
        };

        if fetch_all {
            snap.scheduled = Some(self.get_etiquette_email_queue("scheduled")?);
            snap.incomplete = Some(self.get_etiquette_email_queue("incomplete")?);
            snap.cancelled = Some(self.get_etiquette_email_queue("cancelled")?);
            snap.sent = Some(self.get_etiquette_email_queue("sent")?);
            snap.followup = Some(self.get_etiquette_email_queue("followup")?);
            return Ok(snap);
        }

        if let Some(status) = active_status.filter(|s| *s != "ready" && *s != "journal") {
            let items = self.get_etiquette_email_queue(status)?;
            match status {
                "scheduled" => snap.scheduled = Some(items),
                "incomplete" => snap.incomplete = Some(items),
                "cancelled" => snap.cancelled = Some(items),
                "sent" => snap.sent = Some(items),
                "followup" => snap.followup = Some(items),
                _ => {}
            }
        }

        Ok(snap)
    }

    /// Compatibilité : file « prêts à envoyer »
    pub fn get_pending_etiquette_emails(&self) -> Result<Vec<(i64, i64, i64, String, String)>> {
        let queue = self.get_etiquette_email_queue("ready")?;
        Ok(queue
            .into_iter()
            .filter_map(|item| {
                let email = item.contact_email?;
                Some((
                    item.contact_etiquette_id,
                    item.contact_id,
                    0,
                    email,
                    item.contact_prenom,
                ))
            })
            .collect())
    }

    fn is_client_actif(categorie: &str) -> bool {
        categorie != "AUCUN" && categorie != "PRESCRIPTEUR"
    }

    fn is_filleul_statut(cat: Option<&str>) -> bool {
        matches!(
            cat,
            Some("FILLEUL")
                | Some("PROSPECT_FILLEUL")
                | Some("SUSPECT_FILLEUL")
                | Some("FILLEUL_DESINSCRIT")
        )
    }

    pub(crate) fn touch_contact_last_contact(&self, contact_id: i64, ts: i64) -> Result<()> {
        let contact = self.get_contact_by_id(contact_id)?;
        let client = Self::is_client_actif(&contact.categorie);
        let filleul = Self::is_filleul_statut(contact.filleul_categorie.as_deref());

        if client {
            self.conn.execute(
                "UPDATE contacts SET date_dernier_contact = ?1, updated_at = ?1 WHERE id = ?2",
                params![ts, contact_id],
            )?;
        }
        if filleul {
            self.conn.execute(
                "UPDATE contacts SET date_dernier_contact_filleul = ?1, updated_at = ?1 WHERE id = ?2",
                params![ts, contact_id],
            )?;
        }
        if !client && !filleul {
            self.conn.execute(
                "UPDATE contacts SET date_dernier_contact = ?1, updated_at = ?1 WHERE id = ?2",
                params![ts, contact_id],
            )?;
        }
        Ok(())
    }

    fn get_campaign_context_for_contact_etiquette(
        &self,
        contact_etiquette_id: i64,
    ) -> Result<(i64, String, String)> {
        self.conn.query_row(
            "SELECT ce.contact_id, e.nom, COALESCE(t.sujet, 'Email campagne')
             FROM contact_etiquettes ce
             INNER JOIN etiquettes e ON ce.etiquette_id = e.id
             LEFT JOIN templates_email t ON e.email_template_id = t.id
             WHERE ce.id = ?1",
            params![contact_etiquette_id],
            |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)),
        )
    }

    fn resolve_sent_template_nom(&self, contact_etiquette_id: i64) -> Result<String> {
        use super::template_formality_sql::TEMPLATE_TU_RELANCE_JOINS;
        let sql = format!(
            "SELECT COALESCE(
                CASE WHEN COALESCE(ce.email_relance_active, 0) = 1 AND t_rel.id IS NOT NULL THEN
                    CASE WHEN UPPER(COALESCE(c.registre, 'VOUS')) = 'TU' AND t_rel_tu.id IS NOT NULL
                         THEN NULLIF(TRIM(t_rel_tu.nom), '') ELSE NULLIF(TRIM(t_rel.nom), '') END
                ELSE
                    CASE WHEN UPPER(COALESCE(c.registre, 'VOUS')) = 'TU' AND t_tu.id IS NOT NULL
                         THEN NULLIF(TRIM(t_tu.nom), '') ELSE NULLIF(TRIM(t.nom), '') END
                END,
                NULLIF(TRIM(e.nom), ''),
                'Email campagne'
             )
             FROM contact_etiquettes ce
             INNER JOIN contacts c ON ce.contact_id = c.id
             INNER JOIN etiquettes e ON ce.etiquette_id = e.id
             LEFT JOIN templates_email t ON e.email_template_id = t.id
             {TEMPLATE_TU_RELANCE_JOINS}
             WHERE ce.id = ?1"
        );
        self.conn
            .query_row(&sql, params![contact_etiquette_id], |row| row.get(0))
    }

    pub(crate) fn insert_campaign_interaction(
        &self,
        contact_id: i64,
        type_interaction: &str,
        sujet: &str,
        contenu: &str,
        date_ts: i64,
    ) -> Result<()> {
        self.conn.execute(
            "INSERT INTO interactions (contact_id, type_interaction, sujet, contenu, date_interaction)
             VALUES (?1, ?2, ?3, ?4, ?5)",
            params![contact_id, type_interaction, sujet, contenu, date_ts],
        )?;
        Ok(())
    }

    pub(crate) fn auto_close_suivi_alertes_after_contact(&self, contact_id: i64) -> Result<()> {
        self.conn.execute(
            "UPDATE alertes SET traitee = 1, lue = 1
             WHERE contact_id = ?1 AND traitee = 0
               AND type_alerte NOT IN ('FIN_DEMEMBREMENT')",
            params![contact_id],
        )?;
        Ok(())
    }

    fn campaign_response_already_recorded(&self, row_id: i64) -> Result<bool> {
        let n: i64 = self.conn.query_row(
            "SELECT COUNT(*) FROM contact_etiquettes
             WHERE id = ?1 AND email_envoye = 1 AND email_reponse_at IS NOT NULL",
            params![row_id],
            |row| row.get(0),
        )?;
        if n > 0 {
            return Ok(true);
        }
        self.template_envoi_response_already_recorded(row_id)
    }

    fn patch_campaign_response_details(
        &self,
        row_id: i64,
        reponse_body: Option<&str>,
        reponse_gmail_message_id: Option<&str>,
    ) -> Result<()> {
        let updated = self.conn.execute(
            "UPDATE contact_etiquettes SET
                email_reponse_body = COALESCE(?1, email_reponse_body),
                email_reponse_gmail_message_id = COALESCE(?2, email_reponse_gmail_message_id)
             WHERE id = ?3",
            params![reponse_body, reponse_gmail_message_id, row_id],
        )?;
        if updated > 0 {
            return Ok(());
        }
        self.patch_template_envoi_response_details(row_id, reponse_body, reponse_gmail_message_id)
    }

    fn campaign_email_already_sent(&self, contact_etiquette_id: i64) -> Result<bool> {
        let n: i64 = self.conn.query_row(
            "SELECT COUNT(*) FROM contact_etiquettes
             WHERE id = ?1 AND email_envoye = 1",
            params![contact_etiquette_id],
            |row| row.get(0),
        )?;
        Ok(n > 0)
    }

    /// Marquer un email d'étiquette comme envoyé (+ trace dans l'historique).
    pub fn mark_etiquette_email_sent(
        &self,
        contact_etiquette_id: i64,
        gmail_message_id: Option<&str>,
        gmail_thread_id: Option<&str>,
        email_subject: Option<&str>,
        email_body: Option<&str>,
        batch_id: Option<&str>,
        send_mode: Option<&str>,
    ) -> Result<()> {
        if self.campaign_email_already_sent(contact_etiquette_id)? {
            return Ok(());
        }

        let now = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_secs() as i64;

        let (contact_id, etiquette_nom, template_sujet) =
            self.get_campaign_context_for_contact_etiquette(contact_etiquette_id)?;
        let template_nom = self.resolve_sent_template_nom(contact_etiquette_id)?;
        let is_relance: i64 = self.conn.query_row(
            "SELECT COALESCE(email_relance_active, 0) FROM contact_etiquettes WHERE id = ?1",
            params![contact_etiquette_id],
            |row| row.get(0),
        )?;

        self.conn.execute("BEGIN IMMEDIATE", [])?;

        let mark_result = (|| -> Result<()> {
            let sujet = email_subject
                .filter(|s| !s.trim().is_empty())
                .unwrap_or(template_sujet.as_str());
            let body_stored = email_body
                .filter(|s| !s.trim().is_empty())
                .map(|s| s.to_string());
            let updated = self.conn.execute(
                "UPDATE contact_etiquettes SET email_envoye = 1, email_date_envoi = ?1,
                 email_reponse_at = NULL, email_reponse_type = NULL, email_reponse_body = NULL,
                 email_reponse_gmail_message_id = NULL, email_suivi_ignore = 0,
                 email_relance_active = 0,
                 email_gmail_message_id = ?3, email_gmail_thread_id = ?4,
                 email_sent_subject = ?5, email_sent_body = ?6, email_sent_template_nom = ?7
                 WHERE id = ?2 AND email_envoye = 0",
                params![
                    now,
                    contact_etiquette_id,
                    gmail_message_id,
                    gmail_thread_id,
                    sujet,
                    body_stored.as_deref(),
                    template_nom.as_str(),
                ],
            )?;
            if updated == 0 {
                return Err(rusqlite::Error::InvalidParameterName(format!(
                    "contact_etiquette introuvable ou déjà envoyé: {}",
                    contact_etiquette_id
                )));
            }

            // Corps/sujet sur contact_etiquettes ; le journal lit get_exchange_history_timeline.
            if is_relance != 0 {
                let contenu = format!(
                    "Campagne « {} » — relance email (2e envoi) depuis Suivi → Envois.",
                    etiquette_nom
                );
                self.insert_campaign_interaction(contact_id, "EMAIL", sujet, &contenu, now)?;
            }
            Ok(())
        })();

        match mark_result {
            Ok(()) => {
                self.conn.execute("COMMIT", [])?;
                let sujet = email_subject
                    .filter(|s| !s.trim().is_empty())
                    .unwrap_or(template_sujet.as_str());
                let mode = send_mode.unwrap_or("individual");
                let etiquette_id: Option<i64> = self.conn.query_row(
                    "SELECT etiquette_id FROM contact_etiquettes WHERE id = ?1",
                    params![contact_etiquette_id],
                    |row| row.get(0),
                ).ok();
                let _ = self.insert_email_send_log(
                    contact_id,
                    Some(contact_etiquette_id),
                    etiquette_id,
                    Some(etiquette_nom.as_str()),
                    Some(template_nom.as_str()),
                    Some(sujet),
                    "success",
                    None,
                    gmail_message_id,
                    batch_id,
                    mode,
                );
                let _ = self.advance_pipeline_on_email_sent(contact_etiquette_id);
                Ok(())
            }
            Err(e) => {
                let _ = self.conn.execute("ROLLBACK", []);
                Err(e)
            }
        }
    }

    /// Réponse campagne enregistrée (fil email / relance Suivi → Envois).
    /// `mail` : pas de MAJ `date_dernier_contact` (réponse email ≠ RDV).
    /// `rdv` : MAJ dernier contact à la date du RDV Agenda (`rdv_event_at`, unix s) + alertes/étiquettes auto.
    pub fn mark_email_campaign_response(
        &self,
        row_id: i64,
        response_type: &str,
        reponse_body: Option<&str>,
        reponse_gmail_message_id: Option<&str>,
        reponse_subject: Option<&str>,
        rdv_event_at: Option<i64>,
    ) -> Result<()> {
        let allowed = ["mail", "rdv", "autre"];
        if !allowed.contains(&response_type) {
            return Err(rusqlite::Error::InvalidParameterName(format!(
                "Type de réponse invalide: {}",
                response_type
            )));
        }

        if self.campaign_response_already_recorded(row_id)? {
            if reponse_body.is_some() || reponse_gmail_message_id.is_some() {
                self.patch_campaign_response_details(row_id, reponse_body, reponse_gmail_message_id)?;
            }
            return Ok(());
        }

        if self
            .mark_contact_etiquette_campaign_response(
                row_id,
                response_type,
                reponse_body,
                reponse_gmail_message_id,
                reponse_subject,
                rdv_event_at,
            )
            .is_ok()
        {
            return Ok(());
        }

        self.mark_template_envoi_response(
            row_id,
            response_type,
            reponse_body,
            reponse_gmail_message_id,
            reponse_subject,
            rdv_event_at,
        )
    }

    /// Email + date d'envoi pour recherche RDV Agenda (sync ou marquage manuel).
    pub fn campaign_calendar_lookup(&self, row_id: i64) -> Result<Option<(String, i64)>> {
        let from_ce: Result<(String, i64), rusqlite::Error> = self.conn.query_row(
            "SELECT c.email, ce.email_date_envoi
             FROM contact_etiquettes ce
             INNER JOIN contacts c ON c.id = ce.contact_id
             WHERE ce.id = ?1 AND ce.email_envoye = 1 AND ce.email_date_envoi IS NOT NULL
               AND c.email IS NOT NULL AND TRIM(c.email) != ''",
            params![row_id],
            |row| Ok((row.get(0)?, row.get(1)?)),
        );
        if let Ok(pair) = from_ce {
            return Ok(Some(pair));
        }
        self.conn
            .query_row(
                "SELECT c.email, cte.email_date_envoi
                 FROM contact_template_envois cte
                 INNER JOIN contacts c ON c.id = cte.contact_id
                 WHERE cte.id = ?1 AND cte.email_envoye = 1 AND cte.email_date_envoi IS NOT NULL
                   AND c.email IS NOT NULL AND TRIM(c.email) != ''",
                params![row_id],
                |row| Ok((row.get(0)?, row.get(1)?)),
            )
            .optional()
    }

    fn apply_rdv_pris_contact_updates(&self, contact_id: i64, rdv_event_at: i64) -> Result<()> {
        self.touch_contact_last_contact(contact_id, rdv_event_at)?;
        self.auto_close_obsolete_suivi_alertes_for_contact(contact_id)?;
        Ok(())
    }

    fn mark_contact_etiquette_campaign_response(
        &self,
        contact_etiquette_id: i64,
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
        let (contact_id, _, _) =
            self.get_campaign_context_for_contact_etiquette(contact_etiquette_id)?;

        self.conn.execute("BEGIN IMMEDIATE", [])?;

        let mark_result = (|| -> Result<()> {
            let updated = self.conn.execute(
                "UPDATE contact_etiquettes SET email_reponse_at = ?1, email_reponse_type = ?2,
                 email_reponse_body = ?4, email_reponse_gmail_message_id = ?5
                 WHERE id = ?3 AND email_envoye = 1 AND email_reponse_at IS NULL",
                params![
                    now,
                    response_type,
                    contact_etiquette_id,
                    reponse_body,
                    reponse_gmail_message_id
                ],
            )?;
            if updated == 0 {
                return Err(rusqlite::Error::InvalidParameterName(format!(
                    "Envoi introuvable ou déjà traité: {}",
                    contact_etiquette_id
                )));
            }

            if response_type == "rdv" {
                let _ = self.advance_pipeline_on_rdv(contact_id);
                if let Some(rdv_at) = rdv_event_at {
                    self.apply_rdv_pris_contact_updates(contact_id, rdv_at)?;
                }
            }

            if response_type == "mail" {
                let _ = self.try_newsletter_unsubscribe_from_reply(
                    contact_etiquette_id,
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

    /// Ne plus proposer de relance pour cet envoi.
    pub fn dismiss_email_campaign_followup(&self, row_id: i64) -> Result<()> {
        let updated = self.conn.execute(
            "UPDATE contact_etiquettes SET email_suivi_ignore = 1 WHERE id = ?1",
            params![row_id],
        )?;
        if updated > 0 {
            return Ok(());
        }
        let updated = self.conn.execute(
            "UPDATE contact_template_envois SET email_suivi_ignore = 1 WHERE id = ?1",
            params![row_id],
        )?;
        if updated == 0 {
            return Err(rusqlite::Error::InvalidParameterName(format!(
                "Envoi introuvable: {}",
                row_id
            )));
        }
        Ok(())
    }

    /// Remet en file un envoi retiré manuellement (email_annule = 1).
    pub fn restore_pending_email_campaign(&self, row_id: i64) -> Result<()> {
        let now = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_secs() as i64;

        let (etiquette_id, date_attribution): (i64, i64) = self.conn.query_row(
            "SELECT etiquette_id, date_attribution FROM contact_etiquettes WHERE id = ?1",
            params![row_id],
            |row| Ok((row.get(0)?, row.get(1)?)),
        )?;
        let etiquette = self.get_etiquette_by_id(etiquette_id)?;
        if !etiquette.email_actif {
            return Err(rusqlite::Error::InvalidParameterName(
                "Campagne email inactive sur cette étiquette".into(),
            ));
        }
        let prevue = resolve_email_date_prevue_for_contact(&etiquette, date_attribution)
            .unwrap_or(now);
        let updated = self.conn.execute(
            "UPDATE contact_etiquettes SET email_annule = 0, email_suivi_ignore = 0, email_date_prevue = ?1
             WHERE id = ?2 AND email_envoye = 0 AND email_annule = 1",
            params![prevue, row_id],
        )?;
        if updated == 0 {
            return Err(rusqlite::Error::InvalidParameterName(format!(
                "Envoi introuvable ou déjà en file: {}",
                row_id
            )));
        }
        Ok(())
    }

    /// Retire définitivement un envoi de la file (onglet Retirés) sans remettre en Prêts.
    /// L'étiquette et l'alerte restent ; le recalcul auto ne reproposera plus cet envoi.
    pub fn dismiss_cancelled_pending_email_campaign(&self, row_id: i64) -> Result<()> {
        let updated = self.conn.execute(
            "UPDATE contact_etiquettes SET email_suivi_ignore = 1, email_annule = 0
             WHERE id = ?1 AND email_envoye = 0 AND email_annule = 1
               AND COALESCE(email_suivi_ignore, 0) = 0",
            params![row_id],
        )?;
        if updated > 0 {
            return Ok(());
        }
        let updated = self.conn.execute(
            "UPDATE contact_template_envois SET email_suivi_ignore = 1, email_annule = 0
             WHERE id = ?1 AND email_envoye = 0 AND email_annule = 1
               AND COALESCE(email_suivi_ignore, 0) = 0",
            params![row_id],
        )?;
        if updated == 0 {
            return Err(rusqlite::Error::InvalidParameterName(format!(
                "Envoi retiré introuvable ou déjà ignoré: {}",
                row_id
            )));
        }
        Ok(())
    }

    /// Retire un envoi planifié de la file « Prêts à envoyer » sans l'envoyer.
    pub fn cancel_pending_email_campaign(&self, row_id: i64) -> Result<()> {
        let updated = self.conn.execute(
            "UPDATE contact_etiquettes SET email_annule = 1
             WHERE id = ?1 AND email_envoye = 0 AND COALESCE(email_annule, 0) = 0",
            params![row_id],
        )?;
        if updated > 0 {
            return Ok(());
        }
        let updated = self.conn.execute(
            "UPDATE contact_template_envois SET email_annule = 1
             WHERE id = ?1 AND email_envoye = 0 AND COALESCE(email_annule, 0) = 0",
            params![row_id],
        )?;
        if updated == 0 {
            return Err(rusqlite::Error::InvalidParameterName(format!(
                "Envoi planifié introuvable ou déjà traité: {}",
                row_id
            )));
        }
        Ok(())
    }

    /// Campagnes envoyées sans réponse enregistrée (pour sync Gmail / Agenda).
    pub fn list_campaigns_pending_response_check(
        &self,
    ) -> Result<Vec<super::models::PendingCampaignResponseCheck>> {
        let mut stmt = self.conn.prepare(
            "SELECT id, email, email_date_envoi, email_gmail_thread_id FROM (
                SELECT ce.id, c.email, ce.email_date_envoi, ce.email_gmail_thread_id
                FROM contact_etiquettes ce
                INNER JOIN etiquettes e ON ce.etiquette_id = e.id
                INNER JOIN contacts c ON ce.contact_id = c.id
                INNER JOIN templates_email t ON e.email_template_id = t.id
                WHERE e.actif = 1 AND e.email_actif = 1
                  AND ce.email_envoye = 1
                  AND ce.email_date_envoi IS NOT NULL
                  AND ce.email_reponse_at IS NULL
                  AND COALESCE(ce.email_suivi_ignore, 0) = 0
                  AND COALESCE(json_extract(t.variables, '$.email_suivi_reponse.attendre_reponse'), 1) = 1
                  AND c.email IS NOT NULL AND TRIM(c.email) != ''
                UNION ALL
                SELECT cte.id, c.email, cte.email_date_envoi, cte.email_gmail_thread_id
                FROM contact_template_envois cte
                INNER JOIN templates_email t ON cte.template_id = t.id
                INNER JOIN contacts c ON cte.contact_id = c.id
                WHERE json_extract(t.variables, '$.email_trigger.enabled') = 1
                  AND (
                    json_extract(t.variables, '$.email_trigger.condition_type') IS NOT NULL
                    OR json_extract(t.variables, '$.email_trigger.trigger_type') = 'EVENEMENT_SOUSCRIPTION'
                  )
                  AND cte.email_envoye = 1
                  AND cte.email_date_envoi IS NOT NULL
                  AND cte.email_reponse_at IS NULL
                  AND COALESCE(cte.email_suivi_ignore, 0) = 0
                  AND COALESCE(json_extract(t.variables, '$.email_suivi_reponse.attendre_reponse'), 1) = 1
                  AND c.email IS NOT NULL AND TRIM(c.email) != ''
             )
             ORDER BY email_date_envoi DESC
             LIMIT 200",
        )?;
        let rows = stmt.query_map([], |row| {
            Ok(super::models::PendingCampaignResponseCheck {
                contact_etiquette_id: row.get(0)?,
                contact_email: row.get::<_, String>(1)?,
                email_date_envoi: row.get(2)?,
                email_gmail_thread_id: row.get(3)?,
            })
        })?;
        rows.collect()
    }

    /// Réouvre une campagne déjà envoyée si le contact correspond encore à la règle auto
    /// et n'est plus dans la fenêtre d'attente de réponse (évite un doublon immédiat).
    pub(crate) fn try_reopen_sent_campaign_if_still_eligible(
        &self,
        assignment_id: i64,
        etiquette_id: i64,
    ) -> Result<bool> {
        let etiquette = self.get_etiquette_by_id(etiquette_id)?;
        if !etiquette.email_actif {
            return Ok(false);
        }

        let now = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_secs() as i64;

        let (
            email_envoye,
            date_attribution,
            email_date_envoi,
            email_reponse_at,
            email_suivi_ignore,
            email_annule,
            template_variables,
        ): (i64, i64, Option<i64>, Option<i64>, i64, i64, Option<String>) = self
            .conn
            .query_row(
                "SELECT ce.email_envoye, ce.date_attribution, ce.email_date_envoi, ce.email_reponse_at,
                        COALESCE(ce.email_suivi_ignore, 0), COALESCE(ce.email_annule, 0), t.variables
                 FROM contact_etiquettes ce
                 INNER JOIN etiquettes e ON ce.etiquette_id = e.id
                 LEFT JOIN templates_email t ON e.email_template_id = t.id
                 WHERE ce.id = ?1",
                params![assignment_id],
                |row| {
                    Ok((
                        row.get(0)?,
                        row.get(1)?,
                        row.get(2)?,
                        row.get(3)?,
                        row.get(4)?,
                        row.get(5)?,
                        row.get(6)?,
                    ))
                },
            )?;

        if email_envoye == 0 || email_annule != 0 {
            return Ok(false);
        }

        let should_reopen = if email_suivi_ignore != 0 || email_reponse_at.is_some() {
            true
        } else {
            let attendre_reponse = template_variables
                .as_deref()
                .and_then(|raw| serde_json::from_str::<serde_json::Value>(raw).ok())
                .and_then(|meta| meta.get("email_suivi_reponse")?.get("attendre_reponse")?.as_i64())
                .unwrap_or(1)
                != 0;
            if !attendre_reponse {
                true
            } else if let Some(envoi) = email_date_envoi {
                !matches_sent_followup_window(
                    template_variables.as_deref(),
                    envoi,
                    now,
                    DEFAULT_RELANCE_DELAI_JOURS,
                    false,
                )
            } else {
                true
            }
        };

        if !should_reopen {
            return Ok(false);
        }

        let prevue = resolve_email_date_prevue_for_contact(&etiquette, date_attribution);
        let updated = self.conn.execute(
            "UPDATE contact_etiquettes SET
                email_envoye = 0,
                email_date_prevue = ?1,
                email_date_envoi = NULL,
                email_reponse_at = NULL,
                email_reponse_type = NULL,
                email_suivi_ignore = 0,
                email_relance_active = 0,
                email_gmail_message_id = NULL,
                email_gmail_thread_id = NULL
             WHERE id = ?2 AND email_envoye = 1 AND COALESCE(email_annule, 0) = 0",
            params![prevue, assignment_id],
        )?;
        Ok(updated > 0)
    }

    /// Remet l'envoi en file « Prêts » pour une relance manuelle.
    pub fn prepare_email_campaign_relance(&self, row_id: i64) -> Result<()> {
        if self.prepare_contact_etiquette_relance(row_id).is_ok() {
            return Ok(());
        }
        self.prepare_template_envoi_relance(row_id)
    }

    fn prepare_contact_etiquette_relance(&self, contact_etiquette_id: i64) -> Result<()> {
        let now = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_secs() as i64;
        let updated = self.conn.execute(
            "UPDATE contact_etiquettes SET
                email_envoye = 0,
                email_date_prevue = ?1,
                email_reponse_at = NULL,
                email_reponse_type = NULL,
                email_suivi_ignore = 0,
                email_relance_active = 1,
                email_gmail_message_id = NULL,
                email_gmail_thread_id = NULL
             WHERE id = ?2 AND email_envoye = 1
               AND EXISTS (
                 SELECT 1 FROM etiquettes e
                 LEFT JOIN templates_email t ON e.email_template_id = t.id
                 WHERE e.id = contact_etiquettes.etiquette_id
                   AND COALESCE(json_extract(t.variables, '$.email_relance.enabled'), 1) = 1
               )",
            params![now, contact_etiquette_id],
        )?;
        if updated == 0 {
            return Err(rusqlite::Error::InvalidParameterName(format!(
                "Envoi introuvable ou relance désactivée: {}",
                contact_etiquette_id
            )));
        }
        Ok(())
    }
}
