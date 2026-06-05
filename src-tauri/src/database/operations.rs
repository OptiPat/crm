use super::{
    email_schedule::{
        normalize_email_envoi_jours_semaine, normalize_email_heure,
        resolve_email_date_prevue_for_contact,
    },
    models::{
        Contact, ContactEtiquette, ContactEtiquetteDetails, Etiquette, EtiquetteEmailQueueItem,
        EtiquetteWithCount, NewContact, NewEtiquette,
    },
    Database,
};
use crate::contact_name::normalize_contact_name;
use crate::newsletter::db::{
    is_newsletter_unsubscribe_request, ContactAudienceRow, LastNewsletterEditionDuplicate,
    NewsletterAudienceFilters, NewsletterAudienceMember, NewsletterAudiencePreview,
    NewsletterEditionDetail, NewsletterEditionRecipient, NewsletterEditionSummary,
    NewsletterEligibleContact, NewsletterUnsubscribedContact, QueuedNewsletterContact,
};
use rusqlite::{params, OptionalExtension, Result};

const REDUCTION_IMPOT_ETIQUETTE_CANONICAL: &str = "Réduction d'impôt fin d'année";

pub(crate) const EFFECTIVE_ENCOURS_SQL_I: &str = "COALESCE(
    (SELECT v.montant FROM investissement_valorisations v WHERE v.investissement_id = i.id ORDER BY v.date_valorisation DESC, v.id DESC LIMIT 1),
    i.montant_initial,
    0
)";

impl Database {
    fn validate_contact_identity(nom: &str, prenom: &str) -> Result<()> {
        if nom.trim().is_empty() || prenom.trim().is_empty() {
            return Err(rusqlite::Error::InvalidParameterName(
                "Le nom et le prénom sont obligatoires".to_string(),
            ));
        }
        Ok(())
    }

    pub fn get_all_contacts(&self) -> Result<Vec<Contact>> {
        use super::contact_row::{map_contact_row, CONTACT_SELECT};

        let mut stmt = self.conn.prepare(&format!(
            "SELECT {CONTACT_SELECT} FROM contacts ORDER BY created_at DESC"
        ))?;

        let contacts = stmt.query_map([], map_contact_row)?;

        contacts.collect()
    }

    pub fn create_contact(&self, new_contact: NewContact) -> Result<Contact> {
        use chrono::{DateTime, Utc};

        Self::validate_contact_identity(&new_contact.nom, &new_contact.prenom)?;

        let statut = new_contact.statut_suivi.unwrap_or("ACTIF".to_string());

        // Convertir les dates ISO string en timestamps Unix - CLIENTS
        let date_dernier_contact_timestamp =
            new_contact.date_dernier_contact.and_then(|date_str| {
                DateTime::parse_from_rfc3339(&date_str)
                    .ok()
                    .map(|dt| dt.timestamp())
            });

        let date_prochain_suivi_timestamp = new_contact.date_prochain_suivi.and_then(|date_str| {
            DateTime::parse_from_rfc3339(&date_str)
                .ok()
                .map(|dt| dt.timestamp())
        });

        // Convertir les dates ISO string en timestamps Unix - FILLEULS
        let date_dernier_contact_filleul_timestamp = new_contact
            .date_dernier_contact_filleul
            .and_then(|date_str| {
                DateTime::parse_from_rfc3339(&date_str)
                    .ok()
                    .map(|dt| dt.timestamp())
            });

        let date_prochain_suivi_filleul_timestamp = new_contact
            .date_prochain_suivi_filleul
            .and_then(|date_str| {
                DateTime::parse_from_rfc3339(&date_str)
                    .ok()
                    .map(|dt| dt.timestamp())
            });

        let date_naissance_timestamp = new_contact.date_naissance.and_then(|date_str| {
            DateTime::parse_from_rfc3339(&date_str)
                .ok()
                .map(|dt| dt.timestamp())
        });

        let registre = super::contact_row::normalize_contact_registre(new_contact.registre.as_deref());

        self.conn.execute(
            "INSERT INTO contacts (
                famille_id, foyer_id, role_foyer, role_famille, categorie, filleul_categorie, parrain_id, prescripteur_id, civilite, nom, prenom, email, telephone,
                adresse, code_postal, ville, date_naissance, profession, situation_familiale,
                source_lead, profil_risque_sri, date_dernier_contact, date_prochain_suivi,
                date_dernier_contact_filleul, date_prochain_suivi_filleul,
                statut_suivi, registre, notes
            ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, ?17, ?18, ?19, ?20, ?21, ?22, ?23, ?24, ?25, ?26, ?27, ?28)",
            params![
                new_contact.famille_id,
                new_contact.foyer_id,
                new_contact.role_foyer,
                new_contact.role_famille,
                new_contact.categorie,
                new_contact.filleul_categorie,
                new_contact.parrain_id,
                new_contact.prescripteur_id,
                new_contact.civilite,
                new_contact.nom,
                new_contact.prenom,
                new_contact.email,
                new_contact.telephone,
                new_contact.adresse,
                new_contact.code_postal,
                new_contact.ville,
                date_naissance_timestamp,
                new_contact.profession,
                new_contact.situation_familiale,
                new_contact.source_lead,
                new_contact.profil_risque_sri,
                date_dernier_contact_timestamp,
                date_prochain_suivi_timestamp,
                date_dernier_contact_filleul_timestamp,
                date_prochain_suivi_filleul_timestamp,
                statut,
                registre,
                new_contact.notes,
            ],
        )?;

        let id = self.conn.last_insert_rowid();

