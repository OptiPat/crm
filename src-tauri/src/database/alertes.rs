//! Alertes de suivi : CRUD, génération automatique (via segments) et fermeture
//! des alertes obsolètes.
//!
//! Extrait de `operations.rs` (chantier de découpage par domaine). Comportement
//! inchangé. Les méthodes appelées sur d'autres domaines (`get_contact_by_id`,
//! `get_all_contacts`, segments) restent accessibles via `self`.

use rusqlite::{params, Result};

/// Alertes patrimoine : conservées même si le suivi relationnel est en pause.
const PATRIMOINE_ALERTE_TYPES: &[&str] = &["FIN_DEMEMBREMENT", "ANNIVERSAIRE"];

fn patrimoine_alerte_types_sql() -> String {
    PATRIMOINE_ALERTE_TYPES
        .iter()
        .map(|t| format!("'{t}'"))
        .collect::<Vec<_>>()
        .join(", ")
}

fn inactive_suivi_contact_sql(alias: &str) -> String {
    format!(
        "({alias}.statut_suivi IN ('EN_PAUSE', 'ARCHIVE') \
         OR COALESCE({alias}.filleul_categorie, '') = 'FILLEUL_DESINSCRIT')"
    )
}

/// Segment inactif ou contact exclu du calcul auto de l'étiquette liée.
fn alerte_segment_eligible_sql(a_alias: &str) -> String {
    format!(
        "NOT EXISTS (
            SELECT 1 FROM alerte_segment_links asl
            INNER JOIN segments s ON s.id = asl.segment_id
            WHERE asl.type_alerte = {a_alias}.type_alerte AND s.actif = 0
         )
         AND NOT EXISTS (
            SELECT 1 FROM alerte_segment_links asl
            INNER JOIN etiquettes e ON e.segment_id = asl.segment_id
            INNER JOIN contact_etiquette_auto_exclusions ex
              ON ex.contact_id = {a_alias}.contact_id AND ex.etiquette_id = e.id
            WHERE asl.type_alerte = {a_alias}.type_alerte
         )"
    )
}

fn open_alerte_visibility_sql(a_alias: &str, c_alias: &str) -> String {
    let patrimoine = patrimoine_alerte_types_sql();
    let inactive = inactive_suivi_contact_sql(c_alias);
    let segment_eligible = alerte_segment_eligible_sql(a_alias);
    format!(
        "(
          {a_alias}.type_alerte IN ({patrimoine})
          OR (
            NOT ({inactive})
            AND ({segment_eligible})
          )
        )"
    )
}

impl super::Database {
    // ========== ALERTES ==========

    pub fn get_all_alertes(&self) -> Result<Vec<super::models::Alerte>> {
        let mut stmt = self.conn.prepare(
            "SELECT id, contact_id, type_alerte, message, date_alerte, lue, traitee, created_at
             FROM alertes 
             ORDER BY date_alerte DESC, created_at DESC",
        )?;

        let alertes = stmt.query_map([], |row| {
            Ok(super::models::Alerte {
                id: row.get(0)?,
                contact_id: row.get(1)?,
                type_alerte: row.get(2)?,
                message: row.get(3)?,
                date_alerte: row.get(4)?,
                lue: row.get::<_, i64>(5)? != 0,
                traitee: row.get::<_, i64>(6)? != 0,
                created_at: row.get(7)?,
            })
        })?;

        let mut result = Vec::new();
        for alerte in alertes {
            result.push(alerte?);
        }
        Ok(result)
    }

    pub fn get_alertes_non_traitees(&self) -> Result<Vec<super::models::Alerte>> {
        let visibility = open_alerte_visibility_sql("a", "c");
        let sql = format!(
            "SELECT a.id, a.contact_id, a.type_alerte, a.message, a.date_alerte, a.lue, a.traitee, a.created_at
             FROM alertes a
             INNER JOIN contacts c ON a.contact_id = c.id
             WHERE a.traitee = 0
               AND {visibility}
             ORDER BY a.date_alerte DESC, a.created_at DESC"
        );
        let mut stmt = self.conn.prepare(&sql)?;

        let alertes = stmt.query_map([], |row| {
            Ok(super::models::Alerte {
                id: row.get(0)?,
                contact_id: row.get(1)?,
                type_alerte: row.get(2)?,
                message: row.get(3)?,
                date_alerte: row.get(4)?,
                lue: row.get::<_, i64>(5)? != 0,
                traitee: row.get::<_, i64>(6)? != 0,
                created_at: row.get(7)?,
            })
        })?;

        let mut result = Vec::new();
        for alerte in alertes {
            result.push(alerte?);
        }
        Ok(result)
    }

