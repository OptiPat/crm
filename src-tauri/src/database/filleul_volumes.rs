//! Historique des volumes réseau filleul par exercice fiscal (01/08 → 31/07).

use rusqlite::{params, Result};

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FilleulVolumeExercice {
    pub contact_id: i64,
    pub exercice_label: String,
    pub volume_propre: Option<f64>,
    pub volume_branche: Option<f64>,
    pub volume_manager: Option<f64>,
    pub closed_at: Option<i64>,
    pub source: String,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FilleulVolumeExerciceEntry {
    pub contact_id: i64,
    pub volume_propre: Option<f64>,
    pub volume_branche: Option<f64>,
    pub volume_manager: Option<f64>,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CloseFilleulExerciceInput {
    pub exercice_label: String,
    pub entries: Vec<FilleulVolumeExerciceEntry>,
    pub reset_own_volumes: bool,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FilleulVolumeExerciceImportEntry {
    pub contact_id: i64,
    pub exercice_label: String,
    #[serde(default)]
    pub volume_propre: Option<f64>,
    #[serde(default)]
    pub volume_branche: Option<f64>,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ImportFilleulVolumeExercicesInput {
    pub entries: Vec<FilleulVolumeExerciceImportEntry>,
    pub sync_current_contact_volumes: bool,
    pub current_exercice_label: Option<String>,
}

impl super::Database {
    pub fn migrate_filleul_volume_exercices_table(&self) -> Result<()> {
        self.conn.execute(
            "CREATE TABLE IF NOT EXISTS filleul_volume_exercices (
                contact_id INTEGER NOT NULL,
                exercice_label TEXT NOT NULL,
                volume_propre REAL,
                volume_branche REAL,
                volume_manager REAL,
                closed_at INTEGER,
                source TEXT NOT NULL DEFAULT 'cloture',
                created_at INTEGER NOT NULL DEFAULT (unixepoch()),
                PRIMARY KEY (contact_id, exercice_label),
                FOREIGN KEY (contact_id) REFERENCES contacts(id) ON DELETE CASCADE
            )",
            [],
        )?;
        self.conn.execute(
            "CREATE INDEX IF NOT EXISTS filleul_volume_exercices_label_idx
             ON filleul_volume_exercices (exercice_label)",
            [],
        )?;
        self.conn.execute(
            "CREATE INDEX IF NOT EXISTS filleul_volume_exercices_contact_idx
             ON filleul_volume_exercices (contact_id)",
            [],
        )?;
        Ok(())
    }

    pub fn list_filleul_volume_exercice_labels(&self) -> Result<Vec<String>> {
        let mut stmt = self.conn.prepare(
            "SELECT DISTINCT exercice_label
             FROM filleul_volume_exercices
             ORDER BY exercice_label DESC",
        )?;
        let rows = stmt.query_map([], |row| row.get::<_, String>(0))?;
        rows.collect()
    }

    pub fn get_filleul_volume_exercices_by_contact(
        &self,
        contact_id: i64,
    ) -> Result<Vec<FilleulVolumeExercice>> {
        let mut stmt = self.conn.prepare(
            "SELECT contact_id, exercice_label, volume_propre, volume_branche,
                    volume_manager, closed_at, source
             FROM filleul_volume_exercices
             WHERE contact_id = ?1
             ORDER BY exercice_label DESC",
        )?;
        let rows = stmt.query_map(params![contact_id], map_filleul_volume_exercice_row)?;
        rows.collect()
    }

    pub fn get_filleul_volume_exercices_by_label(
        &self,
        exercice_label: &str,
    ) -> Result<Vec<FilleulVolumeExercice>> {
        let mut stmt = self.conn.prepare(
            "SELECT contact_id, exercice_label, volume_propre, volume_branche,
                    volume_manager, closed_at, source
             FROM filleul_volume_exercices
             WHERE exercice_label = ?1
             ORDER BY contact_id ASC",
        )?;
        let rows = stmt.query_map(params![exercice_label], map_filleul_volume_exercice_row)?;
        rows.collect()
    }

    pub fn exercice_is_closed(&self, exercice_label: &str) -> Result<bool> {
        let count: i64 = self.conn.query_row(
            "SELECT COUNT(*) FROM filleul_volume_exercices
             WHERE exercice_label = ?1 AND closed_at IS NOT NULL",
            params![exercice_label],
            |row| row.get(0),
        )?;
        Ok(count > 0)
    }

    pub fn import_filleul_volume_exercices(
        &self,
        input: ImportFilleulVolumeExercicesInput,
    ) -> Result<usize> {
        if input.entries.is_empty() {
            return Ok(0);
        }

        self.begin_import_transaction()?;
        let import_result = (|| -> Result<usize> {
            let mut applied = 0usize;

            for entry in &input.entries {
                let label = entry.exercice_label.trim();
                if label.is_empty() {
                    continue;
                }
                if entry.volume_propre.is_none() && entry.volume_branche.is_none() {
                    continue;
                }
                self.conn.execute(
                    "INSERT INTO filleul_volume_exercices (
                        contact_id, exercice_label, volume_propre, volume_branche, source
                     ) VALUES (?1, ?2, ?3, ?4, 'import')
                     ON CONFLICT(contact_id, exercice_label) DO UPDATE SET
                        volume_propre = COALESCE(excluded.volume_propre, filleul_volume_exercices.volume_propre),
                        volume_branche = COALESCE(excluded.volume_branche, filleul_volume_exercices.volume_branche),
                        source = 'import'
                     WHERE filleul_volume_exercices.closed_at IS NULL",
                    params![
                        entry.contact_id,
                        label,
                        entry.volume_propre,
                        entry.volume_branche
                    ],
                )?;
                applied += self.conn.changes() as usize;

                if input.sync_current_contact_volumes {
                    if let Some(current_label) = input.current_exercice_label.as_deref() {
                        if current_label == label {
                            if let Some(volume_propre) = entry.volume_propre {
                                self.conn.execute(
                                    "UPDATE contacts SET filleul_volume = ?1 WHERE id = ?2",
                                    params![volume_propre, entry.contact_id],
                                )?;
                            }
                        }
                    }
                }
            }

            Ok(applied)
        })();

        match import_result {
            Ok(applied) => {
                self.commit_import_transaction()?;
                Ok(applied)
            }
            Err(error) => {
                let _ = self.rollback_import_transaction();
                Err(error)
            }
        }
    }

    pub fn close_filleul_exercice(&self, input: CloseFilleulExerciceInput) -> Result<()> {
        let label = input.exercice_label.trim();
        if label.is_empty() {
            return Err(rusqlite::Error::InvalidParameterName(
                "exercice_label vide".into(),
            ));
        }
        if self.exercice_is_closed(label)? {
            return Err(rusqlite::Error::InvalidParameterName(format!(
                "exercice déjà clôturé : {label}"
            )));
        }

        self.begin_import_transaction()?;
        let closed_at = chrono::Utc::now().timestamp();
        let close_result = (|| -> Result<()> {
            for entry in &input.entries {
                self.conn.execute(
                    "INSERT INTO filleul_volume_exercices (
                        contact_id, exercice_label, volume_propre, volume_branche,
                        volume_manager, closed_at, source
                     ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, 'cloture')
                     ON CONFLICT(contact_id, exercice_label) DO UPDATE SET
                        volume_propre = excluded.volume_propre,
                        volume_branche = excluded.volume_branche,
                        volume_manager = excluded.volume_manager,
                        closed_at = excluded.closed_at,
                        source = 'cloture'",
                    params![
                        entry.contact_id,
                        label,
                        entry.volume_propre,
                        entry.volume_branche,
                        entry.volume_manager,
                        closed_at,
                    ],
                )?;
            }

            if input.reset_own_volumes {
                self.conn.execute("UPDATE contacts SET filleul_volume = NULL", [])?;
            }

            Ok(())
        })();

        match close_result {
            Ok(()) => {
                self.commit_import_transaction()?;
                Ok(())
            }
            Err(error) => {
                let _ = self.rollback_import_transaction();
                Err(error)
            }
        }
    }
}

fn map_filleul_volume_exercice_row(row: &rusqlite::Row<'_>) -> Result<FilleulVolumeExercice> {
    Ok(FilleulVolumeExercice {
        contact_id: row.get(0)?,
        exercice_label: row.get(1)?,
        volume_propre: row.get(2)?,
        volume_branche: row.get(3)?,
        volume_manager: row.get(4)?,
        closed_at: row.get(5)?,
        source: row.get(6)?,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::database::models::NewContact;

    fn seed_contact(db: &super::super::Database, nom: &str, prenom: &str, volume: f64) -> i64 {
        let contact = db
            .create_contact(NewContact {
                nom: nom.to_string(),
                prenom: prenom.to_string(),
                categorie: "AUCUN".to_string(),
                filleul_categorie: Some("FILLEUL".to_string()),
                filleul_volume: Some(volume),
                ..Default::default()
            })
            .unwrap();
        contact.id.expect("contact id")
    }

    #[test]
    fn close_filleul_exercice_persists_snapshots_and_optional_reset() {
        let db = super::super::Database::open_in_memory_for_tests().unwrap();
        let id = seed_contact(&db, "DUPONT", "Jean", 120_000.0);

        db.close_filleul_exercice(CloseFilleulExerciceInput {
            exercice_label: "2024-2025".to_string(),
            entries: vec![FilleulVolumeExerciceEntry {
                contact_id: id,
                volume_propre: Some(120_000.0),
                volume_branche: Some(450_000.0),
                volume_manager: Some(800_000.0),
            }],
            reset_own_volumes: true,
        })
        .unwrap();

        let rows = db
            .get_filleul_volume_exercices_by_label("2024-2025")
            .unwrap();
        assert_eq!(rows.len(), 1);
        assert_eq!(rows[0].volume_propre, Some(120_000.0));
        assert_eq!(rows[0].volume_branche, Some(450_000.0));

        let reloaded = db.get_contact_by_id(id).unwrap();
        assert!(reloaded.filleul_volume.is_none());

        let err = db
            .close_filleul_exercice(CloseFilleulExerciceInput {
                exercice_label: "2024-2025".to_string(),
                entries: vec![],
                reset_own_volumes: false,
            })
            .unwrap_err();
        assert!(err.to_string().contains("déjà clôturé"));
    }

    #[test]
    fn import_filleul_volume_exercices_upserts_without_formal_closure() {
        let db = super::super::Database::open_in_memory_for_tests().unwrap();
        let id = seed_contact(&db, "DUPONT", "Jean", 10_000.0);

        let applied = db
            .import_filleul_volume_exercices(ImportFilleulVolumeExercicesInput {
                entries: vec![
                    FilleulVolumeExerciceImportEntry {
                        contact_id: id,
                        exercice_label: "2023-2024".to_string(),
                        volume_propre: Some(150_000.0),
                        volume_branche: None,
                    },
                    FilleulVolumeExerciceImportEntry {
                        contact_id: id,
                        exercice_label: "2024-2025".to_string(),
                        volume_propre: Some(220_000.0),
                        volume_branche: None,
                    },
                ],
                sync_current_contact_volumes: true,
                current_exercice_label: Some("2024-2025".to_string()),
            })
            .unwrap();
        assert_eq!(applied, 2);
        assert!(!db.exercice_is_closed("2023-2024").unwrap());

        let rows = db
            .get_filleul_volume_exercices_by_label("2023-2024")
            .unwrap();
        assert_eq!(rows[0].volume_propre, Some(150_000.0));
        assert_eq!(rows[0].source, "import");

        let reloaded = db.get_contact_by_id(id).unwrap();
        assert_eq!(reloaded.filleul_volume, Some(220_000.0));
    }

    #[test]
    fn close_filleul_exercice_upserts_after_import() {
        let db = super::super::Database::open_in_memory_for_tests().unwrap();
        let id = seed_contact(&db, "DUPONT", "Jean", 10_000.0);

        db.import_filleul_volume_exercices(ImportFilleulVolumeExercicesInput {
            entries: vec![FilleulVolumeExerciceImportEntry {
                contact_id: id,
                exercice_label: "2024-2025".to_string(),
                volume_propre: Some(150_000.0),
                volume_branche: None,
            }],
            sync_current_contact_volumes: false,
            current_exercice_label: None,
        })
        .unwrap();

        db.close_filleul_exercice(CloseFilleulExerciceInput {
            exercice_label: "2024-2025".to_string(),
            entries: vec![FilleulVolumeExerciceEntry {
                contact_id: id,
                volume_propre: Some(150_000.0),
                volume_branche: Some(420_000.0),
                volume_manager: Some(800_000.0),
            }],
            reset_own_volumes: false,
        })
        .unwrap();

        let rows = db
            .get_filleul_volume_exercices_by_label("2024-2025")
            .unwrap();
        assert_eq!(rows.len(), 1);
        assert_eq!(rows[0].volume_branche, Some(420_000.0));
        assert_eq!(rows[0].source, "cloture");
        assert!(rows[0].closed_at.is_some());
    }

    #[test]
    fn import_skips_formally_closed_rows() {
        let db = super::super::Database::open_in_memory_for_tests().unwrap();
        let id = seed_contact(&db, "DUPONT", "Jean", 10_000.0);

        db.close_filleul_exercice(CloseFilleulExerciceInput {
            exercice_label: "2023-2024".to_string(),
            entries: vec![FilleulVolumeExerciceEntry {
                contact_id: id,
                volume_propre: Some(100_000.0),
                volume_branche: Some(300_000.0),
                volume_manager: Some(500_000.0),
            }],
            reset_own_volumes: false,
        })
        .unwrap();

        let applied = db
            .import_filleul_volume_exercices(ImportFilleulVolumeExercicesInput {
                entries: vec![FilleulVolumeExerciceImportEntry {
                    contact_id: id,
                    exercice_label: "2023-2024".to_string(),
                    volume_propre: Some(999_000.0),
                    volume_branche: None,
                }],
                sync_current_contact_volumes: false,
                current_exercice_label: None,
            })
            .unwrap();
        assert_eq!(applied, 0);

        let rows = db
            .get_filleul_volume_exercices_by_label("2023-2024")
            .unwrap();
        assert_eq!(rows[0].volume_propre, Some(100_000.0));
    }

    #[test]
    fn get_filleul_volume_exercices_by_contact_orders_desc() {
        let db = super::super::Database::open_in_memory_for_tests().unwrap();
        let id = seed_contact(&db, "DUPONT", "Jean", 50_000.0);

        db.import_filleul_volume_exercices(ImportFilleulVolumeExercicesInput {
            entries: vec![
                FilleulVolumeExerciceImportEntry {
                    contact_id: id,
                    exercice_label: "2022-2023".to_string(),
                    volume_propre: Some(80_000.0),
                    volume_branche: None,
                },
                FilleulVolumeExerciceImportEntry {
                    contact_id: id,
                    exercice_label: "2024-2025".to_string(),
                    volume_propre: Some(120_000.0),
                    volume_branche: None,
                },
            ],
            sync_current_contact_volumes: false,
            current_exercice_label: None,
        })
        .unwrap();

        let rows = db.get_filleul_volume_exercices_by_contact(id).unwrap();
        assert_eq!(rows.len(), 2);
        assert_eq!(rows[0].exercice_label, "2024-2025");
        assert_eq!(rows[1].exercice_label, "2022-2023");
    }

    #[test]
    fn import_filleul_volume_exercices_merges_propre_and_branche() {
        let db = super::super::Database::open_in_memory_for_tests().unwrap();
        let id = seed_contact(&db, "DUPONT", "Jean", 10_000.0);

        db.import_filleul_volume_exercices(ImportFilleulVolumeExercicesInput {
            entries: vec![FilleulVolumeExerciceImportEntry {
                contact_id: id,
                exercice_label: "2023-2024".to_string(),
                volume_propre: Some(150_000.0),
                volume_branche: None,
            }],
            sync_current_contact_volumes: false,
            current_exercice_label: None,
        })
        .unwrap();

        let applied = db
            .import_filleul_volume_exercices(ImportFilleulVolumeExercicesInput {
                entries: vec![FilleulVolumeExerciceImportEntry {
                    contact_id: id,
                    exercice_label: "2023-2024".to_string(),
                    volume_propre: None,
                    volume_branche: Some(600_000.0),
                }],
                sync_current_contact_volumes: false,
                current_exercice_label: None,
            })
            .unwrap();
        assert_eq!(applied, 1);

        let rows = db
            .get_filleul_volume_exercices_by_label("2023-2024")
            .unwrap();
        assert_eq!(rows[0].volume_propre, Some(150_000.0));
        assert_eq!(rows[0].volume_branche, Some(600_000.0));
    }
}