        // Récupérer le contact créé
        self.get_contact_by_id(id)
    }

    pub fn get_contact_by_id(&self, id: i64) -> Result<Contact> {
        use super::contact_row::{map_contact_row, CONTACT_SELECT};

        self.conn.query_row(
            &format!("SELECT {CONTACT_SELECT} FROM contacts WHERE id = ?1"),
            params![id],
            map_contact_row,
        )
    }

    pub fn delete_contact(&self, id: i64) -> Result<()> {
        // 1. Récupérer le foyer_id du contact avant suppression
        let foyer_id: Option<i64> = self
            .conn
            .query_row(
                "SELECT foyer_id FROM contacts WHERE id = ?1",
                params![id],
                |row| row.get(0),
            )
            .ok();

        // 2. Supprimer les investissements liés directement au contact
        self.conn.execute(
            "DELETE FROM investissements WHERE contact_id = ?1",
            params![id],
        )?;

        // 3. 🔥 Nettoyer les références prescripteur_id (mettre à NULL)
        self.conn.execute(
            "UPDATE contacts SET prescripteur_id = NULL WHERE prescripteur_id = ?1",
            params![id],
        )?;

        // 4. 🔥 Nettoyer les références parrain_id (mettre à NULL)
        self.conn.execute(
            "UPDATE contacts SET parrain_id = NULL WHERE parrain_id = ?1",
            params![id],
        )?;

        // 5. Supprimer le contact
        self.conn
            .execute("DELETE FROM contacts WHERE id = ?1", params![id])?;

        // 6. Si le contact avait un foyer, vérifier s'il reste des membres
        if let Some(fid) = foyer_id {
            let remaining_members: i64 = self
                .conn
                .query_row(
                    "SELECT COUNT(*) FROM contacts WHERE foyer_id = ?1",
                    params![fid],
                    |row| row.get(0),
                )
                .unwrap_or(0);

            // Si plus aucun membre, supprimer le foyer (et ses investissements)
            if remaining_members == 0 {
                self.delete_foyer(fid)?;
            }
        }

        Ok(())
    }

    pub fn find_contact_by_email(&self, email: &str) -> Result<Option<Contact>> {
        use super::contact_row::{map_contact_row, CONTACT_SELECT};

        match self.conn.query_row(
            &format!("SELECT {CONTACT_SELECT} FROM contacts WHERE email = ?1"),
            params![email],
            map_contact_row,
        ) {
            Ok(contact) => Ok(Some(contact)),
            Err(rusqlite::Error::QueryReturnedNoRows) => Ok(None),
            Err(e) => Err(e),
        }
    }

    pub fn delete_all_contacts(&self) -> Result<usize> {
        // 1. Supprimer tous les investissements (liés aux contacts ET aux foyers)
        self.conn.execute("DELETE FROM investissements", [])?;

        // 2. Supprimer tous les foyers
        self.conn.execute("DELETE FROM foyers", [])?;

        // 3. Supprimer tous les contacts
        let count = self.conn.execute("DELETE FROM contacts", [])?;
        Ok(count)
    }

    /// 🔥 Nettoyer les investissements orphelins (sans contact ni foyer valide)
    pub fn cleanup_orphaned_investments(&self) -> Result<usize> {
        // Supprimer les investissements dont le contact_id n'existe plus
        let deleted_contact = self.conn.execute(
            "DELETE FROM investissements WHERE contact_id IS NOT NULL AND contact_id NOT IN (SELECT id FROM contacts)",
            []
        )?;

        // Supprimer les investissements dont le foyer_id n'existe plus
        let deleted_foyer = self.conn.execute(
            "DELETE FROM investissements WHERE foyer_id IS NOT NULL AND foyer_id NOT IN (SELECT id FROM foyers)",
            []
        )?;

        println!("🧹 Nettoyage: {} investissements contact orphelins, {} investissements foyer orphelins supprimés", 
            deleted_contact, deleted_foyer);

        Ok(deleted_contact + deleted_foyer)
    }

    /// 🔥 Nettoyer les foyers orphelins (sans membres)
    pub fn cleanup_orphaned_foyers(&self) -> Result<usize> {
        // D'abord supprimer les investissements liés à ces foyers orphelins
        self.conn.execute(
            "DELETE FROM investissements WHERE foyer_id IN (
                SELECT f.id FROM foyers f 
                WHERE NOT EXISTS (SELECT 1 FROM contacts c WHERE c.foyer_id = f.id)
            )",
            [],
        )?;

        // Puis supprimer les foyers sans membres
        let deleted = self.conn.execute(
            "DELETE FROM foyers WHERE id NOT IN (SELECT DISTINCT foyer_id FROM contacts WHERE foyer_id IS NOT NULL)",
            []
        )?;

        println!("🧹 Nettoyage: {} foyers orphelins supprimés", deleted);

        Ok(deleted)
    }

    /// 🔥 Nettoyage complet des données orphelines
    pub fn cleanup_all_orphaned_data(&self) -> Result<(usize, usize)> {
        let foyers = self.cleanup_orphaned_foyers()?;
        let investments = self.cleanup_orphaned_investments()?;
        Ok((foyers, investments))
    }

    pub fn update_contact(&self, id: i64, contact: &NewContact) -> Result<Contact> {
        use chrono::DateTime;

        Self::validate_contact_identity(&contact.nom, &contact.prenom)?;

        // Convertir les dates ISO string en timestamps Unix - CLIENTS
        let date_dernier_contact_timestamp =
            contact.date_dernier_contact.as_ref().and_then(|date_str| {
                DateTime::parse_from_rfc3339(date_str)
                    .ok()
                    .map(|dt| dt.timestamp())
            });

        let date_prochain_suivi_timestamp =
            contact.date_prochain_suivi.as_ref().and_then(|date_str| {
                DateTime::parse_from_rfc3339(date_str)
                    .ok()
                    .map(|dt| dt.timestamp())
            });

        // Convertir les dates ISO string en timestamps Unix - FILLEULS
        let date_dernier_contact_filleul_timestamp = contact
            .date_dernier_contact_filleul
            .as_ref()
            .and_then(|date_str| {
                DateTime::parse_from_rfc3339(date_str)
                    .ok()
                    .map(|dt| dt.timestamp())
            });

        let date_prochain_suivi_filleul_timestamp = contact
            .date_prochain_suivi_filleul
            .as_ref()
            .and_then(|date_str| {
                DateTime::parse_from_rfc3339(date_str)
                    .ok()
                    .map(|dt| dt.timestamp())
            });

        // 🔥 statut_suivi est NOT NULL, donc on met une valeur par défaut
        let statut_suivi = contact
            .statut_suivi
            .clone()
            .unwrap_or_else(|| "ACTIF".to_string());

        let date_naissance_timestamp = contact.date_naissance.as_ref().and_then(|date_str| {
            DateTime::parse_from_rfc3339(date_str)
                .ok()
                .map(|dt| dt.timestamp())
        });

        self.conn.execute(
            "UPDATE contacts SET 
                famille_id = ?1,
                foyer_id = ?2,
                categorie = ?3,
                filleul_categorie = ?4,
                parrain_id = ?5,
                prescripteur_id = ?6,
                civilite = ?7,
                nom = ?8,
                prenom = ?9,
                email = ?10,
                telephone = ?11,
                adresse = ?12,
                code_postal = ?13,
                ville = ?14,
                date_naissance = ?15,
                profession = ?16,
                situation_familiale = ?17,
                source_lead = ?18,
                profil_risque_sri = ?19,
                date_dernier_contact = ?20,
                date_prochain_suivi = ?21,
                date_dernier_contact_filleul = ?22,
                date_prochain_suivi_filleul = ?23,
                statut_suivi = ?24,
                registre = ?25,
                notes = ?26,
                role_foyer = ?27,
                role_famille = ?28,
                updated_at = unixepoch()
            WHERE id = ?29",
            params![
                &contact.famille_id,
                &contact.foyer_id,
                &contact.categorie,
                &contact.filleul_categorie,
                &contact.parrain_id,
                &contact.prescripteur_id,
                &contact.civilite,
                &contact.nom,
                &contact.prenom,
                &contact.email,
                &contact.telephone,
                &contact.adresse,
                &contact.code_postal,
                &contact.ville,
                date_naissance_timestamp,
                &contact.profession,
                &contact.situation_familiale,
                &contact.source_lead,
                &contact.profil_risque_sri,
                date_dernier_contact_timestamp,
                date_prochain_suivi_timestamp,
                date_dernier_contact_filleul_timestamp,
                date_prochain_suivi_filleul_timestamp,
                &statut_suivi,
                super::contact_row::normalize_contact_registre(contact.registre.as_deref()),
                &contact.notes,
                &contact.role_foyer,
                &contact.role_famille,
                id
            ],
        )?;

        self.auto_close_obsolete_suivi_alertes_for_contact(id)?;
        self.get_contact_by_id(id)
    }

    // ==================== ETIQUETTES ====================

    const ETIQUETTE_SELECT_COLS: &'static str = "id, nom, couleur, icone, description, priorite,
                    auto_condition_type, auto_condition_config, auto_categories,
                    email_template_id, email_delai_jours, email_envoi_prevu, email_envoi_heure,
                    email_envoi_jours_semaine, email_actif, is_default, actif, segment_id,
                    created_at, updated_at";

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
            created_at: row.get(18)?,
            updated_at: row.get(19)?,
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

    fn sync_pending_email_dates_for_etiquette(&self, etiquette_id: i64) -> Result<()> {
        let etiquette = self.get_etiquette_by_id(etiquette_id)?;
        if !etiquette.email_actif {
            return Ok(());
        }

        if etiquette.email_envoi_prevu.is_some() {
            let fixed = etiquette.email_envoi_prevu;
            self.conn.execute(
                "UPDATE contact_etiquettes SET email_date_prevue = ?1
                 WHERE etiquette_id = ?2 AND email_envoye = 0 AND COALESCE(email_annule, 0) = 0",
                params![fixed, etiquette_id],
            )?;
            return Ok(());
        }

        let mut stmt = self.conn.prepare(
            "SELECT id, date_attribution FROM contact_etiquettes
             WHERE etiquette_id = ?1 AND email_envoye = 0 AND COALESCE(email_annule, 0) = 0",
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

    pub fn count_contacts_for_etiquette(&self, etiquette_id: i64) -> Result<u32> {
        let count: i64 = self.conn.query_row(
            "SELECT COUNT(DISTINCT contact_id) FROM contact_etiquettes WHERE etiquette_id = ?1",
            params![etiquette_id],
            |r| r.get(0),
        )?;
        Ok(count.max(0) as u32)
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
        let email_date_prevue = resolve_email_date_prevue_for_contact(&etiquette, eligible_at);

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
        use super::contact_row::{map_contact_row, CONTACT_SELECT};

        let mut stmt = self.conn.prepare(&format!(
            "SELECT {CONTACT_SELECT}
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
            auto_condition_config: Some(r#"{"champ": "date_fin_pret", "jours_avant": 365, "types_produit": ["SCPI", "SCPI_FISCALE", "SCPI_DEMEMBREMENT", "IMMOBILIER", "PINEL", "DENORMANDIE", "MALRAUX", "MONUMENT_HISTORIQUE", "DEFICIT_FONCIER", "LMNP", "LMP", "NUE_PROPRIETE", "RESIDENCE_PRINCIPALE", "LOCATIF_CLASSIQUE"]}"#.to_string()),
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
                r#"{"champ": "date_fin_pret", "jours_avant": 365, "types_produit": ["SCPI", "SCPI_FISCALE", "SCPI_DEMEMBREMENT", "IMMOBILIER", "PINEL", "DENORMANDIE", "MALRAUX", "MONUMENT_HISTORIQUE", "DEFICIT_FONCIER", "LMNP", "LMP", "NUE_PROPRIETE", "RESIDENCE_PRINCIPALE", "LOCATIF_CLASSIQUE"]}"#,
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

    // ==================== MOTEUR AUTOMATIQUE ETIQUETTES ====================

    /// Investissements du contact OU du foyer commun (si le contact est membre du foyer).
    const INVESTISSEMENT_SCOPE_WHERE: &'static str =
        "(contact_id = ?1 OR (?2 IS NOT NULL AND foyer_id = ?2))";

    pub(crate) fn contact_has_investment_types(
        &self,
        contact_id: i64,
        foyer_id: Option<i64>,
        types: &[String],
    ) -> Result<bool> {
        if types.is_empty() {
            return Ok(false);
        }
        let types_str = types
            .iter()
            .map(|t| format!("'{}'", t.replace('\'', "''")))
            .collect::<Vec<_>>()
            .join(",");
        let sql = format!(
            "SELECT COUNT(*) FROM investissements WHERE {} AND type_produit IN ({})",
            Self::INVESTISSEMENT_SCOPE_WHERE,
            types_str
        );
        let count: i64 = self
            .conn
            .query_row(&sql, params![contact_id, foyer_id], |row| row.get(0))?;
        Ok(count > 0)
    }

    pub(crate) fn contact_has_investment_date_approaching(
        &self,
        contact_id: i64,
        foyer_id: Option<i64>,
        champ: &str,
        jours_avant: i64,
        types_produit: &[String],
        now: i64,
    ) -> Result<bool> {
        let allowed = [
            "date_fin_demembrement",
            "date_fin_pret",
            "date_souscription",
        ];
        if !allowed.contains(&champ) {
            return Ok(false);
        }
        let type_filter = if types_produit.is_empty() {
            String::new()
        } else {
            let types_str = types_produit
                .iter()
                .map(|t| format!("'{}'", t.replace('\'', "''")))
                .collect::<Vec<_>>()
                .join(",");
            format!(" AND type_produit IN ({})", types_str)
        };
        let threshold = now + (jours_avant * 24 * 60 * 60);
        let query = format!(
            "SELECT COUNT(*) FROM investissements WHERE {} 
             AND {} IS NOT NULL AND {} > ?3 AND {} <= ?4{}",
            Self::INVESTISSEMENT_SCOPE_WHERE,
            champ,
            champ,
            champ,
            type_filter
        );
        let count: i64 = self.conn.query_row(
            &query,
            params![contact_id, foyer_id, now, threshold],
            |row| row.get(0),
        )?;
        Ok(count > 0)
    }

    /// File d'envoi manuel : ready | scheduled | incomplete | sent | followup
    pub fn get_etiquette_email_queue(
        &self,
        queue_status: &str,
    ) -> Result<Vec<EtiquetteEmailQueueItem>> {
        let now = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_secs() as i64;

        let default_delai_jours = super::template_email_relance::DEFAULT_RELANCE_DELAI_JOURS;

        use super::template_formality_sql::{
            template_queue_fields_simple_sql, template_queue_fields_sql, TEMPLATE_TU_RELANCE_JOINS,
        };
        const TEMPLATE_JOINS: &str = "
                 LEFT JOIN templates_email t ON e.email_template_id = t.id";
        let template_fields = template_queue_fields_sql();
        let template_fields_simple = template_queue_fields_simple_sql();
        let template_joins_full = format!("{TEMPLATE_JOINS}{TEMPLATE_TU_RELANCE_JOINS}");

        let sql = match queue_status {
            "ready" => {
                format!(
                    "SELECT ce.id, ce.contact_id, c.nom, c.prenom, c.email, c.telephone,
                        e.id, e.nom, e.couleur, ce.email_date_prevue, ce.email_date_envoi,
                        {template_fields}, NULL,
                        ce.email_reponse_at, ce.email_reponse_type, c.date_dernier_contact,
                        c.registre,
                        COALESCE(ce.email_relance_active, 0)
                 FROM contact_etiquettes ce
                 INNER JOIN etiquettes e ON ce.etiquette_id = e.id
                 INNER JOIN contacts c ON ce.contact_id = c.id
                 {template_joins_full}
                 WHERE e.actif = 1 AND e.email_actif = 1
                   AND ce.email_envoye = 0
                   AND COALESCE(ce.email_annule, 0) = 0
                   AND ce.email_date_prevue IS NOT NULL
                   AND ce.email_date_prevue <= ?1
                   AND e.email_template_id IS NOT NULL
                   AND c.email IS NOT NULL
                   AND TRIM(c.email) != ''
                 ORDER BY ce.email_date_prevue ASC, c.nom, c.prenom"
                )
            }
            "scheduled" => {
                format!(
                    "SELECT ce.id, ce.contact_id, c.nom, c.prenom, c.email, c.telephone,
                        e.id, e.nom, e.couleur, ce.email_date_prevue, ce.email_date_envoi,
                        {template_fields_simple},
                        'SCHEDULED',
                        ce.email_reponse_at, ce.email_reponse_type, c.date_dernier_contact,
                        c.registre,
                        COALESCE(ce.email_relance_active, 0)
                 FROM contact_etiquettes ce
                 INNER JOIN etiquettes e ON ce.etiquette_id = e.id
                 INNER JOIN contacts c ON ce.contact_id = c.id
                 LEFT JOIN templates_email t ON e.email_template_id = t.id
                 LEFT JOIN templates_email t_tu ON t.tutoiement_template_id = t_tu.id
                 WHERE e.actif = 1 AND e.email_actif = 1
                   AND ce.email_envoye = 0
                   AND COALESCE(ce.email_annule, 0) = 0
                   AND ce.email_date_prevue IS NOT NULL
                   AND ce.email_date_prevue > ?1
                   AND e.email_template_id IS NOT NULL
                   AND c.email IS NOT NULL
                   AND TRIM(c.email) != ''
                 ORDER BY ce.email_date_prevue ASC, c.nom, c.prenom"
                )
            }
            "incomplete" => {
                format!(
                    "SELECT ce.id, ce.contact_id, c.nom, c.prenom, c.email, c.telephone,
                        e.id, e.nom, e.couleur, ce.email_date_prevue, ce.email_date_envoi,
                        {template_fields_simple},
                        CASE
                          WHEN c.email IS NULL OR TRIM(c.email) = '' THEN 'NO_EMAIL'
                          WHEN e.email_template_id IS NULL THEN 'NO_TEMPLATE'
                          WHEN ce.email_date_prevue IS NULL THEN 'NO_DATE'
                          ELSE 'OTHER'
                        END,
                        ce.email_reponse_at, ce.email_reponse_type, c.date_dernier_contact,
                        c.registre,
                        COALESCE(ce.email_relance_active, 0)
                 FROM contact_etiquettes ce
                 INNER JOIN etiquettes e ON ce.etiquette_id = e.id
                 INNER JOIN contacts c ON ce.contact_id = c.id
                 LEFT JOIN templates_email t ON e.email_template_id = t.id
                 LEFT JOIN templates_email t_tu ON t.tutoiement_template_id = t_tu.id
                 WHERE e.actif = 1 AND e.email_actif = 1
                   AND ce.email_envoye = 0
                   AND COALESCE(ce.email_annule, 0) = 0
                   AND (
                     c.email IS NULL OR TRIM(c.email) = ''
                     OR e.email_template_id IS NULL
                     OR ce.email_date_prevue IS NULL
                   )
                   AND ?1 IS NOT NULL
                 ORDER BY ce.email_date_prevue ASC, c.nom, c.prenom"
                )
            }
            "sent" => {
                format!(
                    "SELECT ce.id, ce.contact_id, c.nom, c.prenom, c.email, c.telephone,
                        e.id, e.nom, e.couleur, ce.email_date_prevue, ce.email_date_envoi,
                        COALESCE(t.sujet, ''), COALESCE(t.corps, ''), t.agenda_link_id,
                        t.variables, t.categorie, NULL,
                        ce.email_reponse_at, ce.email_reponse_type, c.date_dernier_contact,
                        c.registre,
                        0
                 FROM contact_etiquettes ce
                 INNER JOIN etiquettes e ON ce.etiquette_id = e.id
                 INNER JOIN contacts c ON ce.contact_id = c.id
                 {template_joins_full}
                 WHERE e.actif = 1 AND e.email_actif = 1
                   AND ce.email_envoye = 1
                   AND ce.email_date_envoi IS NOT NULL
                   AND ce.email_reponse_at IS NULL
                   AND COALESCE(ce.email_suivi_ignore, 0) = 0
                   AND COALESCE(t.categorie, '') != 'NEWSLETTER'
                   AND COALESCE(json_extract(t.variables, '$.email_suivi_reponse.attendre_reponse'), 1) = 1
                   AND c.email IS NOT NULL
                   AND TRIM(c.email) != ''
                 ORDER BY ce.email_date_envoi DESC
                 LIMIT 200"
                )
            }
            "followup" => {
                format!(
                    "SELECT ce.id, ce.contact_id, c.nom, c.prenom, c.email, c.telephone,
                        e.id, e.nom, e.couleur, ce.email_date_prevue, ce.email_date_envoi,
                        COALESCE(t.sujet, ''), COALESCE(t.corps, ''), t.agenda_link_id,
                        t.variables, t.categorie, 'FOLLOWUP',
                        ce.email_reponse_at, ce.email_reponse_type, c.date_dernier_contact,
                        c.registre,
                        0
                 FROM contact_etiquettes ce
                 INNER JOIN etiquettes e ON ce.etiquette_id = e.id
                 INNER JOIN contacts c ON ce.contact_id = c.id
                 LEFT JOIN templates_email t ON e.email_template_id = t.id
                 WHERE e.actif = 1 AND e.email_actif = 1
                   AND ce.email_envoye = 1
                   AND ce.email_date_envoi IS NOT NULL
                   AND ce.email_reponse_at IS NULL
                   AND COALESCE(ce.email_suivi_ignore, 0) = 0
                   AND COALESCE(t.categorie, '') != 'NEWSLETTER'
                   AND COALESCE(json_extract(t.variables, '$.email_suivi_reponse.attendre_reponse'), 1) = 1
                   AND COALESCE(json_extract(t.variables, '$.email_relance.enabled'), 1) = 1
                   AND c.email IS NOT NULL
                   AND TRIM(c.email) != ''
                 ORDER BY ce.email_date_envoi ASC, c.nom, c.prenom
                 LIMIT 200"
                )
            }
            _ => {
                return Err(rusqlite::Error::InvalidParameterName(format!(
                    "queue_status invalide: {}",
                    queue_status
                )))
            }
        };

        let map_row = |row: &rusqlite::Row<'_>| -> rusqlite::Result<EtiquetteEmailQueueItem> {
            Ok(EtiquetteEmailQueueItem {
                queue_row_kind: "etiquette".to_string(),
                contact_etiquette_id: row.get(0)?,
                contact_id: row.get(1)?,
                contact_nom: row.get(2)?,
                contact_prenom: row.get(3)?,
                contact_email: row.get(4)?,
                contact_telephone: row.get(5)?,
                etiquette_id: row.get(6)?,
                etiquette_nom: row.get(7)?,
                etiquette_couleur: row.get(8)?,
                email_date_prevue: row.get(9)?,
                email_date_envoi: row.get(10)?,
                template_sujet: row.get(11)?,
                template_corps: row.get(12)?,
                template_agenda_link_id: row.get(13)?,
                template_variables: row.get(14)?,
                template_categorie: row.get(15)?,
                queue_issue: row.get(16)?,
                email_reponse_at: row.get(17)?,
                email_reponse_type: row.get(18)?,
                contact_date_dernier_contact: row.get(19)?,
                contact_registre: row.get(20)?,
                email_is_relance: row.get::<_, i64>(21)? != 0,
            })
        };

        let mut items = if queue_status == "sent" || queue_status == "followup" {
            let mut stmt = self.conn.prepare(&sql)?;
            let rows = stmt.query_map(params![], map_row)?;
            let raw = rows.collect::<Result<Vec<_>, _>>()?;
            super::template_email_relance::filter_queue_by_relance_schedule(
                raw,
                queue_status,
                now,
                default_delai_jours,
            )
        } else {
            let mut stmt = self.conn.prepare(&sql)?;
            let rows = stmt.query_map(params![now], map_row)?;
            rows.collect::<Result<Vec<_>, _>>()?
        };

        let mut template_items =
            self.get_template_email_queue(queue_status, now, default_delai_jours)?;
        items.append(&mut template_items);

        items.sort_by(|a, b| {
            let da = a.email_date_prevue.unwrap_or(i64::MAX);
            let db = b.email_date_prevue.unwrap_or(i64::MAX);
            da.cmp(&db)
                .then_with(|| a.contact_nom.cmp(&b.contact_nom))
                .then_with(|| a.contact_prenom.cmp(&b.contact_prenom))
        });

        if queue_status == "sent" {
            items.truncate(100);
        }

        Ok(items)
    }

    /// Compatibilité : file « prêts à envoyer »
    pub fn get_pending_etiquette_emails(&self) -> Result<Vec<(i64, i64, i64, String, String)>> {
        let queue = self.get_etiquette_email_queue("ready")?;
        Ok(queue
            .into_iter()
            .filter_map(|item| {
                let email = item.contact_email?;
                Some((
                    item.contact_etiquette_id,
                    item.contact_id,
                    0,
                    email,
                    item.contact_prenom,
                ))
            })
            .collect())
    }

    fn is_client_actif(categorie: &str) -> bool {
        categorie != "AUCUN" && categorie != "PRESCRIPTEUR"
    }

    fn is_filleul_statut(cat: Option<&str>) -> bool {
        matches!(
            cat,
            Some("FILLEUL")
                | Some("PROSPECT_FILLEUL")
                | Some("SUSPECT_FILLEUL")
                | Some("FILLEUL_DESINSCRIT")
        )
    }

    pub(crate) fn touch_contact_last_contact(&self, contact_id: i64, ts: i64) -> Result<()> {
        let contact = self.get_contact_by_id(contact_id)?;
        let client = Self::is_client_actif(&contact.categorie);
        let filleul = Self::is_filleul_statut(contact.filleul_categorie.as_deref());

        if client {
            self.conn.execute(
                "UPDATE contacts SET date_dernier_contact = ?1, updated_at = ?1 WHERE id = ?2",
                params![ts, contact_id],
            )?;
        }
        if filleul {
            self.conn.execute(
                "UPDATE contacts SET date_dernier_contact_filleul = ?1, updated_at = ?1 WHERE id = ?2",
                params![ts, contact_id],
            )?;
        }
        if !client && !filleul {
            self.conn.execute(
                "UPDATE contacts SET date_dernier_contact = ?1, updated_at = ?1 WHERE id = ?2",
                params![ts, contact_id],
            )?;
        }
        Ok(())
    }

    fn get_campaign_context_for_contact_etiquette(
        &self,
        contact_etiquette_id: i64,
    ) -> Result<(i64, String, String)> {
        self.conn.query_row(
            "SELECT ce.contact_id, e.nom, COALESCE(t.sujet, 'Email campagne')
             FROM contact_etiquettes ce
             INNER JOIN etiquettes e ON ce.etiquette_id = e.id
             LEFT JOIN templates_email t ON e.email_template_id = t.id
             WHERE ce.id = ?1",
            params![contact_etiquette_id],
            |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)),
        )
    }

    fn resolve_sent_template_nom(&self, contact_etiquette_id: i64) -> Result<String> {
        use super::template_formality_sql::TEMPLATE_TU_RELANCE_JOINS;
        let sql = format!(
            "SELECT COALESCE(
                CASE WHEN COALESCE(ce.email_relance_active, 0) = 1 AND t_rel.id IS NOT NULL THEN
                    CASE WHEN UPPER(COALESCE(c.registre, 'VOUS')) = 'TU' AND t_rel_tu.id IS NOT NULL
                         THEN NULLIF(TRIM(t_rel_tu.nom), '') ELSE NULLIF(TRIM(t_rel.nom), '') END
                ELSE
                    CASE WHEN UPPER(COALESCE(c.registre, 'VOUS')) = 'TU' AND t_tu.id IS NOT NULL
                         THEN NULLIF(TRIM(t_tu.nom), '') ELSE NULLIF(TRIM(t.nom), '') END
                END,
                NULLIF(TRIM(e.nom), ''),
                'Email campagne'
             )
             FROM contact_etiquettes ce
             INNER JOIN contacts c ON ce.contact_id = c.id
             INNER JOIN etiquettes e ON ce.etiquette_id = e.id
             LEFT JOIN templates_email t ON e.email_template_id = t.id
             {TEMPLATE_TU_RELANCE_JOINS}
             WHERE ce.id = ?1"
        );
        self.conn
            .query_row(&sql, params![contact_etiquette_id], |row| row.get(0))
    }

    pub(crate) fn insert_campaign_interaction(
        &self,
        contact_id: i64,
        type_interaction: &str,
        sujet: &str,
        contenu: &str,
        date_ts: i64,
    ) -> Result<()> {
        self.conn.execute(
            "INSERT INTO interactions (contact_id, type_interaction, sujet, contenu, date_interaction)
             VALUES (?1, ?2, ?3, ?4, ?5)",
            params![contact_id, type_interaction, sujet, contenu, date_ts],
        )?;
        Ok(())
    }

    pub(crate) fn auto_close_suivi_alertes_after_contact(&self, contact_id: i64) -> Result<()> {
        self.conn.execute(
            "UPDATE alertes SET traitee = 1, lue = 1
             WHERE contact_id = ?1 AND traitee = 0
               AND type_alerte NOT IN ('FIN_DEMEMBREMENT')",
            params![contact_id],
        )?;
        Ok(())
    }

    fn campaign_response_already_recorded(&self, row_id: i64) -> Result<bool> {
        let n: i64 = self.conn.query_row(
            "SELECT COUNT(*) FROM contact_etiquettes
             WHERE id = ?1 AND email_envoye = 1 AND email_reponse_at IS NOT NULL",
            params![row_id],
            |row| row.get(0),
        )?;
        if n > 0 {
            return Ok(true);
        }
        self.template_envoi_response_already_recorded(row_id)
    }

    fn patch_campaign_response_details(
        &self,
        row_id: i64,
        reponse_body: Option<&str>,
        reponse_gmail_message_id: Option<&str>,
    ) -> Result<()> {
        let updated = self.conn.execute(
            "UPDATE contact_etiquettes SET
                email_reponse_body = COALESCE(?1, email_reponse_body),
                email_reponse_gmail_message_id = COALESCE(?2, email_reponse_gmail_message_id)
             WHERE id = ?3",
            params![reponse_body, reponse_gmail_message_id, row_id],
        )?;
        if updated > 0 {
            return Ok(());
        }
        self.patch_template_envoi_response_details(row_id, reponse_body, reponse_gmail_message_id)
    }

    fn campaign_email_already_sent(&self, contact_etiquette_id: i64) -> Result<bool> {
        let n: i64 = self.conn.query_row(
            "SELECT COUNT(*) FROM contact_etiquettes
             WHERE id = ?1 AND email_envoye = 1",
            params![contact_etiquette_id],
            |row| row.get(0),
        )?;
        Ok(n > 0)
    }

    /// Marquer un email d'étiquette comme envoyé (+ trace dans l'historique).
    pub fn mark_etiquette_email_sent(
        &self,
        contact_etiquette_id: i64,
        gmail_message_id: Option<&str>,
        gmail_thread_id: Option<&str>,
        email_subject: Option<&str>,
        email_body: Option<&str>,
    ) -> Result<()> {
        if self.campaign_email_already_sent(contact_etiquette_id)? {
            return Ok(());
        }

        let now = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_secs() as i64;

        let (contact_id, etiquette_nom, template_sujet) =
            self.get_campaign_context_for_contact_etiquette(contact_etiquette_id)?;
        let template_nom = self.resolve_sent_template_nom(contact_etiquette_id)?;
        let is_relance: i64 = self.conn.query_row(
            "SELECT COALESCE(email_relance_active, 0) FROM contact_etiquettes WHERE id = ?1",
            params![contact_etiquette_id],
            |row| row.get(0),
        )?;

        self.conn.execute("BEGIN IMMEDIATE", [])?;

        let mark_result = (|| -> Result<()> {
            let sujet = email_subject
                .filter(|s| !s.trim().is_empty())
                .unwrap_or(template_sujet.as_str());
            let body_stored = email_body
                .filter(|s| !s.trim().is_empty())
                .map(|s| s.to_string());
            let updated = self.conn.execute(
                "UPDATE contact_etiquettes SET email_envoye = 1, email_date_envoi = ?1,
                 email_reponse_at = NULL, email_reponse_type = NULL, email_reponse_body = NULL,
                 email_reponse_gmail_message_id = NULL, email_suivi_ignore = 0,
                 email_relance_active = 0,
                 email_gmail_message_id = ?3, email_gmail_thread_id = ?4,
                 email_sent_subject = ?5, email_sent_body = ?6, email_sent_template_nom = ?7
                 WHERE id = ?2 AND email_envoye = 0",
                params![
                    now,
                    contact_etiquette_id,
                    gmail_message_id,
                    gmail_thread_id,
                    sujet,
                    body_stored.as_deref(),
                    template_nom.as_str(),
                ],
            )?;
            if updated == 0 {
                return Err(rusqlite::Error::InvalidParameterName(format!(
                    "contact_etiquette introuvable ou déjà envoyé: {}",
                    contact_etiquette_id
                )));
            }

            // Corps/sujet sur contact_etiquettes ; le journal lit get_exchange_history_timeline.
            if is_relance != 0 {
                let contenu = format!(
                    "Campagne « {} » — relance email (2e envoi) depuis Suivi → Envois.",
                    etiquette_nom
                );
                self.insert_campaign_interaction(contact_id, "EMAIL", sujet, &contenu, now)?;
            }
            Ok(())
        })();

        match mark_result {
            Ok(()) => {
                self.conn.execute("COMMIT", [])?;
                Ok(())
            }
            Err(e) => {
                let _ = self.conn.execute("ROLLBACK", []);
                Err(e)
            }
        }
    }

    /// Réponse campagne enregistrée (fil email / relance Suivi → Envois).
    /// `mail` : pas de MAJ `date_dernier_contact` (réponse email ≠ RDV).
    /// `rdv` : MAJ dernier contact + clôture alertes suivi.
    pub fn mark_email_campaign_response(
        &self,
        row_id: i64,
        response_type: &str,
        reponse_body: Option<&str>,
        reponse_gmail_message_id: Option<&str>,
        reponse_subject: Option<&str>,
    ) -> Result<()> {
        let allowed = ["mail", "rdv", "autre"];
        if !allowed.contains(&response_type) {
            return Err(rusqlite::Error::InvalidParameterName(format!(
                "Type de réponse invalide: {}",
                response_type
            )));
        }

        if self.campaign_response_already_recorded(row_id)? {
            if reponse_body.is_some() || reponse_gmail_message_id.is_some() {
                self.patch_campaign_response_details(row_id, reponse_body, reponse_gmail_message_id)?;
            }
            return Ok(());
        }

        if self
            .mark_contact_etiquette_campaign_response(
                row_id,
                response_type,
                reponse_body,
                reponse_gmail_message_id,
                reponse_subject,
            )
            .is_ok()
        {
            return Ok(());
        }

        self.mark_template_envoi_response(
            row_id,
            response_type,
            reponse_body,
            reponse_gmail_message_id,
            reponse_subject,
        )
    }

    fn mark_contact_etiquette_campaign_response(
        &self,
        contact_etiquette_id: i64,
        response_type: &str,
        reponse_body: Option<&str>,
        reponse_gmail_message_id: Option<&str>,
        reponse_subject: Option<&str>,
    ) -> Result<()> {
        let now = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_secs() as i64;
        let (contact_id, _, _) =
            self.get_campaign_context_for_contact_etiquette(contact_etiquette_id)?;

        self.conn.execute("BEGIN IMMEDIATE", [])?;

        let mark_result = (|| -> Result<()> {
            let updated = self.conn.execute(
                "UPDATE contact_etiquettes SET email_reponse_at = ?1, email_reponse_type = ?2,
                 email_reponse_body = ?4, email_reponse_gmail_message_id = ?5
                 WHERE id = ?3 AND email_envoye = 1 AND email_reponse_at IS NULL",
                params![
                    now,
                    response_type,
                    contact_etiquette_id,
                    reponse_body,
                    reponse_gmail_message_id
                ],
            )?;
            if updated == 0 {
                return Err(rusqlite::Error::InvalidParameterName(format!(
                    "Envoi introuvable ou déjà traité: {}",
                    contact_etiquette_id
                )));
            }

            if response_type == "rdv" {
                self.touch_contact_last_contact(contact_id, now)?;
                self.auto_close_suivi_alertes_after_contact(contact_id)?;
            }

            if response_type == "mail" {
                let _ = self.try_newsletter_unsubscribe_from_reply(
                    contact_etiquette_id,
                    reponse_subject,
                    reponse_body,
                )?;
            }
            Ok(())
        })();

        match mark_result {
            Ok(()) => {
                self.conn.execute("COMMIT", [])?;
                Ok(())
            }
            Err(e) => {
                let _ = self.conn.execute("ROLLBACK", []);
                Err(e)
            }
        }
    }

    /// Ne plus proposer de relance pour cet envoi.
    pub fn dismiss_email_campaign_followup(&self, row_id: i64) -> Result<()> {
        let updated = self.conn.execute(
            "UPDATE contact_etiquettes SET email_suivi_ignore = 1 WHERE id = ?1",
            params![row_id],
        )?;
        if updated > 0 {
            return Ok(());
        }
        let updated = self.conn.execute(
            "UPDATE contact_template_envois SET email_suivi_ignore = 1 WHERE id = ?1",
            params![row_id],
        )?;
        if updated == 0 {
            return Err(rusqlite::Error::InvalidParameterName(format!(
                "Envoi introuvable: {}",
                row_id
            )));
        }
        Ok(())
    }

    /// Retire un envoi planifié de la file « Prêts à envoyer » sans l'envoyer.
    pub fn cancel_pending_email_campaign(&self, row_id: i64) -> Result<()> {
        let updated = self.conn.execute(
            "UPDATE contact_etiquettes SET email_annule = 1
             WHERE id = ?1 AND email_envoye = 0 AND COALESCE(email_annule, 0) = 0",
            params![row_id],
        )?;
        if updated > 0 {
            return Ok(());
        }
        let updated = self.conn.execute(
            "UPDATE contact_template_envois SET email_annule = 1
             WHERE id = ?1 AND email_envoye = 0 AND COALESCE(email_annule, 0) = 0",
            params![row_id],
        )?;
        if updated == 0 {
            return Err(rusqlite::Error::InvalidParameterName(format!(
                "Envoi planifié introuvable ou déjà traité: {}",
                row_id
            )));
        }
        Ok(())
    }

    /// Contexte Gmail pour importer ou détecter la réponse d'un envoi.
    pub fn campaign_response_check_item(
        &self,
        row_id: i64,
    ) -> Result<super::models::PendingCampaignResponseCheck, String> {
        if let Ok(item) = self.conn.query_row(
            "SELECT ce.id, c.email, ce.email_date_envoi, ce.email_gmail_thread_id
             FROM contact_etiquettes ce
             INNER JOIN contacts c ON ce.contact_id = c.id
             WHERE ce.id = ?1 AND ce.email_date_envoi IS NOT NULL",
            params![row_id],
            |row| {
                Ok(super::models::PendingCampaignResponseCheck {
                    contact_etiquette_id: row.get(0)?,
                    contact_email: row.get::<_, Option<String>>(1)?.unwrap_or_default(),
                    email_date_envoi: row.get(2)?,
                    email_gmail_thread_id: row.get(3)?,
                })
            },
        ) {
            return Ok(item);
        }
        self.template_envoi_response_check_item(row_id)
    }

    /// Campagnes envoyées sans réponse enregistrée (pour sync Gmail / Agenda).
    pub fn list_campaigns_pending_response_check(
        &self,
    ) -> Result<Vec<super::models::PendingCampaignResponseCheck>> {
        let mut stmt = self.conn.prepare(
            "SELECT id, email, email_date_envoi, email_gmail_thread_id FROM (
                SELECT ce.id, c.email, ce.email_date_envoi, ce.email_gmail_thread_id
                FROM contact_etiquettes ce
                INNER JOIN etiquettes e ON ce.etiquette_id = e.id
                INNER JOIN contacts c ON ce.contact_id = c.id
                INNER JOIN templates_email t ON e.email_template_id = t.id
                WHERE e.actif = 1 AND e.email_actif = 1
                  AND ce.email_envoye = 1
                  AND ce.email_date_envoi IS NOT NULL
                  AND ce.email_reponse_at IS NULL
                  AND COALESCE(ce.email_suivi_ignore, 0) = 0
                  AND COALESCE(json_extract(t.variables, '$.email_suivi_reponse.attendre_reponse'), 1) = 1
                  AND c.email IS NOT NULL AND TRIM(c.email) != ''
                UNION ALL
                SELECT cte.id, c.email, cte.email_date_envoi, cte.email_gmail_thread_id
                FROM contact_template_envois cte
                INNER JOIN templates_email t ON cte.template_id = t.id
                INNER JOIN contacts c ON cte.contact_id = c.id
                WHERE json_extract(t.variables, '$.email_trigger.enabled') = 1
                  AND (
                    json_extract(t.variables, '$.email_trigger.condition_type') IS NOT NULL
                    OR json_extract(t.variables, '$.email_trigger.trigger_type') = 'EVENEMENT_SOUSCRIPTION'
                  )
                  AND cte.email_envoye = 1
                  AND cte.email_date_envoi IS NOT NULL
                  AND cte.email_reponse_at IS NULL
                  AND COALESCE(cte.email_suivi_ignore, 0) = 0
                  AND COALESCE(json_extract(t.variables, '$.email_suivi_reponse.attendre_reponse'), 1) = 1
                  AND c.email IS NOT NULL AND TRIM(c.email) != ''
             )
             ORDER BY email_date_envoi ASC
             LIMIT 80",
        )?;
        let rows = stmt.query_map([], |row| {
            Ok(super::models::PendingCampaignResponseCheck {
                contact_etiquette_id: row.get(0)?,
                contact_email: row.get::<_, String>(1)?,
                email_date_envoi: row.get(2)?,
                email_gmail_thread_id: row.get(3)?,
            })
        })?;
        rows.collect()
    }

    /// Remet l'envoi en file « Prêts » pour une relance manuelle.
    pub fn prepare_email_campaign_relance(&self, row_id: i64) -> Result<()> {
        if self.prepare_contact_etiquette_relance(row_id).is_ok() {
            return Ok(());
        }
        self.prepare_template_envoi_relance(row_id)
    }

    fn prepare_contact_etiquette_relance(&self, contact_etiquette_id: i64) -> Result<()> {
        let now = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_secs() as i64;
        let updated = self.conn.execute(
            "UPDATE contact_etiquettes SET
                email_envoye = 0,
                email_date_prevue = ?1,
                email_reponse_at = NULL,
                email_reponse_type = NULL,
                email_suivi_ignore = 0,
                email_relance_active = 1,
                email_gmail_message_id = NULL,
                email_gmail_thread_id = NULL
             WHERE id = ?2 AND email_envoye = 1
               AND EXISTS (
                 SELECT 1 FROM etiquettes e
                 LEFT JOIN templates_email t ON e.email_template_id = t.id
                 WHERE e.id = contact_etiquettes.etiquette_id
                   AND COALESCE(json_extract(t.variables, '$.email_relance.enabled'), 1) = 1
               )",
            params![now, contact_etiquette_id],
        )?;
        if updated == 0 {
            return Err(rusqlite::Error::InvalidParameterName(format!(
                "Envoi introuvable ou relance désactivée: {}",
                contact_etiquette_id
            )));
        }
        Ok(())
    }

    // ========== INTERACTIONS ==========

    fn parse_interaction_timestamp(date_str: Option<&String>) -> Result<i64> {
        if let Some(s) = date_str {
            if !s.trim().is_empty() {
                if let Ok(dt) = chrono::DateTime::parse_from_rfc3339(s) {
                    return Ok(dt.timestamp());
                }
                if let Ok(dt) = chrono::NaiveDateTime::parse_from_str(s, "%Y-%m-%dT%H:%M:%S%.fZ") {
                    return Ok(dt.and_utc().timestamp());
                }
            }
        }
        Ok(std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_secs() as i64)
    }

    fn is_campaign_response_trace(sujet: &str, contenu: &str) -> bool {
        contenu.starts_with("Retour enregistré après envoi") || sujet.contains("— campagne «")
    }

    fn is_campaign_send_trace(contenu: &str) -> bool {
        contenu.starts_with("Campagne «")
            && (contenu.contains("— email envoyé") || contenu.contains("— relance email"))
    }

    fn parse_etiquette_nom_from_send_trace(contenu: &str) -> Option<String> {
        let start = contenu.strip_prefix("Campagne «")?;
        let end = start.find('»')?;
        Some(start[..end].trim().to_string())
    }

    fn campaign_send_already_in_entries(
        entries: &[super::models::ExchangeHistoryEntry],
        contact_id: i64,
        sent_at: i64,
    ) -> bool {
        entries.iter().any(|e| {
            e.entry_kind == "email_campagne"
                && e.contact_id == contact_id
                && e.sent_at == Some(sent_at)
        })
    }

    fn timeline_covers_contact_email(
        entries: &[super::models::ExchangeHistoryEntry],
        contact_id: i64,
        date_interaction: i64,
        interaction_id: i64,
    ) -> bool {
        entries.iter().any(|e| {
            if e.contact_id != contact_id {
                return false;
            }
            if e.interaction_id == Some(interaction_id) {
                return true;
            }
            if e.entry_kind == "email_campagne" {
                if let Some(sent) = e.sent_at {
                    if sent == date_interaction {
                        return true;
                    }
                    if (sent - date_interaction).abs() <= 120 {
                        return true;
                    }
                }
            }
            if e.entry_kind == "manual" && e.sort_date == date_interaction {
                return true;
            }
            false
        })
    }

    fn lookup_campaign_send_meta(
        &self,
        contact_id: i64,
        sent_at: i64,
    ) -> (Option<i64>, Option<String>, Option<i64>, Option<String>) {
        self.conn
            .query_row(
                "SELECT ce.id, COALESCE(e.nom, 'Campagne email'),
                        ce.email_reponse_at, ce.email_reponse_type
                 FROM contact_etiquettes ce
                 LEFT JOIN etiquettes e ON ce.etiquette_id = e.id
                 WHERE ce.contact_id = ?1
                 ORDER BY
                   CASE WHEN ce.email_date_envoi = ?2 THEN 0 ELSE 1 END,
                   COALESCE(ce.email_date_envoi, 0) DESC,
                   ce.id DESC
                 LIMIT 1",
                params![contact_id, sent_at],
                |row| {
                    Ok((
                        Some(row.get(0)?),
                        Some(row.get(1)?),
                        row.get(2)?,
                        row.get(3)?,
                    ))
                },
            )
            .unwrap_or((None, None, None, None))
    }

    fn interaction_duplicates_campaign_send(
        &self,
        contact_id: i64,
        date_interaction: i64,
    ) -> Result<bool> {
        let n: i64 = self.conn.query_row(
            "SELECT COUNT(*) FROM contact_etiquettes
             WHERE contact_id = ?1 AND email_envoye = 1 AND email_date_envoi = ?2",
            params![contact_id, date_interaction],
            |row| row.get(0),
        )?;
        Ok(n > 0)
    }

    fn exchange_history_email_from_row(
        row: &rusqlite::Row<'_>,
        extended: bool,
    ) -> rusqlite::Result<super::models::ExchangeHistoryEntry> {
        let sent_subject: Option<String> = row.get(8)?;
        let sent_body: Option<String> = row.get(9)?;
        let template_sujet = {
            let s: String = row.get(10)?;
            if s.is_empty() {
                None
            } else {
                Some(s)
            }
        };
        let template_corps = {
            let s: String = row.get(11)?;
            if s.is_empty() {
                None
            } else {
                Some(s)
            }
        };
        Ok(super::models::ExchangeHistoryEntry {
            entry_kind: "email_campagne".into(),
            sort_date: 0,
            contact_id: row.get(1)?,
            contact_nom: row.get(2)?,
            contact_prenom: row.get(3)?,
            contact_email: row.get(4)?,
            contact_telephone: row.get(5)?,
            contact_etiquette_id: Some(row.get(0)?),
            etiquette_nom: Some(row.get(6)?),
            sent_at: row.get(7)?,
            sent_subject,
            sent_body,
            sent_template_nom: if extended { row.get(15)? } else { None },
            template_sujet,
            template_corps,
            template_agenda_link_id: row.get(12)?,
            email_gmail_message_id: if extended {
                row.get(16)?
            } else {
                None
            },
            email_gmail_thread_id: if extended {
                row.get(17)?
            } else {
                None
            },
            email_reponse_at: row.get(13)?,
            email_reponse_type: row.get(14)?,
            email_reponse_body: if extended { row.get(18)? } else { None },
            email_reponse_gmail_message_id: if extended {
                row.get(19)?
            } else {
                None
            },
            interaction_id: None,
            type_interaction: Some("EMAIL".into()),
            sujet: None,
            contenu: None,
            created_at: None,
        })
    }

    /// Journal fusionné : échanges manuels + un fil par envoi campagne (envoi + réponse).
    pub fn get_exchange_history_timeline(
        &self,
    ) -> Result<Vec<super::models::ExchangeHistoryEntry>> {
        self.get_exchange_history_timeline_filtered(None)
    }

    /// Même journal, limité à un contact (évite de charger tout le CRM).
    pub fn get_exchange_history_timeline_for_contact(
        &self,
        contact_id: i64,
    ) -> Result<Vec<super::models::ExchangeHistoryEntry>> {
        self.get_exchange_history_timeline_filtered(Some(contact_id))
    }

    fn get_exchange_history_timeline_filtered(
        &self,
        only_contact_id: Option<i64>,
    ) -> Result<Vec<super::models::ExchangeHistoryEntry>> {
        let mut entries: Vec<super::models::ExchangeHistoryEntry> = Vec::new();

        let mut manual_stmt = self.conn.prepare(
            "SELECT i.id, i.contact_id, c.nom, c.prenom, c.email, c.telephone,
                    i.type_interaction, i.sujet, i.contenu, i.date_interaction, i.created_at
             FROM interactions i
             INNER JOIN contacts c ON c.id = i.contact_id
             WHERE (?1 IS NULL OR i.contact_id = ?1)",
        )?;
        let manual_rows = manual_stmt.query_map(params![only_contact_id], |row| {
            let sujet: Option<String> = row.get(7)?;
            let contenu: Option<String> = row.get(8)?;
            Ok((
                row.get::<_, i64>(0)?,
                row.get::<_, i64>(1)?,
                row.get::<_, String>(2)?,
                row.get::<_, String>(3)?,
                row.get::<_, Option<String>>(4)?,
                row.get::<_, Option<String>>(5)?,
                row.get::<_, String>(6)?,
                sujet,
                contenu,
                row.get::<_, i64>(9)?,
                row.get::<_, i64>(10)?,
            ))
        })?;
        for row in manual_rows {
            let (
                id,
                contact_id,
                contact_nom,
                contact_prenom,
                contact_email,
                contact_telephone,
                type_interaction,
                sujet,
                contenu,
                date_interaction,
                created_at,
            ) = row?;
            let sujet_s = sujet.as_deref().unwrap_or("");
            let contenu_s = contenu.as_deref().unwrap_or("");

            if Self::is_campaign_response_trace(sujet_s, contenu_s) {
                continue;
            }

            if Self::is_campaign_send_trace(contenu_s) {
                if Self::campaign_send_already_in_entries(&entries, contact_id, date_interaction) {
                    continue;
                }
                let etiquette_nom =
                    Self::parse_etiquette_nom_from_send_trace(contenu_s).or_else(|| {
                        sujet
                            .as_deref()
                            .and_then(|s| Self::parse_etiquette_nom_from_send_trace(s))
                    });
                let ce_id: Option<i64> = self
                    .conn
                    .query_row(
                        "SELECT id FROM contact_etiquettes
                         WHERE contact_id = ?1 AND email_envoye = 1
                           AND email_date_envoi = ?2
                         ORDER BY id DESC LIMIT 1",
                        params![contact_id, date_interaction],
                        |row| row.get(0),
                    )
                    .ok();
                let (reponse_at, reponse_type): (Option<i64>, Option<String>) = ce_id
                    .map(|id| {
                        self.conn
                            .query_row(
                                "SELECT email_reponse_at, email_reponse_type
                                 FROM contact_etiquettes WHERE id = ?1",
                                params![id],
                                |row| Ok((row.get(0)?, row.get(1)?)),
                            )
                            .unwrap_or((None, None))
                    })
                    .unwrap_or((None, None));
                entries.push(super::models::ExchangeHistoryEntry {
                    entry_kind: "email_campagne".into(),
                    sort_date: date_interaction.max(reponse_at.unwrap_or(0)),
                    contact_id,
                    contact_nom: contact_nom.clone(),
                    contact_prenom: contact_prenom.clone(),
                    contact_email: contact_email.clone(),
                    contact_telephone: contact_telephone.clone(),
                    contact_etiquette_id: ce_id,
                    etiquette_nom,
                    sent_at: Some(date_interaction),
                    sent_subject: sujet.clone(),
                    sent_body: None,
                    sent_template_nom: None,
                    template_sujet: None,
                    template_corps: None,
                    template_agenda_link_id: None,
                    email_gmail_message_id: None,
                    email_gmail_thread_id: None,
                    email_reponse_at: reponse_at,
                    email_reponse_type: reponse_type,
                    email_reponse_body: None,
                    email_reponse_gmail_message_id: None,
                    interaction_id: None,
                    type_interaction: Some("EMAIL".into()),
                    sujet: None,
                    contenu: None,
                    created_at: None,
                });
                continue;
            }

            if self.interaction_duplicates_campaign_send(contact_id, date_interaction)? {
                continue;
            }
            entries.push(super::models::ExchangeHistoryEntry {
                entry_kind: "manual".into(),
                sort_date: date_interaction,
                contact_id,
                contact_nom,
                contact_prenom,
                contact_email,
                contact_telephone,
                contact_etiquette_id: None,
                etiquette_nom: None,
                sent_at: None,
                sent_subject: None,
                sent_body: None,
                sent_template_nom: None,
                template_sujet: None,
                template_corps: None,
                template_agenda_link_id: None,
                email_gmail_message_id: None,
                email_gmail_thread_id: None,
                email_reponse_at: None,
                email_reponse_type: None,
                email_reponse_body: None,
                email_reponse_gmail_message_id: None,
                interaction_id: Some(id),
                type_interaction: Some(type_interaction),
                sujet,
                contenu,
                created_at: Some(created_at),
            });
        }

        let has_sent_cols = self.table_has_column("contact_etiquettes", "email_sent_body")?;
        let email_sql = if has_sent_cols {
            "SELECT ce.id, ce.contact_id, c.nom, c.prenom, c.email, c.telephone,
                    COALESCE(e.nom, 'Campagne email'), ce.email_date_envoi,
                    COALESCE(NULLIF(TRIM(ce.email_sent_subject), ''), NULLIF(TRIM(i.sujet), '')),
                    COALESCE(NULLIF(TRIM(ce.email_sent_body), ''), NULLIF(TRIM(i.contenu), '')),
                    COALESCE(t.sujet, ''), COALESCE(t.corps, ''), t.agenda_link_id,
                    ce.email_reponse_at, ce.email_reponse_type,
                    ce.email_sent_template_nom, ce.email_gmail_message_id, ce.email_gmail_thread_id,
                    ce.email_reponse_body, ce.email_reponse_gmail_message_id
             FROM contact_etiquettes ce
             LEFT JOIN etiquettes e ON ce.etiquette_id = e.id
             INNER JOIN contacts c ON ce.contact_id = c.id
             LEFT JOIN templates_email t ON e.email_template_id = t.id
             LEFT JOIN interactions i ON i.contact_id = ce.contact_id
               AND i.type_interaction = 'EMAIL'
               AND i.date_interaction = ce.email_date_envoi
               AND i.id = (
                 SELECT i2.id FROM interactions i2
                 WHERE i2.contact_id = ce.contact_id
                   AND i2.type_interaction = 'EMAIL'
                   AND i2.date_interaction = ce.email_date_envoi
                   AND COALESCE(i2.contenu, '') NOT LIKE 'Campagne «%» — email envoyé%'
                   AND COALESCE(i2.contenu, '') NOT LIKE 'Campagne «%» — relance email%'
                   AND COALESCE(i2.contenu, '') NOT LIKE 'Retour enregistré%'
                   AND COALESCE(i2.sujet, '') NOT LIKE '%— campagne «%'
                 ORDER BY i2.id DESC
                 LIMIT 1
               )
             WHERE (ce.email_envoye = 1
                OR ce.email_date_envoi IS NOT NULL
                OR NULLIF(TRIM(ce.email_sent_subject), '') IS NOT NULL
                OR NULLIF(TRIM(ce.email_sent_body), '') IS NOT NULL
                OR NULLIF(TRIM(ce.email_sent_template_nom), '') IS NOT NULL)
                AND (?1 IS NULL OR ce.contact_id = ?1)"
        } else {
            "SELECT ce.id, ce.contact_id, c.nom, c.prenom, c.email, c.telephone,
                    COALESCE(e.nom, 'Campagne email'), ce.email_date_envoi,
                    NULLIF(TRIM(i.sujet), ''),
                    NULLIF(TRIM(i.contenu), ''),
                    COALESCE(t.sujet, ''), COALESCE(t.corps, ''), t.agenda_link_id,
                    ce.email_reponse_at, ce.email_reponse_type
             FROM contact_etiquettes ce
             LEFT JOIN etiquettes e ON ce.etiquette_id = e.id
             INNER JOIN contacts c ON ce.contact_id = c.id
             LEFT JOIN templates_email t ON e.email_template_id = t.id
             LEFT JOIN interactions i ON i.contact_id = ce.contact_id
               AND i.type_interaction = 'EMAIL'
               AND i.date_interaction = ce.email_date_envoi
               AND i.id = (
                 SELECT i2.id FROM interactions i2
                 WHERE i2.contact_id = ce.contact_id
                   AND i2.type_interaction = 'EMAIL'
                   AND i2.date_interaction = ce.email_date_envoi
                   AND COALESCE(i2.contenu, '') NOT LIKE 'Campagne «%» — email envoyé%'
                   AND COALESCE(i2.contenu, '') NOT LIKE 'Campagne «%» — relance email%'
                   AND COALESCE(i2.contenu, '') NOT LIKE 'Retour enregistré%'
                   AND COALESCE(i2.sujet, '') NOT LIKE '%— campagne «%'
                 ORDER BY i2.id DESC
                 LIMIT 1
               )
             WHERE (ce.email_envoye = 1
                OR ce.email_date_envoi IS NOT NULL)
                AND (?1 IS NULL OR ce.contact_id = ?1)"
        };
        let mut email_stmt = self.conn.prepare(email_sql)?;
        let email_rows = email_stmt.query_map(params![only_contact_id], |row| {
            Self::exchange_history_email_from_row(row, has_sent_cols)
        })?;
        for row in email_rows {
            let mut entry = row?;
            let sent = entry.sent_at.unwrap_or(0);
            if sent > 0
                && Self::campaign_send_already_in_entries(&entries, entry.contact_id, sent)
            {
                if let Some(existing) = entries.iter_mut().find(|e| {
                    e.entry_kind == "email_campagne"
                        && e.contact_id == entry.contact_id
                        && e.sent_at == Some(sent)
                }) {
                    if existing.sent_subject.is_none() {
                        existing.sent_subject = entry.sent_subject.clone();
                    }
                    if existing.sent_body.is_none() {
                        existing.sent_body = entry.sent_body.clone();
                    }
                    if existing.contact_etiquette_id.is_none() {
                        existing.contact_etiquette_id = entry.contact_etiquette_id;
                    }
                    if existing.template_sujet.is_none() {
                        existing.template_sujet = entry.template_sujet.clone();
                    }
                    if existing.template_corps.is_none() {
                        existing.template_corps = entry.template_corps.clone();
                    }
                    if existing.email_reponse_at.is_none() {
                        existing.email_reponse_at = entry.email_reponse_at;
                    }
                    if existing.email_reponse_type.is_none() {
                        existing.email_reponse_type = entry.email_reponse_type.clone();
                    }
                    if existing.sent_template_nom.is_none() {
                        existing.sent_template_nom = entry.sent_template_nom.clone();
                    }
                    if existing.email_reponse_body.is_none() {
                        existing.email_reponse_body = entry.email_reponse_body.clone();
                    }
                    if existing.email_gmail_thread_id.is_none() {
                        existing.email_gmail_thread_id = entry.email_gmail_thread_id.clone();
                    }
                    if existing.email_gmail_message_id.is_none() {
                        existing.email_gmail_message_id = entry.email_gmail_message_id.clone();
                    }
                    if existing.email_reponse_gmail_message_id.is_none() {
                        existing.email_reponse_gmail_message_id =
                            entry.email_reponse_gmail_message_id.clone();
                    }
                }
                continue;
            }
            let reponse = entry.email_reponse_at.unwrap_or(0);
            entry.sort_date = sent.max(reponse);
            if entry.sort_date == 0 {
                entry.sort_date = sent;
            }
            entries.push(entry);
        }

        let mut orphan_stmt = self.conn.prepare(
            "SELECT i.id, i.contact_id, c.nom, c.prenom, c.email, c.telephone,
                    i.type_interaction, i.sujet, i.contenu, i.date_interaction, i.created_at
             FROM interactions i
             INNER JOIN contacts c ON c.id = i.contact_id
             WHERE i.type_interaction = 'EMAIL'
               AND (?1 IS NULL OR i.contact_id = ?1)",
        )?;
        let orphan_rows = orphan_stmt.query_map(params![only_contact_id], |row| {
            Ok((
                row.get::<_, i64>(0)?,
                row.get::<_, i64>(1)?,
                row.get::<_, String>(2)?,
                row.get::<_, String>(3)?,
                row.get::<_, Option<String>>(4)?,
                row.get::<_, Option<String>>(5)?,
                row.get::<_, Option<String>>(7)?,
                row.get::<_, Option<String>>(8)?,
                row.get::<_, i64>(9)?,
            ))
        })?;
        for row in orphan_rows {
            let (
                id,
                contact_id,
                contact_nom,
                contact_prenom,
                contact_email,
                contact_telephone,
                sujet,
                contenu,
                date_interaction,
            ) = row?;
            let sujet_s = sujet.as_deref().unwrap_or("");
            let contenu_s = contenu.as_deref().unwrap_or("");
            if Self::is_campaign_response_trace(sujet_s, contenu_s) {
                continue;
            }
            if Self::timeline_covers_contact_email(&entries, contact_id, date_interaction, id) {
                continue;
            }
            let is_send_trace = Self::is_campaign_send_trace(contenu_s);
            let has_real_body =
                !is_send_trace && contenu_s.trim().len() > 40 && !contenu_s.starts_with("Campagne «");
            let (ce_id, etiquette_nom, reponse_at, reponse_type) =
                self.lookup_campaign_send_meta(contact_id, date_interaction);
            let etiquette_nom = etiquette_nom.or_else(|| {
                if is_send_trace {
                    Self::parse_etiquette_nom_from_send_trace(contenu_s)
                } else {
                    None
                }
            });
            entries.push(super::models::ExchangeHistoryEntry {
                entry_kind: "email_campagne".into(),
                sort_date: date_interaction.max(reponse_at.unwrap_or(0)),
                contact_id,
                contact_nom,
                contact_prenom,
                contact_email,
                contact_telephone,
                contact_etiquette_id: ce_id,
                etiquette_nom,
                sent_at: Some(date_interaction),
                sent_subject: sujet.clone(),
                sent_body: if has_real_body {
                    contenu.clone()
                } else {
                    None
                },
                sent_template_nom: None,
                template_sujet: None,
                template_corps: None,
                template_agenda_link_id: None,
                email_gmail_message_id: None,
                email_gmail_thread_id: None,
                email_reponse_at: reponse_at,
                email_reponse_type: reponse_type,
                email_reponse_body: None,
                email_reponse_gmail_message_id: None,
                interaction_id: Some(id),
                type_interaction: Some("EMAIL".into()),
                sujet: None,
                contenu: None,
                created_at: None,
            });
        }

        if entries.is_empty() && only_contact_id.is_none() {
            for row in self.get_all_interactions_with_contacts()? {
                entries.push(super::models::ExchangeHistoryEntry {
                    entry_kind: "manual".into(),
                    sort_date: row.date_interaction,
                    contact_id: row.contact_id,
                    contact_nom: row.contact_nom,
                    contact_prenom: row.contact_prenom,
                    contact_email: None,
                    contact_telephone: None,
                    contact_etiquette_id: None,
                    etiquette_nom: None,
                    sent_at: None,
                    sent_subject: None,
                    sent_body: None,
                    sent_template_nom: None,
                    template_sujet: None,
                    template_corps: None,
                    template_agenda_link_id: None,
                    email_gmail_message_id: None,
                    email_gmail_thread_id: None,
                    email_reponse_at: None,
                    email_reponse_type: None,
                    email_reponse_body: None,
                    email_reponse_gmail_message_id: None,
                    interaction_id: Some(row.id),
                    type_interaction: Some(row.type_interaction),
                    sujet: row.sujet,
                    contenu: row.contenu,
                    created_at: Some(row.created_at),
                });
            }
        }

        entries.sort_by(|a, b| {
            b.sort_date
                .cmp(&a.sort_date)
                .then_with(|| {
                    b.contact_etiquette_id
                        .unwrap_or(0)
                        .cmp(&a.contact_etiquette_id.unwrap_or(0))
                })
                .then_with(|| {
                    b.interaction_id
                        .unwrap_or(0)
                        .cmp(&a.interaction_id.unwrap_or(0))
                })
        });
        Ok(entries)
    }

    pub fn get_all_interactions_with_contacts(
        &self,
    ) -> Result<Vec<super::models::InteractionWithContact>> {
        let mut stmt = self.conn.prepare(
            "SELECT i.id, i.contact_id, c.nom, c.prenom, i.type_interaction, i.sujet, i.contenu,
                    i.date_interaction, i.created_at
             FROM interactions i
             INNER JOIN contacts c ON c.id = i.contact_id
             ORDER BY i.date_interaction DESC, i.id DESC",
        )?;

        let rows = stmt.query_map([], |row| {
            Ok(super::models::InteractionWithContact {
                id: row.get(0)?,
                contact_id: row.get(1)?,
                contact_nom: row.get(2)?,
                contact_prenom: row.get(3)?,
                type_interaction: row.get(4)?,
                sujet: row.get(5)?,
                contenu: row.get(6)?,
                date_interaction: row.get(7)?,
                created_at: row.get(8)?,
            })
        })?;

        let mut result = Vec::new();
        for row in rows {
            result.push(row?);
        }
        Ok(result)
    }

    pub fn get_interactions_by_contact(
        &self,
        contact_id: i64,
    ) -> Result<Vec<super::models::Interaction>> {
        let mut stmt = self.conn.prepare(
            "SELECT id, contact_id, type_interaction, sujet, contenu, date_interaction, email_id, created_at
             FROM interactions WHERE contact_id = ?1 ORDER BY date_interaction DESC",
        )?;

        let rows = stmt.query_map(params![contact_id], |row| {
            Ok(super::models::Interaction {
                id: row.get(0)?,
                contact_id: row.get(1)?,
                type_interaction: row.get(2)?,
                sujet: row.get(3)?,
                contenu: row.get(4)?,
                date_interaction: row.get(5)?,
                email_id: row.get(6)?,
                created_at: row.get(7)?,
            })
        })?;

        let mut result = Vec::new();
        for row in rows {
            result.push(row?);
        }
        Ok(result)
    }

    /// Alertes non traitées pour un contact (fiche relation).
    pub fn get_alertes_for_contact(&self, contact_id: i64) -> Result<Vec<super::models::Alerte>> {
        let mut stmt = self.conn.prepare(
            "SELECT id, contact_id, type_alerte, message, date_alerte, lue, traitee, created_at
             FROM alertes
             WHERE contact_id = ?1 AND traitee = 0
             ORDER BY date_alerte DESC",
        )?;
        let rows = stmt.query_map(params![contact_id], |row| {
            Ok(super::models::Alerte {
                id: row.get(0)?,
                contact_id: row.get(1)?,
                type_alerte: row.get(2)?,
                message: row.get(3)?,
                date_alerte: row.get(4)?,
                lue: row.get(5)?,
                traitee: row.get(6)?,
                created_at: row.get(7)?,
            })
        })?;
        let mut result = Vec::new();
        for row in rows {
            result.push(row?);
        }
        Ok(result)
    }

    /// Prochaine ligne email pour un contact (même file que Suivi → Envois : étiquettes + modèles).
    pub fn get_next_pending_email_for_contact(
        &self,
        contact_id: i64,
    ) -> Result<Option<super::models::ContactPendingEmail>> {
        for status in ["ready", "followup", "sent", "incomplete", "scheduled"] {
            let queue = self.get_etiquette_email_queue(status)?;
            if let Some(item) = queue.into_iter().find(|q| q.contact_id == contact_id) {
                return Ok(Some(super::models::ContactPendingEmail::from_queue_item(
                    &item, status,
                )));
            }
        }
        Ok(None)
    }

    /// Synthèse relation : alertes ouvertes + prochain email campagne en attente.
    pub fn get_contact_relation_status(
        &self,
        contact_id: i64,
    ) -> Result<super::models::ContactRelationStatus> {
        let open_alertes = self.get_alertes_for_contact(contact_id)?;
        let pending_email = self.get_next_pending_email_for_contact(contact_id)?;

        Ok(super::models::ContactRelationStatus {
            open_alertes,
            pending_email,
        })
    }

    pub fn create_interaction(
        &self,
        interaction: super::models::NewInteraction,
    ) -> Result<super::models::Interaction> {
        let date_ts = Self::parse_interaction_timestamp(interaction.date_interaction.as_ref())?;

        self.conn.execute(
            "INSERT INTO interactions (contact_id, type_interaction, sujet, contenu, date_interaction)
             VALUES (?1, ?2, ?3, ?4, ?5)",
            params![
                interaction.contact_id,
                interaction.type_interaction,
                interaction.sujet,
                interaction.contenu,
                date_ts,
            ],
        )?;

        let id = self.conn.last_insert_rowid();
        self.get_interaction_by_id(id)
    }

    pub fn get_interaction_by_id(&self, id: i64) -> Result<super::models::Interaction> {
        self.conn.query_row(
            "SELECT id, contact_id, type_interaction, sujet, contenu, date_interaction, email_id, created_at
             FROM interactions WHERE id = ?1",
            params![id],
            |row| {
                Ok(super::models::Interaction {
                    id: row.get(0)?,
                    contact_id: row.get(1)?,
                    type_interaction: row.get(2)?,
                    sujet: row.get(3)?,
                    contenu: row.get(4)?,
                    date_interaction: row.get(5)?,
                    email_id: row.get(6)?,
                    created_at: row.get(7)?,
                })
            },
        )
    }

    pub fn update_interaction(
        &self,
        id: i64,
        interaction: super::models::NewInteraction,
    ) -> Result<super::models::Interaction> {
        let date_ts = Self::parse_interaction_timestamp(interaction.date_interaction.as_ref())?;

        self.conn.execute(
            "UPDATE interactions SET contact_id = ?1, type_interaction = ?2, sujet = ?3, contenu = ?4, date_interaction = ?5
             WHERE id = ?6",
            params![
                interaction.contact_id,
                interaction.type_interaction,
                interaction.sujet,
                interaction.contenu,
                date_ts,
                id,
            ],
        )?;

        self.get_interaction_by_id(id)
    }

    pub fn delete_interaction(&self, id: i64) -> Result<()> {
        self.conn
            .execute("DELETE FROM interactions WHERE id = ?1", params![id])?;
        Ok(())
    }

    pub fn contact_gmail_message_exists(
        &self,
        contact_id: i64,
        gmail_message_id: &str,
    ) -> Result<bool> {
        let count: i64 = self.conn.query_row(
            "SELECT COUNT(*) FROM contact_gmail_messages WHERE contact_id = ?1 AND gmail_message_id = ?2",
            params![contact_id, gmail_message_id],
            |r| r.get(0),
        )?;
        Ok(count > 0)
    }

    pub fn insert_contact_gmail_message(
        &self,
        contact_id: i64,
        gmail_message_id: &str,
        gmail_thread_id: Option<&str>,
        direction: &str,
        subject: Option<String>,
        snippet: Option<String>,
        body_text: Option<String>,
        sent_at: i64,
        provider: &str,
        attachments_json: Option<&str>,
    ) -> Result<()> {
        self.conn.execute(
            "INSERT OR IGNORE INTO contact_gmail_messages (
                contact_id, gmail_message_id, gmail_thread_id, direction,
                subject, snippet, body_text, sent_at, provider, attachments_json, body_fetched
            ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, 0)",
            params![
                contact_id,
                gmail_message_id,
                gmail_thread_id,
                direction,
                subject,
                snippet,
                body_text,
                sent_at,
                provider,
                attachments_json,
            ],
        )?;
        Ok(())
    }

    fn map_contact_gmail_message_row(row: &rusqlite::Row<'_>) -> rusqlite::Result<super::models::ContactGmailMessage> {
        let body_fetched: i64 = row.get(10)?;
        Ok(super::models::ContactGmailMessage {
            id: row.get(0)?,
            contact_id: row.get(1)?,
            gmail_message_id: row.get(2)?,
            gmail_thread_id: row.get(3)?,
            direction: row.get(4)?,
            subject: row.get(5)?,
            snippet: row.get(6)?,
            body_text: row.get(7)?,
            sent_at: row.get(8)?,
            synced_at: row.get(9)?,
            body_fetched: body_fetched != 0,
            provider: row.get(11)?,
            attachments_json: row.get(12)?,
        })
    }

    const CONTACT_GMAIL_SELECT: &str = "SELECT id, contact_id, gmail_message_id, gmail_thread_id, direction,
                    subject, snippet, body_text, sent_at, synced_at, body_fetched, provider, attachments_json";

    pub fn get_contact_gmail_message_by_id(
        &self,
        id: i64,
    ) -> Result<super::models::ContactGmailMessage> {
        self.conn.query_row(
            &format!("{} FROM contact_gmail_messages WHERE id = ?1", Self::CONTACT_GMAIL_SELECT),
            params![id],
            Self::map_contact_gmail_message_row,
        )
    }

    pub fn update_contact_gmail_message_body(&self, id: i64, body: &str) -> Result<()> {
        self.conn.execute(
            "UPDATE contact_gmail_messages SET body_text = ?1, body_fetched = 1 WHERE id = ?2",
            params![body, id],
        )?;
        Ok(())
    }

    pub fn update_contact_gmail_message_attachments(
        &self,
        id: i64,
        attachments_json: &str,
    ) -> Result<()> {
        self.conn.execute(
            "UPDATE contact_gmail_messages SET attachments_json = ?1 WHERE id = ?2",
            params![attachments_json, id],
        )?;
        Ok(())
    }

    pub fn contact_gmail_message_row_id(
        &self,
        contact_id: i64,
        gmail_message_id: &str,
    ) -> Result<Option<i64>> {
        let mut stmt = self.conn.prepare(
            "SELECT id FROM contact_gmail_messages WHERE contact_id = ?1 AND gmail_message_id = ?2",
        )?;
        let mut rows = stmt.query_map(params![contact_id, gmail_message_id], |row| {
            row.get::<_, i64>(0)
        })?;
        if let Some(row) = rows.next() {
            Ok(Some(row?))
        } else {
            Ok(None)
        }
    }

    pub fn contact_campaign_gmail_message_ids(&self, contact_id: i64) -> Result<Vec<String>> {
        let mut stmt = self.conn.prepare(
            "SELECT id FROM (
                SELECT email_gmail_message_id AS id FROM contact_etiquettes
                WHERE contact_id = ?1 AND email_gmail_message_id IS NOT NULL
                  AND TRIM(email_gmail_message_id) != ''
                UNION
                SELECT email_reponse_gmail_message_id AS id FROM contact_etiquettes
                WHERE contact_id = ?1 AND email_reponse_gmail_message_id IS NOT NULL
                  AND TRIM(email_reponse_gmail_message_id) != ''
             )",
        )?;
        let rows = stmt.query_map(params![contact_id], |row| row.get::<_, String>(0))?;
        rows.collect::<Result<Vec<_>, _>>().map_err(Into::into)
    }

    pub fn list_contact_gmail_messages(
        &self,
        contact_id: i64,
        exclude_campaign_ids: bool,
    ) -> Result<Vec<super::models::ContactGmailMessage>> {
        let sql = if exclude_campaign_ids {
            format!(
                "{} FROM contact_gmail_messages m
                 WHERE m.contact_id = ?1
                 AND m.gmail_message_id NOT IN (
                    SELECT id FROM (
                        SELECT email_gmail_message_id AS id FROM contact_etiquettes
                        WHERE contact_id = ?1 AND email_gmail_message_id IS NOT NULL
                          AND TRIM(email_gmail_message_id) != ''
                        UNION
                        SELECT email_reponse_gmail_message_id AS id FROM contact_etiquettes
                        WHERE contact_id = ?1 AND email_reponse_gmail_message_id IS NOT NULL
                          AND TRIM(email_reponse_gmail_message_id) != ''
                    )
                 )
                 ORDER BY m.sent_at DESC",
                Self::CONTACT_GMAIL_SELECT
            )
        } else {
            format!(
                "{} FROM contact_gmail_messages
                 WHERE contact_id = ?1 ORDER BY sent_at DESC",
                Self::CONTACT_GMAIL_SELECT
            )
        };
        let mut stmt = self.conn.prepare(&sql)?;
        let rows = stmt.query_map(params![contact_id], Self::map_contact_gmail_message_row)?;
        rows.collect::<Result<Vec<_>, _>>().map_err(Into::into)
    }

    pub fn get_contact_mail_sync_state(
        &self,
        contact_id: i64,
    ) -> Result<Option<super::models::ContactMailSyncState>> {
        let mut stmt = self.conn.prepare(
            "SELECT contact_id, last_sync_at, last_message_sent_at, initial_sync_complete,
                    backfill_complete, list_page_token
             FROM contact_mail_sync_state WHERE contact_id = ?1",
        )?;
        let mut rows = stmt.query(params![contact_id])?;
        if let Some(row) = rows.next()? {
            let initial: i64 = row.get(3)?;
            let backfill: i64 = row.get(4)?;
            return Ok(Some(super::models::ContactMailSyncState {
                contact_id: row.get(0)?,
                last_sync_at: row.get(1)?,
                last_message_sent_at: row.get(2)?,
                initial_sync_complete: initial != 0,
                backfill_complete: backfill != 0,
                list_page_token: row.get(5)?,
            }));
        }
        Ok(None)
    }

    pub fn upsert_contact_mail_sync_state(
        &self,
        contact_id: i64,
        last_message_sent_at: i64,
        initial_sync_complete: bool,
        backfill_complete: bool,
        list_page_token: Option<&str>,
    ) -> Result<()> {
        let now = chrono::Utc::now().timestamp();
        let prev = self.get_contact_mail_sync_state(contact_id)?;
        let merged_sent = prev
            .as_ref()
            .and_then(|s| s.last_message_sent_at)
            .unwrap_or(0)
            .max(last_message_sent_at);
        let merged_initial = prev
            .as_ref()
            .map(|s| s.initial_sync_complete)
            .unwrap_or(false)
            || initial_sync_complete;
        let merged_backfill = prev
            .as_ref()
            .map(|s| s.backfill_complete)
            .unwrap_or(false)
            || backfill_complete;
        // Ne jamais réutiliser un ancien pageToken quand on passe explicitement None (sync terminée).
        let token = list_page_token.map(|s| s.to_string());
        self.conn.execute(
            "INSERT INTO contact_mail_sync_state (
                contact_id, last_sync_at, last_message_sent_at,
                initial_sync_complete, backfill_complete, list_page_token
            ) VALUES (?1, ?2, ?3, ?4, ?5, ?6)
             ON CONFLICT(contact_id) DO UPDATE SET
               last_sync_at = excluded.last_sync_at,
               last_message_sent_at = excluded.last_message_sent_at,
               initial_sync_complete = excluded.initial_sync_complete,
               backfill_complete = excluded.backfill_complete,
               list_page_token = excluded.list_page_token",
            params![
                contact_id,
                now,
                merged_sent,
                if merged_initial { 1 } else { 0 },
                if merged_backfill { 1 } else { 0 },
                token,
            ],
        )?;
        Ok(())
    }

    fn load_contacts_for_newsletter_audience(&self) -> Result<Vec<ContactAudienceRow>> {
        let mut stmt = self.conn.prepare(
            "SELECT id, nom, prenom, categorie, filleul_categorie, statut_suivi, newsletter_desinscrit_at, email
             FROM contacts
             ORDER BY nom, prenom",
        )?;
        let rows = stmt.query_map([], |row| {
            Ok(ContactAudienceRow {
                id: row.get(0)?,
                nom: row.get(1)?,
                prenom: row.get(2)?,
                categorie: row.get(3)?,
                filleul_categorie: row.get(4)?,
                statut_suivi: row.get(5)?,
                newsletter_desinscrit_at: row.get(6)?,
                email: row.get(7)?,
            })
        })?;
        rows.collect()
    }

    fn is_permanently_excluded_from_newsletter(c: &ContactAudienceRow) -> bool {
        c.newsletter_desinscrit_at.is_some()
    }

    fn is_excluded_by_newsletter_filters(
        c: &ContactAudienceRow,
        filters: &NewsletterAudienceFilters,
    ) -> bool {
        filters.exclude_contact_ids.contains(&c.id)
    }

    fn has_usable_newsletter_email(email: Option<&str>) -> bool {
        email.map(|e| !e.trim().is_empty()).unwrap_or(false)
    }

    pub fn list_newsletter_audience_members(&self) -> Result<Vec<NewsletterAudienceMember>> {
        let contacts = self.load_contacts_for_newsletter_audience()?;
        Ok(contacts
            .into_iter()
            .map(|c| {
                let has_email = Self::has_usable_newsletter_email(c.email.as_deref());
                NewsletterAudienceMember {
                    contact_id: c.id,
                    nom: c.nom,
                    prenom: c.prenom,
                    email: c.email,
                    categorie: c.categorie,
                    filleul_categorie: c.filleul_categorie,
                    has_email,
                    unsubscribed: c.newsletter_desinscrit_at.is_some(),
                }
            })
            .collect())
    }

    pub fn preview_newsletter_audience(
        &self,
        filters: &NewsletterAudienceFilters,
    ) -> Result<NewsletterAudiencePreview> {
        let contacts = self.load_contacts_for_newsletter_audience()?;
        let total = contacts.len() as u32;
        let mut with_email = 0u32;
        let mut without_email = 0u32;
        let mut permanent_excluded = 0u32;
        let mut excluded_by_filters = 0u32;
        let mut eligible = 0u32;
        let mut recipients = Vec::new();

        for c in &contacts {
            if Self::has_usable_newsletter_email(c.email.as_deref()) {
                with_email += 1;
            } else {
                without_email += 1;
            }
            if Self::is_permanently_excluded_from_newsletter(c) {
                permanent_excluded += 1;
                continue;
            }
            if Self::is_excluded_by_newsletter_filters(c, filters) {
                excluded_by_filters += 1;
                continue;
            }
            if Self::has_usable_newsletter_email(c.email.as_deref()) {
                eligible += 1;
                recipients.push(NewsletterEligibleContact {
                    contact_id: c.id,
                    nom: c.nom.clone(),
                    prenom: c.prenom.clone(),
                    email: c.email.clone().unwrap_or_default(),
                    categorie: c.categorie.clone(),
                    filleul_categorie: c.filleul_categorie.clone(),
                });
            }
        }

        Ok(NewsletterAudiencePreview {
            total_contacts: total,
            with_email,
            without_email,
            permanent_excluded,
            excluded_by_filters,
            eligible,
            recipients,
        })
    }

    pub fn list_newsletter_unsubscribed(&self) -> Result<Vec<NewsletterUnsubscribedContact>> {
        let mut stmt = self.conn.prepare(
            "SELECT id, nom, prenom, email, newsletter_desinscrit_at, newsletter_desinscrit_note
             FROM contacts
             WHERE newsletter_desinscrit_at IS NOT NULL
             ORDER BY newsletter_desinscrit_at DESC, nom, prenom",
        )?;
        let rows = stmt.query_map([], |row| {
            Ok(NewsletterUnsubscribedContact {
                contact_id: row.get(0)?,
                nom: row.get(1)?,
                prenom: row.get(2)?,
                email: row.get(3)?,
                unsubscribed_at: row.get::<_, Option<i64>>(4)?.unwrap_or(0),
                source: row.get(5)?,
            })
        })?;
        rows.collect()
    }

    pub fn mark_newsletter_unsubscribed(
        &self,
        contact_id: i64,
        source: Option<&str>,
    ) -> Result<bool> {
        let now = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_secs() as i64;

        let updated = self.conn.execute(
            "UPDATE contacts SET newsletter_desinscrit_at = ?1,
             newsletter_desinscrit_note = COALESCE(?2, newsletter_desinscrit_note),
             updated_at = ?1
             WHERE id = ?3 AND newsletter_desinscrit_at IS NULL",
            params![now, source, contact_id],
        )?;

        let _ = self.conn.execute(
            "DELETE FROM contact_etiquettes
             WHERE contact_id = ?1 AND email_envoye = 0
               AND etiquette_id IN (
                 SELECT id FROM etiquettes WHERE email_actif = 1
                   AND email_template_id IN (
                     SELECT id FROM templates_email WHERE categorie = 'NEWSLETTER'
                   )
               )",
            params![contact_id],
        );

        Ok(updated > 0)
    }

    pub fn try_newsletter_unsubscribe_from_reply(
        &self,
        contact_etiquette_id: i64,
        reply_subject: Option<&str>,
        reply_text: Option<&str>,
    ) -> Result<bool> {
        if !is_newsletter_unsubscribe_request(reply_subject, reply_text) {
            return Ok(false);
        }

        let (contact_id, template_categorie): (i64, Option<String>) = self.conn.query_row(
            "SELECT ce.contact_id, t.categorie
             FROM contact_etiquettes ce
             INNER JOIN etiquettes e ON ce.etiquette_id = e.id
             LEFT JOIN templates_email t ON e.email_template_id = t.id
             WHERE ce.id = ?1",
            params![contact_etiquette_id],
            |row| Ok((row.get(0)?, row.get(1)?)),
        )?;

        if template_categorie.as_deref() != Some("NEWSLETTER") {
            return Ok(false);
        }

        self.mark_newsletter_unsubscribed(contact_id, Some("Lien Se désinscrire (email)"))?;
        Ok(true)
    }

    pub fn try_newsletter_unsubscribe_from_template_reply(
        &self,
        row_id: i64,
        reply_subject: Option<&str>,
        reply_text: Option<&str>,
    ) -> Result<bool> {
        if !is_newsletter_unsubscribe_request(reply_subject, reply_text) {
            return Ok(false);
        }

        let (contact_id, template_categorie): (i64, String) = self.conn.query_row(
            "SELECT cte.contact_id, t.categorie
             FROM contact_template_envois cte
             INNER JOIN templates_email t ON cte.template_id = t.id
             WHERE cte.id = ?1",
            params![row_id],
            |row| Ok((row.get(0)?, row.get(1)?)),
        )?;

        if template_categorie != "NEWSLETTER" {
            return Ok(false);
        }

        self.mark_newsletter_unsubscribed(contact_id, Some("Lien Se désinscrire (email)"))?;
        Ok(true)
    }

    pub fn upsert_newsletter_template(
        &self,
        etiquette_id: i64,
        subject: &str,
        plain_body: &str,
        html_meta: &str,
    ) -> Result<i64> {
        use super::models::NewTemplateEmail;

        let etiquette = self.get_etiquette_by_id(etiquette_id)?;
        let template_payload = NewTemplateEmail {
            nom: "Newsletter".into(),
            sujet: subject.into(),
            corps: plain_body.into(),
            categorie: "NEWSLETTER".into(),
            variables: Some(html_meta.into()),
            agenda_link_id: None,
            relance_template_id: None,
            tutoiement_template_id: None,
        };

        if let Some(template_id) = etiquette.email_template_id {
            if let Ok(existing) = self.get_template_email_by_id(template_id) {
                if existing.categorie == "NEWSLETTER" {
                    let updated = self.update_template_email(template_id, &template_payload)?;
                    return Ok(updated.id);
                }
            }
        }

        let created = self.create_template_email(template_payload)?;
        Ok(created.id)
    }

    pub fn queue_newsletter_edition(
        &self,
        etiquette_id: i64,
        send_at: i64,
        filters: &NewsletterAudienceFilters,
    ) -> Result<(u32, u32, Vec<QueuedNewsletterContact>)> {
        let contacts = self.load_contacts_for_newsletter_audience()?;
        let mut queued = 0u32;
        let mut skipped_no_email = 0u32;
        let mut queued_contacts = Vec::new();

        self.conn.execute("BEGIN IMMEDIATE", [])?;

        let result = (|| -> Result<(u32, u32, Vec<QueuedNewsletterContact>)> {
            for c in contacts {
                if Self::is_permanently_excluded_from_newsletter(&c)
                    || Self::is_excluded_by_newsletter_filters(&c, filters)
                {
                    continue;
                }
                if !Self::has_usable_newsletter_email(c.email.as_deref()) {
                    skipped_no_email += 1;
                    continue;
                }

                self.conn.execute(
                    "INSERT INTO contact_etiquettes (
                        contact_id, etiquette_id, attribue_par, email_date_prevue,
                        email_envoye, email_suivi_ignore, email_relance_active
                     ) VALUES (?1, ?2, 'NEWSLETTER', ?3, 0, 1, 0)
                     ON CONFLICT(contact_id, etiquette_id) DO UPDATE SET
                        attribue_par = 'NEWSLETTER',
                        date_attribution = unixepoch(),
                        email_date_prevue = excluded.email_date_prevue,
                        email_envoye = 0,
                        email_date_envoi = NULL,
                        email_reponse_at = NULL,
                        email_reponse_type = NULL,
                        email_reponse_body = NULL,
                        email_reponse_gmail_message_id = NULL,
                        email_suivi_ignore = 1,
                        email_relance_active = 0,
                        email_gmail_message_id = NULL,
                        email_gmail_thread_id = NULL,
                        email_sent_subject = NULL,
                        email_sent_body = NULL,
                        email_sent_template_nom = NULL",
                    params![c.id, etiquette_id, send_at],
                )?;

                let contact_etiquette_id: i64 = self.conn.query_row(
                    "SELECT id FROM contact_etiquettes WHERE contact_id = ?1 AND etiquette_id = ?2",
                    params![c.id, etiquette_id],
                    |row| row.get(0),
                )?;

                queued_contacts.push(QueuedNewsletterContact {
                    contact_id: c.id,
                    contact_etiquette_id,
                    nom: c.nom.clone(),
                    prenom: c.prenom.clone(),
                    email: c.email.clone().unwrap_or_default(),
                });
                queued += 1;
            }
            Ok((queued, skipped_no_email, queued_contacts))
        })();

        match result {
            Ok(r) => {
                self.conn.execute("COMMIT", [])?;
                Ok(r)
            }
            Err(e) => {
                let _ = self.conn.execute("ROLLBACK", []);
                Err(e)
            }
        }
    }

    pub fn create_newsletter_edition(
        &self,
        etiquette_id: i64,
        template_id: i64,
        edition_label: &str,
        subject: &str,
        plain_body: &str,
        content_json: &str,
        theme: Option<&str>,
        edition_instructions: Option<&str>,
        filters_json: &str,
        prepared_at: i64,
        queued: &[QueuedNewsletterContact],
    ) -> Result<i64> {
        self.conn.execute(
            "INSERT INTO newsletter_editions (
                etiquette_id, template_id, edition_label, subject, plain_body, content_json,
                theme, edition_instructions, audience_filters_json, prepared_at, queued_count, status
             ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, 'prepared')",
            params![
                etiquette_id,
                template_id,
                edition_label,
                subject,
                plain_body,
                content_json,
                theme,
                edition_instructions,
                filters_json,
                prepared_at,
                queued.len() as i64,
            ],
        )?;
        let edition_id = self.conn.last_insert_rowid();

        for q in queued {
            self.conn.execute(
                "INSERT INTO newsletter_edition_recipients (
                    edition_id, contact_id, contact_etiquette_id, nom, prenom, email
                 ) VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
                params![
                    edition_id,
                    q.contact_id,
                    q.contact_etiquette_id,
                    q.nom,
                    q.prenom,
                    q.email,
                ],
            )?;
        }

        Ok(edition_id)
    }

    pub fn list_newsletter_editions(&self, limit: u32) -> Result<Vec<NewsletterEditionSummary>> {
        let mut stmt = self.conn.prepare(
            "SELECT id, edition_label, subject, prepared_at, send_completed_at,
                    queued_count, sent_count, error_count, status
             FROM newsletter_editions
             ORDER BY prepared_at DESC
             LIMIT ?1",
        )?;
        let rows = stmt.query_map(params![limit], |row| {
            Ok(NewsletterEditionSummary {
                id: row.get(0)?,
                edition_label: row.get(1)?,
                subject: row.get(2)?,
                prepared_at: row.get(3)?,
                send_completed_at: row.get(4)?,
                queued_count: row.get::<_, i64>(5)? as u32,
                sent_count: row.get::<_, i64>(6)? as u32,
                error_count: row.get::<_, i64>(7)? as u32,
                status: row.get(8)?,
            })
        })?;
        rows.collect()
    }

    pub fn get_newsletter_edition_detail(&self, edition_id: i64) -> Result<NewsletterEditionDetail> {
        let mut detail = self.conn.query_row(
            "SELECT id, edition_label, subject, plain_body, theme, edition_instructions,
                    prepared_at, send_started_at, send_completed_at,
                    queued_count, sent_count, error_count, status
             FROM newsletter_editions WHERE id = ?1",
            params![edition_id],
            |row| {
                Ok(NewsletterEditionDetail {
                    id: row.get(0)?,
                    edition_label: row.get(1)?,
                    subject: row.get(2)?,
                    plain_body: row.get(3)?,
                    theme: row.get(4)?,
                    edition_instructions: row.get(5)?,
                    prepared_at: row.get(6)?,
                    send_started_at: row.get(7)?,
                    send_completed_at: row.get(8)?,
                    queued_count: row.get::<_, i64>(9)? as u32,
                    sent_count: row.get::<_, i64>(10)? as u32,
                    error_count: row.get::<_, i64>(11)? as u32,
                    status: row.get(12)?,
                    recipients: Vec::new(),
                })
            },
        )?;

        let mut stmt = self.conn.prepare(
            "SELECT contact_id, contact_etiquette_id, nom, prenom, email, sent_at, error_message
             FROM newsletter_edition_recipients
             WHERE edition_id = ?1
             ORDER BY nom, prenom",
        )?;
        detail.recipients = stmt
            .query_map(params![edition_id], |row| {
                Ok(NewsletterEditionRecipient {
                    contact_id: row.get(0)?,
                    contact_etiquette_id: row.get(1)?,
                    nom: row.get(2)?,
                    prenom: row.get(3)?,
                    email: row.get(4)?,
                    sent_at: row.get(5)?,
                    error_message: row.get(6)?,
                })
            })?
            .collect::<Result<Vec<_>>>()?;

        Ok(detail)
    }

    pub fn get_last_newsletter_edition_duplicate(
        &self,
    ) -> Result<Option<LastNewsletterEditionDuplicate>> {
        let mut stmt = self.conn.prepare(
            "SELECT edition_label, subject, plain_body, content_json, theme, edition_instructions, prepared_at
             FROM newsletter_editions
             ORDER BY prepared_at DESC
             LIMIT 1",
        )?;
        let mut rows = stmt.query([])?;
        if let Some(row) = rows.next()? {
            return Ok(Some(LastNewsletterEditionDuplicate {
                edition_label: row.get(0)?,
                subject: row.get(1)?,
                plain_body: row.get(2)?,
                content_json: row.get(3)?,
                theme: row.get(4)?,
                edition_instructions: row.get(5)?,
                prepared_at: row.get(6)?,
            }));
        }
        Ok(None)
    }

    pub fn start_newsletter_edition_send(&self, edition_id: i64, started_at: i64) -> Result<()> {
        let updated = self.conn.execute(
            "UPDATE newsletter_editions
             SET status = 'sending', send_started_at = ?1
             WHERE id = ?2 AND status IN ('prepared', 'partial')",
            params![started_at, edition_id],
        )?;
        if updated == 0 {
            return Err(rusqlite::Error::InvalidParameterName(format!(
                "Édition introuvable ou déjà envoyée: {}",
                edition_id
            )));
        }
        Ok(())
    }

    pub fn record_newsletter_edition_send(
        &self,
        edition_id: i64,
        contact_etiquette_id: i64,
        sent_at: i64,
        gmail_message_id: Option<&str>,
        error_message: Option<&str>,
    ) -> Result<()> {
        self.conn.execute("BEGIN IMMEDIATE", [])?;
        let result = (|| -> Result<()> {
            if let Some(err) = error_message {
                self.conn.execute(
                    "UPDATE newsletter_edition_recipients
                     SET error_message = ?1
                     WHERE edition_id = ?2 AND contact_etiquette_id = ?3",
                    params![err, edition_id, contact_etiquette_id],
                )?;
                self.conn.execute(
                    "UPDATE newsletter_editions SET error_count = error_count + 1 WHERE id = ?1",
                    params![edition_id],
                )?;
            } else {
                self.conn.execute(
                    "UPDATE newsletter_edition_recipients
                     SET sent_at = ?1, gmail_message_id = ?2, error_message = NULL
                     WHERE edition_id = ?3 AND contact_etiquette_id = ?4",
                    params![sent_at, gmail_message_id, edition_id, contact_etiquette_id],
                )?;
                self.conn.execute(
                    "UPDATE newsletter_editions SET sent_count = sent_count + 1 WHERE id = ?1",
                    params![edition_id],
                )?;
            }
            Ok(())
        })();
        match result {
            Ok(()) => {
                self.conn.execute("COMMIT", [])?;
                Ok(())
            }
            Err(e) => {
                let _ = self.conn.execute("ROLLBACK", []);
                Err(e)
            }
        }
    }

    pub fn finish_newsletter_edition_send(
        &self,
        edition_id: i64,
        completed_at: i64,
        cancelled: bool,
    ) -> Result<NewsletterEditionSummary> {
        let (_queued, sent, errors): (i64, i64, i64) = self.conn.query_row(
            "SELECT queued_count, sent_count, error_count FROM newsletter_editions WHERE id = ?1",
            params![edition_id],
            |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)),
        )?;

        let status = if cancelled {
            if sent > 0 || errors > 0 {
                "partial"
            } else {
                "cancelled"
            }
        } else if errors > 0 {
            "partial"
        } else {
            "completed"
        };

        self.conn.execute(
            "UPDATE newsletter_editions
             SET status = ?1, send_completed_at = ?2
             WHERE id = ?3",
            params![status, completed_at, edition_id],
        )?;

        self.conn.query_row(
            "SELECT id, edition_label, subject, prepared_at, send_completed_at,
                    queued_count, sent_count, error_count, status
             FROM newsletter_editions WHERE id = ?1",
            params![edition_id],
            |row| {
                Ok(NewsletterEditionSummary {
                    id: row.get(0)?,
                    edition_label: row.get(1)?,
                    subject: row.get(2)?,
                    prepared_at: row.get(3)?,
                    send_completed_at: row.get(4)?,
                    queued_count: row.get::<_, i64>(5)? as u32,
                    sent_count: row.get::<_, i64>(6)? as u32,
                    error_count: row.get::<_, i64>(7)? as u32,
                    status: row.get(8)?,
                })
            },
        )
    }
}

