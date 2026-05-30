use super::{
    models::{
        Contact, ContactEtiquette, ContactEtiquetteDetails, Etiquette, EtiquetteEmailQueueItem,
        EtiquetteWithCount, Famille, NewContact, NewContactEtiquette, NewEtiquette, NewFamille,
    },
    Database,
};
use rusqlite::{params, Result};

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
        let mut stmt = self.conn.prepare(
            "SELECT id, famille_id, foyer_id, role_foyer, role_famille, categorie, filleul_categorie, parrain_id, prescripteur_id, civilite, nom, prenom, email, telephone,
                    adresse, code_postal, ville, date_naissance, profession, situation_familiale,
                    source_lead, profil_risque_sri, date_dernier_contact, date_prochain_suivi,
                    date_dernier_contact_filleul, date_prochain_suivi_filleul,
                    statut_suivi, notes, created_at, updated_at
             FROM contacts
             ORDER BY created_at DESC"
        )?;

        let contacts = stmt.query_map([], |row| {
            Ok(Contact {
                id: row.get(0)?,
                famille_id: row.get(1)?,
                foyer_id: row.get(2)?,
                role_foyer: row.get(3)?,
                role_famille: row.get(4)?,
                categorie: row.get(5)?,
                filleul_categorie: row.get(6)?,
                parrain_id: row.get(7)?,
                prescripteur_id: row.get(8)?,
                civilite: row.get(9)?,
                nom: row.get(10)?,
                prenom: row.get(11)?,
                email: row.get(12)?,
                telephone: row.get(13)?,
                adresse: row.get(14)?,
                code_postal: row.get(15)?,
                ville: row.get(16)?,
                date_naissance: row.get(17)?,
                profession: row.get(18)?,
                situation_familiale: row.get(19)?,
                source_lead: row.get(20)?,
                profil_risque_sri: row.get(21)?,
                date_dernier_contact: row.get(22)?,
                date_prochain_suivi: row.get(23)?,
                date_dernier_contact_filleul: row.get(24)?,
                date_prochain_suivi_filleul: row.get(25)?,
                statut_suivi: row.get(26)?,
                notes: row.get(27)?,
                created_at: row.get(28)?,
                updated_at: row.get(29)?,
            })
        })?;

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

        self.conn.execute(
            "INSERT INTO contacts (
                famille_id, foyer_id, role_foyer, role_famille, categorie, filleul_categorie, parrain_id, prescripteur_id, civilite, nom, prenom, email, telephone,
                adresse, code_postal, ville, date_naissance, profession, situation_familiale,
                source_lead, profil_risque_sri, date_dernier_contact, date_prochain_suivi,
                date_dernier_contact_filleul, date_prochain_suivi_filleul,
                statut_suivi, notes
            ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, ?17, ?18, ?19, ?20, ?21, ?22, ?23, ?24, ?25, ?26, ?27)",
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
                new_contact.notes,
            ],
        )?;

        let id = self.conn.last_insert_rowid();

        // Récupérer le contact créé
        self.get_contact_by_id(id)
    }

    pub fn get_contact_by_id(&self, id: i64) -> Result<Contact> {
        self.conn.query_row(
            "SELECT id, famille_id, foyer_id, role_foyer, role_famille, categorie, filleul_categorie, parrain_id, prescripteur_id, civilite, nom, prenom, email, telephone,
                    adresse, code_postal, ville, date_naissance, profession, situation_familiale,
                    source_lead, profil_risque_sri, date_dernier_contact, date_prochain_suivi,
                    date_dernier_contact_filleul, date_prochain_suivi_filleul,
                    statut_suivi, notes, created_at, updated_at
             FROM contacts WHERE id = ?1",
            params![id],
            |row| {
                Ok(Contact {
                    id: row.get(0)?,
                    famille_id: row.get(1)?,
                    foyer_id: row.get(2)?,
                    role_foyer: row.get(3)?,
                    role_famille: row.get(4)?,
                    categorie: row.get(5)?,
                    filleul_categorie: row.get(6)?,
                    parrain_id: row.get(7)?,
                    prescripteur_id: row.get(8)?,
                    civilite: row.get(9)?,
                    nom: row.get(10)?,
                    prenom: row.get(11)?,
                    email: row.get(12)?,
                    telephone: row.get(13)?,
                    adresse: row.get(14)?,
                    code_postal: row.get(15)?,
                    ville: row.get(16)?,
                    date_naissance: row.get(17)?,
                    profession: row.get(18)?,
                    situation_familiale: row.get(19)?,
                    source_lead: row.get(20)?,
                    profil_risque_sri: row.get(21)?,
                    date_dernier_contact: row.get(22)?,
                    date_prochain_suivi: row.get(23)?,
                    date_dernier_contact_filleul: row.get(24)?,
                    date_prochain_suivi_filleul: row.get(25)?,
                    statut_suivi: row.get(26)?,
                    notes: row.get(27)?,
                    created_at: row.get(28)?,
                    updated_at: row.get(29)?,
                })
            },
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
        match self.conn.query_row(
            "SELECT id, famille_id, foyer_id, role_foyer, role_famille, categorie, filleul_categorie, parrain_id, prescripteur_id, civilite, nom, prenom, email, telephone,
                    adresse, code_postal, ville, date_naissance, profession, situation_familiale,
                    source_lead, profil_risque_sri, date_dernier_contact, date_prochain_suivi,
                    date_dernier_contact_filleul, date_prochain_suivi_filleul,
                    statut_suivi, notes, created_at, updated_at
             FROM contacts WHERE email = ?1",
            params![email],
            |row| {
                Ok(Contact {
                    id: row.get(0)?,
                    famille_id: row.get(1)?,
                    foyer_id: row.get(2)?,
                    role_foyer: row.get(3)?,
                    role_famille: row.get(4)?,
                    categorie: row.get(5)?,
                    filleul_categorie: row.get(6)?,
                    parrain_id: row.get(7)?,
                    prescripteur_id: row.get(8)?,
                    civilite: row.get(9)?,
                    nom: row.get(10)?,
                    prenom: row.get(11)?,
                    email: row.get(12)?,
                    telephone: row.get(13)?,
                    adresse: row.get(14)?,
                    code_postal: row.get(15)?,
                    ville: row.get(16)?,
                    date_naissance: row.get(17)?,
                    profession: row.get(18)?,
                    situation_familiale: row.get(19)?,
                    source_lead: row.get(20)?,
                    profil_risque_sri: row.get(21)?,
                    date_dernier_contact: row.get(22)?,
                    date_prochain_suivi: row.get(23)?,
                    date_dernier_contact_filleul: row.get(24)?,
                    date_prochain_suivi_filleul: row.get(25)?,
                    statut_suivi: row.get(26)?,
                    notes: row.get(27)?,
                    created_at: row.get(28)?,
                    updated_at: row.get(29)?,
                })
            },
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
                notes = ?25,
                role_foyer = ?26,
                role_famille = ?27,
                updated_at = unixepoch()
            WHERE id = ?28",
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
                &contact.notes,
                &contact.role_foyer,
                &contact.role_famille,
                id
            ],
        )?;

        self.get_contact_by_id(id)
    }

    // ========== FAMILLES ==========

    pub fn get_all_familles(&self) -> Result<Vec<Famille>> {
        let mut stmt = self
            .conn
            .prepare("SELECT id, nom, notes, created_at, updated_at FROM familles ORDER BY nom")?;

        let familles = stmt.query_map([], |row| {
            Ok(Famille {
                id: row.get(0)?,
                nom: row.get(1)?,
                notes: row.get(2)?,
                created_at: row.get(3)?,
                updated_at: row.get(4)?,
            })
        })?;

        familles.collect()
    }

    pub fn get_famille_by_id(&self, id: i64) -> Result<Famille> {
        self.conn.query_row(
            "SELECT id, nom, notes, created_at, updated_at FROM familles WHERE id = ?1",
            params![id],
            |row| {
                Ok(Famille {
                    id: row.get(0)?,
                    nom: row.get(1)?,
                    notes: row.get(2)?,
                    created_at: row.get(3)?,
                    updated_at: row.get(4)?,
                })
            },
        )
    }

    pub fn get_famille_by_nom(&self, nom: &str) -> Result<Option<Famille>> {
        let result = self.conn.query_row(
            "SELECT id, nom, notes, created_at, updated_at FROM familles WHERE UPPER(nom) = UPPER(?1)",
            params![nom],
            |row| {
                Ok(Famille {
                    id: row.get(0)?,
                    nom: row.get(1)?,
                    notes: row.get(2)?,
                    created_at: row.get(3)?,
                    updated_at: row.get(4)?,
                })
            },
        );

        match result {
            Ok(famille) => Ok(Some(famille)),
            Err(rusqlite::Error::QueryReturnedNoRows) => Ok(None),
            Err(e) => Err(e),
        }
    }

    pub fn create_famille(&self, new_famille: NewFamille) -> Result<Famille> {
        self.conn.execute(
            "INSERT INTO familles (nom, notes) VALUES (?1, ?2)",
            params![new_famille.nom, new_famille.notes],
        )?;

        let id = self.conn.last_insert_rowid();
        self.get_famille_by_id(id)
    }

    pub fn update_famille(&self, id: i64, famille: &NewFamille) -> Result<Famille> {
        self.conn.execute(
            "UPDATE familles SET nom = ?1, notes = ?2, updated_at = unixepoch() WHERE id = ?3",
            params![famille.nom, famille.notes, id],
        )?;

        self.get_famille_by_id(id)
    }

    pub fn delete_famille(&self, id: i64) -> Result<()> {
        // Les contacts avec cette famille_id auront leur famille_id mis à NULL (ON DELETE SET NULL)
        self.conn
            .execute("DELETE FROM familles WHERE id = ?1", params![id])?;
        Ok(())
    }

    pub fn get_or_create_famille(&self, nom: &str) -> Result<Famille> {
        // Chercher une famille existante avec ce nom
        if let Some(famille) = self.get_famille_by_nom(nom)? {
            return Ok(famille);
        }

        // Créer une nouvelle famille
        self.create_famille(NewFamille {
            nom: nom.to_string(),
            notes: None,
        })
    }

    // ========== FOYERS ==========

    pub fn get_all_foyers(&self) -> Result<Vec<super::models::Foyer>> {
        let mut stmt = self.conn.prepare(
            "SELECT id, nom, type_foyer, nombre_parts_fiscales, tranche_imposition, 
                    revenu_fiscal_reference, situation_patrimoniale, objectifs_patrimoniaux, 
                    notes, created_at, updated_at 
             FROM foyers 
             ORDER BY nom",
        )?;

        let foyers = stmt.query_map([], |row| {
            Ok(super::models::Foyer {
                id: row.get(0)?,
                nom: row.get(1)?,
                type_foyer: row.get(2)?,
                nombre_parts_fiscales: row.get(3)?,
                tranche_imposition: row.get(4)?,
                revenu_fiscal_reference: row.get(5)?,
                situation_patrimoniale: row.get(6)?,
                objectifs_patrimoniaux: row.get(7)?,
                notes: row.get(8)?,
                created_at: row.get(9)?,
                updated_at: row.get(10)?,
            })
        })?;

        let mut result = Vec::new();
        for foyer in foyers {
            result.push(foyer?);
        }
        Ok(result)
    }

    pub fn create_foyer(&self, foyer: super::models::NewFoyer) -> Result<super::models::Foyer> {
        self.conn.execute(
            "INSERT INTO foyers (nom, type_foyer, nombre_parts_fiscales, tranche_imposition, 
                                revenu_fiscal_reference, situation_patrimoniale, objectifs_patrimoniaux, notes) 
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
            params![
                &foyer.nom,
                &foyer.type_foyer,
                &foyer.nombre_parts_fiscales,
                &foyer.tranche_imposition,
                &foyer.revenu_fiscal_reference,
                &foyer.situation_patrimoniale,
                &foyer.objectifs_patrimoniaux,
                &foyer.notes,
            ],
        )?;

        let id = self.conn.last_insert_rowid();
        self.get_foyer_by_id(id)
    }

    pub fn get_foyer_by_id(&self, id: i64) -> Result<super::models::Foyer> {
        self.conn.query_row(
            "SELECT id, nom, type_foyer, nombre_parts_fiscales, tranche_imposition, 
                    revenu_fiscal_reference, situation_patrimoniale, objectifs_patrimoniaux, 
                    notes, created_at, updated_at 
             FROM foyers 
             WHERE id = ?1",
            params![id],
            |row| {
                Ok(super::models::Foyer {
                    id: row.get(0)?,
                    nom: row.get(1)?,
                    type_foyer: row.get(2)?,
                    nombre_parts_fiscales: row.get(3)?,
                    tranche_imposition: row.get(4)?,
                    revenu_fiscal_reference: row.get(5)?,
                    situation_patrimoniale: row.get(6)?,
                    objectifs_patrimoniaux: row.get(7)?,
                    notes: row.get(8)?,
                    created_at: row.get(9)?,
                    updated_at: row.get(10)?,
                })
            },
        )
    }

    pub fn update_foyer(
        &self,
        id: i64,
        foyer: &super::models::NewFoyer,
    ) -> Result<super::models::Foyer> {
        self.conn.execute(
            "UPDATE foyers SET 
                nom = ?1,
                type_foyer = ?2,
                nombre_parts_fiscales = ?3,
                tranche_imposition = ?4,
                revenu_fiscal_reference = ?5,
                situation_patrimoniale = ?6,
                objectifs_patrimoniaux = ?7,
                notes = ?8,
                updated_at = unixepoch()
            WHERE id = ?9",
            params![
                &foyer.nom,
                &foyer.type_foyer,
                &foyer.nombre_parts_fiscales,
                &foyer.tranche_imposition,
                &foyer.revenu_fiscal_reference,
                &foyer.situation_patrimoniale,
                &foyer.objectifs_patrimoniaux,
                &foyer.notes,
                id
            ],
        )?;

        self.get_foyer_by_id(id)
    }

    pub fn delete_foyer(&self, id: i64) -> Result<()> {
        // 🔥 FIX: Supprimer d'abord les investissements du foyer (car ON DELETE SET NULL ne les supprime pas)
        self.conn.execute(
            "DELETE FROM investissements WHERE foyer_id = ?1",
            params![id],
        )?;

        // Puis supprimer le foyer
        self.conn
            .execute("DELETE FROM foyers WHERE id = ?1", params![id])?;
        Ok(())
    }

    // ========== PARTENAIRES ==========

    pub fn get_all_partenaires(&self) -> Result<Vec<super::models::Partenaire>> {
        let mut stmt = self.conn.prepare(
            "SELECT id, type_partenaire, raison_sociale, nom_contact, prenom_contact,
                    email, telephone, adresse, code_postal, ville, specialite, zone_geo,
                    niveau_collaboration, notes, created_at, updated_at
             FROM partenaires 
             ORDER BY raison_sociale",
        )?;

        let partenaires = stmt.query_map([], |row| {
            Ok(super::models::Partenaire {
                id: row.get(0)?,
                type_partenaire: row.get(1)?,
                raison_sociale: row.get(2)?,
                nom_contact: row.get(3)?,
                prenom_contact: row.get(4)?,
                email: row.get(5)?,
                telephone: row.get(6)?,
                adresse: row.get(7)?,
                code_postal: row.get(8)?,
                ville: row.get(9)?,
                specialite: row.get(10)?,
                zone_geo: row.get(11)?,
                niveau_collaboration: row.get(12)?,
                notes: row.get(13)?,
                created_at: row.get(14)?,
                updated_at: row.get(15)?,
            })
        })?;

        let mut result = Vec::new();
        for partenaire in partenaires {
            result.push(partenaire?);
        }
        Ok(result)
    }

    pub fn create_partenaire(
        &self,
        partenaire: super::models::NewPartenaire,
    ) -> Result<super::models::Partenaire> {
        self.conn.execute(
            "INSERT INTO partenaires (type_partenaire, raison_sociale, nom_contact, prenom_contact,
                                     email, telephone, adresse, code_postal, ville, specialite,
                                     zone_geo, niveau_collaboration, notes) 
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13)",
            params![
                &partenaire.type_partenaire,
                &partenaire.raison_sociale,
                &partenaire.nom_contact,
                &partenaire.prenom_contact,
                &partenaire.email,
                &partenaire.telephone,
                &partenaire.adresse,
                &partenaire.code_postal,
                &partenaire.ville,
                &partenaire.specialite,
                &partenaire.zone_geo,
                &partenaire.niveau_collaboration,
                &partenaire.notes,
            ],
        )?;

        let id = self.conn.last_insert_rowid();
        self.get_partenaire_by_id(id)
    }

    pub fn get_partenaire_by_id(&self, id: i64) -> Result<super::models::Partenaire> {
        self.conn.query_row(
            "SELECT id, type_partenaire, raison_sociale, nom_contact, prenom_contact,
                    email, telephone, adresse, code_postal, ville, specialite, zone_geo,
                    niveau_collaboration, notes, created_at, updated_at
             FROM partenaires 
             WHERE id = ?1",
            params![id],
            |row| {
                Ok(super::models::Partenaire {
                    id: row.get(0)?,
                    type_partenaire: row.get(1)?,
                    raison_sociale: row.get(2)?,
                    nom_contact: row.get(3)?,
                    prenom_contact: row.get(4)?,
                    email: row.get(5)?,
                    telephone: row.get(6)?,
                    adresse: row.get(7)?,
                    code_postal: row.get(8)?,
                    ville: row.get(9)?,
                    specialite: row.get(10)?,
                    zone_geo: row.get(11)?,
                    niveau_collaboration: row.get(12)?,
                    notes: row.get(13)?,
                    created_at: row.get(14)?,
                    updated_at: row.get(15)?,
                })
            },
        )
    }

    pub fn update_partenaire(
        &self,
        id: i64,
        partenaire: &super::models::NewPartenaire,
    ) -> Result<super::models::Partenaire> {
        self.conn.execute(
            "UPDATE partenaires SET 
                type_partenaire = ?1,
                raison_sociale = ?2,
                nom_contact = ?3,
                prenom_contact = ?4,
                email = ?5,
                telephone = ?6,
                adresse = ?7,
                code_postal = ?8,
                ville = ?9,
                specialite = ?10,
                zone_geo = ?11,
                niveau_collaboration = ?12,
                notes = ?13,
                updated_at = unixepoch()
            WHERE id = ?14",
            params![
                &partenaire.type_partenaire,
                &partenaire.raison_sociale,
                &partenaire.nom_contact,
                &partenaire.prenom_contact,
                &partenaire.email,
                &partenaire.telephone,
                &partenaire.adresse,
                &partenaire.code_postal,
                &partenaire.ville,
                &partenaire.specialite,
                &partenaire.zone_geo,
                &partenaire.niveau_collaboration,
                &partenaire.notes,
                id
            ],
        )?;

        self.get_partenaire_by_id(id)
    }

    pub fn delete_partenaire(&self, id: i64) -> Result<()> {
        self.conn
            .execute("DELETE FROM partenaires WHERE id = ?1", params![id])?;
        Ok(())
    }

    // ========== DOCUMENTS ==========

    pub fn get_all_documents(&self) -> Result<Vec<super::models::Document>> {
        let mut stmt = self.conn.prepare(
            "SELECT id, contact_id, foyer_id, type_document, nom_fichier, chemin_fichier,
                    taille_fichier, mime_type, date_document, notes, created_at, updated_at
             FROM documents 
             ORDER BY created_at DESC",
        )?;

        let documents = stmt.query_map([], |row| {
            Ok(super::models::Document {
                id: row.get(0)?,
                contact_id: row.get(1)?,
                foyer_id: row.get(2)?,
                type_document: row.get(3)?,
                nom_fichier: row.get(4)?,
                chemin_fichier: row.get(5)?,
                taille_fichier: row.get(6)?,
                mime_type: row.get(7)?,
                date_document: row.get(8)?,
                notes: row.get(9)?,
                created_at: row.get(10)?,
                updated_at: row.get(11)?,
            })
        })?;

        let mut result = Vec::new();
        for document in documents {
            result.push(document?);
        }
        Ok(result)
    }

    pub fn create_document(
        &self,
        document: super::models::NewDocument,
    ) -> Result<super::models::Document> {
        self.conn.execute(
            "INSERT INTO documents (contact_id, foyer_id, type_document, nom_fichier, chemin_fichier,
                                   taille_fichier, mime_type, date_document, notes) 
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)",
            params![
                &document.contact_id,
                &document.foyer_id,
                &document.type_document,
                &document.nom_fichier,
                &document.chemin_fichier,
                &document.taille_fichier,
                &document.mime_type,
                &document.date_document,
                &document.notes,
            ],
        )?;

        let id = self.conn.last_insert_rowid();
        self.get_document_by_id(id)
    }

    pub fn get_document_by_id(&self, id: i64) -> Result<super::models::Document> {
        self.conn.query_row(
            "SELECT id, contact_id, foyer_id, type_document, nom_fichier, chemin_fichier,
                    taille_fichier, mime_type, date_document, notes, created_at, updated_at
             FROM documents 
             WHERE id = ?1",
            params![id],
            |row| {
                Ok(super::models::Document {
                    id: row.get(0)?,
                    contact_id: row.get(1)?,
                    foyer_id: row.get(2)?,
                    type_document: row.get(3)?,
                    nom_fichier: row.get(4)?,
                    chemin_fichier: row.get(5)?,
                    taille_fichier: row.get(6)?,
                    mime_type: row.get(7)?,
                    date_document: row.get(8)?,
                    notes: row.get(9)?,
                    created_at: row.get(10)?,
                    updated_at: row.get(11)?,
                })
            },
        )
    }

    pub fn update_document(
        &self,
        id: i64,
        document: &super::models::NewDocument,
    ) -> Result<super::models::Document> {
        self.conn.execute(
            "UPDATE documents SET 
                contact_id = ?1,
                foyer_id = ?2,
                type_document = ?3,
                nom_fichier = ?4,
                date_document = ?5,
                notes = ?6,
                updated_at = unixepoch()
            WHERE id = ?7",
            params![
                &document.contact_id,
                &document.foyer_id,
                &document.type_document,
                &document.nom_fichier,
                &document.date_document,
                &document.notes,
                id
            ],
        )?;

        self.get_document_by_id(id)
    }

    pub fn delete_document(&self, id: i64) -> Result<()> {
        self.conn
            .execute("DELETE FROM documents WHERE id = ?1", params![id])?;
        Ok(())
    }

    // ========== TEMPLATES EMAIL ==========

    pub fn get_all_templates_email(&self) -> Result<Vec<super::models::TemplateEmail>> {
        let mut stmt = self.conn.prepare(
            "SELECT id, nom, sujet, corps, categorie, variables, created_at, updated_at
             FROM templates_email 
             ORDER BY created_at DESC",
        )?;

        let templates = stmt.query_map([], |row| {
            Ok(super::models::TemplateEmail {
                id: row.get(0)?,
                nom: row.get(1)?,
                sujet: row.get(2)?,
                corps: row.get(3)?,
                categorie: row.get(4)?,
                variables: row.get(5)?,
                created_at: row.get(6)?,
                updated_at: row.get(7)?,
            })
        })?;

        let mut result = Vec::new();
        for template in templates {
            result.push(template?);
        }
        Ok(result)
    }

    pub fn create_template_email(
        &self,
        template: super::models::NewTemplateEmail,
    ) -> Result<super::models::TemplateEmail> {
        self.conn.execute(
            "INSERT INTO templates_email (nom, sujet, corps, categorie, variables) 
             VALUES (?1, ?2, ?3, ?4, ?5)",
            params![
                &template.nom,
                &template.sujet,
                &template.corps,
                &template.categorie,
                &template.variables,
            ],
        )?;

        let id = self.conn.last_insert_rowid();
        self.get_template_email_by_id(id)
    }

    pub fn get_template_email_by_id(&self, id: i64) -> Result<super::models::TemplateEmail> {
        self.conn.query_row(
            "SELECT id, nom, sujet, corps, categorie, variables, created_at, updated_at
             FROM templates_email 
             WHERE id = ?1",
            params![id],
            |row| {
                Ok(super::models::TemplateEmail {
                    id: row.get(0)?,
                    nom: row.get(1)?,
                    sujet: row.get(2)?,
                    corps: row.get(3)?,
                    categorie: row.get(4)?,
                    variables: row.get(5)?,
                    created_at: row.get(6)?,
                    updated_at: row.get(7)?,
                })
            },
        )
    }

    pub fn update_template_email(
        &self,
        id: i64,
        template: &super::models::NewTemplateEmail,
    ) -> Result<super::models::TemplateEmail> {
        self.conn.execute(
            "UPDATE templates_email SET 
                nom = ?1,
                sujet = ?2,
                corps = ?3,
                categorie = ?4,
                variables = ?5,
                updated_at = unixepoch()
            WHERE id = ?6",
            params![
                &template.nom,
                &template.sujet,
                &template.corps,
                &template.categorie,
                &template.variables,
                id
            ],
        )?;

        self.get_template_email_by_id(id)
    }

    pub fn delete_template_email(&self, id: i64) -> Result<()> {
        self.conn
            .execute("DELETE FROM templates_email WHERE id = ?1", params![id])?;
        Ok(())
    }

    fn template_email_nom_exists(&self, nom: &str) -> Result<bool> {
        let n: i64 = self.conn.query_row(
            "SELECT COUNT(*) FROM templates_email WHERE nom = ?1",
            params![nom],
            |row| row.get(0),
        )?;
        Ok(n > 0)
    }

    /// Crée les modèles par défaut manquants (sans modifier les existants).
    pub fn ensure_default_email_templates(&self) -> Result<usize> {
        use super::models::NewTemplateEmail;

        let defaults: Vec<NewTemplateEmail> = vec![
            NewTemplateEmail {
                nom: "Relance — client 1 an sans contact".into(),
                sujet: "{{prenom}}, reprenons contact".into(),
                corps: "Bonjour {{prenom}} {{nom}},\n\nIl y a plus d'un an que nous n'avons pas échangé. Je serais ravi de faire un point sur votre situation et vos objectifs.\n\n{{cgp_prenom}} {{cgp_nom}}\n{{cgp_telephone}}\n{{lien_calendly}}".into(),
                categorie: "RELANCE".into(),
                variables: None,
            },
            NewTemplateEmail {
                nom: "Relance — prospect 6 mois".into(),
                sujet: "{{prenom}}, un échange rapide ?".into(),
                corps: "Bonjour {{prenom}},\n\nJe me permets de vous recontacter : nous n'avons pas échangé depuis quelques mois. Souhaitez-vous un court appel ?\n\nBien cordialement,\n{{cgp_prenom}} {{cgp_nom}}".into(),
                categorie: "RELANCE".into(),
                variables: None,
            },
            NewTemplateEmail {
                nom: "Rappel déclaration IR".into(),
                sujet: "Déclaration d'impôts — {{prenom}}".into(),
                corps: "Bonjour {{prenom}},\n\nLa période de déclaration d'impôts approche. Je reste disponible si vous souhaitez un échange.\n\n{{cgp_prenom}} {{cgp_nom}}\n{{cgp_email}}".into(),
                categorie: "FISCALITE".into(),
                variables: None,
            },
            NewTemplateEmail {
                nom: "Prise de rendez-vous suivi".into(),
                sujet: "Prochain rendez-vous de suivi — {{prenom}}".into(),
                corps: "Bonjour {{prenom}} {{nom}},\n\nVotre prochain rendez-vous de suivi approche. Réservez un créneau ici : {{lien_calendly}}\n\nÀ bientôt,\n{{cgp_prenom}} {{cgp_nom}}".into(),
                categorie: "SUIVI_ANNUEL".into(),
                variables: None,
            },
            NewTemplateEmail {
                nom: "Bienvenue nouveau client".into(),
                sujet: "Bienvenue {{prenom}}".into(),
                corps: "Bonjour {{prenom}},\n\nJe suis ravi de vous accompagner. N'hésitez pas à me joindre au {{cgp_telephone}} ou par email.\n\nCordialement,\n{{cgp_prenom}} {{cgp_nom}}".into(),
                categorie: "BIENVENUE".into(),
                variables: None,
            },
            NewTemplateEmail {
                nom: "Relance — échéance patrimoine".into(),
                sujet: "Échéance à venir — {{prenom}}".into(),
                corps: "Bonjour {{prenom}},\n\nUne échéance importante approche sur votre patrimoine. Je vous propose d'en discuter rapidement.\n\n{{cgp_prenom}} {{cgp_nom}}\n{{cgp_telephone}}".into(),
                categorie: "RELANCE".into(),
                variables: None,
            },
            NewTemplateEmail {
                nom: "Rappel assurance-vie 69 ans".into(),
                sujet: "Point assurance-vie — {{prenom}}".into(),
                corps: "Bonjour {{prenom}} {{nom}},\n\nVous approchez d'une étape clé pour l'organisation de votre assurance-vie. Souhaitez-vous un rendez-vous ?\n\n{{cgp_prenom}} {{cgp_nom}}".into(),
                categorie: "SUIVI_ANNUEL".into(),
                variables: None,
            },
        ];

        let mut created = 0;
        for t in defaults {
            if !self.template_email_nom_exists(&t.nom)? {
                self.create_template_email(t)?;
                created += 1;
            }
        }
        Ok(created)
    }

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
        let mut stmt = self.conn.prepare(
            "SELECT id, contact_id, type_alerte, message, date_alerte, lue, traitee, created_at
             FROM alertes 
             WHERE traitee = 0
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

    // Génération automatique des alertes (alignée sur les étiquettes DELAI_SANS_CONTACT)
    pub fn generer_alertes_automatiques(&self) -> Result<usize> {
        const SECONDS_PER_DAY: i64 = 24 * 60 * 60;
        const JOURS_6_MOIS: i64 = 180;
        const JOURS_1_AN: i64 = 365;

        let now = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_secs() as i64;

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

            let date_dernier_contact = contact.date_dernier_contact;
            let date_dernier_contact_filleul = contact.date_dernier_contact_filleul;
            let filleul_cat = contact.filleul_categorie.as_deref();

            let days_since = |last: i64| (now - last) / SECONDS_PER_DAY;

            // ========== CLIENTS ==========
            if contact.categorie == "CLIENT" {
                if let Some(last_contact) = date_dernier_contact {
                    if days_since(last_contact) >= JOURS_1_AN {
                        if self.try_create_alerte_suivi(
                            contact_id,
                            "SUIVI_CLIENT_1AN",
                            format!("{} {}", contact.prenom, contact.nom),
                            now,
                        )? {
                            count += 1;
                        }
                    }
                } else if self.try_create_alerte_suivi(
                    contact_id,
                    "CLIENT_JAMAIS_SUIVI",
                    format!("{} {}", contact.prenom, contact.nom),
                    now,
                )? {
                    count += 1;
                }
            }

            // ========== PROSPECTS & SUSPECTS CLIENT ==========
            if contact.categorie == "SUSPECT_CLIENT" || contact.categorie == "PROSPECT_CLIENT" {
                if let Some(last_contact) = date_dernier_contact {
                    if days_since(last_contact) >= JOURS_6_MOIS {
                        if self.try_create_alerte_suivi(
                            contact_id,
                            "LEAD_SUIVI_6MOIS",
                            format!("{} {}", contact.prenom, contact.nom),
                            now,
                        )? {
                            count += 1;
                        }
                    }
                } else if self.try_create_alerte_suivi(
                    contact_id,
                    "LEAD_JAMAIS_CONTACTE",
                    format!("{} {}", contact.prenom, contact.nom),
                    now,
                )? {
                    count += 1;
                }
            }

            // ========== RÉSEAU FILLEUL ==========
            if let Some(fc) = filleul_cat {
                if fc == "FILLEUL_DESINSCRIT" {
                    continue;
                }
                let last_filleul = date_dernier_contact_filleul.or(date_dernier_contact);
                if fc == "FILLEUL" {
                    if let Some(last_contact) = last_filleul {
                        if days_since(last_contact) >= JOURS_1_AN {
                            if self.try_create_alerte_suivi(
                                contact_id,
                                "SUIVI_FILLEUL_1AN",
                                format!("{} {}", contact.prenom, contact.nom),
                                now,
                            )? {
                                count += 1;
                            }
                        }
                    }
                } else if fc == "PROSPECT_FILLEUL" || fc == "SUSPECT_FILLEUL" {
                    if let Some(last_contact) = last_filleul {
                        if days_since(last_contact) >= JOURS_6_MOIS {
                            if self.try_create_alerte_suivi(
                                contact_id,
                                "FILLEUL_SUIVI_6MOIS",
                                format!("{} {}", contact.prenom, contact.nom),
                                now,
                            )? {
                                count += 1;
                            }
                        }
                    } else if self.try_create_alerte_suivi(
                        contact_id,
                        "FILLEUL_JAMAIS_CONTACTE",
                        format!("{} {}", contact.prenom, contact.nom),
                        now,
                    )? {
                        count += 1;
                    }
                }
            }
        }

        Ok(count)
    }

    // ========== DASHBOARD STATS ==========

    pub fn get_dashboard_stats(&self) -> Result<super::models::DashboardStats> {
        // Compter les clients
        let total_clients: i64 = self.conn.query_row(
            "SELECT COUNT(*) FROM contacts WHERE categorie = 'CLIENT'",
            [],
            |row| row.get(0),
        )?;

        // Encours placements (AV, PER, Contrat capi, Épargne salariale - SANS SCPI)
        let encours_placements: f64 = self.conn.query_row(
            "SELECT COALESCE(SUM(i.montant_initial), 0) FROM investissements i
             WHERE i.type_produit IN ('ASSURANCE_VIE', 'PER', 'CONTRAT_CAPITALISATION', 'EPARGNE_SALARIALE', 'FIP_FCPI', 'FCPR')
               AND ((i.contact_id IS NOT NULL AND EXISTS (SELECT 1 FROM contacts c WHERE c.id = i.contact_id))
                    OR (i.foyer_id IS NOT NULL AND EXISTS (SELECT 1 FROM foyers f WHERE f.id = i.foyer_id)))",
            [],
            |row| {
                let centimes: i64 = row.get(0)?;
                Ok(centimes as f64 / 100.0)
            },
        ).unwrap_or(0.0);

        // Versements programmés annuels (convertir selon fréquence)
        // MENSUEL x12, TRIMESTRIEL x4, SEMESTRIEL x2, ANNUEL x1
        // Inclut TOUS les investissements avec versement programmé activé
        let versements_programmes_annuels: f64 = self.conn.query_row(
            "SELECT COALESCE(SUM(
                CASE 
                    WHEN frequence_versement = 'MENSUEL' THEN montant_versement_programme * 12
                    WHEN frequence_versement = 'TRIMESTRIEL' THEN montant_versement_programme * 4
                    WHEN frequence_versement = 'SEMESTRIEL' THEN montant_versement_programme * 2
                    WHEN frequence_versement = 'ANNUEL' THEN montant_versement_programme
                    ELSE montant_versement_programme * 12
                END
            ), 0) FROM investissements 
             WHERE versement_programme = 1
               AND montant_versement_programme IS NOT NULL
               AND montant_versement_programme > 0
               AND ((contact_id IS NOT NULL AND EXISTS (SELECT 1 FROM contacts c WHERE c.id = contact_id))
                    OR (foyer_id IS NOT NULL AND EXISTS (SELECT 1 FROM foyers f WHERE f.id = foyer_id)))",
            [],
            |row| {
                let centimes: i64 = row.get(0)?;
                Ok(centimes as f64 / 100.0)
            },
        ).unwrap_or(0.0);

        // Nombre de biens immobiliers
        let nombre_biens_immobiliers: i64 = self.conn.query_row(
            "SELECT COUNT(*) FROM investissements i
             WHERE i.type_produit IN ('IMMOBILIER', 'PINEL', 'DENORMANDIE', 'MALRAUX', 'MONUMENT_HISTORIQUE', 'DEFICIT_FONCIER', 'LMNP', 'LMP', 'NUE_PROPRIETE', 'RESIDENCE_PRINCIPALE', 'LOCATIF_CLASSIQUE')
               AND ((i.contact_id IS NOT NULL AND EXISTS (SELECT 1 FROM contacts c WHERE c.id = i.contact_id))
                    OR (i.foyer_id IS NOT NULL AND EXISTS (SELECT 1 FROM foyers f WHERE f.id = i.foyer_id)))",
            [],
            |row| row.get(0),
        ).unwrap_or(0);

        // Panier moyen = Total investissements "avec moi" / Nombre de clients
        // Uniquement les investissements avec origine = MON_CONSEIL
        let total_invests_avec_moi: f64 = self.conn.query_row(
            "SELECT COALESCE(SUM(i.montant_initial), 0) FROM investissements i
             WHERE i.origine = 'MON_CONSEIL'
               AND ((i.contact_id IS NOT NULL AND EXISTS (SELECT 1 FROM contacts c WHERE c.id = i.contact_id))
                    OR (i.foyer_id IS NOT NULL AND EXISTS (SELECT 1 FROM foyers f WHERE f.id = i.foyer_id)))",
            [],
            |row| {
                let centimes: i64 = row.get(0)?;
                Ok(centimes as f64 / 100.0)
            },
        ).unwrap_or(0.0);

        let panier_moyen = if total_clients > 0 {
            total_invests_avec_moi / total_clients as f64
        } else {
            0.0
        };

        // Compter les alertes non traitées
        let alertes_non_traitees: i64 = self
            .conn
            .query_row(
                "SELECT COUNT(*) FROM alertes WHERE traitee = 0",
                [],
                |row| row.get(0),
            )
            .unwrap_or(0);

        Ok(super::models::DashboardStats {
            total_clients,
            encours_placements,
            versements_programmes_annuels,
            nombre_biens_immobiliers,
            panier_moyen,
            alertes_non_traitees,
        })
    }

    pub fn get_category_stats(&self) -> Result<super::models::CategoryStats> {
        // Compter chaque catégorie individuellement
        let clients: i64 = self.conn.query_row(
            "SELECT COUNT(*) FROM contacts WHERE categorie = 'CLIENT'",
            [],
            |row| row.get(0),
        )?;

        let prospect_client: i64 = self.conn.query_row(
            "SELECT COUNT(*) FROM contacts WHERE categorie = 'PROSPECT_CLIENT'",
            [],
            |row| row.get(0),
        )?;

        let prospect_filleul: i64 = self.conn.query_row(
            "SELECT COUNT(*) FROM contacts
             WHERE filleul_categorie = 'PROSPECT_FILLEUL'
                OR (filleul_categorie IS NULL AND categorie = 'PROSPECT_FILLEUL')",
            [],
            |row| row.get(0),
        )?;

        let suspect_client: i64 = self.conn.query_row(
            "SELECT COUNT(*) FROM contacts WHERE categorie = 'SUSPECT_CLIENT'",
            [],
            |row| row.get(0),
        )?;

        let suspect_filleul: i64 = self.conn.query_row(
            "SELECT COUNT(*) FROM contacts
             WHERE filleul_categorie = 'SUSPECT_FILLEUL'
                OR (filleul_categorie IS NULL AND categorie = 'SUSPECT_FILLEUL')",
            [],
            |row| row.get(0),
        )?;

        Ok(super::models::CategoryStats {
            clients,
            prospect_client,
            prospect_filleul,
            suspect_client,
            suspect_filleul,
        })
    }

    pub fn get_monthly_stats(&self) -> Result<Vec<super::models::MonthlyStats>> {
        // Récupérer les 12 derniers mois
        let mut stats = Vec::new();

        // Obtenir le timestamp actuel
        let now = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_secs() as i64;

        // Pour les 12 derniers mois
        for i in (0..12).rev() {
            // Calculer le début et la fin du mois
            let month_start = now - (i * 30 * 24 * 60 * 60);
            let month_end = now - ((i - 1) * 30 * 24 * 60 * 60);

            // Compter les contacts créés ce mois
            let count: i64 = self
                .conn
                .query_row(
                    "SELECT COUNT(*) FROM contacts WHERE created_at >= ?1 AND created_at < ?2",
                    params![month_start, month_end],
                    |row| row.get(0),
                )
                .unwrap_or(0);

            // Formater le nom du mois
            let month_name = Self::format_month(month_start);

            stats.push(super::models::MonthlyStats {
                month: month_name,
                nouveaux: count,
            });
        }

        Ok(stats)
    }

    fn format_month(timestamp: i64) -> String {
        use std::time::{Duration, UNIX_EPOCH};

        let datetime = UNIX_EPOCH + Duration::from_secs(timestamp as u64);
        let datetime: chrono::DateTime<chrono::Utc> = datetime.into();

        // Format: "Jan 2026"
        datetime.format("%b %Y").to_string()
    }

    pub fn get_product_stats(&self) -> Result<Vec<super::models::ProductStats>> {
        // Vérifier si la table existe, sinon retourner un vecteur vide
        let table_exists: Result<i64> = self.conn.query_row(
            "SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name='investissements'",
            [],
            |row| row.get(0),
        );

        if table_exists.unwrap_or(0) == 0 {
            return Ok(Vec::new());
        }

        let mut stmt = self.conn.prepare(
            "SELECT type_produit, SUM(montant_initial) as total 
             FROM investissements 
             GROUP BY type_produit 
             HAVING total > 0
             ORDER BY total DESC",
        )?;

        let stats = stmt.query_map([], |row| {
            let montant_centimes: i64 = row.get(1)?;
            let montant_euros = montant_centimes as f64 / 100.0; // Convertir centimes en euros

            Ok(super::models::ProductStats {
                type_produit: row.get(0)?,
                montant: montant_euros,
            })
        })?;

        let mut result = Vec::new();
        for stat in stats {
            result.push(stat?);
        }
        Ok(result)
    }

    pub fn get_pipeline_stats(&self) -> Result<super::models::PipelineStats> {
        let suspects: i64 = self.conn.query_row(
            "SELECT COUNT(*) FROM contacts
             WHERE categorie = 'SUSPECT_CLIENT'
                OR filleul_categorie = 'SUSPECT_FILLEUL'
                OR (filleul_categorie IS NULL AND categorie = 'SUSPECT_FILLEUL')",
            [],
            |row| row.get(0),
        )?;

        let prospects: i64 = self.conn.query_row(
            "SELECT COUNT(*) FROM contacts
             WHERE categorie = 'PROSPECT_CLIENT'
                OR filleul_categorie = 'PROSPECT_FILLEUL'
                OR (filleul_categorie IS NULL AND categorie = 'PROSPECT_FILLEUL')",
            [],
            |row| row.get(0),
        )?;

        // Compter les clients
        let clients: i64 = self.conn.query_row(
            "SELECT COUNT(*) FROM contacts WHERE categorie = 'CLIENT'",
            [],
            |row| row.get(0),
        )?;

        Ok(super::models::PipelineStats {
            suspects,
            prospects,
            clients,
        })
    }

    pub fn get_alertes_with_contacts(
        &self,
        limit: i64,
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

        let mut stmt = self.conn.prepare(
            "SELECT a.id, a.contact_id, c.nom, c.prenom,
                    COALESCE(NULLIF(c.filleul_categorie, ''), c.categorie) as display_categorie,
                    c.date_dernier_contact,
                    a.type_alerte, a.message, a.date_alerte, a.traitee
             FROM alertes a
             INNER JOIN contacts c ON a.contact_id = c.id
             WHERE a.traitee = 0
             ORDER BY a.date_alerte ASC
             LIMIT ?1",
        )?;

        let alertes = stmt.query_map(params![limit], |row| {
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
                statut: if traitee != 0 { "TRAITE" } else { "EN_ATTENTE" }.to_string(),
            })
        })?;

        let mut result = Vec::new();
        for alerte in alertes {
            result.push(alerte?);
        }
        Ok(result)
    }

    // ========== INVESTISSEMENTS ==========

    pub fn get_all_investissements(&self) -> Result<Vec<super::models::Investissement>> {
        let mut stmt = self.conn.prepare(
            "SELECT id, contact_id, foyer_id, type_produit, partenaire_id, nom_produit,
                    montant_initial, date_souscription, date_fin_demembrement, date_fin_pret,
                    versement_programme, montant_versement_programme, frequence_versement,
                    reinvestissement_dividendes, notes, origine, created_at, updated_at
             FROM investissements 
             ORDER BY date_souscription DESC",
        )?;

        let investissements = stmt.query_map([], |row| {
            Ok(super::models::Investissement {
                id: row.get(0)?,
                contact_id: row.get(1)?,
                foyer_id: row.get(2)?,
                type_produit: row.get(3)?,
                partenaire_id: row.get(4)?,
                nom_produit: row.get(5)?,
                montant_initial: row.get(6)?,
                date_souscription: row.get(7)?,
                date_fin_demembrement: row.get(8)?,
                date_fin_pret: row.get(9)?,
                versement_programme: row.get::<_, i64>(10)? != 0,
                montant_versement_programme: row.get(11)?,
                frequence_versement: row.get(12)?,
                reinvestissement_dividendes: row.get::<_, i64>(13)? != 0,
                notes: row.get(14)?,
                origine: row
                    .get::<_, String>(15)
                    .unwrap_or_else(|_| "MON_CONSEIL".to_string()),
                created_at: row.get(16)?,
                updated_at: row.get(17)?,
            })
        })?;

        let mut result = Vec::new();
        for investissement in investissements {
            result.push(investissement?);
        }
        Ok(result)
    }

    pub fn get_investissements_by_contact(
        &self,
        contact_id: i64,
    ) -> Result<Vec<super::models::Investissement>> {
        let mut stmt = self.conn.prepare(
            "SELECT id, contact_id, foyer_id, type_produit, partenaire_id, nom_produit,
                    montant_initial, date_souscription, date_fin_demembrement, date_fin_pret,
                    versement_programme, montant_versement_programme, frequence_versement,
                    reinvestissement_dividendes, notes, origine, created_at, updated_at
             FROM investissements 
             WHERE contact_id = ?1
             ORDER BY date_souscription DESC",
        )?;

        let investissements = stmt.query_map(params![contact_id], |row| {
            Ok(super::models::Investissement {
                id: row.get(0)?,
                contact_id: row.get(1)?,
                foyer_id: row.get(2)?,
                type_produit: row.get(3)?,
                partenaire_id: row.get(4)?,
                nom_produit: row.get(5)?,
                montant_initial: row.get(6)?,
                date_souscription: row.get(7)?,
                date_fin_demembrement: row.get(8)?,
                date_fin_pret: row.get(9)?,
                versement_programme: row.get::<_, i64>(10)? != 0,
                montant_versement_programme: row.get(11)?,
                frequence_versement: row.get(12)?,
                reinvestissement_dividendes: row.get::<_, i64>(13)? != 0,
                notes: row.get(14)?,
                origine: row
                    .get::<_, String>(15)
                    .unwrap_or_else(|_| "MON_CONSEIL".to_string()),
                created_at: row.get(16)?,
                updated_at: row.get(17)?,
            })
        })?;

        let mut result = Vec::new();
        for investissement in investissements {
            result.push(investissement?);
        }
        Ok(result)
    }

    pub fn get_investissements_by_foyer(
        &self,
        foyer_id: i64,
    ) -> Result<Vec<super::models::Investissement>> {
        let mut stmt = self.conn.prepare(
            "SELECT id, contact_id, foyer_id, type_produit, partenaire_id, nom_produit,
                    montant_initial, date_souscription, date_fin_demembrement, date_fin_pret,
                    versement_programme, montant_versement_programme, frequence_versement,
                    reinvestissement_dividendes, notes, origine, created_at, updated_at
             FROM investissements 
             WHERE foyer_id = ?1
             ORDER BY date_souscription DESC",
        )?;

        let investissements = stmt.query_map(params![foyer_id], |row| {
            Ok(super::models::Investissement {
                id: row.get(0)?,
                contact_id: row.get(1)?,
                foyer_id: row.get(2)?,
                type_produit: row.get(3)?,
                partenaire_id: row.get(4)?,
                nom_produit: row.get(5)?,
                montant_initial: row.get(6)?,
                date_souscription: row.get(7)?,
                date_fin_demembrement: row.get(8)?,
                date_fin_pret: row.get(9)?,
                versement_programme: row.get::<_, i64>(10)? != 0,
                montant_versement_programme: row.get(11)?,
                frequence_versement: row.get(12)?,
                reinvestissement_dividendes: row.get::<_, i64>(13)? != 0,
                notes: row.get(14)?,
                origine: row
                    .get::<_, String>(15)
                    .unwrap_or_else(|_| "MON_CONSEIL".to_string()),
                created_at: row.get(16)?,
                updated_at: row.get(17)?,
            })
        })?;

        let mut result = Vec::new();
        for investissement in investissements {
            result.push(investissement?);
        }
        Ok(result)
    }

    pub fn get_investissements_with_details(
        &self,
    ) -> Result<Vec<super::models::InvestissementWithDetails>> {
        let mut stmt = self.conn.prepare(
            "SELECT i.id, i.contact_id, c.nom, c.prenom, i.foyer_id, f.nom as foyer_nom,
                    i.type_produit, i.partenaire_id, p.raison_sociale as partenaire_nom,
                    i.nom_produit, i.montant_initial, i.date_souscription, i.date_fin_demembrement, i.date_fin_pret,
                    i.versement_programme, i.montant_versement_programme, i.frequence_versement,
                    i.reinvestissement_dividendes, i.notes, i.origine, i.created_at, i.updated_at
             FROM investissements i
             INNER JOIN contacts c ON i.contact_id = c.id
             LEFT JOIN foyers f ON i.foyer_id = f.id
             LEFT JOIN partenaires p ON i.partenaire_id = p.id
             ORDER BY i.date_souscription DESC"
        )?;

        let investissements = stmt.query_map([], |row| {
            Ok(super::models::InvestissementWithDetails {
                id: row.get(0)?,
                contact_id: row.get(1)?,
                contact_nom: row.get(2)?,
                contact_prenom: row.get(3)?,
                foyer_id: row.get(4)?,
                foyer_nom: row.get(5)?,
                type_produit: row.get(6)?,
                partenaire_id: row.get(7)?,
                partenaire_nom: row.get(8)?,
                nom_produit: row.get(9)?,
                montant_initial: row.get(10)?,
                date_souscription: row.get(11)?,
                date_fin_demembrement: row.get(12)?,
                date_fin_pret: row.get(13)?,
                versement_programme: row.get::<_, i64>(14)? != 0,
                montant_versement_programme: row.get(15)?,
                frequence_versement: row.get(16)?,
                reinvestissement_dividendes: row.get::<_, i64>(17)? != 0,
                notes: row.get(18)?,
                origine: row
                    .get::<_, String>(19)
                    .unwrap_or_else(|_| "MON_CONSEIL".to_string()),
                created_at: row.get(20)?,
                updated_at: row.get(21)?,
            })
        })?;

        let mut result = Vec::new();
        for investissement in investissements {
            result.push(investissement?);
        }
        Ok(result)
    }

    pub fn create_investissement(
        &self,
        investissement: super::models::NewInvestissement,
    ) -> Result<super::models::Investissement> {
        use chrono::{DateTime, Utc};

        let versement_programme = if investissement.versement_programme.unwrap_or(false) {
            1
        } else {
            0
        };
        let reinvestissement_dividendes =
            if investissement.reinvestissement_dividendes.unwrap_or(false) {
                1
            } else {
                0
            };

        // Convertir les dates ISO string en timestamps Unix
        let date_souscription_timestamp = investissement.date_souscription.and_then(|date_str| {
            DateTime::parse_from_rfc3339(&date_str)
                .ok()
                .map(|dt| dt.timestamp())
        });

        let date_fin_demembrement_timestamp =
            investissement.date_fin_demembrement.and_then(|date_str| {
                DateTime::parse_from_rfc3339(&date_str)
                    .ok()
                    .map(|dt| dt.timestamp())
            });

        let date_fin_pret_timestamp = investissement.date_fin_pret.and_then(|date_str| {
            DateTime::parse_from_rfc3339(&date_str)
                .ok()
                .map(|dt| dt.timestamp())
        });

        // Origine par défaut : MON_CONSEIL
        let origine = investissement
            .origine
            .unwrap_or_else(|| "MON_CONSEIL".to_string());

        self.conn.execute(
            "INSERT INTO investissements (contact_id, foyer_id, type_produit, partenaire_id, nom_produit,
                                         montant_initial, date_souscription, date_fin_demembrement, date_fin_pret,
                                         versement_programme, montant_versement_programme, frequence_versement,
                                         reinvestissement_dividendes, notes, origine) 
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15)",
            params![
                &investissement.contact_id,
                &investissement.foyer_id,
                &investissement.type_produit,
                &investissement.partenaire_id,
                &investissement.nom_produit,
                &investissement.montant_initial,
                date_souscription_timestamp,
                date_fin_demembrement_timestamp,
                date_fin_pret_timestamp,
                versement_programme,
                &investissement.montant_versement_programme,
                &investissement.frequence_versement,
                reinvestissement_dividendes,
                &investissement.notes,
                &origine,
            ],
        )?;

        let id = self.conn.last_insert_rowid();
        self.get_investissement_by_id(id)
    }

    pub fn get_investissement_by_id(&self, id: i64) -> Result<super::models::Investissement> {
        self.conn.query_row(
            "SELECT id, contact_id, foyer_id, type_produit, partenaire_id, nom_produit,
                    montant_initial, date_souscription, date_fin_demembrement, date_fin_pret,
                    versement_programme, montant_versement_programme, frequence_versement,
                    reinvestissement_dividendes, notes, origine, created_at, updated_at
             FROM investissements 
             WHERE id = ?1",
            params![id],
            |row| {
                Ok(super::models::Investissement {
                    id: row.get(0)?,
                    contact_id: row.get(1)?,
                    foyer_id: row.get(2)?,
                    type_produit: row.get(3)?,
                    partenaire_id: row.get(4)?,
                    nom_produit: row.get(5)?,
                    montant_initial: row.get(6)?,
                    date_souscription: row.get(7)?,
                    date_fin_demembrement: row.get(8)?,
                    date_fin_pret: row.get(9)?,
                    versement_programme: row.get::<_, i64>(10)? != 0,
                    montant_versement_programme: row.get(11)?,
                    frequence_versement: row.get(12)?,
                    reinvestissement_dividendes: row.get::<_, i64>(13)? != 0,
                    notes: row.get(14)?,
                    origine: row
                        .get::<_, String>(15)
                        .unwrap_or_else(|_| "MON_CONSEIL".to_string()),
                    created_at: row.get(16)?,
                    updated_at: row.get(17)?,
                })
            },
        )
    }

    pub fn update_investissement(
        &self,
        id: i64,
        investissement: &super::models::NewInvestissement,
    ) -> Result<super::models::Investissement> {
        use chrono::{DateTime, Utc};

        let versement_programme = if investissement.versement_programme.unwrap_or(false) {
            1
        } else {
            0
        };
        let reinvestissement_dividendes =
            if investissement.reinvestissement_dividendes.unwrap_or(false) {
                1
            } else {
                0
            };

        // Convertir les dates ISO string en timestamps Unix
        let date_souscription_timestamp =
            investissement
                .date_souscription
                .as_ref()
                .and_then(|date_str| {
                    DateTime::parse_from_rfc3339(date_str)
                        .ok()
                        .map(|dt| dt.timestamp())
                });

        let date_fin_demembrement_timestamp = investissement
            .date_fin_demembrement
            .as_ref()
            .and_then(|date_str| {
                DateTime::parse_from_rfc3339(date_str)
                    .ok()
                    .map(|dt| dt.timestamp())
            });

        let date_fin_pret_timestamp = investissement.date_fin_pret.as_ref().and_then(|date_str| {
            DateTime::parse_from_rfc3339(date_str)
                .ok()
                .map(|dt| dt.timestamp())
        });

        self.conn.execute(
            "UPDATE investissements SET 
                contact_id = ?1,
                foyer_id = ?2,
                type_produit = ?3,
                partenaire_id = ?4,
                nom_produit = ?5,
                montant_initial = ?6,
                date_souscription = ?7,
                date_fin_demembrement = ?8,
                date_fin_pret = ?9,
                versement_programme = ?10,
                montant_versement_programme = ?11,
                frequence_versement = ?12,
                reinvestissement_dividendes = ?13,
                notes = ?14,
                updated_at = unixepoch()
            WHERE id = ?15",
            params![
                &investissement.contact_id,
                &investissement.foyer_id,
                &investissement.type_produit,
                &investissement.partenaire_id,
                &investissement.nom_produit,
                &investissement.montant_initial,
                date_souscription_timestamp,
                date_fin_demembrement_timestamp,
                date_fin_pret_timestamp,
                versement_programme,
                &investissement.montant_versement_programme,
                &investissement.frequence_versement,
                reinvestissement_dividendes,
                &investissement.notes,
                id
            ],
        )?;

        self.get_investissement_by_id(id)
    }

    pub fn delete_investissement(&self, id: i64) -> Result<()> {
        self.conn
            .execute("DELETE FROM investissements WHERE id = ?1", params![id])?;
        Ok(())
    }

    // Générer les alertes pour les SCPI en démembrement arrivant à échéance dans les 6 prochains mois
    pub fn check_and_create_demembrement_alerts(&self) -> Result<Vec<super::models::Alerte>> {
        // Timestamp actuel
        let now = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_secs() as i64;

        // Timestamp dans 6 mois (approximatif: 6 * 30 jours)
        let six_months = 6 * 30 * 24 * 60 * 60;
        let six_months_later = now + six_months;

        // Récupérer les SCPI en démembrement qui arrivent à échéance dans les 6 prochains mois
        let mut stmt = self.conn.prepare(
            "SELECT id, contact_id, foyer_id, nom_produit, date_fin_demembrement
             FROM investissements
             WHERE type_produit = 'SCPI_DEMEMBREMENT'
               AND date_fin_demembrement IS NOT NULL
               AND date_fin_demembrement > ?1
               AND date_fin_demembrement <= ?2",
        )?;

        let investissements = stmt.query_map(params![now, six_months_later], |row| {
            Ok((
                row.get::<_, i64>(0)?,
                row.get::<_, Option<i64>>(1)?,
                row.get::<_, Option<i64>>(2)?,
                row.get::<_, String>(3)?,
                row.get::<_, i64>(4)?,
            ))
        })?;

        let mut created_alerts = Vec::new();

        for inv_result in investissements {
            let (_inv_id, contact_id, foyer_id, nom_produit, date_fin) = inv_result?;

            let contact_id = match contact_id {
                Some(id) => id,
                None => {
                    let Some(fid) = foyer_id else { continue };
                    match self.conn.query_row(
                        "SELECT id FROM contacts WHERE foyer_id = ?1 ORDER BY id LIMIT 1",
                        params![fid],
                        |row| row.get::<_, i64>(0),
                    ) {
                        Ok(id) => id,
                        Err(_) => continue,
                    }
                }
            };

            // Vérifier si une alerte existe déjà pour cet investissement
            let existing: Result<i64> = self.conn.query_row(
                "SELECT COUNT(*) FROM alertes 
                 WHERE contact_id = ?1 
                   AND type_alerte = 'FIN_DEMEMBREMENT'
                   AND message LIKE ?2
                   AND traitee = 0",
                params![contact_id, format!("%{}%", nom_produit)],
                |row| row.get(0),
            );

            // Si aucune alerte n'existe, en créer une
            if existing.unwrap_or(0) == 0 {
                let date_fin_formatted = chrono::DateTime::from_timestamp(date_fin, 0)
                    .map(|dt| dt.format("%d/%m/%Y").to_string())
                    .unwrap_or_else(|| "date inconnue".to_string());

                let message = format!(
                    "Fin de démembrement SCPI \"{}\" prévue le {}",
                    nom_produit, date_fin_formatted
                );

                self.conn.execute(
                    "INSERT INTO alertes (contact_id, type_alerte, message, date_alerte, lue, traitee)
                     VALUES (?1, 'FIN_DEMEMBREMENT', ?2, ?3, 0, 0)",
                    params![contact_id, message, date_fin],
                )?;

                let alerte_id = self.conn.last_insert_rowid();

                // Récupérer l'alerte créée
                let alerte = self.conn.query_row(
                    "SELECT id, contact_id, type_alerte, message, date_alerte, lue, traitee, created_at
                     FROM alertes WHERE id = ?1",
                    params![alerte_id],
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
                )?;

                created_alerts.push(alerte);
            }
        }

        Ok(created_alerts)
    }

    // ========== FILLEULS ==========

    // Récupérer tous les filleuls d'un contact (parrain)
    pub fn get_filleuls_by_parrain(&self, parrain_id: i64) -> Result<Vec<Contact>> {
        let mut stmt = self.conn.prepare(
            "SELECT id, famille_id, foyer_id, role_foyer, role_famille, categorie, filleul_categorie, parrain_id, prescripteur_id, civilite, nom, prenom, email, telephone,
                    adresse, code_postal, ville, date_naissance, profession, situation_familiale,
                    source_lead, profil_risque_sri, date_dernier_contact, date_prochain_suivi,
                    date_dernier_contact_filleul, date_prochain_suivi_filleul,
                    statut_suivi, notes, created_at, updated_at
             FROM contacts
             WHERE parrain_id = ?1
             ORDER BY created_at DESC"
        )?;

        let filleuls = stmt.query_map(params![parrain_id], |row| {
            Ok(Contact {
                id: row.get(0)?,
                famille_id: row.get(1)?,
                foyer_id: row.get(2)?,
                role_foyer: row.get(3)?,
                role_famille: row.get(4)?,
                categorie: row.get(5)?,
                filleul_categorie: row.get(6)?,
                parrain_id: row.get(7)?,
                prescripteur_id: row.get(8)?,
                civilite: row.get(9)?,
                nom: row.get(10)?,
                prenom: row.get(11)?,
                email: row.get(12)?,
                telephone: row.get(13)?,
                adresse: row.get(14)?,
                code_postal: row.get(15)?,
                ville: row.get(16)?,
                date_naissance: row.get(17)?,
                profession: row.get(18)?,
                situation_familiale: row.get(19)?,
                source_lead: row.get(20)?,
                profil_risque_sri: row.get(21)?,
                date_dernier_contact: row.get(22)?,
                date_prochain_suivi: row.get(23)?,
                date_dernier_contact_filleul: row.get(24)?,
                date_prochain_suivi_filleul: row.get(25)?,
                statut_suivi: row.get(26)?,
                notes: row.get(27)?,
                created_at: row.get(28)?,
                updated_at: row.get(29)?,
            })
        })?;

        filleuls.collect()
    }

    // Rechercher un contact par nom et prénom (normalisation + inversion nom/prénom)
    pub fn find_contact_by_name(&self, nom: &str, prenom: &str) -> Result<Option<Contact>> {
        use crate::contact_name::names_match;

        if nom.trim().is_empty() || prenom.trim().is_empty() {
            return Ok(None);
        }

        for contact in self.get_all_contacts()? {
            if names_match(nom, prenom, &contact.nom, &contact.prenom) {
                return Ok(Some(contact));
            }
        }
        Ok(None)
    }

    // 🔥 Récupérer tous les contacts recommandés par un prescripteur
    pub fn get_clients_by_prescripteur(&self, prescripteur_id: i64) -> Result<Vec<Contact>> {
        let mut stmt = self.conn.prepare(
            "SELECT id, famille_id, foyer_id, role_foyer, role_famille, categorie, filleul_categorie, parrain_id, prescripteur_id, civilite, nom, prenom, email, telephone,
                    adresse, code_postal, ville, date_naissance, profession, situation_familiale,
                    source_lead, profil_risque_sri, date_dernier_contact, date_prochain_suivi,
                    date_dernier_contact_filleul, date_prochain_suivi_filleul,
                    statut_suivi, notes, created_at, updated_at
             FROM contacts
             WHERE prescripteur_id = ?1
             ORDER BY created_at DESC"
        )?;

        let clients = stmt.query_map(params![prescripteur_id], |row| {
            Ok(Contact {
                id: row.get(0)?,
                famille_id: row.get(1)?,
                foyer_id: row.get(2)?,
                role_foyer: row.get(3)?,
                role_famille: row.get(4)?,
                categorie: row.get(5)?,
                filleul_categorie: row.get(6)?,
                parrain_id: row.get(7)?,
                prescripteur_id: row.get(8)?,
                civilite: row.get(9)?,
                nom: row.get(10)?,
                prenom: row.get(11)?,
                email: row.get(12)?,
                telephone: row.get(13)?,
                adresse: row.get(14)?,
                code_postal: row.get(15)?,
                ville: row.get(16)?,
                date_naissance: row.get(17)?,
                profession: row.get(18)?,
                situation_familiale: row.get(19)?,
                source_lead: row.get(20)?,
                profil_risque_sri: row.get(21)?,
                date_dernier_contact: row.get(22)?,
                date_prochain_suivi: row.get(23)?,
                date_dernier_contact_filleul: row.get(24)?,
                date_prochain_suivi_filleul: row.get(25)?,
                statut_suivi: row.get(26)?,
                notes: row.get(27)?,
                created_at: row.get(28)?,
                updated_at: row.get(29)?,
            })
        })?;

        clients.collect()
    }

    // ==================== ETIQUETTES ====================

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
            email_actif: row.get::<_, i64>(12)? != 0,
            is_default: row.get::<_, i64>(13)? != 0,
            actif: row.get::<_, i64>(14)? != 0,
            created_at: row.get(15)?,
            updated_at: row.get(16)?,
        })
    }

    /// Retire les attributions automatiques d'une étiquette (désactivation). Conserve les tags MANUEL.
    pub fn remove_auto_assignments_for_etiquette(&self, etiquette_id: i64) -> Result<usize> {
        let n = self.conn.execute(
            "DELETE FROM contact_etiquettes WHERE etiquette_id = ?1 AND UPPER(TRIM(attribue_par)) != 'MANUEL'",
            params![etiquette_id],
        )?;
        Ok(n)
    }

    fn resolve_email_date_prevue(etiquette: &Etiquette) -> Option<i64> {
        if !etiquette.actif || !etiquette.email_actif {
            return None;
        }
        if let Some(ts) = etiquette.email_envoi_prevu {
            return Some(ts);
        }
        if etiquette.email_delai_jours > 0 {
            let now = std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_secs() as i64;
            return Some(now + etiquette.email_delai_jours * 24 * 60 * 60);
        }
        None
    }

    fn sync_pending_email_dates_for_etiquette(
        &self,
        etiquette_id: i64,
        date_prevue: Option<i64>,
    ) -> Result<()> {
        self.conn.execute(
            "UPDATE contact_etiquettes SET email_date_prevue = ?1
             WHERE etiquette_id = ?2 AND email_envoye = 0",
            params![date_prevue, etiquette_id],
        )?;
        Ok(())
    }

    /// Récupérer toutes les étiquettes
    pub fn get_all_etiquettes(&self) -> Result<Vec<Etiquette>> {
        let mut stmt = self.conn.prepare(
            "SELECT id, nom, couleur, icone, description, priorite,
                    auto_condition_type, auto_condition_config, auto_categories,
                    email_template_id, email_delai_jours, email_envoi_prevu, email_actif,
                    is_default, actif, created_at, updated_at
             FROM etiquettes 
             ORDER BY priorite DESC, nom ASC",
        )?;

        let etiquettes = stmt.query_map([], Self::map_etiquette_from_row)?;
        etiquettes.collect()
    }

    /// Récupérer toutes les étiquettes avec le compteur de contacts
    pub fn get_all_etiquettes_with_count(&self) -> Result<Vec<EtiquetteWithCount>> {
        let mut stmt = self.conn.prepare(
            "SELECT e.id, e.nom, e.couleur, e.icone, e.description, e.priorite,
                    e.auto_condition_type, e.auto_condition_config, e.auto_categories,
                    e.email_template_id, e.email_delai_jours, e.email_envoi_prevu, e.email_actif,
                    e.is_default, e.actif, e.created_at, e.updated_at,
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
                email_actif: row.get::<_, i64>(12)? != 0,
                is_default: row.get::<_, i64>(13)? != 0,
                actif: row.get::<_, i64>(14)? != 0,
                created_at: row.get(15)?,
                updated_at: row.get(16)?,
                contact_count: row.get(17)?,
            })
        })?;

        etiquettes.collect()
    }

    /// Récupérer une étiquette par son ID
    pub fn get_etiquette_by_id(&self, id: i64) -> Result<Etiquette> {
        self.conn.query_row(
            "SELECT id, nom, couleur, icone, description, priorite,
                    auto_condition_type, auto_condition_config, auto_categories,
                    email_template_id, email_delai_jours, email_envoi_prevu, email_actif,
                    is_default, actif, created_at, updated_at
             FROM etiquettes 
             WHERE id = ?1",
            params![id],
            Self::map_etiquette_from_row,
        )
    }

    fn validate_etiquette_for_save(etiquette: &NewEtiquette) -> Result<()> {
        if etiquette.nom.trim().is_empty() {
            return Err(rusqlite::Error::InvalidParameterName(
                "Le nom de l'étiquette est obligatoire".to_string(),
            ));
        }
        let is_auto = etiquette.actif.unwrap_or(true)
            && etiquette
                .auto_condition_type
                .as_ref()
                .map(|t| !t.trim().is_empty())
                .unwrap_or(false);
        if is_auto {
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
        Ok(())
    }

    /// Créer une nouvelle étiquette
    pub fn create_etiquette(&self, etiquette: NewEtiquette) -> Result<Etiquette> {
        Self::validate_etiquette_for_save(&etiquette)?;
        if self.etiquette_nom_exists(&etiquette.nom, None)? {
            return Err(rusqlite::Error::InvalidParameterName(format!(
                "Une étiquette nommée « {} » existe déjà",
                etiquette.nom.trim()
            )));
        }

        let couleur = etiquette.couleur.unwrap_or_else(|| "#3B82F6".to_string());
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
                                    email_template_id, email_delai_jours, email_envoi_prevu, email_actif, is_default, actif) 
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14)",
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
                &etiquette.email_envoi_prevu,
                email_actif,
                is_default,
                actif,
            ],
        )?;

        let id = self.conn.last_insert_rowid();
        let created = self.get_etiquette_by_id(id)?;
        if let Some(date_prevue) = Self::resolve_email_date_prevue(&created) {
            self.sync_pending_email_dates_for_etiquette(id, Some(date_prevue))?;
        }
        Ok(created)
    }

    /// Mettre à jour une étiquette
    pub fn update_etiquette(&self, id: i64, etiquette: &NewEtiquette) -> Result<Etiquette> {
        Self::validate_etiquette_for_save(etiquette)?;
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
                email_actif = ?12,
                is_default = ?13,
                actif = ?14,
                updated_at = unixepoch()
            WHERE id = ?15",
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
                &etiquette.email_envoi_prevu,
                email_actif,
                is_default,
                actif,
                id
            ],
        )?;

        if actif == 0 {
            let _ = self.remove_auto_assignments_for_etiquette(id)?;
        }

        let updated = self.get_etiquette_by_id(id)?;
        let date_prevue = Self::resolve_email_date_prevue(&updated);
        self.sync_pending_email_dates_for_etiquette(id, date_prevue)?;
        Ok(updated)
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

    /// Attribuer une étiquette à un contact
    pub fn attribuer_etiquette(
        &self,
        contact_id: i64,
        etiquette_id: i64,
        attribue_par: Option<String>,
    ) -> Result<ContactEtiquette> {
        let attribue_par = attribue_par.unwrap_or_else(|| "MANUEL".to_string());

        let etiquette = self.get_etiquette_by_id(etiquette_id)?;
        let email_date_prevue = Self::resolve_email_date_prevue(&etiquette);

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
    pub fn retirer_etiquette(&self, contact_id: i64, etiquette_id: i64) -> Result<()> {
        self.conn.execute(
            "DELETE FROM contact_etiquettes WHERE contact_id = ?1 AND etiquette_id = ?2",
            params![contact_id, etiquette_id],
        )?;
        Ok(())
    }

    /// Récupérer tous les contacts ayant une étiquette spécifique
    pub fn get_contacts_by_etiquette(&self, etiquette_id: i64) -> Result<Vec<Contact>> {
        let mut stmt = self.conn.prepare(
            "SELECT c.id, c.famille_id, c.foyer_id, c.role_foyer, c.role_famille, c.categorie, c.filleul_categorie, c.parrain_id, c.prescripteur_id, c.civilite, c.nom, c.prenom, c.email, c.telephone,
                    c.adresse, c.code_postal, c.ville, c.date_naissance, c.profession, c.situation_familiale,
                    c.source_lead, c.profil_risque_sri, c.date_dernier_contact, c.date_prochain_suivi,
                    c.date_dernier_contact_filleul, c.date_prochain_suivi_filleul,
                    c.statut_suivi, c.notes, c.created_at, c.updated_at
             FROM contacts c
             INNER JOIN contact_etiquettes ce ON c.id = ce.contact_id
             WHERE ce.etiquette_id = ?1
             ORDER BY c.nom, c.prenom"
        )?;

        let contacts = stmt.query_map(params![etiquette_id], |row| {
            Ok(Contact {
                id: row.get(0)?,
                famille_id: row.get(1)?,
                foyer_id: row.get(2)?,
                role_foyer: row.get(3)?,
                role_famille: row.get(4)?,
                categorie: row.get(5)?,
                filleul_categorie: row.get(6)?,
                parrain_id: row.get(7)?,
                prescripteur_id: row.get(8)?,
                civilite: row.get(9)?,
                nom: row.get(10)?,
                prenom: row.get(11)?,
                email: row.get(12)?,
                telephone: row.get(13)?,
                adresse: row.get(14)?,
                code_postal: row.get(15)?,
                ville: row.get(16)?,
                date_naissance: row.get(17)?,
                profession: row.get(18)?,
                situation_familiale: row.get(19)?,
                source_lead: row.get(20)?,
                profil_risque_sri: row.get(21)?,
                date_dernier_contact: row.get(22)?,
                date_prochain_suivi: row.get(23)?,
                date_dernier_contact_filleul: row.get(24)?,
                date_prochain_suivi_filleul: row.get(25)?,
                statut_suivi: row.get(26)?,
                notes: row.get(27)?,
                created_at: row.get(28)?,
                updated_at: row.get(29)?,
            })
        })?;

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

        // Vérifier si des étiquettes existent déjà
        let count = self.count_etiquettes().unwrap_or(0);
        if count > 0 {
            return Ok(0); // Des étiquettes existent déjà, ne rien faire
        }

        let mut created = 0;

        // 1. Suivi > 1 an (rouge)
        self.create_etiquette(NewEtiquette {
            nom: "Suivi > 1 an".to_string(),
            couleur: Some("#EF4444".to_string()),
            icone: Some("🔴".to_string()),
            description: Some("Client non contacté depuis plus d'un an".to_string()),
            priorite: Some(100),
            auto_condition_type: Some("DELAI_SANS_CONTACT".to_string()),
            auto_condition_config: Some(r#"{"jours": 365}"#.to_string()),
            auto_categories: Some(r#"["CLIENT"]"#.to_string()),
            email_template_id: None,
            email_delai_jours: Some(0),
            email_envoi_prevu: None,
            email_actif: Some(false),
            is_default: Some(true),
            actif: None,
        })?;
        created += 1;

        // 2. Suivi à planifier (orange)
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
            email_actif: Some(false),
            is_default: Some(true),
            actif: None,
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
            email_actif: Some(false),
            is_default: Some(true),
            actif: None,
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
            email_actif: Some(false),
            is_default: Some(true),
            actif: None,
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
            email_actif: Some(false),
            is_default: Some(true),
            actif: None,
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
            email_actif: Some(false),
            is_default: Some(true),
            actif: None,
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
            email_actif: Some(false),
            is_default: Some(true),
            actif: None,
        })?;
        created += 1;

        // 9. Suivi > 6 mois (orange) - Pour les prospects non contactés depuis plus de 6 mois
        self.create_etiquette(NewEtiquette {
            nom: "Suivi > 6 mois".to_string(),
            couleur: Some("#F97316".to_string()),
            icone: Some("🟠".to_string()),
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
            email_actif: Some(false),
            is_default: Some(true),
            actif: None,
        })?;
        created += 1;

        Ok(created)
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
                "Client non contacté depuis plus d'un an",
                100,
                "DELAI_SANS_CONTACT",
                r#"{"jours": 365}"#,
                r#"["CLIENT"]"#,
            ),
            (
                "Suivi > 6 mois",
                "#F97316",
                "🟠",
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
                    "SELECT id, auto_condition_config FROM etiquettes WHERE nom = ?1",
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
                            email_actif: Some(false),
                            is_default: Some(true),
            actif: None,
                        })
                        .is_ok()
                    {
                        changes += 1;
                        println!("🏷️ Étiquette par défaut '{}' créée", nom);
                    }
                }
            }
        }

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

    /// File d'envoi manuel : ready | incomplete | sent
    pub fn get_etiquette_email_queue(
        &self,
        queue_status: &str,
    ) -> Result<Vec<EtiquetteEmailQueueItem>> {
        let now = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_secs() as i64;

        let sql = match queue_status {
            "ready" => {
                "SELECT ce.id, ce.contact_id, c.nom, c.prenom, c.email, c.telephone,
                        e.id, e.nom, e.couleur, ce.email_date_prevue, ce.email_date_envoi,
                        COALESCE(t.sujet, ''), COALESCE(t.corps, ''), NULL
                 FROM contact_etiquettes ce
                 INNER JOIN etiquettes e ON ce.etiquette_id = e.id
                 INNER JOIN contacts c ON ce.contact_id = c.id
                 LEFT JOIN templates_email t ON e.email_template_id = t.id
                 WHERE e.actif = 1 AND e.email_actif = 1
                   AND ce.email_envoye = 0
                   AND ce.email_date_prevue IS NOT NULL
                   AND ce.email_date_prevue <= ?1
                   AND e.email_template_id IS NOT NULL
                   AND c.email IS NOT NULL
                   AND TRIM(c.email) != ''
                 ORDER BY ce.email_date_prevue ASC, c.nom, c.prenom"
            }
            "incomplete" => {
                "SELECT ce.id, ce.contact_id, c.nom, c.prenom, c.email, c.telephone,
                        e.id, e.nom, e.couleur, ce.email_date_prevue, ce.email_date_envoi,
                        COALESCE(t.sujet, ''), COALESCE(t.corps, ''),
                        CASE
                          WHEN c.email IS NULL OR TRIM(c.email) = '' THEN 'NO_EMAIL'
                          WHEN e.email_template_id IS NULL THEN 'NO_TEMPLATE'
                          WHEN ce.email_date_prevue IS NULL THEN 'NO_DATE'
                          WHEN ce.email_date_prevue > ?1 THEN 'SCHEDULED'
                          ELSE 'OTHER'
                        END
                 FROM contact_etiquettes ce
                 INNER JOIN etiquettes e ON ce.etiquette_id = e.id
                 INNER JOIN contacts c ON ce.contact_id = c.id
                 LEFT JOIN templates_email t ON e.email_template_id = t.id
                 WHERE e.actif = 1 AND e.email_actif = 1
                   AND ce.email_envoye = 0
                   AND (
                     c.email IS NULL OR TRIM(c.email) = ''
                     OR e.email_template_id IS NULL
                     OR ce.email_date_prevue IS NULL
                     OR ce.email_date_prevue > ?1
                   )
                 ORDER BY ce.email_date_prevue ASC, c.nom, c.prenom"
            }
            "sent" => {
                "SELECT ce.id, ce.contact_id, c.nom, c.prenom, c.email, c.telephone,
                        e.id, e.nom, e.couleur, ce.email_date_prevue, ce.email_date_envoi,
                        COALESCE(t.sujet, ''), COALESCE(t.corps, ''), NULL
                 FROM contact_etiquettes ce
                 INNER JOIN etiquettes e ON ce.etiquette_id = e.id
                 INNER JOIN contacts c ON ce.contact_id = c.id
                 LEFT JOIN templates_email t ON e.email_template_id = t.id
                 WHERE e.actif = 1 AND e.email_actif = 1
                   AND ce.email_envoye = 1
                 ORDER BY ce.email_date_envoi DESC
                 LIMIT 100"
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
                queue_issue: row.get(13)?,
            })
        };

        if queue_status == "sent" {
            let mut stmt = self.conn.prepare(sql)?;
            let rows = stmt.query_map([], map_row)?;
            return rows.collect();
        }

        let mut stmt = self.conn.prepare(sql)?;
        let rows = stmt.query_map(params![now], map_row)?;
        rows.collect()
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

    /// Marquer un email d'étiquette comme envoyé
    pub fn mark_etiquette_email_sent(&self, contact_etiquette_id: i64) -> Result<()> {
        let now = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_secs() as i64;

        let updated = self.conn.execute(
            "UPDATE contact_etiquettes SET email_envoye = 1, email_date_envoi = ?1 WHERE id = ?2",
            params![now, contact_etiquette_id],
        )?;
        if updated == 0 {
            return Err(rusqlite::Error::InvalidParameterName(format!(
                "contact_etiquette introuvable: {}",
                contact_etiquette_id
            )));
        }
        Ok(())
    }

    // ==================== SETTINGS ====================

    /// Récupérer une valeur de configuration
    pub fn get_setting(&self, key: &str) -> Result<Option<String>> {
        let mut stmt = self
            .conn
            .prepare("SELECT value FROM settings WHERE key = ?1")?;

        let result = stmt.query_row(params![key], |row| row.get::<_, String>(0));

        match result {
            Ok(value) => Ok(Some(value)),
            Err(rusqlite::Error::QueryReturnedNoRows) => Ok(None),
            Err(e) => Err(e),
        }
    }

    /// Définir une valeur de configuration
    pub fn set_setting(&self, key: &str, value: &str) -> Result<()> {
        let now = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_secs() as i64;

        self.conn.execute(
            "INSERT INTO settings (key, value, updated_at) 
             VALUES (?1, ?2, ?3)
             ON CONFLICT(key) DO UPDATE SET value = ?2, updated_at = ?3",
            params![key, value, now],
        )?;
        Ok(())
    }

    /// Supprimer une valeur de configuration
    pub fn delete_setting(&self, key: &str) -> Result<()> {
        self.conn
            .execute("DELETE FROM settings WHERE key = ?1", params![key])?;
        Ok(())
    }

    /// Récupérer toutes les configurations
    pub fn get_all_settings(&self) -> Result<Vec<super::models::Setting>> {
        let mut stmt = self
            .conn
            .prepare("SELECT key, value, updated_at FROM settings ORDER BY key")?;

        let settings = stmt.query_map([], |row| {
            Ok(super::models::Setting {
                key: row.get(0)?,
                value: row.get(1)?,
                updated_at: row.get(2)?,
            })
        })?;

        settings.collect()
    }

    /// Récupérer la configuration CGP (JSON sérialisé)
    pub fn get_cgp_config(&self) -> Result<super::models::CgpConfig> {
        match self.get_setting("cgp_config")? {
            Some(json_str) => serde_json::from_str(&json_str).map_err(|e| {
                rusqlite::Error::InvalidParameterName(format!("JSON parse error: {}", e))
            }),
            None => Ok(super::models::CgpConfig::default()),
        }
    }

    /// Sauvegarder la configuration CGP
    pub fn save_cgp_config(&self, config: &super::models::CgpConfig) -> Result<()> {
        let json_str = serde_json::to_string(config).map_err(|e| {
            rusqlite::Error::InvalidParameterName(format!("JSON serialize error: {}", e))
        })?;
        self.set_setting("cgp_config", &json_str)
    }

    /// Vérifier si le wizard est complété
    pub fn is_wizard_completed(&self) -> Result<bool> {
        match self.get_cgp_config() {
            Ok(config) => Ok(config.wizard_completed),
            Err(_) => Ok(false),
        }
    }

    /// Marquer le wizard comme complété
    pub fn complete_wizard(&self) -> Result<()> {
        let mut config = self.get_cgp_config()?;
        config.wizard_completed = true;
        config.wizard_step = 4;
        self.save_cgp_config(&config)
    }

    /// Mettre à jour l'étape courante du wizard
    pub fn update_wizard_step(&self, step: i64) -> Result<()> {
        let mut config = self.get_cgp_config()?;
        config.wizard_step = step;
        self.save_cgp_config(&config)
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
}

