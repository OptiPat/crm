//! Dates contact depuis RDV Pipe + Google Agenda (et `date_r1` figée après 1ère pose).

use chrono::{TimeZone, Utc};
use rusqlite::{params, Result};

use super::pipe::PIPE_TYPE_AFFAIRE;
use super::pipe_timeline::TIMELINE_RDV;

fn utc_day_start(ts: i64) -> i64 {
    let dt = Utc
        .timestamp_opt(ts, 0)
        .single()
        .unwrap_or_else(|| Utc.timestamp_opt(0, 0).single().unwrap());
    dt.date_naive()
        .and_hms_opt(0, 0, 0)
        .map(|naive| Utc.from_utc_datetime(&naive).timestamp())
        .unwrap_or(0)
}

fn is_r1_rdv_entry(entry: &super::models::PipeTimelineEntry) -> bool {
    entry.entry_type == TIMELINE_RDV
        && entry
            .titre
            .as_deref()
            .map(str::trim)
            .is_some_and(|t| t == "R1")
}

fn should_set_date_r1_from_pipe(categorie: &str) -> bool {
    categorie == "AUCUN" || categorie == "SUSPECT_CLIENT" || categorie == "PROSPECT_CLIENT"
}

impl super::Database {
    /// RDV positionné via pipe + agenda : dernier contact = date du RDV ; `date_r1` si 1er R1 vide.
    pub(crate) fn apply_pipe_agenda_rdv_to_contacts(
        &self,
        timeline_entry_id: i64,
        rdv_start_at: i64,
    ) -> Result<()> {
        let entry = self.get_pipe_timeline_entry(timeline_entry_id)?;
        if entry.entry_type != TIMELINE_RDV {
            return Ok(());
        }
        let pipe = self.get_pipe_by_id(entry.pipe_id)?;
        let rdv_day = utc_day_start(rdv_start_at);
        let r1_entry = pipe.pipe_type == PIPE_TYPE_AFFAIRE && is_r1_rdv_entry(&entry);

        self.apply_pipe_rdv_to_contact(timeline_entry_id, pipe.contact_id, rdv_day, r1_entry)?;
        if let Some(sec) = pipe
            .secondary_contact_id
            .filter(|id| *id > 0 && *id != pipe.contact_id)
        {
            let _ = self.apply_pipe_rdv_to_contact(timeline_entry_id, sec, rdv_day, r1_entry);
        }

        Ok(())
    }

    /// Annulation / suppression du RDV : restaure les dates figées avant la pose agenda.
    pub(crate) fn restore_contact_dates_after_pipe_rdv_cancelled(
        &self,
        timeline_entry_id: i64,
    ) -> Result<()> {
        let mut stmt = self.conn.prepare(
            "SELECT contact_id, date_dernier_contact_before, date_r1_before, restore_date_r1, categorie_before
             FROM pipe_rdv_contact_date_snapshot WHERE pipe_timeline_entry_id = ?1",
        )?;
        let rows = stmt
            .query_map(params![timeline_entry_id], |row| {
                Ok((
                    row.get::<_, i64>(0)?,
                    row.get::<_, Option<i64>>(1)?,
                    row.get::<_, Option<i64>>(2)?,
                    row.get::<_, i64>(3)?,
                    row.get::<_, Option<String>>(4)?,
                ))
            })?
            .collect::<Result<Vec<_>>>()?;

        if rows.is_empty() {
            return Ok(());
        }

        let now = Utc::now().timestamp();
        for (contact_id, dernier_before, r1_before, restore_r1, categorie_before) in rows {
            if restore_r1 > 0 {
                let categorie = categorie_before.unwrap_or_else(|| "AUCUN".to_string());
                self.conn.execute(
                    "UPDATE contacts SET date_dernier_contact = ?1, date_r1 = ?2, categorie = ?3, updated_at = ?4 WHERE id = ?5",
                    params![dernier_before, r1_before, categorie, now, contact_id],
                )?;
            } else {
                self.conn.execute(
                    "UPDATE contacts SET date_dernier_contact = ?1, updated_at = ?2 WHERE id = ?3",
                    params![dernier_before, now, contact_id],
                )?;
            }
        }

        self.conn.execute(
            "DELETE FROM pipe_rdv_contact_date_snapshot WHERE pipe_timeline_entry_id = ?1",
            params![timeline_entry_id],
        )?;
        Ok(())
    }