#[cfg(test)]
mod database_integration_tests {
    use super::*;
    use chrono::TimeZone;
    use crate::database::models::{NewContact, NewFoyer, NewInvestissement, NewInvestissementValorisation};
    use crate::database::Database;

    fn test_db() -> Database {
        Database::open_in_memory_for_tests().expect("in-memory db")
    }

    fn sample_contact(nom: &str, prenom: &str) -> NewContact {
        NewContact {
            categorie: "CLIENT".into(),
            nom: nom.into(),
            prenom: prenom.into(),
            statut_suivi: Some("ACTIF".into()),
            famille_id: None,
            foyer_id: None,
            role_foyer: None,
            role_famille: None,
            filleul_categorie: None,
            parrain_id: None,
            prescripteur_id: None,
            civilite: None,
            email: None,
            telephone: None,
            adresse: None,
            code_postal: None,
            ville: None,
            date_naissance: None,
            profession: None,
            situation_familiale: None,
            source_lead: None,
            profil_risque_sri: None,
            date_dernier_contact: None,
            date_prochain_suivi: None,
            date_dernier_contact_filleul: None,
            date_prochain_suivi_filleul: None,
            notes: None,
            registre: None,
        }
    }

    #[test]
    fn create_investissement_sets_dernier_contact_from_souscription_when_empty() {
        let db = test_db();
        let contact = db.create_contact(sample_contact("Dupont", "Jean")).unwrap();
        let souscription_ts = chrono::Utc.with_ymd_and_hms(2025, 3, 15, 0, 0, 0).unwrap().timestamp();
        let iso = chrono::DateTime::from_timestamp(souscription_ts, 0)
            .unwrap()
            .to_rfc3339();

        db.create_investissement(NewInvestissement {
            contact_id: contact.id,
            foyer_id: None,
            type_produit: "ASSURANCE_VIE".into(),
            partenaire_id: None,
            nom_produit: "Contrat test".into(),
            montant_initial: Some(100_000),
            date_souscription: Some(iso),
            date_fin_demembrement: None,
            date_fin_pret: None,
            versement_programme: None,
            montant_versement_programme: None,
            frequence_versement: None,
            reinvestissement_dividendes: None,
            notes: None,
            origine: Some("MON_CONSEIL".into()),
        })
        .unwrap();

        let updated = db.get_contact_by_id(contact.id.unwrap()).unwrap();
        assert_eq!(updated.date_dernier_contact, Some(souscription_ts));
    }

