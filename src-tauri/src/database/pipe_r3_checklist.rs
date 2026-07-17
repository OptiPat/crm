//! Checklist documents R3 (placements) pour les affaires.

use rusqlite::{params, OptionalExtension, Result, Row};
use serde::Deserialize;
use serde_json;
use std::collections::HashMap;

use super::models::{
    PipeR3ChecklistItemState, PipeR3ChecklistItems, PipeR3DocumentChecklist,
    PipeR3MissingDocsSummary, PipeTimelineEntry, UpdatePipeR3DocumentChecklistInput,
};
use super::pipe::PIPE_TYPE_AFFAIRE;
use super::pipe_timeline::{TIMELINE_NOTE, TIMELINE_RDV};

const PIPE_CHECKLIST_TEMPLATES_SETTING: &str = "pipe.checklist_templates";

#[derive(Debug, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
struct PipeChecklistTemplateItem {
    id: String,
}

fn parse_items_json(json: &str) -> PipeR3ChecklistItems {
    serde_json::from_str(json).unwrap_or_default()
}

fn default_r3_template_items() -> Vec<PipeChecklistTemplateItem> {
    vec![
        PipeChecklistTemplateItem { id: "der".into() },
        PipeChecklistTemplateItem { id: "rio".into() },
        PipeChecklistTemplateItem { id: "qpi_a_signer".into() },
        PipeChecklistTemplateItem { id: "cni".into() },
        PipeChecklistTemplateItem {
            id: "justificatif_domicile".into(),
        },
        PipeChecklistTemplateItem { id: "rib".into() },
    ]
}

fn parse_r3_template_from_json(raw: &str) -> Vec<PipeChecklistTemplateItem> {
    #[derive(Debug, Deserialize)]
    struct TemplatesRoot {
        #[serde(default, rename = "R3")]
        r3: Vec<PipeChecklistTemplateItem>,
    }
    serde_json::from_str::<TemplatesRoot>(raw)
        .ok()
        .filter(|root| !root.r3.is_empty())
        .map(|root| root.r3)
        .unwrap_or_else(default_r3_template_items)
}

fn is_template_item_complete(state: Option<&PipeR3ChecklistItemState>) -> bool {
    state.map(|item| item.received).unwrap_or(false)
}

fn missing_r3_item_keys(
    checklist: &PipeR3DocumentChecklist,
    template: &[PipeChecklistTemplateItem],
) -> Vec<String> {
    template
        .iter()
        .filter(|item| !is_template_item_complete(checklist.items.get(&item.id)))
        .map(|item| item.id.clone())
        .collect()
}

fn now_unix() -> i64 {
    chrono::Utc::now().timestamp()
}

fn map_checklist_row(row: &Row<'_>) -> Result<PipeR3DocumentChecklist> {
    let items_json: String = row.get(1)?;
    Ok(PipeR3DocumentChecklist {
        pipe_id: row.get(0)?,
        items: parse_items_json(&items_json),
        updated_at: row.get(2)?,
    })
}

fn items_to_json(items: &PipeR3ChecklistItems) -> Result<String> {
    serde_json::to_string(items).map_err(|e| {
        rusqlite::Error::InvalidParameterName(format!("items_json invalide: {e}"))
    })
}

fn rdv_stage_from_titre(titre: Option<&str>) -> Option<&'static str> {
    match titre.map(str::trim) {
        Some("R1") => Some("R1"),
        Some("R2") | Some("R2 Placement") | Some("R2 Immo") => Some("R2"),
        Some("R3") | Some("R3 Placements") | Some("R3 Immo") => Some("R3"),
        _ => None,
    }
}

fn is_r3_placements_rdv_titre(titre: &str) -> bool {
    matches!(titre.trim(), "R3" | "R3 Placements")
}

fn extract_titre_from_trace_note_text(text: &str) -> Option<String> {
    let text = text.trim();
    let suffix = if let Some(idx) = text.find(" annulé") {
        &text[..idx]
    } else if let Some(idx) = text.find(" reporté") {
        &text[..idx]
    } else {
        return None;
    };
    let mut titre = suffix.trim().strip_suffix(" planifié").unwrap_or(suffix).trim();
    if let Some(rest) = titre.strip_prefix("RDV ") {
        titre = rest.trim();
    }
    if titre.is_empty() {
        None
    } else {
        Some(titre.to_string())
    }
}

