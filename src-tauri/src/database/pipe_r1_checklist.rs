//! Checklist documents R1 pour les affaires (suivi CGP, sans email).

use rusqlite::{params, OptionalExtension, Result, Row};
use serde::Deserialize;
use serde_json;

use super::models::{
    PipeR1ChecklistItemState, PipeR1ChecklistItems, PipeR1DocumentChecklist,
    PipeR1MissingDocsSummary, PipeTimelineEntry, UpdatePipeR1DocumentChecklistInput,
};
use super::pipe::PIPE_TYPE_AFFAIRE;
use super::pipe_timeline::{TIMELINE_NOTE, TIMELINE_RDV};
use std::collections::HashMap;

const PIPE_CHECKLIST_TEMPLATES_SETTING: &str = "pipe.checklist_templates";

#[derive(Debug, Deserialize, Clone)]
struct PipeChecklistTemplateItem {
    id: String,
    #[serde(default)]
    profiles: Vec<String>,
    #[serde(default)]
    no_credit_option: bool,
}

#[derive(Debug, Deserialize, Default)]
struct PipeChecklistItemsLegacy {
    #[serde(default)]
    avis_imposition: PipeR1ChecklistItemState,
    #[serde(default)]
    releves_situation: PipeR1ChecklistItemState,
    #[serde(default)]
    amortissement_prets: PipeR1ChecklistItemState,
    #[serde(default)]
    bulletin_salaire: PipeR1ChecklistItemState,
    #[serde(default)]
    bulletin_salaire_decembre: PipeR1ChecklistItemState,
    #[serde(default)]
    bilans_comptables: PipeR1ChecklistItemState,
    #[serde(default)]
    avis_impot_chef_entreprise: PipeR1ChecklistItemState,
    #[serde(default)]
    estimation_retraite: PipeR1ChecklistItemState,
}

fn legacy_items_into_map(legacy: PipeChecklistItemsLegacy) -> PipeR1ChecklistItems {
    let mut map = PipeR1ChecklistItems::new();
    map.insert("avis_imposition".into(), legacy.avis_imposition);
    map.insert("releves_situation".into(), legacy.releves_situation);
    map.insert("amortissement_prets".into(), legacy.amortissement_prets);
    map.insert("bulletin_salaire".into(), legacy.bulletin_salaire);
    map.insert(
        "bulletin_salaire_decembre".into(),
        legacy.bulletin_salaire_decembre,
    );
    map.insert("bilans_comptables".into(), legacy.bilans_comptables);
    map.insert(
        "avis_impot_chef_entreprise".into(),
        legacy.avis_impot_chef_entreprise,
    );
    map.insert("estimation_retraite".into(), legacy.estimation_retraite);
    map
}

fn parse_items_json(json: &str) -> PipeR1ChecklistItems {
    if let Ok(map) = serde_json::from_str::<PipeR1ChecklistItems>(json) {
        return map;
    }
    if let Ok(legacy) = serde_json::from_str::<PipeChecklistItemsLegacy>(json) {
        return legacy_items_into_map(legacy);
    }
    PipeR1ChecklistItems::new()
}

fn default_r1_template_items() -> Vec<PipeChecklistTemplateItem> {
    vec![
        PipeChecklistTemplateItem {
            id: "avis_imposition".into(),
            profiles: vec!["base".into()],
            no_credit_option: false,
        },
        PipeChecklistTemplateItem {
            id: "releves_situation".into(),
            profiles: vec!["base".into()],
            no_credit_option: false,
        },
        PipeChecklistTemplateItem {
            id: "amortissement_prets".into(),
            profiles: vec!["base".into()],
            no_credit_option: true,
        },
        PipeChecklistTemplateItem {
            id: "bulletin_salaire".into(),
            profiles: vec!["salarie".into()],
            no_credit_option: false,
        },
        PipeChecklistTemplateItem {
            id: "bulletin_salaire_decembre".into(),
            profiles: vec!["salarie".into()],
            no_credit_option: false,
        },
        PipeChecklistTemplateItem {
            id: "bilans_comptables".into(),
            profiles: vec!["chef".into()],
            no_credit_option: false,
        },
        PipeChecklistTemplateItem {
            id: "avis_impot_chef_entreprise".into(),
            profiles: vec!["chef".into()],
            no_credit_option: false,
        },
        PipeChecklistTemplateItem {
            id: "estimation_retraite".into(),
            profiles: vec!["retraite".into()],
            no_credit_option: false,
        },
    ]
}

