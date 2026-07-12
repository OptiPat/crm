//! Synchronise `date_dernier_contact` et `date_r1` sur la fiche contact depuis le Pipe.

use chrono::{TimeZone, Utc};
use rusqlite::{params, Result};

use super::pipe::PIPE_TYPE_AFFAIRE;
use super::pipe_timeline::{
    TIMELINE_APPEL, TIMELINE_AVANCEMENT, TIMELINE_CREATION, TIMELINE_NOTE, TIMELINE_PROPOSITION,
    TIMELINE_RDV,
};

const USER_TIMELINE_TYPES: &[&str] = &[
    TIMELINE_APPEL,
    TIMELINE_RDV,
    TIMELINE_NOTE,
    TIMELINE_PROPOSITION,
];

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

fn prospection_creation_milestone(
    entries: &[super::models::PipeTimelineEntry],
) -> Option<&super::models::PipeTimelineEntry> {
    entries
        .iter()
        .find(|e| e.entry_type == TIMELINE_CREATION)
}

fn first_avancement_milestone(
    entries: &[super::models::PipeTimelineEntry],
) -> Option<&super::models::PipeTimelineEntry> {
    entries
        .iter()
        .filter(|e| e.entry_type == TIMELINE_AVANCEMENT)
        .min_by_key(|e| (e.occurred_at, e.id))
}

fn prospection_phase_user_entries<'a>(
    entries: &'a [super::models::PipeTimelineEntry],
) -> Vec<&'a super::models::PipeTimelineEntry> {
    let Some(creation) = prospection_creation_milestone(entries) else {
        return Vec::new();
    };
    let end_at = first_avancement_milestone(entries).map(|e| e.occurred_at);

    let mut out: Vec<&super::models::PipeTimelineEntry> = entries
        .iter()
        .filter(|e| USER_TIMELINE_TYPES.contains(&e.entry_type.as_str()))
        .filter(|e| e.occurred_at >= creation.occurred_at)
        .filter(|e| end_at.is_none_or(|end| e.occurred_at < end))
        .collect();
    out.sort_by_key(|e| (e.occurred_at, e.id));
    out
}

fn latest_r1_rdv_day_start(entries: &[super::models::PipeTimelineEntry]) -> Option<i64> {
    entries
        .iter()
        .filter(|e| is_r1_rdv_entry(e))
        .map(|e| utc_day_start(e.occurred_at))
        .max()
}

impl super::Database {
    pub(crate) fn sync_contact_dates_from_pipe(&self, pipe_id: i64) -> Result<()> {
        let pipe = self.get_pipe_by_id(pipe_id)?;
        self.sync_contact_dates_for_contact(pipe.contact_id)
    }