fn parse_rdv_timeline_trace_note(contenu: Option<&str>) -> Option<(&'static str, &'static str)> {
    let text = contenu?.trim();
    if text.is_empty() {
        return None;
    }
    let kind = if text.contains(" annulé") {
        "annulé"
    } else if text.contains(" reporté") {
        "reporté"
    } else {
        return None;
    };
    let titre = extract_titre_from_trace_note_text(text)?;
    let stage = rdv_stage_from_titre(Some(titre.as_str()))?;
    Some((stage, kind))
}

fn phase_has_r3_placements_rdv_activity(entries: &[PipeTimelineEntry]) -> bool {
    entries.iter().any(|entry| {
        if entry.entry_type == TIMELINE_RDV {
            return entry
                .titre
                .as_deref()
                .map(is_r3_placements_rdv_titre)
                .unwrap_or(false);
        }
        if entry.entry_type == TIMELINE_NOTE {
            if let Some((trace_stage, kind)) =
                parse_rdv_timeline_trace_note(entry.contenu.as_deref())
            {
                if trace_stage != "R3" || kind != "reporté" {
                    return false;
                }
                return extract_titre_from_trace_note_text(entry.contenu.as_deref().unwrap_or(""))
                    .map(|t| is_r3_placements_rdv_titre(&t))
                    .unwrap_or(false);
            }
        }
        false
    })
}

fn default_pipe_r3_document_checklist(pipe_id: i64) -> PipeR3DocumentChecklist {
    PipeR3DocumentChecklist {
        pipe_id,
        items: PipeR3ChecklistItems::default(),
        updated_at: 0,
    }
}

const VERSEMENT_COMPLEMENTAIRE_ACT_LABEL: &str = "Versement complémentaire";

fn is_versement_complementaire_affaire(
    pipe_type: &str,
    parent_pipe_id: Option<i64>,
    titre: &str,
) -> bool {
    if pipe_type != PIPE_TYPE_AFFAIRE {
        return false;
    }
    if !parent_pipe_id.filter(|id| *id > 0).is_some() {
        return false;
    }
    let titre = titre.trim();
    titre == VERSEMENT_COMPLEMENTAIRE_ACT_LABEL
        || titre.starts_with(&format!("{VERSEMENT_COMPLEMENTAIRE_ACT_LABEL} —"))
}

fn map_timeline_entry_row(row: &Row<'_>) -> Result<PipeTimelineEntry> {
    Ok(PipeTimelineEntry {
        id: row.get(0)?,
        pipe_id: row.get(1)?,
        entry_type: row.get(2)?,
        titre: row.get(3)?,
        contenu: row.get(4)?,
        occurred_at: row.get(5)?,
        created_at: row.get(6)?,
        google_event_id: row.get(7)?,
    })
}

impl super::Database {
    pub fn migrate_pipe_r3_document_checklists_table(&self) -> Result<()> {
        self.conn.execute_batch(
            "
            CREATE TABLE IF NOT EXISTS pipe_r3_document_checklists (
                pipe_id INTEGER PRIMARY KEY REFERENCES pipes(id) ON DELETE CASCADE,
                items_json TEXT NOT NULL DEFAULT '{}',
                updated_at INTEGER NOT NULL
            );
            ",
        )?;
        Ok(())
    }

    fn assert_affaire_pipe_r3(&self, pipe_id: i64) -> Result<(i64, Option<i64>)> {
        let pipe = self.get_pipe_by_id(pipe_id)?;
        if pipe.pipe_type != PIPE_TYPE_AFFAIRE {
            return Err(rusqlite::Error::InvalidParameterName(
                "checklist R3 réservée aux affaires".into(),
            ));
        }
        Ok((pipe.contact_id, pipe.secondary_contact_id))
    }

