//! Champs personnalisés (définis par l'utilisateur) — modèle clé-valeur générique.
//!
//! Deux tables : `custom_field_defs` (les définitions) et `custom_field_values`
//! (les valeurs par entité). Aucune table par champ, aucun SQL dynamique : les
//! valeurs sont stockées en TEXT et typées à l'affichage via la définition.
//! Phase 1 : entité `contact`.

use super::models::{
    ContactCustomField, CustomFieldDef, CustomFieldValueInput, CustomFieldValueRow,
    NewCustomFieldDef, UpdateCustomFieldDef,
};
use rusqlite::{params, OptionalExtension, Result};

const ENTITY_CONTACT: &str = "contact";
const FIELD_TYPES: [&str; 5] = ["text", "number", "date", "boolean", "select"];

fn normalize_field_type(value: Option<&str>) -> String {
    match value {
        Some(v) if FIELD_TYPES.contains(&v) => v.to_string(),
        _ => "text".to_string(),
    }
}

/// Slug ASCII minuscule à partir d'un libellé (lettres/chiffres + `_`).
fn slugify_key(label: &str) -> String {
    let mut out = String::new();
    let mut prev_underscore = false;
    for ch in label.trim().to_lowercase().chars() {
        if ch.is_ascii_alphanumeric() {
            out.push(ch);
            prev_underscore = false;
        } else if !prev_underscore && !out.is_empty() {
            out.push('_');
            prev_underscore = true;
        }
    }
    let trimmed = out.trim_matches('_').to_string();
    if trimmed.is_empty() {
        "champ".to_string()
    } else {
        trimmed
    }
}

impl super::Database {
    fn map_custom_field_def(row: &rusqlite::Row<'_>) -> Result<CustomFieldDef> {
        Ok(CustomFieldDef {
            id: row.get(0)?,
            entity: row.get(1)?,
            field_key: row.get(2)?,
            label: row.get(3)?,
            field_type: row.get(4)?,
            options: row.get(5)?,
            position: row.get(6)?,
            actif: row.get::<_, i64>(7)? != 0,
            created_at: row.get(8)?,
            updated_at: row.get(9)?,
        })
    }

    /// Clé unique pour l'entité : ajoute un suffixe numérique en cas de collision.
    fn unique_field_key(&self, entity: &str, base: &str) -> Result<String> {
        let mut candidate = base.to_string();
        let mut suffix = 2;
        loop {
            let exists: i64 = self.conn.query_row(
                "SELECT COUNT(*) FROM custom_field_defs WHERE entity = ?1 AND field_key = ?2",
                params![entity, candidate],
                |row| row.get(0),
            )?;
            if exists == 0 {
                return Ok(candidate);
            }
            candidate = format!("{base}_{suffix}");
            suffix += 1;
        }
    }

    /// Définitions d'une entité (toutes, triées par position puis id).
    pub fn get_custom_field_defs(&self, entity: &str) -> Result<Vec<CustomFieldDef>> {
        let mut stmt = self.conn.prepare(
            "SELECT id, entity, field_key, label, field_type, options, position, actif,
                    created_at, updated_at
             FROM custom_field_defs
             WHERE entity = ?1
             ORDER BY position ASC, id ASC",
        )?;
        let rows = stmt.query_map(params![entity], Self::map_custom_field_def)?;
        rows.collect()
    }

    pub fn create_custom_field_def(&self, def: NewCustomFieldDef) -> Result<CustomFieldDef> {
        let label = def.label.trim();
        if label.is_empty() {
            return Err(rusqlite::Error::InvalidParameterName(
                "Le libellé du champ est obligatoire".to_string(),
            ));
        }
        let entity = def
            .entity
            .as_deref()
            .filter(|s| !s.trim().is_empty())
            .unwrap_or(ENTITY_CONTACT)
            .to_string();
        let field_type = normalize_field_type(def.field_type.as_deref());
        let field_key = self.unique_field_key(&entity, &slugify_key(label))?;
        let position = def.position.unwrap_or_else(|| self.next_field_position(&entity));
        let actif = if def.actif.unwrap_or(true) { 1 } else { 0 };

        self.conn.execute(
            "INSERT INTO custom_field_defs (entity, field_key, label, field_type, options, position, actif)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
            params![entity, field_key, label, field_type, def.options, position, actif],
        )?;
        self.get_custom_field_def_by_id(self.conn.last_insert_rowid())
    }

