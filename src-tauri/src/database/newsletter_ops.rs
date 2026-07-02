use super::models::{EtiquetteEmailQueueItem, NewTemplateEmail};
use super::Database;
use crate::newsletter::db::{
    is_newsletter_unsubscribe_request, CancelNewsletterPreparationResult, ContactAudienceRow,
    LastNewsletterEditionDuplicate, NewsletterAudienceFilters, NewsletterAudienceMember,
    NewsletterAudiencePreview, NewsletterEditionDetail, NewsletterEditionRecipient,
    NewsletterEditionSummary, NewsletterEligibleContact, NewsletterUnsubscribedContact,
    QueuedNewsletterContact,
};
use rusqlite::{params, OptionalExtension, Result};

impl Database {
    fn load_contacts_for_newsletter_audience(&self) -> Result<Vec<ContactAudienceRow>> {
        let mut stmt = self.conn.prepare(
            "SELECT id, nom, prenom, categorie, filleul_categorie, statut_suivi, newsletter_desinscrit_at, email
             FROM contacts
             ORDER BY nom, prenom",
        )?;
        let rows = stmt.query_map([], |row| {
            Ok(ContactAudienceRow {
                id: row.get(0)?,
                nom: row.get(1)?,
                prenom: row.get(2)?,
                categorie: row.get(3)?,
                filleul_categorie: row.get(4)?,
                statut_suivi: row.get(5)?,
                newsletter_desinscrit_at: row.get(6)?,
                email: row.get(7)?,
            })
        })?;
        rows.collect()
    }

    fn is_permanently_excluded_from_newsletter(c: &ContactAudienceRow) -> bool {
        c.newsletter_desinscrit_at.is_some()
    }

    fn contact_is_suspect(c: &ContactAudienceRow) -> bool {
        c.categorie == "SUSPECT_CLIENT"
            || c.categorie == "SUSPECT_FILLEUL"
            || c.filleul_categorie.as_deref() == Some("SUSPECT_FILLEUL")
    }

    fn contact_is_archived(c: &ContactAudienceRow) -> bool {
        matches!(
            c.statut_suivi.as_deref(),
            Some("ARCHIVE") | Some("EN_PAUSE")
        )
    }

    fn is_excluded_by_newsletter_filters(
        c: &ContactAudienceRow,
        filters: &NewsletterAudienceFilters,
    ) -> bool {
        if filters.exclude_contact_ids.contains(&c.id) {
            return true;
        }
        if filters.exclude_prescripteurs && c.categorie == "PRESCRIPTEUR" {
            return true;
        }
        if filters.exclude_suspects && Self::contact_is_suspect(c) {
            return true;
        }
        if filters.exclude_archived && Self::contact_is_archived(c) {
            return true;
        }
        false
    }

    fn has_usable_newsletter_email(email: Option<&str>) -> bool {
        email.map(|e| !e.trim().is_empty()).unwrap_or(false)
    }

    pub fn list_newsletter_audience_members(&self) -> Result<Vec<NewsletterAudienceMember>> {
        let contacts = self.load_contacts_for_newsletter_audience()?;
        Ok(contacts
            .into_iter()
            .map(|c| {
                let has_email = Self::has_usable_newsletter_email(c.email.as_deref());
                NewsletterAudienceMember {
                    contact_id: c.id,
                    nom: c.nom,
                    prenom: c.prenom,
                    email: c.email,
                    categorie: c.categorie,
                    filleul_categorie: c.filleul_categorie,
                    statut_suivi: c.statut_suivi,
                    has_email,
                    unsubscribed: c.newsletter_desinscrit_at.is_some(),
                }
            })
            .collect())
    }

    pub fn preview_newsletter_audience(
        &self,
        filters: &NewsletterAudienceFilters,
    ) -> Result<NewsletterAudiencePreview> {
        let contacts = self.load_contacts_for_newsletter_audience()?;
        let total = contacts.len() as u32;
        let mut with_email = 0u32;
        let mut without_email = 0u32;
        let mut permanent_excluded = 0u32;
        let mut excluded_by_filters = 0u32;
        let mut eligible = 0u32;
        let mut recipients = Vec::new();

        for c in &contacts {
            if Self::has_usable_newsletter_email(c.email.as_deref()) {
                with_email += 1;
            } else {
                without_email += 1;
            }
            if Self::is_permanently_excluded_from_newsletter(c) {
                permanent_excluded += 1;
                continue;
            }
            if Self::is_excluded_by_newsletter_filters(c, filters) {
                excluded_by_filters += 1;
                continue;
            }
            if Self::has_usable_newsletter_email(c.email.as_deref()) {
                eligible += 1;
                recipients.push(NewsletterEligibleContact {
                    contact_id: c.id,
                    nom: c.nom.clone(),
                    prenom: c.prenom.clone(),
                    email: c.email.clone().unwrap_or_default(),
                    categorie: c.categorie.clone(),
                    filleul_categorie: c.filleul_categorie.clone(),
                });
            }
        }

        Ok(NewsletterAudiencePreview {
            total_contacts: total,
            with_email,
            without_email,
            permanent_excluded,
            excluded_by_filters,
            eligible,
            recipients,
        })
    }

