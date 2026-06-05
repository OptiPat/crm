//! Foyers (groupes familiaux fiscaux). Extrait de `operations.rs`.

use rusqlite::{params, Result};

impl super::Database {
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
}