    pub fn create_alerte(&self, alerte: super::models::NewAlerte) -> Result<super::models::Alerte> {
        let date_alerte = alerte.date_alerte.unwrap_or_else(|| {
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_secs() as i64
        });

        self.conn.execute(
            "INSERT INTO alertes (contact_id, type_alerte, message, date_alerte, lue, traitee) 
             VALUES (?1, ?2, ?3, ?4, 0, 0)",
            params![
                &alerte.contact_id,
                &alerte.type_alerte,
                &alerte.message,
                date_alerte,
            ],
        )?;

        let id = self.conn.last_insert_rowid();
        self.get_alerte_by_id(id)
    }

    pub fn get_alerte_by_id(&self, id: i64) -> Result<super::models::Alerte> {
        self.conn.query_row(
            "SELECT id, contact_id, type_alerte, message, date_alerte, lue, traitee, created_at
             FROM alertes 
             WHERE id = ?1",
            params![id],
            |row| {
                Ok(super::models::Alerte {
                    id: row.get(0)?,
                    contact_id: row.get(1)?,
                    type_alerte: row.get(2)?,
                    message: row.get(3)?,
                    date_alerte: row.get(4)?,
                    lue: row.get::<_, i64>(5)? != 0,
                    traitee: row.get::<_, i64>(6)? != 0,
                    created_at: row.get(7)?,
                })
            },
        )
    }

    pub fn marquer_alerte_lue(&self, id: i64) -> Result<()> {
        self.conn
            .execute("UPDATE alertes SET lue = 1 WHERE id = ?1", params![id])?;
        Ok(())
    }

    pub fn marquer_alerte_traitee(&self, id: i64) -> Result<()> {
        self.conn.execute(
            "UPDATE alertes SET traitee = 1, lue = 1 WHERE id = ?1",
            params![id],
        )?;
        Ok(())
    }

    pub fn delete_alerte(&self, id: i64) -> Result<()> {
        self.conn
            .execute("DELETE FROM alertes WHERE id = ?1", params![id])?;
        Ok(())
    }

    fn has_alerte_non_traitee(&self, contact_id: i64, type_alerte: &str) -> Result<bool> {
        let n: i64 = self.conn.query_row(
            "SELECT COUNT(*) FROM alertes WHERE contact_id = ?1 AND type_alerte = ?2 AND traitee = 0",
            params![contact_id, type_alerte],
            |row| row.get(0),
        )?;
        Ok(n > 0)
    }

    fn try_create_alerte_suivi(
        &self,
        contact_id: i64,
        type_alerte: &str,
        message: String,
        now: i64,
    ) -> Result<bool> {
        if self.has_alerte_non_traitee(contact_id, type_alerte)? {
            return Ok(false);
        }
        self.create_alerte(super::models::NewAlerte {
            contact_id,
            type_alerte: type_alerte.to_string(),
            message,
            date_alerte: Some(now),
        })?;
        Ok(true)
    }

    fn close_open_suivi_alerte(&self, contact_id: i64, type_alerte: &str) -> Result<bool> {
        let updated = self.conn.execute(
            "UPDATE alertes SET traitee = 1, lue = 1
             WHERE contact_id = ?1 AND type_alerte = ?2 AND traitee = 0",
            params![contact_id, type_alerte],
        )?;
        Ok(updated > 0)
    }

    fn contact_excluded_from_alerte_type(
        &self,
        contact_id: i64,
        type_alerte: &str,
    ) -> Result<bool> {
        if !self.segments_table_exists() {
            return Ok(false);
        }
        let n: i64 = self.conn.query_row(
            "SELECT COUNT(*) FROM alerte_segment_links asl
             INNER JOIN etiquettes e ON e.segment_id = asl.segment_id
             INNER JOIN contact_etiquette_auto_exclusions ex
               ON ex.contact_id = ?1 AND ex.etiquette_id = e.id
             WHERE asl.type_alerte = ?2",
            params![contact_id, type_alerte],
            |row| row.get(0),
        )?;
        Ok(n > 0)
    }