#[cfg(test)]
mod database_integration_tests {
    use super::*;
    use crate::database::models::{NewContact, NewFoyer, NewInvestissement};
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
        }
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

        let alertes = db.get_alertes_with_contacts(10).unwrap();
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
    fn etiquette_email_queue_ready_incomplete_sent() {
        use crate::database::models::{NewEtiquette, NewTemplateEmail};

        fn sample_etiquette(
            nom: &str,
            template_id: Option<i64>,
            envoi_prevu: Option<i64>,
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
                email_actif: Some(true),
                is_default: Some(false),
            actif: None,
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
            })
            .unwrap();

        let etiqu = db
            .create_etiquette(sample_etiquette(
                "Campagne test",
                Some(tpl.id),
                Some(now + 86_400),
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

        db.attribuer_etiquette(cid, etiqu.id, Some("MANUEL".into()))
            .unwrap();

        assert!(db.get_etiquette_email_queue("ready").unwrap().is_empty());
        let scheduled = db.get_etiquette_email_queue("incomplete").unwrap();
        assert_eq!(scheduled.len(), 1);
        assert_eq!(scheduled[0].queue_issue.as_deref(), Some("SCHEDULED"));

        db.update_etiquette(
            etiqu.id,
            &sample_etiquette("Campagne test", Some(tpl.id), Some(now - 120)),
        )
        .unwrap();

        let ready = db.get_etiquette_email_queue("ready").unwrap();
        assert_eq!(ready.len(), 1);
        assert_eq!(ready[0].contact_telephone.as_deref(), Some("0601020304"));

        let ce_id = ready[0].contact_etiquette_id;
        db.mark_etiquette_email_sent(ce_id).unwrap();
        assert!(db.get_etiquette_email_queue("ready").unwrap().is_empty());
        assert_eq!(db.get_etiquette_email_queue("sent").unwrap().len(), 1);
        assert!(db.mark_etiquette_email_sent(999_999).is_err());

        let no_email = db
            .create_contact(NewContact {
                email: None,
                ..sample_contact("Sans", "Mail")
            })
            .unwrap();
        db.attribuer_etiquette(no_email.id.unwrap(), etiqu.id, Some("MANUEL".into()))
            .unwrap();
        let incomplete = db.get_etiquette_email_queue("incomplete").unwrap();
        assert!(
            incomplete
                .iter()
                .any(|i| i.queue_issue.as_deref() == Some("NO_EMAIL"))
        );
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
                email_actif: Some(false),
                is_default: Some(false),
            actif: None,
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
                email_actif: Some(false),
                is_default: Some(false),
            actif: None,
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
            email_actif: Some(false),
            is_default: Some(false),
            actif: None,
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
                email_actif: Some(false),
                is_default: Some(false),
                actif: Some(true),
            })
            .unwrap();

        db.attribuer_etiquette(cid, etiqu.id, Some("AUTO".into()))
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
                email_actif: Some(etiqu.email_actif),
                is_default: Some(etiqu.is_default),
                actif: Some(false),
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
                email_actif: Some(false),
                is_default: Some(false),
            actif: None,
            })
            .unwrap_err();
        assert!(
            err.to_string().contains("catégorie"),
            "unexpected: {}",
            err
        );
    }
}
