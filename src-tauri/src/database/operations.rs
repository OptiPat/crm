use rusqlite::{params, Result};
use super::{Database, models::{Contact, NewContact}};

impl Database {
    pub fn get_all_contacts(&self) -> Result<Vec<Contact>> {
        let mut stmt = self.conn.prepare(
            "SELECT id, foyer_id, categorie, civilite, nom, prenom, email, telephone,
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
                civilite: row.get(3)?,
                nom: row.get(4)?,
                prenom: row.get(5)?,
                email: row.get(6)?,
                telephone: row.get(7)?,
                adresse: row.get(8)?,
                code_postal: row.get(9)?,
                ville: row.get(10)?,
                date_naissance: row.get(11)?,
                profession: row.get(12)?,
                situation_familiale: row.get(13)?,
                source_lead: row.get(14)?,
                profil_risque_sri: row.get(15)?,
                date_dernier_contact: row.get(16)?,
                date_prochain_suivi: row.get(17)?,
                statut_suivi: row.get(18)?,
                notes: row.get(19)?,
                created_at: row.get(20)?,
                updated_at: row.get(21)?,
            })
        })?;
        
        contacts.collect()
    }
    
    pub fn create_contact(&self, new_contact: NewContact) -> Result<Contact> {
        let statut = new_contact.statut_suivi.unwrap_or("ACTIF".to_string());
        
        self.conn.execute(
            "INSERT INTO contacts (
                foyer_id, categorie, civilite, nom, prenom, email, telephone,
                adresse, code_postal, ville, date_naissance, profession, situation_familiale,
                source_lead, profil_risque_sri, date_dernier_contact, date_prochain_suivi,
                statut_suivi, notes
            ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, ?17, ?18, ?19)",
            params![
                new_contact.foyer_id,
                new_contact.categorie,
                new_contact.civilite,
                new_contact.nom,
                new_contact.prenom,
                new_contact.email,
                new_contact.telephone,
                new_contact.adresse,
                new_contact.code_postal,
                new_contact.ville,
                new_contact.date_naissance,
                new_contact.profession,
                new_contact.situation_familiale,
                new_contact.source_lead,
                new_contact.profil_risque_sri,
                new_contact.date_dernier_contact,
                new_contact.date_prochain_suivi,
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
            "SELECT id, foyer_id, categorie, civilite, nom, prenom, email, telephone,
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
                    civilite: row.get(3)?,
                    nom: row.get(4)?,
                    prenom: row.get(5)?,
                    email: row.get(6)?,
                    telephone: row.get(7)?,
                    adresse: row.get(8)?,
                    code_postal: row.get(9)?,
                    ville: row.get(10)?,
                    date_naissance: row.get(11)?,
                    profession: row.get(12)?,
                    situation_familiale: row.get(13)?,
                    source_lead: row.get(14)?,
                    profil_risque_sri: row.get(15)?,
                    date_dernier_contact: row.get(16)?,
                    date_prochain_suivi: row.get(17)?,
                    statut_suivi: row.get(18)?,
                    notes: row.get(19)?,
                    created_at: row.get(20)?,
                    updated_at: row.get(21)?,
                })
            },
        )
    }
    
    pub fn delete_contact(&self, id: i64) -> Result<()> {
        self.conn.execute("DELETE FROM contacts WHERE id = ?1", params![id])?;
        Ok(())
    }

    pub fn update_contact(&self, id: i64, contact: &NewContact) -> Result<Contact> {
        self.conn.execute(
            "UPDATE contacts SET 
                categorie = ?1,
                nom = ?2,
                prenom = ?3,
                email = ?4,
                telephone = ?5,
                adresse = ?6,
                code_postal = ?7,
                ville = ?8,
                date_naissance = ?9,
                profession = ?10,
                statut_suivi = ?11,
                notes = ?12,
                updated_at = CURRENT_TIMESTAMP
            WHERE id = ?13",
            params![
                &contact.categorie,
                &contact.nom,
                &contact.prenom,
                &contact.email,
                &contact.telephone,
                &contact.adresse,
                &contact.code_postal,
                &contact.ville,
                &contact.date_naissance,
                &contact.profession,
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
                updated_at = CURRENT_TIMESTAMP
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
                updated_at = CURRENT_TIMESTAMP
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
                updated_at = CURRENT_TIMESTAMP
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
}
