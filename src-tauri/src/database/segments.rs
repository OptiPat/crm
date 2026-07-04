//! Segments réutilisables + liaison alertes ↔ segments.

use super::models::{NewSegment, Segment, SegmentWithCount};
use super::etiquette_rule_ast::parse_rule_json;
use rusqlite::{params, OptionalExtension, Result};

impl super::Database {
    pub fn segments_table_exists(&self) -> bool {
        self.conn
            .query_row(
                "SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name='segments'",
                [],
                |row| row.get::<_, i64>(0),
            )
            .unwrap_or(0)
            > 0
    }

    fn map_segment_row(row: &rusqlite::Row<'_>) -> rusqlite::Result<Segment> {
        Ok(Segment {
            id: row.get(0)?,
            nom: row.get(1)?,
            description: row.get(2)?,
            rule_json: row.get(3)?,
            actif: row.get::<_, i64>(4)? != 0,
            is_system: row.get::<_, i64>(5)? != 0,
            created_at: row.get(6)?,
            updated_at: row.get(7)?,
        })
    }

    pub fn get_all_segments(&self) -> Result<Vec<Segment>> {
        if !self.segments_table_exists() {
            return Ok(vec![]);
        }
        let mut stmt = self.conn.prepare(
            "SELECT id, nom, description, rule_json, actif, is_system, created_at, updated_at
             FROM segments ORDER BY nom ASC",
        )?;
        let rows = stmt.query_map([], Self::map_segment_row)?;
        let mut out = Vec::new();
        for row in rows {
            out.push(row?);
        }
        Ok(out)
    }

    pub fn get_all_segments_with_count(&self) -> Result<Vec<SegmentWithCount>> {
        let segments = self.get_all_segments()?;
        let mut out = Vec::with_capacity(segments.len());
        for s in segments {
            let contact_count = self.count_contacts_for_segment(s.id)?;
            out.push(SegmentWithCount {
                id: s.id,
                nom: s.nom,
                description: s.description,
                rule_json: s.rule_json,
                actif: s.actif,
                is_system: s.is_system,
                created_at: s.created_at,
                updated_at: s.updated_at,
                contact_count,
            });
        }
        Ok(out)
    }

    pub fn get_segment_by_id(&self, id: i64) -> Result<Option<Segment>> {
        if !self.segments_table_exists() {
            return Ok(None);
        }
        self.conn
            .query_row(
                "SELECT id, nom, description, rule_json, actif, is_system, created_at, updated_at
                 FROM segments WHERE id = ?1",
                params![id],
                Self::map_segment_row,
            )
            .optional()
    }

    fn validate_segment_rule(rule_json: &str) -> Result<()> {
        parse_rule_json(Some(&rule_json.to_string()), None, None, None)?;
        Ok(())
    }

    pub fn create_segment(&self, input: NewSegment) -> Result<Segment> {
        if input.nom.trim().is_empty() {
            return Err(rusqlite::Error::InvalidParameterName(
                "Le nom du segment est obligatoire".to_string(),
            ));
        }
        Self::validate_segment_rule(&input.rule_json)?;
        let actif = if input.actif.unwrap_or(true) { 1 } else { 0 };
        self.conn.execute(
            "INSERT INTO segments (nom, description, rule_json, actif, is_system)
             VALUES (?1, ?2, ?3, ?4, 0)",
            params![input.nom.trim(), input.description, input.rule_json, actif],
        )?;
        let id = self.conn.last_insert_rowid();
        Ok(self.get_segment_by_id(id)?.unwrap())
    }

    pub fn update_segment(&self, id: i64, input: &NewSegment) -> Result<Segment> {
        if input.nom.trim().is_empty() {
            return Err(rusqlite::Error::InvalidParameterName(
                "Le nom du segment est obligatoire".to_string(),
            ));
        }
        Self::validate_segment_rule(&input.rule_json)?;
        let actif = if input.actif.unwrap_or(true) { 1 } else { 0 };
        self.conn.execute(
            "UPDATE segments SET nom = ?1, description = ?2, rule_json = ?3, actif = ?4,
             updated_at = unixepoch() WHERE id = ?5",
            params![input.nom.trim(), input.description, input.rule_json, actif, id],
        )?;
        if actif == 0 {
            self.close_suivi_alertes_for_inactive_segment(id)?;
        }
        Ok(self.get_segment_by_id(id)?.unwrap())
    }

