//! Destinataires des événements « nouvelle souscription » (investissement nominatif vs commun foyer).

use super::models::Investissement;
use super::scpi_campaigns::contact_inherits_foyer_scpi_investments;
use super::Database;
use rusqlite::{params, Result};

impl Database {
    /// Contacts qui doivent recevoir l'événement souscription pour cet investissement.
    /// — `foyer_id` renseigné : adultes du foyer (hors ENFANT), aligné bulletins SCPI.
    /// — sinon : titulaire `contact_id` uniquement.
    pub fn souscription_event_recipient_contact_ids(
        &self,
        inv: &Investissement,
    ) -> Result<Vec<i64>> {
        if let Some(foyer_id) = inv.foyer_id {
            let mut stmt = self
                .conn
                .prepare("SELECT id, role_foyer FROM contacts WHERE foyer_id = ?1")?;
            let rows: Vec<(i64, Option<String>)> = stmt
                .query_map(params![foyer_id], |row| Ok((row.get(0)?, row.get(1)?)))?
                .collect::<Result<Vec<_>, _>>()?;
            let mut ids: Vec<i64> = rows
                .into_iter()
                .filter(|(_, role)| contact_inherits_foyer_scpi_investments(role.as_deref()))
                .map(|(id, _)| id)
                .collect();
            ids.sort_unstable();
            ids.dedup();
            return Ok(ids);
        }
        Ok(inv.contact_id.into_iter().collect())
    }
}

#[cfg(test)]
mod tests {
    use super::Database;
    use crate::database::models::{NewContact, NewFoyer, NewInvestissement};

    fn test_db() -> Database {
        Database::open_in_memory_for_tests().unwrap()
    }

    fn sample_foyer() -> NewFoyer {
        NewFoyer {
            nom: "Foyer test".into(),
            type_foyer: "COUPLE".into(),
            nombre_parts_fiscales: None,
            tranche_imposition: None,
            revenu_fiscal_reference: None,
            ir_net_a_payer: None,
            situation_patrimoniale: None,
            objectifs_patrimoniaux: None,
            notes: None,
        }
    }

    fn sample_client(nom: &str, prenom: &str) -> NewContact {
        NewContact {
            categorie: "CLIENT".into(),
            nom: nom.into(),
            prenom: prenom.into(),
            ..Default::default()
        }
    }

    #[test]
    fn communal_foyer_investment_notifies_adult_members() {
        let db = test_db();
        let foyer = db.create_foyer(sample_foyer()).unwrap();
        let fid = foyer.id;

        let c1 = db
            .create_contact(NewContact {
                foyer_id: Some(fid),
                role_foyer: Some("DECLARANT_1".into()),
                ..sample_client("GENTIL", "Gwendal")
            })
            .unwrap();
        let c1_id = c1.id.unwrap();
        let c2 = db
            .create_contact(NewContact {
                foyer_id: Some(fid),
                role_foyer: None,
                ..sample_client("NOYEZ", "Laurene")
            })
            .unwrap();
        let c2_id = c2.id.unwrap();
        let enfant = db
            .create_contact(NewContact {
                foyer_id: Some(fid),
                role_foyer: Some("ENFANT".into()),
                ..sample_client("GENTIL", "Enfant")
            })
            .unwrap();
        let enfant_id = enfant.id.unwrap();

        let inv = db
            .create_investissement(NewInvestissement {
                contact_id: Some(c1_id),
                foyer_id: Some(fid),
                type_produit: "SCPI".into(),
                partenaire_id: None,
                nom_produit: "Comète".into(),
                numero_contrat: None,
                montant_initial: Some(725_000),
                date_souscription: Some("2026-08-01".into()),
                date_fin_demembrement: None,
                date_fin_pret: None,
                date_dernier_arbitrage: None,
                date_prochain_arbitrage: None,
                mensualite_credit: None,
                credit_crd: None,
                loyer_mensuel: None,
                prevoyance_perso: None,
                prevoyance_pro: None,
                prevoyance_versement_mensuel: None,
                versement_programme: None,
                montant_versement_programme: None,
                frequence_versement: None,
                reinvestissement_dividendes: Some(false),
                notes: None,
                origine: Some("MON_CONSEIL".into()),
            })
            .unwrap();

        let recipients = db
            .souscription_event_recipient_contact_ids(&db.get_investissement_by_id(inv.id).unwrap())
            .unwrap();
        assert!(recipients.contains(&c1_id));
        assert!(recipients.contains(&c2_id));
        assert!(!recipients.contains(&enfant_id));
        assert_eq!(recipients.len(), 2);
    }

    #[test]
    fn personal_investment_notifies_holder_only() {
        let db = test_db();
        let contact = db.create_contact(sample_client("DUPONT", "Jean")).unwrap();
        let cid = contact.id.unwrap();
        let inv = db
            .create_investissement(NewInvestissement {
                contact_id: Some(cid),
                foyer_id: None,
                type_produit: "SCPI".into(),
                partenaire_id: None,
                nom_produit: "Test".into(),
                numero_contrat: None,
                montant_initial: Some(10_000),
                date_souscription: Some("2023-11-15".into()),
                date_fin_demembrement: None,
                date_fin_pret: None,
                date_dernier_arbitrage: None,
                date_prochain_arbitrage: None,
                mensualite_credit: None,
                credit_crd: None,
                loyer_mensuel: None,
                prevoyance_perso: None,
                prevoyance_pro: None,
                prevoyance_versement_mensuel: None,
                versement_programme: None,
                montant_versement_programme: None,
                frequence_versement: None,
                reinvestissement_dividendes: None,
                notes: None,
                origine: Some("MON_CONSEIL".into()),
            })
            .unwrap();

        let recipients = db
            .souscription_event_recipient_contact_ids(&db.get_investissement_by_id(inv.id).unwrap())
            .unwrap();
        assert_eq!(recipients, vec![cid]);
    }
}
