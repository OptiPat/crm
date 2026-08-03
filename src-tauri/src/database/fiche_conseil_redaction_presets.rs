//! Bibliothèque de rédactions réutilisables pour fiches conseil arbitrage.

use rusqlite::{params, Result};

use super::models::{
    FicheConseilRedactionPreset, NewFicheConseilRedactionPreset, UpdateFicheConseilRedactionPreset,
};

const SELECT_COLS: &str =
    "id, nom, motif, supports_desinvestis, supports_investis, created_at, updated_at";

fn map_row(row: &rusqlite::Row<'_>) -> Result<FicheConseilRedactionPreset> {
    Ok(FicheConseilRedactionPreset {
        id: row.get(0)?,
        nom: row.get(1)?,
        motif: row.get(2)?,
        supports_desinvestis: row.get(3)?,
        supports_investis: row.get(4)?,
        created_at: row.get(5)?,
        updated_at: row.get(6)?,
    })
}

fn validate_preset_nom(nom: &str) -> Result<String, rusqlite::Error> {
    let nom = nom.trim();
    if nom.is_empty() {
        return Err(rusqlite::Error::InvalidParameterName("nom requis".into()));
    }
    Ok(nom.to_string())
}

fn validate_preset_motif(motif: &str) -> Result<String, rusqlite::Error> {
    let motif = motif.trim();
    if motif.is_empty() {
        return Err(rusqlite::Error::InvalidParameterName(
            "motif requis".into(),
        ));
    }
    Ok(motif.to_string())
}

impl super::Database {
    pub fn get_all_fiche_conseil_redaction_presets(
        &self,
    ) -> Result<Vec<FicheConseilRedactionPreset>> {
        let mut stmt = self.conn.prepare(&format!(
            "SELECT {SELECT_COLS}
             FROM fiche_conseil_redaction_presets
             ORDER BY nom COLLATE NOCASE"
        ))?;
        let rows = stmt.query_map([], map_row)?;
        rows.collect()
    }

    pub fn create_fiche_conseil_redaction_preset(
        &self,
        input: NewFicheConseilRedactionPreset,
    ) -> Result<FicheConseilRedactionPreset> {
        let nom = validate_preset_nom(&input.nom)?;
        let motif = validate_preset_motif(&input.motif)?;
        let now = chrono::Utc::now().timestamp();
        self.conn.execute(
            "INSERT INTO fiche_conseil_redaction_presets
                (nom, motif, supports_desinvestis, supports_investis, created_at, updated_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?5)",
            params![
                nom,
                motif,
                input.supports_desinvestis,
                input.supports_investis,
                now,
            ],
        )?;
        let id = self.conn.last_insert_rowid();
        self.get_fiche_conseil_redaction_preset_by_id(id)
    }

    pub fn update_fiche_conseil_redaction_preset(
        &self,
        id: i64,
        input: UpdateFicheConseilRedactionPreset,
    ) -> Result<FicheConseilRedactionPreset> {
        let nom = validate_preset_nom(&input.nom)?;
        let motif = validate_preset_motif(&input.motif)?;
        let now = chrono::Utc::now().timestamp();
        let updated = self.conn.execute(
            "UPDATE fiche_conseil_redaction_presets SET
                nom = ?2,
                motif = ?3,
                supports_desinvestis = ?4,
                supports_investis = ?5,
                updated_at = ?6
             WHERE id = ?1",
            params![
                id,
                nom,
                motif,
                input.supports_desinvestis,
                input.supports_investis,
                now,
            ],
        )?;
        if updated == 0 {
            return Err(rusqlite::Error::QueryReturnedNoRows);
        }
        self.get_fiche_conseil_redaction_preset_by_id(id)
    }

    pub fn delete_fiche_conseil_redaction_preset(&self, id: i64) -> Result<()> {
        let deleted = self
            .conn
            .execute("DELETE FROM fiche_conseil_redaction_presets WHERE id = ?1", params![id])?;
        if deleted == 0 {
            return Err(rusqlite::Error::QueryReturnedNoRows);
        }
        Ok(())
    }

    fn get_fiche_conseil_redaction_preset_by_id(
        &self,
        id: i64,
    ) -> Result<FicheConseilRedactionPreset> {
        self.conn.query_row(
            &format!("SELECT {SELECT_COLS} FROM fiche_conseil_redaction_presets WHERE id = ?1"),
            params![id],
            map_row,
        )
    }
}

#[cfg(test)]
mod tests {
    use super::super::Database;
    use super::super::models::NewFicheConseilRedactionPreset;

    fn mem_db() -> Database {
        Database::open_in_memory_for_tests().expect("db")
    }

    #[test]
    fn fiche_conseil_redaction_preset_crud() {
        let db = mem_db();
        let created = db
            .create_fiche_conseil_redaction_preset(NewFicheConseilRedactionPreset {
                nom: "Rééquilibrage".into(),
                motif: "Motif test".into(),
                supports_desinvestis: "UC A".into(),
                supports_investis: "UC B".into(),
            })
            .unwrap();
        assert_eq!(created.nom, "Rééquilibrage");

        let all = db.get_all_fiche_conseil_redaction_presets().unwrap();
        assert_eq!(all.len(), 1);

        let updated = db
            .update_fiche_conseil_redaction_preset(
                created.id,
                super::super::models::UpdateFicheConseilRedactionPreset {
                    nom: "Rééquilibrage v2".into(),
                    motif: "Motif v2".into(),
                    supports_desinvestis: "UC C".into(),
                    supports_investis: "UC D".into(),
                },
            )
            .unwrap();
        assert_eq!(updated.nom, "Rééquilibrage v2");

        db.delete_fiche_conseil_redaction_preset(created.id).unwrap();
        assert!(db.get_all_fiche_conseil_redaction_presets().unwrap().is_empty());
    }

    #[test]
    fn fiche_conseil_redaction_preset_rejects_empty_motif() {
        let db = mem_db();
        let err = db
            .create_fiche_conseil_redaction_preset(NewFicheConseilRedactionPreset {
                nom: "Sans motif".into(),
                motif: "   ".into(),
                supports_desinvestis: String::new(),
                supports_investis: String::new(),
            })
            .unwrap_err();
        assert!(err.to_string().contains("motif"));
    }
}