    pub(crate) fn sync_contact_dates_for_contact(&self, contact_id: i64) -> Result<()> {
        let mut stmt = self.conn.prepare(
            "SELECT id FROM pipes WHERE contact_id = ?1 AND pipe_type = ?2",
        )?;
        let pipe_ids: Vec<i64> = stmt
            .query_map(params![contact_id, PIPE_TYPE_AFFAIRE], |row| row.get(0))?
            .collect::<Result<Vec<_>>>()?;

        if pipe_ids.is_empty() {
            let now = Utc::now().timestamp();
            self.conn.execute(
                "UPDATE contacts SET date_dernier_contact = NULL, date_r1 = NULL, updated_at = ?1 WHERE id = ?2",
                params![now, contact_id],
            )?;
            return Ok(());
        }

        let mut prospection_last_contact: Option<i64> = None;
        let mut date_r1: Option<i64> = None;

        for pipe_id in pipe_ids {
            let entries = self.list_pipe_timeline_entries(pipe_id)?;
            if let Some(max_ts) = prospection_phase_user_entries(&entries)
                .into_iter()
                .map(|e| e.occurred_at)
                .max()
            {
                prospection_last_contact = Some(match prospection_last_contact {
                    Some(current) => current.max(max_ts),
                    None => max_ts,
                });
            }
            if let Some(day) = latest_r1_rdv_day_start(&entries) {
                date_r1 = Some(match date_r1 {
                    Some(current) => current.max(day),
                    None => day,
                });
            }
        }

        let contact = self.get_contact_by_id(contact_id)?;
        let now = Utc::now().timestamp();

        self.conn.execute(
            "UPDATE contacts SET date_dernier_contact = ?1, updated_at = ?2 WHERE id = ?3",
            params![prospection_last_contact, now, contact_id],
        )?;

        let mut categorie = contact.categorie.clone();
        if date_r1.is_some()
            && (categorie == "AUCUN" || categorie == "SUSPECT_CLIENT")
        {
            categorie = "PROSPECT_CLIENT".to_string();
        }

        self.conn.execute(
            "UPDATE contacts SET date_r1 = ?1, categorie = ?2, updated_at = ?3 WHERE id = ?4",
            params![date_r1, categorie, now, contact_id],
        )?;

        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::database::models::{NewContact, NewPipe, NewPipeTimelineEntry};
    use crate::database::pipe::{PIPE_STAGE_R1, PIPE_TYPE_AFFAIRE};
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
    fn sync_prospection_appel_updates_dernier_contact() {
        let db = Database::open_in_memory_for_tests().unwrap();
        let contact_id = seed_contact(&db);
        let pipe_id = seed_affaire(&db, contact_id);
        let creation_ts = db
            .list_pipe_timeline_entries(pipe_id)
            .unwrap()
            .into_iter()
            .find(|e| e.entry_type == TIMELINE_CREATION)
            .expect("creation")
            .occurred_at;
        let ts = creation_ts + 3_600;

        db.create_pipe_timeline_entry(NewPipeTimelineEntry {
            pipe_id,
            entry_type: TIMELINE_APPEL.into(),
            titre: Some("Premier appel".into()),
            contenu: Some("Message".into()),
            occurred_at: Some(ts),
        })
        .unwrap();

        let contact = db.get_contact_by_id(contact_id).unwrap();
        assert_eq!(contact.date_dernier_contact, Some(ts));
    }

    #[test]
    fn sync_r1_rdv_sets_date_r1_and_promotes_suspect() {
        let db = Database::open_in_memory_for_tests().unwrap();
        let contact_id = seed_contact(&db);
        let pipe_id = seed_affaire(&db, contact_id);
        let ts = 1_735_689_600_i64; // 2025-01-01T00:00:00Z

        db.create_pipe_timeline_entry(NewPipeTimelineEntry {
            pipe_id,
            entry_type: TIMELINE_RDV.into(),
            titre: Some("R1".into()),
            contenu: Some("Premier RDV".into()),
            occurred_at: Some(ts),
        })
        .unwrap();

        let contact = db.get_contact_by_id(contact_id).unwrap();
        assert_eq!(contact.date_r1, Some(ts));
        assert_eq!(contact.categorie, "PROSPECT_CLIENT");
    }

    #[test]
    fn sync_r1_cancelled_clears_date_r1() {
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
        assert!(db.get_contact_by_id(contact_id).unwrap().date_r1.is_some());

        db.delete_pipe_timeline_entry(rdv.id).unwrap();
        assert!(db.get_contact_by_id(contact_id).unwrap().date_r1.is_none());
    }

    #[test]
    fn sync_r1_rescheduled_updates_date_r1() {
        let db = Database::open_in_memory_for_tests().unwrap();
        let contact_id = seed_contact(&db);
        let pipe_id = seed_affaire(&db, contact_id);
        let initial = 1_735_689_600_i64;
        let rescheduled = 1_737_364_800_i64; // 2025-01-21T00:00:00Z

        let rdv = db
            .create_pipe_timeline_entry(NewPipeTimelineEntry {
                pipe_id,
                entry_type: TIMELINE_RDV.into(),
                titre: Some("R1".into()),
                contenu: Some("Premier RDV".into()),
                occurred_at: Some(initial),
            })
            .unwrap();

        db.update_pipe_timeline_occurred_at(rdv.id, rescheduled)
            .unwrap();
        assert_eq!(
            db.get_contact_by_id(contact_id).unwrap().date_r1,
            Some(utc_day_start(rescheduled))
        );
    }

    #[test]
    fn sync_prospection_appel_clears_dernier_contact_when_deleted() {
        let db = Database::open_in_memory_for_tests().unwrap();
        let contact_id = seed_contact(&db);
        let pipe_id = seed_affaire(&db, contact_id);
        let creation_ts = db
            .list_pipe_timeline_entries(pipe_id)
            .unwrap()
            .into_iter()
            .find(|e| e.entry_type == TIMELINE_CREATION)
            .expect("creation")
            .occurred_at;
        let ts = creation_ts + 3_600;

        let appel = db
            .create_pipe_timeline_entry(NewPipeTimelineEntry {
                pipe_id,
                entry_type: TIMELINE_APPEL.into(),
                titre: Some("Premier appel".into()),
                contenu: Some("Message".into()),
                occurred_at: Some(ts),
            })
            .unwrap();
        assert_eq!(
            db.get_contact_by_id(contact_id).unwrap().date_dernier_contact,
            Some(ts)
        );

        db.delete_pipe_timeline_entry(appel.id).unwrap();
        assert!(db
            .get_contact_by_id(contact_id)
            .unwrap()
            .date_dernier_contact
            .is_none());
    }

    #[test]
    fn delete_pipe_clears_contact_dates_when_last_affaire() {
        let db = Database::open_in_memory_for_tests().unwrap();
        let contact_id = seed_contact(&db);
        let pipe_id = seed_affaire(&db, contact_id);
        let creation_ts = db
            .list_pipe_timeline_entries(pipe_id)
            .unwrap()
            .into_iter()
            .find(|e| e.entry_type == TIMELINE_CREATION)
            .expect("creation")
            .occurred_at;

        db.create_pipe_timeline_entry(NewPipeTimelineEntry {
            pipe_id,
            entry_type: TIMELINE_APPEL.into(),
            titre: Some("Appel".into()),
            contenu: Some("OK".into()),
            occurred_at: Some(creation_ts + 3_600),
        })
        .unwrap();
        db.create_pipe_timeline_entry(NewPipeTimelineEntry {
            pipe_id,
            entry_type: TIMELINE_RDV.into(),
            titre: Some("R1".into()),
            contenu: Some("RDV".into()),
            occurred_at: Some(creation_ts + 7_200),
        })
        .unwrap();

        let contact = db.get_contact_by_id(contact_id).unwrap();
        assert!(contact.date_dernier_contact.is_some());
        assert!(contact.date_r1.is_some());

        db.delete_pipe(pipe_id).unwrap();
        let after = db.get_contact_by_id(contact_id).unwrap();
        assert!(after.date_dernier_contact.is_none());
        assert!(after.date_r1.is_none());
    }

    #[test]
    fn sync_ignores_post_prospection_entries_for_dernier_contact() {
        let db = Database::open_in_memory_for_tests().unwrap();
        let contact_id = seed_contact(&db);
        let pipe_id = seed_affaire(&db, contact_id);
        let creation_ts = db
            .list_pipe_timeline_entries(pipe_id)
            .unwrap()
            .into_iter()
            .find(|e| e.entry_type == TIMELINE_CREATION)
            .expect("creation")
            .occurred_at;
        let appel_ts = creation_ts + 10;

        db.create_pipe_timeline_entry(NewPipeTimelineEntry {
            pipe_id,
            entry_type: TIMELINE_APPEL.into(),
            titre: Some("Appel".into()),
            contenu: Some("OK".into()),
            occurred_at: Some(appel_ts),
        })
        .unwrap();

        db.set_pipe_stage(pipe_id, PIPE_STAGE_R1, None, Some(appel_ts + 100))
            .unwrap();

        db.create_pipe_timeline_entry(NewPipeTimelineEntry {
            pipe_id,
            entry_type: TIMELINE_APPEL.into(),
            titre: Some("Relance R1".into()),
            contenu: Some("Plus tard".into()),
            occurred_at: Some(appel_ts + 86_400),
        })
        .unwrap();

        assert_eq!(
            db.get_contact_by_id(contact_id).unwrap().date_dernier_contact,
            Some(appel_ts)
        );
    }
}
