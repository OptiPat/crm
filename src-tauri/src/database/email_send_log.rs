use super::{models::EmailSendLogEntry, Database};
use rusqlite::{params, Result};

impl Database {
    pub fn etiquette_id_for_contact_etiquette(&self, contact_etiquette_id: i64) -> Option<i64> {
        self.conn
            .query_row(
                "SELECT etiquette_id FROM contact_etiquettes WHERE id = ?1",
                params![contact_etiquette_id],
                |row| row.get(0),
            )
            .ok()
    }

    pub fn insert_email_send_log(
        &self,
        contact_id: i64,
        contact_etiquette_id: Option<i64>,
        etiquette_id: Option<i64>,
        etiquette_nom: Option<&str>,
        template_nom: Option<&str>,
        subject: Option<&str>,
        status: &str,
        error_message: Option<&str>,
        gmail_message_id: Option<&str>,
        batch_id: Option<&str>,
        send_mode: &str,
    ) -> Result<i64> {
        let now = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_secs() as i64;
        self.conn.execute(
            "INSERT INTO email_send_log (
                contact_id, contact_etiquette_id, etiquette_id, etiquette_nom,
                template_nom, subject, status, error_message, gmail_message_id,
                batch_id, send_mode, created_at
             ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12)",
            params![
                contact_id,
                contact_etiquette_id,
                etiquette_id,
                etiquette_nom,
                template_nom,
                subject,
                status,
                error_message,
                gmail_message_id,
                batch_id,
                send_mode,
                now,
            ],
        )?;
        Ok(self.conn.last_insert_rowid())
    }

    pub fn get_email_send_log(&self, limit: u32) -> Result<Vec<EmailSendLogEntry>> {
        let lim = limit.clamp(1, 500) as i64;
        let mut stmt = self.conn.prepare(
            "SELECT l.id, l.contact_id, c.prenom, c.nom, l.contact_etiquette_id,
                    l.etiquette_id, l.etiquette_nom, l.template_nom, l.subject,
                    l.status, l.error_message, l.gmail_message_id, l.batch_id,
                    l.send_mode, l.created_at
             FROM email_send_log l
             INNER JOIN contacts c ON c.id = l.contact_id
             ORDER BY l.created_at DESC, l.id DESC
             LIMIT ?1",
        )?;
        let rows = stmt.query_map(params![lim], |row| {
            Ok(EmailSendLogEntry {
                id: row.get(0)?,
                contact_id: row.get(1)?,
                contact_prenom: row.get(2)?,
                contact_nom: row.get(3)?,
                contact_etiquette_id: row.get(4)?,
                etiquette_id: row.get(5)?,
                etiquette_nom: row.get(6)?,
                template_nom: row.get(7)?,
                subject: row.get(8)?,
                status: row.get(9)?,
                error_message: row.get(10)?,
                gmail_message_id: row.get(11)?,
                batch_id: row.get(12)?,
                send_mode: row.get(13)?,
                created_at: row.get(14)?,
            })
        })?;
        rows.collect()
    }
}
