//! Contacts CRM pour lesquels l'utilisateur a ignoré les propositions nom/prénom Google.

use rusqlite::{params, Result};
use std::collections::HashSet;

impl super::Database {
    pub fn dismiss_google_contact_name_proposal(&self, contact_id: i64) -> Result<()> {
        self.conn.execute(
            "INSERT INTO google_contact_name_proposal_dismissals (contact_id, dismissed_at)
             VALUES (?1, unixepoch())
             ON CONFLICT(contact_id) DO UPDATE SET dismissed_at = unixepoch()",
            params![contact_id],
        )?;
        Ok(())
    }

    pub fn google_contact_name_proposal_dismissed_ids(&self) -> Result<HashSet<i64>> {
        let mut stmt = self
            .conn
            .prepare("SELECT contact_id FROM google_contact_name_proposal_dismissals")?;
        let ids = stmt
            .query_map([], |row| row.get::<_, i64>(0))?
            .collect::<Result<Vec<_>, _>>()?;
        Ok(ids.into_iter().collect())
    }
}

#[cfg(test)]
mod tests {
    use super::super::{models::NewContact, Database};

    fn sample_contact(db: &Database, nom: &str, prenom: &str) -> i64 {
        db.create_contact(NewContact {
            categorie: "CLIENT".into(),
            nom: nom.into(),
            prenom: prenom.into(),
            statut_suivi: Some("ACTIF".into()),
            famille_id: None,
            foyer_id: None,
            role_foyer: None,
            role_famille: None,
            filleul_categorie: None,
            parrain_id: None,
            prescripteur_id: None,
            civilite: None,
            email: None,
            telephone: None,
            adresse: None,
            code_postal: None,
            ville: None,
            pays: None,
            date_naissance: None,
            lieu_naissance: None,
            profession: None,
            situation_familiale: None,
            regime_matrimonial: None,
            revenus_annuels: None,
            charges_emprunts: None,
            objectifs_patrimoniaux: None,
            source_lead: None,
            profil_risque_sri: None,
            date_dernier_contact: None,
            date_prochain_suivi: None,
            date_dernier_contact_filleul: None,
            date_prochain_suivi_filleul: None,
            notes: None,
            registre: None,
            famille_regroupement_exclu: None,
            epargne_precaution_souhaitee: None,
        })
        .unwrap()
        .id
        .unwrap()
    }

    #[test]
    fn dismiss_persists_and_lists_contact_id() {
        let db = Database::open_in_memory_for_tests().unwrap();
        let id = sample_contact(&db, "Dupont", "Jean");
        assert!(!db.google_contact_name_proposal_dismissed_ids().unwrap().contains(&id));

        db.dismiss_google_contact_name_proposal(id).unwrap();
        assert!(db.google_contact_name_proposal_dismissed_ids().unwrap().contains(&id));

        db.dismiss_google_contact_name_proposal(id).unwrap();
        assert_eq!(db.google_contact_name_proposal_dismissed_ids().unwrap().len(), 1);
    }

    #[test]
    fn dismiss_removed_when_contact_deleted() {
        let db = Database::open_in_memory_for_tests().unwrap();
        let id = sample_contact(&db, "Martin", "Paul");
        db.dismiss_google_contact_name_proposal(id).unwrap();
        db.get_connection()
            .execute("DELETE FROM contacts WHERE id = ?1", rusqlite::params![id])
            .unwrap();
        assert!(db.google_contact_name_proposal_dismissed_ids().unwrap().is_empty());
    }
}
