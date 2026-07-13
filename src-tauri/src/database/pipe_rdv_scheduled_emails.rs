//! Rappels email planifiés avant un RDV Pipe (file locale SQLite).

use std::collections::HashSet;

use rusqlite::{params, Result};

use super::models::PipeRdvReminderSchedule;
use super::pipe_timeline::TIMELINE_RDV;

impl super::Database {
    fn validate_pipe_rdv_reminder_schedules(
        &self,
        pipe_timeline_entry_id: i64,
        rows: &[PipeRdvReminderSchedule],
    ) -> Result<()> {
        let entry = self.get_pipe_timeline_entry(pipe_timeline_entry_id)?;
        if entry.entry_type != TIMELINE_RDV {
            return Err(rusqlite::Error::InvalidParameterName(
                "Entrée timeline invalide pour un rappel RDV Pipe".into(),
            ));
        }
        let pipe = self.get_pipe_by_id(entry.pipe_id)?;
        let mut allowed_contacts = HashSet::new();
        allowed_contacts.insert(pipe.contact_id);
        if let Some(sec) = pipe.secondary_contact_id.filter(|id| *id > 0) {
            allowed_contacts.insert(sec);
        }

        if rows.is_empty() {
            return Ok(());
        }

        for row in rows {
            if row.pipe_timeline_entry_id != pipe_timeline_entry_id {
                return Err(rusqlite::Error::InvalidParameterName(
                    "Identifiant timeline incohérent pour le rappel RDV Pipe".into(),
                ));
            }
            if row.pipe_id != entry.pipe_id {
                return Err(rusqlite::Error::InvalidParameterName(
                    "Affaire Pipe incohérente pour le rappel RDV Pipe".into(),
                ));
            }
            if row.template_id <= 0 {
                return Err(rusqlite::Error::InvalidParameterName(
                    "Modèle email invalide pour le rappel RDV Pipe".into(),
                ));
            }
            if !allowed_contacts.contains(&row.contact_id) {
                return Err(rusqlite::Error::InvalidParameterName(
                    "Contact non participant au RDV Pipe".into(),
                ));
            }
            if row.rdv_at <= 0 || row.rdv_end_at < row.rdv_at {
                return Err(rusqlite::Error::InvalidParameterName(
                    "Horodatage RDV invalide pour le rappel Pipe".into(),
                ));
            }
            if row.send_at <= 0 {
                return Err(rusqlite::Error::InvalidParameterName(
                    "Date d'envoi du rappel RDV Pipe invalide".into(),
                ));
            }
            self.get_template_email_by_id(row.template_id)?;
        }
        Ok(())
    }