    fn next_field_position(&self, entity: &str) -> i64 {
        self.conn
            .query_row(
                "SELECT COALESCE(MAX(position), -1) + 1 FROM custom_field_defs WHERE entity = ?1",
                params![entity],
                |row| row.get(0),
            )
            .unwrap_or(0)
    }

    pub fn get_custom_field_def_by_id(&self, id: i64) -> Result<CustomFieldDef> {
        self.conn.query_row(
            "SELECT id, entity, field_key, label, field_type, options, position, actif,
                    created_at, updated_at
             FROM custom_field_defs WHERE id = ?1",
            params![id],
            Self::map_custom_field_def,
        )
    }

    pub fn update_custom_field_def(
        &self,
        id: i64,
        def: &UpdateCustomFieldDef,
    ) -> Result<CustomFieldDef> {
        let label = def.label.trim();
        if label.is_empty() {
            return Err(rusqlite::Error::InvalidParameterName(
                "Le libellé du champ est obligatoire".to_string(),
            ));
        }
        let current = self.get_custom_field_def_by_id(id)?;
        let field_type = normalize_field_type(def.field_type.as_deref());
        let position = def.position.unwrap_or(current.position);
        let actif = if def.actif.unwrap_or(current.actif) { 1 } else { 0 };

        self.conn.execute(
            "UPDATE custom_field_defs SET
                label = ?1,
                field_type = ?2,
                options = ?3,
                position = ?4,
                actif = ?5,
                updated_at = unixepoch()
             WHERE id = ?6",
            params![label, field_type, def.options, position, actif, id],
        )?;
        self.get_custom_field_def_by_id(id)
    }

    pub fn delete_custom_field_def(&self, id: i64) -> Result<()> {
        // ON DELETE CASCADE retire aussi les valeurs associées.
        self.conn
            .execute("DELETE FROM custom_field_defs WHERE id = ?1", params![id])?;
        Ok(())
    }

    /// Champs personnalisés d'un contact : définitions actives + valeur courante.
    pub fn get_contact_custom_fields(&self, contact_id: i64) -> Result<Vec<ContactCustomField>> {
        let mut stmt = self.conn.prepare(
            "SELECT d.id, d.field_key, d.label, d.field_type, d.options, d.position, v.value
             FROM custom_field_defs d
             LEFT JOIN custom_field_values v
                    ON v.def_id = d.id AND v.entity_id = ?1
             WHERE d.entity = 'contact' AND d.actif = 1
             ORDER BY d.position ASC, d.id ASC",
        )?;
        let rows = stmt.query_map(params![contact_id], |row| {
            Ok(ContactCustomField {
                def_id: row.get(0)?,
                field_key: row.get(1)?,
                label: row.get(2)?,
                field_type: row.get(3)?,
                options: row.get(4)?,
                position: row.get(5)?,
                value: row.get(6)?,
            })
        })?;
        rows.collect()
    }

    /// Enregistre en lot les valeurs d'un contact. Valeur vide → suppression de la ligne.
    pub fn set_contact_custom_fields(
        &self,
        contact_id: i64,
        values: Vec<CustomFieldValueInput>,
    ) -> Result<()> {
        for input in values {
            let clean = input
                .value
                .as_ref()
                .map(|v| v.trim().to_string())
                .filter(|v| !v.is_empty());
            match clean {
                Some(value) => {
                    self.conn.execute(
                        "INSERT INTO custom_field_values (def_id, entity_id, value)
                         VALUES (?1, ?2, ?3)
                         ON CONFLICT(def_id, entity_id) DO UPDATE SET
                            value = excluded.value,
                            updated_at = unixepoch()",
                        params![input.def_id, contact_id, value],
                    )?;
                }
                None => {
                    self.conn.execute(
                        "DELETE FROM custom_field_values WHERE def_id = ?1 AND entity_id = ?2",
                        params![input.def_id, contact_id],
                    )?;
                }
            }
        }
        Ok(())
    }

    /// Toutes les valeurs de champs perso actifs d'une entité (lecture en lot pour l'export).
    pub fn get_all_custom_values(&self, entity: &str) -> Result<Vec<CustomFieldValueRow>> {
        let mut stmt = self.conn.prepare(
            "SELECT d.field_key, v.entity_id, v.value
             FROM custom_field_values v
             JOIN custom_field_defs d ON d.id = v.def_id
             WHERE d.entity = ?1 AND d.actif = 1",
        )?;
        let rows = stmt.query_map(params![entity], |row| {
            Ok(CustomFieldValueRow {
                field_key: row.get(0)?,
                entity_id: row.get(1)?,
                value: row.get(2)?,
            })
        })?;
        rows.collect()
    }