fn parse_r1_template_from_json(raw: &str) -> Vec<PipeChecklistTemplateItem> {
    #[derive(Debug, Deserialize)]
    struct TemplatesRoot {
        #[serde(default)]
        R1: Vec<PipeChecklistTemplateItem>,
    }
    serde_json::from_str::<TemplatesRoot>(raw)
        .ok()
        .filter(|root| !root.R1.is_empty())
        .map(|root| root.R1)
        .unwrap_or_else(default_r1_template_items)
}

fn template_item_active(
    item: &PipeChecklistTemplateItem,
    checklist: &PipeR1DocumentChecklist,
) -> bool {
    if item.profiles.iter().any(|p| p == "base") {
        return true;
    }
    if item.profiles.iter().any(|p| p == "salarie") && checklist.profile_salarie {
        return true;
    }
    if item.profiles.iter().any(|p| p == "chef") && checklist.profile_chef_entreprise {
        return true;
    }
    if item.profiles.iter().any(|p| p == "retraite") && checklist.profile_retraite {
        return true;
    }
    false
}

fn is_template_item_complete(
    item: &PipeChecklistTemplateItem,
    state: Option<&PipeR1ChecklistItemState>,
) -> bool {
    let state = state.cloned().unwrap_or_default();
    if item.no_credit_option {
        return state.received || state.no_credit.unwrap_or(false);
    }
    state.received
}

fn missing_r1_item_keys(
    checklist: &PipeR1DocumentChecklist,
    template: &[PipeChecklistTemplateItem],
) -> Vec<String> {
    template
        .iter()
        .filter(|item| template_item_active(item, checklist))
        .filter(|item| !is_template_item_complete(item, checklist.items.get(&item.id)))
        .map(|item| item.id.clone())
        .collect()
}

fn now_unix() -> i64 {
    chrono::Utc::now().timestamp()
}

fn map_checklist_row(row: &Row<'_>) -> Result<PipeR1DocumentChecklist> {
    let items_json: String = row.get(4)?;
    let items = parse_items_json(&items_json);
    Ok(PipeR1DocumentChecklist {
        pipe_id: row.get(0)?,
        profile_salarie: row.get::<_, i64>(1)? != 0,
        profile_chef_entreprise: row.get::<_, i64>(2)? != 0,
        profile_retraite: row.get::<_, i64>(3)? != 0,
        items,
        updated_at: row.get(5)?,
    })
}

fn items_to_json(items: &PipeR1ChecklistItems) -> Result<String> {
    serde_json::to_string(items).map_err(|e| {
        rusqlite::Error::InvalidParameterName(format!("items_json invalide: {e}"))
    })
}

fn rdv_stage_from_titre(titre: Option<&str>) -> Option<&'static str> {
    match titre.map(str::trim) {
        Some("R1") => Some("R1"),
        Some("R2") => Some("R2"),
        Some("R3") => Some("R3"),
        _ => None,
    }
}