    #[test]
    fn dashboard_encours_uses_valorisation_with_fallback_to_montant_initial() {
        let db = test_db();
        let contact = db.create_contact(sample_contact("Martin", "Paul")).unwrap();
        let contact_id = contact.id.unwrap();

        let inv = db
            .create_investissement(NewInvestissement {
                contact_id: Some(contact_id),
                foyer_id: None,
                type_produit: "ASSURANCE_VIE".into(),
                partenaire_id: None,
                nom_produit: "AV test".into(),
                montant_initial: Some(2_000_000),
                date_souscription: None,
                date_fin_demembrement: None,
                date_fin_pret: None,
                versement_programme: None,
                montant_versement_programme: None,
                frequence_versement: None,
                reinvestissement_dividendes: None,
                notes: None,
                origine: Some("MON_CONSEIL".into()),
            })
            .unwrap();

        let stats_before = db.get_dashboard_stats().unwrap();
        assert!((stats_before.encours_placements - 20_000.0).abs() < 0.01);

        db.create_investissement_valorisation(NewInvestissementValorisation {
            investissement_id: inv.id,
            montant: 2_500_000,
            date_valorisation: None,
            notes: None,
        })
        .unwrap();

        let stats_after = db.get_dashboard_stats().unwrap();
        assert!((stats_after.encours_placements - 25_000.0).abs() < 0.01);

        let refreshed = db.get_investissement_by_id(inv.id).unwrap();
        assert_eq!(refreshed.encours_actuel, Some(2_500_000));
        assert_eq!(refreshed.montant_initial, Some(2_000_000));
    }