    pub fn migrate_pipe_rdv_scheduled_emails_table(&self) -> Result<()> {
        self.conn.execute(
            "CREATE TABLE IF NOT EXISTS pipe_rdv_scheduled_emails (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                pipe_timeline_entry_id INTEGER NOT NULL,
                pipe_id INTEGER NOT NULL,
                contact_id INTEGER NOT NULL,
                template_id INTEGER NOT NULL,
                send_at INTEGER NOT NULL,
                rdv_at INTEGER NOT NULL,
                rdv_end_at INTEGER NOT NULL,
                visio_link TEXT,
                event_location TEXT,
                sent_at INTEGER,
                cancelled_at INTEGER,
                created_at INTEGER NOT NULL DEFAULT (strftime('%s','now')),
                UNIQUE(pipe_timeline_entry_id, contact_id)
            )",
            [],
        )?;
        self.conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_pipe_rdv_sched_send
             ON pipe_rdv_scheduled_emails(send_at)
             WHERE sent_at IS NULL AND cancelled_at IS NULL",
            [],
        )?;
        Ok(())
    }

    pub fn replace_pipe_rdv_reminder_schedules(
        &self,
        pipe_timeline_entry_id: i64,
        rows: &[PipeRdvReminderSchedule],
    ) -> Result<()> {
        self.validate_pipe_rdv_reminder_schedules(pipe_timeline_entry_id, rows)?;
        let tx = self.conn.unchecked_transaction()?;
        tx.execute(
            "UPDATE pipe_rdv_scheduled_emails
             SET cancelled_at = strftime('%s','now')
             WHERE pipe_timeline_entry_id = ?1 AND sent_at IS NULL AND cancelled_at IS NULL",
            params![pipe_timeline_entry_id],
        )?;
        for row in rows {
            tx.execute(
                "INSERT INTO pipe_rdv_scheduled_emails (
                    pipe_timeline_entry_id, pipe_id, contact_id, template_id,
                    send_at, rdv_at, rdv_end_at, visio_link, event_location
                ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)
                ON CONFLICT(pipe_timeline_entry_id, contact_id) DO UPDATE SET
                    pipe_id = excluded.pipe_id,
                    template_id = excluded.template_id,
                    send_at = excluded.send_at,
                    rdv_at = excluded.rdv_at,
                    rdv_end_at = excluded.rdv_end_at,
                    visio_link = excluded.visio_link,
                    event_location = excluded.event_location,
                    sent_at = NULL,
                    cancelled_at = NULL,
                    created_at = strftime('%s','now')
                WHERE sent_at IS NULL OR rdv_at != excluded.rdv_at",
                params![
                    row.pipe_timeline_entry_id,
                    row.pipe_id,
                    row.contact_id,
                    row.template_id,
                    row.send_at,
                    row.rdv_at,
                    row.rdv_end_at,
                    row.visio_link,
                    row.event_location,
                ],
            )?;
        }
        tx.commit()?;
        Ok(())
    }

    pub fn cancel_pipe_rdv_reminder_schedules(&self, pipe_timeline_entry_id: i64) -> Result<u32> {
        Ok(self.conn.execute(
            "UPDATE pipe_rdv_scheduled_emails
             SET cancelled_at = strftime('%s','now')
             WHERE pipe_timeline_entry_id = ?1 AND sent_at IS NULL AND cancelled_at IS NULL",
            params![pipe_timeline_entry_id],
        )? as u32)
    }

    pub fn cancel_pipe_rdv_reminders_for_pipe(&self, pipe_id: i64) -> Result<()> {
        self.conn.execute(
            "UPDATE pipe_rdv_scheduled_emails
             SET cancelled_at = strftime('%s','now')
             WHERE pipe_id = ?1 AND sent_at IS NULL AND cancelled_at IS NULL",
            params![pipe_id],
        )?;
        Ok(())
    }

    pub fn list_due_pipe_rdv_reminder_schedules(
        &self,
        now: i64,
        limit: u32,
    ) -> Result<Vec<PipeRdvReminderSchedule>> {
        self.conn.execute(
            "UPDATE pipe_rdv_scheduled_emails
             SET cancelled_at = strftime('%s','now')
             WHERE sent_at IS NULL AND cancelled_at IS NULL AND rdv_at <= ?1",
            params![now],
        )?;
        let sql = "SELECT id, pipe_timeline_entry_id, pipe_id, contact_id, template_id,
                          send_at, rdv_at, rdv_end_at, visio_link, event_location
                   FROM pipe_rdv_scheduled_emails
                   WHERE sent_at IS NULL AND cancelled_at IS NULL
                     AND send_at <= ?1 AND rdv_at > ?1
                   ORDER BY send_at ASC
                   LIMIT ?2";
        let mut stmt = self.conn.prepare(sql)?;
        let rows = stmt.query_map(params![now, limit], |row| {
            Ok(PipeRdvReminderSchedule {
                id: row.get(0)?,
                pipe_timeline_entry_id: row.get(1)?,
                pipe_id: row.get(2)?,
                contact_id: row.get(3)?,
                template_id: row.get(4)?,
                send_at: row.get(5)?,
                rdv_at: row.get(6)?,
                rdv_end_at: row.get(7)?,
                visio_link: row.get(8)?,
                event_location: row.get(9)?,
            })
        })?;
        rows.collect()
    }

    pub fn mark_pipe_rdv_reminder_schedule_sent(&self, id: i64) -> Result<bool> {
        let n = self.conn.execute(
            "UPDATE pipe_rdv_scheduled_emails SET sent_at = strftime('%s','now')
             WHERE id = ?1 AND sent_at IS NULL AND cancelled_at IS NULL",
            params![id],
        )?;
        Ok(n > 0)
    }
}

#[cfg(test)]
mod tests {
    use super::super::Database;
    use super::super::models::{NewContact, NewPipe, NewPipeTimelineEntry, NewTemplateEmail};
    use super::super::pipe::PIPE_TYPE_AFFAIRE;
    use super::super::pipe_timeline::TIMELINE_RDV;