    /// Clôture les alertes liées à une étiquette dont le contact est exclu du calcul auto.
    pub fn close_suivi_alertes_for_etiquette_exclusion(
        &self,
        contact_id: i64,
        etiquette_id: i64,
    ) -> Result<usize> {
        if !self.segments_table_exists() {
            return Ok(0);
        }
        let mut stmt = self.conn.prepare(
            "SELECT asl.type_alerte FROM alerte_segment_links asl
             INNER JOIN etiquettes e ON e.segment_id = asl.segment_id
             WHERE e.id = ?1",
        )?;
        let types = stmt
            .query_map(params![etiquette_id], |row| row.get::<_, String>(0))?
            .collect::<Result<Vec<_>, _>>()?;
        let mut closed = 0usize;
        for type_alerte in types {
            if self.close_open_suivi_alerte(contact_id, &type_alerte)? {
                closed += 1;
            }
        }
        Ok(closed)
    }

    /// Clôture toutes les alertes ouvertes d'un type dont le segment système est désactivé.
    pub fn close_suivi_alertes_for_inactive_segment(&self, segment_id: i64) -> Result<usize> {
        if !self.segments_table_exists() {
            return Ok(0);
        }
        let patrimoine = patrimoine_alerte_types_sql();
        let updated = self.conn.execute(
            &format!(
                "UPDATE alertes SET traitee = 1, lue = 1
                 WHERE traitee = 0
                   AND type_alerte NOT IN ({patrimoine})
                   AND type_alerte IN (
                     SELECT type_alerte FROM alerte_segment_links WHERE segment_id = ?1
                   )"
            ),
            params![segment_id],
        )?;
        Ok(updated)
    }

    /// Ferme les alertes suivi devenues obsolètes (date remontée, saisie manuelle, etc.).
    pub fn auto_close_obsolete_suivi_alertes_for_contact(&self, contact_id: i64) -> Result<usize> {
        let contact = self.get_contact_by_id(contact_id)?;

        if contact.statut_suivi == "ARCHIVE" || contact.statut_suivi == "EN_PAUSE" {
            let n = self.conn.execute(
                "UPDATE alertes SET traitee = 1, lue = 1
                 WHERE contact_id = ?1 AND traitee = 0
                   AND type_alerte NOT IN ('FIN_DEMEMBREMENT')",
                params![contact_id],
            )?;
            return Ok(n);
        }

        const SECONDS_PER_DAY: i64 = 24 * 60 * 60;
        const JOURS_6_MOIS: i64 = 180;
        const JOURS_1_AN: i64 = 365;

        let now = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_secs() as i64;

        let days_since = |last: i64| (now - last) / SECONDS_PER_DAY;
        let mut closed = 0usize;

        let mut maybe_close = |type_alerte: &str, still_applies: bool| -> Result<()> {
            if !still_applies && self.close_open_suivi_alerte(contact_id, type_alerte)? {
                closed += 1;
            }
            Ok(())
        };

        if contact.categorie == "CLIENT" {
            let last = contact.date_dernier_contact;
            maybe_close(
                "SUIVI_CLIENT_1AN",
                last.map(|l| days_since(l) >= JOURS_1_AN).unwrap_or(false),
            )?;
            maybe_close("CLIENT_JAMAIS_SUIVI", last.is_none())?;
        } else {
            maybe_close("SUIVI_CLIENT_1AN", false)?;
            maybe_close("CLIENT_JAMAIS_SUIVI", false)?;
        }

        if contact.categorie == "SUSPECT_CLIENT" || contact.categorie == "PROSPECT_CLIENT" {
            let last = contact.date_dernier_contact;
            maybe_close(
                "LEAD_SUIVI_6MOIS",
                last.map(|l| days_since(l) >= JOURS_6_MOIS).unwrap_or(false),
            )?;
            maybe_close("LEAD_JAMAIS_CONTACTE", last.is_none())?;
        } else {
            maybe_close("LEAD_SUIVI_6MOIS", false)?;
            maybe_close("LEAD_JAMAIS_CONTACTE", false)?;
        }

        if let Some(fc) = contact.filleul_categorie.as_deref() {
            if fc == "FILLEUL_DESINSCRIT" {
                maybe_close("SUIVI_FILLEUL_1AN", false)?;
                maybe_close("FILLEUL_SUIVI_6MOIS", false)?;
                maybe_close("FILLEUL_JAMAIS_CONTACTE", false)?;
            } else if fc == "FILLEUL" {
                let last = contact.date_dernier_contact_filleul;
                maybe_close(
                    "SUIVI_FILLEUL_1AN",
                    last.map(|l| days_since(l) >= JOURS_1_AN).unwrap_or(false),
                )?;
                maybe_close("FILLEUL_SUIVI_6MOIS", false)?;
                maybe_close("FILLEUL_JAMAIS_CONTACTE", false)?;
            } else if fc == "PROSPECT_FILLEUL" || fc == "SUSPECT_FILLEUL" {
                let last = contact.date_dernier_contact_filleul;
                maybe_close(
                    "FILLEUL_SUIVI_6MOIS",
                    last.map(|l| days_since(l) >= JOURS_6_MOIS).unwrap_or(false),
                )?;
                maybe_close("FILLEUL_JAMAIS_CONTACTE", last.is_none())?;
                maybe_close("SUIVI_FILLEUL_1AN", false)?;
            }
        } else {
            maybe_close("SUIVI_FILLEUL_1AN", false)?;
            maybe_close("FILLEUL_SUIVI_6MOIS", false)?;
            maybe_close("FILLEUL_JAMAIS_CONTACTE", false)?;
        }

        for type_alerte in [
            "SUIVI_CLIENT_1AN",
            "CLIENT_JAMAIS_SUIVI",
            "LEAD_SUIVI_6MOIS",
            "LEAD_JAMAIS_CONTACTE",
            "SUIVI_FILLEUL_1AN",
            "FILLEUL_SUIVI_6MOIS",
            "FILLEUL_JAMAIS_CONTACTE",
        ] {
            if self.contact_excluded_from_alerte_type(contact_id, type_alerte)? {
                maybe_close(type_alerte, false)?;
            }
        }

        Ok(closed)
    }