    #[test]
    fn dashboard_encours_excludes_existant_client() {
        let db = test_db();
        let contact = db.create_contact(sample_contact("Durand", "Luc")).unwrap();
        let contact_id = contact.id.unwrap();

        db.create_investissement(NewInvestissement {
            contact_id: Some(contact_id),
            foyer_id: None,
            type_produit: "ASSURANCE_VIE".into(),
            partenaire_id: None,
            nom_produit: "AV avec moi".into(),
            montant_initial: Some(1_000_000),
            date_souscription: None,
            date_fin_demembrement: None,
            date_fin_pret: None,
            versement_programme: None,
            montant_versement_programme: None,
            frequence_versement: None,
            reinvestissement_dividendes: None,
            notes: None,
            origine: Some("MON_CONSEIL".into()),
        })
        .unwrap();

        db.create_investissement(NewInvestissement {
            contact_id: Some(contact_id),
            foyer_id: None,
            type_produit: "PER".into(),
            partenaire_id: None,
            nom_produit: "PER à côté".into(),
            montant_initial: Some(5_000_000),
            date_souscription: None,
            date_fin_demembrement: None,
            date_fin_pret: None,
            versement_programme: None,
            montant_versement_programme: None,
            frequence_versement: None,
            reinvestissement_dividendes: None,
            notes: None,
            origine: Some("EXISTANT_CLIENT".into()),
        })
        .unwrap();

        let stats = db.get_dashboard_stats().unwrap();
        assert!((stats.encours_placements - 10_000.0).abs() < 0.01);
    }

