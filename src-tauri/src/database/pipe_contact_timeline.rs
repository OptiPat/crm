//! Timeline pipe agrégée par contact (onglet Relation client).

use rusqlite::{params, Result, Row};

use super::pipe_timeline::TIMELINE_CREATION;

fn map_contact_timeline_row(row: &Row<'_>) -> Result<super::models::PipeContactTimelineEntry> {
    Ok(super::models::PipeContactTimelineEntry {
        id: row.get(0)?,
        pipe_id: row.get(1)?,
        entry_type: row.get(2)?,
        titre: row.get(3)?,
        contenu: row.get(4)?,
        occurred_at: row.get(5)?,
        created_at: row.get(6)?,
        google_event_id: row.get(7)?,
        pipe_titre: row.get(8)?,
        pipe_type: row.get(9)?,
        pipe_stage: row.get(10)?,
        pipe_archived_at: row.get(11)?,
    })
}

impl super::Database {
    pub fn list_pipe_timeline_for_contact(
        &self,
        contact_id: i64,
    ) -> Result<Vec<super::models::PipeContactTimelineEntry>> {
        let mut stmt = self.conn.prepare(
            "SELECT e.id, e.pipe_id, e.entry_type, e.titre, e.contenu, e.occurred_at, e.created_at, e.google_event_id,
                    p.titre, p.pipe_type, p.stage, p.archived_at
             FROM pipe_timeline_entries e
             INNER JOIN pipes p ON p.id = e.pipe_id
             WHERE (p.contact_id = ?1 OR p.secondary_contact_id = ?1)
               AND e.entry_type != ?2
             ORDER BY e.occurred_at DESC, e.id DESC",
        )?;
        let rows = stmt.query_map(params![contact_id, TIMELINE_CREATION], map_contact_timeline_row)?;
        rows.collect()
    }
}

#[cfg(test)]
mod tests {
    use crate::database::models::{NewContact, NewPipe, NewPipeTimelineEntry};
    use crate::database::pipe::{PIPE_TYPE_AFFAIRE, PIPE_TYPE_ACTION};
    use crate::database::pipe_timeline::{TIMELINE_APPEL, TIMELINE_NOTE};
    use crate::database::Database;

    #[test]
    fn list_pipe_timeline_for_contact_excludes_creation_and_includes_co_contact() {
        let db = Database::open_in_memory_for_tests().unwrap();
        let main_id = db
            .create_contact(NewContact {
                nom: "DUPONT".into(),
                prenom: "Jean".into(),
                categorie: "PROSPECT_CLIENT".into(),
                ..Default::default()
            })
            .unwrap()
            .id
            .expect("main");
        let co_id = db
            .create_contact(NewContact {
                nom: "DUPONT".into(),
                prenom: "Marie".into(),
                categorie: "PROSPECT_CLIENT".into(),
                ..Default::default()
            })
            .unwrap()
            .id
            .expect("co");

        let affaire = db
            .create_pipe(NewPipe {
                contact_id: main_id,
                secondary_contact_id: Some(co_id),
                pipe_type: PIPE_TYPE_AFFAIRE.into(),
                parent_pipe_id: None,
                titre: "Affaire SCPI".into(),
                stage: None,
                notes: None,
            })
            .unwrap();

        let apel_at = 1_700_100_000_i64;
        db.create_pipe_timeline_entry(NewPipeTimelineEntry {
            pipe_id: affaire.id,
            entry_type: TIMELINE_APPEL.into(),
            titre: Some("Premier appel".into()),
            contenu: None,
            occurred_at: Some(apel_at),
        })
        .unwrap();

        let action = db
            .create_pipe(NewPipe {
                contact_id: co_id,
                secondary_contact_id: None,
                pipe_type: PIPE_TYPE_ACTION.into(),
                parent_pipe_id: None,
                titre: "Relance".into(),
                stage: None,
                notes: None,
            })
            .unwrap();
        let note_at = 1_700_200_000_i64;
        db.create_pipe_timeline_entry(NewPipeTimelineEntry {
            pipe_id: action.id,
            entry_type: TIMELINE_NOTE.into(),
            titre: Some("Note action".into()),
            contenu: Some("Suite appel".into()),
            occurred_at: Some(note_at),
        })
        .unwrap();

        let for_main = db.list_pipe_timeline_for_contact(main_id).unwrap();
        assert_eq!(for_main.len(), 1);
        assert_eq!(for_main[0].entry_type, TIMELINE_APPEL);
        assert_eq!(for_main[0].pipe_titre, "Affaire SCPI");

        let for_co = db.list_pipe_timeline_for_contact(co_id).unwrap();
        assert_eq!(for_co.len(), 2);
        assert_eq!(for_co[0].entry_type, TIMELINE_NOTE);
        assert_eq!(for_co[1].entry_type, TIMELINE_APPEL);
    }

    #[test]
    fn archived_pipe_timeline_still_listed_for_contact() {
        let db = Database::open_in_memory_for_tests().unwrap();
        let contact_id = db
            .create_contact(NewContact {
                nom: "BERNARD".into(),
                prenom: "Luc".into(),
                categorie: "CLIENT".into(),
                ..Default::default()
            })
            .unwrap()
            .id
            .expect("contact");

        let affaire = db
            .create_pipe(NewPipe {
                contact_id,
                secondary_contact_id: None,
                pipe_type: PIPE_TYPE_AFFAIRE.into(),
                parent_pipe_id: None,
                titre: "Affaire close".into(),
                stage: None,
                notes: None,
            })
            .unwrap();

        db.create_pipe_timeline_entry(NewPipeTimelineEntry {
            pipe_id: affaire.id,
            entry_type: TIMELINE_APPEL.into(),
            titre: Some("Appel".into()),
            contenu: None,
            occurred_at: Some(1_700_000_000),
        })
        .unwrap();

        db.archive_pipe(affaire.id).unwrap();
        assert!(db.list_pipes(false).unwrap().is_empty());

        let timeline = db.list_pipe_timeline_for_contact(contact_id).unwrap();
        assert_eq!(timeline.len(), 1);
        assert_eq!(timeline[0].pipe_archived_at.is_some(), true);
    }
}
