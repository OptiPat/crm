use super::{
    email_schedule::{
        normalize_email_envoi_jours_semaine, normalize_email_heure,
        resolve_email_date_prevue_for_contact,
    },
    models::{ContactEtiquetteDetails, Etiquette, EtiquetteWithCount, NewEtiquette},
    Database,
};
use rusqlite::{params, Result};

impl Database {
    // ==================== ETIQUETTES ====================

    const ETIQUETTE_SELECT_COLS: &'static str = "id, nom, couleur, icone, description, priorite,
                    auto_condition_type, auto_condition_config, auto_categories,
                    email_template_id, email_delai_jours, email_envoi_prevu, email_envoi_heure,
                    email_envoi_jours_semaine, email_actif, is_default, actif, segment_id,
                    pipeline_actif, created_at, updated_at";

    fn map_etiquette_from_row(row: &rusqlite::Row<'_>) -> rusqlite::Result<Etiquette> {
        Ok(Etiquette {
            id: row.get(0)?,
            nom: row.get(1)?,
            couleur: row.get(2)?,
            icone: row.get(3)?,
            description: row.get(4)?,
            priorite: row.get(5)?,
            auto_condition_type: row.get(6)?,
            auto_condition_config: row.get(7)?,
            auto_categories: row.get(8)?,
            email_template_id: row.get(9)?,
            email_delai_jours: row.get(10)?,
            email_envoi_prevu: row.get(11)?,
            email_envoi_heure: row.get(12)?,
            email_envoi_jours_semaine: row.get(13)?,
            email_actif: row.get::<_, i64>(14)? != 0,
            is_default: row.get::<_, i64>(15)? != 0,
            actif: row.get::<_, i64>(16)? != 0,
            segment_id: row.get(17)?,
            pipeline_actif: row.get::<_, i64>(18)? != 0,
            created_at: row.get(19)?,
            updated_at: row.get(20)?,
        })
    }

    fn normalized_email_envoi_jours_semaine_field(
        etiquette: &NewEtiquette,
    ) -> Option<String> {
        etiquette
            .email_envoi_jours_semaine
            .as_ref()
            .and_then(|s| normalize_email_envoi_jours_semaine(s))
    }

    fn normalized_email_campaign_fields(
        etiquette: &NewEtiquette,
    ) -> (Option<i64>, Option<String>) {
        let heure = etiquette
            .email_envoi_heure
            .as_ref()
            .and_then(|s| normalize_email_heure(s));
        if heure.is_some() {
            return (None, heure);
        }
        (etiquette.email_envoi_prevu, None)
    }

    /// Retire les attributions automatiques d'une étiquette (désactivation). Conserve les tags MANUEL.
    pub fn remove_auto_assignments_for_etiquette(&self, etiquette_id: i64) -> Result<usize> {
        let n = self.conn.execute(
            "DELETE FROM contact_etiquettes WHERE etiquette_id = ?1 AND UPPER(TRIM(attribue_par)) != 'MANUEL'",
            params![etiquette_id],
        )?;
        Ok(n)
    }

    pub(crate) fn sync_pending_email_dates_for_etiquette(&self, etiquette_id: i64) -> Result<()> {
        let etiquette = self.get_etiquette_by_id(etiquette_id)?;
        if !etiquette.email_actif {
            return Ok(());
        }

        if crate::email::stellium_exceltis::is_exceltis_etiquette_nom(&etiquette.nom) {
            self.sync_exceltis_etiquette_email_schedule(etiquette_id)?;
            return Ok(());
        }

        if etiquette.email_envoi_prevu.is_some() {
            let fixed = etiquette.email_envoi_prevu;
            self.conn.execute(
                "UPDATE contact_etiquettes SET email_date_prevue = ?1
                 WHERE etiquette_id = ?2 AND email_envoye = 0 AND COALESCE(email_annule, 0) = 0
                   AND COALESCE(email_suivi_ignore, 0) = 0",
                params![fixed, etiquette_id],
            )?;
            return Ok(());
        }

        let mut stmt = self.conn.prepare(
            "SELECT id, date_attribution FROM contact_etiquettes
             WHERE etiquette_id = ?1 AND email_envoye = 0 AND COALESCE(email_annule, 0) = 0
               AND COALESCE(email_suivi_ignore, 0) = 0",
        )?;
        let rows: Vec<(i64, i64)> = stmt
            .query_map(params![etiquette_id], |row| Ok((row.get(0)?, row.get(1)?)))?
            .collect::<Result<Vec<_>, _>>()?;

        for (ce_id, date_attribution) in rows {
            let prevue =
                resolve_email_date_prevue_for_contact(&etiquette, date_attribution);
            self.conn.execute(
                "UPDATE contact_etiquettes SET email_date_prevue = ?1 WHERE id = ?2",
                params![prevue, ce_id],
            )?;
        }
        Ok(())
    }