    fn validate_r3_checklist_items(
        &self,
        items: &PipeR3ChecklistItems,
        contact_id: i64,
        secondary_contact_id: Option<i64>,
    ) -> Result<()> {
        for item in items.values() {
            if let Some(document_id) = item.document_id.filter(|id| *id > 0) {
                let doc = self.get_document_by_id(document_id)?;
                let doc_contact = doc.contact_id.ok_or_else(|| {
                    rusqlite::Error::InvalidParameterName(
                        "le document doit être rattaché à un contact".into(),
                    )
                })?;
                if doc_contact != contact_id && secondary_contact_id != Some(doc_contact) {
                    return Err(rusqlite::Error::InvalidParameterName(
                        "document non rattaché au contact de l'affaire".into(),
                    ));
                }
            }
        }
        Ok(())
    }

    fn load_r3_checklist_template(&self) -> Result<Vec<PipeChecklistTemplateItem>> {
        match self.get_setting(PIPE_CHECKLIST_TEMPLATES_SETTING)? {
            Some(raw) if !raw.trim().is_empty() => Ok(parse_r3_template_from_json(&raw)),
            _ => Ok(default_r3_template_items()),
        }
    }

    pub fn get_or_create_pipe_r3_document_checklist(
        &self,
        pipe_id: i64,
    ) -> Result<PipeR3DocumentChecklist> {
        self.assert_affaire_pipe_r3(pipe_id)?;

        if let Some(existing) = self.conn.query_row(
            "SELECT pipe_id, items_json, updated_at
             FROM pipe_r3_document_checklists WHERE pipe_id = ?1",
            params![pipe_id],
            map_checklist_row,
        ).optional()? {
            return Ok(existing);
        }

        let now = now_unix();
        let items_json = items_to_json(&PipeR3ChecklistItems::default())?;
        self.conn.execute(
            "INSERT INTO pipe_r3_document_checklists (pipe_id, items_json, updated_at)
             VALUES (?1, ?2, ?3)",
            params![pipe_id, items_json, now],
        )?;

        self.conn.query_row(
            "SELECT pipe_id, items_json, updated_at
             FROM pipe_r3_document_checklists WHERE pipe_id = ?1",
            params![pipe_id],
            map_checklist_row,
        )
    }

    pub fn update_pipe_r3_document_checklist(
        &self,
        pipe_id: i64,
        update: UpdatePipeR3DocumentChecklistInput,
    ) -> Result<PipeR3DocumentChecklist> {
        let (contact_id, secondary_contact_id) = self.assert_affaire_pipe_r3(pipe_id)?;
        let mut current = self.get_or_create_pipe_r3_document_checklist(pipe_id)?;

        if let Some(items) = update.items {
            self.validate_r3_checklist_items(&items, contact_id, secondary_contact_id)?;
            current.items = items;
        }

        let now = now_unix();
        let items_json = items_to_json(&current.items)?;
        let updated = self.conn.execute(
            "UPDATE pipe_r3_document_checklists
             SET items_json = ?1, updated_at = ?2
             WHERE pipe_id = ?3",
            params![items_json, now, pipe_id],
        )?;
        if updated == 0 {
            return Err(rusqlite::Error::QueryReturnedNoRows);
        }

        self.get_or_create_pipe_r3_document_checklist(pipe_id)
    }

    fn get_pipe_r3_document_checklist_if_exists(
        &self,
        pipe_id: i64,
    ) -> Result<Option<PipeR3DocumentChecklist>> {
        self.conn
            .query_row(
                "SELECT pipe_id, items_json, updated_at
                 FROM pipe_r3_document_checklists WHERE pipe_id = ?1",
                params![pipe_id],
                map_checklist_row,
            )
            .optional()
    }