    fn seed_pipe_rdv_reminder_fixture(db: &Database) -> (i64, i64, i64, i64) {
        let contact_id = db
            .create_contact(NewContact {
                nom: "DUPONT".into(),
                prenom: "Jean".into(),
                categorie: "PROSPECT_CLIENT".into(),
                ..Default::default()
            })
            .unwrap()
            .id
            .unwrap();
        let pipe = db
            .create_pipe(NewPipe {
                contact_id,
                secondary_contact_id: None,
                pipe_type: PIPE_TYPE_AFFAIRE.into(),
                parent_pipe_id: None,
                titre: "Affaire test".into(),
                stage: Some("R1".into()),
                notes: None,
            })
            .unwrap();
        let rdv = db
            .create_pipe_timeline_entry(NewPipeTimelineEntry {
                pipe_id: pipe.id,
                entry_type: TIMELINE_RDV.into(),
                titre: Some("R1".into()),
                contenu: None,
                occurred_at: Some(1_700_086_400),
            })
            .unwrap();
        let template = db
            .create_template_email(NewTemplateEmail {
                nom: "RDV R1".into(),
                sujet: "Sujet".into(),
                corps: "Corps".into(),
                categorie: "AUTRE".into(),
                variables: None,
                agenda_link_id: None,
                relance_template_id: None,
                tutoiement_template_id: None,
            })
            .unwrap();
        (pipe.id, rdv.id, contact_id, template.id)
    }

    #[test]
    fn pipe_rdv_reminder_schedule_roundtrip() {
        let db = Database::open_in_memory_for_tests().expect("mem db");
        db.migrate_pipe_rdv_scheduled_emails_table()
            .expect("migrate");
        let (pipe_id, timeline_id, contact_id, template_id) =
            seed_pipe_rdv_reminder_fixture(&db);
        let row = super::super::models::PipeRdvReminderSchedule {
            id: 0,
            pipe_timeline_entry_id: timeline_id,
            pipe_id,
            contact_id,
            template_id,
            send_at: 1_700_000_000,
            rdv_at: 1_700_086_400,
            rdv_end_at: 1_700_090_000,
            visio_link: Some("https://meet.google.com/abc".into()),
            event_location: None,
        };
        db.replace_pipe_rdv_reminder_schedules(timeline_id, &[row])
            .expect("insert");
        let due = db
            .list_due_pipe_rdv_reminder_schedules(1_700_000_001, 10)
            .expect("list");
        assert_eq!(due.len(), 1);
        assert_eq!(due[0].contact_id, contact_id);
        db.mark_pipe_rdv_reminder_schedule_sent(due[0].id)
            .expect("sent");
        assert!(!db
            .mark_pipe_rdv_reminder_schedule_sent(due[0].id)
            .expect("idempotent"));
        let empty = db
            .list_due_pipe_rdv_reminder_schedules(1_700_000_001, 10)
            .expect("list2");
        assert!(empty.is_empty());
    }

    #[test]
    fn pipe_rdv_reminder_skips_past_rdv() {
        let db = Database::open_in_memory_for_tests().expect("mem db");
        db.migrate_pipe_rdv_scheduled_emails_table()
            .expect("migrate");
        let (pipe_id, timeline_id, contact_id, template_id) =
            seed_pipe_rdv_reminder_fixture(&db);
        let row = super::super::models::PipeRdvReminderSchedule {
            id: 0,
            pipe_timeline_entry_id: timeline_id,
            pipe_id,
            contact_id,
            template_id,
            send_at: 1_600_000_000,
            rdv_at: 1_600_086_400,
            rdv_end_at: 1_600_090_000,
            visio_link: None,
            event_location: None,
        };
        db.replace_pipe_rdv_reminder_schedules(timeline_id, &[row])
            .expect("insert");
        let due = db
            .list_due_pipe_rdv_reminder_schedules(1_700_000_000, 10)
            .expect("list");
        assert!(due.is_empty());
    }

