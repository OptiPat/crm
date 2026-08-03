//! Bibliothèque de rédactions réutilisables pour fiches conseil arbitrage.

use rusqlite::{params, Result};

use super::models::{
    FicheConseilRedactionPreset, NewFicheConseilRedactionPreset, UpdateFicheConseilRedactionPreset,
};

const SELECT_COLS: &str = "id, nom, product_kind, motif, supports_desinvestis, supports_investis, allocation_operation, created_at, updated_at";

fn map_row(row: &rusqlite::Row<'_>) -> Result<FicheConseilRedactionPreset> {
    Ok(FicheConseilRedactionPreset {
        id: row.get(0)?,
        nom: row.get(1)?,
        product_kind: row.get(2)?,
        motif: row.get(3)?,
        supports_desinvestis: row.get(4)?,
        supports_investis: row.get(5)?,
        allocation_operation: row.get(6)?,
        created_at: row.get(7)?,
        updated_at: row.get(8)?,
    })
}

fn validate_preset_nom(nom: &str) -> Result<String, rusqlite::Error> {
    let nom = nom.trim();
    if nom.is_empty() {
        return Err(rusqlite::Error::InvalidParameterName("nom requis".into()));
    }
    Ok(nom.to_string())
}

fn validate_product_kind(product_kind: &str) -> Result<String, rusqlite::Error> {
    match product_kind.trim().to_ascii_uppercase().as_str() {
        "AV" | "PER" => Ok(product_kind.trim().to_ascii_uppercase()),
        _ => Err(rusqlite::Error::InvalidParameterName(
            "product_kind invalide (AV ou PER)".into(),
        )),
    }
}

fn validate_preset_content(
    product_kind: &str,
    motif: &str,
    allocation_operation: &str,
) -> Result<(String, String), rusqlite::Error> {
    match product_kind {
        "AV" => {
            let motif = motif.trim();
            if motif.is_empty() {
                return Err(rusqlite::Error::InvalidParameterName(
                    "motif requis".into(),
                ));
            }
            Ok((motif.to_string(), String::new()))
        }
        "PER" => {
            let allocation = allocation_operation.trim();
            if allocation.is_empty() {
                return Err(rusqlite::Error::InvalidParameterName(
                    "allocation_operation requise".into(),
                ));
            }
            Ok((String::new(), allocation.to_string()))
        }
        _ => Err(rusqlite::Error::InvalidParameterName(
            "product_kind invalide".into(),
        )),
    }
}

fn map_preset_db_error(err: rusqlite::Error) -> rusqlite::Error {
    let message = err.to_string();
    if message.contains("UNIQUE constraint failed") && message.contains("fiche_conseil_redaction_presets") {
        return rusqlite::Error::InvalidParameterName(
            "Un texte avec ce nom existe déjà pour ce produit (AV ou PER).".into(),
        );
    }
    err
}

impl super::Database {
    pub fn get_all_fiche_conseil_redaction_presets(
        &self,
    ) -> Result<Vec<FicheConseilRedactionPreset>> {
        let mut stmt = self.conn.prepare(&format!(
            "SELECT {SELECT_COLS}
             FROM fiche_conseil_redaction_presets
             ORDER BY product_kind, nom COLLATE NOCASE"
        ))?;
        let rows = stmt.query_map([], map_row)?;
        rows.collect()
    }

    pub fn create_fiche_conseil_redaction_preset(
        &self,
        input: NewFicheConseilRedactionPreset,
    ) -> Result<FicheConseilRedactionPreset> {
        let nom = validate_preset_nom(&input.nom)?;
        let product_kind = validate_product_kind(&input.product_kind)?;
        let (motif, allocation_operation) =
            validate_preset_content(&product_kind, &input.motif, &input.allocation_operation)?;
        let now = chrono::Utc::now().timestamp();
        self.conn
            .execute(
                "INSERT INTO fiche_conseil_redaction_presets
                (nom, product_kind, motif, supports_desinvestis, supports_investis, allocation_operation, created_at, updated_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?7)",
                params![
                    nom,
                    product_kind,
                    motif,
                    input.supports_desinvestis,
                    input.supports_investis,
                    allocation_operation,
                    now,
                ],
            )
            .map_err(map_preset_db_error)?;
        let id = self.conn.last_insert_rowid();
        self.get_fiche_conseil_redaction_preset_by_id(id)
    }

