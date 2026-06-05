//! Familles (regroupement par nom de famille). Extrait de `operations.rs`.

use super::models::{Famille, NewFamille};
use rusqlite::{params, Result};

impl super::Database {
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
}