    /// Clôture les alertes relationnelles encore ouvertes pour contacts hors suivi actif.
    fn close_orphan_suivi_alertes_for_inactive_contacts(&self) -> Result<usize> {
        let inactive = inactive_suivi_contact_sql("c");
        let patrimoine = patrimoine_alerte_types_sql();
        let updated = self.conn.execute(
            &format!(
                "UPDATE alertes SET traitee = 1, lue = 1
                 WHERE traitee = 0
                   AND type_alerte NOT IN ({patrimoine})
                   AND contact_id IN (
                     SELECT id FROM contacts c WHERE {inactive}
                   )"
            ),
            [],
        )?;
        Ok(updated)
    }

    /// Clôture les alertes liées à un segment inactif ou à une exclusion étiquette/contact.
    fn close_orphan_suivi_alertes_for_exclusions_and_inactive_segments(&self) -> Result<usize> {
        if !self.segments_table_exists() {
            return Ok(0);
        }
        let patrimoine = patrimoine_alerte_types_sql();
        let n_segments = self.conn.execute(
            &format!(
                "UPDATE alertes SET traitee = 1, lue = 1
                 WHERE traitee = 0
                   AND type_alerte NOT IN ({patrimoine})
                   AND type_alerte IN (
                     SELECT asl.type_alerte FROM alerte_segment_links asl
                     INNER JOIN segments s ON s.id = asl.segment_id
                     WHERE s.actif = 0
                   )"
            ),
            [],
        )?;
        let n_exclusions = self.conn.execute(
            "UPDATE alertes SET traitee = 1, lue = 1
             WHERE traitee = 0
               AND EXISTS (
                 SELECT 1 FROM alerte_segment_links asl
                 INNER JOIN etiquettes e ON e.segment_id = asl.segment_id
                 INNER JOIN contact_etiquette_auto_exclusions ex
                   ON ex.contact_id = alertes.contact_id AND ex.etiquette_id = e.id
                 WHERE asl.type_alerte = alertes.type_alerte
               )",
            [],
        )?;
        Ok(n_segments + n_exclusions)
    }