    pub fn delete_segment(&self, id: i64) -> Result<()> {
        let is_system: i64 = self.conn.query_row(
            "SELECT is_system FROM segments WHERE id = ?1",
            params![id],
            |row| row.get(0),
        )?;
        if is_system != 0 {
            return Err(rusqlite::Error::InvalidParameterName(
                "Les segments système ne peuvent pas être supprimés".to_string(),
            ));
        }
        self.conn
            .execute("UPDATE etiquettes SET segment_id = NULL WHERE segment_id = ?1", params![id])?;
        self.conn
            .execute("DELETE FROM alerte_segment_links WHERE segment_id = ?1", params![id])?;
        self.conn.execute("DELETE FROM segments WHERE id = ?1", params![id])?;
        Ok(())
    }

    pub fn ensure_default_segments_and_alerte_links(&self) -> Result<()> {
        if !self.segments_table_exists() {
            return Ok(());
        }
        let defs: &[(&str, &str, &str)] = &[
            (
                "Suivi client > 1 an",
                r#"{"v":1,"op":"and","children":[{"type":"DELAI_SANS_CONTACT","config":{"jours":365,"inclure_sans_date":false},"categories":["CLIENT"]}]}"#,
                "SUIVI_CLIENT_1AN",
            ),
            (
                "Client jamais suivi",
                r#"{"v":1,"op":"and","children":[{"type":"JAMAIS_CONTACT","config":{},"categories":["CLIENT"]}]}"#,
                "CLIENT_JAMAIS_SUIVI",
            ),
            (
                "Lead client > 6 mois",
                r#"{"v":1,"op":"and","children":[{"type":"DELAI_SANS_CONTACT","config":{"jours":180,"inclure_sans_date":false},"categories":["SUSPECT_CLIENT","PROSPECT_CLIENT"]}]}"#,
                "LEAD_SUIVI_6MOIS",
            ),
            (
                "Lead jamais contacté",
                r#"{"v":1,"op":"and","children":[{"type":"JAMAIS_CONTACT","config":{},"categories":["SUSPECT_CLIENT","PROSPECT_CLIENT"]}]}"#,
                "LEAD_JAMAIS_CONTACTE",
            ),
            (
                "Filleul > 1 an",
                r#"{"v":1,"op":"and","children":[{"type":"DELAI_SANS_CONTACT","config":{"jours":365,"inclure_sans_date":false},"categories":["FILLEUL"]}]}"#,
                "SUIVI_FILLEUL_1AN",
            ),
            (
                "Filleul prospect > 6 mois",
                r#"{"v":1,"op":"and","children":[{"type":"DELAI_SANS_CONTACT","config":{"jours":180,"inclure_sans_date":false},"categories":["PROSPECT_FILLEUL","SUSPECT_FILLEUL"]}]}"#,
                "FILLEUL_SUIVI_6MOIS",
            ),
            (
                "Filleul jamais contacté",
                r#"{"v":1,"op":"and","children":[{"type":"JAMAIS_CONTACT","config":{},"categories":["PROSPECT_FILLEUL","SUSPECT_FILLEUL"]}]}"#,
                "FILLEUL_JAMAIS_CONTACTE",
            ),
            (
                "Prospect / suspect > 6 mois",
                r#"{"v":1,"op":"and","children":[{"type":"DELAI_SANS_CONTACT","config":{"jours":180,"inclure_sans_date":false},"categories":["PROSPECT_CLIENT","PROSPECT_FILLEUL","SUSPECT_CLIENT","SUSPECT_FILLEUL"]}]}"#,
                "LEAD_SUIVI_6MOIS",
            ),
            (
                "Fin démembrement",
                r#"{"v":1,"op":"and","children":[{"type":"DATE_APPROCHE_INVESTISSEMENT","config":{"champ":"date_fin_demembrement","jours_avant":180,"types_produit":["SCPI_DEMEMBREMENT"]},"categories":["CLIENT"]}]}"#,
                "",
            ),
            (
                "Fin de prêt",
                r#"{"v":1,"op":"and","children":[{"type":"DATE_APPROCHE_INVESTISSEMENT","config":{"champ":"date_fin_pret","jours_avant":365,"types_produit":["SCPI","SCPI_FISCALE","SCPI_DEMEMBREMENT","IMMOBILIER","PINEL","DENORMANDIE","JEANBRUN","MALRAUX","MONUMENT_HISTORIQUE","DEFICIT_FONCIER","LMNP","LMP","NUE_PROPRIETE","RESIDENCE_PRINCIPALE","LOCATIF_CLASSIQUE"]},"categories":["CLIENT"]}]}"#,
                "",
            ),
            (
                "Alerte 69 ans",
                r#"{"v":1,"op":"and","children":[{"type":"AGE_APPROCHE","config":{"age":69,"jours_avant":30},"categories":["CLIENT"]}]}"#,
                "",
            ),
            (
                "Déclaration IR",
                r#"{"v":1,"op":"and","children":[{"type":"PERIODE_ANNEE","config":{"mois_debut":4,"mois_fin":5},"categories":["CLIENT"]}]}"#,
                "",
            ),
            (
                "Réduction d'impôt fin d'année",
                r#"{"v":1,"op":"and","children":[{"type":"PERIODE_ANNEE","config":{"mois_debut":10,"mois_fin":11},"categories":["CLIENT","PROSPECT_CLIENT"]}]}"#,
                "",
            ),
            (
                "Suivi à planifier",
                r#"{"v":1,"op":"and","children":[{"type":"DATE_APPROCHE","config":{"champ":"date_prochain_suivi","jours_avant":30},"categories":["CLIENT","PROSPECT_CLIENT"]}]}"#,
                "",
            ),
        ];
        for (nom, rule, type_alerte) in defs {
            let existing: Option<i64> = self
                .conn
                .query_row(
                    "SELECT id FROM segments WHERE LOWER(TRIM(nom)) = LOWER(TRIM(?1))",
                    params![nom],
                    |row| row.get(0),
                )
                .optional()?;
            let segment_id = if let Some(id) = existing {
                id
            } else {
                self.conn.execute(
                    "INSERT INTO segments (nom, description, rule_json, actif, is_system)
                     VALUES (?1, NULL, ?2, 1, 1)",
                    params![nom, rule],
                )?;
                self.conn.last_insert_rowid()
            };
            if !type_alerte.is_empty() {
                self.conn.execute(
                    "INSERT OR IGNORE INTO alerte_segment_links (type_alerte, segment_id)
                     VALUES (?1, ?2)",
                    params![type_alerte, segment_id],
                )?;
            }
        }
        self.ensure_link_default_etiquettes_to_segments()?;
        Ok(())
    }