    pub fn list_pipe_r3_missing_docs_summaries(&self) -> Result<Vec<PipeR3MissingDocsSummary>> {
        let affaires: Vec<(i64, Option<i64>, String)> = self
            .conn
            .prepare(
                "SELECT id, parent_pipe_id, titre FROM pipes
                 WHERE pipe_type = ?1 AND archived_at IS NULL",
            )?
            .query_map(params![PIPE_TYPE_AFFAIRE], |row| {
                Ok((row.get(0)?, row.get(1)?, row.get(2)?))
            })?
            .collect::<Result<Vec<_>>>()?;

        let mut entries_by_pipe: HashMap<i64, Vec<PipeTimelineEntry>> = HashMap::new();
        let mut stmt = self.conn.prepare(
            "SELECT e.id, e.pipe_id, e.entry_type, e.titre, e.contenu, e.occurred_at, e.created_at, e.google_event_id
             FROM pipe_timeline_entries e
             INNER JOIN pipes p ON p.id = e.pipe_id
             WHERE p.pipe_type = ?1
               AND p.archived_at IS NULL
               AND e.entry_type IN (?2, ?3)",
        )?;
        let rows = stmt.query_map(
            params![PIPE_TYPE_AFFAIRE, TIMELINE_RDV, TIMELINE_NOTE],
            map_timeline_entry_row,
        )?;
        for row in rows {
            let entry = row?;
            entries_by_pipe
                .entry(entry.pipe_id)
                .or_default()
                .push(entry);
        }

        let template = self.load_r3_checklist_template()?;

        let mut summaries = Vec::new();
        for (pipe_id, parent_pipe_id, titre) in affaires {
            if is_versement_complementaire_affaire(PIPE_TYPE_AFFAIRE, parent_pipe_id, &titre) {
                continue;
            }
            let entries = entries_by_pipe
                .get(&pipe_id)
                .map(|items| items.as_slice())
                .unwrap_or(&[]);
            if !phase_has_r3_placements_rdv_activity(entries) {
                continue;
            }
            let checklist = self
                .get_pipe_r3_document_checklist_if_exists(pipe_id)?
                .unwrap_or_else(|| default_pipe_r3_document_checklist(pipe_id));
            let missing_item_keys = missing_r3_item_keys(&checklist, &template);
            if !missing_item_keys.is_empty() {
                summaries.push(PipeR3MissingDocsSummary {
                    pipe_id,
                    missing_item_keys,
                });
            }
        }
        Ok(summaries)
    }
}

#[cfg(test)]
mod tests {
    use crate::database::models::{NewContact, NewPipe, NewPipeTimelineEntry};
    use crate::database::pipe::PIPE_TYPE_AFFAIRE;
    use crate::database::pipe_timeline::TIMELINE_RDV;
    use crate::database::Database;

    #[test]
    fn pipe_r3_checklist_missing_after_rdv_planned() {
        let db = Database::open_in_memory_for_tests().unwrap();
        let contact_id = db
            .create_contact(NewContact {
                nom: "DUPONT".into(),
                prenom: "Jean".into(),
                categorie: "PROSPECT_CLIENT".into(),
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
                titre: "Affaire".into(),
                stage: Some("R2".into()),
                notes: None,
            })
            .unwrap();

        db.create_pipe_timeline_entry(NewPipeTimelineEntry {
            pipe_id: affaire.id,
            entry_type: TIMELINE_RDV.into(),
            titre: Some("R3".into()),
            contenu: None,
            occurred_at: Some(1_700_000_000),
        })
        .unwrap();

        let summaries = db.list_pipe_r3_missing_docs_summaries().unwrap();
        let row = summaries
            .iter()
            .find(|s| s.pipe_id == affaire.id)
            .expect("missing summary");
        assert_eq!(row.missing_item_keys.len(), 6);
        assert!(row.missing_item_keys.contains(&"der".to_string()));
    }

    #[test]
    fn pipe_r3_checklist_skips_r3_immo_rdv() {
        let db = Database::open_in_memory_for_tests().unwrap();
        let contact_id = db
            .create_contact(NewContact {
                nom: "BERNARD".into(),
                prenom: "Luc".into(),
                categorie: "PROSPECT_CLIENT".into(),
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
                titre: "Affaire immo".into(),
                stage: Some("R3".into()),
                notes: None,
            })
            .unwrap();

        db.create_pipe_timeline_entry(NewPipeTimelineEntry {
            pipe_id: affaire.id,
            entry_type: TIMELINE_RDV.into(),
            titre: Some("R3 Immo".into()),
            contenu: None,
            occurred_at: Some(1_700_000_000),
        })
        .unwrap();

        let summaries = db.list_pipe_r3_missing_docs_summaries().unwrap();
        assert!(!summaries.iter().any(|s| s.pipe_id == affaire.id));
    }
}
