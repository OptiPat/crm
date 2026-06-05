use super::Database;
use rusqlite::{params, Result};

impl Database {
    fn is_campaign_response_trace(sujet: &str, contenu: &str) -> bool {
        contenu.starts_with("Retour enregistré après envoi") || sujet.contains("— campagne «")
    }

    fn is_campaign_send_trace(contenu: &str) -> bool {
        contenu.starts_with("Campagne «")
            && (contenu.contains("— email envoyé") || contenu.contains("— relance email"))
    }

    fn parse_etiquette_nom_from_send_trace(contenu: &str) -> Option<String> {
        let start = contenu.strip_prefix("Campagne «")?;
        let end = start.find('»')?;
        Some(start[..end].trim().to_string())
    }

    fn campaign_send_already_in_entries(
        entries: &[super::models::ExchangeHistoryEntry],
        contact_id: i64,
        sent_at: i64,
    ) -> bool {
        entries.iter().any(|e| {
            e.entry_kind == "email_campagne"
                && e.contact_id == contact_id
                && e.sent_at == Some(sent_at)
        })
    }

    fn timeline_covers_contact_email(
        entries: &[super::models::ExchangeHistoryEntry],
        contact_id: i64,
        date_interaction: i64,
        interaction_id: i64,
    ) -> bool {
        entries.iter().any(|e| {
            if e.contact_id != contact_id {
                return false;
            }
            if e.interaction_id == Some(interaction_id) {
                return true;
            }
            if e.entry_kind == "email_campagne" {
                if let Some(sent) = e.sent_at {
                    if sent == date_interaction {
                        return true;
                    }
                    if (sent - date_interaction).abs() <= 120 {
                        return true;
                    }
                }
            }
            if e.entry_kind == "manual" && e.sort_date == date_interaction {
                return true;
            }
            false
        })
    }

    fn lookup_campaign_send_meta(
        &self,
        contact_id: i64,
        sent_at: i64,
    ) -> (Option<i64>, Option<String>, Option<i64>, Option<String>) {
        self.conn
            .query_row(
                "SELECT ce.id, COALESCE(e.nom, 'Campagne email'),
                        ce.email_reponse_at, ce.email_reponse_type
                 FROM contact_etiquettes ce
                 LEFT JOIN etiquettes e ON ce.etiquette_id = e.id
                 WHERE ce.contact_id = ?1
                 ORDER BY
                   CASE WHEN ce.email_date_envoi = ?2 THEN 0 ELSE 1 END,
                   COALESCE(ce.email_date_envoi, 0) DESC,
                   ce.id DESC
                 LIMIT 1",
                params![contact_id, sent_at],
                |row| {
                    Ok((
                        Some(row.get(0)?),
                        Some(row.get(1)?),
                        row.get(2)?,
                        row.get(3)?,
                    ))
                },
            )
            .unwrap_or((None, None, None, None))
    }

    fn interaction_duplicates_campaign_send(
        &self,
        contact_id: i64,
        date_interaction: i64,
    ) -> Result<bool> {
        let n: i64 = self.conn.query_row(
            "SELECT COUNT(*) FROM contact_etiquettes
             WHERE contact_id = ?1 AND email_envoye = 1 AND email_date_envoi = ?2",
            params![contact_id, date_interaction],
            |row| row.get(0),
        )?;
        Ok(n > 0)
    }

    fn exchange_history_email_from_row(
        row: &rusqlite::Row<'_>,
        extended: bool,
    ) -> rusqlite::Result<super::models::ExchangeHistoryEntry> {
        let sent_subject: Option<String> = row.get(8)?;
        let sent_body: Option<String> = row.get(9)?;
        let template_sujet = {
            let s: String = row.get(10)?;
            if s.is_empty() {
                None
            } else {
                Some(s)
            }
        };
        let template_corps = {
            let s: String = row.get(11)?;
            if s.is_empty() {
                None
            } else {
                Some(s)
            }
        };
        Ok(super::models::ExchangeHistoryEntry {
            entry_kind: "email_campagne".into(),
            sort_date: 0,
            contact_id: row.get(1)?,
            contact_nom: row.get(2)?,
            contact_prenom: row.get(3)?,
            contact_email: row.get(4)?,
            contact_telephone: row.get(5)?,
            contact_etiquette_id: Some(row.get(0)?),
            etiquette_nom: Some(row.get(6)?),
            sent_at: row.get(7)?,
            sent_subject,
            sent_body,
            sent_template_nom: if extended { row.get(15)? } else { None },
            template_sujet,
            template_corps,
            template_agenda_link_id: row.get(12)?,
            email_gmail_message_id: if extended {
                row.get(16)?
            } else {
                None
            },
            email_gmail_thread_id: if extended {
                row.get(17)?
            } else {
                None
            },
            email_reponse_at: row.get(13)?,
            email_reponse_type: row.get(14)?,
            email_reponse_body: if extended { row.get(18)? } else { None },
            email_reponse_gmail_message_id: if extended {
                row.get(19)?
            } else {
                None
            },
            interaction_id: None,
            type_interaction: Some("EMAIL".into()),
            sujet: None,
            contenu: None,
            created_at: None,
        })
    }