    /// Associe les étiquettes seed / par nom aux segments système (une source de vérité).
    pub fn ensure_link_default_etiquettes_to_segments(&self) -> Result<()> {
        if !self.segments_table_exists() {
            return Ok(());
        }
        let pairs: &[(&str, &str)] = &[
            ("Suivi > 1 an", "Suivi client > 1 an"),
            ("Jamais suivi", "Client jamais suivi"),
            ("Suivi > 6 mois", "Prospect / suspect > 6 mois"),
            ("Fin démembrement", "Fin démembrement"),
            ("Fin de prêt", "Fin de prêt"),
            ("Alerte 69 ans", "Alerte 69 ans"),
            ("Déclaration IR", "Déclaration IR"),
            ("Réduction d'impôt fin d'année", "Réduction d'impôt fin d'année"),
            ("Suivi à planifier", "Suivi à planifier"),
        ];
        for (etiquette_nom, segment_nom) in pairs {
            let seg_id: Option<i64> = self
                .conn
                .query_row(
                    "SELECT id FROM segments WHERE LOWER(TRIM(nom)) = LOWER(TRIM(?1))",
                    params![segment_nom],
                    |row| row.get(0),
                )
                .optional()?;
            let Some(seg_id) = seg_id else {
                continue;
            };
            self.conn.execute(
                "UPDATE etiquettes SET segment_id = ?1 WHERE LOWER(TRIM(nom)) = LOWER(TRIM(?2)) AND (segment_id IS NULL OR segment_id != ?1)",
                params![seg_id, etiquette_nom],
            )?;
        }
        Ok(())
    }

