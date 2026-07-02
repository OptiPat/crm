use super::{
    email_schedule::resolve_email_date_prevue_for_contact,
    models::{Contact, ContactEtiquette, NewEtiquette},
    operations::REDUCTION_IMPOT_ETIQUETTE_CANONICAL,
    Database,
};
use crate::contact_name::normalize_contact_name;
use rusqlite::{params, Result};

impl Database {
    pub fn count_contacts_for_etiquette(&self, etiquette_id: i64) -> Result<u32> {
        let count: i64 = self.conn.query_row(
            "SELECT COUNT(DISTINCT contact_id) FROM contact_etiquettes WHERE etiquette_id = ?1",
            params![etiquette_id],
            |r| r.get(0),
        )?;
        Ok(count.max(0) as u32)
    }

    /// True si le contact porte déjà l'étiquette.
    pub fn contact_has_etiquette(&self, contact_id: i64, etiquette_id: i64) -> Result<bool> {
        let n: i64 = self.conn.query_row(
            "SELECT COUNT(*) FROM contact_etiquettes WHERE contact_id = ?1 AND etiquette_id = ?2",
            params![contact_id, etiquette_id],
            |row| row.get(0),
        )?;
        Ok(n > 0)
    }

    /// Attribution manuelle groupée — transaction tout-ou-rien, ids dupliqués ignorés.
    pub fn attribuer_etiquette_bulk(
        &self,
        etiquette_id: i64,
        contact_ids: Vec<i64>,
    ) -> Result<(u32, u32)> {
        self.get_etiquette_by_id(etiquette_id)?;

        let now = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|d| d.as_secs() as i64)
            .unwrap_or(0);

        let mut unique_ids = Vec::new();
        let mut seen = std::collections::HashSet::new();
        for id in contact_ids {
            if seen.insert(id) {
                unique_ids.push(id);
            }
        }

        if unique_ids.is_empty() {
            return Ok((0, 0));
        }

