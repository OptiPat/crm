//! Requêtes liées aux filleuls / prescripteurs et recherche par nom.
//! Extrait de `operations.rs`.

use super::models::Contact;
use rusqlite::{params, Result};

impl super::Database {
    // Récupérer tous les filleuls d'un contact (parrain)
    pub fn get_filleuls_by_parrain(&self, parrain_id: i64) -> Result<Vec<Contact>> {
        use super::contact_row::{map_contact_row, CONTACT_SELECT};

        let mut stmt = self.conn.prepare(&format!(
            "SELECT {CONTACT_SELECT} FROM contacts WHERE parrain_id = ?1 ORDER BY created_at DESC"
        ))?;

        let filleuls = stmt.query_map(params![parrain_id], map_contact_row)?;

        filleuls.collect()
    }

    // Rechercher un contact par nom et prénom (normalisation + inversion nom/prénom)
    pub fn find_contact_by_name(&self, nom: &str, prenom: &str) -> Result<Option<Contact>> {
        if nom.trim().is_empty() || prenom.trim().is_empty() {
            return Ok(None);
        }

        if let Some(id) = self.find_contact_id_by_name(nom, prenom)? {
            return self.get_contact_by_id(id).map(Some);
        }
        Ok(None)
    }

    /// Recherche légère (id + nom + prénom seulement — pas de CONTACT_SELECT complet).
    pub(crate) fn find_contact_id_by_name(&self, nom: &str, prenom: &str) -> Result<Option<i64>> {
        use crate::contact_name::names_match;

        if nom.trim().is_empty() || prenom.trim().is_empty() {
            return Ok(None);
        }

        let mut stmt = self.conn.prepare(
            "SELECT id, nom, prenom FROM contacts ORDER BY id ASC",
        )?;
        let rows = stmt.query_map([], |row| {
            Ok((
                row.get::<_, i64>(0)?,
                row.get::<_, String>(1)?,
                row.get::<_, String>(2)?,
            ))
        })?;
        for row in rows {
            let (id, row_nom, row_prenom) = row?;
            if names_match(nom, prenom, &row_nom, &row_prenom) {
                return Ok(Some(id));
            }
        }
        Ok(None)
    }

    // 🔥 Récupérer tous les contacts recommandés par un prescripteur
    pub fn get_clients_by_prescripteur(&self, prescripteur_id: i64) -> Result<Vec<Contact>> {
        use super::contact_row::{map_contact_row, CONTACT_SELECT};

        let mut stmt = self.conn.prepare(&format!(
            "SELECT {CONTACT_SELECT} FROM contacts WHERE prescripteur_id = ?1 ORDER BY created_at DESC"
        ))?;

        let clients = stmt.query_map(params![prescripteur_id], map_contact_row)?;

        clients.collect()
    }

    /// Contact « Moi » dans Organisation (profil CGP → fiche contact).
    pub(crate) fn resolve_organisation_self_contact_id(&self) -> Result<Option<i64>> {
        let cgp = self.get_cgp_config()?;
        let nom = cgp.nom.as_deref().unwrap_or("").trim();
        let prenom = cgp.prenom.as_deref().unwrap_or("").trim();
        if nom.is_empty() || prenom.is_empty() {
            return Ok(None);
        }
        self.find_contact_id_by_name(nom, prenom)
    }
}

#[cfg(test)]
mod tests {
    use super::super::Database;
    use crate::database::models::NewContact;

    fn sample_contact(nom: &str, prenom: &str) -> NewContact {
        NewContact {
            categorie: "CLIENT".into(),
            nom: nom.into(),
            prenom: prenom.into(),
            statut_suivi: Some("ACTIF".into()),
            ..Default::default()
        }
    }

    #[test]
    fn find_contact_id_by_name_picks_lowest_id_on_homonyms() {
        let db = Database::open_in_memory_for_tests().unwrap();
        let first = db.create_contact(sample_contact("Dupont", "Jean")).unwrap();
        let second = db.create_contact(sample_contact("Dupont", "Jean")).unwrap();

        let resolved = db.find_contact_id_by_name("Dupont", "Jean").unwrap();
        assert_eq!(resolved, Some(first.id.unwrap()));
        assert!(first.id.unwrap() < second.id.unwrap());
    }
}
