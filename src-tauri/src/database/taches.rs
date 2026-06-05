//! Tâches / rappels (liés ou non à un contact). Module de domaine dédié.

use super::models::{NewTache, Tache, TacheWithContact};
use rusqlite::{params, Result};

fn normalize_priorite(value: Option<String>) -> String {
    match value.as_deref() {
        Some("BASSE") => "BASSE".to_string(),
        Some("HAUTE") => "HAUTE".to_string(),
        _ => "NORMALE".to_string(),
    }
}

fn normalize_statut(value: Option<String>) -> String {
    match value.as_deref() {
        Some("FAIT") => "FAIT".to_string(),
        _ => "A_FAIRE".to_string(),
    }
}

impl super::Database {
    /// Toutes les tâches avec le nom du contact lié (page Tâches).
    /// Tri : à faire d'abord, puis échéance la plus proche (sans date en dernier).
    pub fn get_all_taches_with_contact(&self) -> Result<Vec<TacheWithContact>> {
        let mut stmt = self.conn.prepare(
            "SELECT t.id, t.contact_id, c.nom, c.prenom, t.titre, t.description,
                    t.date_echeance, t.priorite, t.statut, t.completed_at,
                    t.created_at, t.updated_at
             FROM taches t
             LEFT JOIN contacts c ON c.id = t.contact_id
             ORDER BY (t.statut = 'FAIT'),
                      (t.date_echeance IS NULL),
                      t.date_echeance ASC,
                      t.created_at DESC",
        )?;

        let rows = stmt.query_map([], |row| {
            Ok(TacheWithContact {
                id: row.get(0)?,
                contact_id: row.get(1)?,
                contact_nom: row.get(2)?,
                contact_prenom: row.get(3)?,
                titre: row.get(4)?,
                description: row.get(5)?,
                date_echeance: row.get(6)?,
                priorite: row.get(7)?,
                statut: row.get(8)?,
                completed_at: row.get(9)?,
                created_at: row.get(10)?,
                updated_at: row.get(11)?,
            })
        })?;

        let mut result = Vec::new();
        for row in rows {
            result.push(row?);
        }
        Ok(result)
    }

    /// Tâches d'un contact donné (encart fiche contact).
    pub fn get_taches_by_contact(&self, contact_id: i64) -> Result<Vec<Tache>> {
        let mut stmt = self.conn.prepare(
            "SELECT id, contact_id, titre, description, date_echeance, priorite,
                    statut, completed_at, created_at, updated_at
             FROM taches
             WHERE contact_id = ?1
             ORDER BY (statut = 'FAIT'),
                      (date_echeance IS NULL),
                      date_echeance ASC,
                      created_at DESC",
        )?;

        let rows = stmt.query_map(params![contact_id], Self::map_tache)?;
        let mut result = Vec::new();
        for row in rows {
            result.push(row?);
        }
        Ok(result)
    }

    pub fn get_tache_by_id(&self, id: i64) -> Result<Tache> {
        self.conn.query_row(
            "SELECT id, contact_id, titre, description, date_echeance, priorite,
                    statut, completed_at, created_at, updated_at
             FROM taches WHERE id = ?1",
            params![id],
            Self::map_tache,
        )
    }

    pub fn create_tache(&self, tache: NewTache) -> Result<Tache> {
        let priorite = normalize_priorite(tache.priorite);
        let statut = normalize_statut(tache.statut);
        let completed_at: Option<i64> = if statut == "FAIT" {
            Some(now_unix())
        } else {
            None
        };

        self.conn.execute(
            "INSERT INTO taches (contact_id, titre, description, date_echeance, priorite, statut, completed_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
            params![
                tache.contact_id,
                tache.titre,
                tache.description,
                tache.date_echeance,
                priorite,
                statut,
                completed_at,
            ],
        )?;

        self.get_tache_by_id(self.conn.last_insert_rowid())
    }

