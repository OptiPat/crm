//! Annulation / report Pipe depuis Google Agenda (miroir des actions CRM).

use super::models::NewPipeTimelineEntry;
use super::pipe::{PIPE_STAGE_R1, PIPE_STAGE_R2, PIPE_STAGE_R3, PIPE_TYPE_AFFAIRE};
use super::pipe_timeline::{TIMELINE_NOTE, TIMELINE_RDV};

const FR_MONTHS: [&str; 12] = [
    "janv.", "févr.", "mars", "avr.", "mai", "juin", "juil.", "août", "sept.", "oct.", "nov.",
    "déc.",
];

pub const PIPE_SYNC_TIME_TOLERANCE_SEC: i64 = 60;

fn now_unix() -> i64 {
    chrono::Utc::now().timestamp()
}

fn format_timeline_occurred_at_fr(ts: i64) -> String {
    use chrono::{Datelike, Local, TimeZone, Timelike};
    let Some(dt) = Local.timestamp_opt(ts, 0).single() else {
        return String::new();
    };
    let month = FR_MONTHS
        .get(dt.month0() as usize)
        .copied()
        .unwrap_or("???");
    format!(
        "{:02} {} {}, {:02}:{:02}",
        dt.day(),
        month,
        dt.year(),
        dt.hour(),
        dt.minute()
    )
}

pub(crate) fn format_rdv_entry_display_label(
    entry: &super::models::PipeTimelineEntry,
) -> String {
    if entry.entry_type != TIMELINE_RDV {
        return "RDV".into();
    }
    match entry.titre.as_deref().map(str::trim) {
        Some(super::pipe::PIPE_STAGE_R1) => "RDV R1".into(),
        Some(super::pipe::PIPE_STAGE_R2) => "RDV R2".into(),
        Some(super::pipe::PIPE_STAGE_R3) => "RDV R3".into(),
        Some(t) if !t.is_empty() => format!("RDV · {t}"),
        _ => "RDV".into(),
    }
}

pub(crate) fn build_rdv_cancelled_contenu(entry: &super::models::PipeTimelineEntry) -> String {
    format!("{} annulé", format_rdv_entry_display_label(entry))
}

pub(crate) fn build_rdv_rescheduled_contenu(
    entry: &super::models::PipeTimelineEntry,
    previous_occurred_at: i64,
    new_occurred_at: i64,
) -> String {
    let label = format_rdv_entry_display_label(entry);
    format!(
        "{label} reporté : était le {} → {}",
        format_timeline_occurred_at_fr(previous_occurred_at),
        format_timeline_occurred_at_fr(new_occurred_at)
    )
}

fn can_revert_pipe_to_prospection(stage: &str) -> bool {
    matches!(stage, PIPE_STAGE_R1 | PIPE_STAGE_R2 | PIPE_STAGE_R3)
}

impl super::Database {
    /// Annulation complète d'un RDV Pipe détectée côté Google (trace + suppression + retour prospection).
    pub fn apply_pipe_rdv_cancelled_from_google(
        &self,
        timeline_entry_id: i64,
        google_event_id: &str,
    ) -> rusqlite::Result<bool> {
        let entry = self.get_pipe_timeline_entry(timeline_entry_id)?;
        if entry.entry_type != TIMELINE_RDV {
            return Ok(false);
        }
        let pipe = self.get_pipe_by_id(entry.pipe_id)?;

        self.mark_calendar_event_cancelled(google_event_id)?;
        self.create_pipe_timeline_entry(NewPipeTimelineEntry {
            pipe_id: entry.pipe_id,
            entry_type: TIMELINE_NOTE.into(),
            titre: None,
            contenu: Some(build_rdv_cancelled_contenu(&entry)),
            occurred_at: Some(now_unix()),
        })?;
        self.delete_pipe_timeline_entry(timeline_entry_id)?;

        if pipe.pipe_type == PIPE_TYPE_AFFAIRE
            && pipe.stage != super::pipe::PIPE_STAGE_PROSPECTION
            && can_revert_pipe_to_prospection(&pipe.stage)
        {
            self.set_pipe_stage(entry.pipe_id, super::pipe::PIPE_STAGE_PROSPECTION, None, None)?;
            return Ok(true);
        }
        Ok(false)
    }