    /// Recalcule les dates d'envoi pour toutes les campagnes email actives (après recalcul auto).
    pub(crate) fn sync_pending_email_dates_for_all_active_campaigns(&self) -> Result<()> {
        for etiquette in self.get_all_etiquettes()? {
            if etiquette.actif && etiquette.email_actif {
                self.sync_pending_email_dates_for_etiquette(etiquette.id)?;
            }
        }
        Ok(())
    }

    /// Planifie ou déplanifie la campagne email Exceltis selon un signal Stellium connu.
    pub(crate) fn sync_exceltis_etiquette_email_schedule(
        &self,
        etiquette_id: i64,
    ) -> Result<u32> {
        let etiquette = self.get_etiquette_by_id(etiquette_id)?;
        if !crate::email::stellium_exceltis::is_exceltis_etiquette_nom(&etiquette.nom) {
            return Ok(0);
        }

        let trigger_at = match crate::email::stellium_exceltis::stellium_signal_received_at_for_etiquette(
            self, etiquette_id,
        )
        .map_err(|e| {
            rusqlite::Error::ToSqlConversionFailure(Box::new(std::io::Error::new(
                std::io::ErrorKind::Other,
                e,
            )))
        })? {
            Some(ts) => ts,
            None => {
                self.conn.execute(
                    "UPDATE contact_etiquettes SET email_date_prevue = NULL
                     WHERE etiquette_id = ?1 AND email_envoye = 0
                       AND COALESCE(email_annule, 0) = 0
                       AND COALESCE(email_suivi_ignore, 0) = 0",
                    params![etiquette_id],
                )?;
                return Ok(0);
            }
        };

        let prevue = resolve_email_date_prevue_for_contact(&etiquette, trigger_at);
        let updated = self.conn.execute(
            "UPDATE contact_etiquettes SET email_date_prevue = ?1
             WHERE etiquette_id = ?2 AND email_envoye = 0
               AND COALESCE(email_annule, 0) = 0
               AND COALESCE(email_suivi_ignore, 0) = 0",
            params![prevue, etiquette_id],
        )?;
        Ok(updated as u32)
    }

    pub(crate) fn resolve_exceltis_contact_email_date_prevue(
        &self,
        etiquette: &Etiquette,
        etiquette_id: i64,
    ) -> Result<Option<i64>> {
        if !crate::email::stellium_exceltis::is_exceltis_etiquette_nom(&etiquette.nom) {
            return Ok(None);
        }
        let Some(trigger_at) =
            crate::email::stellium_exceltis::stellium_signal_received_at_for_etiquette(
                self, etiquette_id,
            )
            .map_err(|e| {
                rusqlite::Error::ToSqlConversionFailure(Box::new(std::io::Error::new(
                    std::io::ErrorKind::Other,
                    e,
                )))
            })?
        else {
            return Ok(None);
        };
        Ok(resolve_email_date_prevue_for_contact(etiquette, trigger_at))
    }

    /// Associe un template aux étiquettes choisies (vue « template → étiquettes »).
    pub fn set_template_etiquette_links(
        &self,
        template_id: i64,
        etiquette_ids: &[i64],
    ) -> Result<()> {
        self.conn.execute(
            "UPDATE etiquettes SET email_template_id = NULL WHERE email_template_id = ?1",
            params![template_id],
        )?;
        for &eid in etiquette_ids {
            self.conn.execute(
                "UPDATE etiquettes SET email_template_id = ?1 WHERE id = ?2",
                params![template_id, eid],
            )?;
        }
        Ok(())
    }

