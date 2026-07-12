use super::{models::CalendarEventEntry, Database};
use rusqlite::{params, OptionalExtension, Result};

impl Database {
    pub fn get_contact_calendar_info(
        &self,
        contact_id: i64,
    ) -> Result<(String, String, Option<String>)> {
        self.conn.query_row(
            "SELECT prenom, nom, email FROM contacts WHERE id = ?1",
            params![contact_id],
            |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)),
        )
    }

    /// Emails uniques (@…) pour inviter plusieurs contacts à un RDV Google.
    /// Ignore les contacts supprimés ou sans email (ne fait pas échouer toute la création).
    pub fn collect_calendar_attendee_emails(
        &self,
        contact_ids: &[i64],
    ) -> Result<Vec<String>> {
        let mut out = Vec::new();
        let mut seen = std::collections::HashSet::new();
        for &contact_id in contact_ids {
            if contact_id <= 0 {
                continue;
            }
            let email: Option<String> = self
                .conn
                .query_row(
                    "SELECT email FROM contacts WHERE id = ?1",
                    params![contact_id],
                    |row| row.get(0),
                )
                .optional()?
                .flatten();
            if let Some(raw) = email.as_deref().map(str::trim).filter(|e| e.contains('@')) {
                let key = raw.to_lowercase();
                if seen.insert(key) {
                    out.push(raw.to_string());
                }
            }
        }
        Ok(out)
    }

    pub fn insert_calendar_event(
        &self,
        contact_id: i64,
        alerte_id: Option<i64>,
        tache_id: Option<i64>,
        pipe_timeline_entry_id: Option<i64>,
        google_event_id: &str,
        title: &str,
        start_at: i64,
        end_at: i64,
        attendee_email: Option<&str>,
    ) -> Result<i64> {
        let now = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_secs() as i64;
        self.conn.execute(
            "INSERT INTO calendar_events (
                contact_id, alerte_id, tache_id, pipe_timeline_entry_id, google_event_id, title,
                start_at, end_at, attendee_email, created_at, updated_at
             ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11)",
            params![
                contact_id,
                alerte_id,
                tache_id,
                pipe_timeline_entry_id,
                google_event_id,
                title,
                start_at,
                end_at,
                attendee_email,
                now,
                now,
            ],
        )?;
        Ok(self.conn.last_insert_rowid())
    }

    pub fn update_calendar_event_times(
        &self,
        google_event_id: &str,
        title: &str,
        start_at: i64,
        end_at: i64,
    ) -> Result<()> {
        self.conn.execute(
            "UPDATE calendar_events SET title = ?1, start_at = ?2, end_at = ?3, updated_at = unixepoch()
             WHERE google_event_id = ?4",
            params![title, start_at, end_at, google_event_id],
        )?;
        Ok(())
    }

    pub fn mark_calendar_event_cancelled(&self, google_event_id: &str) -> Result<()> {
        self.conn.execute(
            "UPDATE calendar_events SET event_status = 'cancelled', updated_at = unixepoch()
             WHERE google_event_id = ?1",
            params![google_event_id],
        )?;
        Ok(())
    }

    pub fn update_calendar_event_sync(
        &self,
        id: i64,
        attendee_status: Option<&str>,
        event_status: &str,
    ) -> Result<()> {
        self.conn.execute(
            "UPDATE calendar_events SET attendee_status = ?1, event_status = ?2,
             updated_at = unixepoch() WHERE id = ?3",
            params![attendee_status, event_status, id],
        )?;
        Ok(())
    }

    pub fn mark_calendar_rdv_effectue(&self, id: i64, contact_id: i64) -> Result<()> {
        let now = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_secs() as i64;
        self.conn.execute("BEGIN IMMEDIATE", [])?;
        let result = (|| -> Result<()> {
            let updated = self.conn.execute(
                "UPDATE calendar_events SET rdv_effectue = 1, updated_at = unixepoch()
                 WHERE id = ?1 AND rdv_effectue = 0",
                params![id],
            )?;
            if updated == 0 {
                return Err(rusqlite::Error::InvalidParameterName(format!(
                    "RDV introuvable ou déjà effectué: {}",
                    id
                )));
            }
            self.touch_contact_last_contact(contact_id, now)?;
            self.auto_close_suivi_alertes_after_contact(contact_id)?;
            self.advance_pipeline_on_rdv(contact_id)?;
            self.conn.execute(
                "UPDATE contact_etiquettes SET pipeline_status = 'TERMINE'
                 WHERE contact_id = ?1 AND pipeline_status = 'RDV_PRIS'
                   AND EXISTS (
                     SELECT 1 FROM etiquettes e
                     WHERE e.id = contact_etiquettes.etiquette_id
                       AND COALESCE(e.pipeline_actif, 0) = 1
                   )",
                params![contact_id],
            )?;
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

    pub fn list_calendar_events_to_sync(&self) -> Result<Vec<CalendarEventEntry>> {
        let now = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_secs() as i64;
        let mut stmt = self.conn.prepare(
            "SELECT id, contact_id, alerte_id, tache_id, pipe_timeline_entry_id, google_event_id,
                    title, start_at, end_at, attendee_email, attendee_status, event_status,
                    rdv_effectue, created_at, updated_at
             FROM calendar_events
             WHERE rdv_effectue = 0
               AND event_status != 'cancelled'
               AND start_at >= ?1
             ORDER BY start_at ASC",
        )?;
        let week_ago = now - 7 * 24 * 3600;
        let rows = stmt.query_map(params![week_ago], map_calendar_event_row)?;
        rows.collect()
    }

    pub fn get_calendar_events_today(&self) -> Result<Vec<CalendarEventEntry>> {
        let now = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_secs() as i64;
        let day_start = now - (now % 86400);
        let day_end = day_start + 86400;
        let mut stmt = self.conn.prepare(
            "SELECT ce.id, ce.contact_id, ce.alerte_id, ce.tache_id, ce.pipe_timeline_entry_id,
                    ce.google_event_id, ce.title, ce.start_at, ce.end_at, ce.attendee_email,
                    ce.attendee_status, ce.event_status, ce.rdv_effectue, ce.created_at,
                    ce.updated_at, c.prenom, c.nom
             FROM calendar_events ce
             INNER JOIN contacts c ON c.id = ce.contact_id
             WHERE ce.start_at >= ?1 AND ce.start_at < ?2
               AND ce.event_status != 'cancelled'
             ORDER BY ce.start_at ASC",
        )?;
        let rows = stmt.query_map(params![day_start, day_end], |row| {
            Ok(CalendarEventEntry {
                id: row.get(0)?,
                contact_id: row.get(1)?,
                alerte_id: row.get(2)?,
                tache_id: row.get(3)?,
                pipe_timeline_entry_id: row.get(4)?,
                google_event_id: row.get(5)?,
                title: row.get(6)?,
                start_at: row.get(7)?,
                end_at: row.get(8)?,
                attendee_email: row.get(9)?,
                attendee_status: row.get(10)?,
                event_status: row.get(11)?,
                rdv_effectue: row.get::<_, i64>(12)? != 0,
                created_at: row.get(13)?,
                updated_at: row.get(14)?,
                contact_prenom: Some(row.get(15)?),
                contact_nom: Some(row.get(16)?),
                visio_link: None,
                event_location: None,
            })
        })?;
        rows.collect()
    }

    pub fn get_calendar_event_by_google_event_id(
        &self,
        google_event_id: &str,
    ) -> Result<Option<CalendarEventEntry>> {
        let mut stmt = self.conn.prepare(
            "SELECT id, contact_id, alerte_id, tache_id, pipe_timeline_entry_id, google_event_id,
                    title, start_at, end_at, attendee_email, attendee_status, event_status,
                    rdv_effectue, created_at, updated_at
             FROM calendar_events
             WHERE google_event_id = ?1 AND event_status != 'cancelled'",
        )?;
        let mut rows = stmt.query_map(params![google_event_id], map_calendar_event_row)?;
        Ok(rows.next().transpose()?)
    }

    pub fn list_pipe_linked_calendar_events_between(
        &self,
        start_at: i64,
        end_at: i64,
    ) -> Result<Vec<CalendarEventEntry>> {
        let mut stmt = self.conn.prepare(
            "SELECT id, contact_id, alerte_id, tache_id, pipe_timeline_entry_id, google_event_id,
                    title, start_at, end_at, attendee_email, attendee_status, event_status,
                    rdv_effectue, created_at, updated_at
             FROM calendar_events
             WHERE pipe_timeline_entry_id IS NOT NULL
               AND event_status != 'cancelled'
               AND rdv_effectue = 0
               AND start_at >= ?1 AND start_at < ?2",
        )?;
        let rows = stmt.query_map(params![start_at, end_at], map_calendar_event_row)?;
        rows.collect()
    }

    pub fn list_active_pipe_linked_calendar_events(
        &self,
        since_start_at: i64,
    ) -> Result<Vec<CalendarEventEntry>> {
        let mut stmt = self.conn.prepare(
            "SELECT id, contact_id, alerte_id, tache_id, pipe_timeline_entry_id, google_event_id,
                    title, start_at, end_at, attendee_email, attendee_status, event_status,
                    rdv_effectue, created_at, updated_at
             FROM calendar_events
             WHERE pipe_timeline_entry_id IS NOT NULL
               AND event_status != 'cancelled'
               AND rdv_effectue = 0
               AND start_at >= ?1",
        )?;
        let rows = stmt.query_map(params![since_start_at], map_calendar_event_row)?;
        rows.collect()
    }

    pub fn get_google_event_id_for_pipe_timeline_entry(
        &self,
        timeline_entry_id: i64,
    ) -> Result<Option<String>> {
        let mut stmt = self.conn.prepare(
            "SELECT google_event_id FROM calendar_events
             WHERE pipe_timeline_entry_id = ?1 AND event_status != 'cancelled'
             ORDER BY updated_at DESC LIMIT 1",
        )?;
        let mut rows = stmt.query_map(params![timeline_entry_id], |row| row.get(0))?;
        Ok(rows.next().transpose()?)
    }

    pub fn get_active_calendar_event_for_pipe_timeline(
        &self,
        timeline_entry_id: i64,
    ) -> Result<Option<super::models::CalendarEventEntry>> {
        let mut stmt = self.conn.prepare(
            "SELECT id, contact_id, alerte_id, tache_id, pipe_timeline_entry_id, google_event_id,
                    title, start_at, end_at, attendee_email, attendee_status, event_status,
                    rdv_effectue, created_at, updated_at
             FROM calendar_events
             WHERE pipe_timeline_entry_id = ?1 AND event_status != 'cancelled'
             ORDER BY updated_at DESC LIMIT 1",
        )?;
        let mut rows = stmt.query_map(params![timeline_entry_id], map_calendar_event_row)?;
        Ok(rows.next().transpose()?)
    }

    pub fn pipe_links_for_google_event_ids(
        &self,
        google_event_ids: &[String],
    ) -> Result<std::collections::HashMap<String, (i64, i64)>> {
        let mut out = std::collections::HashMap::new();
        for google_event_id in google_event_ids {
            let Some(ce) = self.get_calendar_event_by_google_event_id(google_event_id)? else {
                continue;
            };
            let Some(timeline_id) = ce.pipe_timeline_entry_id else {
                continue;
            };
            let entry = match self.get_pipe_timeline_entry(timeline_id) {
                Ok(entry) => entry,
                Err(_) => continue,
            };
            out.insert(google_event_id.clone(), (timeline_id, entry.pipe_id));
        }
        Ok(out)
    }

    pub fn get_calendar_event_by_id(&self, id: i64) -> Result<CalendarEventEntry> {
        self.conn.query_row(
            "SELECT id, contact_id, alerte_id, tache_id, pipe_timeline_entry_id, google_event_id,
                    title, start_at, end_at, attendee_email, attendee_status, event_status,
                    rdv_effectue, created_at, updated_at
             FROM calendar_events WHERE id = ?1",
            params![id],
            map_calendar_event_row,
        )
    }
}

fn map_calendar_event_row(row: &rusqlite::Row<'_>) -> rusqlite::Result<CalendarEventEntry> {
    Ok(CalendarEventEntry {
        id: row.get(0)?,
        contact_id: row.get(1)?,
        alerte_id: row.get(2)?,
        tache_id: row.get(3)?,
        pipe_timeline_entry_id: row.get(4)?,
        google_event_id: row.get(5)?,
        title: row.get(6)?,
        start_at: row.get(7)?,
        end_at: row.get(8)?,
        attendee_email: row.get(9)?,
        attendee_status: row.get(10)?,
        event_status: row.get(11)?,
        rdv_effectue: row.get::<_, i64>(12)? != 0,
        created_at: row.get(13)?,
        updated_at: row.get(14)?,
        contact_prenom: None,
        contact_nom: None,
        visio_link: None,
        event_location: None,
    })
}
