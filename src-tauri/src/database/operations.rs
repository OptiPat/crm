use rusqlite::{params, Result};
use super::{Database, models::{Contact, NewContact, Famille, NewFamille, Etiquette, NewEtiquette, ContactEtiquette, NewContactEtiquette, EtiquetteWithCount, ContactEtiquetteDetails}};

impl Database {
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
        
        let statut = new_contact.statut_suivi.unwrap_or("ACTIF".to_string());
        
        // Convertir les dates ISO string en timestamps Unix - CLIENTS
        let date_dernier_contact_timestamp = new_contact.date_dernier_contact.and_then(|date_str| {
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
        let date_dernier_contact_filleul_timestamp = new_contact.date_dernier_contact_filleul.and_then(|date_str| {
            DateTime::parse_from_rfc3339(&date_str)
                .ok()
                .map(|dt| dt.timestamp())
        });
        
        let date_prochain_suivi_filleul_timestamp = new_contact.date_prochain_suivi_filleul.and_then(|date_str| {
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
        let foyer_id: Option<i64> = self.conn.query_row(
            "SELECT foyer_id FROM contacts WHERE id = ?1",
            params![id],
            |row| row.get(0)
        ).ok();
        
        // 2. Supprimer les investissements liés directement au contact
        self.conn.execute("DELETE FROM investissements WHERE contact_id = ?1", params![id])?;
        
        // 3. 🔥 Nettoyer les références prescripteur_id (mettre à NULL)
        self.conn.execute("UPDATE contacts SET prescripteur_id = NULL WHERE prescripteur_id = ?1", params![id])?;
        
        // 4. 🔥 Nettoyer les références parrain_id (mettre à NULL)
        self.conn.execute("UPDATE contacts SET parrain_id = NULL WHERE parrain_id = ?1", params![id])?;
        
        // 5. Supprimer le contact
        self.conn.execute("DELETE FROM contacts WHERE id = ?1", params![id])?;
        
        // 6. Si le contact avait un foyer, vérifier s'il reste des membres
        if let Some(fid) = foyer_id {
            let remaining_members: i64 = self.conn.query_row(
                "SELECT COUNT(*) FROM contacts WHERE foyer_id = ?1",
                params![fid],
                |row| row.get(0)
            ).unwrap_or(0);
            
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
            []
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
        
        // Convertir les dates ISO string en timestamps Unix - CLIENTS
        let date_dernier_contact_timestamp = contact.date_dernier_contact.as_ref().and_then(|date_str| {
            DateTime::parse_from_rfc3339(date_str)
                .ok()
                .map(|dt| dt.timestamp())
        });
        
        let date_prochain_suivi_timestamp = contact.date_prochain_suivi.as_ref().and_then(|date_str| {
            DateTime::parse_from_rfc3339(date_str)
                .ok()
                .map(|dt| dt.timestamp())
        });
        
        // Convertir les dates ISO string en timestamps Unix - FILLEULS
        let date_dernier_contact_filleul_timestamp = contact.date_dernier_contact_filleul.as_ref().and_then(|date_str| {
            DateTime::parse_from_rfc3339(date_str)
                .ok()
                .map(|dt| dt.timestamp())
        });
        
        let date_prochain_suivi_filleul_timestamp = contact.date_prochain_suivi_filleul.as_ref().and_then(|date_str| {
            DateTime::parse_from_rfc3339(date_str)
                .ok()
                .map(|dt| dt.timestamp())
        });
        
        // 🔥 statut_suivi est NOT NULL, donc on met une valeur par défaut
        let statut_suivi = contact.statut_suivi.clone().unwrap_or_else(|| "ACTIF".to_string());
        
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
                nom = ?7,
                prenom = ?8,
                email = ?9,
                telephone = ?10,
                adresse = ?11,
                code_postal = ?12,
                ville = ?13,
                date_naissance = ?14,
                profession = ?15,
                source_lead = ?16,
                profil_risque_sri = ?17,
                date_dernier_contact = ?18,
                date_prochain_suivi = ?19,
                date_dernier_contact_filleul = ?20,
                date_prochain_suivi_filleul = ?21,
                statut_suivi = ?22,
                notes = ?23,
                role_foyer = ?24,
                role_famille = ?25,
                updated_at = unixepoch()
            WHERE id = ?26",
            params![
                &contact.famille_id,
                &contact.foyer_id,
                &contact.categorie,
                &contact.filleul_categorie,
                &contact.parrain_id,
                &contact.prescripteur_id,
                &contact.nom,
                &contact.prenom,
                &contact.email,
                &contact.telephone,
                &contact.adresse,
                &contact.code_postal,
                &contact.ville,
                date_naissance_timestamp,
                &contact.profession,
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
        let mut stmt = self.conn.prepare(
            "SELECT id, nom, notes, created_at, updated_at FROM familles ORDER BY nom"
        )?;

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
        self.conn.execute("DELETE FROM familles WHERE id = ?1", params![id])?;
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
             ORDER BY nom"
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

    pub fn update_foyer(&self, id: i64, foyer: &super::models::NewFoyer) -> Result<super::models::Foyer> {
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
        self.conn.execute("DELETE FROM investissements WHERE foyer_id = ?1", params![id])?;
        
        // Puis supprimer le foyer
        self.conn.execute("DELETE FROM foyers WHERE id = ?1", params![id])?;
        Ok(())
    }

    // ========== PARTENAIRES ==========

    pub fn get_all_partenaires(&self) -> Result<Vec<super::models::Partenaire>> {
        let mut stmt = self.conn.prepare(
            "SELECT id, type_partenaire, raison_sociale, nom_contact, prenom_contact,
                    email, telephone, adresse, code_postal, ville, specialite, zone_geo,
                    niveau_collaboration, notes, created_at, updated_at
             FROM partenaires 
             ORDER BY raison_sociale"
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

    pub fn create_partenaire(&self, partenaire: super::models::NewPartenaire) -> Result<super::models::Partenaire> {
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

    pub fn update_partenaire(&self, id: i64, partenaire: &super::models::NewPartenaire) -> Result<super::models::Partenaire> {
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
        self.conn.execute("DELETE FROM partenaires WHERE id = ?1", params![id])?;
        Ok(())
    }

    // ========== DOCUMENTS ==========

    pub fn get_all_documents(&self) -> Result<Vec<super::models::Document>> {
        let mut stmt = self.conn.prepare(
            "SELECT id, contact_id, foyer_id, type_document, nom_fichier, chemin_fichier,
                    taille_fichier, mime_type, date_document, notes, created_at, updated_at
             FROM documents 
             ORDER BY created_at DESC"
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

    pub fn create_document(&self, document: super::models::NewDocument) -> Result<super::models::Document> {
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

    pub fn update_document(&self, id: i64, document: &super::models::NewDocument) -> Result<super::models::Document> {
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
        self.conn.execute("DELETE FROM documents WHERE id = ?1", params![id])?;
        Ok(())
    }

    // ========== TEMPLATES EMAIL ==========

    pub fn get_all_templates_email(&self) -> Result<Vec<super::models::TemplateEmail>> {
        let mut stmt = self.conn.prepare(
            "SELECT id, nom, sujet, corps, categorie, variables, created_at, updated_at
             FROM templates_email 
             ORDER BY created_at DESC"
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

    pub fn create_template_email(&self, template: super::models::NewTemplateEmail) -> Result<super::models::TemplateEmail> {
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

    pub fn update_template_email(&self, id: i64, template: &super::models::NewTemplateEmail) -> Result<super::models::TemplateEmail> {
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
        self.conn.execute("DELETE FROM templates_email WHERE id = ?1", params![id])?;
        Ok(())
    }

    // ========== ALERTES ==========

    pub fn get_all_alertes(&self) -> Result<Vec<super::models::Alerte>> {
        let mut stmt = self.conn.prepare(
            "SELECT id, contact_id, type_alerte, message, date_alerte, lue, traitee, created_at
             FROM alertes 
             ORDER BY date_alerte DESC, created_at DESC"
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
             ORDER BY date_alerte DESC, created_at DESC"
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
        self.conn.execute("UPDATE alertes SET lue = 1 WHERE id = ?1", params![id])?;
        Ok(())
    }

    pub fn marquer_alerte_traitee(&self, id: i64) -> Result<()> {
        self.conn.execute("UPDATE alertes SET traitee = 1, lue = 1 WHERE id = ?1", params![id])?;
        Ok(())
    }

    pub fn delete_alerte(&self, id: i64) -> Result<()> {
        self.conn.execute("DELETE FROM alertes WHERE id = ?1", params![id])?;
        Ok(())
    }

    // Génération automatique des alertes
    pub fn generer_alertes_automatiques(&self) -> Result<usize> {
        let now = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_secs() as i64;

        let contacts = self.get_all_contacts()?;
        let mut count = 0;

        for contact in contacts {
            // Vérifier si une alerte existe déjà pour ce contact
            let existing_alerte: Result<i64> = self.conn.query_row(
                "SELECT COUNT(*) FROM alertes WHERE contact_id = ?1 AND traitee = 0",
                params![contact.id],
                |row| row.get(0),
            );

            if existing_alerte.unwrap_or(0) > 0 {
                continue; // Alerte déjà existante
            }

            let date_dernier_contact = contact.date_dernier_contact;

            // ========== CLIENTS ==========
            if contact.categorie == "CLIENT" {
                if let Some(last_contact) = date_dernier_contact {
                    let diff_seconds = now - last_contact;
                    let diff_months = diff_seconds / (30 * 24 * 60 * 60);
                    
                    // 🔴 Suivi +1 an : Client non contacté depuis plus de 12 mois
                    if diff_months > 12 {
                        self.create_alerte(super::models::NewAlerte {
                            contact_id: contact.id.unwrap(),
                            type_alerte: "SUIVI_CLIENT_1AN".to_string(),
                            message: format!("🔴 {} {} - Suivi +1 an", contact.prenom, contact.nom),
                            date_alerte: Some(now),
                        })?;
                        count += 1;
                    }
                } else {
                    // 🔴 Jamais suivi : Client sans historique de contact
                    self.create_alerte(super::models::NewAlerte {
                        contact_id: contact.id.unwrap(),
                        type_alerte: "CLIENT_JAMAIS_SUIVI".to_string(),
                        message: format!("🔴 {} {} - Jamais suivi", contact.prenom, contact.nom),
                        date_alerte: Some(now),
                    })?;
                    count += 1;
                }
            }

            // ========== PROSPECTS & SUSPECTS ==========
            if contact.categorie.contains("SUSPECT") || contact.categorie.contains("PROSPECT") {
                if let Some(last_contact) = date_dernier_contact {
                    let diff_seconds = now - last_contact;
                    let diff_months = diff_seconds / (30 * 24 * 60 * 60);
                    
                    // 🟠 Suivi +6 mois : Lead non contacté depuis plus de 6 mois
                    if diff_months > 6 {
                        self.create_alerte(super::models::NewAlerte {
                            contact_id: contact.id.unwrap(),
                            type_alerte: "LEAD_SUIVI_6MOIS".to_string(),
                            message: format!("🟠 {} {} - Suivi +6 mois", contact.prenom, contact.nom),
                            date_alerte: Some(now),
                        })?;
                        count += 1;
                    }
                } else {
                    // 🟠 Jamais contacté : Lead qui n'a jamais été contacté
                    self.create_alerte(super::models::NewAlerte {
                        contact_id: contact.id.unwrap(),
                        type_alerte: "LEAD_JAMAIS_CONTACTE".to_string(),
                        message: format!("🟠 {} {} - Jamais contacté", contact.prenom, contact.nom),
                        date_alerte: Some(now),
                    })?;
                    count += 1;
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
        let alertes_non_traitees: i64 = self.conn.query_row(
            "SELECT COUNT(*) FROM alertes WHERE traitee = 0",
            [],
            |row| row.get(0),
        ).unwrap_or(0);

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
            "SELECT COUNT(*) FROM contacts WHERE categorie = 'PROSPECT_FILLEUL'",
            [],
            |row| row.get(0),
        )?;

        let suspect_client: i64 = self.conn.query_row(
            "SELECT COUNT(*) FROM contacts WHERE categorie = 'SUSPECT_CLIENT'",
            [],
            |row| row.get(0),
        )?;

        let suspect_filleul: i64 = self.conn.query_row(
            "SELECT COUNT(*) FROM contacts WHERE categorie = 'SUSPECT_FILLEUL'",
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
            let count: i64 = self.conn.query_row(
                "SELECT COUNT(*) FROM contacts WHERE created_at >= ?1 AND created_at < ?2",
                params![month_start, month_end],
                |row| row.get(0),
            ).unwrap_or(0);
            
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
        use std::time::{UNIX_EPOCH, Duration};
        
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
             ORDER BY total DESC"
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
        // Compter les suspects (SUSPECT_CLIENT + SUSPECT_FILLEUL)
        let suspects: i64 = self.conn.query_row(
            "SELECT COUNT(*) FROM contacts WHERE categorie LIKE 'SUSPECT%'",
            [],
            |row| row.get(0),
        )?;

        // Compter les prospects (PROSPECT_CLIENT + PROSPECT_FILLEUL)
        let prospects: i64 = self.conn.query_row(
            "SELECT COUNT(*) FROM contacts WHERE categorie LIKE 'PROSPECT%'",
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

    pub fn get_alertes_with_contacts(&self, limit: i64) -> Result<Vec<super::models::AlerteWithContact>> {
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
            "SELECT a.id, a.contact_id, c.nom, c.prenom, c.categorie, c.date_dernier_contact,
                    a.type_alerte, a.titre, a.date_echeance, a.statut
             FROM alertes a
             INNER JOIN contacts c ON a.contact_id = c.id
             WHERE a.statut != 'TRAITE'
             ORDER BY a.date_echeance ASC
             LIMIT ?1"
        )?;

        let alertes = stmt.query_map(params![limit], |row| {
            Ok(super::models::AlerteWithContact {
                alerte_id: row.get(0)?,
                contact_id: row.get(1)?,
                contact_nom: row.get(2)?,
                contact_prenom: row.get(3)?,
                contact_categorie: row.get(4)?,
                date_dernier_contact: row.get(5)?,
                type_alerte: row.get(6)?,
                message: row.get(7)?,
                date_alerte: row.get(8)?,
                statut: row.get(9)?,
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
             ORDER BY date_souscription DESC"
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
                origine: row.get::<_, String>(15).unwrap_or_else(|_| "MON_CONSEIL".to_string()),
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

    pub fn get_investissements_by_contact(&self, contact_id: i64) -> Result<Vec<super::models::Investissement>> {
        let mut stmt = self.conn.prepare(
            "SELECT id, contact_id, foyer_id, type_produit, partenaire_id, nom_produit,
                    montant_initial, date_souscription, date_fin_demembrement, date_fin_pret,
                    versement_programme, montant_versement_programme, frequence_versement,
                    reinvestissement_dividendes, notes, origine, created_at, updated_at
             FROM investissements 
             WHERE contact_id = ?1
             ORDER BY date_souscription DESC"
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
                origine: row.get::<_, String>(15).unwrap_or_else(|_| "MON_CONSEIL".to_string()),
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

    pub fn get_investissements_by_foyer(&self, foyer_id: i64) -> Result<Vec<super::models::Investissement>> {
        let mut stmt = self.conn.prepare(
            "SELECT id, contact_id, foyer_id, type_produit, partenaire_id, nom_produit,
                    montant_initial, date_souscription, date_fin_demembrement, date_fin_pret,
                    versement_programme, montant_versement_programme, frequence_versement,
                    reinvestissement_dividendes, notes, origine, created_at, updated_at
             FROM investissements 
             WHERE foyer_id = ?1
             ORDER BY date_souscription DESC"
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
                origine: row.get::<_, String>(15).unwrap_or_else(|_| "MON_CONSEIL".to_string()),
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

    pub fn get_investissements_with_details(&self) -> Result<Vec<super::models::InvestissementWithDetails>> {
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
                origine: row.get::<_, String>(19).unwrap_or_else(|_| "MON_CONSEIL".to_string()),
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

    pub fn create_investissement(&self, investissement: super::models::NewInvestissement) -> Result<super::models::Investissement> {
        use chrono::{DateTime, Utc};
        
        let versement_programme = if investissement.versement_programme.unwrap_or(false) { 1 } else { 0 };
        let reinvestissement_dividendes = if investissement.reinvestissement_dividendes.unwrap_or(false) { 1 } else { 0 };

        // Convertir les dates ISO string en timestamps Unix
        let date_souscription_timestamp = investissement.date_souscription.and_then(|date_str| {
            DateTime::parse_from_rfc3339(&date_str)
                .ok()
                .map(|dt| dt.timestamp())
        });
        
        let date_fin_demembrement_timestamp = investissement.date_fin_demembrement.and_then(|date_str| {
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
        let origine = investissement.origine.unwrap_or_else(|| "MON_CONSEIL".to_string());

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
                    origine: row.get::<_, String>(15).unwrap_or_else(|_| "MON_CONSEIL".to_string()),
                    created_at: row.get(16)?,
                    updated_at: row.get(17)?,
                })
            },
        )
    }

    pub fn update_investissement(&self, id: i64, investissement: &super::models::NewInvestissement) -> Result<super::models::Investissement> {
        use chrono::{DateTime, Utc};
        
        let versement_programme = if investissement.versement_programme.unwrap_or(false) { 1 } else { 0 };
        let reinvestissement_dividendes = if investissement.reinvestissement_dividendes.unwrap_or(false) { 1 } else { 0 };

        // Convertir les dates ISO string en timestamps Unix
        let date_souscription_timestamp = investissement.date_souscription.as_ref().and_then(|date_str| {
            DateTime::parse_from_rfc3339(date_str)
                .ok()
                .map(|dt| dt.timestamp())
        });
        
        let date_fin_demembrement_timestamp = investissement.date_fin_demembrement.as_ref().and_then(|date_str| {
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
        self.conn.execute("DELETE FROM investissements WHERE id = ?1", params![id])?;
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
            "SELECT id, contact_id, nom_produit, date_fin_demembrement
             FROM investissements
             WHERE type_produit = 'SCPI_DEMEMBREMENT'
               AND date_fin_demembrement IS NOT NULL
               AND date_fin_demembrement > ?1
               AND date_fin_demembrement <= ?2"
        )?;

        let investissements = stmt.query_map(params![now, six_months_later], |row| {
            Ok((
                row.get::<_, i64>(0)?,  // id
                row.get::<_, i64>(1)?,  // contact_id
                row.get::<_, String>(2)?,  // nom_produit
                row.get::<_, i64>(3)?,  // date_fin_demembrement
            ))
        })?;

        let mut created_alerts = Vec::new();

        for inv_result in investissements {
            let (_inv_id, contact_id, nom_produit, date_fin) = inv_result?;

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
                    nom_produit,
                    date_fin_formatted
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

    // Rechercher un contact par nom et prénom
    pub fn find_contact_by_name(&self, nom: &str, prenom: &str) -> Result<Option<Contact>> {
        match self.conn.query_row(
            "SELECT id, famille_id, foyer_id, role_foyer, role_famille, categorie, filleul_categorie, parrain_id, prescripteur_id, civilite, nom, prenom, email, telephone,
                    adresse, code_postal, ville, date_naissance, profession, situation_familiale,
                    source_lead, profil_risque_sri, date_dernier_contact, date_prochain_suivi,
                    date_dernier_contact_filleul, date_prochain_suivi_filleul,
                    statut_suivi, notes, created_at, updated_at
             FROM contacts 
             WHERE LOWER(nom) = LOWER(?1) AND LOWER(prenom) = LOWER(?2)
             LIMIT 1",
            params![nom, prenom],
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

    /// Récupérer toutes les étiquettes
    pub fn get_all_etiquettes(&self) -> Result<Vec<Etiquette>> {
        let mut stmt = self.conn.prepare(
            "SELECT id, nom, couleur, icone, description, priorite,
                    auto_condition_type, auto_condition_config, auto_categories,
                    email_template_id, email_delai_jours, email_actif,
                    is_default, created_at, updated_at
             FROM etiquettes 
             ORDER BY priorite DESC, nom ASC"
        )?;

        let etiquettes = stmt.query_map([], |row| {
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
                email_actif: row.get::<_, i64>(11)? != 0,
                is_default: row.get::<_, i64>(12)? != 0,
                created_at: row.get(13)?,
                updated_at: row.get(14)?,
            })
        })?;

        etiquettes.collect()
    }

    /// Récupérer toutes les étiquettes avec le compteur de contacts
    pub fn get_all_etiquettes_with_count(&self) -> Result<Vec<EtiquetteWithCount>> {
        let mut stmt = self.conn.prepare(
            "SELECT e.id, e.nom, e.couleur, e.icone, e.description, e.priorite,
                    e.auto_condition_type, e.auto_condition_config, e.auto_categories,
                    e.email_template_id, e.email_delai_jours, e.email_actif,
                    e.is_default, e.created_at, e.updated_at,
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
                email_actif: row.get::<_, i64>(11)? != 0,
                is_default: row.get::<_, i64>(12)? != 0,
                created_at: row.get(13)?,
                updated_at: row.get(14)?,
                contact_count: row.get(15)?,
            })
        })?;

        etiquettes.collect()
    }

    /// Récupérer une étiquette par son ID
    pub fn get_etiquette_by_id(&self, id: i64) -> Result<Etiquette> {
        self.conn.query_row(
            "SELECT id, nom, couleur, icone, description, priorite,
                    auto_condition_type, auto_condition_config, auto_categories,
                    email_template_id, email_delai_jours, email_actif,
                    is_default, created_at, updated_at
             FROM etiquettes 
             WHERE id = ?1",
            params![id],
            |row| {
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
                    email_actif: row.get::<_, i64>(11)? != 0,
                    is_default: row.get::<_, i64>(12)? != 0,
                    created_at: row.get(13)?,
                    updated_at: row.get(14)?,
                })
            },
        )
    }

    /// Créer une nouvelle étiquette
    pub fn create_etiquette(&self, etiquette: NewEtiquette) -> Result<Etiquette> {
        let couleur = etiquette.couleur.unwrap_or_else(|| "#3B82F6".to_string());
        let priorite = etiquette.priorite.unwrap_or(0);
        let email_delai_jours = etiquette.email_delai_jours.unwrap_or(0);
        let email_actif = if etiquette.email_actif.unwrap_or(false) { 1 } else { 0 };
        let is_default = if etiquette.is_default.unwrap_or(false) { 1 } else { 0 };

        self.conn.execute(
            "INSERT INTO etiquettes (nom, couleur, icone, description, priorite,
                                    auto_condition_type, auto_condition_config, auto_categories,
                                    email_template_id, email_delai_jours, email_actif, is_default) 
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12)",
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
                email_actif,
                is_default,
            ],
        )?;

        let id = self.conn.last_insert_rowid();
        self.get_etiquette_by_id(id)
    }

    /// Mettre à jour une étiquette
    pub fn update_etiquette(&self, id: i64, etiquette: &NewEtiquette) -> Result<Etiquette> {
        let couleur = etiquette.couleur.clone().unwrap_or_else(|| "#3B82F6".to_string());
        let priorite = etiquette.priorite.unwrap_or(0);
        let email_delai_jours = etiquette.email_delai_jours.unwrap_or(0);
        let email_actif = if etiquette.email_actif.unwrap_or(false) { 1 } else { 0 };
        let is_default = if etiquette.is_default.unwrap_or(false) { 1 } else { 0 };

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
                email_actif = ?11,
                is_default = ?12,
                updated_at = unixepoch()
            WHERE id = ?13",
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
                email_actif,
                is_default,
                id
            ],
        )?;

        self.get_etiquette_by_id(id)
    }

    /// Supprimer une étiquette
    pub fn delete_etiquette(&self, id: i64) -> Result<()> {
        // Les liaisons contact_etiquettes seront supprimées par CASCADE
        self.conn.execute("DELETE FROM etiquettes WHERE id = ?1", params![id])?;
        Ok(())
    }

    /// Récupérer les étiquettes d'un contact
    pub fn get_etiquettes_by_contact(&self, contact_id: i64) -> Result<Vec<ContactEtiquetteDetails>> {
        let mut stmt = self.conn.prepare(
            "SELECT ce.id, ce.contact_id, ce.etiquette_id, 
                    e.nom, e.couleur, e.icone,
                    ce.date_attribution, ce.attribue_par, ce.email_envoye,
                    ce.email_date_prevue, ce.notes
             FROM contact_etiquettes ce
             INNER JOIN etiquettes e ON ce.etiquette_id = e.id
             WHERE ce.contact_id = ?1
             ORDER BY e.priorite DESC, e.nom ASC"
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

    /// Attribuer une étiquette à un contact
    pub fn attribuer_etiquette(&self, contact_id: i64, etiquette_id: i64, attribue_par: Option<String>) -> Result<ContactEtiquette> {
        let attribue_par = attribue_par.unwrap_or_else(|| "MANUEL".to_string());
        
        // Vérifier si l'étiquette a un email actif pour calculer la date prévue
        let etiquette = self.get_etiquette_by_id(etiquette_id)?;
        let email_date_prevue: Option<i64> = if etiquette.email_actif && etiquette.email_delai_jours > 0 {
            let now = std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_secs() as i64;
            Some(now + (etiquette.email_delai_jours * 24 * 60 * 60))
        } else {
            None
        };

        self.conn.execute(
            "INSERT INTO contact_etiquettes (contact_id, etiquette_id, attribue_par, email_date_prevue) 
             VALUES (?1, ?2, ?3, ?4)
             ON CONFLICT(contact_id, etiquette_id) DO UPDATE SET
                attribue_par = excluded.attribue_par,
                date_attribution = unixepoch()",
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
        self.conn.query_row(
            "SELECT COUNT(*) FROM etiquettes",
            [],
            |row| row.get(0),
        )
    }

    /// Créer les étiquettes par défaut (seed initial)
    pub fn seed_default_etiquettes(&self) -> Result<usize> {
        // Vérifier si la table existe
        let table_exists: i64 = self.conn.query_row(
            "SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name='etiquettes'",
            [],
            |row| row.get(0),
        ).unwrap_or(0);

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
            email_actif: Some(false),
            is_default: Some(true),
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
            auto_condition_config: Some(r#"{"champ": "date_prochain_suivi", "jours_avant": 30}"#.to_string()),
            auto_categories: Some(r#"["CLIENT", "PROSPECT_CLIENT"]"#.to_string()),
            email_template_id: None,
            email_delai_jours: Some(0),
            email_actif: Some(false),
            is_default: Some(true),
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
            email_actif: Some(false),
            is_default: Some(true),
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
            email_actif: Some(false),
            is_default: Some(true),
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
            email_actif: Some(false),
            is_default: Some(true),
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
            email_actif: Some(false),
            is_default: Some(true),
        })?;
        created += 1;

        // 8. RDV fin d'année (vert)
        self.create_etiquette(NewEtiquette {
            nom: "RDV fin d'année".to_string(),
            couleur: Some("#10B981".to_string()),
            icone: Some("🎯".to_string()),
            description: Some("Période de souscription fin d'année (oct-nov)".to_string()),
            priorite: Some(60),
            auto_condition_type: Some("PERIODE_ANNEE".to_string()),
            auto_condition_config: Some(r#"{"mois_debut": 10, "mois_fin": 11}"#.to_string()),
            auto_categories: Some(r#"["CLIENT", "PROSPECT_CLIENT"]"#.to_string()),
            email_template_id: None,
            email_delai_jours: Some(0),
            email_actif: Some(false),
            is_default: Some(true),
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
            auto_categories: Some(r#"["PROSPECT_CLIENT", "PROSPECT_FILLEUL", "SUSPECT_CLIENT", "SUSPECT_FILLEUL"]"#.to_string()),
            email_template_id: None,
            email_delai_jours: Some(0),
            email_actif: Some(false),
            is_default: Some(true),
        })?;
        created += 1;

        Ok(created)
    }

    /// Vérifie et crée les étiquettes par défaut manquantes (migration pour bases existantes)
    /// Retourne le nombre d'étiquettes créées
    pub fn ensure_default_etiquettes(&self) -> Result<usize> {
        // Vérifier si la table existe
        let table_exists: i64 = self.conn.query_row(
            "SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name='etiquettes'",
            [],
            |row| row.get(0),
        ).unwrap_or(0);

        if table_exists == 0 {
            return Ok(0);
        }

        let mut created = 0;

        // Liste des étiquettes par défaut à vérifier/créer
        let default_etiquettes = vec![
            ("Suivi > 1 an", "#EF4444", "🔴", "Client non contacté depuis plus d'un an", 100, "DELAI_SANS_CONTACT", r#"{"jours": 365}"#, r#"["CLIENT"]"#),
            ("Suivi > 6 mois", "#F97316", "🟠", "Prospect/Suspect non contacté depuis plus de 6 mois", 95, "DELAI_SANS_CONTACT", r#"{"jours": 180}"#, r#"["PROSPECT_CLIENT", "PROSPECT_FILLEUL", "SUSPECT_CLIENT", "SUSPECT_FILLEUL"]"#),
            ("Suivi à planifier", "#F97316", "📅", "Date de prochain suivi dans moins de 30 jours", 90, "DATE_APPROCHE", r#"{"champ": "date_prochain_suivi", "jours_avant": 30}"#, r#"["CLIENT", "PROSPECT_CLIENT"]"#),
            ("Fin démembrement", "#3B82F6", "🏠", "Fin de démembrement dans moins de 6 mois", 85, "DATE_APPROCHE_INVESTISSEMENT", r#"{"champ": "date_fin_demembrement", "jours_avant": 180, "types_produit": ["SCPI_DEMEMBREMENT"]}"#, r#"["CLIENT"]"#),
            ("Fin de prêt", "#06B6D4", "💰", "Fin de prêt immobilier/SCPI dans moins d'un an", 80, "DATE_APPROCHE_INVESTISSEMENT", r#"{"champ": "date_fin_pret", "jours_avant": 365, "types_produit": ["SCPI", "SCPI_FISCALE", "SCPI_DEMEMBREMENT", "IMMOBILIER", "PINEL", "DENORMANDIE", "MALRAUX", "MONUMENT_HISTORIQUE", "DEFICIT_FONCIER", "LMNP", "LMP", "NUE_PROPRIETE", "RESIDENCE_PRINCIPALE", "LOCATIF_CLASSIQUE"]}"#, r#"["CLIENT"]"#),
            ("Alerte 69 ans", "#EC4899", "🎂", "Client approchant 69 ans (assurance-vie)", 75, "AGE_APPROCHE", r#"{"age": 69, "jours_avant": 30}"#, r#"["CLIENT"]"#),
            ("Déclaration IR", "#8B5CF6", "📋", "Période de déclaration d'impôts (avril-mai)", 70, "PERIODE_ANNEE", r#"{"mois_debut": 4, "mois_fin": 5}"#, r#"["CLIENT"]"#),
            ("RDV fin d'année", "#10B981", "🎯", "Période de souscription fin d'année (oct-nov)", 60, "PERIODE_ANNEE", r#"{"mois_debut": 10, "mois_fin": 11}"#, r#"["CLIENT", "PROSPECT_CLIENT"]"#),
        ];

        for (nom, couleur, icone, description, priorite, condition_type, condition_config, categories) in default_etiquettes {
            // Vérifier si l'étiquette existe déjà (par nom)
            let exists: i64 = self.conn.query_row(
                "SELECT COUNT(*) FROM etiquettes WHERE nom = ?1",
                params![nom],
                |row| row.get(0),
            ).unwrap_or(0);

            if exists == 0 {
                // Créer l'étiquette manquante
                if self.create_etiquette(NewEtiquette {
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
                    email_actif: Some(false),
                    is_default: Some(true),
                }).is_ok() {
                    created += 1;
                    println!("🏷️ Étiquette par défaut '{}' créée", nom);
                }
            }
        }

        if created > 0 {
            println!("🏷️ Migration: {} étiquettes par défaut créées", created);
        }

        Ok(created)
    }

    // ==================== MOTEUR AUTOMATIQUE ETIQUETTES ====================

    /// Vérifie et applique automatiquement les étiquettes selon leurs conditions
    /// Retourne le nombre d'étiquettes attribuées
    pub fn check_and_apply_auto_etiquettes(&self) -> Result<usize> {
        // Vérifier si la table existe
        let table_exists: i64 = self.conn.query_row(
            "SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name='etiquettes'",
            [],
            |row| row.get(0),
        ).unwrap_or(0);

        if table_exists == 0 {
            return Ok(0);
        }

        // 🏷️ S'assurer que toutes les étiquettes par défaut existent (migration)
        let _ = self.ensure_default_etiquettes();

        let now = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_secs() as i64;

        // Récupérer le mois actuel (1-12)
        let current_month = {
            let datetime = chrono::DateTime::from_timestamp(now, 0)
                .unwrap_or_else(|| chrono::Utc::now());
            datetime.format("%m").to_string().parse::<i32>().unwrap_or(1)
        };

        let mut total_assigned = 0;

        // Récupérer toutes les étiquettes automatiques
        let etiquettes = self.get_all_etiquettes()?;
        let auto_etiquettes: Vec<_> = etiquettes
            .into_iter()
            .filter(|e| e.auto_condition_type.is_some())
            .collect();

        // Récupérer tous les contacts
        let contacts = self.get_all_contacts()?;

        for etiquette in auto_etiquettes {
            let condition_type = etiquette.auto_condition_type.as_ref().unwrap();
            let config = etiquette.auto_condition_config.as_ref();
            let categories: Vec<String> = etiquette.auto_categories.as_ref()
                .and_then(|c| serde_json::from_str(c).ok())
                .unwrap_or_default();

            for contact in &contacts {
                let contact_id = match contact.id {
                    Some(id) => id,
                    None => continue,
                };

                // Vérifier si la catégorie du contact correspond
                if !categories.is_empty() && !categories.contains(&contact.categorie) {
                    continue;
                }

                // Vérifier si l'étiquette est déjà attribuée (et si c'est automatique)
                let assignment_info: Option<(i64, String)> = self.conn.query_row(
                    "SELECT id, COALESCE(source, '') FROM contact_etiquettes WHERE contact_id = ?1 AND etiquette_id = ?2",
                    params![contact_id, etiquette.id],
                    |row| Ok((row.get(0)?, row.get(1)?)),
                ).ok();

                // Évaluer la condition
                let should_assign = match condition_type.as_str() {
                    "DELAI_SANS_CONTACT" => {
                        if let Some(config_str) = config {
                            if let Ok(parsed) = serde_json::from_str::<serde_json::Value>(config_str) {
                                let jours = parsed["jours"].as_i64().unwrap_or(365);
                                if let Some(last_contact) = contact.date_dernier_contact {
                                    let diff_days = (now - last_contact) / (24 * 60 * 60);
                                    diff_days >= jours
                                } else {
                                    true // Jamais contacté = condition remplie
                                }
                            } else {
                                false
                            }
                        } else {
                            false
                        }
                    }
                    "DATE_APPROCHE" => {
                        if let Some(config_str) = config {
                            if let Ok(parsed) = serde_json::from_str::<serde_json::Value>(config_str) {
                                let champ = parsed["champ"].as_str().unwrap_or("");
                                let jours_avant = parsed["jours_avant"].as_i64().unwrap_or(30);
                                
                                let date_value = match champ {
                                    "date_prochain_suivi" => contact.date_prochain_suivi,
                                    "date_naissance" => contact.date_naissance,
                                    _ => None,
                                };

                                // Pour date_fin_demembrement, il faudrait chercher dans les investissements
                                // (simplifié ici)

                                if let Some(target_date) = date_value {
                                    let diff_seconds = target_date - now;
                                    let diff_days = diff_seconds / (24 * 60 * 60);
                                    diff_days >= 0 && diff_days <= jours_avant
                                } else {
                                    false
                                }
                            } else {
                                false
                            }
                        } else {
                            false
                        }
                    }
                    "PERIODE_ANNEE" => {
                        if let Some(config_str) = config {
                            if let Ok(parsed) = serde_json::from_str::<serde_json::Value>(config_str) {
                                let mois_debut = parsed["mois_debut"].as_i64().unwrap_or(1) as i32;
                                let mois_fin = parsed["mois_fin"].as_i64().unwrap_or(12) as i32;
                                
                                if mois_debut <= mois_fin {
                                    current_month >= mois_debut && current_month <= mois_fin
                                } else {
                                    // Cas où la période chevauche l'année (ex: nov-fév)
                                    current_month >= mois_debut || current_month <= mois_fin
                                }
                            } else {
                                false
                            }
                        } else {
                            false
                        }
                    }
                    "TYPE_PRODUIT" => {
                        // Vérifier si le contact a un investissement du type demandé
                        if let Some(config_str) = config {
                            if let Ok(parsed) = serde_json::from_str::<serde_json::Value>(config_str) {
                                let types: Vec<String> = parsed["types"]
                                    .as_array()
                                    .map(|arr| arr.iter().filter_map(|v| v.as_str().map(String::from)).collect())
                                    .unwrap_or_default();
                                
                                if types.is_empty() {
                                    false
                                } else {
                                    let types_str = types.iter()
                                        .map(|t| format!("'{}'", t))
                                        .collect::<Vec<_>>()
                                        .join(",");
                                    
                                    let has_product: i64 = self.conn.query_row(
                                        &format!(
                                            "SELECT COUNT(*) FROM investissements 
                                             WHERE contact_id = ?1 AND type_produit IN ({})",
                                            types_str
                                        ),
                                        params![contact_id],
                                        |row| row.get(0),
                                    ).unwrap_or(0);
                                    
                                    has_product > 0
                                }
                            } else {
                                false
                            }
                        } else {
                            false
                        }
                    }
                    "DATE_APPROCHE_INVESTISSEMENT" => {
                        // Vérifier si le contact a un investissement avec une date approchant
                        if let Some(config_str) = config {
                            if let Ok(parsed) = serde_json::from_str::<serde_json::Value>(config_str) {
                                let champ = parsed["champ"].as_str().unwrap_or("");
                                let jours_avant = parsed["jours_avant"].as_i64().unwrap_or(180);
                                let types_produit: Vec<String> = parsed["types_produit"]
                                    .as_array()
                                    .map(|arr| arr.iter().filter_map(|v| v.as_str().map(String::from)).collect())
                                    .unwrap_or_default();
                                
                                // Construire la requête SQL pour chercher les investissements avec date approchant
                                let type_filter = if types_produit.is_empty() {
                                    String::new()
                                } else {
                                    let types_str = types_produit.iter()
                                        .map(|t| format!("'{}'", t))
                                        .collect::<Vec<_>>()
                                        .join(",");
                                    format!(" AND type_produit IN ({})", types_str)
                                };
                                
                                let threshold = now + (jours_avant * 24 * 60 * 60);
                                
                                let query = format!(
                                    "SELECT COUNT(*) FROM investissements 
                                     WHERE contact_id = ?1 
                                     AND {} IS NOT NULL 
                                     AND {} > ?2 
                                     AND {} <= ?3{}",
                                    champ, champ, champ, type_filter
                                );
                                
                                let has_approaching: i64 = self.conn.query_row(
                                    &query,
                                    params![contact_id, now, threshold],
                                    |row| row.get(0),
                                ).unwrap_or(0);
                                
                                has_approaching > 0
                            } else {
                                false
                            }
                        } else {
                            false
                        }
                    }
                    "AGE_APPROCHE" => {
                        // Vérifier si le contact atteint un âge spécifique dans X jours
                        if let Some(config_str) = config {
                            if let Ok(parsed) = serde_json::from_str::<serde_json::Value>(config_str) {
                                let age_cible = parsed["age"].as_i64().unwrap_or(69);
                                let jours_avant = parsed["jours_avant"].as_i64().unwrap_or(30);
                                
                                if let Some(date_naissance) = contact.date_naissance {
                                    // Calculer la date d'anniversaire pour l'âge cible
                                    use chrono::{DateTime, Utc, Datelike};
                                    let birth = DateTime::<Utc>::from_timestamp(date_naissance, 0);
                                    
                                    if let Some(birth_dt) = birth {
                                        let now_dt = Utc::now();
                                        let current_year = now_dt.year();
                                        let birth_year = birth_dt.year();
                                        
                                        // Année de l'anniversaire cible
                                        let target_year = birth_year + age_cible as i32;
                                        
                                        // Date de l'anniversaire cible
                                        if let Some(target_birthday) = birth_dt
                                            .with_year(target_year)
                                            .map(|d| d.timestamp())
                                        {
                                            // L'anniversaire doit être dans le futur et dans les X jours
                                            let diff_seconds = target_birthday - now;
                                            let diff_days = diff_seconds / (24 * 60 * 60);
                                            
                                            diff_days >= 0 && diff_days <= jours_avant
                                        } else {
                                            false
                                        }
                                    } else {
                                        false
                                    }
                                } else {
                                    false
                                }
                            } else {
                                false
                            }
                        } else {
                            false
                        }
                    }
                    _ => false,
                };

                match (should_assign, assignment_info) {
                    // Condition remplie et pas encore attribuée -> attribuer
                    (true, None) => {
                        if self.attribuer_etiquette(contact_id, etiquette.id, Some("AUTO".to_string())).is_ok() {
                            total_assigned += 1;
                            println!("🏷️ Étiquette '{}' attribuée automatiquement à {} {}", 
                                etiquette.nom, contact.prenom, contact.nom);
                        }
                    }
                    // Condition non remplie et étiquette AUTO attribuée -> retirer
                    (false, Some((assignment_id, source))) if source == "AUTO" => {
                        if self.conn.execute(
                            "DELETE FROM contact_etiquettes WHERE id = ?1",
                            params![assignment_id],
                        ).is_ok() {
                            println!("🏷️ Étiquette '{}' retirée automatiquement de {} {} (condition non remplie)", 
                                etiquette.nom, contact.prenom, contact.nom);
                        }
                    }
                    // Autres cas: pas d'action nécessaire
                    _ => {}
                }
            }
        }

        println!("🏷️ Moteur automatique: {} étiquettes attribuées", total_assigned);
        Ok(total_assigned)
    }

    /// Envoie les emails programmés pour les étiquettes
    /// Retourne le nombre d'emails envoyés
    pub fn get_pending_etiquette_emails(&self) -> Result<Vec<(i64, i64, i64, String, String)>> {
        // Récupérer les emails en attente (email_envoye = 0 ET email_date_prevue <= now)
        let now = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_secs() as i64;

        let mut stmt = self.conn.prepare(
            "SELECT ce.id, ce.contact_id, e.email_template_id, c.email, c.prenom
             FROM contact_etiquettes ce
             INNER JOIN etiquettes e ON ce.etiquette_id = e.id
             INNER JOIN contacts c ON ce.contact_id = c.id
             WHERE ce.email_envoye = 0 
               AND ce.email_date_prevue IS NOT NULL 
               AND ce.email_date_prevue <= ?1
               AND e.email_actif = 1
               AND e.email_template_id IS NOT NULL
               AND c.email IS NOT NULL
               AND c.email != ''"
        )?;

        let results = stmt.query_map(params![now], |row| {
            Ok((
                row.get::<_, i64>(0)?,      // contact_etiquette.id
                row.get::<_, i64>(1)?,      // contact_id
                row.get::<_, i64>(2)?,      // template_id
                row.get::<_, String>(3)?,   // email
                row.get::<_, String>(4)?,   // prenom
            ))
        })?;

        let mut pending = Vec::new();
        for result in results {
            if let Ok(item) = result {
                pending.push(item);
            }
        }
        Ok(pending)
    }

    /// Marquer un email d'étiquette comme envoyé
    pub fn mark_etiquette_email_sent(&self, contact_etiquette_id: i64) -> Result<()> {
        let now = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_secs() as i64;

        self.conn.execute(
            "UPDATE contact_etiquettes SET email_envoye = 1, email_date_envoi = ?1 WHERE id = ?2",
            params![now, contact_etiquette_id],
        )?;
        Ok(())
    }
}
