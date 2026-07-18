//! Checklist documents R3 immobilier pour les affaires.

use rusqlite::{params, OptionalExtension, Result, Row};
use serde_json;

use super::models::{
    PipeR3ImmoDocumentChecklist, PipeR3ImmoChecklistItems, UpdatePipeR3ImmoDocumentChecklistInput,
};
use super::pipe::PIPE_TYPE_AFFAIRE;

fn parse_items_json(json: &str) -> PipeR3ImmoChecklistItems {
    serde_json::from_str(json).unwrap_or_default()
}

fn now_unix() -> i64 {
    chrono::Utc::now().timestamp()
}

fn bool_from_row(value: i64) -> bool {
    value != 0
}

fn map_checklist_row(row: &Row<'_>) -> Result<PipeR3ImmoDocumentChecklist> {
    Ok(PipeR3ImmoDocumentChecklist {
        pipe_id: row.get(0)?,
        profile_salarie: bool_from_row(row.get(1)?),
        profile_chef_entreprise: bool_from_row(row.get(2)?),
        emprunteur_personne_morale: bool_from_row(row.get(3)?),
        revenus_fonciers_hors_micro: bool_from_row(row.get(4)?),
        revenus_via_sci: bool_from_row(row.get(5)?),
        projet_vefa: bool_from_row(row.get(6)?),
        projet_ancien: bool_from_row(row.get(7)?),
        projet_scpi: bool_from_row(row.get(8)?),
        items: parse_items_json(&row.get::<_, String>(9)?),
        updated_at: row.get(10)?,
    })
}

fn items_to_json(items: &PipeR3ImmoChecklistItems) -> Result<String> {
    serde_json::to_string(items).map_err(|e| {
        rusqlite::Error::InvalidParameterName(format!("items_json invalide: {e}"))
    })
}

const SELECT_CHECKLIST: &str = "SELECT pipe_id, profile_salarie, profile_chef_entreprise,
    emprunteur_personne_morale, revenus_fonciers_hors_micro, revenus_via_sci,
    projet_vefa, projet_ancien, projet_scpi, items_json, updated_at";

impl super::Database {
    pub fn migrate_pipe_r3_immo_document_checklists_table(&self) -> Result<()> {
        self.conn.execute_batch(
            "
            CREATE TABLE IF NOT EXISTS pipe_r3_immo_document_checklists (
                pipe_id INTEGER PRIMARY KEY REFERENCES pipes(id) ON DELETE CASCADE,
                profile_salarie INTEGER NOT NULL DEFAULT 0,
                profile_chef_entreprise INTEGER NOT NULL DEFAULT 0,
                emprunteur_personne_morale INTEGER NOT NULL DEFAULT 0,
                revenus_fonciers_hors_micro INTEGER NOT NULL DEFAULT 0,
                revenus_via_sci INTEGER NOT NULL DEFAULT 0,
                projet_vefa INTEGER NOT NULL DEFAULT 0,
                projet_ancien INTEGER NOT NULL DEFAULT 0,
                projet_scpi INTEGER NOT NULL DEFAULT 0,
                items_json TEXT NOT NULL DEFAULT '{}',
                updated_at INTEGER NOT NULL
            );
            ",
        )?;
        Ok(())
    }

    fn assert_affaire_pipe_r3_immo(&self, pipe_id: i64) -> Result<(i64, Option<i64>)> {
        let pipe = self.get_pipe_by_id(pipe_id)?;
        if pipe.pipe_type != PIPE_TYPE_AFFAIRE {
            return Err(rusqlite::Error::InvalidParameterName(
                "checklist R3 immo réservée aux affaires".into(),
            ));
        }
        Ok((pipe.contact_id, pipe.secondary_contact_id))
    }

    fn validate_r3_immo_checklist_items(
        &self,
        items: &PipeR3ImmoChecklistItems,
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

    pub fn get_or_create_pipe_r3_immo_document_checklist(
        &self,
        pipe_id: i64,
    ) -> Result<PipeR3ImmoDocumentChecklist> {
        self.assert_affaire_pipe_r3_immo(pipe_id)?;

        if let Some(existing) = self
            .conn
            .query_row(
                &format!("{SELECT_CHECKLIST} FROM pipe_r3_immo_document_checklists WHERE pipe_id = ?1"),
                params![pipe_id],
                map_checklist_row,
            )
            .optional()?
        {
            return Ok(existing);
        }

        let now = now_unix();
        let items_json = items_to_json(&PipeR3ImmoChecklistItems::default())?;
        self.conn.execute(
            "INSERT INTO pipe_r3_immo_document_checklists (
                pipe_id, profile_salarie, profile_chef_entreprise,
                emprunteur_personne_morale, revenus_fonciers_hors_micro, revenus_via_sci,
                projet_vefa, projet_ancien, projet_scpi, items_json, updated_at
            ) VALUES (?1, 0, 0, 0, 0, 0, 0, 0, 0, ?2, ?3)",
            params![pipe_id, items_json, now],
        )?;

        self.conn.query_row(
            &format!("{SELECT_CHECKLIST} FROM pipe_r3_immo_document_checklists WHERE pipe_id = ?1"),
            params![pipe_id],
            map_checklist_row,
        )
    }