        self.conn.execute("BEGIN IMMEDIATE", [])?;
        match self.attribuer_etiquette_bulk_inner(etiquette_id, &unique_ids, now) {
            Ok(counts) => {
                self.conn.execute("COMMIT", [])?;
                Ok(counts)
            }
            Err(e) => {
                let _ = self.conn.execute("ROLLBACK", []);
                Err(e)
            }
        }
    }

    fn attribuer_etiquette_bulk_inner(
        &self,
        etiquette_id: i64,
        contact_ids: &[i64],
        now: i64,
    ) -> Result<(u32, u32)> {
        let mut assigned = 0u32;
        let mut skipped = 0u32;

        for &contact_id in contact_ids {
            if self.contact_has_etiquette(contact_id, etiquette_id)? {
                skipped += 1;
                continue;
            }

            self.attribuer_etiquette(contact_id, etiquette_id, Some("MANUEL".into()), None)?;
            let _ = self.apply_etiquette_tache_action(contact_id, etiquette_id, now);
            assigned += 1;
        }

        Ok((assigned, skipped))
    }

    /// Attribuer une étiquette à un contact
    pub fn attribuer_etiquette(
        &self,
        contact_id: i64,
        etiquette_id: i64,
        attribue_par: Option<String>,
        eligible_at_unix: Option<i64>,
    ) -> Result<ContactEtiquette> {
        let attribue_par = attribue_par.unwrap_or_else(|| "MANUEL".to_string());

        let etiquette = self.get_etiquette_by_id(etiquette_id)?;
        let eligible_at = eligible_at_unix.unwrap_or_else(|| {
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_secs() as i64
        });
        let email_date_prevue =
            if crate::email::stellium_exceltis::is_exceltis_etiquette_nom(&etiquette.nom) {
                self.resolve_exceltis_contact_email_date_prevue(&etiquette, etiquette_id)?
            } else {
                resolve_email_date_prevue_for_contact(&etiquette, eligible_at)
            };

        self.conn.execute(
            "INSERT INTO contact_etiquettes (contact_id, etiquette_id, attribue_par, email_date_prevue) 
             VALUES (?1, ?2, ?3, ?4)
             ON CONFLICT(contact_id, etiquette_id) DO UPDATE SET
                attribue_par = CASE
                    WHEN contact_etiquettes.email_envoye = 0 THEN excluded.attribue_par
                    ELSE contact_etiquettes.attribue_par
                END,
                date_attribution = CASE
                    WHEN contact_etiquettes.email_envoye = 0 THEN unixepoch()
                    ELSE contact_etiquettes.date_attribution
                END,
                email_date_prevue = CASE
                    WHEN contact_etiquettes.email_envoye = 0 THEN excluded.email_date_prevue
                    ELSE contact_etiquettes.email_date_prevue
                END",
            params![contact_id, etiquette_id, &attribue_par, email_date_prevue],
        )?;
        self.ensure_pipeline_status_on_assignment(contact_id, etiquette_id)?;

        // Récupérer la liaison créée ou mise à jour
        self.conn.query_row(
            "SELECT id, contact_id, etiquette_id, date_attribution, attribue_par,
                    email_envoye, email_date_prevue, email_date_envoi, notes
             FROM contact_etiquettes 
             WHERE contact_id = ?1 AND etiquette_id = ?2",
            params![contact_id, etiquette_id],
            |row| {
                Ok(ContactEtiquette {
                    id: row.get(0)?,
                    contact_id: row.get(1)?,
                    etiquette_id: row.get(2)?,
                    date_attribution: row.get(3)?,
                    attribue_par: row.get(4)?,
                    email_envoye: row.get::<_, i64>(5)? != 0,
                    email_date_prevue: row.get(6)?,
                    email_date_envoi: row.get(7)?,
                    notes: row.get(8)?,
                })
            },
        )
    }

    /// Retirer une étiquette d'un contact
    pub fn retirer_etiquette(
        &self,
        contact_id: i64,
        etiquette_id: i64,
        exclude_from_auto: bool,
    ) -> Result<()> {
        if exclude_from_auto {
            self.exclude_contact_from_auto_etiquette(contact_id, etiquette_id)?;
        }
        self.conn.execute(
            "DELETE FROM contact_etiquettes WHERE contact_id = ?1 AND etiquette_id = ?2",
            params![contact_id, etiquette_id],
        )?;
        Ok(())
    }

    pub fn is_auto_etiquette_excluded(&self, contact_id: i64, etiquette_id: i64) -> Result<bool> {
        let n: i64 = self.conn.query_row(
            "SELECT COUNT(*) FROM contact_etiquette_auto_exclusions
             WHERE contact_id = ?1 AND etiquette_id = ?2",
            params![contact_id, etiquette_id],
            |row| row.get(0),
        )?;
        Ok(n > 0)
    }

    /// Le contact ne recevra plus cette étiquette au recalcul auto (supprime l'attribution AUTO si présente).
    pub fn exclude_contact_from_auto_etiquette(
        &self,
        contact_id: i64,
        etiquette_id: i64,
    ) -> Result<()> {
        self.conn.execute(
            "INSERT INTO contact_etiquette_auto_exclusions (contact_id, etiquette_id)
             VALUES (?1, ?2)
             ON CONFLICT(contact_id, etiquette_id) DO NOTHING",
            params![contact_id, etiquette_id],
        )?;
        self.conn.execute(
            "DELETE FROM contact_etiquettes
             WHERE contact_id = ?1 AND etiquette_id = ?2 AND UPPER(TRIM(attribue_par)) = 'AUTO'",
            params![contact_id, etiquette_id],
        )?;
        self.close_suivi_alertes_for_etiquette_exclusion(contact_id, etiquette_id)?;
        Ok(())
    }

    pub fn clear_auto_etiquette_exclusion(
        &self,
        contact_id: i64,
        etiquette_id: i64,
    ) -> Result<()> {
        self.conn.execute(
            "DELETE FROM contact_etiquette_auto_exclusions
             WHERE contact_id = ?1 AND etiquette_id = ?2",
            params![contact_id, etiquette_id],
        )?;
        Ok(())
    }

    pub fn get_auto_etiquette_exclusion_ids_for_contact(
        &self,
        contact_id: i64,
    ) -> Result<Vec<i64>> {
        let mut stmt = self.conn.prepare(
            "SELECT etiquette_id FROM contact_etiquette_auto_exclusions WHERE contact_id = ?1",
        )?;
        let rows = stmt.query_map(params![contact_id], |row| row.get(0))?;
        let mut ids = Vec::new();
        for row in rows {
            ids.push(row?);
        }
        Ok(ids)
    }

    /// Récupérer tous les contacts ayant une étiquette spécifique
    pub fn get_contacts_by_etiquette(&self, etiquette_id: i64) -> Result<Vec<Contact>> {
        use super::contact_row::{contact_select_prefixed, map_contact_row};

        let select = contact_select_prefixed("c");
        let mut stmt = self.conn.prepare(&format!(
            "SELECT {select}
             FROM contacts c
             INNER JOIN contact_etiquettes ce ON c.id = ce.contact_id
             WHERE ce.etiquette_id = ?1
             ORDER BY c.nom, c.prenom"
        ))?;

        let contacts = stmt.query_map(params![etiquette_id], map_contact_row)?;

        contacts.collect()
    }

    /// Compter les étiquettes (pour vérifier si la table est vide au premier lancement)
    pub fn count_etiquettes(&self) -> Result<i64> {
        self.conn
            .query_row("SELECT COUNT(*) FROM etiquettes", [], |row| row.get(0))
    }

    /// Créer les étiquettes par défaut (seed initial)
    pub fn seed_default_etiquettes(&self) -> Result<usize> {
        // Vérifier si la table existe
        let table_exists: i64 = self
            .conn
            .query_row(
                "SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name='etiquettes'",
                [],
                |row| row.get(0),
            )
            .unwrap_or(0);

        if table_exists == 0 {
            return Ok(0);
        }

        let count = self.count_etiquettes().unwrap_or(0);
        let mut total = 0;

        if count > 0 {
            total += self.ensure_default_etiquettes()?;
            total += self.merge_duplicate_reduction_impot_etiquettes()?;
            let _ = self.ensure_default_segments_and_alerte_links();
            return Ok(total);
        }

        let mut created = 0;

        // 1. Suivi > 1 an (rouge)
        self.create_etiquette(NewEtiquette {
            nom: "Suivi > 1 an".to_string(),
            couleur: Some("#EF4444".to_string()),
            icone: Some("🔴".to_string()),
            description: Some("Client contacté, mais plus d'un an sans nouvel échange".to_string()),
            priorite: Some(100),
            auto_condition_type: Some("DELAI_SANS_CONTACT".to_string()),
            auto_condition_config: Some(r#"{"jours": 365, "inclure_sans_date": false}"#.to_string()),
            auto_categories: Some(r#"["CLIENT"]"#.to_string()),
            email_template_id: None,
            email_delai_jours: Some(0),
            email_envoi_prevu: None,
            email_envoi_heure: None,
            email_envoi_jours_semaine: None,
            email_actif: Some(false),
            is_default: Some(true),
            actif: None,
            segment_id: None,
            rendement_cible: None,
        })?;
        created += 1;

        // 2. Jamais suivi (rouge)
        self.create_etiquette(NewEtiquette {
            nom: "Jamais suivi".to_string(),
            couleur: Some("#EF4444".to_string()),
            icone: Some("🔴".to_string()),
            description: Some("Client sans date de dernier contact enregistrée".to_string()),
            priorite: Some(99),
            auto_condition_type: Some("JAMAIS_CONTACT".to_string()),
            auto_condition_config: Some(r#"{}"#.to_string()),
            auto_categories: Some(r#"["CLIENT"]"#.to_string()),
            email_template_id: None,
            email_delai_jours: Some(0),
            email_envoi_prevu: None,
            email_envoi_heure: None,
            email_envoi_jours_semaine: None,
            email_actif: Some(false),
            is_default: Some(true),
            actif: None,
            segment_id: None,
            rendement_cible: None,
        })?;
        created += 1;

        // 3. Suivi à planifier (orange)
        self.create_etiquette(NewEtiquette {
            nom: "Suivi à planifier".to_string(),
            couleur: Some("#F97316".to_string()),
            icone: Some("📅".to_string()),
            description: Some("Date de prochain suivi dans moins de 30 jours".to_string()),
            priorite: Some(90),
            auto_condition_type: Some("DATE_APPROCHE".to_string()),
            auto_condition_config: Some(
                r#"{"champ": "date_prochain_suivi", "jours_avant": 30}"#.to_string(),
            ),
            auto_categories: Some(r#"["CLIENT", "PROSPECT_CLIENT"]"#.to_string()),
            email_template_id: None,
            email_delai_jours: Some(0),
            email_envoi_prevu: None,
            email_envoi_heure: None,
            email_envoi_jours_semaine: None,
            email_actif: Some(false),
            is_default: Some(true),
            actif: None,
            segment_id: None,
            rendement_cible: None,
        })?;
        created += 1;

        // 3. Fin démembrement (bleu)
        self.create_etiquette(NewEtiquette {
            nom: "Fin démembrement".to_string(),
            couleur: Some("#3B82F6".to_string()),
            icone: Some("🏠".to_string()),
            description: Some("Fin de démembrement dans moins de 6 mois".to_string()),
            priorite: Some(85),
            auto_condition_type: Some("DATE_APPROCHE_INVESTISSEMENT".to_string()),
            auto_condition_config: Some(r#"{"champ": "date_fin_demembrement", "jours_avant": 180, "types_produit": ["SCPI_DEMEMBREMENT"]}"#.to_string()),
            auto_categories: Some(r#"["CLIENT"]"#.to_string()),
            email_template_id: None,
            email_delai_jours: Some(0),
            email_envoi_prevu: None,
            email_envoi_heure: None,
            email_envoi_jours_semaine: None,
            email_actif: Some(false),
            is_default: Some(true),
            actif: None,
            segment_id: None,
            rendement_cible: None,
        })?;
        created += 1;

        // 4. Fin de prêt (cyan)
        self.create_etiquette(NewEtiquette {
            nom: "Fin de prêt".to_string(),
            couleur: Some("#06B6D4".to_string()),
            icone: Some("💰".to_string()),
            description: Some("Fin de prêt immobilier/SCPI dans moins d'un an".to_string()),
            priorite: Some(80),
            auto_condition_type: Some("DATE_APPROCHE_INVESTISSEMENT".to_string()),
            auto_condition_config: Some(r#"{"champ": "date_fin_pret", "jours_avant": 365, "types_produit": ["SCPI", "SCPI_FISCALE", "SCPI_DEMEMBREMENT", "IMMOBILIER", "PINEL", "DENORMANDIE", "JEANBRUN", "MALRAUX", "MONUMENT_HISTORIQUE", "DEFICIT_FONCIER", "LMNP", "LMP", "NUE_PROPRIETE", "RESIDENCE_PRINCIPALE", "LOCATIF_CLASSIQUE"]}"#.to_string()),
            auto_categories: Some(r#"["CLIENT"]"#.to_string()),
            email_template_id: None,
            email_delai_jours: Some(0),
            email_envoi_prevu: None,
            email_envoi_heure: None,
            email_envoi_jours_semaine: None,
            email_actif: Some(false),
            is_default: Some(true),
            actif: None,
            segment_id: None,
            rendement_cible: None,
        })?;
        created += 1;

        // 5. Alerte 69 ans (rose)
        self.create_etiquette(NewEtiquette {
            nom: "Alerte 69 ans".to_string(),
            couleur: Some("#EC4899".to_string()),
            icone: Some("🎂".to_string()),
            description: Some("Client approchant 69 ans (assurance-vie)".to_string()),
            priorite: Some(75),
            auto_condition_type: Some("AGE_APPROCHE".to_string()),
            auto_condition_config: Some(r#"{"age": 69, "jours_avant": 30}"#.to_string()),
            auto_categories: Some(r#"["CLIENT"]"#.to_string()),
            email_template_id: None,
            email_delai_jours: Some(0),
            email_envoi_prevu: None,
            email_envoi_heure: None,
            email_envoi_jours_semaine: None,
            email_actif: Some(false),
            is_default: Some(true),
            actif: None,
            segment_id: None,
            rendement_cible: None,
        })?;
        created += 1;

        // 7. Déclaration IR (violet)
        self.create_etiquette(NewEtiquette {
            nom: "Déclaration IR".to_string(),
            couleur: Some("#8B5CF6".to_string()),
            icone: Some("📋".to_string()),
            description: Some("Période de déclaration d'impôts (avril-mai)".to_string()),
            priorite: Some(70),
            auto_condition_type: Some("PERIODE_ANNEE".to_string()),
            auto_condition_config: Some(r#"{"mois_debut": 4, "mois_fin": 5}"#.to_string()),
            auto_categories: Some(r#"["CLIENT"]"#.to_string()),
            email_template_id: None,
            email_delai_jours: Some(0),
            email_envoi_prevu: None,
            email_envoi_heure: None,
            email_envoi_jours_semaine: None,
            email_actif: Some(false),
            is_default: Some(true),
            actif: None,
            segment_id: None,
            rendement_cible: None,
        })?;
        created += 1;

        // 8. Réduction d'impôt fin d'année (vert)
        self.create_etiquette(NewEtiquette {
            nom: "Réduction d'impôt fin d'année".to_string(),
            couleur: Some("#10B981".to_string()),
            icone: Some("🎯".to_string()),
            description: Some("Période de réduction d'impôt fin d'année (oct-nov)".to_string()),
            priorite: Some(60),
            auto_condition_type: Some("PERIODE_ANNEE".to_string()),
            auto_condition_config: Some(r#"{"mois_debut": 10, "mois_fin": 11}"#.to_string()),
            auto_categories: Some(r#"["CLIENT", "PROSPECT_CLIENT"]"#.to_string()),
            email_template_id: None,
            email_delai_jours: Some(0),
            email_envoi_prevu: None,
            email_envoi_heure: None,
            email_envoi_jours_semaine: None,
            email_actif: Some(false),
            is_default: Some(true),
            actif: None,
            segment_id: None,
            rendement_cible: None,
        })?;
        created += 1;

        // 9. Suivi > 6 mois (jaune) - Pour les prospects non contactés depuis plus de 6 mois
        self.create_etiquette(NewEtiquette {
            nom: "Suivi > 6 mois".to_string(),
            couleur: Some("#EAB308".to_string()),
            icone: Some("🟡".to_string()),
            description: Some("Prospect/Suspect non contacté depuis plus de 6 mois".to_string()),
            priorite: Some(95),
            auto_condition_type: Some("DELAI_SANS_CONTACT".to_string()),
            auto_condition_config: Some(r#"{"jours": 180}"#.to_string()),
            auto_categories: Some(
                r#"["PROSPECT_CLIENT", "PROSPECT_FILLEUL", "SUSPECT_CLIENT", "SUSPECT_FILLEUL"]"#
                    .to_string(),
            ),
            email_template_id: None,
            email_delai_jours: Some(0),
            email_envoi_prevu: None,
            email_envoi_heure: None,
            email_envoi_jours_semaine: None,
            email_actif: Some(false),
            is_default: Some(true),
            actif: None,
            segment_id: None,
            rendement_cible: None,
        })?;
        created += 1;

        total += created;
        total += self.ensure_default_etiquettes()?;
        total += self.merge_duplicate_reduction_impot_etiquettes()?;
        let _ = self.ensure_default_segments_and_alerte_links();
        Ok(total)
    }

    fn etiquette_nom_normalized(nom: &str) -> String {
        normalize_contact_name(nom)
    }

    fn is_reduction_impot_etiquette_variant(nom: &str) -> bool {
        let key = Self::etiquette_nom_normalized(nom);
        if key.is_empty() {
            return false;
        }
        if key == Self::etiquette_nom_normalized(REDUCTION_IMPOT_ETIQUETTE_CANONICAL) {
            return true;
        }
        const ALIASES: &[&str] = &[
            "RDV FIN D ANNEE",
            "REDUCTION D IMPOT FIN D ANNEE",
            "REDUCTION D IMPOT",
        ];
        if ALIASES.contains(&key.as_str()) {
            return true;
        }
        if key.starts_with("RDV FIN") {
            return true;
        }
        key.contains("REDUCTION") && key.contains("IMPOT")
    }

    fn merge_etiquette_assignments(&self, from_id: i64, into_id: i64) -> Result<()> {
        if from_id == into_id {
            return Ok(());
        }
        self.conn.execute(
            "INSERT INTO contact_etiquettes (contact_id, etiquette_id, attribue_par, date_attribution, email_envoye, email_date_prevue, email_date_envoi, notes)
             SELECT contact_id, ?1, attribue_par, date_attribution, email_envoye, email_date_prevue, email_date_envoi, notes
             FROM contact_etiquettes WHERE etiquette_id = ?2
             ON CONFLICT(contact_id, etiquette_id) DO NOTHING",
            params![into_id, from_id],
        )?;
        self.conn.execute(
            "DELETE FROM contact_etiquettes WHERE etiquette_id = ?1",
            params![from_id],
        )?;
        Ok(())
    }

    /// Fusionne les doublons « réduction d'impôt » / « RDV fin d'année » vers l'étiquette canonique.
    pub fn merge_duplicate_reduction_impot_etiquettes(&self) -> Result<usize> {
        let mut stmt = self
            .conn
            .prepare("SELECT id, nom FROM etiquettes ORDER BY id ASC")?;
        let rows: Vec<(i64, String)> = stmt
            .query_map([], |row| Ok((row.get(0)?, row.get(1)?)))?
            .collect::<Result<Vec<_>>>()?;

        let variants: Vec<(i64, String)> = rows
            .into_iter()
            .filter(|(_, nom)| Self::is_reduction_impot_etiquette_variant(nom))
            .collect();

        if variants.len() <= 1 {
            return Ok(0);
        }

        let canonical_key = Self::etiquette_nom_normalized(REDUCTION_IMPOT_ETIQUETTE_CANONICAL);
        let keeper_id = variants
            .iter()
            .find(|(_, nom)| Self::etiquette_nom_normalized(nom) == canonical_key)
            .map(|(id, _)| *id)
            .unwrap_or(variants[0].0);

        let mut merged = 0;
        for (dup_id, nom) in &variants {
            if *dup_id == keeper_id {
                continue;
            }
            self.merge_etiquette_assignments(*dup_id, keeper_id)?;
            self.conn
                .execute("DELETE FROM etiquettes WHERE id = ?1", params![dup_id])?;
            merged += 1;
            println!(
                "🏷️ Doublon étiquette fusionné : « {} » (id {}) → « {} » (id {})",
                nom, dup_id, REDUCTION_IMPOT_ETIQUETTE_CANONICAL, keeper_id
            );
        }

        if keeper_id > 0 {
            let _ = self.conn.execute(
                "UPDATE etiquettes SET nom = ?1, description = ?2, is_default = 1 WHERE id = ?3",
                params![
                    REDUCTION_IMPOT_ETIQUETTE_CANONICAL,
                    "Période de réduction d'impôt fin d'année (oct-nov)",
                    keeper_id
                ],
            );
        }

        Ok(merged)
    }

    /// Vérifie et crée les étiquettes par défaut manquantes (migration pour bases existantes).
    /// Ne modifie pas la config des étiquettes déjà présentes (personnalisation utilisateur).
    /// Retourne le nombre d'étiquettes créées.
    pub fn ensure_default_etiquettes(&self) -> Result<usize> {
        // Vérifier si la table existe
        let table_exists: i64 = self
            .conn
            .query_row(
                "SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name='etiquettes'",
                [],
                |row| row.get(0),
            )
            .unwrap_or(0);

        if table_exists == 0 {
            return Ok(0);
        }

        let mut changes = 0;

        // Étiquettes par défaut : création uniquement si le nom n'existe pas (config non écrasée).
        let default_etiquettes = vec![
            (
                "Suivi > 1 an",
                "#EF4444",
                "🔴",
                "Client contacté, mais plus d'un an sans nouvel échange",
                100,
                "DELAI_SANS_CONTACT",
                r#"{"jours": 365, "inclure_sans_date": false}"#,
                r#"["CLIENT"]"#,
            ),
            (
                "Jamais suivi",
                "#EF4444",
                "🔴",
                "Client sans date de dernier contact enregistrée",
                99,
                "JAMAIS_CONTACT",
                r#"{}"#,
                r#"["CLIENT"]"#,
            ),
            (
                "Suivi > 6 mois",
                "#EAB308",
                "🟡",
                "Prospect/Suspect non contacté depuis plus de 6 mois",
                95,
                "DELAI_SANS_CONTACT",
                r#"{"jours": 180}"#,
                r#"["PROSPECT_CLIENT", "PROSPECT_FILLEUL", "SUSPECT_CLIENT", "SUSPECT_FILLEUL"]"#,
            ),
            (
                "Suivi à planifier",
                "#F97316",
                "📅",
                "Date de prochain suivi dans moins de 30 jours",
                90,
                "DATE_APPROCHE",
                r#"{"champ": "date_prochain_suivi", "jours_avant": 30}"#,
                r#"["CLIENT", "PROSPECT_CLIENT"]"#,
            ),
            (
                "Fin démembrement",
                "#3B82F6",
                "🏠",
                "Fin de démembrement dans moins de 6 mois",
                85,
                "DATE_APPROCHE_INVESTISSEMENT",
                r#"{"champ": "date_fin_demembrement", "jours_avant": 180, "types_produit": ["SCPI_DEMEMBREMENT"]}"#,
                r#"["CLIENT"]"#,
            ),
            (
                "Fin de prêt",
                "#06B6D4",
                "💰",
                "Fin de prêt immobilier/SCPI dans moins d'un an",
                80,
                "DATE_APPROCHE_INVESTISSEMENT",
                r#"{"champ": "date_fin_pret", "jours_avant": 365, "types_produit": ["SCPI", "SCPI_FISCALE", "SCPI_DEMEMBREMENT", "IMMOBILIER", "PINEL", "DENORMANDIE", "JEANBRUN", "MALRAUX", "MONUMENT_HISTORIQUE", "DEFICIT_FONCIER", "LMNP", "LMP", "NUE_PROPRIETE", "RESIDENCE_PRINCIPALE", "LOCATIF_CLASSIQUE"]}"#,
                r#"["CLIENT"]"#,
            ),
            (
                "Alerte 69 ans",
                "#EC4899",
                "🎂",
                "Client approchant 69 ans (assurance-vie)",
                75,
                "AGE_APPROCHE",
                r#"{"age": 69, "jours_avant": 30}"#,
                r#"["CLIENT"]"#,
            ),
            (
                "Déclaration IR",
                "#8B5CF6",
                "📋",
                "Période de déclaration d'impôts (avril-mai)",
                70,
                "PERIODE_ANNEE",
                r#"{"mois_debut": 4, "mois_fin": 5}"#,
                r#"["CLIENT"]"#,
            ),
            (
                "Réduction d'impôt fin d'année",
                "#10B981",
                "🎯",
                "Période de réduction d'impôt fin d'année (oct-nov)",
                60,
                "PERIODE_ANNEE",
                r#"{"mois_debut": 10, "mois_fin": 11}"#,
                r#"["CLIENT", "PROSPECT_CLIENT"]"#,
            ),
        ];

        // Renommer l'ancienne étiquette par défaut si elle existe encore
        let _ = self.conn.execute(
            "UPDATE etiquettes SET nom = ?1, description = ?2 WHERE nom = ?3",
            params![
                "Réduction d'impôt fin d'année",
                "Période de réduction d'impôt fin d'année (oct-nov)",
                "RDV fin d'année"
            ],
        );

        for (
            nom,
            couleur,
            icone,
            description,
            priorite,
            condition_type,
            condition_config,
            categories,
        ) in default_etiquettes
        {
            // Vérifier si l'étiquette existe déjà (par nom)
            let existing: Option<(i64, Option<String>)> = self
                .conn
                .query_row(
                    "SELECT id, auto_condition_config FROM etiquettes WHERE LOWER(TRIM(nom)) = LOWER(TRIM(?1))",
                    params![nom],
                    |row| Ok((row.get(0)?, row.get(1)?)),
                )
                .ok();

            match existing {
                Some((_id, _current_config)) => {
                    // Ne pas écraser la config personnalisée de l'utilisateur
                }
                None => {
                    // Créer l'étiquette manquante
                    if self
                        .create_etiquette(NewEtiquette {
                            nom: nom.to_string(),
                            couleur: Some(couleur.to_string()),
                            icone: Some(icone.to_string()),
                            description: Some(description.to_string()),
                            priorite: Some(priorite),
                            auto_condition_type: Some(condition_type.to_string()),
                            auto_condition_config: Some(condition_config.to_string()),
                            auto_categories: Some(categories.to_string()),
                            email_template_id: None,
                            email_delai_jours: Some(0),
                            email_envoi_prevu: None,
                            email_envoi_heure: None,
                            email_envoi_jours_semaine: None,
                            email_actif: Some(false),
                            is_default: Some(true),
                actif: None,
                segment_id: None,
                rendement_cible: None,
            })
                        .is_ok()
                    {
                        changes += 1;
                        println!("🏷️ Étiquette par défaut '{}' créée", nom);
                    }
                }
            }
        }

        // Ancienne base : « Suivi > 1 an » ne doit plus couvrir les contacts sans date
        if self
            .conn
            .execute(
                "UPDATE etiquettes SET auto_condition_config = ?1,
                        description = ?2
                 WHERE LOWER(TRIM(nom)) = LOWER(TRIM('Suivi > 1 an'))
                   AND is_default = 1
                   AND (auto_condition_config = ?3 OR auto_condition_config = ?4 OR auto_condition_config = ?5)",
                params![
                    r#"{"jours": 365, "inclure_sans_date": false}"#,
                    "Client contacté, mais plus d'un an sans nouvel échange",
                    r#"{"jours": 365}"#,
                    r#"{"jours":365}"#,
                    r#"{"jours": 365, "inclure_sans_date": true}"#,
                ],
            )
            .is_ok()
        {
            changes += self.conn.changes() as usize;
        }

        // Ancienne base : « Suivi > 6 mois » partageait l'orange avec « Suivi à planifier »
        if self
            .conn
            .execute(
                "UPDATE etiquettes SET couleur = '#EAB308', icone = '🟡'
                 WHERE LOWER(TRIM(nom)) = LOWER(TRIM('Suivi > 6 mois'))
                   AND is_default = 1
                   AND couleur = '#F97316'",
                [],
            )
            .is_ok()
        {
            changes += self.conn.changes() as usize;
        }

        changes += self.merge_duplicate_reduction_impot_etiquettes()?;

        if changes > 0 {
            println!("🏷️ Migration: {} étiquettes créées/mises à jour", changes);
        }

        Ok(changes)
    }
}