    pub fn update_tache(&self, id: i64, tache: &NewTache) -> Result<Tache> {
        let priorite = normalize_priorite(tache.priorite.clone());
        let statut = normalize_statut(tache.statut.clone());
        // completed_at suit le statut : posé si FAIT, effacé si A_FAIRE.
        let completed_at: Option<i64> = if statut == "FAIT" {
            Some(now_unix())
        } else {
            None
        };

        self.conn.execute(
            "UPDATE taches SET
                contact_id = ?1,
                titre = ?2,
                description = ?3,
                date_echeance = ?4,
                priorite = ?5,
                statut = ?6,
                completed_at = ?7,
                updated_at = unixepoch()
             WHERE id = ?8",
            params![
                tache.contact_id,
                tache.titre,
                tache.description,
                tache.date_echeance,
                priorite,
                statut,
                completed_at,
                id,
            ],
        )?;

        self.get_tache_by_id(id)
    }

    /// Bascule rapide du statut (case à cocher) sans toucher au reste.
    pub fn set_tache_statut(&self, id: i64, statut: &str) -> Result<Tache> {
        let statut = normalize_statut(Some(statut.to_string()));
        let completed_at: Option<i64> = if statut == "FAIT" {
            Some(now_unix())
        } else {
            None
        };

        self.conn.execute(
            "UPDATE taches SET statut = ?1, completed_at = ?2, updated_at = unixepoch() WHERE id = ?3",
            params![statut, completed_at, id],
        )?;

        self.get_tache_by_id(id)
    }

    pub fn delete_tache(&self, id: i64) -> Result<()> {
        self.conn
            .execute("DELETE FROM taches WHERE id = ?1", params![id])?;
        Ok(())
    }

    fn map_tache(row: &rusqlite::Row) -> Result<Tache> {
        Ok(Tache {
            id: row.get(0)?,
            contact_id: row.get(1)?,
            titre: row.get(2)?,
            description: row.get(3)?,
            date_echeance: row.get(4)?,
            priorite: row.get(5)?,
            statut: row.get(6)?,
            completed_at: row.get(7)?,
            created_at: row.get(8)?,
            updated_at: row.get(9)?,
        })
    }
}

fn now_unix() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs() as i64)
        .unwrap_or(0)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::database::models::NewContact;
    use crate::database::Database;

    fn mem_db() -> Database {
        Database::open_in_memory_for_tests().expect("db mémoire")
    }

    fn new_tache(titre: &str) -> NewTache {
        NewTache {
            contact_id: None,
            titre: titre.to_string(),
            description: None,
            date_echeance: None,
            priorite: None,
            statut: None,
        }
    }

    #[test]
    fn create_tache_defaults_to_a_faire_normale() {
        let db = mem_db();
        let t = db.create_tache(new_tache("Appeler M. X")).unwrap();
        assert_eq!(t.statut, "A_FAIRE");
        assert_eq!(t.priorite, "NORMALE");
        assert!(t.completed_at.is_none());
    }

    #[test]
    fn set_statut_fait_sets_completed_at_and_back() {
        let db = mem_db();
        let t = db.create_tache(new_tache("Relancer")).unwrap();
        let done = db.set_tache_statut(t.id, "FAIT").unwrap();
        assert_eq!(done.statut, "FAIT");
        assert!(done.completed_at.is_some());
        let reopened = db.set_tache_statut(t.id, "A_FAIRE").unwrap();
        assert_eq!(reopened.statut, "A_FAIRE");
        assert!(reopened.completed_at.is_none());
    }

    #[test]
    fn taches_by_contact_filters_and_cascade_on_delete() {
        let db = mem_db();
        let contact = db
            .create_contact(NewContact {
                famille_id: None,
                foyer_id: None,
                role_foyer: None,
                role_famille: None,
                categorie: "PROSPECT_CLIENT".to_string(),
                filleul_categorie: None,
                parrain_id: None,
                prescripteur_id: None,
                civilite: None,
                nom: "Test".to_string(),
                prenom: "Tache".to_string(),
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
                statut_suivi: None,
                registre: None,
                notes: None,
            })
            .unwrap();
        let cid = contact.id.unwrap();

        let mut linked = new_tache("Préparer bilan");
        linked.contact_id = Some(cid);
        db.create_tache(linked).unwrap();
        db.create_tache(new_tache("Tâche libre")).unwrap();

        assert_eq!(db.get_taches_by_contact(cid).unwrap().len(), 1);
        assert_eq!(db.get_all_taches_with_contact().unwrap().len(), 2);

        db.delete_contact(cid).unwrap();
        assert_eq!(db.get_taches_by_contact(cid).unwrap().len(), 0);
        assert_eq!(db.get_all_taches_with_contact().unwrap().len(), 1);
    }
}
