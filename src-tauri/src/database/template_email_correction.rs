//! Correctif d'un envoi déjà parti (ex. mauvais lien) : liste des destinataires d'un modèle
//! pour un jour donné, et trace du correctif sur la fiche (évite tout double envoi).

use super::Database;
use rusqlite::{params, Result};
use serde::Serialize;

#[derive(Debug, Clone, Serialize)]
pub struct TemplateSendDay {
    /// Jour local `AAAA-MM-JJ`.
    pub day: String,
    pub count: i64,
}

#[derive(Debug, Clone, Serialize)]
pub struct TemplateCorrectionTarget {
    pub row_id: i64,
    /// `template` (déclencheur du modèle) ou `etiquette` (campagne d'étiquette).
    pub queue_row_kind: String,
    pub contact_id: i64,
    pub contact_prenom: String,
    pub contact_nom: String,
    pub contact_email: Option<String>,
    pub contact_registre: Option<String>,
    pub sent_subject: Option<String>,
    pub email_date_envoi: i64,
    pub gmail_thread_id: Option<String>,
    pub gmail_message_id: Option<String>,
    /// Correctif déjà envoyé pour cet envoi.
    pub already_corrected: bool,
}

/// Envois d'un modèle (via son déclencheur ou une étiquette qui l'utilise), ligne vivante.
/// `?1` = template_id.
const SENDS_SQL: &str = "
    SELECT cte.id AS row_id, 'template' AS kind, cte.contact_id, cte.email_date_envoi,
           cte.email_sent_subject, cte.email_gmail_thread_id, cte.email_gmail_message_id
    FROM contact_template_envois cte
    WHERE cte.template_id = ?1 AND cte.email_date_envoi IS NOT NULL
    UNION ALL
    SELECT ce.id, 'etiquette', ce.contact_id, ce.email_date_envoi,
           ce.email_sent_subject, ce.email_gmail_thread_id, ce.email_gmail_message_id
    FROM contact_etiquettes ce
    INNER JOIN etiquettes e ON e.id = ce.etiquette_id
    WHERE e.email_template_id = ?1 AND ce.email_date_envoi IS NOT NULL";

fn correction_ref(kind: &str, row_id: i64) -> String {
    format!("Correctif envoyé (réf. {kind}-{row_id})")
}

impl Database {
    /// Jours d'envoi récents d'un modèle (90 derniers jours), du plus récent au plus ancien.
    pub fn list_template_send_days(&self, template_id: i64) -> Result<Vec<TemplateSendDay>> {
        let mut stmt = self.conn.prepare(&format!(
            "SELECT date(s.email_date_envoi, 'unixepoch', 'localtime') AS day, COUNT(*)
             FROM ({SENDS_SQL}) s
             WHERE s.email_date_envoi >= CAST(strftime('%s', 'now', '-90 days') AS INTEGER)
             GROUP BY day ORDER BY day DESC"
        ))?;
        let rows = stmt.query_map(params![template_id], |row| {
            Ok(TemplateSendDay {
                day: row.get(0)?,
                count: row.get(1)?,
            })
        })?;
        rows.collect()
    }

    /// Destinataires d'un modèle pour un jour local donné (`AAAA-MM-JJ`).
    pub fn list_template_correction_targets(
        &self,
        template_id: i64,
        day: &str,
    ) -> Result<Vec<TemplateCorrectionTarget>> {
        let mut stmt = self.conn.prepare(&format!(
            "SELECT s.row_id, s.kind, s.contact_id, c.prenom, c.nom, c.email, c.registre,
                    s.email_sent_subject, s.email_date_envoi, s.email_gmail_thread_id,
                    s.email_gmail_message_id,
                    EXISTS (
                      SELECT 1 FROM interactions i
                      WHERE i.contact_id = s.contact_id
                        AND i.contenu LIKE 'Correctif envoyé (réf. ' || s.kind || '-' || s.row_id || ')%'
                    )
             FROM ({SENDS_SQL}) s
             INNER JOIN contacts c ON c.id = s.contact_id
             WHERE date(s.email_date_envoi, 'unixepoch', 'localtime') = ?2
             ORDER BY c.nom, c.prenom"
        ))?;
        let rows = stmt.query_map(params![template_id, day], |row| {
            Ok(TemplateCorrectionTarget {
                row_id: row.get(0)?,
                queue_row_kind: row.get(1)?,
                contact_id: row.get(2)?,
                contact_prenom: row.get(3)?,
                contact_nom: row.get(4)?,
                contact_email: row.get(5)?,
                contact_registre: row.get(6)?,
                sent_subject: row.get(7)?,
                email_date_envoi: row.get(8)?,
                gmail_thread_id: row.get(9)?,
                gmail_message_id: row.get(10)?,
                already_corrected: row.get(11)?,
            })
        })?;
        rows.collect()
    }