    pub fn get_etiquette_ids_for_template(&self, template_id: i64) -> Result<Vec<i64>> {
        let mut stmt = self
            .conn
            .prepare("SELECT id FROM etiquettes WHERE email_template_id = ?1 ORDER BY nom")?;
        let ids = stmt
            .query_map(params![template_id], |row| row.get(0))?
            .collect::<Result<Vec<_>, _>>()?;
        Ok(ids)
    }

    /// Récupérer toutes les étiquettes
    pub fn get_all_etiquettes(&self) -> Result<Vec<Etiquette>> {
        let sql = format!(
            "SELECT {} FROM etiquettes ORDER BY priorite DESC, nom ASC",
            Self::ETIQUETTE_SELECT_COLS
        );
        let mut stmt = self.conn.prepare(&sql)?;

        let etiquettes = stmt.query_map([], Self::map_etiquette_from_row)?;
        etiquettes.collect()
    }

    /// Récupérer toutes les étiquettes avec le compteur de contacts
    pub fn get_all_etiquettes_with_count(&self) -> Result<Vec<EtiquetteWithCount>> {
        let mut stmt = self.conn.prepare(
            "SELECT e.id, e.nom, e.couleur, e.icone, e.description, e.priorite,
                    e.auto_condition_type, e.auto_condition_config, e.auto_categories,
                    e.email_template_id, e.email_delai_jours, e.email_envoi_prevu, e.email_envoi_heure,
                    e.email_envoi_jours_semaine, e.email_actif, e.is_default, e.actif, e.segment_id,
                    e.created_at, e.updated_at,
                    COALESCE((SELECT COUNT(*) FROM contact_etiquettes ce WHERE ce.etiquette_id = e.id), 0) as contact_count
             FROM etiquettes e
             ORDER BY e.priorite DESC, e.nom ASC"
        )?;

        let etiquettes = stmt.query_map([], |row| {
            Ok(EtiquetteWithCount {
                id: row.get(0)?,
                nom: row.get(1)?,
                couleur: row.get(2)?,
                icone: row.get(3)?,
                description: row.get(4)?,
                priorite: row.get(5)?,
                auto_condition_type: row.get(6)?,
                auto_condition_config: row.get(7)?,
                auto_categories: row.get(8)?,
                email_template_id: row.get(9)?,
                email_delai_jours: row.get(10)?,
                email_envoi_prevu: row.get(11)?,
                email_envoi_heure: row.get(12)?,
                email_envoi_jours_semaine: row.get(13)?,
                email_actif: row.get::<_, i64>(14)? != 0,
                is_default: row.get::<_, i64>(15)? != 0,
                actif: row.get::<_, i64>(16)? != 0,
                segment_id: row.get(17)?,
                created_at: row.get(18)?,
                updated_at: row.get(19)?,
                contact_count: row.get(20)?,
            })
        })?;

        etiquettes.collect()
    }

    /// Récupérer une étiquette par son ID
    pub fn get_etiquette_by_id(&self, id: i64) -> Result<Etiquette> {
        let sql = format!(
            "SELECT {} FROM etiquettes WHERE id = ?1",
            Self::ETIQUETTE_SELECT_COLS
        );
        self.conn.query_row(&sql, params![id], Self::map_etiquette_from_row)
    }