    #[test]
    fn panier_moyen_uses_montant_initial_not_encours() {
        let db = test_db();
        let contact = db.create_contact(sample_contact("Petit", "Jean")).unwrap();
        let contact_id = contact.id.unwrap();

        let inv = db
            .create_investissement(NewInvestissement {
                contact_id: Some(contact_id),
                foyer_id: None,
                type_produit: "ASSURANCE_VIE".into(),
                partenaire_id: None,
                nom_produit: "AV".into(),
                montant_initial: Some(2_000_000),
                date_souscription: None,
                date_fin_demembrement: None,
                date_fin_pret: None,
                versement_programme: None,
                montant_versement_programme: None,
                frequence_versement: None,
                reinvestissement_dividendes: None,
                notes: None,
                origine: Some("MON_CONSEIL".into()),
            })
            .unwrap();

        db.create_investissement_valorisation(NewInvestissementValorisation {
            investissement_id: inv.id,
            montant: 3_000_000,
            date_valorisation: None,
            notes: None,
        })
        .unwrap();

        let stats = db.get_dashboard_stats().unwrap();
        assert!((stats.encours_placements - 30_000.0).abs() < 0.01);
        assert!((stats.panier_moyen - 20_000.0).abs() < 0.01);
    }

    #[test]
    fn valorisation_same_day_replaces_existing_releve() {
        let db = test_db();
        let contact = db.create_contact(sample_contact("Blanc", "Anne")).unwrap();
        let inv = db
            .create_investissement(NewInvestissement {
                contact_id: contact.id,
                foyer_id: None,
                type_produit: "PER".into(),
                partenaire_id: None,
                nom_produit: "PER".into(),
                montant_initial: Some(1_000_000),
                date_souscription: None,
                date_fin_demembrement: None,
                date_fin_pret: None,
                versement_programme: None,
                montant_versement_programme: None,
                frequence_versement: None,
                reinvestissement_dividendes: None,
                notes: None,
                origine: Some("MON_CONSEIL".into()),
            })
            .unwrap();

        let day = chrono::Utc.with_ymd_and_hms(2026, 3, 15, 0, 0, 0).unwrap();
        let iso = day.to_rfc3339();

        db.create_investissement_valorisation(NewInvestissementValorisation {
            investissement_id: inv.id,
            montant: 1_100_000,
            date_valorisation: Some(iso.clone()),
            notes: None,
        })
        .unwrap();

        db.create_investissement_valorisation(NewInvestissementValorisation {
            investissement_id: inv.id,
            montant: 1_250_000,
            date_valorisation: Some(iso),
            notes: None,
        })
        .unwrap();

        let rows = db.get_valorisations_by_investissement(inv.id).unwrap();
        assert_eq!(rows.len(), 1);
        assert_eq!(rows[0].montant, 1_250_000);
    }

    #[test]
    fn create_investissement_mon_conseil_promotes_prospect_client_to_client() {
        let db = test_db();
        let mut prospect = sample_contact("Dupont", "Marie");
        prospect.categorie = "PROSPECT_CLIENT".into();
        let contact = db.create_contact(prospect).unwrap();
        let contact_id = contact.id.unwrap();

        db.create_investissement(NewInvestissement {
            contact_id: Some(contact_id),
            foyer_id: None,
            type_produit: "ASSURANCE_VIE".into(),
            partenaire_id: None,
            nom_produit: "Contrat test".into(),
            montant_initial: Some(50_000),
            date_souscription: None,
            date_fin_demembrement: None,
            date_fin_pret: None,
            versement_programme: None,
            montant_versement_programme: None,
            frequence_versement: None,
            reinvestissement_dividendes: None,
            notes: None,
            origine: Some("MON_CONSEIL".into()),
        })
        .unwrap();

        let updated = db.get_contact_by_id(contact_id).unwrap();
        assert_eq!(updated.categorie, "CLIENT");
    }

    #[test]
    fn create_investissement_mon_conseil_promotes_suspect_client_to_client() {
        let db = test_db();
        let mut suspect = sample_contact("Martin", "Paul");
        suspect.categorie = "SUSPECT_CLIENT".into();
        let contact = db.create_contact(suspect).unwrap();
        let contact_id = contact.id.unwrap();

        db.create_investissement(NewInvestissement {
            contact_id: Some(contact_id),
            foyer_id: None,
            type_produit: "SCPI".into(),
            partenaire_id: None,
            nom_produit: "SCPI test".into(),
            montant_initial: Some(10_000),
            date_souscription: None,
            date_fin_demembrement: None,
            date_fin_pret: None,
            versement_programme: None,
            montant_versement_programme: None,
            frequence_versement: None,
            reinvestissement_dividendes: None,
            notes: None,
            origine: Some("MON_CONSEIL".into()),
        })
        .unwrap();

        let updated = db.get_contact_by_id(contact_id).unwrap();
        assert_eq!(updated.categorie, "CLIENT");
    }

    #[test]
    fn create_investissement_existant_client_does_not_promote_prospect() {
        let db = test_db();
        let mut prospect = sample_contact("Bernard", "Luc");
        prospect.categorie = "PROSPECT_CLIENT".into();
        let contact = db.create_contact(prospect).unwrap();
        let contact_id = contact.id.unwrap();

        db.create_investissement(NewInvestissement {
            contact_id: Some(contact_id),
            foyer_id: None,
            type_produit: "ASSURANCE_VIE".into(),
            partenaire_id: None,
            nom_produit: "Patrimoine existant".into(),
            montant_initial: Some(200_000),
            date_souscription: None,
            date_fin_demembrement: None,
            date_fin_pret: None,
            versement_programme: None,
            montant_versement_programme: None,
            frequence_versement: None,
            reinvestissement_dividendes: None,
            notes: None,
            origine: Some("EXISTANT_CLIENT".into()),
        })
        .unwrap();

        let updated = db.get_contact_by_id(contact_id).unwrap();
        assert_eq!(updated.categorie, "PROSPECT_CLIENT");
    }

    fn investissement_with_souscription(
        db: &Database,
        contact_id: i64,
        year: i32,
        month: u32,
        montant_centimes: i64,
    ) {
        let ts = chrono::Utc
            .with_ymd_and_hms(year, month, 15, 0, 0, 0)
            .unwrap()
            .timestamp();
        let iso = chrono::DateTime::from_timestamp(ts, 0)
            .unwrap()
            .to_rfc3339();

        db.create_investissement(NewInvestissement {
            contact_id: Some(contact_id),
            foyer_id: None,
            type_produit: "ASSURANCE_VIE".into(),
            partenaire_id: None,
            nom_produit: "Contrat test".into(),
            montant_initial: Some(montant_centimes),
            date_souscription: Some(iso),
            date_fin_demembrement: None,
            date_fin_pret: None,
            versement_programme: None,
            montant_versement_programme: None,
            frequence_versement: None,
            reinvestissement_dividendes: None,
            notes: None,
            origine: Some("MON_CONSEIL".into()),
        })
        .unwrap();
    }

    #[test]
    fn get_yearly_activity_stats_groups_by_souscription_year() {
        let db = test_db();
        let alice = db.create_contact(sample_contact("Dupont", "Alice")).unwrap();
        let bob = db.create_contact(sample_contact("Martin", "Bob")).unwrap();

        investissement_with_souscription(&db, alice.id.unwrap(), 2024, 3, 10_000_00);
        investissement_with_souscription(&db, bob.id.unwrap(), 2024, 6, 5_000_00);
        investissement_with_souscription(&db, alice.id.unwrap(), 2025, 1, 20_000_00);

        let stats = db.get_yearly_activity_stats().unwrap();
        assert_eq!(stats.len(), 2);

        let y2024 = stats.iter().find(|s| s.year == 2024).unwrap();
        assert_eq!(y2024.clients, 2);
        assert!((y2024.panier_moyen - 7_500.0).abs() < 0.01);

        let y2025 = stats.iter().find(|s| s.year == 2025).unwrap();
        assert_eq!(y2025.clients, 1);
        assert!((y2025.panier_moyen - 20_000.0).abs() < 0.01);
    }

    #[test]
    fn create_investissement_does_not_overwrite_existing_dernier_contact() {
        let db = test_db();
        let existing_ts = chrono::Utc.with_ymd_and_hms(2024, 1, 10, 0, 0, 0).unwrap().timestamp();
        let existing_iso = chrono::DateTime::from_timestamp(existing_ts, 0)
            .unwrap()
            .to_rfc3339();
        let contact = db
            .create_contact(NewContact {
                date_dernier_contact: Some(existing_iso),
                ..sample_contact("Martin", "Paul")
            })
            .unwrap();

        let souscription_ts = chrono::Utc.with_ymd_and_hms(2025, 6, 1, 0, 0, 0).unwrap().timestamp();
        let souscription_iso = chrono::DateTime::from_timestamp(souscription_ts, 0)
            .unwrap()
            .to_rfc3339();

        db.create_investissement(NewInvestissement {
            contact_id: contact.id,
            foyer_id: None,
            type_produit: "PER".into(),
            partenaire_id: None,
            nom_produit: "PER test".into(),
            montant_initial: None,
            date_souscription: Some(souscription_iso),
            date_fin_demembrement: None,
            date_fin_pret: None,
            versement_programme: None,
            montant_versement_programme: None,
            frequence_versement: None,
            reinvestissement_dividendes: None,
            notes: None,
            origine: Some("MON_CONSEIL".into()),
        })
        .unwrap();

        let updated = db.get_contact_by_id(contact.id.unwrap()).unwrap();
        assert_eq!(updated.date_dernier_contact, Some(existing_ts));
    }

    #[test]
    fn sync_dernier_contact_bumps_to_newer_souscription_when_linked_to_old_one() {
        let db = test_db();
        let contact = db.create_contact(sample_contact("Bernard", "Luc")).unwrap();
        let older_ts = chrono::Utc.with_ymd_and_hms(2024, 1, 10, 0, 0, 0).unwrap().timestamp();
        let newer_ts = chrono::Utc.with_ymd_and_hms(2025, 6, 1, 0, 0, 0).unwrap().timestamp();
        let older_iso = chrono::DateTime::from_timestamp(older_ts, 0).unwrap().to_rfc3339();
        let newer_iso = chrono::DateTime::from_timestamp(newer_ts, 0).unwrap().to_rfc3339();

        db.create_investissement(NewInvestissement {
            contact_id: contact.id,
            foyer_id: None,
            type_produit: "ASSURANCE_VIE".into(),
            partenaire_id: None,
            nom_produit: "AV 1".into(),
            montant_initial: None,
            date_souscription: Some(older_iso),
            date_fin_demembrement: None,
            date_fin_pret: None,
            versement_programme: None,
            montant_versement_programme: None,
            frequence_versement: None,
            reinvestissement_dividendes: None,
            notes: None,
            origine: Some("MON_CONSEIL".into()),
        })
        .unwrap();

        assert_eq!(
            db.get_contact_by_id(contact.id.unwrap()).unwrap().date_dernier_contact,
            Some(older_ts)
        );

        db.create_investissement(NewInvestissement {
            contact_id: contact.id,
            foyer_id: None,
            type_produit: "PER".into(),
            partenaire_id: None,
            nom_produit: "PER 2".into(),
            montant_initial: None,
            date_souscription: Some(newer_iso),
            date_fin_demembrement: None,
            date_fin_pret: None,
            versement_programme: None,
            montant_versement_programme: None,
            frequence_versement: None,
            reinvestissement_dividendes: None,
            notes: None,
            origine: Some("MON_CONSEIL".into()),
        })
        .unwrap();

        assert_eq!(
            db.get_contact_by_id(contact.id.unwrap()).unwrap().date_dernier_contact,
            Some(newer_ts)
        );
    }

    #[test]
    fn sync_dernier_contact_when_first_investissement_has_no_souscription() {
        let db = test_db();
        let contact = db.create_contact(sample_contact("Durand", "Anne")).unwrap();
        let souscription_ts = chrono::Utc.with_ymd_and_hms(2025, 6, 1, 0, 0, 0).unwrap().timestamp();
        let souscription_iso = chrono::DateTime::from_timestamp(souscription_ts, 0)
            .unwrap()
            .to_rfc3339();

        db.create_investissement(NewInvestissement {
            contact_id: contact.id,
            foyer_id: None,
            type_produit: "SCPI".into(),
            partenaire_id: None,
            nom_produit: "Sans date".into(),
            montant_initial: None,
            date_souscription: None,
            date_fin_demembrement: None,
            date_fin_pret: None,
            versement_programme: None,
            montant_versement_programme: None,
            frequence_versement: None,
            reinvestissement_dividendes: None,
            notes: None,
            origine: Some("MON_CONSEIL".into()),
        })
        .unwrap();

        assert!(db.get_contact_by_id(contact.id.unwrap()).unwrap().date_dernier_contact.is_none());

        db.create_investissement(NewInvestissement {
            contact_id: contact.id,
            foyer_id: None,
            type_produit: "PER".into(),
            partenaire_id: None,
            nom_produit: "Avec date".into(),
            montant_initial: None,
            date_souscription: Some(souscription_iso),
            date_fin_demembrement: None,
            date_fin_pret: None,
            versement_programme: None,
            montant_versement_programme: None,
            frequence_versement: None,
            reinvestissement_dividendes: None,
            notes: None,
            origine: Some("MON_CONSEIL".into()),
        })
        .unwrap();

        let updated = db.get_contact_by_id(contact.id.unwrap()).unwrap();
        assert_eq!(updated.date_dernier_contact, Some(souscription_ts));
    }

    #[test]
    fn sync_dernier_contact_closes_obsolete_suivi_alerte_after_newer_souscription() {
        let db = test_db();
        let contact = db.create_contact(sample_contact("Bernard", "Luc")).unwrap();
        let contact_id = contact.id.unwrap();
        let older_ts = chrono::Utc.with_ymd_and_hms(2022, 1, 10, 0, 0, 0).unwrap().timestamp();
        let newer_ts = chrono::Utc::now().timestamp() - 30 * 24 * 3600;
        let older_iso = chrono::DateTime::from_timestamp(older_ts, 0).unwrap().to_rfc3339();
        let newer_iso = chrono::DateTime::from_timestamp(newer_ts, 0).unwrap().to_rfc3339();

        db.create_investissement(NewInvestissement {
            contact_id: Some(contact_id),
            foyer_id: None,
            type_produit: "ASSURANCE_VIE".into(),
            partenaire_id: None,
            nom_produit: "AV 1".into(),
            montant_initial: None,
            date_souscription: Some(older_iso),
            date_fin_demembrement: None,
            date_fin_pret: None,
            versement_programme: None,
            montant_versement_programme: None,
            frequence_versement: None,
            reinvestissement_dividendes: None,
            notes: None,
            origine: Some("MON_CONSEIL".into()),
        })
        .unwrap();

        db.create_alerte(crate::database::models::NewAlerte {
            contact_id,
            type_alerte: "SUIVI_CLIENT_1AN".into(),
            message: "Suivi client".into(),
            date_alerte: Some(chrono::Utc::now().timestamp()),
        })
        .unwrap();
        assert_eq!(db.get_alertes_for_contact(contact_id).unwrap().len(), 1);

        db.create_investissement(NewInvestissement {
            contact_id: Some(contact_id),
            foyer_id: None,
            type_produit: "PER".into(),
            partenaire_id: None,
            nom_produit: "PER 2".into(),
            montant_initial: None,
            date_souscription: Some(newer_iso),
            date_fin_demembrement: None,
            date_fin_pret: None,
            versement_programme: None,
            montant_versement_programme: None,
            frequence_versement: None,
            reinvestissement_dividendes: None,
            notes: None,
            origine: Some("MON_CONSEIL".into()),
        })
        .unwrap();

        assert!(
            db.get_alertes_for_contact(contact_id).unwrap().is_empty(),
            "alerte suivi client doit être clôturée après remontée du dernier contact"
        );
    }

    #[test]
    fn update_contact_closes_obsolete_suivi_alerte_when_dernier_contact_recent() {
        let db = test_db();
        let old_ts = chrono::Utc::now().timestamp() - 400 * 24 * 3600;
        let old_iso = chrono::DateTime::from_timestamp(old_ts, 0).unwrap().to_rfc3339();
        let recent_iso = chrono::Utc::now().to_rfc3339();
        let contact = db
            .create_contact(NewContact {
                date_dernier_contact: Some(old_iso),
                ..sample_contact("Martin", "Paul")
            })
            .unwrap();
        let contact_id = contact.id.unwrap();

        db.create_alerte(crate::database::models::NewAlerte {
            contact_id,
            type_alerte: "SUIVI_CLIENT_1AN".into(),
            message: "Suivi client".into(),
            date_alerte: Some(chrono::Utc::now().timestamp()),
        })
        .unwrap();
        assert_eq!(db.get_alertes_for_contact(contact_id).unwrap().len(), 1);

        db.update_contact(
            contact_id,
            &NewContact {
                date_dernier_contact: Some(recent_iso),
                ..sample_contact("Martin", "Paul")
            },
        )
        .unwrap();

        assert!(
            db.get_alertes_for_contact(contact_id).unwrap().is_empty(),
            "alerte suivi client doit être clôturée après saisie d'un dernier contact récent"
        );
    }

    #[test]
    fn get_alertes_with_contacts_reads_integer_date_dernier_contact() {
        let db = test_db();
        let contact = db
            .create_contact(NewContact {
                date_dernier_contact: Some("2024-12-05T12:00:00+00:00".into()),
                ..sample_contact("NOM1", "Jean")
            })
            .unwrap();
        let contact_id = contact.id.unwrap();
        let stored_ts = contact
            .date_dernier_contact
            .expect("date_dernier_contact en base");

        db.get_connection()
            .execute(
                "INSERT INTO alertes (contact_id, type_alerte, message, date_alerte, lue, traitee)
                 VALUES (?1, 'SUIVI_CLIENT_1AN', 'Test alerte', ?2, 0, 0)",
                params![contact_id, stored_ts],
            )
            .unwrap();

        let alertes = db.get_alertes_with_contacts(Some(10)).unwrap();
        assert_eq!(alertes.len(), 1);
        assert_eq!(alertes[0].contact_id, contact_id);
        assert_eq!(alertes[0].date_dernier_contact, Some(stored_ts));
    }

    #[test]
    fn demembrement_alert_when_investissement_has_foyer_only() {
        let db = test_db();
        let foyer = db
            .create_foyer(NewFoyer {
                nom: "Foyer TEST".into(),
                type_foyer: "COUPLE".into(),
                nombre_parts_fiscales: None,
                tranche_imposition: None,
                revenu_fiscal_reference: None,
                situation_patrimoniale: None,
                objectifs_patrimoniaux: None,
                notes: None,
            })
            .unwrap();

        let c1 = db
            .create_contact(NewContact {
                foyer_id: Some(foyer.id),
                role_foyer: Some("DECLARANT_1".into()),
                ..sample_contact("NOM1", "Jean")
            })
            .unwrap();
        db.create_contact(NewContact {
            foyer_id: Some(foyer.id),
            role_foyer: Some("DECLARANT_2".into()),
            ..sample_contact("NOM1", "Veronique")
        })
        .unwrap();

        let now = chrono::Utc::now().timestamp();
        let in_90_days = now + 90 * 24 * 3600;
        let iso = chrono::DateTime::from_timestamp(in_90_days, 0)
            .unwrap()
            .to_rfc3339();

        db.create_investissement(NewInvestissement {
            contact_id: None,
            foyer_id: Some(foyer.id),
            type_produit: "SCPI_DEMEMBREMENT".into(),
            partenaire_id: None,
            nom_produit: "Comete".into(),
            montant_initial: Some(2_000_000),
            date_souscription: None,
            date_fin_demembrement: Some(iso),
            date_fin_pret: None,
            versement_programme: None,
            montant_versement_programme: None,
            frequence_versement: None,
            reinvestissement_dividendes: None,
            notes: None,
            origine: Some("MON_CONSEIL".into()),
        })
        .unwrap();

        let created = db.check_and_create_demembrement_alerts().unwrap();
        assert_eq!(created.len(), 1);
        assert_eq!(created[0].contact_id, c1.id.unwrap());
        assert_eq!(created[0].type_alerte, "FIN_DEMEMBREMENT");
    }