    /// Report Pipe détecté côté Google (trace + mise à jour date RDV).
    /// `previous_start_at` = début connu côté CRM (`calendar_events`), pas la timeline Pipe seule.
    pub fn apply_pipe_rdv_rescheduled_from_google(
        &self,
        timeline_entry_id: i64,
        google_event_id: &str,
        new_start_at: i64,
        new_end_at: i64,
        title: &str,
        previous_start_at: i64,
    ) -> rusqlite::Result<bool> {
        let entry = self.get_pipe_timeline_entry(timeline_entry_id)?;
        if entry.entry_type != TIMELINE_RDV {
            return Ok(false);
        }
        if (previous_start_at - new_start_at).abs() <= PIPE_SYNC_TIME_TOLERANCE_SEC {
            return Ok(false);
        }

        self.create_pipe_timeline_entry(NewPipeTimelineEntry {
            pipe_id: entry.pipe_id,
            entry_type: TIMELINE_NOTE.into(),
            titre: None,
            contenu: Some(build_rdv_rescheduled_contenu(
                &entry,
                previous_start_at,
                new_start_at,
            )),
            occurred_at: Some(now_unix()),
        })?;
        self.update_pipe_timeline_occurred_at(timeline_entry_id, new_start_at)?;
        self.update_calendar_event_times(google_event_id, title, new_start_at, new_end_at)?;
        Ok(true)
    }

    /// Durée seule modifiée côté Google (début identique).
    pub fn apply_pipe_rdv_duration_from_google(
        &self,
        google_event_id: &str,
        new_end_at: i64,
        title: &str,
        start_at: i64,
        previous_end_at: i64,
    ) -> rusqlite::Result<bool> {
        if (previous_end_at - new_end_at).abs() <= PIPE_SYNC_TIME_TOLERANCE_SEC {
            return Ok(false);
        }
        self.update_calendar_event_times(google_event_id, title, start_at, new_end_at)?;
        Ok(true)
    }

    /// Pipe localement désalignée alors que Google et le registre CRM sont d'accord — sans trace.
    pub fn align_pipe_rdv_occurred_at_from_calendar(
        &self,
        timeline_entry_id: i64,
        start_at: i64,
    ) -> rusqlite::Result<bool> {
        let entry = self.get_pipe_timeline_entry(timeline_entry_id)?;
        if entry.entry_type != TIMELINE_RDV {
            return Ok(false);
        }
        if entry.occurred_at == start_at {
            return Ok(false);
        }
        self.update_pipe_timeline_occurred_at(timeline_entry_id, start_at)?;
        Ok(true)
    }

    /// Résout l'identifiant Google (timeline puis `calendar_events`).
    pub fn google_event_id_for_pipe_timeline_entry(
        &self,
        timeline_entry_id: i64,
    ) -> rusqlite::Result<Option<String>> {
        let entry = self.get_pipe_timeline_entry(timeline_entry_id)?;
        if let Some(id) = entry
            .google_event_id
            .as_deref()
            .filter(|s| !s.trim().is_empty())
        {
            return Ok(Some(id.to_string()));
        }
        self.get_google_event_id_for_pipe_timeline_entry(timeline_entry_id)
    }