    // Génération automatique des alertes — via segments (même logique que les étiquettes).
    pub fn generer_alertes_automatiques(&self) -> Result<usize> {
        let _ = self.close_orphan_suivi_alertes_for_inactive_contacts()?;
        let _ = self.close_orphan_suivi_alertes_for_exclusions_and_inactive_segments()?;
        let _ = self.ensure_default_segments_and_alerte_links();

        let now = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_secs() as i64;

        let mut links: Vec<(String, i64)> = Vec::new();
        if self.segments_table_exists() {
            let mut stmt = self
                .conn
                .prepare("SELECT type_alerte, segment_id FROM alerte_segment_links")?;
            let rows = stmt.query_map([], |row| Ok((row.get::<_, String>(0)?, row.get(1)?)))?;
            for row in rows {
                links.push(row?);
            }
        }

        if links.is_empty() {
            return Ok(0);
        }

        let contacts = self.get_all_contacts()?;
        let mut count = 0;

        for contact in contacts {
            let contact_id = match contact.id {
                Some(id) => id,
                None => continue,
            };

            if contact.statut_suivi == "ARCHIVE" || contact.statut_suivi == "EN_PAUSE" {
                continue;
            }

            if contact.filleul_categorie.as_deref() == Some("FILLEUL_DESINSCRIT") {
                continue;
            }

            let label = format!("{} {}", contact.prenom, contact.nom);

            for (type_alerte, segment_id) in &links {
                if self.contact_excluded_from_alerte_type(contact_id, type_alerte)? {
                    continue;
                }
                if self.contact_matches_segment(&contact, *segment_id)? {
                    if self.try_create_alerte_suivi(contact_id, type_alerte, label.clone(), now)? {
                        count += 1;
                    }
                }
            }
        }

        Ok(count)
    }

    fn map_alerte_with_contact_row(
        row: &rusqlite::Row<'_>,
    ) -> rusqlite::Result<super::models::AlerteWithContact> {
        let traitee: i64 = row.get(9)?;
        Ok(super::models::AlerteWithContact {
            alerte_id: row.get(0)?,
            contact_id: row.get(1)?,
            contact_nom: row.get(2)?,
            contact_prenom: row.get(3)?,
            contact_categorie: row.get(4)?,
            date_dernier_contact: row.get(5)?,
            type_alerte: row.get(6)?,
            message: row.get(7)?,
            date_alerte: row.get::<_, i64>(8)?.to_string(),
            statut: if traitee != 0 {
                "TRAITE"
            } else {
                "EN_ATTENTE"
            }
            .to_string(),
        })
    }

    pub fn get_alertes_with_contacts(
        &self,
        limit: Option<i64>,
    ) -> Result<Vec<super::models::AlerteWithContact>> {
        // Vérifier si la table alertes existe
        let table_exists: Result<i64> = self.conn.query_row(
            "SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name='alertes'",
            [],
            |row| row.get(0),
        );

        if table_exists.unwrap_or(0) == 0 {
            return Ok(Vec::new());
        }

        let visibility = open_alerte_visibility_sql("a", "c");
        let base_sql = format!(
            "SELECT a.id, a.contact_id, c.nom, c.prenom,
                    COALESCE(NULLIF(c.filleul_categorie, ''), c.categorie) as display_categorie,
                    c.date_dernier_contact,
                    a.type_alerte, a.message, a.date_alerte, a.traitee
             FROM alertes a
             INNER JOIN contacts c ON a.contact_id = c.id
             WHERE a.traitee = 0
               AND {visibility}
             ORDER BY a.date_alerte ASC"
        );

        let mut result = Vec::new();

        match limit {
            Some(max) if max > 0 => {
                let sql = format!("{base_sql} LIMIT ?1");
                let mut stmt = self.conn.prepare(&sql)?;
                let alertes = stmt.query_map(params![max], |row| {
                    Self::map_alerte_with_contact_row(row)
                })?;
                for alerte in alertes {
                    result.push(alerte?);
                }
            }
            _ => {
                let mut stmt = self.conn.prepare(&base_sql)?;
                let alertes = stmt.query_map([], Self::map_alerte_with_contact_row)?;
                for alerte in alertes {
                    result.push(alerte?);
                }
            }
        }

        Ok(result)
    }
}