    /// Valeur d'un champ personnalisé d'un contact, par clé technique.
    /// Utilisé par le moteur de règles (condition `CHAMP_PERSO`). `None` si absente.
    pub(crate) fn get_contact_custom_value_by_key(
        &self,
        contact_id: i64,
        field_key: &str,
    ) -> Result<Option<String>> {
        self.conn
            .query_row(
                "SELECT v.value
                 FROM custom_field_values v
                 JOIN custom_field_defs d ON d.id = v.def_id
                 WHERE d.entity = 'contact' AND d.field_key = ?1 AND v.entity_id = ?2",
                params![field_key, contact_id],
                |row| row.get::<_, Option<String>>(0),
            )
            .optional()
            .map(|opt| opt.flatten())
    }

    /// Valeur unique d'un champ pour un contact (utilitaire / tests).
    #[cfg(test)]
    fn get_contact_custom_field_value(
        &self,
        contact_id: i64,
        def_id: i64,
    ) -> Result<Option<String>> {
        self.conn
            .query_row(
                "SELECT value FROM custom_field_values WHERE def_id = ?1 AND entity_id = ?2",
                params![def_id, contact_id],
                |row| row.get(0),
            )
            .optional()
            .map(|opt| opt.flatten())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::database::models::NewContact;
    use crate::database::Database;

    fn mem_db() -> Database {
        Database::open_in_memory_for_tests().expect("db mémoire")
    }

    fn insert_contact(db: &Database) -> i64 {
        db.create_contact(NewContact {
            famille_id: None,
            foyer_id: None,
            role_foyer: None,
            role_famille: None,
            categorie: "CLIENT".to_string(),
            filleul_categorie: None,
            parrain_id: None,
            prescripteur_id: None,
            civilite: None,
            nom: "Test".to_string(),
            prenom: "Champ".to_string(),
            email: None,
            telephone: None,
            adresse: None,
            code_postal: None,
            ville: None,
            pays: None,
            date_naissance: None,
            lieu_naissance: None,
            profession: None,
            situation_familiale: None,
            regime_matrimonial: None,
            revenus_annuels: None,
            charges_emprunts: None,
            objectifs_patrimoniaux: None,
            source_lead: None,
            profil_risque_sri: None,
            date_dernier_contact: None,
            date_prochain_suivi: None,
            date_dernier_contact_filleul: None,
            date_prochain_suivi_filleul: None,
            statut_suivi: None,
            registre: None,
            notes: None,
            famille_regroupement_exclu: None,
            epargne_precaution_souhaitee: None,
        })
        .unwrap()
        .id
        .unwrap()
    }

    fn new_def(label: &str, field_type: &str) -> NewCustomFieldDef {
        NewCustomFieldDef {
            entity: None,
            label: label.to_string(),
            field_type: Some(field_type.to_string()),
            options: None,
            position: None,
            actif: None,
        }
    }

    #[test]
    fn slugify_handles_accents_and_spaces() {
        assert_eq!(slugify_key("  Numéro client  "), "num_ro_client");
        assert_eq!(slugify_key("RIB / IBAN"), "rib_iban");
        assert_eq!(slugify_key("???"), "champ");
    }

    #[test]
    fn create_defs_generate_unique_keys_and_positions() {
        let db = mem_db();
        let a = db.create_custom_field_def(new_def("Couleur préférée", "text")).unwrap();
        let b = db.create_custom_field_def(new_def("Couleur préférée", "select")).unwrap();
        assert_eq!(a.field_key, "couleur_pr_f_r_e");
        assert_eq!(b.field_key, "couleur_pr_f_r_e_2");
        assert_eq!(a.position, 0);
        assert_eq!(b.position, 1);
        assert!(a.actif);
    }

    #[test]
    fn unknown_field_type_falls_back_to_text() {
        let db = mem_db();
        let def = db.create_custom_field_def(new_def("Bizarre", "wat")).unwrap();
        assert_eq!(def.field_type, "text");
    }

    #[test]
    fn set_and_get_values_upsert_and_clear() {
        let db = mem_db();
        let def = db.create_custom_field_def(new_def("Numéro client", "text")).unwrap();
        let contact_id = 42;

        db.set_contact_custom_fields(
            contact_id,
            vec![CustomFieldValueInput {
                def_id: def.id,
                value: Some("  ABC123 ".to_string()),
            }],
        )
        .unwrap();
        assert_eq!(
            db.get_contact_custom_field_value(contact_id, def.id).unwrap(),
            Some("ABC123".to_string())
        );

        // Mise à jour
        db.set_contact_custom_fields(
            contact_id,
            vec![CustomFieldValueInput {
                def_id: def.id,
                value: Some("XYZ".to_string()),
            }],
        )
        .unwrap();
        assert_eq!(
            db.get_contact_custom_field_value(contact_id, def.id).unwrap(),
            Some("XYZ".to_string())
        );

        // Valeur vide → suppression
        db.set_contact_custom_fields(
            contact_id,
            vec![CustomFieldValueInput {
                def_id: def.id,
                value: Some("   ".to_string()),
            }],
        )
        .unwrap();
        assert_eq!(
            db.get_contact_custom_field_value(contact_id, def.id).unwrap(),
            None
        );
    }

    #[test]
    fn get_contact_fields_lists_active_defs_with_values() {
        let db = mem_db();
        let actif = db.create_custom_field_def(new_def("Hobby", "text")).unwrap();
        let inactif = db.create_custom_field_def(new_def("Ancien", "text")).unwrap();
        db.update_custom_field_def(
            inactif.id,
            &UpdateCustomFieldDef {
                label: "Ancien".to_string(),
                field_type: Some("text".to_string()),
                options: None,
                position: None,
                actif: Some(false),
            },
        )
        .unwrap();

        let contact_id = 7;
        db.set_contact_custom_fields(
            contact_id,
            vec![CustomFieldValueInput {
                def_id: actif.id,
                value: Some("Voile".to_string()),
            }],
        )
        .unwrap();

        let fields = db.get_contact_custom_fields(contact_id).unwrap();
        assert_eq!(fields.len(), 1);
        assert_eq!(fields[0].label, "Hobby");
        assert_eq!(fields[0].value.as_deref(), Some("Voile"));
    }

    #[test]
    fn rule_engine_matches_custom_field_condition() {
        let db = mem_db();
        let def = db.create_custom_field_def(new_def("Numéro client", "text")).unwrap();
        let cid = insert_contact(&db);

        let rule = |operator: &str, value: &str| {
            format!(
                r#"{{"v":1,"op":"and","children":[{{"type":"CHAMP_PERSO","config":{{"field_key":"{}","operator":"{}","value":"{}"}},"categories":["CLIENT"]}}]}}"#,
                def.field_key, operator, value
            )
        };

        // Sans valeur : "vide" vrai, "rempli" faux.
        assert!(db.evaluate_rule_tree_for_contact(cid, &rule("vide", "")).unwrap());
        assert!(!db.evaluate_rule_tree_for_contact(cid, &rule("rempli", "")).unwrap());

        db.set_contact_custom_fields(
            cid,
            vec![CustomFieldValueInput {
                def_id: def.id,
                value: Some("ABC123".to_string()),
            }],
        )
        .unwrap();

        assert!(db.evaluate_rule_tree_for_contact(cid, &rule("rempli", "")).unwrap());
        assert!(!db.evaluate_rule_tree_for_contact(cid, &rule("vide", "")).unwrap());
        // Comparaison insensible à la casse.
        assert!(db.evaluate_rule_tree_for_contact(cid, &rule("egal", "abc123")).unwrap());
        assert!(!db.evaluate_rule_tree_for_contact(cid, &rule("egal", "autre")).unwrap());
        assert!(db.evaluate_rule_tree_for_contact(cid, &rule("contient", "bc1")).unwrap());
        assert!(db.evaluate_rule_tree_for_contact(cid, &rule("different", "autre")).unwrap());
    }

    #[test]
    fn delete_def_cascades_values() {
        let db = mem_db();
        let def = db.create_custom_field_def(new_def("Temp", "text")).unwrap();
        db.set_contact_custom_fields(
            5,
            vec![CustomFieldValueInput {
                def_id: def.id,
                value: Some("v".to_string()),
            }],
        )
        .unwrap();
        db.delete_custom_field_def(def.id).unwrap();
        assert_eq!(db.get_custom_field_defs("contact").unwrap().len(), 0);
        assert_eq!(db.get_contact_custom_field_value(5, def.id).unwrap(), None);
    }
}
