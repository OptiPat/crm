use rusqlite::{params, Result};
use super::{Database, models::{Contact, NewContact}};

impl Database {
    pub fn get_all_contacts(&self) -> Result<Vec<Contact>> {
        let mut stmt = self.conn.prepare(
            "SELECT id, foyer_id, categorie, parrain_id, civilite, nom, prenom, email, telephone,
                    adresse, code_postal, ville, date_naissance, profession, situation_familiale,
                    source_lead, profil_risque_sri, date_dernier_contact, date_prochain_suivi,
                    statut_suivi, notes, created_at, updated_at
             FROM contacts
             ORDER BY created_at DESC"
        )?;
        
        let contacts = stmt.query_map([], |row| {
            Ok(Contact {
                id: row.get(0)?,
                foyer_id: row.get(1)?,
                categorie: row.get(2)?,
                parrain_id: row.get(3)?,
                civilite: row.get(4)?,
                nom: row.get(5)?,
                prenom: row.get(6)?,
                email: row.get(7)?,
                telephone: row.get(8)?,
                adresse: row.get(9)?,
                code_postal: row.get(10)?,
                ville: row.get(11)?,
                date_naissance: row.get(12)?,
                profession: row.get(13)?,
                situation_familiale: row.get(14)?,
                source_lead: row.get(15)?,
                profil_risque_sri: row.get(16)?,
                date_dernier_contact: row.get(17)?,
                date_prochain_suivi: row.get(18)?,
                statut_suivi: row.get(19)?,
                notes: row.get(20)?,
                created_at: row.get(21)?,
                updated_at: row.get(22)?,
            })
        })?;
        
        contacts.collect()
    }
    
    pub fn create_contact(&self, new_contact: NewContact) -> Result<Contact> {
        use chrono::{DateTime, Utc};
        
        let statut = new_contact.statut_suivi.unwrap_or("ACTIF".to_string());
        
        // Convertir les dates ISO string en timestamps Unix
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
        
        let date_naissance_timestamp = new_contact.date_naissance.and_then(|date_str| {
            DateTime::parse_from_rfc3339(&date_str)
                .ok()
                .map(|dt| dt.timestamp())
        });
        
        self.conn.execute(
            "INSERT INTO contacts (
                foyer_id, categorie, parrain_id, civilite, nom, prenom, email, telephone,
                adresse, code_postal, ville, date_naissance, profession, situation_familiale,
                source_lead, profil_risque_sri, date_dernier_contact, date_prochain_suivi,
                statut_suivi, notes
            ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, ?17, ?18, ?19, ?20)",
            params![
                new_contact.foyer_id,
                new_contact.categorie,
                new_contact.parrain_id,
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
            "SELECT id, foyer_id, categorie, parrain_id, civilite, nom, prenom, email, telephone,
                    adresse, code_postal, ville, date_naissance, profession, situation_familiale,
                    source_lead, profil_risque_sri, date_dernier_contact, date_prochain_suivi,
                    statut_suivi, notes, created_at, updated_at
             FROM contacts WHERE id = ?1",
            params![id],
            |row| {
                Ok(Contact {
                    id: row.get(0)?,
                    foyer_id: row.get(1)?,
                    categorie: row.get(2)?,
                    parrain_id: row.get(3)?,
                    civilite: row.get(4)?,
                    nom: row.get(5)?,
                    prenom: row.get(6)?,
                    email: row.get(7)?,
                    telephone: row.get(8)?,
                    adresse: row.get(9)?,
                    code_postal: row.get(10)?,
                    ville: row.get(11)?,
                    date_naissance: row.get(12)?,
                    profession: row.get(13)?,
                    situation_familiale: row.get(14)?,
                    source_lead: row.get(15)?,
                    profil_risque_sri: row.get(16)?,
                    date_dernier_contact: row.get(17)?,
                    date_prochain_suivi: row.get(18)?,
                    statut_suivi: row.get(19)?,
                    notes: row.get(20)?,
                    created_at: row.get(21)?,
                    updated_at: row.get(22)?,
                })
            },
        )
    }
    
    pub fn delete_contact(&self, id: i64) -> Result<()> {
        self.conn.execute("DELETE FROM contacts WHERE id = ?1", params![id])?;
        Ok(())
    }
    