    #[test]
    fn pipe_rdv_reminder_schedule_replaces_after_cancel() {
        let db = Database::open_in_memory_for_tests().expect("mem db");
        db.migrate_pipe_rdv_scheduled_emails_table()
            .expect("migrate");
        let (pipe_id, timeline_id, contact_id, template_id) =
            seed_pipe_rdv_reminder_fixture(&db);
        let row = |send_at: i64| super::super::models::PipeRdvReminderSchedule {
            id: 0,
            pipe_timeline_entry_id: timeline_id,
            pipe_id,
            contact_id,
            template_id,
            send_at,
            rdv_at: 1_700_086_400,
            rdv_end_at: 1_700_090_000,
            visio_link: None,
            event_location: None,
        };
        db.replace_pipe_rdv_reminder_schedules(timeline_id, &[row(1_700_000_000)])
            .expect("first insert");
        db.replace_pipe_rdv_reminder_schedules(timeline_id, &[row(1_700_010_000)])
            .expect("replace after cancel");
        let due = db
            .list_due_pipe_rdv_reminder_schedules(1_700_010_000, 10)
            .expect("list");
        assert_eq!(due.len(), 1);
        assert_eq!(due[0].send_at, 1_700_010_000);
    }

    #[test]
    fn pipe_rdv_reminder_replans_after_sent_when_rdv_moves() {
        let db = Database::open_in_memory_for_tests().expect("mem db");
        db.migrate_pipe_rdv_scheduled_emails_table()
            .expect("migrate");
        let (pipe_id, timeline_id, contact_id, template_id) =
            seed_pipe_rdv_reminder_fixture(&db);
        let row = super::super::models::PipeRdvReminderSchedule {
            id: 0,
            pipe_timeline_entry_id: timeline_id,
            pipe_id,
            contact_id,
            template_id,
            send_at: 1_700_000_000,
            rdv_at: 1_700_086_400,
            rdv_end_at: 1_700_090_000,
            visio_link: None,
            event_location: None,
        };
        db.replace_pipe_rdv_reminder_schedules(timeline_id, &[row])
            .expect("insert");
        db.mark_pipe_rdv_reminder_schedule_sent(1).expect("sent");

        let moved = super::super::models::PipeRdvReminderSchedule {
            id: 0,
            pipe_timeline_entry_id: timeline_id,
            pipe_id,
            contact_id,
            template_id,
            send_at: 1_710_000_000,
            rdv_at: 1_710_086_400,
            rdv_end_at: 1_710_090_000,
            visio_link: None,
            event_location: None,
        };
        db.replace_pipe_rdv_reminder_schedules(timeline_id, &[moved])
            .expect("reschedule after sent");

        let due = db
            .list_due_pipe_rdv_reminder_schedules(1_710_000_000, 10)
            .expect("list");
        assert_eq!(due.len(), 1);
        assert_eq!(due[0].rdv_at, 1_710_086_400);
    }

    #[test]
    fn delete_pipe_cancels_pending_rdv_reminders() {
        let db = Database::open_in_memory_for_tests().expect("mem db");
        db.migrate_pipe_rdv_scheduled_emails_table()
            .expect("migrate");
        let (pipe_id, timeline_id, contact_id, template_id) =
            seed_pipe_rdv_reminder_fixture(&db);
        let row = super::super::models::PipeRdvReminderSchedule {
            id: 0,
            pipe_timeline_entry_id: timeline_id,
            pipe_id,
            contact_id,
            template_id,
            send_at: 1_700_000_000,
            rdv_at: 1_700_086_400,
            rdv_end_at: 1_700_090_000,
            visio_link: None,
            event_location: None,
        };
        db.replace_pipe_rdv_reminder_schedules(timeline_id, &[row])
            .expect("insert");
        db.delete_pipe(pipe_id).expect("delete pipe");
        let due = db
            .list_due_pipe_rdv_reminder_schedules(1_700_100_000, 10)
            .expect("list");
        assert!(due.is_empty());
    }

    #[test]
    fn pipe_rdv_reminder_schedule_rejects_foreign_contact() {
        let db = Database::open_in_memory_for_tests().expect("mem db");
        db.migrate_pipe_rdv_scheduled_emails_table()
            .expect("migrate");
        let (pipe_id, timeline_id, _contact_id, template_id) =
            seed_pipe_rdv_reminder_fixture(&db);
        let row = super::super::models::PipeRdvReminderSchedule {
            id: 0,
            pipe_timeline_entry_id: timeline_id,
            pipe_id,
            contact_id: 999,
            template_id,
            send_at: 1_700_000_000,
            rdv_at: 1_700_086_400,
            rdv_end_at: 1_700_090_000,
            visio_link: None,
            event_location: None,
        };
        let err = db
            .replace_pipe_rdv_reminder_schedules(timeline_id, &[row])
            .unwrap_err();
        assert!(err.to_string().contains("participant"));
    }
}