    /// Recalcule les étiquettes actives liées à ce segment.
    pub fn sync_auto_etiquettes_after_segment_update(&self, segment_id: i64) -> Result<usize> {
        let mut stmt = self
            .conn
            .prepare("SELECT id FROM etiquettes WHERE segment_id = ?1 AND actif = 1")?;
        let ids: Vec<i64> = stmt
            .query_map(params![segment_id], |row| row.get(0))?
            .collect::<Result<Vec<_>, _>>()?;
        let mut total = 0;
        for id in ids {
            total += self.check_auto_etiquettes_for_etiquette(id)?;
        }
        Ok(total)
    }

    pub fn count_contacts_for_rule_json(&self, rule_json: &str) -> Result<i64> {
        let tree = super::etiquette_rule_ast::parse_rule_json(
            Some(&rule_json.to_string()),
            None,
            None,
            None,
        )?;
        let contacts = self.get_all_contacts()?;
        let (now, current_month) = super::Database::auto_etiquette_now_and_month();
        let org_self_id = self.resolve_organisation_self_contact_id()?;
        let mut n = 0i64;
        for c in &contacts {
            if c.statut_suivi == "ARCHIVE" || c.statut_suivi == "EN_PAUSE" {
                continue;
            }
            if self.contact_matches_rule_tree(c, &tree, now, current_month, org_self_id)? {
                n += 1;
            }
        }
        Ok(n)
    }

    pub fn log_auto_etiquette_event(
        &self,
        contact_id: i64,
        etiquette_id: i64,
        matched: bool,
        reason: &str,
    ) -> Result<()> {
        let exists: i64 = self
            .conn
            .query_row(
                "SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name='contact_etiquette_auto_log'",
                [],
                |row| row.get(0),
            )
            .unwrap_or(0);
        if exists == 0 {
            return Ok(());
        }
        self.conn.execute(
            "INSERT INTO contact_etiquette_auto_log (contact_id, etiquette_id, matched, reason)
             VALUES (?1, ?2, ?3, ?4)",
            params![contact_id, etiquette_id, if matched { 1 } else { 0 }, reason],
        )?;
        Ok(())
    }

    pub fn get_auto_log_for_contact(
        &self,
        contact_id: i64,
        limit: i64,
    ) -> Result<Vec<(i64, String, bool, String, i64)>> {
        let exists: i64 = self
            .conn
            .query_row(
                "SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name='contact_etiquette_auto_log'",
                [],
                |row| row.get(0),
            )
            .unwrap_or(0);
        if exists == 0 {
            return Ok(vec![]);
        }
        let mut stmt = self.conn.prepare(
            "SELECT l.etiquette_id, e.nom, l.matched, l.reason, l.evaluated_at
             FROM contact_etiquette_auto_log l
             JOIN etiquettes e ON e.id = l.etiquette_id
             WHERE l.contact_id = ?1
             ORDER BY l.evaluated_at DESC
             LIMIT ?2",
        )?;
        let rows = stmt.query_map(params![contact_id, limit], |row| {
            Ok((
                row.get(0)?,
                row.get(1)?,
                row.get::<_, i64>(2)? != 0,
                row.get(3)?,
                row.get(4)?,
            ))
        })?;
        rows.collect()
    }
}
