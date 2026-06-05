//! Partenaires (apporteurs, prestataires...). Extrait de `operations.rs`.

use rusqlite::{params, Result};

impl super::Database {
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
}