    #[test]
    fn cleanup_orphaned_foyers_removes_foyer_without_members() {
        let db = test_db();
        let foyer = db
            .create_foyer(NewFoyer {
                nom: "Foyer ORPHELIN".into(),
                type_foyer: "COUPLE".into(),
                nombre_parts_fiscales: None,
                tranche_imposition: None,
                revenu_fiscal_reference: None,
                situation_patrimoniale: None,
                objectifs_patrimoniaux: None,
                notes: None,
            })
            .unwrap();

        let deleted = db.cleanup_orphaned_foyers().unwrap();
        assert!(deleted >= 1);

        let count: i64 = db
            .get_connection()
            .query_row(
                "SELECT COUNT(*) FROM foyers WHERE id = ?1",
                params![foyer.id],
                |r| r.get(0),
            )
            .unwrap();
        assert_eq!(count, 0);
    }

    #[test]
    fn update_contact_persists_foyer_id_and_role() {
        let db = test_db();
        let foyer = db
            .create_foyer(NewFoyer {
                nom: "Foyer PERSIST".into(),
                type_foyer: "COUPLE".into(),
                nombre_parts_fiscales: None,
                tranche_imposition: None,
                revenu_fiscal_reference: None,
                situation_patrimoniale: None,
                objectifs_patrimoniaux: None,
                notes: None,
            })
            .unwrap();

        let created = db
            .create_contact(NewContact {
                foyer_id: Some(foyer.id),
                role_foyer: Some("DECLARANT_1".into()),
                ..sample_contact("NOM2", "Jean")
            })
            .unwrap();
        let id = created.id.unwrap();

        let updated = db
            .update_contact(
                id,
                &NewContact {
                    foyer_id: Some(foyer.id),
                    role_foyer: Some("DECLARANT_2".into()),
                    email: Some("jean@example.com".into()),
                    ..sample_contact("NOM2", "Jean")
                },
            )
            .unwrap();

        assert_eq!(updated.foyer_id, Some(foyer.id));
        assert_eq!(updated.role_foyer.as_deref(), Some("DECLARANT_2"));
        assert_eq!(updated.email.as_deref(), Some("jean@example.com"));

        let reloaded = db.get_contact_by_id(id).unwrap();
        assert_eq!(reloaded.foyer_id, Some(foyer.id));
        assert_eq!(reloaded.role_foyer.as_deref(), Some("DECLARANT_2"));
    }

    #[test]
    fn investissements_by_contact_and_by_foyer() {
        let db = test_db();
        let foyer = db
            .create_foyer(NewFoyer {
                nom: "Foyer INV".into(),
                type_foyer: "COUPLE".into(),
                nombre_parts_fiscales: None,
                tranche_imposition: None,
                revenu_fiscal_reference: None,
                situation_patrimoniale: None,
                objectifs_patrimoniaux: None,
                notes: None,
            })
            .unwrap();

        let contact = db
            .create_contact(NewContact {
                foyer_id: Some(foyer.id),
                ..sample_contact("NOM3", "Paul")
            })
            .unwrap();
        let cid = contact.id.unwrap();

        db.create_investissement(NewInvestissement {
            contact_id: Some(cid),
            foyer_id: None,
            type_produit: "SCPI".into(),
            partenaire_id: None,
            nom_produit: "Perso".into(),
            montant_initial: Some(10_000),
            date_souscription: None,
            date_fin_demembrement: None,
            date_fin_pret: None,
            versement_programme: None,
            montant_versement_programme: None,
            frequence_versement: None,
            reinvestissement_dividendes: None,
            notes: None,
            origine: Some("MON_CONSEIL".into()),
        })
        .unwrap();

        db.create_investissement(NewInvestissement {
            contact_id: None,
            foyer_id: Some(foyer.id),
            type_produit: "ASSURANCE_VIE".into(),
            partenaire_id: None,
            nom_produit: "Commun".into(),
            montant_initial: Some(20_000),
            date_souscription: None,
            date_fin_demembrement: None,
            date_fin_pret: None,
            versement_programme: None,
            montant_versement_programme: None,
            frequence_versement: None,
            reinvestissement_dividendes: None,
            notes: None,
            origine: Some("MON_CONSEIL".into()),
        })
        .unwrap();

        let by_contact = db.get_investissements_by_contact(cid).unwrap();
        assert_eq!(by_contact.len(), 1);
        assert_eq!(by_contact[0].nom_produit, "Perso");

        let by_foyer = db.get_investissements_by_foyer(foyer.id).unwrap();
        assert_eq!(by_foyer.len(), 1);
        assert_eq!(by_foyer[0].nom_produit, "Commun");
    }

    #[test]
    fn delete_contact_clears_foyer_id_on_contact() {
        let db = test_db();
        let foyer = db
            .create_foyer(NewFoyer {
                nom: "Foyer DEL".into(),
                type_foyer: "COUPLE".into(),
                nombre_parts_fiscales: None,
                tranche_imposition: None,
                revenu_fiscal_reference: None,
                situation_patrimoniale: None,
                objectifs_patrimoniaux: None,
                notes: None,
            })
            .unwrap();

        let c = db
            .create_contact(NewContact {
                foyer_id: Some(foyer.id),
                ..sample_contact("X", "Y")
            })
            .unwrap();
        let id = c.id.unwrap();
        db.delete_contact(id).unwrap();

        let remaining: i64 = db
            .get_connection()
            .query_row(
                "SELECT COUNT(*) FROM contacts WHERE foyer_id = ?1",
                params![foyer.id],
                |r| r.get(0),
            )
            .unwrap();
        assert_eq!(remaining, 0);
    }

    #[test]
    fn cancel_pending_email_campaign_removes_from_ready_queue() {
        use crate::database::models::{NewEtiquette, NewTemplateEmail};

        let db = test_db();
        let now = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_secs() as i64;

        let tpl = db
            .create_template_email(NewTemplateEmail {
                nom: "Tpl cancel".into(),
                sujet: "Bonjour".into(),
                corps: "Corps".into(),
                categorie: "INFO".into(),
                variables: None,
                agenda_link_id: None,
                relance_template_id: None,
                tutoiement_template_id: None,
            })
            .unwrap();

        let etiqu = db
            .create_etiquette(NewEtiquette {
                nom: "Campagne cancel".into(),
                couleur: None,
                icone: None,
                description: None,
                priorite: Some(0),
                auto_condition_type: None,
                auto_condition_config: None,
                auto_categories: None,
                email_template_id: Some(tpl.id),
                email_delai_jours: Some(0),
                email_envoi_prevu: Some(now - 120),
                email_envoi_heure: None,
                email_envoi_jours_semaine: None,
                email_actif: Some(true),
                is_default: Some(false),
                actif: None,
                segment_id: None,
            })
            .unwrap();

        let contact = db
            .create_contact(NewContact {
                email: Some("cancel@example.com".into()),
                ..sample_contact("Durand", "Paul")
            })
            .unwrap();
        let cid = contact.id.unwrap();

        db.attribuer_etiquette(cid, etiqu.id, Some("MANUEL".into()), None)
            .unwrap();

        let ready = db.get_etiquette_email_queue("ready").unwrap();
        assert_eq!(ready.len(), 1);
        let row_id = ready[0].contact_etiquette_id;

        db.cancel_pending_email_campaign(row_id).unwrap();
        assert!(db.get_etiquette_email_queue("ready").unwrap().is_empty());

        db.sync_pending_email_dates_for_etiquette(etiqu.id).unwrap();
        assert!(
            db.get_etiquette_email_queue("ready").unwrap().is_empty(),
            "un envoi annulé ne doit pas revenir après recalcul des dates"
        );
    }

    #[test]
    fn delete_template_email_clears_relance_link_on_parent() {
        use crate::database::models::NewTemplateEmail;

        let db = test_db();
        let relance = db
            .create_template_email(NewTemplateEmail {
                nom: "Relance — test orphan".into(),
                sujet: "Suite".into(),
                corps: "Corps".into(),
                categorie: "RELANCE".into(),
                variables: None,
                agenda_link_id: None,
                relance_template_id: None,
                tutoiement_template_id: None,
            })
            .unwrap();
        let parent = db
            .create_template_email(NewTemplateEmail {
                nom: "Parent test".into(),
                sujet: "Bonjour".into(),
                corps: "Corps".into(),
                categorie: "RELANCE".into(),
                variables: None,
                agenda_link_id: None,
                relance_template_id: Some(relance.id),
                tutoiement_template_id: None,
            })
            .unwrap();

        db.delete_template_email(relance.id).unwrap();

        let updated = db.get_template_email_by_id(parent.id).unwrap();
        assert!(updated.relance_template_id.is_none());
        assert!(db.get_template_email_by_id(relance.id).is_err());
    }

    #[test]
    fn etiquette_email_queue_ready_incomplete_sent() {
        use crate::database::models::{NewEtiquette, NewTemplateEmail};

        fn sample_etiquette(
            nom: &str,
            template_id: Option<i64>,
            envoi_prevu: Option<i64>,
            envoi_heure: Option<&str>,
        ) -> NewEtiquette {
            NewEtiquette {
                nom: nom.into(),
                couleur: None,
                icone: None,
                description: None,
                priorite: Some(0),
                auto_condition_type: None,
                auto_condition_config: None,
                auto_categories: None,
                email_template_id: template_id,
                email_delai_jours: Some(0),
                email_envoi_prevu: envoi_prevu,
                email_envoi_heure: envoi_heure.map(|s| s.to_string()),
                email_envoi_jours_semaine: None,
                email_actif: Some(true),
                is_default: Some(false),
                actif: None,
                segment_id: None,
            }
        }

        let db = test_db();
        let now = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_secs() as i64;

        let tpl = db
            .create_template_email(NewTemplateEmail {
                nom: "Tpl test".into(),
                sujet: "Bonjour {{prenom}}".into(),
                corps: "Corps".into(),
                categorie: "INFO".into(),
                variables: None,
                agenda_link_id: None,
                relance_template_id: None,
                tutoiement_template_id: None,
            })
            .unwrap();
        let relance_tpl = db
            .create_template_email(NewTemplateEmail {
                nom: "Relance tpl test".into(),
                sujet: "RELANCER {{prenom}}".into(),
                corps: "Suite sans reponse".into(),
                categorie: "RELANCE".into(),
                variables: None,
                agenda_link_id: None,
                relance_template_id: None,
                tutoiement_template_id: None,
            })
            .unwrap();
        db.update_template_email(
            tpl.id,
            &NewTemplateEmail {
                nom: tpl.nom.clone(),
                sujet: tpl.sujet.clone(),
                corps: tpl.corps.clone(),
                categorie: tpl.categorie.clone(),
                variables: tpl.variables.clone(),
                agenda_link_id: tpl.agenda_link_id.clone(),
                relance_template_id: Some(relance_tpl.id),
                tutoiement_template_id: None,
            },
        )
        .unwrap();

        let etiqu = db
            .create_etiquette(sample_etiquette(
                "Campagne test",
                Some(tpl.id),
                Some(now + 86_400),
                None,
            ))
            .unwrap();

        let contact = db
            .create_contact(NewContact {
                email: Some("client@example.com".into()),
                telephone: Some("0601020304".into()),
                ..sample_contact("Martin", "Alice")
            })
            .unwrap();
        let cid = contact.id.unwrap();

        db.attribuer_etiquette(cid, etiqu.id, Some("MANUEL".into()), None)
            .unwrap();

        assert!(db.get_etiquette_email_queue("ready").unwrap().is_empty());
        let scheduled = db.get_etiquette_email_queue("scheduled").unwrap();
        assert_eq!(scheduled.len(), 1);
        assert_eq!(scheduled[0].queue_issue.as_deref(), Some("SCHEDULED"));
        assert!(db.get_etiquette_email_queue("incomplete").unwrap().is_empty());

        db.update_etiquette(
            etiqu.id,
            &sample_etiquette("Campagne test", Some(tpl.id), Some(now - 120), None),
        )
        .unwrap();

        let ready = db.get_etiquette_email_queue("ready").unwrap();
        assert_eq!(ready.len(), 1);
        assert_eq!(ready[0].contact_telephone.as_deref(), Some("0601020304"));

        let ce_id = ready[0].contact_etiquette_id;
        db.mark_etiquette_email_sent(ce_id, None, None, Some("Objet test"), Some("Corps test"))
            .unwrap();
        assert!(db.get_etiquette_email_queue("ready").unwrap().is_empty());
        assert_eq!(db.get_etiquette_email_queue("sent").unwrap().len(), 1);
        assert!(
            db.get_etiquette_email_queue("followup").unwrap().is_empty(),
            "envoi récent : pas encore en relance"
        );
        let timeline_after_send = db.get_exchange_history_timeline().unwrap();
        let sent_row = timeline_after_send
            .iter()
            .find(|e| e.entry_kind == "email_campagne" && e.contact_id == cid)
            .expect("fil après envoi");
        assert_eq!(sent_row.sent_body.as_deref(), Some("Corps test"));
        assert_eq!(sent_row.sent_subject.as_deref(), Some("Objet test"));

        db.prepare_email_campaign_relance(ce_id).unwrap();
        let timeline_after_relance_prep = db.get_exchange_history_timeline().unwrap();
        assert!(
            timeline_after_relance_prep
                .iter()
                .any(|e| e.contact_id == cid && e.entry_kind == "email_campagne"),
            "1er envoi visible après préparation relance (sans réponse)"
        );
        let ready_relance = db.get_etiquette_email_queue("ready").unwrap();
        assert_eq!(ready_relance.len(), 1);
        assert!(ready_relance[0].email_is_relance);
        assert!(ready_relance[0].template_sujet.contains("RELANCER"));

        assert_eq!(db.get_interactions_by_contact(cid).unwrap().len(), 0);
        assert!(db
            .mark_etiquette_email_sent(999_999, None, None, None, None)
            .is_err());

        db.mark_etiquette_email_sent(ce_id, None, None, Some("Objet relance"), None)
            .unwrap();
        let after_relance = db.get_interactions_by_contact(cid).unwrap();
        assert_eq!(after_relance.len(), 1);
        assert!(
            after_relance.iter().any(|i| {
                i.contenu
                    .as_deref()
                    .is_some_and(|c| c.contains("relance email (2e envoi)"))
            })
        );
        db.mark_etiquette_email_sent(ce_id, None, None, Some("Objet relance"), None)
            .unwrap();
        assert_eq!(db.get_interactions_by_contact(cid).unwrap().len(), 1);

        db.create_alerte(crate::database::models::NewAlerte {
            contact_id: cid,
            type_alerte: "SUIVI_CLIENT_1AN".into(),
            message: "Test alerte".into(),
            date_alerte: Some(now),
        })
        .unwrap();
        assert_eq!(db.get_alertes_for_contact(cid).unwrap().len(), 1);

        let date_before_mail = db.get_contact_by_id(cid).unwrap().date_dernier_contact;
        db.mark_email_campaign_response(ce_id, "mail", None, None, None)
            .unwrap();
        assert!(
            db.get_etiquette_email_queue("sent").unwrap().is_empty(),
            "réponse client : plus en attente dans sent"
        );
        assert!(
            db.get_etiquette_email_queue("followup").unwrap().is_empty(),
            "réponse client : plus en relance"
        );
        assert_eq!(db.get_interactions_by_contact(cid).unwrap().len(), 1);
        assert_eq!(
            db.get_contact_by_id(cid).unwrap().date_dernier_contact,
            date_before_mail,
            "réponse mail ne doit pas mettre à jour le dernier contact"
        );
        assert_eq!(
            db.get_alertes_for_contact(cid).unwrap().len(),
            1,
            "réponse mail ne clôture pas les alertes suivi client"
        );

        db.mark_email_campaign_response(ce_id, "mail", None, None, None)
            .unwrap();
        assert_eq!(db.get_interactions_by_contact(cid).unwrap().len(), 1);

        let contact_rdv = db
            .create_contact(NewContact {
                email: Some("rdv@example.com".into()),
                ..sample_contact("Durand", "Paul")
            })
            .unwrap();
        let cid_rdv = contact_rdv.id.unwrap();
        db.attribuer_etiquette(cid_rdv, etiqu.id, Some("MANUEL".into()), None)
            .unwrap();
        db.update_etiquette(
            etiqu.id,
            &sample_etiquette("Campagne test", Some(tpl.id), Some(now - 60), None),
        )
        .unwrap();
        let ce_rdv = db
            .get_etiquette_email_queue("ready")
            .unwrap()
            .into_iter()
            .find(|q| q.contact_id == cid_rdv)
            .expect("file prête pour contact RDV")
            .contact_etiquette_id;
        db.mark_etiquette_email_sent(ce_rdv, None, None, Some("Objet RDV"), None)
            .unwrap();
        db.create_alerte(crate::database::models::NewAlerte {
            contact_id: cid_rdv,
            type_alerte: "SUIVI_CLIENT_1AN".into(),
            message: "Test alerte RDV".into(),
            date_alerte: Some(now),
        })
        .unwrap();
        assert!(db.get_contact_by_id(cid_rdv).unwrap().date_dernier_contact.is_none());
        db.mark_email_campaign_response(ce_rdv, "rdv", None, None, None)
            .unwrap();
        assert!(
            db.get_contact_by_id(cid_rdv)
                .unwrap()
                .date_dernier_contact
                .is_some(),
            "RDV enregistré met à jour le dernier contact"
        );
        assert!(db.get_alertes_for_contact(cid_rdv).unwrap().is_empty());

        let timeline = db.get_exchange_history_timeline().unwrap();
        let bruno_email = timeline
            .iter()
            .find(|e| e.entry_kind == "email_campagne" && e.contact_id == cid)
            .expect("fil email campagne");
        assert_eq!(bruno_email.email_reponse_type.as_deref(), Some("mail"));

        let no_email = db
            .create_contact(NewContact {
                email: None,
                ..sample_contact("Sans", "Mail")
            })
            .unwrap();
        db.attribuer_etiquette(no_email.id.unwrap(), etiqu.id, Some("MANUEL".into()), None)
            .unwrap();
        let incomplete = db.get_etiquette_email_queue("incomplete").unwrap();
        assert!(
            incomplete
                .iter()
                .any(|i| i.queue_issue.as_deref() == Some("NO_EMAIL"))
        );
    }

    #[test]
    fn etiquette_email_queue_registre_tu_main_and_relance() {
        use crate::database::models::{NewEtiquette, NewTemplateEmail};

        fn sample_etiquette(nom: &str, template_id: i64, envoi_prevu: i64) -> NewEtiquette {
            NewEtiquette {
                nom: nom.into(),
                couleur: None,
                icone: None,
                description: None,
                priorite: Some(0),
                auto_condition_type: None,
                auto_condition_config: None,
                auto_categories: None,
                email_template_id: Some(template_id),
                email_delai_jours: Some(0),
                email_envoi_prevu: Some(envoi_prevu),
                email_envoi_heure: None,
                email_envoi_jours_semaine: None,
                email_actif: Some(true),
                is_default: Some(false),
                actif: None,
                segment_id: None,
            }
        }

        let db = test_db();
        let now = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_secs() as i64;

        let main_vous = db
            .create_template_email(NewTemplateEmail {
                nom: "Campagne registre".into(),
                sujet: "SUJET_VOUS_MAIN".into(),
                corps: "CORPS_VOUS_MAIN".into(),
                categorie: "INFO".into(),
                variables: None,
                agenda_link_id: None,
                relance_template_id: None,
                tutoiement_template_id: None,
            })
            .unwrap();
        let main_tu = db
            .create_template_email(NewTemplateEmail {
                nom: "Campagne registre (tu)".into(),
                sujet: "SUJET_TU_MAIN".into(),
                corps: "CORPS_TU_MAIN".into(),
                categorie: "INFO".into(),
                variables: None,
                agenda_link_id: None,
                relance_template_id: None,
                tutoiement_template_id: None,
            })
            .unwrap();
        let rel_vous = db
            .create_template_email(NewTemplateEmail {
                nom: "Relance — Campagne registre".into(),
                sujet: "SUJET_VOUS_REL".into(),
                corps: "CORPS_VOUS_REL".into(),
                categorie: "RELANCE".into(),
                variables: None,
                agenda_link_id: None,
                relance_template_id: None,
                tutoiement_template_id: None,
            })
            .unwrap();
        let rel_tu = db
            .create_template_email(NewTemplateEmail {
                nom: "Relance — Campagne registre (tu)".into(),
                sujet: "SUJET_TU_REL".into(),
                corps: "CORPS_TU_REL".into(),
                categorie: "RELANCE".into(),
                variables: None,
                agenda_link_id: None,
                relance_template_id: None,
                tutoiement_template_id: None,
            })
            .unwrap();

        db.update_template_email(
            rel_vous.id,
            &NewTemplateEmail {
                nom: rel_vous.nom.clone(),
                sujet: rel_vous.sujet.clone(),
                corps: rel_vous.corps.clone(),
                categorie: rel_vous.categorie.clone(),
                variables: rel_vous.variables.clone(),
                agenda_link_id: rel_vous.agenda_link_id.clone(),
                relance_template_id: None,
                tutoiement_template_id: Some(rel_tu.id),
            },
        )
        .unwrap();
        db.update_template_email(
            main_vous.id,
            &NewTemplateEmail {
                nom: main_vous.nom.clone(),
                sujet: main_vous.sujet.clone(),
                corps: main_vous.corps.clone(),
                categorie: main_vous.categorie.clone(),
                variables: main_vous.variables.clone(),
                agenda_link_id: main_vous.agenda_link_id.clone(),
                relance_template_id: Some(rel_vous.id),
                tutoiement_template_id: Some(main_tu.id),
            },
        )
        .unwrap();

        let etiqu = db
            .create_etiquette(sample_etiquette(
                "Campagne registre tu",
                main_vous.id,
                now - 60,
            ))
            .unwrap();

        let mut contact_tu = sample_contact("Tuto", "Client");
        contact_tu.registre = Some("TU".into());
        contact_tu.email = Some("tu@example.com".into());
        let cid_tu = db.create_contact(contact_tu).unwrap().id.unwrap();
        db.attribuer_etiquette(cid_tu, etiqu.id, Some("MANUEL".into()), None)
            .unwrap();

        let ready_tu = db.get_etiquette_email_queue("ready").unwrap();
        let row_tu = ready_tu
            .iter()
            .find(|q| q.contact_id == cid_tu)
            .expect("file prête contact TU");
        assert_eq!(row_tu.template_sujet, "SUJET_TU_MAIN");
        assert_eq!(row_tu.template_corps, "CORPS_TU_MAIN");
        assert_eq!(row_tu.contact_registre.as_deref(), Some("TU"));

        let ce_tu = row_tu.contact_etiquette_id;
        db.mark_etiquette_email_sent(ce_tu, None, None, Some("Envoi 1"), None)
            .unwrap();

        let mut contact_vous = sample_contact("Vouvoi", "Client");
        contact_vous.registre = Some("VOUS".into());
        contact_vous.email = Some("vous@example.com".into());
        let cid_vous = db.create_contact(contact_vous).unwrap().id.unwrap();
        db.attribuer_etiquette(cid_vous, etiqu.id, Some("MANUEL".into()), None)
            .unwrap();
        let row_vous = db
            .get_etiquette_email_queue("ready")
            .unwrap()
            .into_iter()
            .find(|q| q.contact_id == cid_vous)
            .expect("file prête contact VOUS");
        assert_eq!(row_vous.template_sujet, "SUJET_VOUS_MAIN");
        assert_eq!(row_vous.template_corps, "CORPS_VOUS_MAIN");

        db.prepare_email_campaign_relance(ce_tu).unwrap();
        let relance_row = db
            .get_etiquette_email_queue("ready")
            .unwrap()
            .into_iter()
            .find(|q| q.contact_etiquette_id == ce_tu)
            .expect("relance prête pour contact TU");
        assert!(relance_row.email_is_relance);
        assert_eq!(relance_row.template_sujet, "SUJET_TU_REL");
        assert_eq!(relance_row.template_corps, "CORPS_TU_REL");
    }

