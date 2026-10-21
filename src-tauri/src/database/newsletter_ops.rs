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

/// Newsletter = envoi one-way : jamais de suivi de réponse / relance auto.
fn newsletter_template_variables(html_meta: &str) -> String {
    let mut value = serde_json::from_str::<serde_json::Value>(html_meta)
        .ok()
        .filter(|v| v.is_object())
        .unwrap_or_else(|| serde_json::json!({}));
    value["email_suivi_reponse"] = serde_json::json!({ "attendre_reponse": false });
    value.to_string()
}

const NEWSLETTER_UNSUBSCRIBE_SCAN_KEY: &str = "newsletter_unsubscribe_scan_at";

/// Adresse de l'expéditeur (`"Nom" <a@b.fr>` → `a@b.fr`) : le nom affiché est ignoré,
/// pour ne pas désinscrire une adresse qui n'y figure qu'en texte.
fn sender_address(from_header: &str) -> Option<String> {
    let header = from_header.trim();
    let addr = match (header.rfind('<'), header.rfind('>')) {
        (Some(start), Some(end)) if start < end => &header[start + 1..end],
        _ => header,
    };
    let addr = addr.trim();
    (addr.contains('@') && !addr.contains(char::is_whitespace)).then(|| addr.to_lowercase())
}

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

        // Éditions en attente : le contact n'est plus à servir (sinon l'édition ne se termine
        // jamais : envoyés < préparés en boucle).
        let pending_editions: Vec<i64> = self
            .conn
            .prepare(
                "SELECT DISTINCT ne.id FROM newsletter_editions ne
                 INNER JOIN newsletter_edition_recipients ner ON ner.edition_id = ne.id
                 WHERE ner.contact_id = ?1 AND ner.sent_at IS NULL
                   AND (
                     ne.status IN ('prepared', 'partial', 'sending')
                     OR (ne.status = 'completed' AND ne.sent_count < ne.queued_count)
                   )",
            )?
            .query_map(params![contact_id], |row| row.get(0))?
            .collect::<Result<Vec<_>>>()?;
        for edition_id in pending_editions {
            let removed = self.conn.execute(
                "DELETE FROM newsletter_edition_recipients
                 WHERE edition_id = ?1 AND contact_id = ?2 AND sent_at IS NULL",
                params![edition_id, contact_id],
            )?;
            self.conn.execute(
                "UPDATE newsletter_editions SET queued_count = MAX(queued_count - ?1, 0)
                 WHERE id = ?2",
                params![removed as i64, edition_id],
            )?;
        }

        // Ligne newsletter en attente uniquement (pas les campagnes de catégorie NEWSLETTER
        // comme Performance Stellium, qui n'ont pas de HTML d'édition).
        let _ = self.conn.execute(
            "DELETE FROM contact_etiquettes
             WHERE contact_id = ?1 AND email_envoye = 0
               AND etiquette_id IN (
                 SELECT e.id FROM etiquettes e
                 INNER JOIN templates_email t ON t.id = e.email_template_id
                 WHERE e.email_actif = 1
                   AND t.categorie = 'NEWSLETTER'
                   AND CASE WHEN json_valid(t.variables)
                         THEN json_type(t.variables, '$.newsletter_html') END IS NOT NULL
               )",
            params![contact_id],
        );

        Ok(updated > 0)
    }

    pub fn get_contact_newsletter_unsubscribed_at(&self, contact_id: i64) -> Result<Option<i64>> {
        self.conn.query_row(
            "SELECT newsletter_desinscrit_at FROM contacts WHERE id = ?1",
            params![contact_id],
            |row| row.get(0),
        )
    }

    /// Case « Désinscrit de la newsletter » de la fiche contact.
    pub fn set_contact_newsletter_unsubscribed(
        &self,
        contact_id: i64,
        unsubscribed: bool,
    ) -> Result<()> {
        if unsubscribed {
            self.mark_newsletter_unsubscribed(contact_id, Some("Fiche contact"))?;
        } else {
            self.conn.execute(
                "UPDATE contacts
                 SET newsletter_desinscrit_at = NULL, newsletter_desinscrit_note = NULL,
                     updated_at = unixepoch()
                 WHERE id = ?1",
                params![contact_id],
            )?;
        }
        Ok(())
    }

    /// Recherche des emails de désinscription : une fois par jour (24 h depuis la dernière
    /// recherche réussie).
    pub fn newsletter_unsubscribe_scan_due(&self, now: i64) -> bool {
        let last = self
            .get_setting(NEWSLETTER_UNSUBSCRIBE_SCAN_KEY)
            .ok()
            .flatten()
            .and_then(|v| v.parse::<i64>().ok());
        match last {
            Some(at) => now - at >= 86_400 || at > now,
            None => true,
        }
    }

    pub fn mark_newsletter_unsubscribe_scanned(&self, now: i64) {
        if let Err(e) = self.set_setting(NEWSLETTER_UNSUBSCRIBE_SCAN_KEY, &now.to_string()) {
            eprintln!("Date de recherche des désinscriptions non enregistrée : {e}");
        }
    }

    /// Messages de désinscription déjà traités (la synchro ne les relit pas).
    pub fn known_newsletter_unsubscribe_message_ids(
        &self,
    ) -> Result<std::collections::HashSet<String>> {
        self.conn
            .prepare("SELECT message_id FROM newsletter_unsubscribe_requests")?
            .query_map([], |row| row.get(0))?
            .collect()
    }

    /// Emails « Désinscription newsletter » reçus : désinscrit l'expéditeur s'il est un contact.
    /// Chaque message n'est traité qu'une fois. Retourne le nombre de nouveaux désinscrits.
    pub fn apply_newsletter_unsubscribe_requests(
        &self,
        requests: &[(String, String, i64)],
    ) -> Result<u32> {
        let mut unsubscribed = 0u32;
        for (message_id, from_header, received_at) in requests {
            let seen: bool = self.conn.query_row(
                "SELECT EXISTS(SELECT 1 FROM newsletter_unsubscribe_requests WHERE message_id = ?1)",
                params![message_id],
                |row| row.get(0),
            )?;
            if seen {
                continue;
            }
            let Some(sender) = sender_address(from_header) else {
                continue;
            };
            let contacts: Vec<(i64, String)> = self
                .conn
                .prepare(
                    "SELECT id, email FROM contacts
                     WHERE email IS NOT NULL AND trim(email) <> ''",
                )?
                .query_map([], |row| Ok((row.get(0)?, row.get(1)?)))?
                .collect::<Result<Vec<_>>>()?;
            let mut matched: Option<i64> = None;
            for (contact_id, email) in contacts {
                if !email.trim().eq_ignore_ascii_case(&sender) {
                    continue;
                }
                matched.get_or_insert(contact_id);
                if self.mark_newsletter_unsubscribed(
                    contact_id,
                    Some("Email « Désinscription newsletter » reçu"),
                )? {
                    unsubscribed += 1;
                }
            }
            // Expéditeur inconnu : pas mémorisé, réessayé tant que l'email reste dans la fenêtre.
            if matched.is_none() {
                continue;
            }
            self.conn.execute(
                "INSERT OR IGNORE INTO newsletter_unsubscribe_requests
                    (message_id, from_header, contact_id, received_at, processed_at)
                 VALUES (?1, ?2, ?3, ?4, unixepoch())",
                params![message_id, from_header, matched, received_at],
            )?;
        }
        Ok(unsubscribed)
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
            variables: Some(newsletter_template_variables(html_meta)),
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
                        relance_email_sent_at = NULL,
                        relance_email_skipped_at = NULL,
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
        // html_meta : copie du modèle que la préparation vient d'écrire pour cette édition.
        self.conn.execute(
            "INSERT INTO newsletter_editions (
                etiquette_id, template_id, edition_label, subject, plain_body, content_json,
                theme, edition_instructions, audience_filters_json, prepared_at, queued_count, status,
                html_meta
             ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, 'prepared',
                (SELECT variables FROM templates_email WHERE id = ?2))",
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

        self.supersede_older_newsletter_editions(etiquette_id, edition_id)?;

        Ok(edition_id)
    }

    /// Migration html_meta : reprise des éditions existantes (appelée après l'ajout de la colonne).
    pub(crate) fn backfill_newsletter_edition_html_meta(&self) -> Result<()> {
        // Le modèle partagé porte le HTML écrit par la dernière préparation : le recopier sur
        // la dernière édition seulement (l'objet a pu être corrigé ensuite via le push Brevo).
        self.conn.execute(
            "UPDATE newsletter_editions
             SET html_meta = (SELECT t.variables FROM templates_email t
                              WHERE t.id = newsletter_editions.template_id)
             WHERE id IN (SELECT MAX(id) FROM newsletter_editions GROUP BY etiquette_id)",
            [],
        )?;
        // Une seule édition enviable par étiquette (lignes destinataires partagées) : la plus
        // récente toutes éditions confondues ; les plus anciennes encore en attente sont
        // annulées (jamais envoyées) ou remplacées.
        let latest: Vec<(i64, i64)> = self
            .conn
            .prepare("SELECT etiquette_id, MAX(id) FROM newsletter_editions GROUP BY etiquette_id")?
            .query_map([], |row| Ok((row.get(0)?, row.get(1)?)))?
            .collect::<Result<Vec<_>>>()?;
        for (etiquette_id, edition_id) in latest {
            self.supersede_older_newsletter_editions(etiquette_id, edition_id)?;
        }
        Ok(())
    }

    /// Une seule édition enviable par étiquette : les lignes destinataires sont partagées
    /// (une par contact), donc une nouvelle préparation remplace les éditions encore en attente.
    /// Jamais envoyée → « cancelled » ; déjà en partie envoyée → « superseded ».
    pub(crate) fn supersede_older_newsletter_editions(
        &self,
        etiquette_id: i64,
        keep_edition_id: i64,
    ) -> Result<()> {
        self.conn.execute(
            "UPDATE newsletter_editions SET status = 'cancelled'
             WHERE etiquette_id = ?1 AND id <> ?2
               AND status IN ('prepared', 'sending')
               AND sent_count = 0",
            params![etiquette_id, keep_edition_id],
        )?;
        self.conn.execute(
            "UPDATE newsletter_editions SET status = 'superseded'
             WHERE etiquette_id = ?1 AND id <> ?2
               AND (
                 status IN ('prepared', 'partial', 'sending')
                 OR (status = 'completed' AND sent_count < queued_count)
               )",
            params![etiquette_id, keep_edition_id],
        )?;
        Ok(())
    }

    pub fn list_newsletter_editions(&self, limit: u32) -> Result<Vec<NewsletterEditionSummary>> {
        let mut stmt = self.conn.prepare(
            "SELECT id, edition_label, subject, prepared_at, send_completed_at,
                    queued_count, sent_count, error_count, status,
                    brevo_campaign_id, brevo_pushed_at
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
                brevo_campaign_id: row.get(9)?,
                brevo_pushed_at: row.get(10)?,
            })
        })?;
        rows.collect()
    }

    pub fn get_newsletter_edition_detail(&self, edition_id: i64) -> Result<NewsletterEditionDetail> {
        let mut detail = self.conn.query_row(
            "SELECT id, edition_label, subject, plain_body, theme, edition_instructions,
                    prepared_at, send_started_at, send_completed_at,
                    queued_count, sent_count, error_count, status, content_json,
                    brevo_campaign_id, brevo_list_id, brevo_template_id, brevo_pushed_at,
                    html_meta
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
                    content_json: row.get(13)?,
                    brevo_campaign_id: row.get(14)?,
                    brevo_list_id: row.get(15)?,
                    brevo_template_id: row.get(16)?,
                    brevo_pushed_at: row.get(17)?,
                    html_meta: row.get(18)?,
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
                // Destinataire retiré entre-temps (désinscription) : rien à compter.
                let touched = self.conn.execute(
                    "UPDATE newsletter_edition_recipients
                     SET error_message = ?1
                     WHERE edition_id = ?2 AND contact_etiquette_id = ?3",
                    params![err, edition_id, contact_etiquette_id],
                )?;
                if touched > 0 {
                    self.conn.execute(
                        "UPDATE newsletter_editions SET error_count = error_count + 1 WHERE id = ?1",
                        params![edition_id],
                    )?;
                }
            } else {
                let touched = self.conn.execute(
                    "UPDATE newsletter_edition_recipients
                     SET sent_at = ?1, gmail_message_id = ?2, error_message = NULL
                     WHERE edition_id = ?3 AND contact_etiquette_id = ?4",
                    params![sent_at, gmail_message_id, edition_id, contact_etiquette_id],
                )?;
                if touched > 0 {
                    self.conn.execute(
                        "UPDATE newsletter_editions SET sent_count = sent_count + 1 WHERE id = ?1",
                        params![edition_id],
                    )?;
                }
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
        self.sync_newsletter_edition_queued_count(edition_id)?;
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
             WHERE id = ?3 AND status NOT IN ('superseded', 'cancelled')",
            params![status, completed_at, edition_id],
        )?;

        self.conn.query_row(
            "SELECT id, edition_label, subject, prepared_at, send_completed_at,
                    queued_count, sent_count, error_count, status,
                    brevo_campaign_id, brevo_pushed_at
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
                    brevo_campaign_id: row.get(9)?,
                    brevo_pushed_at: row.get(10)?,
                })
            },
        )
    }

    /// Corrections après « Préparer » : l'envoi (et la reprise) part avec cette version.
    /// Le modèle « Newsletter » est aligné pour que l'aperçu étiquette reste cohérent.
    pub fn save_newsletter_edition_content(
        &self,
        edition_id: i64,
        subject: &str,
        plain_body: &str,
        content_json: &str,
        html_meta: &str,
    ) -> Result<()> {
        let subject = subject.trim();
        let plain_body = plain_body.trim();
        if subject.is_empty() || plain_body.is_empty() {
            return Err(rusqlite::Error::InvalidParameterName(
                "Objet et contenu de la newsletter obligatoires".into(),
            ));
        }
        let has_html = serde_json::from_str::<serde_json::Value>(html_meta.trim())
            .ok()
            .and_then(|v| v.get("newsletter_html").and_then(|h| h.as_str()).map(|h| !h.trim().is_empty()))
            .unwrap_or(false);
        if !has_html {
            return Err(rusqlite::Error::InvalidParameterName(
                "Mise en page de la newsletter manquante — rechargez la page puis réessayez".into(),
            ));
        }
        let variables = newsletter_template_variables(html_meta.trim());
        let updated = self.conn.execute(
            "UPDATE newsletter_editions
             SET subject = ?1, plain_body = ?2, content_json = ?3, html_meta = ?4
             WHERE id = ?5
               AND sent_count = 0
               -- « Terminée 0/N » (envoi interrompu à vide) reste reprenable, donc modifiable.
               AND status IN ('prepared', 'partial', 'sending', 'completed')",
            params![subject, plain_body, content_json.trim(), variables, edition_id],
        )?;
        // Déjà partie chez une partie des contacts : la suite garde la même version.
        if updated == 0 {
            return Err(rusqlite::Error::InvalidParameterName(
                "Cette édition n'est plus modifiable (envoi commencé, annulée ou remplacée)".into(),
            ));
        }
        self.conn.execute(
            "UPDATE templates_email
             SET sujet = ?1, corps = ?2, variables = ?3, updated_at = unixepoch()
             WHERE categorie = 'NEWSLETTER'
               AND id = (SELECT template_id FROM newsletter_editions WHERE id = ?4)",
            params![subject, plain_body, variables, edition_id],
        )?;
        Ok(())
    }

    pub fn record_newsletter_brevo_push(
        &self,
        edition_id: i64,
        campaign_id: i64,
        list_id: i64,
        template_id: i64,
        pushed_at: i64,
    ) -> Result<()> {
        let updated = self.conn.execute(
            "UPDATE newsletter_editions
             SET brevo_campaign_id = ?1,
                 brevo_list_id = ?2,
                 brevo_template_id = ?3,
                 brevo_pushed_at = ?4
             WHERE id = ?5",
            params![campaign_id, list_id, template_id, pushed_at, edition_id],
        )?;
        if updated == 0 {
            return Err(rusqlite::Error::QueryReturnedNoRows);
        }
        Ok(())
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
            relance_canal: None,
            relance_canal_at: None,
            relance_canal_message: None,
            relance_email_sent_at: None,
            relance_email_skipped_at: None,
        })
    }

    /// Réactive les lignes file après annulation précédente ou édition bloquée à 0/N.
    /// Nombre préparé = lignes destinataires restantes (un contact supprimé depuis la
    /// préparation disparaît en cascade) : sinon l'édition resterait « à relancer » sans fin.
    fn sync_newsletter_edition_queued_count(&self, edition_id: i64) -> Result<()> {
        self.conn.execute(
            "UPDATE newsletter_editions
             SET queued_count = (SELECT COUNT(*) FROM newsletter_edition_recipients
                                 WHERE edition_id = ?1)
             WHERE id = ?1
               AND (
                 status IN ('prepared', 'partial', 'sending')
                 OR (status = 'completed' AND sent_count < queued_count)
               )",
            params![edition_id],
        )?;
        Ok(())
    }

    fn ensure_newsletter_edition_resumable(&self, edition_id: i64) -> Result<()> {
        self.sync_newsletter_edition_queued_count(edition_id)?;
        // Ligne restée « envoyée » d'une édition précédente (ex. ancienne réparation du suivi
        // qui la remarquait envoyée) : à servir pour cette édition. L'ancien envoi est archivé
        // par le trigger de remplacement.
        self.conn.execute(
            "UPDATE contact_etiquettes
             SET email_envoye = 0, email_date_envoi = NULL,
                 email_gmail_message_id = NULL, email_gmail_thread_id = NULL,
                 email_sent_subject = NULL, email_sent_body = NULL, email_sent_template_nom = NULL,
                 email_reponse_at = NULL, email_reponse_type = NULL, email_reponse_body = NULL,
                 email_reponse_gmail_message_id = NULL,
                 relance_email_sent_at = NULL, relance_email_skipped_at = NULL,
                 email_relance_active = 0
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
             AND email_envoye = 1
             AND (
               email_date_envoi IS NULL
               OR email_date_envoi < (SELECT prepared_at FROM newsletter_editions WHERE id = ?1)
             )",
            params![edition_id],
        )?;
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
        // Contenu de l'édition (dernière version enregistrée), pas le modèle partagé « Newsletter ».
        let sql = "SELECT ce.id, ce.contact_id, c.nom, c.prenom, c.email, c.telephone,
                        e.id, e.nom, e.couleur, ce.email_date_prevue, ce.email_date_envoi,
                        ne.subject, ne.plain_body, NULL,
                        CASE
                          WHEN ne.html_meta IS NOT NULL THEN ne.html_meta
                          -- Édition antérieure à la colonne : le modèle seulement s'il a été écrit
                          -- par sa préparation (dernière édition), jamais le HTML d'une autre.
                          WHEN NOT EXISTS (
                            SELECT 1 FROM newsletter_editions newer
                            WHERE newer.etiquette_id = ne.etiquette_id AND newer.id > ne.id
                          ) THEN t.variables
                          ELSE NULL
                        END,
                        'NEWSLETTER', NULL,
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
                   AND c.newsletter_desinscrit_at IS NULL
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
            categorie: "CLIENT".into(),
            nom: nom.into(),
            prenom: prenom.into(),
            ..Default::default()
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

    #[test]
    fn upsert_newsletter_template_disables_reply_followup() {
        let db = Database::open_in_memory_for_tests().unwrap();
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
        let template_id = db
            .upsert_newsletter_template(
                etiquette.id,
                "Objet",
                "Corps",
                r#"{"newsletter_html":"<p>Hi</p>"}"#,
            )
            .unwrap();
        let tpl = db.get_template_email_by_id(template_id).unwrap();
        let vars: serde_json::Value =
            serde_json::from_str(tpl.variables.as_deref().unwrap()).unwrap();
        assert_eq!(vars["newsletter_html"], "<p>Hi</p>");
        assert_eq!(vars["email_suivi_reponse"]["attendre_reponse"], false);
    }

    fn newsletter_etiquette(db: &Database) -> i64 {
        db.create_etiquette(NewEtiquette {
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
        .unwrap()
        .id
    }

    /// Même enchaînement que la commande `prepare_newsletter_edition`.
    fn prepare_edition(db: &Database, etiquette_id: i64, subject: &str, html: &str, at: i64) -> i64 {
        let meta = serde_json::json!({ "newsletter_html": html }).to_string();
        let template_id = db
            .upsert_newsletter_template(etiquette_id, subject, "Corps", &meta)
            .unwrap();
        db.conn
            .execute(
                "UPDATE etiquettes SET email_template_id = ?1 WHERE id = ?2",
                params![template_id, etiquette_id],
            )
            .unwrap();
        let filters = NewsletterAudienceFilters::default();
        let (_q, _s, queued) = db.queue_newsletter_edition(etiquette_id, at, &filters).unwrap();
        db.create_newsletter_edition(
            etiquette_id,
            template_id,
            subject,
            subject,
            "Corps",
            "{}",
            None,
            None,
            &serde_json::to_string(&filters).unwrap(),
            at,
            &queued,
        )
        .unwrap()
    }

    fn edition_status(db: &Database, edition_id: i64) -> String {
        db.conn
            .query_row(
                "SELECT status FROM newsletter_editions WHERE id = ?1",
                params![edition_id],
                |row| row.get(0),
            )
            .unwrap()
    }

    #[test]
    fn send_queue_uses_edition_content_and_saved_corrections() {
        let db = Database::open_in_memory_for_tests().unwrap();
        let etiquette_id = newsletter_etiquette(&db);
        db.create_contact(NewContact {
            email: Some("alice@example.com".into()),
            ..sample_contact("Dupont", "Alice")
        })
        .unwrap();
        let edition = prepare_edition(&db, etiquette_id, "Juillet", "<p>Juillet</p>", 1_700_000_000);

        // Le modèle partagé est modifié ailleurs : l'édition garde son contenu.
        db.conn
            .execute("UPDATE templates_email SET sujet = 'Autre', variables = '{}'", [])
            .unwrap();
        let item = &db.get_newsletter_send_queue(edition).unwrap()[0];
        assert_eq!(item.template_sujet, "Juillet");
        assert!(item.template_variables.as_deref().unwrap().contains("<p>Juillet</p>"));
        assert_eq!(item.template_categorie.as_deref(), Some("NEWSLETTER"));

        db.save_newsletter_edition_content(
            edition,
            " Juillet corrigé ",
            "Corps corrigé",
            r#"{"subject":"Juillet corrigé"}"#,
            r#"{"newsletter_html":"<p>Corrigé</p>"}"#,
        )
        .unwrap();
        let item = &db.get_newsletter_send_queue(edition).unwrap()[0];
        assert_eq!(item.template_sujet, "Juillet corrigé");
        assert_eq!(item.template_corps, "Corps corrigé");
        let vars: serde_json::Value =
            serde_json::from_str(item.template_variables.as_deref().unwrap()).unwrap();
        assert_eq!(vars["newsletter_html"], "<p>Corrigé</p>");
        assert_eq!(vars["email_suivi_reponse"]["attendre_reponse"], false);

        // Modèle aligné sur la dernière version.
        let sujet: String = db
            .conn
            .query_row("SELECT sujet FROM templates_email WHERE categorie = 'NEWSLETTER'", [], |r| {
                r.get(0)
            })
            .unwrap();
        assert_eq!(sujet, "Juillet corrigé");

        // Le modèle supprimé ne vide plus l'envoi.
        db.conn.execute("DELETE FROM templates_email", []).unwrap();
        let item = &db.get_newsletter_send_queue(edition).unwrap()[0];
        assert_eq!(item.template_sujet, "Juillet corrigé");
        assert!(item.template_variables.as_deref().unwrap().contains("<p>Corrigé</p>"));
    }

    #[test]
    fn save_edition_content_refuses_empty_subject_and_closed_edition() {
        let db = Database::open_in_memory_for_tests().unwrap();
        let etiquette_id = newsletter_etiquette(&db);
        db.create_contact(NewContact {
            email: Some("alice@example.com".into()),
            ..sample_contact("Dupont", "Alice")
        })
        .unwrap();
        let edition = prepare_edition(&db, etiquette_id, "Juillet", "<p>J</p>", 1_700_000_000);
        assert!(db
            .save_newsletter_edition_content(edition, "  ", "Corps", "{}", "{}")
            .is_err());
        // Envoi commencé (édition partielle) : la suite garde la version déjà envoyée.
        db.conn
            .execute(
                "UPDATE newsletter_editions SET status = 'partial', sent_count = 1 WHERE id = ?1",
                params![edition],
            )
            .unwrap();
        assert!(db
            .save_newsletter_edition_content(edition, "Objet", "Corps", "{}", "{}")
            .is_err());
        let subject: String = db
            .conn
            .query_row("SELECT subject FROM newsletter_editions WHERE id = ?1", params![edition], |r| {
                r.get(0)
            })
            .unwrap();
        assert_eq!(subject, "Juillet");
    }

    #[test]
    fn new_preparation_replaces_pending_editions() {
        let db = Database::open_in_memory_for_tests().unwrap();
        let etiquette_id = newsletter_etiquette(&db);
        db.create_contact(NewContact {
            email: Some("alice@example.com".into()),
            ..sample_contact("Dupont", "Alice")
        })
        .unwrap();
        let juin = prepare_edition(&db, etiquette_id, "Juin", "<p>Juin</p>", 1_700_000_000);
        db.conn
            .execute(
                "UPDATE newsletter_editions SET status = 'partial', sent_count = 1, queued_count = 2 WHERE id = ?1",
                params![juin],
            )
            .unwrap();
        let juillet = prepare_edition(&db, etiquette_id, "Juillet", "<p>Juillet</p>", 1_700_000_100);
        assert_eq!(edition_status(&db, juin), "superseded");
        let aout = prepare_edition(&db, etiquette_id, "Août", "<p>Août</p>", 1_700_000_200);
        assert_eq!(edition_status(&db, juillet), "cancelled");
        assert_eq!(edition_status(&db, aout), "prepared");
        assert!(db.get_newsletter_send_queue(juillet).unwrap().is_empty());
        let item = &db.get_newsletter_send_queue(aout).unwrap()[0];
        assert_eq!(item.template_sujet, "Août");
    }

    #[test]
    fn send_queue_skips_contacts_unsubscribed_after_preparation() {
        let db = Database::open_in_memory_for_tests().unwrap();
        let etiquette_id = newsletter_etiquette(&db);
        let alice = db
            .create_contact(NewContact {
                email: Some("alice@example.com".into()),
                ..sample_contact("Dupont", "Alice")
            })
            .unwrap();
        db.create_contact(NewContact {
            email: Some("bob@example.com".into()),
            ..sample_contact("Martin", "Bob")
        })
        .unwrap();
        let edition = prepare_edition(&db, etiquette_id, "Juillet", "<p>J</p>", 1_700_000_000);
        assert_eq!(db.get_newsletter_send_queue(edition).unwrap().len(), 2);
        db.conn
            .execute(
                "UPDATE contacts SET newsletter_desinscrit_at = 1 WHERE id = ?1",
                params![alice.id],
            )
            .unwrap();
        let queue = db.get_newsletter_send_queue(edition).unwrap();
        assert_eq!(queue.len(), 1);
        assert_eq!(queue[0].contact_prenom, "Bob");
    }

    #[test]
    fn unsubscribe_email_applies_once_and_keeps_manual_resubscribe() {
        let db = Database::open_in_memory_for_tests().unwrap();
        let alice = db
            .create_contact(NewContact {
                email: Some("Alice@Example.com".into()),
                ..sample_contact("Dupont", "Alice")
            })
            .unwrap();
        let req = vec![(
            "msg1".to_string(),
            "\"Alice Dupont\" <alice@example.com>".to_string(),
            1_700_000_000i64,
        )];
        assert_eq!(db.apply_newsletter_unsubscribe_requests(&req).unwrap(), 1);
        assert!(db.get_contact_newsletter_unsubscribed_at(alice.id.unwrap()).unwrap().is_some());

        // Réinscription manuelle : le même email n'est pas réappliqué.
        db.set_contact_newsletter_unsubscribed(alice.id.unwrap(), false).unwrap();
        assert_eq!(db.apply_newsletter_unsubscribe_requests(&req).unwrap(), 0);
        assert!(db.get_contact_newsletter_unsubscribed_at(alice.id.unwrap()).unwrap().is_none());

        // Adresse seulement citée dans le nom affiché : pas une demande d'Alice.
        let spoof = vec![(
            "msg3".to_string(),
            "\"alice@example.com\" <autre@example.org>".to_string(),
            1_700_000_000i64,
        )];
        db.set_contact_newsletter_unsubscribed(alice.id.unwrap(), false).unwrap();
        assert_eq!(db.apply_newsletter_unsubscribe_requests(&spoof).unwrap(), 0);

        // Adresse voisine (joalice@) : pas de faux positif.
        let other = vec![(
            "msg2".to_string(),
            "joalice@example.com".to_string(),
            1_700_000_000i64,
        )];
        assert_eq!(db.apply_newsletter_unsubscribe_requests(&other).unwrap(), 0);
        let remembered: i64 = db
            .conn
            .query_row(
                "SELECT COUNT(*) FROM newsletter_unsubscribe_requests WHERE message_id = 'msg2'",
                [],
                |r| r.get(0),
            )
            .unwrap();
        assert_eq!(remembered, 0, "expéditeur inconnu : réessayé au cycle suivant");
    }

    #[test]
    fn contact_checkbox_unsubscribes_and_removes_pending_newsletter() {
        let db = Database::open_in_memory_for_tests().unwrap();
        let etiquette_id = newsletter_etiquette(&db);
        db.conn
            .execute("UPDATE etiquettes SET email_actif = 1 WHERE id = ?1", params![etiquette_id])
            .unwrap();
        let alice = db
            .create_contact(NewContact {
                email: Some("alice@example.com".into()),
                ..sample_contact("Dupont", "Alice")
            })
            .unwrap();
        let edition = prepare_edition(&db, etiquette_id, "Juillet", "<p>J</p>", 1_700_000_000);
        assert_eq!(db.get_newsletter_send_queue(edition).unwrap().len(), 1);
        // Ligne de campagne « Performance Stellium » (catégorie NEWSLETTER, sans HTML d'édition).
        let stellium_tpl = db
            .create_template_email(NewTemplateEmail {
                nom: "Performance AV/PER Stellium".into(),
                sujet: "Perf".into(),
                corps: "Corps".into(),
                categorie: "NEWSLETTER".into(),
                variables: Some(r#"{"corps_html":"<p>x</p>"}"#.into()),
                agenda_link_id: None,
                relance_template_id: None,
                tutoiement_template_id: None,
            })
            .unwrap();
        db.conn
            .execute("UPDATE etiquettes SET nom = 'Newsletter mensuelle' WHERE id = ?1", params![etiquette_id])
            .unwrap();
        let stellium_etiquette = newsletter_etiquette(&db);
        db.conn
            .execute(
                "UPDATE etiquettes SET email_actif = 1, email_template_id = ?1 WHERE id = ?2",
                params![stellium_tpl.id, stellium_etiquette],
            )
            .unwrap();
        db.conn
            .execute(
                "INSERT INTO contact_etiquettes (contact_id, etiquette_id, email_envoye) VALUES (?1, ?2, 0)",
                params![alice.id, stellium_etiquette],
            )
            .unwrap();

        db.set_contact_newsletter_unsubscribed(alice.id.unwrap(), true).unwrap();
        assert!(db.get_newsletter_send_queue(edition).unwrap().is_empty());
        // L'édition ne l'attend plus : elle pourra se terminer (0 restant sur 0).
        let queued: i64 = db
            .conn
            .query_row(
                "SELECT queued_count FROM newsletter_editions WHERE id = ?1",
                params![edition],
                |r| r.get(0),
            )
            .unwrap();
        assert_eq!(queued, 0);
        let stellium_left: i64 = db
            .conn
            .query_row(
                "SELECT COUNT(*) FROM contact_etiquettes WHERE etiquette_id = ?1",
                params![stellium_etiquette],
                |r| r.get(0),
            )
            .unwrap();
        assert_eq!(stellium_left, 1, "la campagne Stellium n'est pas touchée");
        let newsletter_left: i64 = db
            .conn
            .query_row(
                "SELECT COUNT(*) FROM contact_etiquettes WHERE etiquette_id = ?1",
                params![etiquette_id],
                |r| r.get(0),
            )
            .unwrap();
        assert_eq!(newsletter_left, 0, "la ligne newsletter en attente est retirée");
        let note: Option<String> = db
            .conn
            .query_row(
                "SELECT newsletter_desinscrit_note FROM contacts WHERE id = ?1",
                params![alice.id],
                |r| r.get(0),
            )
            .unwrap();
        assert_eq!(note.as_deref(), Some("Fiche contact"));
    }

    #[test]
    fn line_left_sent_by_previous_edition_is_served_and_archived() {
        let db = Database::open_in_memory_for_tests().unwrap();
        let etiquette_id = newsletter_etiquette(&db);
        db.create_contact(NewContact {
            email: Some("alice@example.com".into()),
            ..sample_contact("Dupont", "Alice")
        })
        .unwrap();
        let edition = prepare_edition(&db, etiquette_id, "Août", "<p>A</p>", 1_700_000_000);
        // État constaté en base : ligne remarquée envoyée (juin) après la préparation d'août.
        db.conn
            .execute(
                "UPDATE contact_etiquettes SET email_envoye = 1, email_date_envoi = ?1,
                    email_sent_subject = 'Juin'",
                params![1_690_000_000i64],
            )
            .unwrap();
        let queue = db.get_newsletter_send_queue(edition).unwrap();
        assert_eq!(queue.len(), 1);
        let archived: i64 = db
            .conn
            .query_row(
                "SELECT COUNT(*) FROM email_envoi_archive WHERE sent_subject = 'Juin'",
                [],
                |r| r.get(0),
            )
            .unwrap();
        assert_eq!(archived, 1, "l'envoi de juin reste dans l'historique");

        // Envoi fait après la préparation : jamais remis en file.
        db.conn
            .execute(
                "UPDATE contact_etiquettes SET email_envoye = 1, email_date_envoi = ?1",
                params![1_700_000_500i64],
            )
            .unwrap();
        assert!(db.get_newsletter_send_queue(edition).unwrap().is_empty());
    }

    #[test]
    fn migration_backfill_never_mixes_two_editions() {
        let db = Database::open_in_memory_for_tests().unwrap();
        let etiquette_id = newsletter_etiquette(&db);
        db.create_contact(NewContact {
            email: Some("alice@example.com".into()),
            ..sample_contact("Dupont", "Alice")
        })
        .unwrap();
        let juin = prepare_edition(&db, etiquette_id, "Juin", "<p>Juin</p>", 1_700_000_000);
        let juillet = prepare_edition(&db, etiquette_id, "Juillet", "<p>Juillet</p>", 1_700_000_100);
        // État d'une base d'avant la colonne : pas de HTML par édition, juin encore en attente.
        db.conn
            .execute("UPDATE newsletter_editions SET html_meta = NULL", [])
            .unwrap();
        db.conn
            .execute(
                "UPDATE newsletter_editions SET status = 'partial', sent_count = 1 WHERE id = ?1",
                params![juin],
            )
            .unwrap();

        db.backfill_newsletter_edition_html_meta().unwrap();

        // Juillet (dernière, objet = modèle) récupère son HTML ; juin est remplacée sans HTML.
        let item = &db.get_newsletter_send_queue(juillet).unwrap()[0];
        assert!(item.template_variables.as_deref().unwrap().contains("<p>Juillet</p>"));
        assert_eq!(edition_status(&db, juin), "superseded");
        let juin_html: Option<String> = db
            .conn
            .query_row("SELECT html_meta FROM newsletter_editions WHERE id = ?1", params![juin], |r| {
                r.get(0)
            })
            .unwrap();
        assert!(juin_html.is_none());

        // Ancienne édition sans HTML dont l'objet n'est plus celui du modèle : jamais le HTML
        // d'une autre édition.
        db.conn
            .execute(
                "UPDATE newsletter_editions SET status = 'prepared', sent_count = 0 WHERE id = ?1",
                params![juin],
            )
            .unwrap();
        db.conn
            .execute("UPDATE newsletter_editions SET status = 'cancelled' WHERE id = ?1", params![juillet])
            .unwrap();
        let item = &db.get_newsletter_send_queue(juin).unwrap()[0];
        assert_eq!(item.template_sujet, "Juin");
        assert!(item.template_variables.is_none());
    }

    #[test]
    fn deleted_contact_does_not_leave_edition_to_resume_forever() {
        let db = Database::open_in_memory_for_tests().unwrap();
        let etiquette_id = newsletter_etiquette(&db);
        db.create_contact(NewContact {
            email: Some("alice@example.com".into()),
            ..sample_contact("Dupont", "Alice")
        })
        .unwrap();
        let bob = db
            .create_contact(NewContact {
                email: Some("bob@example.com".into()),
                ..sample_contact("Martin", "Bob")
            })
            .unwrap();
        let edition = prepare_edition(&db, etiquette_id, "Août", "<p>A</p>", 1_700_000_000);
        db.conn
            .execute("DELETE FROM contacts WHERE id = ?1", params![bob.id])
            .unwrap();
        let queue = db.get_newsletter_send_queue(edition).unwrap();
        assert_eq!(queue.len(), 1);
        db.start_newsletter_edition_send(edition, 1_700_000_100).unwrap();
        db.record_newsletter_edition_send(edition, queue[0].contact_etiquette_id, 1_700_000_200, None, None)
            .unwrap();
        let summary = db.finish_newsletter_edition_send(edition, 1_700_000_300, false).unwrap();
        assert_eq!(summary.status, "completed");
        assert_eq!((summary.sent_count, summary.queued_count), (1, 1));
    }

    #[test]
    fn edition_replaced_during_send_stays_replaced_and_unsubscribe_is_not_counted() {
        let db = Database::open_in_memory_for_tests().unwrap();
        let etiquette_id = newsletter_etiquette(&db);
        let alice = db
            .create_contact(NewContact {
                email: Some("alice@example.com".into()),
                ..sample_contact("Dupont", "Alice")
            })
            .unwrap();
        db.create_contact(NewContact {
            email: Some("bob@example.com".into()),
            ..sample_contact("Martin", "Bob")
        })
        .unwrap();
        let juin = prepare_edition(&db, etiquette_id, "Juin", "<p>J</p>", 1_700_000_000);
        let queue = db.get_newsletter_send_queue(juin).unwrap();
        db.start_newsletter_edition_send(juin, 1_700_000_010).unwrap();
        // Alice se désinscrit pendant le lot : son envoi déjà parti n'est pas compté.
        db.set_contact_newsletter_unsubscribed(alice.id.unwrap(), true).unwrap();
        let alice_row = queue.iter().find(|q| q.contact_prenom == "Alice").unwrap();
        db.record_newsletter_edition_send(juin, alice_row.contact_etiquette_id, 1_700_000_020, None, None)
            .unwrap();
        let sent: i64 = db
            .conn
            .query_row("SELECT sent_count FROM newsletter_editions WHERE id = ?1", params![juin], |r| {
                r.get(0)
            })
            .unwrap();
        assert_eq!(sent, 0);

        // Nouvelle préparation pendant le lot : juin reste « annulée » à la fin du lot.
        prepare_edition(&db, etiquette_id, "Juillet", "<p>Jl</p>", 1_700_000_030);
        let summary = db.finish_newsletter_edition_send(juin, 1_700_000_040, false).unwrap();
        assert_eq!(summary.status, "cancelled");
    }

    #[test]
    fn unsubscribe_scan_runs_once_a_day() {
        let db = Database::open_in_memory_for_tests().unwrap();
        let now = 1_700_000_000i64;
        assert!(db.newsletter_unsubscribe_scan_due(now), "jamais faite : due");
        db.mark_newsletter_unsubscribe_scanned(now);
        assert!(!db.newsletter_unsubscribe_scan_due(now + 15 * 60));
        assert!(!db.newsletter_unsubscribe_scan_due(now + 86_399));
        assert!(db.newsletter_unsubscribe_scan_due(now + 86_400));
        // Horloge reculée : on ne reste pas bloqué.
        assert!(db.newsletter_unsubscribe_scan_due(now - 3_600));
    }

    #[test]
    fn managed_newsletter_template_cannot_be_deleted() {
        let db = Database::open_in_memory_for_tests().unwrap();
        let etiquette_id = newsletter_etiquette(&db);
        let managed = db
            .upsert_newsletter_template(etiquette_id, "Objet", "Corps", r#"{"newsletter_html":"<p>x</p>"}"#)
            .unwrap();
        // Orphelin (pas encore relié à l'étiquette) : supprimable.
        let orphan = db
            .upsert_newsletter_template(etiquette_id, "Objet", "Corps", r#"{"newsletter_html":"<p>y</p>"}"#)
            .unwrap();
        db.conn
            .execute(
                "UPDATE etiquettes SET email_template_id = ?1 WHERE id = ?2",
                params![managed, etiquette_id],
            )
            .unwrap();
        assert!(db.delete_template_email(managed).is_err());
        db.delete_template_email(orphan).unwrap();

        // Autre modèle de catégorie NEWSLETTER (ex. Performance Stellium) : supprimable.
        let stellium = db
            .create_template_email(NewTemplateEmail {
                nom: "Performance AV/PER Stellium".into(),
                sujet: "Perf".into(),
                corps: "Corps".into(),
                categorie: "NEWSLETTER".into(),
                variables: Some(r#"{"corps_html":"<p>x</p>"}"#.into()),
                agenda_link_id: None,
                relance_template_id: None,
                tutoiement_template_id: None,
            })
            .unwrap();
        db.delete_template_email(stellium.id).unwrap();
    }
}