    pub fn update_fiche_conseil_redaction_preset(
        &self,
        id: i64,
        input: UpdateFicheConseilRedactionPreset,
    ) -> Result<FicheConseilRedactionPreset> {
        let nom = validate_preset_nom(&input.nom)?;
        let product_kind = validate_product_kind(&input.product_kind)?;
        let (motif, allocation_operation) =
            validate_preset_content(&product_kind, &input.motif, &input.allocation_operation)?;
        let now = chrono::Utc::now().timestamp();
        let updated = self
            .conn
            .execute(
                "UPDATE fiche_conseil_redaction_presets SET
                nom = ?2,
                product_kind = ?3,
                motif = ?4,
                supports_desinvestis = ?5,
                supports_investis = ?6,
                allocation_operation = ?7,
                updated_at = ?8
             WHERE id = ?1",
                params![
                    id,
                    nom,
                    product_kind,
                    motif,
                    input.supports_desinvestis,
                    input.supports_investis,
                    allocation_operation,
                    now,
                ],
            )
            .map_err(map_preset_db_error)?;
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
    fn fiche_conseil_redaction_preset_crud_av() {
        let db = mem_db();
        let created = db
            .create_fiche_conseil_redaction_preset(NewFicheConseilRedactionPreset {
                nom: "Rééquilibrage".into(),
                product_kind: "AV".into(),
                motif: "Motif test".into(),
                supports_desinvestis: "UC A".into(),
                supports_investis: "UC B".into(),
                allocation_operation: String::new(),
            })
            .unwrap();
        assert_eq!(created.nom, "Rééquilibrage");
        assert_eq!(created.product_kind, "AV");

        db.delete_fiche_conseil_redaction_preset(created.id).unwrap();
    }

    #[test]
    fn fiche_conseil_redaction_preset_crud_per() {
        let db = mem_db();
        let created = db
            .create_fiche_conseil_redaction_preset(NewFicheConseilRedactionPreset {
                nom: "Arbitrage PER".into(),
                product_kind: "PER".into(),
                motif: String::new(),
                supports_desinvestis: String::new(),
                supports_investis: String::new(),
                allocation_operation: "Arbitrage 50 % UC obligataire vers UC actions.".into(),
            })
            .unwrap();
        assert_eq!(created.product_kind, "PER");
        assert!(created.allocation_operation.contains("UC obligataire"));

        db.delete_fiche_conseil_redaction_preset(created.id).unwrap();
    }

    #[test]
    fn fiche_conseil_redaction_preset_rejects_empty_motif_av() {
        let db = mem_db();
        let err = db
            .create_fiche_conseil_redaction_preset(NewFicheConseilRedactionPreset {
                nom: "Sans motif".into(),
                product_kind: "AV".into(),
                motif: "   ".into(),
                supports_desinvestis: String::new(),
                supports_investis: String::new(),
                allocation_operation: String::new(),
            })
            .unwrap_err();
        assert!(err.to_string().contains("motif"));
    }

    #[test]
    fn fiche_conseil_redaction_preset_rejects_empty_allocation_per() {
        let db = mem_db();
        let err = db
            .create_fiche_conseil_redaction_preset(NewFicheConseilRedactionPreset {
                nom: "Sans allocation".into(),
                product_kind: "PER".into(),
                motif: String::new(),
                supports_desinvestis: String::new(),
                supports_investis: String::new(),
                allocation_operation: "  ".into(),
            })
            .unwrap_err();
        assert!(err.to_string().contains("allocation"));
    }

    #[test]
    fn fiche_conseil_redaction_preset_same_nom_av_and_per() {
        let db = mem_db();
        db.create_fiche_conseil_redaction_preset(NewFicheConseilRedactionPreset {
            nom: "Rééquilibrage".into(),
            product_kind: "AV".into(),
            motif: "Motif AV".into(),
            supports_desinvestis: String::new(),
            supports_investis: String::new(),
            allocation_operation: String::new(),
        })
        .unwrap();
        let per = db
            .create_fiche_conseil_redaction_preset(NewFicheConseilRedactionPreset {
                nom: "Rééquilibrage".into(),
                product_kind: "PER".into(),
                motif: String::new(),
                supports_desinvestis: String::new(),
                supports_investis: String::new(),
                allocation_operation: "Arbitrage PER".into(),
            })
            .unwrap();
        assert_eq!(per.product_kind, "PER");
    }
}