    fn apply_pipe_rdv_to_contact(
        &self,
        timeline_entry_id: i64,
        contact_id: i64,
        rdv_day: i64,
        r1_entry: bool,
    ) -> Result<()> {
        if contact_id <= 0 {
            return Ok(());
        }
        let contact_exists: i64 = self.conn.query_row(
            "SELECT COUNT(*) FROM contacts WHERE id = ?1",
            params![contact_id],
            |row| row.get(0),
        )?;
        if contact_exists == 0 {
            return Ok(());
        }

        let contact = self.get_contact_by_id(contact_id)?;
        let will_set_date_r1 =
            r1_entry && contact.date_r1.is_none() && should_set_date_r1_from_pipe(&contact.categorie);

        self.ensure_rdv_date_snapshot(timeline_entry_id, contact_id, &contact, will_set_date_r1)?;

        let now = Utc::now().timestamp();
        self.conn.execute(
            "UPDATE contacts SET date_dernier_contact = ?1, updated_at = ?2 WHERE id = ?3",
            params![rdv_day, now, contact_id],
        )?;

        if will_set_date_r1 {
            self.conn.execute(
                "UPDATE contacts SET date_r1 = ?1, categorie = ?2, updated_at = ?3 WHERE id = ?4",
                params![rdv_day, "PROSPECT_CLIENT", now, contact_id],
            )?;
        }
        Ok(())
    }