    /// Journal fusionné : échanges manuels + un fil par envoi campagne (envoi + réponse).
    pub fn get_exchange_history_timeline(
        &self,
    ) -> Result<Vec<super::models::ExchangeHistoryEntry>> {
        self.get_exchange_history_timeline_filtered(None)
    }

    /// Même journal, limité à un contact (évite de charger tout le CRM).
    pub fn get_exchange_history_timeline_for_contact(
        &self,
        contact_id: i64,
    ) -> Result<Vec<super::models::ExchangeHistoryEntry>> {
        self.get_exchange_history_timeline_filtered(Some(contact_id))
    }

    fn get_exchange_history_timeline_filtered(
        &self,
        only_contact_id: Option<i64>,
    ) -> Result<Vec<super::models::ExchangeHistoryEntry>> {
        let mut entries: Vec<super::models::ExchangeHistoryEntry> = Vec::new();

        let mut manual_stmt = self.conn.prepare(
            "SELECT i.id, i.contact_id, c.nom, c.prenom, c.email, c.telephone,
                    i.type_interaction, i.sujet, i.contenu, i.date_interaction, i.created_at
             FROM interactions i
             INNER JOIN contacts c ON c.id = i.contact_id
             WHERE (?1 IS NULL OR i.contact_id = ?1)",
        )?;
        let manual_rows = manual_stmt.query_map(params![only_contact_id], |row| {
            let sujet: Option<String> = row.get(7)?;
            let contenu: Option<String> = row.get(8)?;
            Ok((
                row.get::<_, i64>(0)?,
                row.get::<_, i64>(1)?,
                row.get::<_, String>(2)?,
                row.get::<_, String>(3)?,
                row.get::<_, Option<String>>(4)?,
                row.get::<_, Option<String>>(5)?,
                row.get::<_, String>(6)?,
                sujet,
                contenu,
                row.get::<_, i64>(9)?,
                row.get::<_, i64>(10)?,
            ))
        })?;
        for row in manual_rows {
            let (
                id,
                contact_id,
                contact_nom,
                contact_prenom,
                contact_email,
                contact_telephone,
                type_interaction,
                sujet,
                contenu,
                date_interaction,
                created_at,
            ) = row?;
            let sujet_s = sujet.as_deref().unwrap_or("");
            let contenu_s = contenu.as_deref().unwrap_or("");

            if Self::is_campaign_response_trace(sujet_s, contenu_s) {
                continue;
            }

            if Self::is_campaign_send_trace(contenu_s) {
                if Self::campaign_send_already_in_entries(&entries, contact_id, date_interaction) {
                    continue;
                }
                let etiquette_nom =
                    Self::parse_etiquette_nom_from_send_trace(contenu_s).or_else(|| {
                        sujet
                            .as_deref()
                            .and_then(|s| Self::parse_etiquette_nom_from_send_trace(s))
                    });
                let ce_id: Option<i64> = self
                    .conn
                    .query_row(
                        "SELECT id FROM contact_etiquettes
                         WHERE contact_id = ?1 AND email_envoye = 1
                           AND email_date_envoi = ?2
                         ORDER BY id DESC LIMIT 1",
                        params![contact_id, date_interaction],
                        |row| row.get(0),
                    )
                    .ok();
                let (reponse_at, reponse_type): (Option<i64>, Option<String>) = ce_id
                    .map(|id| {
                        self.conn
                            .query_row(
                                "SELECT email_reponse_at, email_reponse_type
                                 FROM contact_etiquettes WHERE id = ?1",
                                params![id],
                                |row| Ok((row.get(0)?, row.get(1)?)),
                            )
                            .unwrap_or((None, None))
                    })
                    .unwrap_or((None, None));
                entries.push(super::models::ExchangeHistoryEntry {
                    entry_kind: "email_campagne".into(),
                    sort_date: date_interaction.max(reponse_at.unwrap_or(0)),
                    contact_id,
                    contact_nom: contact_nom.clone(),
                    contact_prenom: contact_prenom.clone(),
                    contact_email: contact_email.clone(),
                    contact_telephone: contact_telephone.clone(),
                    contact_etiquette_id: ce_id,
                    etiquette_nom,
                    sent_at: Some(date_interaction),
                    sent_subject: sujet.clone(),
                    sent_body: None,
                    sent_template_nom: None,
                    template_sujet: None,
                    template_corps: None,
                    template_agenda_link_id: None,
                    email_gmail_message_id: None,
                    email_gmail_thread_id: None,
                    email_reponse_at: reponse_at,
                    email_reponse_type: reponse_type,
                    email_reponse_body: None,
                    email_reponse_gmail_message_id: None,
                    interaction_id: None,
                    type_interaction: Some("EMAIL".into()),
                    sujet: None,
                    contenu: None,
                    created_at: None,
                });
                continue;
            }

            if self.interaction_duplicates_campaign_send(contact_id, date_interaction)? {
                continue;
            }
            entries.push(super::models::ExchangeHistoryEntry {
                entry_kind: "manual".into(),
                sort_date: date_interaction,
                contact_id,
                contact_nom,
                contact_prenom,
                contact_email,
                contact_telephone,
                contact_etiquette_id: None,
                etiquette_nom: None,
                sent_at: None,
                sent_subject: None,
                sent_body: None,
                sent_template_nom: None,
                template_sujet: None,
                template_corps: None,
                template_agenda_link_id: None,
                email_gmail_message_id: None,
                email_gmail_thread_id: None,
                email_reponse_at: None,
                email_reponse_type: None,
                email_reponse_body: None,
                email_reponse_gmail_message_id: None,
                interaction_id: Some(id),
                type_interaction: Some(type_interaction),
                sujet,
                contenu,
                created_at: Some(created_at),
            });
        }

        let has_sent_cols = self.table_has_column("contact_etiquettes", "email_sent_body")?;
        let email_sql = if has_sent_cols {
            "SELECT ce.id, ce.contact_id, c.nom, c.prenom, c.email, c.telephone,
                    COALESCE(e.nom, 'Campagne email'), ce.email_date_envoi,
                    COALESCE(NULLIF(TRIM(ce.email_sent_subject), ''), NULLIF(TRIM(i.sujet), '')),
                    COALESCE(NULLIF(TRIM(ce.email_sent_body), ''), NULLIF(TRIM(i.contenu), '')),
                    COALESCE(t.sujet, ''), COALESCE(t.corps, ''), t.agenda_link_id,
                    ce.email_reponse_at, ce.email_reponse_type,
                    ce.email_sent_template_nom, ce.email_gmail_message_id, ce.email_gmail_thread_id,
                    ce.email_reponse_body, ce.email_reponse_gmail_message_id
             FROM contact_etiquettes ce
             LEFT JOIN etiquettes e ON ce.etiquette_id = e.id
             INNER JOIN contacts c ON ce.contact_id = c.id
             LEFT JOIN templates_email t ON e.email_template_id = t.id
             LEFT JOIN interactions i ON i.contact_id = ce.contact_id
               AND i.type_interaction = 'EMAIL'
               AND i.date_interaction = ce.email_date_envoi
               AND i.id = (
                 SELECT i2.id FROM interactions i2
                 WHERE i2.contact_id = ce.contact_id
                   AND i2.type_interaction = 'EMAIL'
                   AND i2.date_interaction = ce.email_date_envoi
                   AND COALESCE(i2.contenu, '') NOT LIKE 'Campagne «%» — email envoyé%'
                   AND COALESCE(i2.contenu, '') NOT LIKE 'Campagne «%» — relance email%'
                   AND COALESCE(i2.contenu, '') NOT LIKE 'Retour enregistré%'
                   AND COALESCE(i2.sujet, '') NOT LIKE '%— campagne «%'
                 ORDER BY i2.id DESC
                 LIMIT 1
               )
             WHERE (ce.email_envoye = 1
                OR ce.email_date_envoi IS NOT NULL
                OR NULLIF(TRIM(ce.email_sent_subject), '') IS NOT NULL
                OR NULLIF(TRIM(ce.email_sent_body), '') IS NOT NULL
                OR NULLIF(TRIM(ce.email_sent_template_nom), '') IS NOT NULL)
                AND (?1 IS NULL OR ce.contact_id = ?1)"
        } else {
            "SELECT ce.id, ce.contact_id, c.nom, c.prenom, c.email, c.telephone,
                    COALESCE(e.nom, 'Campagne email'), ce.email_date_envoi,
                    NULLIF(TRIM(i.sujet), ''),
                    NULLIF(TRIM(i.contenu), ''),
                    COALESCE(t.sujet, ''), COALESCE(t.corps, ''), t.agenda_link_id,
                    ce.email_reponse_at, ce.email_reponse_type
             FROM contact_etiquettes ce
             LEFT JOIN etiquettes e ON ce.etiquette_id = e.id
             INNER JOIN contacts c ON ce.contact_id = c.id
             LEFT JOIN templates_email t ON e.email_template_id = t.id
             LEFT JOIN interactions i ON i.contact_id = ce.contact_id
               AND i.type_interaction = 'EMAIL'
               AND i.date_interaction = ce.email_date_envoi
               AND i.id = (
                 SELECT i2.id FROM interactions i2
                 WHERE i2.contact_id = ce.contact_id
                   AND i2.type_interaction = 'EMAIL'
                   AND i2.date_interaction = ce.email_date_envoi
                   AND COALESCE(i2.contenu, '') NOT LIKE 'Campagne «%» — email envoyé%'
                   AND COALESCE(i2.contenu, '') NOT LIKE 'Campagne «%» — relance email%'
                   AND COALESCE(i2.contenu, '') NOT LIKE 'Retour enregistré%'
                   AND COALESCE(i2.sujet, '') NOT LIKE '%— campagne «%'
                 ORDER BY i2.id DESC
                 LIMIT 1
               )
             WHERE (ce.email_envoye = 1
                OR ce.email_date_envoi IS NOT NULL)
                AND (?1 IS NULL OR ce.contact_id = ?1)"
        };
        let mut email_stmt = self.conn.prepare(email_sql)?;
        let email_rows = email_stmt.query_map(params![only_contact_id], |row| {
            Self::exchange_history_email_from_row(row, has_sent_cols)
        })?;
        for row in email_rows {
            let mut entry = row?;
            let sent = entry.sent_at.unwrap_or(0);
            if sent > 0
                && Self::campaign_send_already_in_entries(&entries, entry.contact_id, sent)
            {
                if let Some(existing) = entries.iter_mut().find(|e| {
                    e.entry_kind == "email_campagne"
                        && e.contact_id == entry.contact_id
                        && e.sent_at == Some(sent)
                }) {
                    if existing.sent_subject.is_none() {
                        existing.sent_subject = entry.sent_subject.clone();
                    }
                    if existing.sent_body.is_none() {
                        existing.sent_body = entry.sent_body.clone();
                    }
                    if existing.contact_etiquette_id.is_none() {
                        existing.contact_etiquette_id = entry.contact_etiquette_id;
                    }
                    if existing.template_sujet.is_none() {
                        existing.template_sujet = entry.template_sujet.clone();
                    }
                    if existing.template_corps.is_none() {
                        existing.template_corps = entry.template_corps.clone();
                    }
                    if existing.email_reponse_at.is_none() {
                        existing.email_reponse_at = entry.email_reponse_at;
                    }
                    if existing.email_reponse_type.is_none() {
                        existing.email_reponse_type = entry.email_reponse_type.clone();
                    }
                    if existing.sent_template_nom.is_none() {
                        existing.sent_template_nom = entry.sent_template_nom.clone();
                    }
                    if existing.email_reponse_body.is_none() {
                        existing.email_reponse_body = entry.email_reponse_body.clone();
                    }
                    if existing.email_gmail_thread_id.is_none() {
                        existing.email_gmail_thread_id = entry.email_gmail_thread_id.clone();
                    }
                    if existing.email_gmail_message_id.is_none() {
                        existing.email_gmail_message_id = entry.email_gmail_message_id.clone();
                    }
                    if existing.email_reponse_gmail_message_id.is_none() {
                        existing.email_reponse_gmail_message_id =
                            entry.email_reponse_gmail_message_id.clone();
                    }
                }
                continue;
            }
            let reponse = entry.email_reponse_at.unwrap_or(0);
            entry.sort_date = sent.max(reponse);
            if entry.sort_date == 0 {
                entry.sort_date = sent;
            }
            entries.push(entry);
        }

        let mut orphan_stmt = self.conn.prepare(
            "SELECT i.id, i.contact_id, c.nom, c.prenom, c.email, c.telephone,
                    i.type_interaction, i.sujet, i.contenu, i.date_interaction, i.created_at
             FROM interactions i
             INNER JOIN contacts c ON c.id = i.contact_id
             WHERE i.type_interaction = 'EMAIL'
               AND (?1 IS NULL OR i.contact_id = ?1)",
        )?;
        let orphan_rows = orphan_stmt.query_map(params![only_contact_id], |row| {
            Ok((
                row.get::<_, i64>(0)?,
                row.get::<_, i64>(1)?,
                row.get::<_, String>(2)?,
                row.get::<_, String>(3)?,
                row.get::<_, Option<String>>(4)?,
                row.get::<_, Option<String>>(5)?,
                row.get::<_, Option<String>>(7)?,
                row.get::<_, Option<String>>(8)?,
                row.get::<_, i64>(9)?,
            ))
        })?;
        for row in orphan_rows {
            let (
                id,
                contact_id,
                contact_nom,
                contact_prenom,
                contact_email,
                contact_telephone,
                sujet,
                contenu,
                date_interaction,
            ) = row?;
            let sujet_s = sujet.as_deref().unwrap_or("");
            let contenu_s = contenu.as_deref().unwrap_or("");
            if Self::is_campaign_response_trace(sujet_s, contenu_s) {
                continue;
            }
            if Self::timeline_covers_contact_email(&entries, contact_id, date_interaction, id) {
                continue;
            }
            let is_send_trace = Self::is_campaign_send_trace(contenu_s);
            let has_real_body =
                !is_send_trace && contenu_s.trim().len() > 40 && !contenu_s.starts_with("Campagne «");
            let (ce_id, etiquette_nom, reponse_at, reponse_type) =
                self.lookup_campaign_send_meta(contact_id, date_interaction);
            let etiquette_nom = etiquette_nom.or_else(|| {
                if is_send_trace {
                    Self::parse_etiquette_nom_from_send_trace(contenu_s)
                } else {
                    None
                }
            });
            entries.push(super::models::ExchangeHistoryEntry {
                entry_kind: "email_campagne".into(),
                sort_date: date_interaction.max(reponse_at.unwrap_or(0)),
                contact_id,
                contact_nom,
                contact_prenom,
                contact_email,
                contact_telephone,
                contact_etiquette_id: ce_id,
                etiquette_nom,
                sent_at: Some(date_interaction),
                sent_subject: sujet.clone(),
                sent_body: if has_real_body {
                    contenu.clone()
                } else {
                    None
                },
                sent_template_nom: None,
                template_sujet: None,
                template_corps: None,
                template_agenda_link_id: None,
                email_gmail_message_id: None,
                email_gmail_thread_id: None,
                email_reponse_at: reponse_at,
                email_reponse_type: reponse_type,
                email_reponse_body: None,
                email_reponse_gmail_message_id: None,
                interaction_id: Some(id),
                type_interaction: Some("EMAIL".into()),
                sujet: None,
                contenu: None,
                created_at: None,
            });
        }

        if entries.is_empty() && only_contact_id.is_none() {
            for row in self.get_all_interactions_with_contacts()? {
                entries.push(super::models::ExchangeHistoryEntry {
                    entry_kind: "manual".into(),
                    sort_date: row.date_interaction,
                    contact_id: row.contact_id,
                    contact_nom: row.contact_nom,
                    contact_prenom: row.contact_prenom,
                    contact_email: None,
                    contact_telephone: None,
                    contact_etiquette_id: None,
                    etiquette_nom: None,
                    sent_at: None,
                    sent_subject: None,
                    sent_body: None,
                    sent_template_nom: None,
                    template_sujet: None,
                    template_corps: None,
                    template_agenda_link_id: None,
                    email_gmail_message_id: None,
                    email_gmail_thread_id: None,
                    email_reponse_at: None,
                    email_reponse_type: None,
                    email_reponse_body: None,
                    email_reponse_gmail_message_id: None,
                    interaction_id: Some(row.id),
                    type_interaction: Some(row.type_interaction),
                    sujet: row.sujet,
                    contenu: row.contenu,
                    created_at: Some(row.created_at),
                });
            }
        }

        entries.sort_by(|a, b| {
            b.sort_date
                .cmp(&a.sort_date)
                .then_with(|| {
                    b.contact_etiquette_id
                        .unwrap_or(0)
                        .cmp(&a.contact_etiquette_id.unwrap_or(0))
                })
                .then_with(|| {
                    b.interaction_id
                        .unwrap_or(0)
                        .cmp(&a.interaction_id.unwrap_or(0))
                })
        });
        Ok(entries)
    }
}