    fn validate_etiquette_for_save(&self, etiquette: &NewEtiquette) -> Result<()> {
        if etiquette.nom.trim().is_empty() {
            return Err(rusqlite::Error::InvalidParameterName(
                "Le nom de l'étiquette est obligatoire".to_string(),
            ));
        }
        let is_auto = etiquette.actif.unwrap_or(true)
            && (etiquette.segment_id.is_some()
                || etiquette
                    .auto_condition_type
                    .as_ref()
                    .map(|t| !t.trim().is_empty())
                    .unwrap_or(false));
        if is_auto {
            if let Some(seg_id) = etiquette.segment_id {
                if self.get_segment_by_id(seg_id)?.is_none() {
                    return Err(rusqlite::Error::InvalidParameterName(
                        "Segment introuvable".to_string(),
                    ));
                }
            } else if etiquette.auto_condition_type.as_deref() == Some("RULE_TREE") {
                if let Some(cfg) = etiquette.auto_condition_config.as_ref() {
                    super::etiquette_rule_ast::parse_rule_json(
                        Some(cfg),
                        None,
                        None,
                        None,
                    )?;
                } else {
                    return Err(rusqlite::Error::InvalidParameterName(
                        "Règle combinée invalide".to_string(),
                    ));
                }
            } else {
                let categories: Vec<String> = etiquette
                    .auto_categories
                    .as_ref()
                    .and_then(|c| serde_json::from_str(c).ok())
                    .unwrap_or_default();
                if categories.is_empty() {
                    return Err(rusqlite::Error::InvalidParameterName(
                        "Au moins une catégorie de contact est requise pour une règle automatique"
                            .to_string(),
                    ));
                }
            }
        }
        if etiquette.email_actif.unwrap_or(false) {
            if etiquette.email_template_id.is_none() {
                return Err(rusqlite::Error::InvalidParameterName(
                    "Un template d'email est requis pour la campagne".to_string(),
                ));
            }
            let (prevu, heure) = Self::normalized_email_campaign_fields(etiquette);
            if prevu.is_none() && heure.is_none() {
                return Err(rusqlite::Error::InvalidParameterName(
                    "Indiquez une heure d'envoi (éligibilité) ou une date fixe de campagne".to_string(),
                ));
            }
        }
        Ok(())
    }