    pub fn list_newsletter_unsubscribed(&self) -> Result<Vec<NewsletterUnsubscribedContact>> {
        let mut stmt = self.conn.prepare(
            "SELECT id, nom, prenom, email, newsletter_desinscrit_at, newsletter_desinscrit_note
             FROM contacts
             WHERE newsletter_desinscrit_at IS NOT NULL
             ORDER BY newsletter_desinscrit_at DESC, nom, prenom",
        )?;
        let rows = stmt.query_map([], |row| {
            Ok(NewsletterUnsubscribedContact {
                contact_id: row.get(0)?,
                nom: row.get(1)?,
                prenom: row.get(2)?,
                email: row.get(3)?,
                unsubscribed_at: row.get::<_, Option<i64>>(4)?.unwrap_or(0),
                source: row.get(5)?,
            })
        })?;
        rows.collect()
    }

    pub fn mark_newsletter_unsubscribed(
        &self,
        contact_id: i64,
        source: Option<&str>,
    ) -> Result<bool> {
        let now = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_secs() as i64;

        let updated = self.conn.execute(
            "UPDATE contacts SET newsletter_desinscrit_at = ?1,
             newsletter_desinscrit_note = COALESCE(?2, newsletter_desinscrit_note),
             updated_at = ?1
             WHERE id = ?3 AND newsletter_desinscrit_at IS NULL",
            params![now, source, contact_id],
        )?;

        let _ = self.conn.execute(
            "DELETE FROM contact_etiquettes
             WHERE contact_id = ?1 AND email_envoye = 0
               AND etiquette_id IN (
                 SELECT id FROM etiquettes WHERE email_actif = 1
                   AND email_template_id IN (
                     SELECT id FROM templates_email WHERE categorie = 'NEWSLETTER'
                   )
               )",
            params![contact_id],
        );

        Ok(updated > 0)
    }

    pub fn try_newsletter_unsubscribe_from_reply(
        &self,
        contact_etiquette_id: i64,
        reply_subject: Option<&str>,
        reply_text: Option<&str>,
    ) -> Result<bool> {
        if !is_newsletter_unsubscribe_request(reply_subject, reply_text) {
            return Ok(false);
        }

        let (contact_id, template_categorie): (i64, Option<String>) = self.conn.query_row(
            "SELECT ce.contact_id, t.categorie
             FROM contact_etiquettes ce
             INNER JOIN etiquettes e ON ce.etiquette_id = e.id
             LEFT JOIN templates_email t ON e.email_template_id = t.id
             WHERE ce.id = ?1",
            params![contact_etiquette_id],
            |row| Ok((row.get(0)?, row.get(1)?)),
        )?;

        if template_categorie.as_deref() != Some("NEWSLETTER") {
            return Ok(false);
        }

        self.mark_newsletter_unsubscribed(contact_id, Some("Lien Se désinscrire (email)"))?;
        Ok(true)
    }

    pub fn try_newsletter_unsubscribe_from_template_reply(
        &self,
        row_id: i64,
        reply_subject: Option<&str>,
        reply_text: Option<&str>,
    ) -> Result<bool> {
        if !is_newsletter_unsubscribe_request(reply_subject, reply_text) {
            return Ok(false);
        }

        let (contact_id, template_categorie): (i64, String) = self.conn.query_row(
            "SELECT cte.contact_id, t.categorie
             FROM contact_template_envois cte
             INNER JOIN templates_email t ON cte.template_id = t.id
             WHERE cte.id = ?1",
            params![row_id],
            |row| Ok((row.get(0)?, row.get(1)?)),
        )?;

        if template_categorie != "NEWSLETTER" {
            return Ok(false);
        }

        self.mark_newsletter_unsubscribed(contact_id, Some("Lien Se désinscrire (email)"))?;
        Ok(true)
    }

    pub fn upsert_newsletter_template(
        &self,
        etiquette_id: i64,
        subject: &str,
        plain_body: &str,
        html_meta: &str,
    ) -> Result<i64> {
        let etiquette = self.get_etiquette_by_id(etiquette_id)?;
        let template_payload = NewTemplateEmail {
            nom: "Newsletter".into(),
            sujet: subject.into(),
            corps: plain_body.into(),
            categorie: "NEWSLETTER".into(),
            variables: Some(html_meta.into()),
            agenda_link_id: None,
            relance_template_id: None,
            tutoiement_template_id: None,
        };

        if let Some(template_id) = etiquette.email_template_id {
            if let Ok(existing) = self.get_template_email_by_id(template_id) {
                if existing.categorie == "NEWSLETTER" {
                    let updated = self.update_template_email(template_id, &template_payload)?;
                    return Ok(updated.id);
                }
            }
        }

        let created = self.create_template_email(template_payload)?;
        Ok(created.id)
    }