    pub fn find_contact_by_email(&self, email: &str) -> Result<Option<Contact>> {
        match self.conn.query_row(
            "SELECT id, foyer_id, categorie, parrain_id, civilite, nom, prenom, email, telephone,
                    adresse, code_postal, ville, date_naissance, profession, situation_familiale,
                    source_lead, profil_risque_sri, date_dernier_contact, date_prochain_suivi,
                    statut_suivi, notes, created_at, updated_at
             FROM contacts WHERE email = ?1",
            params![email],
            |row| {
                Ok(Contact {
                    id: row.get(0)?,
                    foyer_id: row.get(1)?,
                    categorie: row.get(2)?,
                    parrain_id: row.get(3)?,
                    civilite: row.get(4)?,
                    nom: row.get(5)?,
                    prenom: row.get(6)?,
                    email: row.get(7)?,
                    telephone: row.get(8)?,
                    adresse: row.get(9)?,
                    code_postal: row.get(10)?,
                    ville: row.get(11)?,
                    date_naissance: row.get(12)?,
                    profession: row.get(13)?,
                    situation_familiale: row.get(14)?,
                    source_lead: row.get(15)?,
                    profil_risque_sri: row.get(16)?,
                    date_dernier_contact: row.get(17)?,
                    date_prochain_suivi: row.get(18)?,
                    statut_suivi: row.get(19)?,
                    notes: row.get(20)?,
                    created_at: row.get(21)?,
                    updated_at: row.get(22)?,
                })
            },
        ) {
            Ok(contact) => Ok(Some(contact)),
            Err(rusqlite::Error::QueryReturnedNoRows) => Ok(None),
            Err(e) => Err(e),
        }
    }

    pub fn delete_all_contacts(&self) -> Result<usize> {
        let count = self.conn.execute("DELETE FROM contacts", [])?;
        Ok(count)
    }