fn parse_rdv_timeline_trace_note(contenu: Option<&str>) -> Option<(&'static str, &'static str)> {
    let text = contenu?.trim();
    const PREFIXES: [(&str, &str, &str); 12] = [
        ("RDV R1 annulé", "R1", "annulé"),
        ("RDV R1 planifié annulé", "R1", "annulé"),
        ("R1 planifié annulé", "R1", "annulé"),
        ("RDV R1 reporté", "R1", "reporté"),
        ("RDV R1 planifié reporté", "R1", "reporté"),
        ("R1 planifié reporté", "R1", "reporté"),
        ("RDV R2 annulé", "R2", "annulé"),
        ("RDV R2 planifié annulé", "R2", "annulé"),
        ("R2 planifié annulé", "R2", "annulé"),
        ("RDV R2 reporté", "R2", "reporté"),
        ("RDV R2 planifié reporté", "R2", "reporté"),
        ("R2 planifié reporté", "R2", "reporté"),
    ];
    for (prefix, stage, kind) in PREFIXES {
        if text.starts_with(prefix) {
            return Some((stage, kind));
        }
    }
    None
}

fn phase_has_rdv_activity_for_stage(entries: &[PipeTimelineEntry], stage: &str) -> bool {
    entries.iter().any(|entry| {
        if entry.entry_type == TIMELINE_RDV {
            return rdv_stage_from_titre(entry.titre.as_deref()) == Some(stage);
        }
        if entry.entry_type == TIMELINE_NOTE {
            if let Some((trace_stage, kind)) = parse_rdv_timeline_trace_note(entry.contenu.as_deref())
            {
                return trace_stage == stage && kind == "reporté";
            }
        }
        false
    })
}