    pub fn queue_newsletter_edition(
        &self,
        etiquette_id: i64,
        send_at: i64,
        filters: &NewsletterAudienceFilters,
    ) -> Result<(u32, u32, Vec<QueuedNewsletterContact>)> {
        let contacts = self.load_contacts_for_newsletter_audience()?;
        let mut queued = 0u32;
        let mut skipped_no_email = 0u32;
        let mut queued_contacts = Vec::new();

        self.conn.execute("BEGIN IMMEDIATE", [])?;

        let result = (|| -> Result<(u32, u32, Vec<QueuedNewsletterContact>)> {
            for c in contacts {
                if Self::is_permanently_excluded_from_newsletter(&c)
                    || Self::is_excluded_by_newsletter_filters(&c, filters)
                {
                    continue;
                }
                if !Self::has_usable_newsletter_email(c.email.as_deref()) {
                    skipped_no_email += 1;
                    continue;
                }

                self.conn.execute(
                    "INSERT INTO contact_etiquettes (
                        contact_id, etiquette_id, attribue_par, email_date_prevue,
                        email_envoye, email_suivi_ignore, email_relance_active
                     ) VALUES (?1, ?2, 'NEWSLETTER', ?3, 0, 1, 0)
                     ON CONFLICT(contact_id, etiquette_id) DO UPDATE SET
                        attribue_par = 'NEWSLETTER',
                        date_attribution = unixepoch(),
                        email_date_prevue = excluded.email_date_prevue,
                        email_envoye = 0,
                        email_date_envoi = NULL,
                        email_reponse_at = NULL,
                        email_reponse_type = NULL,
                        email_reponse_body = NULL,
                        email_reponse_gmail_message_id = NULL,
                        email_suivi_ignore = 1,
                        email_relance_active = 0,
                        email_annule = 0,
                        email_gmail_message_id = NULL,
                        email_gmail_thread_id = NULL,
                        email_sent_subject = NULL,
                        email_sent_body = NULL,
                        email_sent_template_nom = NULL",
                    params![c.id, etiquette_id, send_at],
                )?;

                let contact_etiquette_id: i64 = self.conn.query_row(
                    "SELECT id FROM contact_etiquettes WHERE contact_id = ?1 AND etiquette_id = ?2",
                    params![c.id, etiquette_id],
                    |row| row.get(0),
                )?;

                queued_contacts.push(QueuedNewsletterContact {
                    contact_id: c.id,
                    contact_etiquette_id,
                    nom: c.nom.clone(),
                    prenom: c.prenom.clone(),
                    email: c.email.clone().unwrap_or_default(),
                });
                queued += 1;
            }
            Ok((queued, skipped_no_email, queued_contacts))
        })();