    pub fn update_contact(&self, id: i64, contact: &NewContact) -> Result<Contact> {
        use chrono::DateTime;
        
        // Convertir les dates ISO string en timestamps Unix (comme dans create_contact)
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
        
        let date_naissance_timestamp = contact.date_naissance.as_ref().and_then(|date_str| {
            DateTime::parse_from_rfc3339(date_str)
                .ok()
                .map(|dt| dt.timestamp())
        });
        
        self.conn.execute(
            "UPDATE contacts SET 
                categorie = ?1,
                parrain_id = ?2,
                nom = ?3,
                prenom = ?4,
                email = ?5,
                telephone = ?6,
                adresse = ?7,
                code_postal = ?8,
                ville = ?9,
                date_naissance = ?10,
                profession = ?11,
                source_lead = ?12,
                profil_risque_sri = ?13,
                date_dernier_contact = ?14,
                date_prochain_suivi = ?15,
                statut_suivi = ?16,
                notes = ?17,
                updated_at = unixepoch()
            WHERE id = ?18",
            params![
                &contact.categorie,
                &contact.parrain_id,
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
                &contact.statut_suivi,
                &contact.notes,
                id
            ],
        )?;

        self.get_contact_by_id(id)
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

            // Client sans contact depuis > 12 mois
            if contact.categorie == "CLIENT" {
                let should_alert = if let Some(last_contact) = date_dernier_contact {
                    let diff_seconds = now - last_contact;
                    let diff_months = diff_seconds / (30 * 24 * 60 * 60);
                    diff_months > 12
                } else {
                    true // Pas de date de dernier contact
                };

                if should_alert {
                    self.create_alerte(super::models::NewAlerte {
                        contact_id: contact.id.unwrap(),
                        type_alerte: "SUIVI_CLIENT_ANNUEL".to_string(),
                        message: format!("{} {} - Client à recontacter (> 12 mois)", contact.prenom, contact.nom),
                        date_alerte: Some(now),
                    })?;
                    count += 1;
                }
            }

            // Suspect sans contact depuis > 6 mois
            if contact.categorie.contains("SUSPECT") {
                let should_alert = if let Some(last_contact) = date_dernier_contact {
                    let diff_seconds = now - last_contact;
                    let diff_months = diff_seconds / (30 * 24 * 60 * 60);
                    diff_months > 6
                } else {
                    false // Pour les suspects, on n'alerte pas s'il n'y a jamais eu de contact
                };

                if should_alert {
                    self.create_alerte(super::models::NewAlerte {
                        contact_id: contact.id.unwrap(),
                        type_alerte: "SUIVI_PROSPECT_6MOIS".to_string(),
                        message: format!("{} {} - Suspect à relancer (> 6 mois)", contact.prenom, contact.nom),
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

        // Compter les prospects (PROSPECT_CLIENT + PROSPECT_FILLEUL)
        let total_prospects: i64 = self.conn.query_row(
            "SELECT COUNT(*) FROM contacts WHERE categorie LIKE 'PROSPECT%'",
            [],
            |row| row.get(0),
        )?;

        // Compter les suspects (SUSPECT_CLIENT + SUSPECT_FILLEUL)
        let total_suspects: i64 = self.conn.query_row(
            "SELECT COUNT(*) FROM contacts WHERE categorie LIKE 'SUSPECT%'",
            [],
            |row| row.get(0),
        )?;

        // Encours total (somme des investissements)
        let encours_total: f64 = self.conn.query_row(
            "SELECT COALESCE(SUM(montant_initial), 0) FROM investissements",
            [],
            |row| {
                let centimes: i64 = row.get(0)?;
                Ok(centimes as f64 / 100.0) // Convertir centimes en euros
            },
        ).unwrap_or(0.0);

        // Compter les alertes non traitées (gérer si la table n'existe pas)
        let alertes_non_traitees: i64 = self.conn.query_row(
            "SELECT COUNT(*) FROM alertes WHERE traitee = 0",
            [],
            |row| row.get(0),
        ).unwrap_or(0); // Si la table n'existe pas, retourner 0

        Ok(super::models::DashboardStats {
            total_clients,
            total_prospects,
            total_suspects,
            encours_total,
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
                    montant_initial, date_souscription, date_fin_demembrement,
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
                versement_programme: row.get::<_, i64>(9)? != 0,
                montant_versement_programme: row.get(10)?,
                frequence_versement: row.get(11)?,
                reinvestissement_dividendes: row.get::<_, i64>(12)? != 0,
                notes: row.get(13)?,
                origine: row.get::<_, String>(14).unwrap_or_else(|_| "MON_CONSEIL".to_string()),
                created_at: row.get(15)?,
                updated_at: row.get(16)?,
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
                    montant_initial, date_souscription, date_fin_demembrement,
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
                versement_programme: row.get::<_, i64>(9)? != 0,
                montant_versement_programme: row.get(10)?,
                frequence_versement: row.get(11)?,
                reinvestissement_dividendes: row.get::<_, i64>(12)? != 0,
                notes: row.get(13)?,
                origine: row.get::<_, String>(14).unwrap_or_else(|_| "MON_CONSEIL".to_string()),
                created_at: row.get(15)?,
                updated_at: row.get(16)?,
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
                    montant_initial, date_souscription, date_fin_demembrement,
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
                versement_programme: row.get::<_, i64>(9)? != 0,
                montant_versement_programme: row.get(10)?,
                frequence_versement: row.get(11)?,
                reinvestissement_dividendes: row.get::<_, i64>(12)? != 0,
                notes: row.get(13)?,
                origine: row.get::<_, String>(14).unwrap_or_else(|_| "MON_CONSEIL".to_string()),
                created_at: row.get(15)?,
                updated_at: row.get(16)?,
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
                    i.nom_produit, i.montant_initial, i.date_souscription, i.date_fin_demembrement,
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
                versement_programme: row.get::<_, i64>(13)? != 0,
                montant_versement_programme: row.get(14)?,
                frequence_versement: row.get(15)?,
                reinvestissement_dividendes: row.get::<_, i64>(16)? != 0,
                notes: row.get(17)?,
                origine: row.get::<_, String>(18).unwrap_or_else(|_| "MON_CONSEIL".to_string()),
                created_at: row.get(19)?,
                updated_at: row.get(20)?,
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

        // Origine par défaut : MON_CONSEIL
        let origine = investissement.origine.unwrap_or_else(|| "MON_CONSEIL".to_string());

        self.conn.execute(
            "INSERT INTO investissements (contact_id, foyer_id, type_produit, partenaire_id, nom_produit,
                                         montant_initial, date_souscription, date_fin_demembrement,
                                         versement_programme, montant_versement_programme, frequence_versement,
                                         reinvestissement_dividendes, notes, origine) 
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14)",
            params![
                &investissement.contact_id,
                &investissement.foyer_id,
                &investissement.type_produit,
                &investissement.partenaire_id,
                &investissement.nom_produit,
                &investissement.montant_initial,
                date_souscription_timestamp,
                date_fin_demembrement_timestamp,
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
                    montant_initial, date_souscription, date_fin_demembrement,
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
                    versement_programme: row.get::<_, i64>(9)? != 0,
                    montant_versement_programme: row.get(10)?,
                    frequence_versement: row.get(11)?,
                    reinvestissement_dividendes: row.get::<_, i64>(12)? != 0,
                    notes: row.get(13)?,
                    origine: row.get::<_, String>(14).unwrap_or_else(|_| "MON_CONSEIL".to_string()),
                    created_at: row.get(15)?,
                    updated_at: row.get(16)?,
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
                versement_programme = ?9,
                montant_versement_programme = ?10,
                frequence_versement = ?11,
                reinvestissement_dividendes = ?12,
                notes = ?13,
                updated_at = unixepoch()
            WHERE id = ?14",
            params![
                &investissement.contact_id,
                &investissement.foyer_id,
                &investissement.type_produit,
                &investissement.partenaire_id,
                &investissement.nom_produit,
                &investissement.montant_initial,
                date_souscription_timestamp,
                date_fin_demembrement_timestamp,
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
            "SELECT id, foyer_id, categorie, parrain_id, civilite, nom, prenom, email, telephone,
                    adresse, code_postal, ville, date_naissance, profession, situation_familiale,
                    source_lead, profil_risque_sri, date_dernier_contact, date_prochain_suivi,
                    statut_suivi, notes, created_at, updated_at
             FROM contacts
             WHERE parrain_id = ?1
             ORDER BY created_at DESC"
        )?;
        
        let filleuls = stmt.query_map(params![parrain_id], |row| {
            Ok(Contact {
                id: row.get(0)?,
                foyer_id: row.get(1)?,
                categorie: row.get(2)?,
                parrain_id: row.get(3)?,
                civilite: row.get(4)?,
                nom: row.get(5)?,
                prenom: row.get(6)?,
                email: row.get(7)?,
                telephone: row.get(8)?,
                adresse: row.get(9)?,
                code_postal: row.get(10)?,
                ville: row.get(11)?,
                date_naissance: row.get(12)?,
                profession: row.get(13)?,
                situation_familiale: row.get(14)?,
                source_lead: row.get(15)?,
                profil_risque_sri: row.get(16)?,
                date_dernier_contact: row.get(17)?,
                date_prochain_suivi: row.get(18)?,
                statut_suivi: row.get(19)?,
                notes: row.get(20)?,
                created_at: row.get(21)?,
                updated_at: row.get(22)?,
            })
        })?;
        
        filleuls.collect()
    }

    // Rechercher un contact par nom et prénom
    pub fn find_contact_by_name(&self, nom: &str, prenom: &str) -> Result<Option<Contact>> {
        match self.conn.query_row(
            "SELECT id, foyer_id, categorie, parrain_id, civilite, nom, prenom, email, telephone,
                    adresse, code_postal, ville, date_naissance, profession, situation_familiale,
                    source_lead, profil_risque_sri, date_dernier_contact, date_prochain_suivi,
                    statut_suivi, notes, created_at, updated_at
             FROM contacts 
             WHERE LOWER(nom) = LOWER(?1) AND LOWER(prenom) = LOWER(?2)
             LIMIT 1",
            params![nom, prenom],
            |row| {
                Ok(Contact {
                    id: row.get(0)?,
                    foyer_id: row.get(1)?,
                    categorie: row.get(2)?,
                    parrain_id: row.get(3)?,
                    civilite: row.get(4)?,
                    nom: row.get(5)?,
                    prenom: row.get(6)?,
                    email: row.get(7)?,
                    telephone: row.get(8)?,
                    adresse: row.get(9)?,
                    code_postal: row.get(10)?,
                    ville: row.get(11)?,
                    date_naissance: row.get(12)?,
                    profession: row.get(13)?,
                    situation_familiale: row.get(14)?,
                    source_lead: row.get(15)?,
                    profil_risque_sri: row.get(16)?,
                    date_dernier_contact: row.get(17)?,
                    date_prochain_suivi: row.get(18)?,
                    statut_suivi: row.get(19)?,
                    notes: row.get(20)?,
                    created_at: row.get(21)?,
                    updated_at: row.get(22)?,
                })
            },
        ) {
            Ok(contact) => Ok(Some(contact)),
            Err(rusqlite::Error::QueryReturnedNoRows) => Ok(None),
            Err(e) => Err(e),
        }
    }
}