fn default_pipe_r1_document_checklist(pipe_id: i64) -> PipeR1DocumentChecklist {
    PipeR1DocumentChecklist {
        pipe_id,
        profile_salarie: false,
        profile_chef_entreprise: false,
        profile_retraite: false,
        items: PipeR1ChecklistItems::default(),
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
    pub fn migrate_pipe_r1_document_checklists_table(&self) -> Result<()> {
        self.conn.execute_batch(
            "
            CREATE TABLE IF NOT EXISTS pipe_r1_document_checklists (
                pipe_id INTEGER PRIMARY KEY REFERENCES pipes(id) ON DELETE CASCADE,
                profile_salarie INTEGER NOT NULL DEFAULT 0,
                profile_chef_entreprise INTEGER NOT NULL DEFAULT 0,
                profile_retraite INTEGER NOT NULL DEFAULT 0,
                items_json TEXT NOT NULL DEFAULT '{}',
                updated_at INTEGER NOT NULL
            );
            ",
        )?;
        Ok(())
    }

    fn assert_affaire_pipe(&self, pipe_id: i64) -> Result<(i64, Option<i64>)> {
        let pipe = self.get_pipe_by_id(pipe_id)?;
        if pipe.pipe_type != PIPE_TYPE_AFFAIRE {
            return Err(rusqlite::Error::InvalidParameterName(
                "checklist R1 réservée aux affaires".into(),
            ));
        }
        Ok((pipe.contact_id, pipe.secondary_contact_id))
    }

    fn validate_document_for_pipe_contacts(
        &self,
        document_id: i64,
        contact_id: i64,
        secondary_contact_id: Option<i64>,
    ) -> Result<()> {
        let doc = self.get_document_by_id(document_id)?;
        let doc_contact = doc.contact_id.ok_or_else(|| {
            rusqlite::Error::InvalidParameterName(
                "le document doit être rattaché à un contact".into(),
            )
        })?;
        if doc_contact == contact_id {
            return Ok(());
        }
        if secondary_contact_id == Some(doc_contact) {
            return Ok(());
        }
        Err(rusqlite::Error::InvalidParameterName(
            "document non rattaché au contact de l'affaire".into(),
        ))
    }

    fn validate_checklist_items(
        &self,
        items: &PipeR1ChecklistItems,
        contact_id: i64,
        secondary_contact_id: Option<i64>,
    ) -> Result<()> {
        for item in items.values() {
            if let Some(document_id) = item.document_id.filter(|id| *id > 0) {
                self.validate_document_for_pipe_contacts(
                    document_id,
                    contact_id,
                    secondary_contact_id,
                )?;
            }
        }
        Ok(())
    }

    fn load_r1_checklist_template(&self) -> Result<Vec<PipeChecklistTemplateItem>> {
        match self.get_setting(PIPE_CHECKLIST_TEMPLATES_SETTING)? {
            Some(raw) if !raw.trim().is_empty() => Ok(parse_r1_template_from_json(&raw)),
            _ => Ok(default_r1_template_items()),
        }
    }

    pub fn get_or_create_pipe_r1_document_checklist(
        &self,
        pipe_id: i64,
    ) -> Result<PipeR1DocumentChecklist> {
        self.assert_affaire_pipe(pipe_id)?;

        if let Some(existing) = self.conn.query_row(
            "SELECT pipe_id, profile_salarie, profile_chef_entreprise, profile_retraite, items_json, updated_at
             FROM pipe_r1_document_checklists WHERE pipe_id = ?1",
            params![pipe_id],
            map_checklist_row,
        ).optional()? {
            return Ok(existing);
        }

        let now = now_unix();
        let items_json = items_to_json(&PipeR1ChecklistItems::default())?;
        self.conn.execute(
            "INSERT INTO pipe_r1_document_checklists
                (pipe_id, profile_salarie, profile_chef_entreprise, profile_retraite, items_json, updated_at)
             VALUES (?1, 0, 0, 0, ?2, ?3)",
            params![pipe_id, items_json, now],
        )?;

        self.conn.query_row(
            "SELECT pipe_id, profile_salarie, profile_chef_entreprise, profile_retraite, items_json, updated_at
             FROM pipe_r1_document_checklists WHERE pipe_id = ?1",
            params![pipe_id],
            map_checklist_row,
        )
    }

    pub fn update_pipe_r1_document_checklist(
        &self,
        pipe_id: i64,
        update: UpdatePipeR1DocumentChecklistInput,
    ) -> Result<PipeR1DocumentChecklist> {
        let (contact_id, secondary_contact_id) = self.assert_affaire_pipe(pipe_id)?;
        let mut current = self.get_or_create_pipe_r1_document_checklist(pipe_id)?;

        if let Some(salarie) = update.profile_salarie {
            current.profile_salarie = salarie;
            if salarie {
                current.profile_chef_entreprise = false;
            }
        }
        if let Some(chef) = update.profile_chef_entreprise {
            current.profile_chef_entreprise = chef;
            if chef {
                current.profile_salarie = false;
            }
        }
        if let Some(retraite) = update.profile_retraite {
            current.profile_retraite = retraite;
        }
        if let Some(items) = update.items {
            self.validate_checklist_items(&items, contact_id, secondary_contact_id)?;
            current.items = items;
        }

        let now = now_unix();
        let items_json = items_to_json(&current.items)?;
        let updated = self.conn.execute(
            "UPDATE pipe_r1_document_checklists
             SET profile_salarie = ?1,
                 profile_chef_entreprise = ?2,
                 profile_retraite = ?3,
                 items_json = ?4,
                 updated_at = ?5
             WHERE pipe_id = ?6",
            params![
                i64::from(current.profile_salarie),
                i64::from(current.profile_chef_entreprise),
                i64::from(current.profile_retraite),
                items_json,
                now,
                pipe_id,
            ],
        )?;
        if updated == 0 {
            return Err(rusqlite::Error::QueryReturnedNoRows);
        }

        self.get_or_create_pipe_r1_document_checklist(pipe_id)
    }

    fn get_pipe_r1_document_checklist_if_exists(
        &self,
        pipe_id: i64,
    ) -> Result<Option<PipeR1DocumentChecklist>> {
        self.conn
            .query_row(
                "SELECT pipe_id, profile_salarie, profile_chef_entreprise, profile_retraite, items_json, updated_at
                 FROM pipe_r1_document_checklists WHERE pipe_id = ?1",
                params![pipe_id],
                map_checklist_row,
            )
            .optional()
    }

    pub fn list_pipe_r1_missing_docs_summaries(&self) -> Result<Vec<PipeR1MissingDocsSummary>> {
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

        let template = self.load_r1_checklist_template()?;

        let mut summaries = Vec::new();
        for (pipe_id, parent_pipe_id, titre) in affaires {
            if is_versement_complementaire_affaire(PIPE_TYPE_AFFAIRE, parent_pipe_id, &titre) {
                continue;
            }
            let entries = entries_by_pipe
                .get(&pipe_id)
                .map(|items| items.as_slice())
                .unwrap_or(&[]);
            if !phase_has_rdv_activity_for_stage(entries, "R1") {
                continue;
            }
            let checklist = self
                .get_pipe_r1_document_checklist_if_exists(pipe_id)?
                .unwrap_or_else(|| default_pipe_r1_document_checklist(pipe_id));
            let missing_item_keys = missing_r1_item_keys(&checklist, &template);
            if !missing_item_keys.is_empty() {
                summaries.push(PipeR1MissingDocsSummary {
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
    use super::*;
    use crate::database::models::{NewContact, NewDocument, NewPipe, NewPipeTimelineEntry, UpdatePipeR1DocumentChecklistInput};
    use crate::database::pipe::PIPE_TYPE_AFFAIRE;
    use crate::database::pipe_timeline::TIMELINE_RDV;
    use crate::database::Database;

    #[test]
    fn pipe_r1_checklist_create_and_update_profiles() {
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
                stage: None,
                notes: None,
            })
            .unwrap();

        let checklist = db
            .get_or_create_pipe_r1_document_checklist(affaire.id)
            .unwrap();
        assert!(!checklist.profile_salarie);

        let updated = db
            .update_pipe_r1_document_checklist(
                affaire.id,
                UpdatePipeR1DocumentChecklistInput {
                    profile_salarie: Some(true),
                    profile_chef_entreprise: None,
                    profile_retraite: None,
                    items: None,
                },
            )
            .unwrap();
        assert!(updated.profile_salarie);
        assert!(!updated.profile_chef_entreprise);
    }

    #[test]
    fn pipe_r1_checklist_rejects_non_affaire() {
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

        let action = db
            .create_pipe(NewPipe {
                contact_id,
                secondary_contact_id: None,
                pipe_type: "ACTION".into(),
                parent_pipe_id: None,
                titre: "Appel".into(),
                stage: None,
                notes: None,
            })
            .unwrap();

        let err = db
            .get_or_create_pipe_r1_document_checklist(action.id)
            .unwrap_err()
            .to_string();
        assert!(err.contains("affaires"));
    }

    #[test]
    fn pipe_r1_checklist_document_must_belong_to_contact() {
        let db = Database::open_in_memory_for_tests().unwrap();
        let contact_a = db
            .create_contact(NewContact {
                nom: "A".into(),
                prenom: "Alice".into(),
                categorie: "CLIENT".into(),
                ..Default::default()
            })
            .unwrap()
            .id
            .expect("a");
        let contact_b = db
            .create_contact(NewContact {
                nom: "B".into(),
                prenom: "Bob".into(),
                categorie: "CLIENT".into(),
                ..Default::default()
            })
            .unwrap()
            .id
            .expect("b");

        let affaire = db
            .create_pipe(NewPipe {
                contact_id: contact_a,
                secondary_contact_id: None,
                pipe_type: PIPE_TYPE_AFFAIRE.into(),
                parent_pipe_id: None,
                titre: "Affaire A".into(),
                stage: None,
                notes: None,
            })
            .unwrap();

        let foreign_doc = db
            .create_document(NewDocument {
                contact_id: Some(contact_b),
                foyer_id: None,
                type_document: "FISCAL".into(),
                nom_fichier: "avis.pdf".into(),
                chemin_fichier: "/tmp/avis.pdf".into(),
                taille_fichier: 100,
                mime_type: Some("application/pdf".into()),
                date_document: None,
                notes: None,
                sensibilite_extra_financiere: None,
                experience_investissement: None,
            })
            .unwrap();

        let mut items = PipeR1ChecklistItems::new();
        items.insert(
            "avis_imposition".into(),
            PipeR1ChecklistItemState {
                received: true,
                document_id: Some(foreign_doc.id),
                no_credit: None,
            },
        );

        let err = db
            .update_pipe_r1_document_checklist(
                affaire.id,
                UpdatePipeR1DocumentChecklistInput {
                    profile_salarie: None,
                    profile_chef_entreprise: None,
                    profile_retraite: None,
                    items: Some(items),
                },
            )
            .unwrap_err()
            .to_string();
        assert!(err.contains("contact"));
    }

    #[test]
    fn list_pipe_r1_missing_docs_summaries_includes_affaire_with_r1_rdv() {
        let db = Database::open_in_memory_for_tests().unwrap();
        let contact_id = db
            .create_contact(NewContact {
                nom: "MARTIN".into(),
                prenom: "Paul".into(),
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
                titre: "Affaire Martin".into(),
                stage: None,
                notes: None,
            })
            .unwrap();

        db.create_pipe_timeline_entry(NewPipeTimelineEntry {
            pipe_id: affaire.id,
            entry_type: TIMELINE_RDV.into(),
            titre: Some("R1".into()),
            contenu: None,
            occurred_at: Some(1_700_000_000),
        })
        .unwrap();

        let summaries = db.list_pipe_r1_missing_docs_summaries().unwrap();
        assert_eq!(summaries.len(), 1);
        assert_eq!(summaries[0].pipe_id, affaire.id);
        assert!(summaries[0].missing_item_keys.len() >= 3);
    }

    #[test]
    fn list_pipe_r1_missing_docs_summaries_excludes_cancelled_r1() {
        let db = Database::open_in_memory_for_tests().unwrap();
        let contact_id = db
            .create_contact(NewContact {
                nom: "LEGRAND".into(),
                prenom: "Paul".into(),
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
                titre: "Affaire LEGRAND".into(),
                stage: None,
                notes: None,
            })
            .unwrap();

        db.create_pipe_timeline_entry(NewPipeTimelineEntry {
            pipe_id: affaire.id,
            entry_type: TIMELINE_NOTE.into(),
            titre: None,
            contenu: Some("RDV R1 annulé".into()),
            occurred_at: Some(1_700_000_100),
        })
        .unwrap();

        let summaries = db.list_pipe_r1_missing_docs_summaries().unwrap();
        assert!(summaries.is_empty());
    }

    #[test]
    fn list_pipe_r1_missing_docs_summaries_excludes_versement_complementaire() {
        let db = Database::open_in_memory_for_tests().unwrap();
        let contact_id = db
            .create_contact(NewContact {
                nom: "NOM1".into(),
                prenom: "Alice".into(),
                categorie: "CLIENT".into(),
                ..Default::default()
            })
            .unwrap()
            .id
            .expect("contact");

        let suivi = db
            .create_pipe(NewPipe {
                contact_id,
                secondary_contact_id: None,
                pipe_type: "ACTE_GESTION".into(),
                parent_pipe_id: None,
                titre: "Suivi".into(),
                stage: None,
                notes: None,
            })
            .unwrap();

        let versement = db
            .create_pipe(NewPipe {
                contact_id,
                secondary_contact_id: None,
                pipe_type: PIPE_TYPE_AFFAIRE.into(),
                parent_pipe_id: Some(suivi.id),
                titre: VERSEMENT_COMPLEMENTAIRE_ACT_LABEL.into(),
                stage: None,
                notes: None,
            })
            .unwrap();

        db.create_pipe_timeline_entry(NewPipeTimelineEntry {
            pipe_id: versement.id,
            entry_type: TIMELINE_RDV.into(),
            titre: Some("R1".into()),
            contenu: None,
            occurred_at: Some(1_700_000_200),
        })
        .unwrap();

        let summaries = db.list_pipe_r1_missing_docs_summaries().unwrap();
        assert!(summaries.is_empty());
    }
}
