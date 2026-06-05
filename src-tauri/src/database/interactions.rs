use super::Database;
use rusqlite::{params, Result};

impl Database {
    fn parse_interaction_timestamp(date_str: Option<&String>) -> Result<i64> {
        if let Some(s) = date_str {
            if !s.trim().is_empty() {
                if let Ok(dt) = chrono::DateTime::parse_from_rfc3339(s) {
                    return Ok(dt.timestamp());
                }
                if let Ok(dt) = chrono::NaiveDateTime::parse_from_str(s, "%Y-%m-%dT%H:%M:%S%.fZ") {
                    return Ok(dt.and_utc().timestamp());
                }
            }
        }
        Ok(std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_secs() as i64)
    }

    pub fn get_all_interactions_with_contacts(
        &self,
    ) -> Result<Vec<super::models::InteractionWithContact>> {
        let mut stmt = self.conn.prepare(
            "SELECT i.id, i.contact_id, c.nom, c.prenom, i.type_interaction, i.sujet, i.contenu,
                    i.date_interaction, i.created_at
             FROM interactions i
             INNER JOIN contacts c ON c.id = i.contact_id
             ORDER BY i.date_interaction DESC, i.id DESC",
        )?;

        let rows = stmt.query_map([], |row| {
            Ok(super::models::InteractionWithContact {
                id: row.get(0)?,
                contact_id: row.get(1)?,
                contact_nom: row.get(2)?,
                contact_prenom: row.get(3)?,
                type_interaction: row.get(4)?,
                sujet: row.get(5)?,
                contenu: row.get(6)?,
                date_interaction: row.get(7)?,
                created_at: row.get(8)?,
            })
        })?;

        let mut result = Vec::new();
        for row in rows {
            result.push(row?);
        }
        Ok(result)
    }

    pub fn get_interactions_by_contact(
        &self,
        contact_id: i64,
    ) -> Result<Vec<super::models::Interaction>> {
        let mut stmt = self.conn.prepare(
            "SELECT id, contact_id, type_interaction, sujet, contenu, date_interaction, email_id, created_at
             FROM interactions WHERE contact_id = ?1 ORDER BY date_interaction DESC",
        )?;

        let rows = stmt.query_map(params![contact_id], |row| {
            Ok(super::models::Interaction {
                id: row.get(0)?,
                contact_id: row.get(1)?,
                type_interaction: row.get(2)?,
                sujet: row.get(3)?,
                contenu: row.get(4)?,
                date_interaction: row.get(5)?,
                email_id: row.get(6)?,
                created_at: row.get(7)?,
            })
        })?;

        let mut result = Vec::new();
        for row in rows {
            result.push(row?);
        }
        Ok(result)
    }

    /// Alertes non traitées pour un contact (fiche relation).
    pub fn get_alertes_for_contact(&self, contact_id: i64) -> Result<Vec<super::models::Alerte>> {
        let mut stmt = self.conn.prepare(
            "SELECT id, contact_id, type_alerte, message, date_alerte, lue, traitee, created_at
             FROM alertes
             WHERE contact_id = ?1 AND traitee = 0
             ORDER BY date_alerte DESC",
        )?;
        let rows = stmt.query_map(params![contact_id], |row| {
            Ok(super::models::Alerte {
                id: row.get(0)?,
                contact_id: row.get(1)?,
                type_alerte: row.get(2)?,
                message: row.get(3)?,
                date_alerte: row.get(4)?,
                lue: row.get(5)?,
                traitee: row.get(6)?,
                created_at: row.get(7)?,
            })
        })?;
        let mut result = Vec::new();
        for row in rows {
            result.push(row?);
        }
        Ok(result)
    }

    /// Prochaine ligne email pour un contact (même file que Suivi → Envois : étiquettes + modèles).
    pub fn get_next_pending_email_for_contact(
        &self,
        contact_id: i64,
    ) -> Result<Option<super::models::ContactPendingEmail>> {
        for status in ["ready", "followup", "sent", "incomplete", "scheduled"] {
            let queue = self.get_etiquette_email_queue(status)?;
            if let Some(item) = queue.into_iter().find(|q| q.contact_id == contact_id) {
                return Ok(Some(super::models::ContactPendingEmail::from_queue_item(
                    &item, status,
                )));
            }
        }
        Ok(None)
    }