    /// Trace le correctif sur la fiche (Historique des échanges) ; sert aussi d'anti-doublon.
    pub fn record_template_correction_sent(
        &self,
        contact_id: i64,
        queue_row_kind: &str,
        row_id: i64,
        subject: &str,
        body: &str,
    ) -> Result<()> {
        let kind = if queue_row_kind == "etiquette" { "etiquette" } else { "template" };
        let now = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|d| d.as_secs() as i64)
            .unwrap_or(0);
        let contenu = format!("{}\n\n{}", correction_ref(kind, row_id), body.trim());
        self.conn.execute(
            "INSERT INTO interactions (contact_id, type_interaction, sujet, contenu, date_interaction)
             VALUES (?1, 'EMAIL', ?2, ?3, ?4)",
            params![contact_id, subject, contenu, now],
        )?;
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use crate::database::models::{NewContact, NewTemplateEmail};
    use crate::database::Database;
    use rusqlite::params;

    #[test]
    fn targets_of_a_send_day_and_correction_is_recorded_once() {
        let db = Database::open_in_memory_for_tests().unwrap();
        let tpl = db
            .create_template_email(NewTemplateEmail {
                nom: "Réduction".into(),
                sujet: "S".into(),
                corps: "C".into(),
                categorie: "FISCALITE".into(),
                variables: None,
                agenda_link_id: None,
                relance_template_id: None,
                tutoiement_template_id: None,
            })
            .unwrap();
        let cid = db
            .create_contact(NewContact {
                categorie: "CLIENT".into(),
                nom: "Martin".into(),
                prenom: "Léa".into(),
                email: Some("lea@example.com".into()),
                registre: Some("TU".into()),
                ..Default::default()
            })
            .unwrap()
            .id
            .unwrap();
        let sent_at = chrono::Utc::now().timestamp() - 3600;
        db.connection()
            .execute(
                "INSERT INTO contact_template_envois (contact_id, template_id, trigger_event_at,
                    email_envoye, email_date_envoi, email_sent_subject, email_gmail_thread_id,
                    email_gmail_message_id)
                 VALUES (?1, ?2, ?3, 1, ?3, 'Léa, objet', 'thr', 'msg')",
                params![cid, tpl.id, sent_at],
            )
            .unwrap();
        let row_id = db.connection().last_insert_rowid();

        let days = db.list_template_send_days(tpl.id).unwrap();
        assert_eq!(days.len(), 1);
        assert_eq!(days[0].count, 1);
        let targets = db.list_template_correction_targets(tpl.id, &days[0].day).unwrap();
        assert_eq!(targets.len(), 1);
        let t = &targets[0];
        assert_eq!((t.row_id, t.queue_row_kind.as_str()), (row_id, "template"));
        assert_eq!(t.gmail_thread_id.as_deref(), Some("thr"));
        assert!(!t.already_corrected);

        db.record_template_correction_sent(cid, "template", row_id, "Re: Léa, objet", "Bonjour Léa")
            .unwrap();
        let targets = db.list_template_correction_targets(tpl.id, &days[0].day).unwrap();
        assert!(targets[0].already_corrected, "un 2e passage n'enverra pas de doublon");
    }
}