    #[test]
    fn etiquette_email_queue_sent_excludes_after_response_and_followup_after_delay() {
        use crate::database::models::{NewEtiquette, NewTemplateEmail};

        let db = test_db();
        let now = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_secs() as i64;

        let tpl = db
            .create_template_email(NewTemplateEmail {
                nom: "Tpl attente".into(),
                sujet: "Bonjour".into(),
                corps: "Corps".into(),
                categorie: "INFO".into(),
                variables: None,
                agenda_link_id: None,
                relance_template_id: None,
                tutoiement_template_id: None,
            })
            .unwrap();

        let etiqu = db
            .create_etiquette(NewEtiquette {
                nom: "Campagne attente".into(),
                couleur: None,
                icone: None,
                description: None,
                priorite: Some(0),
                auto_condition_type: None,
                auto_condition_config: None,
                auto_categories: None,
                email_template_id: Some(tpl.id),
                email_delai_jours: Some(0),
                email_envoi_prevu: Some(now - 60),
                email_envoi_heure: None,
                email_envoi_jours_semaine: None,
                email_actif: Some(true),
                is_default: Some(false),
                actif: None,
            segment_id: None,
            })
            .unwrap();

        let contact = db
            .create_contact(NewContact {
                email: Some("attente@example.com".into()),
                ..sample_contact("Attente", "Bob")
            })
            .unwrap();
        let cid = contact.id.unwrap();
        db.attribuer_etiquette(cid, etiqu.id, Some("MANUEL".into()), None)
            .unwrap();

        let ce_id = db
            .get_etiquette_email_queue("ready")
            .unwrap()
            .into_iter()
            .find(|q| q.contact_id == cid)
            .expect("file prête")
            .contact_etiquette_id;

        db.mark_etiquette_email_sent(ce_id, None, None, Some("Objet"), None)
            .unwrap();

        assert_eq!(db.get_etiquette_email_queue("sent").unwrap().len(), 1);
        assert!(db.get_etiquette_email_queue("followup").unwrap().is_empty());

        let old_send = now - 10 * 86_400;
        db.get_connection()
            .execute(
                "UPDATE contact_etiquettes SET email_date_envoi = ?1 WHERE id = ?2",
                params![old_send, ce_id],
            )
            .unwrap();

        assert!(
            db.get_etiquette_email_queue("sent").unwrap().is_empty(),
            "délai dépassé : plus en attente"
        );
        assert_eq!(
            db.get_etiquette_email_queue("followup").unwrap().len(),
            1,
            "délai dépassé : bascule en relance"
        );

        db.mark_email_campaign_response(ce_id, "mail", None, None, None)
            .unwrap();
        assert!(db.get_etiquette_email_queue("sent").unwrap().is_empty());
        assert!(db.get_etiquette_email_queue("followup").unwrap().is_empty());
    }

    #[test]
    fn auto_etiquette_matches_foyer_investissement() {
        use crate::database::models::{NewEtiquette, NewInvestissement};

        let db = test_db();
        let foyer = db
            .create_foyer(NewFoyer {
                nom: "Foyer TEST".into(),
                type_foyer: "COUPLE".into(),
                nombre_parts_fiscales: None,
                tranche_imposition: None,
                revenu_fiscal_reference: None,
                situation_patrimoniale: None,
                objectifs_patrimoniaux: None,
                notes: None,
            })
            .unwrap();

        let contact = db
            .create_contact(NewContact {
                foyer_id: Some(foyer.id),
                categorie: "CLIENT".into(),
                ..sample_contact("Lopez", "Marie")
            })
            .unwrap();
        let cid = contact.id.unwrap();

        db.create_investissement(NewInvestissement {
            contact_id: None,
            foyer_id: Some(foyer.id),
            type_produit: "SCPI".into(),
            partenaire_id: None,
            nom_produit: "Foyer only".into(),
            montant_initial: Some(50_000),
            date_souscription: None,
            date_fin_demembrement: None,
            date_fin_pret: None,
            versement_programme: None,
            montant_versement_programme: None,
            frequence_versement: None,
            reinvestissement_dividendes: None,
            notes: None,
            origine: Some("MON_CONSEIL".into()),
        })
        .unwrap();

        let etiqu = db
            .create_etiquette(NewEtiquette {
                nom: "A une SCPI".into(),
                couleur: None,
                icone: None,
                description: None,
                priorite: Some(10),
                auto_condition_type: Some("TYPE_PRODUIT".into()),
                auto_condition_config: Some(r#"{"types":["SCPI"]}"#.into()),
                auto_categories: Some(r#"["CLIENT"]"#.into()),
                email_template_id: None,
                email_delai_jours: Some(0),
                email_envoi_prevu: None,
                email_envoi_heure: None,
                email_envoi_jours_semaine: None,
                email_actif: Some(false),
                is_default: Some(false),
            actif: None,
            segment_id: None,
            })
            .unwrap();

        let assigned = db.check_and_apply_auto_etiquettes().unwrap();
        assert!(assigned >= 1);

        let count: i64 = db
            .conn
            .query_row(
                "SELECT COUNT(*) FROM contact_etiquettes WHERE contact_id = ?1 AND etiquette_id = ?2",
                params![cid, etiqu.id],
                |r| r.get(0),
            )
            .unwrap();
        assert_eq!(count, 1);
    }

    #[test]
    fn merge_duplicate_reduction_impot_etiquettes_collapses_aliases() {
        use crate::database::models::NewEtiquette;

        let db = test_db();
        let a = db
            .create_etiquette(NewEtiquette {
                nom: REDUCTION_IMPOT_ETIQUETTE_CANONICAL.into(),
                couleur: Some("#10B981".into()),
                icone: None,
                description: None,
                priorite: Some(60),
                auto_condition_type: Some("PERIODE_ANNEE".into()),
                auto_condition_config: Some(r#"{"mois_debut": 10, "mois_fin": 11}"#.into()),
                auto_categories: Some(r#"["CLIENT"]"#.into()),
                email_template_id: None,
                email_delai_jours: Some(0),
                email_envoi_prevu: None,
                email_envoi_heure: None,
                email_envoi_jours_semaine: None,
                email_actif: Some(false),
                is_default: Some(true),
                actif: None,
            segment_id: None,
            })
            .unwrap();
        db.create_etiquette(NewEtiquette {
            nom: "RDV fin d'année".into(),
            couleur: Some("#10B981".into()),
            icone: None,
            description: None,
            priorite: Some(50),
            auto_condition_type: Some("PERIODE_ANNEE".into()),
            auto_condition_config: Some(r#"{"mois_debut": 10, "mois_fin": 11}"#.into()),
            auto_categories: Some(r#"["CLIENT"]"#.into()),
            email_template_id: None,
            email_delai_jours: Some(0),
            email_envoi_prevu: None,
            email_envoi_heure: None,
            email_envoi_jours_semaine: None,
            email_actif: Some(false),
            is_default: Some(true),
                actif: None,
                segment_id: None,
            })
        .unwrap();

        let merged = db.merge_duplicate_reduction_impot_etiquettes().unwrap();
        assert_eq!(merged, 1);
        assert_eq!(db.count_etiquettes().unwrap(), 1);

        let nom: String = db
            .conn
            .query_row(
                "SELECT nom FROM etiquettes WHERE id = ?1",
                params![a.id],
                |r| r.get(0),
            )
            .unwrap();
        assert_eq!(nom, REDUCTION_IMPOT_ETIQUETTE_CANONICAL);
    }

    #[test]
    fn ensure_default_etiquettes_preserves_custom_config() {
        let db = test_db();
        db.ensure_default_etiquettes().unwrap();

        let custom_config = r#"{"jours": 400}"#;
        db.conn
            .execute(
                "UPDATE etiquettes SET auto_condition_config = ?1 WHERE nom = ?2",
                params![custom_config, "Suivi > 1 an"],
            )
            .unwrap();

        db.ensure_default_etiquettes().unwrap();

        let config: String = db
            .conn
            .query_row(
                "SELECT auto_condition_config FROM etiquettes WHERE nom = ?1",
                params!["Suivi > 1 an"],
                |r| r.get(0),
            )
            .unwrap();
        assert_eq!(config, custom_config);
    }

    #[test]
    fn delai_sans_contact_inclure_sans_date_false_skips_contact_without_date() {
        use crate::database::models::NewEtiquette;

        let db = test_db();
        let contact = db
            .create_contact(NewContact {
                date_dernier_contact: None,
                ..sample_contact("SansDate", "Paul")
            })
            .unwrap();
        let cid = contact.id.unwrap();

        let etiqu = db
            .create_etiquette(NewEtiquette {
                nom: "Delai strict".into(),
                couleur: None,
                icone: None,
                description: None,
                priorite: Some(0),
                auto_condition_type: Some("DELAI_SANS_CONTACT".into()),
                auto_condition_config: Some(
                    r#"{"jours": 30, "inclure_sans_date": false}"#.into(),
                ),
                auto_categories: Some(r#"["CLIENT"]"#.into()),
                email_template_id: None,
                email_delai_jours: Some(0),
                email_envoi_prevu: None,
                email_envoi_heure: None,
                email_envoi_jours_semaine: None,
                email_actif: Some(false),
                is_default: Some(false),
            actif: None,
            segment_id: None,
            })
            .unwrap();

        db.check_auto_etiquettes_for_contact(cid).unwrap();

        let count: i64 = db
            .conn
            .query_row(
                "SELECT COUNT(*) FROM contact_etiquettes WHERE contact_id = ?1 AND etiquette_id = ?2",
                params![cid, etiqu.id],
                |r| r.get(0),
            )
            .unwrap();
        assert_eq!(count, 0);

        db.conn
            .execute(
                "UPDATE etiquettes SET auto_condition_config = ?1 WHERE id = ?2",
                params![r#"{"jours": 30, "inclure_sans_date": true}"#, etiqu.id],
            )
            .unwrap();

        db.check_auto_etiquettes_for_contact(cid).unwrap();
        let count_after: i64 = db
            .conn
            .query_row(
                "SELECT COUNT(*) FROM contact_etiquettes WHERE contact_id = ?1 AND etiquette_id = ?2",
                params![cid, etiqu.id],
                |r| r.get(0),
            )
            .unwrap();
        assert_eq!(count_after, 1);
    }

    #[test]
    fn create_etiquette_rejects_duplicate_nom() {
        use crate::database::models::NewEtiquette;

        let db = test_db();
        let mk = || NewEtiquette {
            nom: "Doublon test".into(),
            couleur: None,
            icone: None,
            description: None,
            priorite: Some(0),
            auto_condition_type: None,
            auto_condition_config: None,
            auto_categories: None,
            email_template_id: None,
            email_delai_jours: Some(0),
            email_envoi_prevu: None,
            email_envoi_heure: None,
            email_envoi_jours_semaine: None,
            email_actif: Some(false),
            is_default: Some(false),
            actif: None,
            segment_id: None,
        };
        db.create_etiquette(mk()).unwrap();
        let err = db.create_etiquette(mk()).unwrap_err();
        assert!(
            err.to_string().contains("existe déjà"),
            "unexpected: {}",
            err
        );
    }

    #[test]
    fn deactivate_etiquette_removes_auto_assignments() {
        use crate::database::models::NewEtiquette;

        let db = test_db();
        let contact = db.create_contact(sample_contact("Actif", "Test")).unwrap();
        let cid = contact.id.unwrap();

        let etiqu = db
            .create_etiquette(NewEtiquette {
                nom: "Temp auto".into(),
                couleur: None,
                icone: None,
                description: None,
                priorite: Some(0),
                auto_condition_type: Some("DELAI_SANS_CONTACT".into()),
                auto_condition_config: Some(r#"{"jours": 0, "inclure_sans_date": true}"#.into()),
                auto_categories: Some(r#"["CLIENT"]"#.into()),
                email_template_id: None,
                email_delai_jours: Some(0),
                email_envoi_prevu: None,
                email_envoi_heure: None,
                email_envoi_jours_semaine: None,
                email_actif: Some(false),
                is_default: Some(false),
                actif: Some(true),
                segment_id: None,
            })
            .unwrap();

        db.attribuer_etiquette(cid, etiqu.id, Some("AUTO".into()), None)
            .unwrap();

        db.update_etiquette(
            etiqu.id,
            &NewEtiquette {
                nom: etiqu.nom.clone(),
                couleur: Some(etiqu.couleur.clone()),
                icone: etiqu.icone.clone(),
                description: etiqu.description.clone(),
                priorite: Some(etiqu.priorite),
                auto_condition_type: etiqu.auto_condition_type.clone(),
                auto_condition_config: etiqu.auto_condition_config.clone(),
                auto_categories: etiqu.auto_categories.clone(),
                email_template_id: etiqu.email_template_id,
                email_delai_jours: Some(etiqu.email_delai_jours),
                email_envoi_prevu: etiqu.email_envoi_prevu,
                email_envoi_heure: etiqu.email_envoi_heure.clone(),
                email_envoi_jours_semaine: etiqu.email_envoi_jours_semaine.clone(),
                email_actif: Some(etiqu.email_actif),
                is_default: Some(etiqu.is_default),
                actif: Some(false),
                segment_id: None,
            },
        )
        .unwrap();

        let count: i64 = db
            .conn
            .query_row(
                "SELECT COUNT(*) FROM contact_etiquettes WHERE contact_id = ?1 AND etiquette_id = ?2",
                params![cid, etiqu.id],
                |r| r.get(0),
            )
            .unwrap();
        assert_eq!(count, 0);

        let actif_db: i64 = db
            .conn
            .query_row(
                "SELECT actif FROM etiquettes WHERE id = ?1",
                params![etiqu.id],
                |r| r.get(0),
            )
            .unwrap();
        assert_eq!(actif_db, 0);
    }

    #[test]
    fn delete_default_etiquette_is_blocked() {
        let db = test_db();
        db.ensure_default_etiquettes().unwrap();
        let id: i64 = db
            .conn
            .query_row(
                "SELECT id FROM etiquettes WHERE nom = ?1",
                params!["Suivi > 1 an"],
                |r| r.get(0),
            )
            .unwrap();
        let err = db.delete_etiquette(id).unwrap_err();
        assert!(err.to_string().contains("défaut"));
    }

    #[test]
    fn create_etiquette_rejects_auto_rule_without_categories() {
        use crate::database::models::NewEtiquette;

        let db = test_db();
        let err = db
            .create_etiquette(NewEtiquette {
                nom: "Auto sans cat".into(),
                couleur: None,
                icone: None,
                description: None,
                priorite: Some(0),
                auto_condition_type: Some("DELAI_SANS_CONTACT".into()),
                auto_condition_config: Some(r#"{"jours": 90}"#.into()),
                auto_categories: Some("[]".into()),
                email_template_id: None,
                email_delai_jours: Some(0),
                email_envoi_prevu: None,
                email_envoi_heure: None,
                email_envoi_jours_semaine: None,
                email_actif: Some(false),
                is_default: Some(false),
            actif: None,
            segment_id: None,
            })
            .unwrap_err();
        assert!(
            err.to_string().contains("catégorie"),
            "unexpected: {}",
            err
        );
    }

    #[test]
    fn auto_etiquette_exclusion_blocks_reassignment_after_retirer() {
        use crate::database::models::NewEtiquette;

        let db = test_db();
        let contact = db.create_contact(sample_contact("Exclu", "Alice")).unwrap();
        let cid = contact.id.unwrap();

        let etiqu = db
            .create_etiquette(NewEtiquette {
                nom: "Auto exclu test".into(),
                couleur: None,
                icone: None,
                description: None,
                priorite: Some(0),
                auto_condition_type: Some("DELAI_SANS_CONTACT".into()),
                auto_condition_config: Some(r#"{"jours": 0, "inclure_sans_date": true}"#.into()),
                auto_categories: Some(r#"["CLIENT"]"#.into()),
                email_template_id: None,
                email_delai_jours: Some(0),
                email_envoi_prevu: None,
                email_envoi_heure: None,
                email_envoi_jours_semaine: None,
                email_actif: Some(false),
                is_default: Some(false),
                actif: Some(true),
                segment_id: None,
            })
            .unwrap();

        db.check_auto_etiquettes_for_contact(cid).unwrap();
        let count_before: i64 = db
            .conn
            .query_row(
                "SELECT COUNT(*) FROM contact_etiquettes WHERE contact_id = ?1 AND etiquette_id = ?2",
                params![cid, etiqu.id],
                |r| r.get(0),
            )
            .unwrap();
        assert_eq!(count_before, 1);

        db.retirer_etiquette(cid, etiqu.id, true).unwrap();

        let excluded: i64 = db
            .conn
            .query_row(
                "SELECT COUNT(*) FROM contact_etiquette_auto_exclusions WHERE contact_id = ?1 AND etiquette_id = ?2",
                params![cid, etiqu.id],
                |r| r.get(0),
            )
            .unwrap();
        assert_eq!(excluded, 1);

        db.check_auto_etiquettes_for_contact(cid).unwrap();
        let count_after: i64 = db
            .conn
            .query_row(
                "SELECT COUNT(*) FROM contact_etiquettes WHERE contact_id = ?1 AND etiquette_id = ?2",
                params![cid, etiqu.id],
                |r| r.get(0),
            )
            .unwrap();
        assert_eq!(count_after, 0);
    }

    #[test]
    fn auto_etiquette_removed_when_contact_category_no_longer_matches() {
        use crate::database::models::NewEtiquette;

        let db = test_db();
        let contact = db.create_contact(sample_contact("CatChange", "Bob")).unwrap();
        let cid = contact.id.unwrap();

        let etiqu = db
            .create_etiquette(NewEtiquette {
                nom: "Clients seulement".into(),
                couleur: None,
                icone: None,
                description: None,
                priorite: Some(0),
                auto_condition_type: Some("DELAI_SANS_CONTACT".into()),
                auto_condition_config: Some(r#"{"jours": 0, "inclure_sans_date": true}"#.into()),
                auto_categories: Some(r#"["CLIENT"]"#.into()),
                email_template_id: None,
                email_delai_jours: Some(0),
                email_envoi_prevu: None,
                email_envoi_heure: None,
                email_envoi_jours_semaine: None,
                email_actif: Some(false),
                is_default: Some(false),
                actif: Some(true),
                segment_id: None,
            })
            .unwrap();

        db.attribuer_etiquette(cid, etiqu.id, Some("AUTO".into()), None)
            .unwrap();

        db.update_contact(
            cid,
            &NewContact {
                categorie: "PROSPECT".into(),
                ..sample_contact("CatChange", "Bob")
            },
        )
        .unwrap();

        db.check_auto_etiquettes_for_contact(cid).unwrap();

        let count: i64 = db
            .conn
            .query_row(
                "SELECT COUNT(*) FROM contact_etiquettes WHERE contact_id = ?1 AND etiquette_id = ?2",
                params![cid, etiqu.id],
                |r| r.get(0),
            )
            .unwrap();
        assert_eq!(count, 0);
    }
}