        match result {
            Ok(r) => {
                self.conn.execute("COMMIT", [])?;
                Ok(r)
            }
            Err(e) => {
                let _ = self.conn.execute("ROLLBACK", []);
                Err(e)
            }
        }
    }

    pub fn create_newsletter_edition(
        &self,
        etiquette_id: i64,
        template_id: i64,
        edition_label: &str,
        subject: &str,
        plain_body: &str,
        content_json: &str,
        theme: Option<&str>,
        edition_instructions: Option<&str>,
        filters_json: &str,
        prepared_at: i64,
        queued: &[QueuedNewsletterContact],
    ) -> Result<i64> {
        self.conn.execute(
            "INSERT INTO newsletter_editions (
                etiquette_id, template_id, edition_label, subject, plain_body, content_json,
                theme, edition_instructions, audience_filters_json, prepared_at, queued_count, status
             ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, 'prepared')",
            params![
                etiquette_id,
                template_id,
                edition_label,
                subject,
                plain_body,
                content_json,
                theme,
                edition_instructions,
                filters_json,
                prepared_at,
                queued.len() as i64,
            ],
        )?;
        let edition_id = self.conn.last_insert_rowid();

        for q in queued {
            self.conn.execute(
                "INSERT INTO newsletter_edition_recipients (
                    edition_id, contact_id, contact_etiquette_id, nom, prenom, email
                 ) VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
                params![
                    edition_id,
                    q.contact_id,
                    q.contact_etiquette_id,
                    q.nom,
                    q.prenom,
                    q.email,
                ],
            )?;
        }

        Ok(edition_id)
    }

    pub fn list_newsletter_editions(&self, limit: u32) -> Result<Vec<NewsletterEditionSummary>> {
        let mut stmt = self.conn.prepare(
            "SELECT id, edition_label, subject, prepared_at, send_completed_at,
                    queued_count, sent_count, error_count, status
             FROM newsletter_editions
             ORDER BY prepared_at DESC
             LIMIT ?1",
        )?;
        let rows = stmt.query_map(params![limit], |row| {
            Ok(NewsletterEditionSummary {
                id: row.get(0)?,
                edition_label: row.get(1)?,
                subject: row.get(2)?,
                prepared_at: row.get(3)?,
                send_completed_at: row.get(4)?,
                queued_count: row.get::<_, i64>(5)? as u32,
                sent_count: row.get::<_, i64>(6)? as u32,
                error_count: row.get::<_, i64>(7)? as u32,
                status: row.get(8)?,
            })
        })?;
        rows.collect()
    }

    pub fn get_newsletter_edition_detail(&self, edition_id: i64) -> Result<NewsletterEditionDetail> {
        let mut detail = self.conn.query_row(
            "SELECT id, edition_label, subject, plain_body, theme, edition_instructions,
                    prepared_at, send_started_at, send_completed_at,
                    queued_count, sent_count, error_count, status
             FROM newsletter_editions WHERE id = ?1",
            params![edition_id],
            |row| {
                Ok(NewsletterEditionDetail {
                    id: row.get(0)?,
                    edition_label: row.get(1)?,
                    subject: row.get(2)?,
                    plain_body: row.get(3)?,
                    theme: row.get(4)?,
                    edition_instructions: row.get(5)?,
                    prepared_at: row.get(6)?,
                    send_started_at: row.get(7)?,
                    send_completed_at: row.get(8)?,
                    queued_count: row.get::<_, i64>(9)? as u32,
                    sent_count: row.get::<_, i64>(10)? as u32,
                    error_count: row.get::<_, i64>(11)? as u32,
                    status: row.get(12)?,
                    recipients: Vec::new(),
                })
            },
        )?;

        let mut stmt = self.conn.prepare(
            "SELECT contact_id, contact_etiquette_id, nom, prenom, email, sent_at, error_message
             FROM newsletter_edition_recipients
             WHERE edition_id = ?1
             ORDER BY nom, prenom",
        )?;
        detail.recipients = stmt
            .query_map(params![edition_id], |row| {
                Ok(NewsletterEditionRecipient {
                    contact_id: row.get(0)?,
                    contact_etiquette_id: row.get(1)?,
                    nom: row.get(2)?,
                    prenom: row.get(3)?,
                    email: row.get(4)?,
                    sent_at: row.get(5)?,
                    error_message: row.get(6)?,
                })
            })?
            .collect::<Result<Vec<_>>>()?;

        Ok(detail)
    }

    pub fn get_last_newsletter_edition_duplicate(
        &self,
    ) -> Result<Option<LastNewsletterEditionDuplicate>> {
        let mut stmt = self.conn.prepare(
            "SELECT edition_label, subject, plain_body, content_json, theme, edition_instructions, prepared_at
             FROM newsletter_editions
             ORDER BY prepared_at DESC
             LIMIT 1",
        )?;
        let mut rows = stmt.query([])?;
        if let Some(row) = rows.next()? {
            return Ok(Some(LastNewsletterEditionDuplicate {
                edition_label: row.get(0)?,
                subject: row.get(1)?,
                plain_body: row.get(2)?,
                content_json: row.get(3)?,
                theme: row.get(4)?,
                edition_instructions: row.get(5)?,
                prepared_at: row.get(6)?,
            }));
        }
        Ok(None)
    }

    pub fn start_newsletter_edition_send(&self, edition_id: i64, started_at: i64) -> Result<()> {
        let updated = self.conn.execute(
            "UPDATE newsletter_editions
             SET status = 'sending', send_started_at = ?1
             WHERE id = ?2
               AND (
                 status IN ('prepared', 'partial')
                 OR (status = 'completed' AND sent_count < queued_count)
               )",
            params![started_at, edition_id],
        )?;
        if updated == 0 {
            return Err(rusqlite::Error::InvalidParameterName(format!(
                "Édition introuvable ou déjà envoyée: {}",
                edition_id
            )));
        }
        Ok(())
    }

    pub fn record_newsletter_edition_send(
        &self,
        edition_id: i64,
        contact_etiquette_id: i64,
        sent_at: i64,
        gmail_message_id: Option<&str>,
        error_message: Option<&str>,
    ) -> Result<()> {
        self.conn.execute("BEGIN IMMEDIATE", [])?;
        let result = (|| -> Result<()> {
            if let Some(err) = error_message {
                self.conn.execute(
                    "UPDATE newsletter_edition_recipients
                     SET error_message = ?1
                     WHERE edition_id = ?2 AND contact_etiquette_id = ?3",
                    params![err, edition_id, contact_etiquette_id],
                )?;
                self.conn.execute(
                    "UPDATE newsletter_editions SET error_count = error_count + 1 WHERE id = ?1",
                    params![edition_id],
                )?;
            } else {
                self.conn.execute(
                    "UPDATE newsletter_edition_recipients
                     SET sent_at = ?1, gmail_message_id = ?2, error_message = NULL
                     WHERE edition_id = ?3 AND contact_etiquette_id = ?4",
                    params![sent_at, gmail_message_id, edition_id, contact_etiquette_id],
                )?;
                self.conn.execute(
                    "UPDATE newsletter_editions SET sent_count = sent_count + 1 WHERE id = ?1",
                    params![edition_id],
                )?;
            }
            Ok(())
        })();
        match result {
            Ok(()) => {
                self.conn.execute("COMMIT", [])?;
                Ok(())
            }
            Err(e) => {
                let _ = self.conn.execute("ROLLBACK", []);
                Err(e)
            }
        }
    }

    pub fn finish_newsletter_edition_send(
        &self,
        edition_id: i64,
        completed_at: i64,
        cancelled: bool,
    ) -> Result<NewsletterEditionSummary> {
        let (_queued, sent, errors): (i64, i64, i64) = self.conn.query_row(
            "SELECT queued_count, sent_count, error_count FROM newsletter_editions WHERE id = ?1",
            params![edition_id],
            |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)),
        )?;

        let status = if cancelled {
            if sent > 0 || errors > 0 {
                "partial"
            } else {
                "cancelled"
            }
        } else if sent == 0 && errors == 0 {
            // Envoi batch vide (ex. file introuvable) — garder relançable.
            "prepared"
        } else if errors > 0 {
            "partial"
        } else {
            "completed"
        };

        self.conn.execute(
            "UPDATE newsletter_editions
             SET status = ?1, send_completed_at = ?2
             WHERE id = ?3",
            params![status, completed_at, edition_id],
        )?;

        self.conn.query_row(
            "SELECT id, edition_label, subject, prepared_at, send_completed_at,
                    queued_count, sent_count, error_count, status
             FROM newsletter_editions WHERE id = ?1",
            params![edition_id],
            |row| {
                Ok(NewsletterEditionSummary {
                    id: row.get(0)?,
                    edition_label: row.get(1)?,
                    subject: row.get(2)?,
                    prepared_at: row.get(3)?,
                    send_completed_at: row.get(4)?,
                    queued_count: row.get::<_, i64>(5)? as u32,
                    sent_count: row.get::<_, i64>(6)? as u32,
                    error_count: row.get::<_, i64>(7)? as u32,
                    status: row.get(8)?,
                })
            },
        )
    }

    fn resolve_active_newsletter_edition_id(
        &self,
        etiquette_id: i64,
        edition_id: Option<i64>,
    ) -> Result<Option<i64>> {
        if let Some(id) = edition_id {
            return Ok(Some(id));
        }
        self.conn
            .query_row(
                "SELECT id FROM newsletter_editions
                 WHERE etiquette_id = ?1
                   AND (
                     status IN ('prepared', 'partial', 'sending')
                     OR (status = 'completed' AND sent_count < queued_count)
                   )
                 ORDER BY prepared_at DESC
                 LIMIT 1",
                params![etiquette_id],
                |row| row.get(0),
            )
            .optional()
    }

    fn map_newsletter_send_queue_row(
        row: &rusqlite::Row<'_>,
    ) -> rusqlite::Result<EtiquetteEmailQueueItem> {
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
            campaign_variables: row.get(22).ok(),
            email_gmail_message_id: row.get(23).ok(),
            email_gmail_thread_id: row.get(24).ok(),
            email_sent_subject: row.get(25).ok(),
            rendement_exceltis: String::new(),
        })
    }

    /// Réactive les lignes file après annulation précédente ou édition bloquée à 0/N.
    fn ensure_newsletter_edition_resumable(&self, edition_id: i64) -> Result<()> {
        self.conn.execute(
            "UPDATE contact_etiquettes SET email_annule = 0, email_suivi_ignore = 1
             WHERE id IN (
               SELECT ner.contact_etiquette_id
               FROM newsletter_edition_recipients ner
               INNER JOIN newsletter_editions ne ON ne.id = ner.edition_id
               WHERE ner.edition_id = ?1
                 AND ner.sent_at IS NULL
                 AND (
                   ne.status IN ('prepared', 'partial', 'sending')
                   OR (ne.status = 'completed' AND ne.sent_count < ne.queued_count)
                 )
             )
             AND email_envoye = 0",
            params![edition_id],
        )?;
        self.conn.execute(
            "UPDATE newsletter_editions
             SET status = 'prepared', send_completed_at = NULL
             WHERE id = ?1 AND status = 'completed' AND sent_count < queued_count",
            params![edition_id],
        )?;
        Ok(())
    }

    /// Destinataires encore à envoyer pour une édition (hors file Suivi standard).
    pub fn get_newsletter_send_queue(&self, edition_id: i64) -> Result<Vec<EtiquetteEmailQueueItem>> {
        self.ensure_newsletter_edition_resumable(edition_id)?;
        let sql = "SELECT ce.id, ce.contact_id, c.nom, c.prenom, c.email, c.telephone,
                        e.id, e.nom, e.couleur, ce.email_date_prevue, ce.email_date_envoi,
                        COALESCE(t.sujet, ''), COALESCE(t.corps, ''), t.agenda_link_id,
                        t.variables, t.categorie, NULL,
                        ce.email_reponse_at, ce.email_reponse_type, c.date_dernier_contact,
                        c.registre,
                        COALESCE(ce.email_relance_active, 0),
                        NULL,
                        NULL,
                        NULL,
                        NULL
                 FROM newsletter_edition_recipients ner
                 INNER JOIN contact_etiquettes ce ON ce.id = ner.contact_etiquette_id
                 INNER JOIN contacts c ON ce.contact_id = c.id
                 INNER JOIN etiquettes e ON ce.etiquette_id = e.id
                 LEFT JOIN templates_email t ON e.email_template_id = t.id
                 INNER JOIN newsletter_editions ne ON ne.id = ner.edition_id
                 WHERE ner.edition_id = ?1
                   AND ner.sent_at IS NULL
                   AND ce.email_envoye = 0
                   AND COALESCE(ce.email_annule, 0) = 0
                   AND (
                     ne.status IN ('prepared', 'partial', 'sending')
                     OR (ne.status = 'completed' AND ne.sent_count < ne.queued_count)
                   )
                 ORDER BY c.nom, c.prenom, ce.id";
        let mut stmt = self.conn.prepare(sql)?;
        let rows = stmt.query_map(params![edition_id], Self::map_newsletter_send_queue_row)?;
        rows.collect()
    }

    pub fn count_newsletter_send_ready(
        &self,
        etiquette_id: i64,
        edition_id: Option<i64>,
    ) -> Result<u32> {
        let edition_id = match self.resolve_active_newsletter_edition_id(etiquette_id, edition_id)? {
            Some(id) => id,
            None => return Ok(0),
        };
        Ok(self.get_newsletter_send_queue(edition_id)?.len() as u32)
    }

    fn resolve_prepared_newsletter_edition_id(
        &self,
        etiquette_id: i64,
        edition_id: Option<i64>,
    ) -> Result<i64> {
        if let Some(id) = edition_id {
            let (found_id, status): (i64, String) = self.conn.query_row(
                "SELECT id, status FROM newsletter_editions
                 WHERE id = ?1 AND etiquette_id = ?2",
                params![id, etiquette_id],
                |row| Ok((row.get(0)?, row.get(1)?)),
            )?;
            if status != "prepared" {
                return Err(rusqlite::Error::InvalidParameterName(format!(
                    "Seule une édition préparée peut être annulée (statut: {})",
                    status
                )));
            }
            return Ok(found_id);
        }

        self.conn.query_row(
            "SELECT id FROM newsletter_editions
             WHERE etiquette_id = ?1 AND status = 'prepared'
             ORDER BY prepared_at DESC
             LIMIT 1",
            params![etiquette_id],
            |row| row.get(0),
        )
    }

    pub fn cancel_newsletter_preparation(
        &self,
        etiquette_id: i64,
        edition_id: Option<i64>,
    ) -> Result<CancelNewsletterPreparationResult> {
        let edition_id = self.resolve_prepared_newsletter_edition_id(etiquette_id, edition_id)?;

        let (
            edition_label,
            subject,
            plain_body,
            content_json,
            theme,
            edition_instructions,
            audience_filters_json,
        ): (
            String,
            String,
            String,
            String,
            Option<String>,
            Option<String>,
            String,
        ) = self.conn.query_row(
            "SELECT edition_label, subject, plain_body, content_json, theme,
                    edition_instructions, audience_filters_json
             FROM newsletter_editions WHERE id = ?1",
            params![edition_id],
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

        let audience_filters: NewsletterAudienceFilters =
            serde_json::from_str(&audience_filters_json).unwrap_or_default();

        let mut recipient_ids: Vec<i64> = self
            .conn
            .prepare(
                "SELECT contact_etiquette_id FROM newsletter_edition_recipients
                 WHERE edition_id = ?1",
            )?
            .query_map(params![edition_id], |row| row.get(0))?
            .collect::<Result<Vec<_>>>()?;

        if recipient_ids.is_empty() {
            recipient_ids = self
                .conn
                .prepare(
                    "SELECT ce.id FROM contact_etiquettes ce
                     WHERE ce.etiquette_id = ?1
                       AND ce.email_envoye = 0
                       AND COALESCE(ce.email_annule, 0) = 0
                       AND ce.attribue_par = 'NEWSLETTER'",
                )?
                .query_map(params![etiquette_id], |row| row.get(0))?
                .collect::<Result<Vec<_>>>()?;
        }

        self.conn.execute("BEGIN IMMEDIATE", [])?;

        let result = (|| -> Result<u32> {
            let mut cancelled_queue_count = 0u32;
            for row_id in recipient_ids {
                let updated = self.conn.execute(
                    "UPDATE contact_etiquettes SET email_annule = 1, email_suivi_ignore = 0
                     WHERE id = ?1 AND etiquette_id = ?2
                       AND email_envoye = 0 AND COALESCE(email_annule, 0) = 0",
                    params![row_id, etiquette_id],
                )?;
                if updated > 0 {
                    cancelled_queue_count += 1;
                }
            }

            let updated = self.conn.execute(
                "UPDATE newsletter_editions SET status = 'cancelled' WHERE id = ?1 AND status = 'prepared'",
                params![edition_id],
            )?;
            if updated == 0 {
                return Err(rusqlite::Error::InvalidParameterName(format!(
                    "Édition introuvable ou déjà traitée: {}",
                    edition_id
                )));
            }

            Ok(cancelled_queue_count)
        })();

        match result {
            Ok(cancelled_queue_count) => {
                self.conn.execute("COMMIT", [])?;
                Ok(CancelNewsletterPreparationResult {
                    edition_id,
                    cancelled_queue_count,
                    edition_label,
                    subject,
                    plain_body,
                    content_json,
                    theme,
                    edition_instructions,
                    audience_filters,
                })
            }
            Err(e) => {
                let _ = self.conn.execute("ROLLBACK", []);
                Err(e)
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::database::models::{NewContact, NewEtiquette};
    use crate::database::Database;

    fn sample_contact(nom: &str, prenom: &str) -> NewContact {
        NewContact {
            famille_id: None,
            foyer_id: None,
            role_foyer: None,
            role_famille: None,
            categorie: "CLIENT".into(),
            filleul_categorie: None,
            parrain_id: None,
            prescripteur_id: None,
            civilite: None,
            nom: nom.into(),
            prenom: prenom.into(),
            email: None,
            telephone: None,
            adresse: None,
            code_postal: None,
            ville: None,
            pays: None,
            date_naissance: None,
            lieu_naissance: None,
            profession: None,
            situation_familiale: None,
            regime_matrimonial: None,
            revenus_annuels: None,
            charges_emprunts: None,
            objectifs_patrimoniaux: None,
            source_lead: None,
            profil_risque_sri: None,
            date_dernier_contact: None,
            date_prochain_suivi: None,
            date_dernier_contact_filleul: None,
            date_prochain_suivi_filleul: None,
            date_r1: None,
            type_invitation_filleul: None,
            date_invitation_filleul: None,
            presence_invitation_filleul: None,
            statut_suivi: None,
            registre: None,
            notes: None,
            famille_regroupement_exclu: None,
            epargne_precaution_souhaitee: None,
        }
    }

    #[test]
    fn cancel_newsletter_preparation_clears_queue_and_restores_payload() {
        let db = Database::open_in_memory_for_tests().unwrap();
        let now = 1_700_000_000i64;
        let etiquette = db
            .create_etiquette(NewEtiquette {
                nom: "Newsletter".into(),
                couleur: None,
                icone: None,
                description: None,
                priorite: Some(0),
                auto_condition_type: None,
                auto_condition_config: None,
                auto_categories: None,
                email_template_id: None,
                email_delai_jours: None,
                email_envoi_prevu: None,
                email_envoi_heure: None,
                email_envoi_jours_semaine: None,
                email_actif: Some(false),
                is_default: Some(false),
                actif: Some(true),
                segment_id: None,
                rendement_cible: None,
            })
            .unwrap();

        db.create_contact(NewContact {
            email: Some("alice@example.com".into()),
            ..sample_contact("Dupont", "Alice")
        })
        .unwrap();

        let filters = NewsletterAudienceFilters::default();
        let filters_json = serde_json::to_string(&filters).unwrap();
        let template_id = db
            .upsert_newsletter_template(
                etiquette.id,
                "Objet test",
                "Corps",
                r#"{"newsletter_html":"<p>Hi</p>"}"#,
            )
            .unwrap();
        let (_queued, _skipped, queued_contacts) = db
            .queue_newsletter_edition(etiquette.id, now, &filters)
            .unwrap();
        assert_eq!(queued_contacts.len(), 1);

        let edition_id = db
            .create_newsletter_edition(
                etiquette.id,
                template_id,
                "Juin 2026",
                "Objet test",
                "Corps",
                r#"{"subject":"Objet test","intro":"Hi"}"#,
                Some("Thème"),
                None,
                &filters_json,
                now,
                &queued_contacts,
            )
            .unwrap();

        let send_queue = db.get_newsletter_send_queue(edition_id).unwrap();
        assert_eq!(send_queue.len(), 1);
        assert_eq!(db.count_newsletter_send_ready(etiquette.id, Some(edition_id)).unwrap(), 1);
        assert!(
            db.get_etiquette_email_queue("ready")
                .unwrap()
                .iter()
                .all(|q| q.etiquette_id != etiquette.id),
            "newsletter ne doit pas passer par la file Suivi standard"
        );

        let result = db
            .cancel_newsletter_preparation(etiquette.id, Some(edition_id))
            .unwrap();
        assert_eq!(result.cancelled_queue_count, 1);
        assert_eq!(result.subject, "Objet test");
        assert!(result.content_json.contains("intro"));

        let editions = db.list_newsletter_editions(5).unwrap();
        assert_eq!(editions[0].status, "cancelled");

        let send_queue = db.get_newsletter_send_queue(edition_id).unwrap();
        assert!(send_queue.is_empty());
    }

    #[test]
    fn get_newsletter_send_queue_includes_stuck_completed_edition() {
        let db = Database::open_in_memory_for_tests().unwrap();
        let now = 1_700_000_000i64;
        let etiquette = db
            .create_etiquette(NewEtiquette {
                nom: "Newsletter".into(),
                couleur: None,
                icone: None,
                description: None,
                priorite: Some(0),
                auto_condition_type: None,
                auto_condition_config: None,
                auto_categories: None,
                email_template_id: None,
                email_delai_jours: None,
                email_envoi_prevu: None,
                email_envoi_heure: None,
                email_envoi_jours_semaine: None,
                email_actif: Some(false),
                is_default: Some(false),
                actif: Some(true),
                segment_id: None,
                rendement_cible: None,
            })
            .unwrap();

        db.create_contact(NewContact {
            email: Some("alice@example.com".into()),
            ..sample_contact("Dupont", "Alice")
        })
        .unwrap();

        let filters = NewsletterAudienceFilters::default();
        let filters_json = serde_json::to_string(&filters).unwrap();
        let template_id = db
            .upsert_newsletter_template(
                etiquette.id,
                "Objet test",
                "Corps",
                r#"{"newsletter_html":"<p>Hi</p>"}"#,
            )
            .unwrap();
        let (_queued, _skipped, queued_contacts) = db
            .queue_newsletter_edition(etiquette.id, now, &filters)
            .unwrap();

        let edition_id = db
            .create_newsletter_edition(
                etiquette.id,
                template_id,
                "Juin 2026",
                "Objet test",
                "Corps",
                r#"{"subject":"Objet test","intro":"Hi"}"#,
                Some("Thème"),
                None,
                &filters_json,
                now,
                &queued_contacts,
            )
            .unwrap();

        db.conn
            .execute(
                "UPDATE newsletter_editions SET status = 'completed', send_completed_at = ?1 WHERE id = ?2",
                params![now, edition_id],
            )
            .unwrap();

        let send_queue = db.get_newsletter_send_queue(edition_id).unwrap();
        assert_eq!(send_queue.len(), 1);
        assert_eq!(
            db.count_newsletter_send_ready(etiquette.id, Some(edition_id))
                .unwrap(),
            1
        );
    }

    #[test]
    fn prepare_after_cancel_restores_send_queue_via_ensure() {
        let db = Database::open_in_memory_for_tests().unwrap();
        let now = 1_700_000_000i64;
        let etiquette = db
            .create_etiquette(NewEtiquette {
                nom: "Newsletter".into(),
                couleur: None,
                icone: None,
                description: None,
                priorite: Some(0),
                auto_condition_type: None,
                auto_condition_config: None,
                auto_categories: None,
                email_template_id: None,
                email_delai_jours: None,
                email_envoi_prevu: None,
                email_envoi_heure: None,
                email_envoi_jours_semaine: None,
                email_actif: Some(false),
                is_default: Some(false),
                actif: Some(true),
                segment_id: None,
                rendement_cible: None,
            })
            .unwrap();

        db.create_contact(NewContact {
            email: Some("alice@example.com".into()),
            ..sample_contact("Dupont", "Alice")
        })
        .unwrap();

        let filters = NewsletterAudienceFilters::default();
        let filters_json = serde_json::to_string(&filters).unwrap();
        let template_id = db
            .upsert_newsletter_template(
                etiquette.id,
                "Objet test",
                "Corps",
                r#"{"newsletter_html":"<p>Hi</p>"}"#,
            )
            .unwrap();
        let (_q1, _s1, queued1) = db
            .queue_newsletter_edition(etiquette.id, now, &filters)
            .unwrap();
        let edition1 = db
            .create_newsletter_edition(
                etiquette.id,
                template_id,
                "Juin 2026",
                "Objet test",
                "Corps",
                r#"{"subject":"Objet test","intro":"Hi"}"#,
                None,
                None,
                &filters_json,
                now,
                &queued1,
            )
            .unwrap();
        db.cancel_newsletter_preparation(etiquette.id, Some(edition1))
            .unwrap();

        let (_q2, _s2, queued2) = db
            .queue_newsletter_edition(etiquette.id, now + 60, &filters)
            .unwrap();
        let edition2 = db
            .create_newsletter_edition(
                etiquette.id,
                template_id,
                "Juin 2026 bis",
                "Objet test",
                "Corps",
                r#"{"subject":"Objet test","intro":"Hi"}"#,
                None,
                None,
                &filters_json,
                now + 60,
                &queued2,
            )
            .unwrap();

        db.conn
            .execute(
                "UPDATE newsletter_editions SET status = 'completed', send_completed_at = ?1 WHERE id = ?2",
                params![now + 120, edition2],
            )
            .unwrap();

        let send_queue = db.get_newsletter_send_queue(edition2).unwrap();
        assert_eq!(send_queue.len(), 1);
        let status: String = db
            .conn
            .query_row(
                "SELECT status FROM newsletter_editions WHERE id = ?1",
                params![edition2],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(status, "prepared");
    }
}
