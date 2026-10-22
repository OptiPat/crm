//! Foyers (groupes familiaux fiscaux). Extrait de `operations.rs`.

use rusqlite::{params, Result};

impl super::Database {
    pub fn get_all_foyers(&self) -> Result<Vec<super::models::Foyer>> {
        let mut stmt = self.conn.prepare(
            "SELECT id, nom, type_foyer, nombre_parts_fiscales, tranche_imposition, 
                    revenu_fiscal_reference, situation_patrimoniale, objectifs_patrimoniaux, 
                    notes, created_at, updated_at, ir_net_a_payer 
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
                ir_net_a_payer: row.get(11)?,
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
                                revenu_fiscal_reference, situation_patrimoniale, objectifs_patrimoniaux, notes, ir_net_a_payer) 
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)",
            params![
                &foyer.nom,
                &foyer.type_foyer,
                &foyer.nombre_parts_fiscales,
                &foyer.tranche_imposition,
                &foyer.revenu_fiscal_reference,
                &foyer.situation_patrimoniale,
                &foyer.objectifs_patrimoniaux,
                &foyer.notes,
                &foyer.ir_net_a_payer,
            ],
        )?;

        let id = self.conn.last_insert_rowid();
        self.get_foyer_by_id(id)
    }

    pub fn get_foyer_by_id(&self, id: i64) -> Result<super::models::Foyer> {
        self.conn.query_row(
            "SELECT id, nom, type_foyer, nombre_parts_fiscales, tranche_imposition, 
                    revenu_fiscal_reference, situation_patrimoniale, objectifs_patrimoniaux, 
                    notes, created_at, updated_at, ir_net_a_payer 
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
                    ir_net_a_payer: row.get(11)?,
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
                ir_net_a_payer = ?9,
                updated_at = unixepoch()
            WHERE id = ?10",
            params![
                &foyer.nom,
                &foyer.type_foyer,
                &foyer.nombre_parts_fiscales,
                &foyer.tranche_imposition,
                &foyer.revenu_fiscal_reference,
                &foyer.situation_patrimoniale,
                &foyer.objectifs_patrimoniaux,
                &foyer.notes,
                &foyer.ir_net_a_payer,
                id
            ],
        )?;

        self.get_foyer_by_id(id)
    }

    /// Supprime le foyer : ses investissements communs (sans titulaire) disparaissent avec lui,
    /// ceux d'un membre sont gardés et seulement détachés du foyer.
    pub fn delete_foyer(&self, id: i64) -> Result<()> {
        self.with_savepoint("delete_foyer", || {
            self.conn.execute(
                "UPDATE investissements SET foyer_id = NULL
                 WHERE foyer_id = ?1 AND contact_id IS NOT NULL",
                params![id],
            )?;
            self.conn.execute(
                "DELETE FROM investissements WHERE foyer_id = ?1",
                params![id],
            )?;
            self.conn
                .execute("DELETE FROM foyers WHERE id = ?1", params![id])?;
            Ok(())
        })
    }
}

#[cfg(test)]
mod tests {
    use crate::database::models::NewContact;
    use crate::database::Database;
    use rusqlite::params;

    #[test]
    fn delete_foyer_garde_les_investissements_d_un_membre() {
        let db = Database::open_in_memory_for_tests().expect("in-memory db");
        db.conn
            .execute(
                "INSERT INTO foyers (nom, type_foyer) VALUES ('Foyer Test', 'COUPLE')",
                [],
            )
            .unwrap();
        let foyer_id = db.conn.last_insert_rowid();
        let contact_id = db
            .create_contact(NewContact {
                categorie: "CLIENT".into(),
                nom: "Dupont".into(),
                prenom: "Jean".into(),
                ..Default::default()
            })
            .unwrap()
            .id
            .unwrap();
        let insert = "INSERT INTO investissements (contact_id, foyer_id, type_produit, nom_produit)
                      VALUES (?1, ?2, 'AV', ?3)";
        db.conn
            .execute(insert, params![Option::<i64>::None, foyer_id, "Commun"])
            .unwrap();
        db.conn
            .execute(insert, params![Some(contact_id), foyer_id, "Perso"])
            .unwrap();

        db.delete_foyer(foyer_id).unwrap();

        let rows: Vec<(String, Option<i64>)> = db
            .conn
            .prepare("SELECT nom_produit, foyer_id FROM investissements ORDER BY id")
            .unwrap()
            .query_map([], |r| Ok((r.get(0)?, r.get(1)?)))
            .unwrap()
            .collect::<rusqlite::Result<_>>()
            .unwrap();
        assert_eq!(rows, vec![("Perso".to_string(), None)]);
        let foyers: i64 = db
            .conn
            .query_row("SELECT COUNT(*) FROM foyers", [], |r| r.get(0))
            .unwrap();
        assert_eq!(foyers, 0);
    }

    #[test]
    fn nettoyage_garde_un_foyer_vide_qui_a_des_investissements_communs() {
        let db = Database::open_in_memory_for_tests().expect("in-memory db");
        db.conn
            .execute(
                "INSERT INTO foyers (nom, type_foyer) VALUES ('Avec commun', 'COUPLE'), ('Vide', 'COUPLE')",
                [],
            )
            .unwrap();
        let avec_commun: i64 = db
            .conn
            .query_row("SELECT id FROM foyers WHERE nom = 'Avec commun'", [], |r| {
                r.get(0)
            })
            .unwrap();
        db.conn
            .execute(
                "INSERT INTO investissements (contact_id, foyer_id, type_produit, nom_produit)
                 VALUES (NULL, ?1, 'AV', 'Commun')",
                params![avec_commun],
            )
            .unwrap();

        db.cleanup_orphaned_foyers().unwrap();

        let restants: Vec<String> = db
            .conn
            .prepare("SELECT nom FROM foyers ORDER BY nom")
            .unwrap()
            .query_map([], |r| r.get(0))
            .unwrap()
            .collect::<rusqlite::Result<_>>()
            .unwrap();
        assert_eq!(restants, vec!["Avec commun".to_string()]);
        let investissements: i64 = db
            .conn
            .query_row("SELECT COUNT(*) FROM investissements", [], |r| r.get(0))
            .unwrap();
        assert_eq!(investissements, 1);
    }
}