    pub fn update_pipe_r3_immo_document_checklist(
        &self,
        pipe_id: i64,
        update: UpdatePipeR3ImmoDocumentChecklistInput,
    ) -> Result<PipeR3ImmoDocumentChecklist> {
        let (contact_id, secondary_contact_id) = self.assert_affaire_pipe_r3_immo(pipe_id)?;
        let mut current = self.get_or_create_pipe_r3_immo_document_checklist(pipe_id)?;

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
        if let Some(v) = update.emprunteur_personne_morale {
            current.emprunteur_personne_morale = v;
        }
        if let Some(v) = update.revenus_fonciers_hors_micro {
            current.revenus_fonciers_hors_micro = v;
        }
        if let Some(v) = update.revenus_via_sci {
            current.revenus_via_sci = v;
        }
        if let Some(v) = update.projet_vefa {
            current.projet_vefa = v;
        }
        if let Some(v) = update.projet_ancien {
            current.projet_ancien = v;
        }
        if let Some(v) = update.projet_scpi {
            current.projet_scpi = v;
        }
        if let Some(items) = update.items {
            self.validate_r3_immo_checklist_items(&items, contact_id, secondary_contact_id)?;
            current.items = items;
        }

        let now = now_unix();
        let items_json = items_to_json(&current.items)?;
        let updated = self.conn.execute(
            "UPDATE pipe_r3_immo_document_checklists
             SET profile_salarie = ?1,
                 profile_chef_entreprise = ?2,
                 emprunteur_personne_morale = ?3,
                 revenus_fonciers_hors_micro = ?4,
                 revenus_via_sci = ?5,
                 projet_vefa = ?6,
                 projet_ancien = ?7,
                 projet_scpi = ?8,
                 items_json = ?9,
                 updated_at = ?10
             WHERE pipe_id = ?11",
            params![
                i64::from(current.profile_salarie),
                i64::from(current.profile_chef_entreprise),
                i64::from(current.emprunteur_personne_morale),
                i64::from(current.revenus_fonciers_hors_micro),
                i64::from(current.revenus_via_sci),
                i64::from(current.projet_vefa),
                i64::from(current.projet_ancien),
                i64::from(current.projet_scpi),
                items_json,
                now,
                pipe_id,
            ],
        )?;
        if updated == 0 {
            return Err(rusqlite::Error::QueryReturnedNoRows);
        }

        self.get_or_create_pipe_r3_immo_document_checklist(pipe_id)
    }
}

#[cfg(test)]
mod tests {
    use crate::database::models::{
        NewContact, NewDocument, NewPipe, PipeR3ImmoChecklistItemState, PipeR3ImmoChecklistItems,
        UpdatePipeR3ImmoDocumentChecklistInput,
    };
    use crate::database::pipe::PIPE_TYPE_AFFAIRE;
    use crate::database::Database;

    #[test]
    fn pipe_r3_immo_checklist_created_for_affaire() {
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
                titre: "Affaire immo".into(),
                stage: Some("R3".into()),
                notes: None,
            })
            .unwrap();

        let checklist = db
            .get_or_create_pipe_r3_immo_document_checklist(affaire.id)
            .unwrap();
        assert_eq!(checklist.pipe_id, affaire.id);
        assert!(!checklist.profile_salarie);
    }

    #[test]
    fn pipe_r3_immo_profile_salarie_clears_chef() {
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
                titre: "Affaire".into(),
                stage: Some("R3".into()),
                notes: None,
            })
            .unwrap();

        db.update_pipe_r3_immo_document_checklist(
            affaire.id,
            crate::database::models::UpdatePipeR3ImmoDocumentChecklistInput {
                profile_chef_entreprise: Some(true),
                ..Default::default()
            },
        )
        .unwrap();

        let updated = db
            .update_pipe_r3_immo_document_checklist(
                affaire.id,
                crate::database::models::UpdatePipeR3ImmoDocumentChecklistInput {
                    profile_salarie: Some(true),
                    ..Default::default()
                },
            )
            .unwrap();
        assert!(updated.profile_salarie);
        assert!(!updated.profile_chef_entreprise);
    }

    #[test]
    fn pipe_r3_immo_checklist_document_must_belong_to_contact() {
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

        let mut items = PipeR3ImmoChecklistItems::new();
        items.insert(
            "avis_imposition_salarie".into(),
            PipeR3ImmoChecklistItemState {
                received: true,
                document_id: Some(foreign_doc.id),
                no_credit: None,
            },
        );

        let err = db
            .update_pipe_r3_immo_document_checklist(
                affaire.id,
                UpdatePipeR3ImmoDocumentChecklistInput {
                    items: Some(items),
                    ..Default::default()
                },
            )
            .unwrap_err()
            .to_string();
        assert!(err.contains("contact"));
    }
}
