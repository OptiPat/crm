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
        use super::contact_row::{map_contact_row, CONTACT_SELECT};

        let mut stmt = self.conn.prepare(&format!(
            "SELECT {CONTACT_SELECT} FROM contacts WHERE prescripteur_id = ?1 ORDER BY created_at DESC"
        ))?;

        let clients = stmt.query_map(params![prescripteur_id], map_contact_row)?;

        clients.collect()
    }
}