    fn ensure_rdv_date_snapshot(
        &self,
        timeline_entry_id: i64,
        contact_id: i64,
        contact: &super::models::Contact,
        will_set_date_r1: bool,
    ) -> Result<()> {
        self.conn.execute(
            "INSERT OR IGNORE INTO pipe_rdv_contact_date_snapshot (
                pipe_timeline_entry_id, contact_id,
                date_dernier_contact_before, date_r1_before, restore_date_r1, categorie_before
             ) VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
            params![
                timeline_entry_id,
                contact_id,
                contact.date_dernier_contact,
                if will_set_date_r1 {
                    contact.date_r1
                } else {
                    None::<i64>
                },
                if will_set_date_r1 { 1 } else { 0 },
                if will_set_date_r1 {
                    Some(contact.categorie.clone())
                } else {
                    None::<String>
                },
            ],
        )?;
        Ok(())
    }

    /// Conservé pour les appels existants — les dates ne sont plus recalculées depuis la timeline seule.
    pub(crate) fn sync_contact_dates_from_pipe(&self, _pipe_id: i64) -> Result<()> {
        Ok(())
    }

    pub(crate) fn sync_contact_dates_for_contact(&self, _contact_id: i64) -> Result<()> {
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::database::pipe_timeline::TIMELINE_RDV;
    use crate::database::models::{NewContact, NewPipe, NewPipeTimelineEntry};
    use crate::database::pipe::{PIPE_TYPE_ACTE_GESTION, PIPE_TYPE_AFFAIRE};
    use crate::database::Database;

    fn seed_contact(db: &Database) -> i64 {
        db.create_contact(NewContact {
            nom: "DUPONT".into(),
            prenom: "Jean".into(),
            categorie: "SUSPECT_CLIENT".into(),
            ..Default::default()
        })
        .unwrap()
        .id
        .expect("contact id")
    }

    fn seed_affaire(db: &Database, contact_id: i64) -> i64 {
        db.create_pipe(NewPipe {
            contact_id,
            secondary_contact_id: None,
            pipe_type: PIPE_TYPE_AFFAIRE.into(),
            parent_pipe_id: None,
            titre: "Affaire test".into(),
            stage: None,
            notes: None,
        })
        .unwrap()
        .id
    }

    #[test]
    fn agenda_rdv_sets_dernier_contact_and_date_r1_for_suspect() {
        let db = Database::open_in_memory_for_tests().unwrap();
        let contact_id = seed_contact(&db);
        let pipe_id = seed_affaire(&db, contact_id);
        let ts = 1_735_689_600_i64;

        let rdv = db
            .create_pipe_timeline_entry(NewPipeTimelineEntry {
                pipe_id,
                entry_type: TIMELINE_RDV.into(),
                titre: Some("R1".into()),
                contenu: Some("Premier RDV".into()),
                occurred_at: Some(ts),
            })
            .unwrap();

        db.apply_pipe_agenda_rdv_to_contacts(rdv.id, ts).unwrap();

        let contact = db.get_contact_by_id(contact_id).unwrap();
        assert_eq!(contact.date_dernier_contact, Some(utc_day_start(ts)));
        assert_eq!(contact.date_r1, Some(utc_day_start(ts)));
        assert_eq!(contact.categorie, "PROSPECT_CLIENT");
    }

    #[test]
    fn agenda_rdv_reschedule_updates_dernier_contact() {
        let db = Database::open_in_memory_for_tests().unwrap();
        let contact_id = seed_contact(&db);
        let pipe_id = seed_affaire(&db, contact_id);
        let initial = 1_735_689_600_i64;
        let rescheduled = 1_737_364_800_i64;

        let rdv = db
            .create_pipe_timeline_entry(NewPipeTimelineEntry {
                pipe_id,
                entry_type: TIMELINE_RDV.into(),
                titre: Some("R2".into()),
                contenu: Some("RDV".into()),
                occurred_at: Some(initial),
            })
            .unwrap();

        db.apply_pipe_agenda_rdv_to_contacts(rdv.id, initial).unwrap();
        db.apply_pipe_agenda_rdv_to_contacts(rdv.id, rescheduled).unwrap();

        assert_eq!(
            db.get_contact_by_id(contact_id).unwrap().date_dernier_contact,
            Some(utc_day_start(rescheduled))
        );
        assert!(db.get_contact_by_id(contact_id).unwrap().date_r1.is_none());
    }

    #[test]
    fn existing_date_r1_not_overwritten_by_agenda_rdv() {
        let db = Database::open_in_memory_for_tests().unwrap();
        let contact_id = seed_contact(&db);
        let first_r1 = 1_735_689_600_i64;
        let now = chrono::Utc::now().timestamp();
        db.conn
            .execute(
                "UPDATE contacts SET date_r1 = ?1, categorie = 'CLIENT', updated_at = ?2 WHERE id = ?3",
                params![first_r1, now, contact_id],
            )
            .unwrap();

        let pipe_id = seed_affaire(&db, contact_id);
        let rdv = db
            .create_pipe_timeline_entry(NewPipeTimelineEntry {
                pipe_id,
                entry_type: TIMELINE_RDV.into(),
                titre: Some("R1".into()),
                contenu: Some("Nouveau".into()),
                occurred_at: Some(first_r1 + 86_400 * 30),
            })
            .unwrap();

        db.apply_pipe_agenda_rdv_to_contacts(rdv.id, first_r1 + 86_400 * 30).unwrap();

        assert_eq!(db.get_contact_by_id(contact_id).unwrap().date_r1, Some(first_r1));
    }

    #[test]
    fn agenda_r1_skipped_for_client_without_existing_date_r1() {
        let db = Database::open_in_memory_for_tests().unwrap();
        let contact_id = db
            .create_contact(NewContact {
                nom: "CLIENT".into(),
                prenom: "Actif".into(),
                categorie: "CLIENT".into(),
                ..Default::default()
            })
            .unwrap()
            .id
            .expect("contact id");
        let pipe_id = seed_affaire(&db, contact_id);
        let ts = 1_735_689_600_i64;

        let rdv = db
            .create_pipe_timeline_entry(NewPipeTimelineEntry {
                pipe_id,
                entry_type: TIMELINE_RDV.into(),
                titre: Some("R1".into()),
                contenu: Some("RDV".into()),
                occurred_at: Some(ts),
            })
            .unwrap();

        db.apply_pipe_agenda_rdv_to_contacts(rdv.id, ts).unwrap();

        let contact = db.get_contact_by_id(contact_id).unwrap();
        assert_eq!(contact.date_dernier_contact, Some(utc_day_start(ts)));
        assert!(contact.date_r1.is_none());
    }

    #[test]
    fn timeline_rdv_without_agenda_hook_does_not_touch_dates() {
        let db = Database::open_in_memory_for_tests().unwrap();
        let contact_id = seed_contact(&db);
        let pipe_id = seed_affaire(&db, contact_id);
        let ts = 1_735_689_600_i64;

        db.create_pipe_timeline_entry(NewPipeTimelineEntry {
            pipe_id,
            entry_type: TIMELINE_RDV.into(),
            titre: Some("R1".into()),
            contenu: Some("Sans agenda".into()),
            occurred_at: Some(ts),
        })
        .unwrap();

        let contact = db.get_contact_by_id(contact_id).unwrap();
        assert!(contact.date_dernier_contact.is_none());
        assert!(contact.date_r1.is_none());
    }

    #[test]
    fn agenda_rdv_sets_date_r1_on_secondary_contact() {
        let db = Database::open_in_memory_for_tests().unwrap();
        let contact_a = seed_contact(&db);
        let contact_b = db
            .create_contact(NewContact {
                nom: "MARTIN".into(),
                prenom: "Marie".into(),
                categorie: "SUSPECT_CLIENT".into(),
                ..Default::default()
            })
            .unwrap()
            .id
            .expect("contact b");
        let pipe_id = db
            .create_pipe(NewPipe {
                contact_id: contact_a,
                secondary_contact_id: Some(contact_b),
                pipe_type: PIPE_TYPE_AFFAIRE.into(),
                parent_pipe_id: None,
                titre: "Couple".into(),
                stage: None,
                notes: None,
            })
            .unwrap()
            .id;
        let ts = 1_735_689_600_i64;

        let rdv = db
            .create_pipe_timeline_entry(NewPipeTimelineEntry {
                pipe_id,
                entry_type: TIMELINE_RDV.into(),
                titre: Some("R1".into()),
                contenu: Some("Premier RDV".into()),
                occurred_at: Some(ts),
            })
            .unwrap();

        db.apply_pipe_agenda_rdv_to_contacts(rdv.id, ts).unwrap();

        assert_eq!(db.get_contact_by_id(contact_a).unwrap().date_r1, Some(utc_day_start(ts)));
        assert_eq!(db.get_contact_by_id(contact_b).unwrap().date_r1, Some(utc_day_start(ts)));
    }

    #[test]
    fn delete_pipe_does_not_clear_contact_dates() {
        let db = Database::open_in_memory_for_tests().unwrap();
        let contact_id = seed_contact(&db);
        let manual_ts = 1_735_689_600_i64;
        let now = chrono::Utc::now().timestamp();
        db.conn
            .execute(
                "UPDATE contacts SET date_dernier_contact = ?1, date_r1 = ?1, updated_at = ?2 WHERE id = ?3",
                params![manual_ts, now, contact_id],
            )
            .unwrap();

        let pipe_id = seed_affaire(&db, contact_id);
        db.delete_pipe(pipe_id).unwrap();

        let contact = db.get_contact_by_id(contact_id).unwrap();
        assert_eq!(contact.date_dernier_contact, Some(manual_ts));
        assert_eq!(contact.date_r1, Some(manual_ts));
    }

    #[test]
    fn cancel_rdv_restores_previous_dernier_contact_and_date_r1() {
        let db = Database::open_in_memory_for_tests().unwrap();
        let contact_id = seed_contact(&db);
        let previous_dernier = 1_730_524_800_i64; // 2024-11-01
        let now = chrono::Utc::now().timestamp();
        db.conn
            .execute(
                "UPDATE contacts SET date_dernier_contact = ?1, updated_at = ?2 WHERE id = ?3",
                params![previous_dernier, now, contact_id],
            )
            .unwrap();

        let pipe_id = seed_affaire(&db, contact_id);
        let rdv_ts = 1_735_689_600_i64;

        let rdv = db
            .create_pipe_timeline_entry(NewPipeTimelineEntry {
                pipe_id,
                entry_type: TIMELINE_RDV.into(),
                titre: Some("R1".into()),
                contenu: Some("RDV".into()),
                occurred_at: Some(rdv_ts),
            })
            .unwrap();

        db.apply_pipe_agenda_rdv_to_contacts(rdv.id, rdv_ts).unwrap();
        assert_eq!(
            db.get_contact_by_id(contact_id).unwrap().date_dernier_contact,
            Some(utc_day_start(rdv_ts))
        );
        assert!(db.get_contact_by_id(contact_id).unwrap().date_r1.is_some());

        db.delete_pipe_timeline_entry(rdv.id).unwrap();

        let contact = db.get_contact_by_id(contact_id).unwrap();
        assert_eq!(contact.date_dernier_contact, Some(previous_dernier));
        assert!(contact.date_r1.is_none());
    }

    #[test]
    fn cancel_rdv_restores_empty_dernier_contact_when_none_before() {
        let db = Database::open_in_memory_for_tests().unwrap();
        let contact_id = seed_contact(&db);
        let pipe_id = seed_affaire(&db, contact_id);
        let rdv_ts = 1_735_689_600_i64;

        let rdv = db
            .create_pipe_timeline_entry(NewPipeTimelineEntry {
                pipe_id,
                entry_type: TIMELINE_RDV.into(),
                titre: Some("R2".into()),
                contenu: Some("RDV".into()),
                occurred_at: Some(rdv_ts),
            })
            .unwrap();

        db.apply_pipe_agenda_rdv_to_contacts(rdv.id, rdv_ts).unwrap();
        assert!(db.get_contact_by_id(contact_id).unwrap().date_dernier_contact.is_some());

        db.delete_pipe_timeline_entry(rdv.id).unwrap();

        assert!(db.get_contact_by_id(contact_id).unwrap().date_dernier_contact.is_none());
    }

    #[test]
    fn suivi_pipe_agenda_rdv_updates_dernier_contact_only() {
        let db = Database::open_in_memory_for_tests().unwrap();
        let contact_id = seed_contact(&db);
        let pipe_id = db
            .create_pipe(NewPipe {
                contact_id,
                secondary_contact_id: None,
                pipe_type: PIPE_TYPE_ACTE_GESTION.into(),
                parent_pipe_id: None,
                titre: "Suivi".into(),
                stage: None,
                notes: None,
            })
            .unwrap()
            .id;
        let ts = 1_735_689_600_i64;

        let rdv = db
            .create_pipe_timeline_entry(NewPipeTimelineEntry {
                pipe_id,
                entry_type: TIMELINE_RDV.into(),
                titre: Some("RDV suivi".into()),
                contenu: None,
                occurred_at: Some(ts),
            })
            .unwrap();

        db.apply_pipe_agenda_rdv_to_contacts(rdv.id, ts).unwrap();

        let contact = db.get_contact_by_id(contact_id).unwrap();
        assert_eq!(contact.date_dernier_contact, Some(utc_day_start(ts)));
        assert!(contact.date_r1.is_none());
    }
}