    /// Synthèse relation : alertes ouvertes + prochain email campagne en attente.
    pub fn get_contact_relation_status(
        &self,
        contact_id: i64,
    ) -> Result<super::models::ContactRelationStatus> {
        let open_alertes = self.get_alertes_for_contact(contact_id)?;
        let pending_email = self.get_next_pending_email_for_contact(contact_id)?;

        Ok(super::models::ContactRelationStatus {
            open_alertes,
            pending_email,
        })
    }

    pub fn create_interaction(
        &self,
        interaction: super::models::NewInteraction,
    ) -> Result<super::models::Interaction> {
        let date_ts = Self::parse_interaction_timestamp(interaction.date_interaction.as_ref())?;

        self.conn.execute(
            "INSERT INTO interactions (contact_id, type_interaction, sujet, contenu, date_interaction)
             VALUES (?1, ?2, ?3, ?4, ?5)",
            params![
                interaction.contact_id,
                interaction.type_interaction,
                interaction.sujet,
                interaction.contenu,
                date_ts,
            ],
        )?;

        let id = self.conn.last_insert_rowid();
        self.get_interaction_by_id(id)
    }

    pub fn get_interaction_by_id(&self, id: i64) -> Result<super::models::Interaction> {
        self.conn.query_row(
            "SELECT id, contact_id, type_interaction, sujet, contenu, date_interaction, email_id, created_at
             FROM interactions WHERE id = ?1",
            params![id],
            |row| {
                Ok(super::models::Interaction {
                    id: row.get(0)?,
                    contact_id: row.get(1)?,
                    type_interaction: row.get(2)?,
                    sujet: row.get(3)?,
                    contenu: row.get(4)?,
                    date_interaction: row.get(5)?,
                    email_id: row.get(6)?,
                    created_at: row.get(7)?,
                })
            },
        )
    }

    pub fn update_interaction(
        &self,
        id: i64,
        interaction: super::models::NewInteraction,
    ) -> Result<super::models::Interaction> {
        let date_ts = Self::parse_interaction_timestamp(interaction.date_interaction.as_ref())?;

        self.conn.execute(
            "UPDATE interactions SET contact_id = ?1, type_interaction = ?2, sujet = ?3, contenu = ?4, date_interaction = ?5
             WHERE id = ?6",
            params![
                interaction.contact_id,
                interaction.type_interaction,
                interaction.sujet,
                interaction.contenu,
                date_ts,
                id,
            ],
        )?;

        self.get_interaction_by_id(id)
    }

    pub fn delete_interaction(&self, id: i64) -> Result<()> {
        self.conn
            .execute("DELETE FROM interactions WHERE id = ?1", params![id])?;
        Ok(())
    }

    pub fn contact_gmail_message_exists(
        &self,
        contact_id: i64,
        gmail_message_id: &str,
    ) -> Result<bool> {
        let count: i64 = self.conn.query_row(
            "SELECT COUNT(*) FROM contact_gmail_messages WHERE contact_id = ?1 AND gmail_message_id = ?2",
            params![contact_id, gmail_message_id],
            |r| r.get(0),
        )?;
        Ok(count > 0)
    }