    /// Créer une nouvelle étiquette
    pub fn create_etiquette(&self, etiquette: NewEtiquette) -> Result<Etiquette> {
        self.validate_etiquette_for_save(&etiquette)?;
        if self.etiquette_nom_exists(&etiquette.nom, None)? {
            return Err(rusqlite::Error::InvalidParameterName(format!(
                "Une étiquette nommée « {} » existe déjà",
                etiquette.nom.trim()
            )));
        }

        let (email_envoi_prevu, email_envoi_heure) = Self::normalized_email_campaign_fields(&etiquette);
        let email_envoi_jours_semaine = Self::normalized_email_envoi_jours_semaine_field(&etiquette);
        let couleur = etiquette
            .couleur
            .unwrap_or_else(|| "#3B82F6".to_string());
        let priorite = etiquette.priorite.unwrap_or(0);
        let email_delai_jours = etiquette.email_delai_jours.unwrap_or(0);
        let email_actif = if etiquette.email_actif.unwrap_or(false) {
            1
        } else {
            0
        };
        let is_default = if etiquette.is_default.unwrap_or(false) {
            1
        } else {
            0
        };
        let actif = if etiquette.actif.unwrap_or(true) { 1 } else { 0 };

        self.conn.execute(
            "INSERT INTO etiquettes (nom, couleur, icone, description, priorite,
                                    auto_condition_type, auto_condition_config, auto_categories,
                                    email_template_id, email_delai_jours, email_envoi_prevu, email_envoi_heure,
                                    email_envoi_jours_semaine, email_actif, is_default, actif, segment_id) 
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, ?17)",
            params![
                &etiquette.nom,
                &couleur,
                &etiquette.icone,
                &etiquette.description,
                priorite,
                &etiquette.auto_condition_type,
                &etiquette.auto_condition_config,
                &etiquette.auto_categories,
                &etiquette.email_template_id,
                email_delai_jours,
                &email_envoi_prevu,
                &email_envoi_heure,
                &email_envoi_jours_semaine,
                email_actif,
                is_default,
                actif,
                etiquette.segment_id,
            ],
        )?;

        let id = self.conn.last_insert_rowid();
        let created = self.get_etiquette_by_id(id)?;
        if created.email_actif {
            self.sync_pending_email_dates_for_etiquette(id)?;
        }
        Ok(created)
    }

    /// Mettre à jour une étiquette
    pub fn update_etiquette(&self, id: i64, etiquette: &NewEtiquette) -> Result<Etiquette> {
        self.validate_etiquette_for_save(etiquette)?;
        if self.etiquette_nom_exists(&etiquette.nom, Some(id))? {
            return Err(rusqlite::Error::InvalidParameterName(format!(
                "Une étiquette nommée « {} » existe déjà",
                etiquette.nom.trim()
            )));
        }

        let couleur = etiquette
            .couleur
            .clone()
            .unwrap_or_else(|| "#3B82F6".to_string());
        let priorite = etiquette.priorite.unwrap_or(0);
        let email_delai_jours = etiquette.email_delai_jours.unwrap_or(0);
        let email_actif = if etiquette.email_actif.unwrap_or(false) {
            1
        } else {
            0
        };
        let is_default = if etiquette.is_default.unwrap_or(false) {
            1
        } else {
            0
        };
        let actif = if etiquette.actif.unwrap_or(true) { 1 } else { 0 };
        let (email_envoi_prevu, email_envoi_heure) = Self::normalized_email_campaign_fields(&etiquette);
        let email_envoi_jours_semaine = Self::normalized_email_envoi_jours_semaine_field(etiquette);

        self.conn.execute(
            "UPDATE etiquettes SET 
                nom = ?1,
                couleur = ?2,
                icone = ?3,
                description = ?4,
                priorite = ?5,
                auto_condition_type = ?6,
                auto_condition_config = ?7,
                auto_categories = ?8,
                email_template_id = ?9,
                email_delai_jours = ?10,
                email_envoi_prevu = ?11,
                email_envoi_heure = ?12,
                email_envoi_jours_semaine = ?13,
                email_actif = ?14,
                is_default = ?15,
                actif = ?16,
                segment_id = ?17,
                updated_at = unixepoch()
            WHERE id = ?18",
            params![
                &etiquette.nom,
                &couleur,
                &etiquette.icone,
                &etiquette.description,
                priorite,
                &etiquette.auto_condition_type,
                &etiquette.auto_condition_config,
                &etiquette.auto_categories,
                &etiquette.email_template_id,
                email_delai_jours,
                &email_envoi_prevu,
                &email_envoi_heure,
                &email_envoi_jours_semaine,
                email_actif,
                is_default,
                actif,
                etiquette.segment_id,
                id
            ],
        )?;

        if actif == 0 {
            let _ = self.remove_auto_assignments_for_etiquette(id)?;
        }

        let updated = self.get_etiquette_by_id(id)?;
        if updated.email_actif {
            self.sync_pending_email_dates_for_etiquette(id)?;
        }
        Ok(updated)
    }

    pub fn protect_newsletter_etiquette(&self, etiquette_id: i64) -> Result<()> {
        self.conn.execute(
            "UPDATE etiquettes SET is_default = 1 WHERE id = ?1 AND is_default = 0",
            params![etiquette_id],
        )?;
        Ok(())
    }

    /// Supprimer une étiquette (les étiquettes système `is_default` sont protégées).
    pub fn delete_etiquette(&self, id: i64) -> Result<()> {
        let is_default: i64 = self
            .conn
            .query_row(
                "SELECT is_default FROM etiquettes WHERE id = ?1",
                params![id],
                |row| row.get(0),
            )
            .unwrap_or(0);
        if is_default != 0 {
            return Err(rusqlite::Error::InvalidParameterName(
                "Les étiquettes fournies par défaut ne peuvent pas être supprimées. Désactivez la règle auto ou modifiez le nom si besoin.".to_string(),
            ));
        }
        let newsletter_linked: i64 = self
            .conn
            .query_row(
                "SELECT COUNT(*) FROM etiquettes e
                 INNER JOIN templates_email t ON e.email_template_id = t.id
                 WHERE e.id = ?1 AND t.categorie = 'NEWSLETTER'",
                params![id],
                |row| row.get(0),
            )
            .unwrap_or(0);
        if newsletter_linked > 0 {
            return Err(rusqlite::Error::InvalidParameterName(
                "L'étiquette Newsletter ne peut pas être supprimée (file d'envoi du module Newsletter)."
                    .to_string(),
            ));
        }
        self.conn
            .execute("DELETE FROM etiquettes WHERE id = ?1", params![id])?;
        Ok(())
    }

    /// Récupérer les étiquettes d'un contact
    pub fn get_etiquettes_by_contact(
        &self,
        contact_id: i64,
    ) -> Result<Vec<ContactEtiquetteDetails>> {
        let mut stmt = self.conn.prepare(
            "SELECT ce.id, ce.contact_id, ce.etiquette_id, 
                    e.nom, e.couleur, e.icone,
                    ce.date_attribution, ce.attribue_par, ce.email_envoye,
                    ce.email_date_prevue, ce.notes
             FROM contact_etiquettes ce
             INNER JOIN etiquettes e ON ce.etiquette_id = e.id
             WHERE ce.contact_id = ?1
             ORDER BY e.priorite DESC, e.nom ASC",
        )?;

        let etiquettes = stmt.query_map(params![contact_id], |row| {
            Ok(ContactEtiquetteDetails {
                id: row.get(0)?,
                contact_id: row.get(1)?,
                etiquette_id: row.get(2)?,
                etiquette_nom: row.get(3)?,
                etiquette_couleur: row.get(4)?,
                etiquette_icone: row.get(5)?,
                date_attribution: row.get(6)?,
                attribue_par: row.get(7)?,
                email_envoye: row.get::<_, i64>(8)? != 0,
                email_date_prevue: row.get(9)?,
                notes: row.get(10)?,
            })
        })?;

        etiquettes.collect()
    }

    /// Toutes les liaisons contact–étiquette (évite N appels IPC sur la liste Contacts).
    pub fn get_all_contact_etiquettes_details(
        &self,
    ) -> Result<Vec<ContactEtiquetteDetails>> {
        let mut stmt = self.conn.prepare(
            "SELECT ce.id, ce.contact_id, ce.etiquette_id, 
                    e.nom, e.couleur, e.icone,
                    ce.date_attribution, ce.attribue_par, ce.email_envoye,
                    ce.email_date_prevue, ce.notes
             FROM contact_etiquettes ce
             INNER JOIN etiquettes e ON ce.etiquette_id = e.id
             ORDER BY ce.contact_id, e.priorite DESC, e.nom ASC",
        )?;

        let etiquettes = stmt.query_map([], |row| {
            Ok(ContactEtiquetteDetails {
                id: row.get(0)?,
                contact_id: row.get(1)?,
                etiquette_id: row.get(2)?,
                etiquette_nom: row.get(3)?,
                etiquette_couleur: row.get(4)?,
                etiquette_icone: row.get(5)?,
                date_attribution: row.get(6)?,
                attribue_par: row.get(7)?,
                email_envoye: row.get::<_, i64>(8)? != 0,
                email_date_prevue: row.get(9)?,
                notes: row.get(10)?,
            })
        })?;

        etiquettes.collect()
    }

    fn etiquette_nom_exists(&self, nom: &str, exclude_id: Option<i64>) -> Result<bool> {
        let count: i64 = if let Some(id) = exclude_id {
            self.conn.query_row(
                "SELECT COUNT(*) FROM etiquettes WHERE LOWER(TRIM(nom)) = LOWER(TRIM(?1)) AND id != ?2",
                params![nom, id],
                |r| r.get(0),
            )?
        } else {
            self.conn.query_row(
                "SELECT COUNT(*) FROM etiquettes WHERE LOWER(TRIM(nom)) = LOWER(TRIM(?1))",
                params![nom],
                |r| r.get(0),
            )?
        };
        Ok(count > 0)
    }

    pub fn get_etiquette_id_by_nom_insensitive(&self, nom: &str) -> Result<Option<i64>> {
        match self.conn.query_row(
            "SELECT id FROM etiquettes WHERE LOWER(TRIM(nom)) = LOWER(TRIM(?1))",
            params![nom],
            |r| r.get(0),
        ) {
            Ok(id) => Ok(Some(id)),
            Err(rusqlite::Error::QueryReturnedNoRows) => Ok(None),
            Err(e) => Err(e),
        }
    }

}