    /// Marque l'événement agenda CRM lié à un RDV Pipe comme annulé.
    pub fn mark_pipe_rdv_calendar_cancelled(
        &self,
        timeline_entry_id: i64,
    ) -> rusqlite::Result<()> {
        if let Some(google_event_id) = self.google_event_id_for_pipe_timeline_entry(timeline_entry_id)?
        {
            self.mark_calendar_event_cancelled(&google_event_id)?;
        }
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::database::models::{NewContact, NewPipe, NewPipeTimelineEntry};
    use crate::database::pipe::{PIPE_STAGE_PROSPECTION, PIPE_STAGE_R1};
    use crate::database::Database;

    fn seed_affaire_with_r1_rdv(db: &Database) -> (i64, i64) {
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
                pipe_type: PIPE_TYPE_AFFAIRE.into(),
                parent_pipe_id: None,
                titre: "Affaire test".into(),
                stage: Some(PIPE_STAGE_PROSPECTION.into()),
                notes: None,
            })
            .unwrap();
        db.set_pipe_stage(pipe.id, PIPE_STAGE_R1, None, None)
            .unwrap();
        let rdv = db
            .create_pipe_timeline_entry(NewPipeTimelineEntry {
                pipe_id: pipe.id,
                entry_type: TIMELINE_RDV.into(),
                titre: Some(PIPE_STAGE_R1.into()),
                contenu: None,
                occurred_at: Some(1_000_000),
            })
            .unwrap();
        (pipe.id, rdv.id)
    }

    #[test]
    fn google_cancel_creates_trace_deletes_rdv_and_reverts_prospection() {
        let db = Database::open_in_memory_for_tests().unwrap();
        let (pipe_id, rdv_id) = seed_affaire_with_r1_rdv(&db);
        db.insert_calendar_event(
            1,
            None,
            None,
            Some(rdv_id),
            "g-ev-1",
            "RDV R1",
            1_000_000,
            1_003_600,
            None,
        )
        .unwrap();

        let reverted = db
            .apply_pipe_rdv_cancelled_from_google(rdv_id, "g-ev-1")
            .unwrap();
        assert!(reverted);

        let pipe = db.get_pipe_by_id(pipe_id).unwrap();
        assert_eq!(pipe.stage, PIPE_STAGE_PROSPECTION);

        let entries = db.list_pipe_timeline_entries(pipe_id).unwrap();
        assert!(entries.iter().all(|e| e.id != rdv_id));
        assert!(
            entries
                .iter()
                .any(|e| e.contenu.as_deref() == Some("RDV R1 annulé"))
        );
    }

    #[test]
    fn google_reschedule_creates_trace_and_updates_rdv_date() {
        let db = Database::open_in_memory_for_tests().unwrap();
        let (pipe_id, rdv_id) = seed_affaire_with_r1_rdv(&db);
        db.insert_calendar_event(
            1,
            None,
            None,
            Some(rdv_id),
            "g-ev-2",
            "RDV R1",
            1_000_000,
            1_003_600,
            None,
        )
        .unwrap();

        let changed = db
            .apply_pipe_rdv_rescheduled_from_google(
                rdv_id,
                "g-ev-2",
                2_000_000,
                2_003_600,
                "RDV R1",
                1_000_000,
            )
            .unwrap();
        assert!(changed);

        let rdv = db.get_pipe_timeline_entry(rdv_id).unwrap();
        assert_eq!(rdv.occurred_at, 2_000_000);

        let entries = db.list_pipe_timeline_entries(pipe_id).unwrap();
        assert!(
            entries.iter().any(|e| {
                e.contenu
                    .as_deref()
                    .is_some_and(|c| c.contains("RDV R1 reporté"))
            })
        );
    }

    #[test]
    fn google_duration_only_updates_end_at_without_trace() {
        let db = Database::open_in_memory_for_tests().unwrap();
        let (pipe_id, rdv_id) = seed_affaire_with_r1_rdv(&db);
        db.insert_calendar_event(
            1,
            None,
            None,
            Some(rdv_id),
            "g-ev-3",
            "RDV R1",
            1_000_000,
            1_003_600,
            None,
        )
        .unwrap();

        let changed = db
            .apply_pipe_rdv_duration_from_google(
                "g-ev-3",
                1_007_200,
                "RDV R1",
                1_000_000,
                1_003_600,
            )
            .unwrap();
        assert!(changed);

        let ce = db
            .get_calendar_event_by_google_event_id("g-ev-3")
            .unwrap()
            .unwrap();
        assert_eq!(ce.end_at, 1_007_200);

        let entries = db.list_pipe_timeline_entries(pipe_id).unwrap();
        assert!(!entries.iter().any(|e| {
            e.contenu
                .as_deref()
                .is_some_and(|c| c.contains("reporté"))
        }));
    }
}