    pub fn insert_contact_gmail_message(
        &self,
        contact_id: i64,
        gmail_message_id: &str,
        gmail_thread_id: Option<&str>,
        direction: &str,
        subject: Option<String>,
        snippet: Option<String>,
        body_text: Option<String>,
        sent_at: i64,
        provider: &str,
        attachments_json: Option<&str>,
    ) -> Result<()> {
        self.conn.execute(
            "INSERT OR IGNORE INTO contact_gmail_messages (
                contact_id, gmail_message_id, gmail_thread_id, direction,
                subject, snippet, body_text, sent_at, provider, attachments_json, body_fetched
            ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, 0)",
            params![
                contact_id,
                gmail_message_id,
                gmail_thread_id,
                direction,
                subject,
                snippet,
                body_text,
                sent_at,
                provider,
                attachments_json,
            ],
        )?;
        Ok(())
    }

    fn map_contact_gmail_message_row(row: &rusqlite::Row<'_>) -> rusqlite::Result<super::models::ContactGmailMessage> {
        let body_fetched: i64 = row.get(10)?;
        Ok(super::models::ContactGmailMessage {
            id: row.get(0)?,
            contact_id: row.get(1)?,
            gmail_message_id: row.get(2)?,
            gmail_thread_id: row.get(3)?,
            direction: row.get(4)?,
            subject: row.get(5)?,
            snippet: row.get(6)?,
            body_text: row.get(7)?,
            sent_at: row.get(8)?,
            synced_at: row.get(9)?,
            body_fetched: body_fetched != 0,
            provider: row.get(11)?,
            attachments_json: row.get(12)?,
        })
    }

    const CONTACT_GMAIL_SELECT: &str = "SELECT id, contact_id, gmail_message_id, gmail_thread_id, direction,
                    subject, snippet, body_text, sent_at, synced_at, body_fetched, provider, attachments_json";

    pub fn get_contact_gmail_message_by_id(
        &self,
        id: i64,
    ) -> Result<super::models::ContactGmailMessage> {
        self.conn.query_row(
            &format!("{} FROM contact_gmail_messages WHERE id = ?1", Self::CONTACT_GMAIL_SELECT),
            params![id],
            Self::map_contact_gmail_message_row,
        )
    }

    pub fn update_contact_gmail_message_body(&self, id: i64, body: &str) -> Result<()> {
        self.conn.execute(
            "UPDATE contact_gmail_messages SET body_text = ?1, body_fetched = 1 WHERE id = ?2",
            params![body, id],
        )?;
        Ok(())
    }

    pub fn update_contact_gmail_message_attachments(
        &self,
        id: i64,
        attachments_json: &str,
    ) -> Result<()> {
        self.conn.execute(
            "UPDATE contact_gmail_messages SET attachments_json = ?1 WHERE id = ?2",
            params![attachments_json, id],
        )?;
        Ok(())
    }

    pub fn contact_gmail_message_row_id(
        &self,
        contact_id: i64,
        gmail_message_id: &str,
    ) -> Result<Option<i64>> {
        let mut stmt = self.conn.prepare(
            "SELECT id FROM contact_gmail_messages WHERE contact_id = ?1 AND gmail_message_id = ?2",
        )?;
        let mut rows = stmt.query_map(params![contact_id, gmail_message_id], |row| {
            row.get::<_, i64>(0)
        })?;
        if let Some(row) = rows.next() {
            Ok(Some(row?))
        } else {
            Ok(None)
        }
    }

    pub fn contact_campaign_gmail_message_ids(&self, contact_id: i64) -> Result<Vec<String>> {
        let mut stmt = self.conn.prepare(
            "SELECT id FROM (
                SELECT email_gmail_message_id AS id FROM contact_etiquettes
                WHERE contact_id = ?1 AND email_gmail_message_id IS NOT NULL
                  AND TRIM(email_gmail_message_id) != ''
                UNION
                SELECT email_reponse_gmail_message_id AS id FROM contact_etiquettes
                WHERE contact_id = ?1 AND email_reponse_gmail_message_id IS NOT NULL
                  AND TRIM(email_reponse_gmail_message_id) != ''
             )",
        )?;
        let rows = stmt.query_map(params![contact_id], |row| row.get::<_, String>(0))?;
        rows.collect::<Result<Vec<_>, _>>().map_err(Into::into)
    }

    pub fn list_contact_gmail_messages(
        &self,
        contact_id: i64,
        exclude_campaign_ids: bool,
    ) -> Result<Vec<super::models::ContactGmailMessage>> {
        let sql = if exclude_campaign_ids {
            format!(
                "{} FROM contact_gmail_messages m
                 WHERE m.contact_id = ?1
                 AND m.gmail_message_id NOT IN (
                    SELECT id FROM (
                        SELECT email_gmail_message_id AS id FROM contact_etiquettes
                        WHERE contact_id = ?1 AND email_gmail_message_id IS NOT NULL
                          AND TRIM(email_gmail_message_id) != ''
                        UNION
                        SELECT email_reponse_gmail_message_id AS id FROM contact_etiquettes
                        WHERE contact_id = ?1 AND email_reponse_gmail_message_id IS NOT NULL
                          AND TRIM(email_reponse_gmail_message_id) != ''
                    )
                 )
                 ORDER BY m.sent_at DESC",
                Self::CONTACT_GMAIL_SELECT
            )
        } else {
            format!(
                "{} FROM contact_gmail_messages
                 WHERE contact_id = ?1 ORDER BY sent_at DESC",
                Self::CONTACT_GMAIL_SELECT
            )
        };
        let mut stmt = self.conn.prepare(&sql)?;
        let rows = stmt.query_map(params![contact_id], Self::map_contact_gmail_message_row)?;
        rows.collect::<Result<Vec<_>, _>>().map_err(Into::into)
    }

    pub fn get_contact_mail_sync_state(
        &self,
        contact_id: i64,
    ) -> Result<Option<super::models::ContactMailSyncState>> {
        let mut stmt = self.conn.prepare(
            "SELECT contact_id, last_sync_at, last_message_sent_at, initial_sync_complete,
                    backfill_complete, list_page_token
             FROM contact_mail_sync_state WHERE contact_id = ?1",
        )?;
        let mut rows = stmt.query(params![contact_id])?;
        if let Some(row) = rows.next()? {
            let initial: i64 = row.get(3)?;
            let backfill: i64 = row.get(4)?;
            return Ok(Some(super::models::ContactMailSyncState {
                contact_id: row.get(0)?,
                last_sync_at: row.get(1)?,
                last_message_sent_at: row.get(2)?,
                initial_sync_complete: initial != 0,
                backfill_complete: backfill != 0,
                list_page_token: row.get(5)?,
            }));
        }
        Ok(None)
    }

    pub fn upsert_contact_mail_sync_state(
        &self,
        contact_id: i64,
        last_message_sent_at: i64,
        initial_sync_complete: bool,
        backfill_complete: bool,
        list_page_token: Option<&str>,
    ) -> Result<()> {
        let now = chrono::Utc::now().timestamp();
        let prev = self.get_contact_mail_sync_state(contact_id)?;
        let merged_sent = prev
            .as_ref()
            .and_then(|s| s.last_message_sent_at)
            .unwrap_or(0)
            .max(last_message_sent_at);
        let merged_initial = prev
            .as_ref()
            .map(|s| s.initial_sync_complete)
            .unwrap_or(false)
            || initial_sync_complete;
        let merged_backfill = prev
            .as_ref()
            .map(|s| s.backfill_complete)
            .unwrap_or(false)
            || backfill_complete;
        // Ne jamais réutiliser un ancien pageToken quand on passe explicitement None (sync terminée).
        let token = list_page_token.map(|s| s.to_string());
        self.conn.execute(
            "INSERT INTO contact_mail_sync_state (
                contact_id, last_sync_at, last_message_sent_at,
                initial_sync_complete, backfill_complete, list_page_token
            ) VALUES (?1, ?2, ?3, ?4, ?5, ?6)
             ON CONFLICT(contact_id) DO UPDATE SET
               last_sync_at = excluded.last_sync_at,
               last_message_sent_at = excluded.last_message_sent_at,
               initial_sync_complete = excluded.initial_sync_complete,
               backfill_complete = excluded.backfill_complete,
               list_page_token = excluded.list_page_token",
            params![
                contact_id,
                now,
                merged_sent,
                if merged_initial { 1 } else { 0 },
                if merged_backfill { 1 } else { 0 },
                token,
            ],
        )?;
        Ok(())
    }
}
