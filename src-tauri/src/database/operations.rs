use super::investissement_produit_match::nom_produit_matches;
use super::Database;
use rusqlite::{params, Result};

pub(crate) const REDUCTION_IMPOT_ETIQUETTE_CANONICAL: &str = "Réduction d'impôt fin d'année";

/// Investissement compté dans l'encours (hors clôturés).
pub(crate) const INVESTISSEMENT_ACTIF_ENCOURS_WHERE_I: &str =
    "COALESCE(i.statut, 'ACTIF') = 'ACTIF'";
pub(crate) const INVESTISSEMENT_ACTIF_ENCOURS_WHERE: &str =
    "COALESCE(statut, 'ACTIF') = 'ACTIF'";

/// Encours = dernière valorisation (ou montant initial) + versements complémentaires postérieurs.
pub(crate) const EFFECTIVE_ENCOURS_SQL_I: &str = "(
    COALESCE(
        (SELECT v.montant FROM investissement_valorisations v WHERE v.investissement_id = i.id ORDER BY v.date_valorisation DESC, v.id DESC LIMIT 1),
        COALESCE(i.montant_initial, 0)
    )
    + COALESCE(
        (SELECT SUM(vr.montant) FROM investissement_versements vr
         WHERE vr.investissement_id = i.id
           AND vr.date_versement > COALESCE(
             (SELECT v.date_valorisation FROM investissement_valorisations v WHERE v.investissement_id = i.id ORDER BY v.date_valorisation DESC, v.id DESC LIMIT 1),
             -1
           )),
        0
    )
)";

pub(crate) const EFFECTIVE_ENCOURS_SQL: &str = "(
    COALESCE(
        (SELECT v.montant FROM investissement_valorisations v WHERE v.investissement_id = investissements.id ORDER BY v.date_valorisation DESC, v.id DESC LIMIT 1),
        COALESCE(investissements.montant_initial, 0)
    )
    + COALESCE(
        (SELECT SUM(vr.montant) FROM investissement_versements vr
         WHERE vr.investissement_id = investissements.id
           AND vr.date_versement > COALESCE(
             (SELECT v.date_valorisation FROM investissement_valorisations v WHERE v.investissement_id = investissements.id ORDER BY v.date_valorisation DESC, v.id DESC LIMIT 1),
             -1
           )),
        0
    )
)";

pub(crate) const EFFECTIVE_ENCOURS_DATE_SQL: &str = "COALESCE(
    (SELECT vr.date_versement FROM investissement_versements vr
     WHERE vr.investissement_id = investissements.id
       AND vr.date_versement > COALESCE(
         (SELECT v.date_valorisation FROM investissement_valorisations v WHERE v.investissement_id = investissements.id ORDER BY v.date_valorisation DESC, v.id DESC LIMIT 1),
         -1
       )
     ORDER BY vr.date_versement DESC, vr.id DESC LIMIT 1),
    (SELECT v.date_valorisation FROM investissement_valorisations v WHERE v.investissement_id = investissements.id ORDER BY v.date_valorisation DESC, v.id DESC LIMIT 1),
    investissements.date_souscription
)";

/// Montant investi = souscription initiale + somme des versements complémentaires.
pub(crate) const MONTANT_INVESTI_TOTAL_SQL: &str = "(
    COALESCE(investissements.montant_initial, 0)
    + COALESCE(
        (SELECT SUM(vr.montant) FROM investissement_versements vr
         WHERE vr.investissement_id = investissements.id),
        0
    )
)";

pub(crate) const MONTANT_INVESTI_TOTAL_SQL_I: &str = "(
    COALESCE(i.montant_initial, 0)
    + COALESCE(
        (SELECT SUM(vr.montant) FROM investissement_versements vr
         WHERE vr.investissement_id = i.id),
        0
    )
)";

pub(crate) const EFFECTIVE_ENCOURS_DATE_SQL_I: &str = "COALESCE(
    (SELECT vr.date_versement FROM investissement_versements vr
     WHERE vr.investissement_id = i.id
       AND vr.date_versement > COALESCE(
         (SELECT v.date_valorisation FROM investissement_valorisations v WHERE v.investissement_id = i.id ORDER BY v.date_valorisation DESC, v.id DESC LIMIT 1),
         -1
       )
     ORDER BY vr.date_versement DESC, vr.id DESC LIMIT 1),
    (SELECT v.date_valorisation FROM investissement_valorisations v WHERE v.investissement_id = i.id ORDER BY v.date_valorisation DESC, v.id DESC LIMIT 1),
    i.date_souscription
)";

// Colonnes encours effectif (montant + date) pour les SELECT investissements.
// Dernier snapshot Stellium (ignore un encours manuel plus récent sans données Stellium).
const LATEST_STELLIUM_VERSEMENTS_SQL: &str = "(SELECT v.stellium_versements_nets_centimes FROM investissement_valorisations v WHERE v.investissement_id = investissements.id AND (v.stellium_versements_nets_centimes IS NOT NULL OR v.stellium_perf_euro_centimes IS NOT NULL) ORDER BY v.date_valorisation DESC, v.id DESC LIMIT 1)";

const LATEST_STELLIUM_PERF_SQL: &str = "(SELECT v.stellium_perf_euro_centimes FROM investissement_valorisations v WHERE v.investissement_id = investissements.id AND (v.stellium_versements_nets_centimes IS NOT NULL OR v.stellium_perf_euro_centimes IS NOT NULL) ORDER BY v.date_valorisation DESC, v.id DESC LIMIT 1)";

const LATEST_STELLIUM_VERSEMENTS_SQL_I: &str = "(SELECT v.stellium_versements_nets_centimes FROM investissement_valorisations v WHERE v.investissement_id = i.id AND (v.stellium_versements_nets_centimes IS NOT NULL OR v.stellium_perf_euro_centimes IS NOT NULL) ORDER BY v.date_valorisation DESC, v.id DESC LIMIT 1)";

const LATEST_STELLIUM_PERF_SQL_I: &str = "(SELECT v.stellium_perf_euro_centimes FROM investissement_valorisations v WHERE v.investissement_id = i.id AND (v.stellium_versements_nets_centimes IS NOT NULL OR v.stellium_perf_euro_centimes IS NOT NULL) ORDER BY v.date_valorisation DESC, v.id DESC LIMIT 1)";

pub(crate) fn investissement_encours_select_cols() -> String {
    format!(
        "{EFFECTIVE_ENCOURS_SQL}, {EFFECTIVE_ENCOURS_DATE_SQL}, {MONTANT_INVESTI_TOTAL_SQL}, {LATEST_STELLIUM_VERSEMENTS_SQL}, {LATEST_STELLIUM_PERF_SQL}"
    )
}

pub(crate) fn investissement_encours_select_cols_i() -> String {
    format!(
        "{EFFECTIVE_ENCOURS_SQL_I}, {EFFECTIVE_ENCOURS_DATE_SQL_I}, {MONTANT_INVESTI_TOTAL_SQL_I}, {LATEST_STELLIUM_VERSEMENTS_SQL_I}, {LATEST_STELLIUM_PERF_SQL_I}"
    )
}

impl Database {

    // ==================== MOTEUR AUTOMATIQUE ETIQUETTES ====================

    /// Investissements actifs du contact OU du foyer commun (hors clôturés).
    pub(crate) const INVESTISSEMENT_SCOPE_WHERE: &'static str =
        "(contact_id = ?1 OR (?2 IS NOT NULL AND foyer_id = ?2)) AND COALESCE(statut, 'ACTIF') = 'ACTIF'";

    /// Au moins un investissement (contact ou foyer) correspond aux filtres.
    /// `types` et `noms_produit` sont combinés en ET sur la même ligne ; l'un des deux peut être vide.
    pub(crate) fn contact_has_investment_types_and_noms(
        &self,
        contact_id: i64,
        foyer_id: Option<i64>,
        types: &[String],
        noms: &[String],
    ) -> Result<bool> {
        if types.is_empty() && noms.is_empty() {
            return Ok(false);
        }

        // Chemin rapide : types seuls (COUNT, pas de fuzzy match).
        if noms.is_empty() && !types.is_empty() {
            let types_str = types
                .iter()
                .map(|t| format!("'{}'", t.replace('\'', "''")))
                .collect::<Vec<_>>()
                .join(",");
            let sql = format!(
                "SELECT COUNT(*) FROM investissements WHERE {} AND type_produit IN ({})",
                Self::INVESTISSEMENT_SCOPE_WHERE,
                types_str
            );
            let count: i64 = self
                .conn
                .query_row(&sql, params![contact_id, foyer_id], |row| row.get(0))?;
            return Ok(count > 0);
        }

        let type_filter = if types.is_empty() {
            String::new()
        } else {
            let types_str = types
                .iter()
                .map(|t| format!("'{}'", t.replace('\'', "''")))
                .collect::<Vec<_>>()
                .join(",");
            format!(" AND type_produit IN ({})", types_str)
        };

        let nom_filter = if noms.is_empty() {
            String::new()
        } else {
            " AND TRIM(nom_produit) != ''".to_string()
        };

        let sql = format!(
            "SELECT type_produit, TRIM(nom_produit) FROM investissements
             WHERE {}{}",
            Self::INVESTISSEMENT_SCOPE_WHERE,
            format!("{}{}", nom_filter, type_filter)
        );

        let mut stmt = self.conn.prepare(&sql)?;
        let rows = stmt.query_map(params![contact_id, foyer_id], |row| {
            Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?))
        })?;

        for row in rows {
            let (type_produit, nom) = row?;
            let type_ok = types.is_empty() || types.iter().any(|t| t == &type_produit);
            let nom_ok = noms.is_empty() || noms.iter().any(|n| nom_produit_matches(&nom, n));
            if type_ok && nom_ok {
                return Ok(true);
            }
        }
        Ok(false)
    }

    pub(crate) fn contact_has_investment_date_approaching(
        &self,
        contact_id: i64,
        foyer_id: Option<i64>,
        champ: &str,
        jours_avant: i64,
        types_produit: &[String],
        now: i64,
    ) -> Result<bool> {
        let allowed = [
            "date_fin_demembrement",
            "date_fin_pret",
            "date_souscription",
        ];
        if !allowed.contains(&champ) {
            return Ok(false);
        }
        let type_filter = if types_produit.is_empty() {
            String::new()
        } else {
            let types_str = types_produit
                .iter()
                .map(|t| format!("'{}'", t.replace('\'', "''")))
                .collect::<Vec<_>>()
                .join(",");
            format!(" AND type_produit IN ({})", types_str)
        };
        let threshold = now + (jours_avant * 24 * 60 * 60);
        let query = format!(
            "SELECT COUNT(*) FROM investissements WHERE {} 
             AND {} IS NOT NULL AND {} > ?3 AND {} <= ?4{}",
            Self::INVESTISSEMENT_SCOPE_WHERE,
            champ,
            champ,
            champ,
            type_filter
        );
        let count: i64 = self.conn.query_row(
            &query,
            params![contact_id, foyer_id, now, threshold],
            |row| row.get(0),
        )?;
        Ok(count > 0)
    }
}

#[cfg(test)]
mod database_integration_tests {
    use super::*;
    use chrono::TimeZone;
    use crate::database::models::{
        NewContact, NewFoyer, NewInvestissement, NewInvestissementValorisation,
        NewInvestissementVersement,
    };
    use crate::database::Database;

    fn test_db() -> Database {
        Database::open_in_memory_for_tests().expect("in-memory db")
    }

    fn sample_contact(nom: &str, prenom: &str) -> NewContact {
        NewContact {
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
            date_r1: None,
            type_invitation_filleul: None,
            date_invitation_filleul: None,
            presence_invitation_filleul: None,
            notes: None,
            registre: None,
            famille_regroupement_exclu: None,
            epargne_precaution_souhaitee: None,
        }
    }

    #[test]
    fn create_investissement_sets_dernier_contact_from_souscription_when_empty() {
        let db = test_db();
        let contact = db.create_contact(sample_contact("Dupont", "Jean")).unwrap();
        let souscription_ts = chrono::Utc.with_ymd_and_hms(2025, 3, 15, 0, 0, 0).unwrap().timestamp();
        let iso = chrono::DateTime::from_timestamp(souscription_ts, 0)
            .unwrap()
            .to_rfc3339();

        db.create_investissement(NewInvestissement {
            contact_id: contact.id,
            foyer_id: None,
            type_produit: "ASSURANCE_VIE".into(),
            partenaire_id: None,
            nom_produit: "Contrat test".into(),
            numero_contrat: None,
            montant_initial: Some(100_000),
            date_souscription: Some(iso),
            date_fin_demembrement: None,
            date_fin_pret: None,
            mensualite_credit: None,
            credit_crd: None,
            loyer_mensuel: None,
            versement_programme: None,
            montant_versement_programme: None,
            frequence_versement: None,
            reinvestissement_dividendes: None,
            notes: None,
            origine: Some("MON_CONSEIL".into()),
        })
        .unwrap();

        let updated = db.get_contact_by_id(contact.id.unwrap()).unwrap();
        assert_eq!(updated.date_dernier_contact, Some(souscription_ts));
    }

    #[test]
    fn dashboard_encours_uses_valorisation_with_fallback_to_montant_initial() {
        let db = test_db();
        let contact = db.create_contact(sample_contact("Martin", "Paul")).unwrap();
        let contact_id = contact.id.unwrap();

        let inv = db
            .create_investissement(NewInvestissement {
                contact_id: Some(contact_id),
                foyer_id: None,
                type_produit: "ASSURANCE_VIE".into(),
                partenaire_id: None,
                nom_produit: "AV test".into(),
                numero_contrat: None,
                montant_initial: Some(2_000_000),
                date_souscription: None,
                date_fin_demembrement: None,
                date_fin_pret: None,
                mensualite_credit: None,
                credit_crd: None,
                loyer_mensuel: None,
                versement_programme: None,
                montant_versement_programme: None,
                frequence_versement: None,
                reinvestissement_dividendes: None,
                notes: None,
                origine: Some("MON_CONSEIL".into()),
            })
            .unwrap();

        let stats_before = db.get_dashboard_stats().unwrap();
        assert!((stats_before.encours_placements - 20_000.0).abs() < 0.01);

        db.create_investissement_valorisation(NewInvestissementValorisation {
            investissement_id: inv.id,
            montant: 2_500_000,
            date_valorisation: None,
            notes: None,
            stellium_versements_nets_centimes: None,
            stellium_perf_euro_centimes: None,
        })
        .unwrap();

        let stats_after = db.get_dashboard_stats().unwrap();
        assert!((stats_after.encours_placements - 25_000.0).abs() < 0.01);

        let refreshed = db.get_investissement_by_id(inv.id).unwrap();
        assert_eq!(refreshed.encours_actuel, Some(2_500_000));
        assert_eq!(refreshed.montant_initial, Some(2_000_000));
    }

    #[test]
    fn dashboard_encours_includes_versements_complementaires() {
        let db = test_db();
        let contact = db.create_contact(sample_contact("Bernard", "Marie")).unwrap();
        let contact_id = contact.id.unwrap();

        let inv = db
            .create_investissement(NewInvestissement {
                contact_id: Some(contact_id),
                foyer_id: None,
                type_produit: "ASSURANCE_VIE".into(),
                partenaire_id: None,
                nom_produit: "AV test".into(),
                numero_contrat: None,
                montant_initial: Some(10_000_00),
                date_souscription: None,
                date_fin_demembrement: None,
                date_fin_pret: None,
                mensualite_credit: None,
                credit_crd: None,
                loyer_mensuel: None,
                versement_programme: None,
                montant_versement_programme: None,
                frequence_versement: None,
                reinvestissement_dividendes: None,
                notes: None,
                origine: Some("MON_CONSEIL".into()),
            })
            .unwrap();

        let complement_ts = chrono::Utc.with_ymd_and_hms(2025, 3, 15, 0, 0, 0).unwrap().timestamp();
        let complement_iso = chrono::DateTime::from_timestamp(complement_ts, 0)
            .unwrap()
            .to_rfc3339();

        db.create_investissement_versement(NewInvestissementVersement {
            investissement_id: inv.id,
            montant: 2_500_00,
            date_versement: Some(complement_iso),
            notes: None,
        })
        .unwrap();

        let stats = db.get_dashboard_stats().unwrap();
        assert!((stats.encours_placements - 12_500.0).abs() < 0.01);

        let refreshed = db.get_investissement_by_id(inv.id).unwrap();
        assert_eq!(refreshed.encours_actuel, Some(12_500_00));
        assert_eq!(refreshed.montant_investi_total, Some(12_500_00));

        let yearly = db.get_yearly_activity_stats(None, None, None).unwrap();
        let y2025 = yearly.iter().find(|s| s.year == 2025).unwrap();
        assert_eq!(y2025.clients, 1);
        assert!((y2025.panier_moyen - 2_500.0).abs() < 0.01);
    }

    #[test]
    fn dashboard_encours_excludes_existant_client() {
        let db = test_db();
        let contact = db.create_contact(sample_contact("Durand", "Luc")).unwrap();
        let contact_id = contact.id.unwrap();

        db.create_investissement(NewInvestissement {
            contact_id: Some(contact_id),
            foyer_id: None,
            type_produit: "ASSURANCE_VIE".into(),
            partenaire_id: None,
            nom_produit: "AV avec moi".into(),
            numero_contrat: None,
            montant_initial: Some(1_000_000),
            date_souscription: None,
            date_fin_demembrement: None,
            date_fin_pret: None,
            mensualite_credit: None,
            credit_crd: None,
            loyer_mensuel: None,
            versement_programme: None,
            montant_versement_programme: None,
            frequence_versement: None,
            reinvestissement_dividendes: None,
            notes: None,
            origine: Some("MON_CONSEIL".into()),
        })
        .unwrap();

        db.create_investissement(NewInvestissement {
            contact_id: Some(contact_id),
            foyer_id: None,
            type_produit: "PER".into(),
            partenaire_id: None,
            nom_produit: "PER à côté".into(),
            numero_contrat: None,
            montant_initial: Some(5_000_000),
            date_souscription: None,
            date_fin_demembrement: None,
            date_fin_pret: None,
            mensualite_credit: None,
            credit_crd: None,
            loyer_mensuel: None,
            versement_programme: None,
            montant_versement_programme: None,
            frequence_versement: None,
            reinvestissement_dividendes: None,
            notes: None,
            origine: Some("EXISTANT_CLIENT".into()),
        })
        .unwrap();

        let stats = db.get_dashboard_stats().unwrap();
        assert!((stats.encours_placements - 10_000.0).abs() < 0.01);
        assert_eq!(stats.nombre_biens_immobiliers, 0);
        assert!((stats.versements_programmes_annuels - 0.0).abs() < 0.01);
    }

    #[test]
    fn dashboard_versements_and_immo_excludes_existant_client() {
        let db = test_db();
        let contact = db.create_contact(sample_contact("Martin", "Paul")).unwrap();
        let contact_id = contact.id.unwrap();

        db.create_investissement(NewInvestissement {
            contact_id: Some(contact_id),
            foyer_id: None,
            type_produit: "ASSURANCE_VIE".into(),
            partenaire_id: None,
            nom_produit: "AV VP avec moi".into(),
            numero_contrat: None,
            montant_initial: Some(1_000_000),
            date_souscription: None,
            date_fin_demembrement: None,
            date_fin_pret: None,
            mensualite_credit: None,
            credit_crd: None,
            loyer_mensuel: None,
            versement_programme: Some(true),
            montant_versement_programme: Some(10_000),
            frequence_versement: Some("MENSUEL".into()),
            reinvestissement_dividendes: None,
            notes: None,
            origine: Some("MON_CONSEIL".into()),
        })
        .unwrap();

        db.create_investissement(NewInvestissement {
            contact_id: Some(contact_id),
            foyer_id: None,
            type_produit: "ASSURANCE_VIE".into(),
            partenaire_id: None,
            nom_produit: "AV VP à côté".into(),
            numero_contrat: None,
            montant_initial: Some(1_000_000),
            date_souscription: None,
            date_fin_demembrement: None,
            date_fin_pret: None,
            mensualite_credit: None,
            credit_crd: None,
            loyer_mensuel: None,
            versement_programme: Some(true),
            montant_versement_programme: Some(50_000),
            frequence_versement: Some("MENSUEL".into()),
            reinvestissement_dividendes: None,
            notes: None,
            origine: Some("EXISTANT_CLIENT".into()),
        })
        .unwrap();

        db.create_investissement(NewInvestissement {
            contact_id: Some(contact_id),
            foyer_id: None,
            type_produit: "IMMOBILIER".into(),
            partenaire_id: None,
            nom_produit: "Immo avec moi".into(),
            numero_contrat: None,
            montant_initial: Some(200_000_00),
            date_souscription: None,
            date_fin_demembrement: None,
            date_fin_pret: None,
            mensualite_credit: None,
            credit_crd: None,
            loyer_mensuel: None,
            versement_programme: None,
            montant_versement_programme: None,
            frequence_versement: None,
            reinvestissement_dividendes: None,
            notes: None,
            origine: Some("MON_CONSEIL".into()),
        })
        .unwrap();

        db.create_investissement(NewInvestissement {
            contact_id: Some(contact_id),
            foyer_id: None,
            type_produit: "IMMOBILIER".into(),
            partenaire_id: None,
            nom_produit: "Immo à côté".into(),
            numero_contrat: None,
            montant_initial: Some(300_000_00),
            date_souscription: None,
            date_fin_demembrement: None,
            date_fin_pret: None,
            mensualite_credit: None,
            credit_crd: None,
            loyer_mensuel: None,
            versement_programme: None,
            montant_versement_programme: None,
            frequence_versement: None,
            reinvestissement_dividendes: None,
            notes: None,
            origine: Some("EXISTANT_CLIENT".into()),
        })
        .unwrap();

        let stats = db.get_dashboard_stats().unwrap();
        // 100 €/mois × 12 = 1 200 €/an (seul « avec moi »)
        assert!((stats.versements_programmes_annuels - 1_200.0).abs() < 0.01);
        assert_eq!(stats.nombre_biens_immobiliers, 1);
    }

    #[test]
    fn product_stats_excludes_existant_client() {
        let db = test_db();
        let contact = db.create_contact(sample_contact("Leroy", "Anne")).unwrap();
        let contact_id = contact.id.unwrap();

        db.create_investissement(NewInvestissement {
            contact_id: Some(contact_id),
            foyer_id: None,
            type_produit: "PINEL".into(),
            partenaire_id: None,
            nom_produit: "Pinel avec moi".into(),
            numero_contrat: None,
            montant_initial: Some(100_000_00),
            date_souscription: None,
            date_fin_demembrement: None,
            date_fin_pret: None,
            mensualite_credit: None,
            credit_crd: None,
            loyer_mensuel: None,
            versement_programme: None,
            montant_versement_programme: None,
            frequence_versement: None,
            reinvestissement_dividendes: None,
            notes: None,
            origine: Some("MON_CONSEIL".into()),
        })
        .unwrap();

        db.create_investissement(NewInvestissement {
            contact_id: Some(contact_id),
            foyer_id: None,
            type_produit: "SCPI".into(),
            partenaire_id: None,
            nom_produit: "SCPI à côté".into(),
            numero_contrat: None,
            montant_initial: Some(500_000_00),
            date_souscription: None,
            date_fin_demembrement: None,
            date_fin_pret: None,
            mensualite_credit: None,
            credit_crd: None,
            loyer_mensuel: None,
            versement_programme: None,
            montant_versement_programme: None,
            frequence_versement: None,
            reinvestissement_dividendes: None,
            notes: None,
            origine: Some("EXISTANT_CLIENT".into()),
        })
        .unwrap();

        let stats = db.get_product_stats().unwrap();
        assert_eq!(stats.len(), 1);
        assert_eq!(stats[0].type_produit, "PINEL");
        assert!((stats[0].montant - 100_000.0).abs() < 0.01);
    }

    #[test]
    fn panier_moyen_uses_montant_initial_not_encours() {
        let db = test_db();
        let contact = db.create_contact(sample_contact("Petit", "Jean")).unwrap();
        let contact_id = contact.id.unwrap();

        let inv = db
            .create_investissement(NewInvestissement {
                contact_id: Some(contact_id),
                foyer_id: None,
                type_produit: "ASSURANCE_VIE".into(),
                partenaire_id: None,
                nom_produit: "AV".into(),
                numero_contrat: None,
                montant_initial: Some(2_000_000),
                date_souscription: None,
                date_fin_demembrement: None,
                date_fin_pret: None,
                mensualite_credit: None,
                credit_crd: None,
                loyer_mensuel: None,
                versement_programme: None,
                montant_versement_programme: None,
                frequence_versement: None,
                reinvestissement_dividendes: None,
                notes: None,
                origine: Some("MON_CONSEIL".into()),
            })
            .unwrap();

        db.create_investissement_valorisation(NewInvestissementValorisation {
            investissement_id: inv.id,
            montant: 3_000_000,
            date_valorisation: None,
            notes: None,
            stellium_versements_nets_centimes: None,
            stellium_perf_euro_centimes: None,
        })
        .unwrap();

        let stats = db.get_dashboard_stats().unwrap();
        assert!((stats.encours_placements - 30_000.0).abs() < 0.01);
        assert!((stats.panier_moyen - 20_000.0).abs() < 0.01);
    }

    #[test]
    fn closed_investissement_excluded_from_encours_kept_in_panier_moyen() {
        let db = test_db();
        let contact = db.create_contact(sample_contact("Vendu", "Luc")).unwrap();
        let contact_id = contact.id.unwrap();

        let inv = db
            .create_investissement(NewInvestissement {
                contact_id: Some(contact_id),
                foyer_id: None,
                type_produit: "ASSURANCE_VIE".into(),
                partenaire_id: None,
                nom_produit: "AV clôturée".into(),
                numero_contrat: None,
                montant_initial: Some(5_000_000),
                date_souscription: None,
                date_fin_demembrement: None,
                date_fin_pret: None,
                mensualite_credit: None,
                credit_crd: None,
                loyer_mensuel: None,
                versement_programme: None,
                montant_versement_programme: None,
                frequence_versement: None,
                reinvestissement_dividendes: None,
                notes: None,
                origine: Some("MON_CONSEIL".into()),
            })
            .unwrap();

        db.create_investissement_valorisation(NewInvestissementValorisation {
            investissement_id: inv.id,
            montant: 6_000_000,
            date_valorisation: None,
            notes: None,
            stellium_versements_nets_centimes: None,
            stellium_perf_euro_centimes: None,
        })
        .unwrap();

        let stats_before = db.get_dashboard_stats().unwrap();
        assert!((stats_before.encours_placements - 60_000.0).abs() < 0.01);
        assert!((stats_before.panier_moyen - 50_000.0).abs() < 0.01);

        db.close_investissement(inv.id, Some(1_700_000_000)).unwrap();

        let contact_after = db.get_contact_by_id(contact_id).unwrap();
        assert_eq!(
            contact_after.statut_suivi, "EN_PAUSE",
            "dernier encours clôturé → suivi client en pause"
        );

        let stats_after = db.get_dashboard_stats().unwrap();
        assert!((stats_after.encours_placements - 0.0).abs() < 0.01);
        assert!((stats_after.panier_moyen - 50_000.0).abs() < 0.01);

        let refreshed = db.get_investissement_by_id(inv.id).unwrap();
        assert_eq!(refreshed.statut, "CLOTURE");
        assert_eq!(refreshed.date_cloture, Some(1_700_000_000));
        assert!(!refreshed.versement_programme);
    }

    #[test]
    fn reopen_investissement_reactivates_paused_client_suivi() {
        let db = test_db();
        let contact = db.create_contact(sample_contact("Rouvert", "Marie")).unwrap();
        let contact_id = contact.id.unwrap();

        let inv = db
            .create_investissement(NewInvestissement {
                contact_id: Some(contact_id),
                foyer_id: None,
                type_produit: "ASSURANCE_VIE".into(),
                partenaire_id: None,
                nom_produit: "AV".into(),
                numero_contrat: None,
                montant_initial: Some(1_000_000),
                date_souscription: None,
                date_fin_demembrement: None,
                date_fin_pret: None,
                mensualite_credit: None,
                credit_crd: None,
                loyer_mensuel: None,
                versement_programme: None,
                montant_versement_programme: None,
                frequence_versement: None,
                reinvestissement_dividendes: None,
                notes: None,
                origine: Some("MON_CONSEIL".into()),
            })
            .unwrap();

        db.close_investissement(inv.id, None).unwrap();
        assert_eq!(
            db.get_contact_by_id(contact_id).unwrap().statut_suivi,
            "EN_PAUSE"
        );

        db.reopen_investissement(inv.id).unwrap();
        assert_eq!(
            db.get_contact_by_id(contact_id).unwrap().statut_suivi,
            "ACTIF"
        );
    }

    #[test]
    fn valorisation_same_day_replaces_existing_releve() {
        let db = test_db();
        let contact = db.create_contact(sample_contact("Blanc", "Anne")).unwrap();
        let inv = db
            .create_investissement(NewInvestissement {
                contact_id: contact.id,
                foyer_id: None,
                type_produit: "PER".into(),
                partenaire_id: None,
                nom_produit: "PER".into(),
                numero_contrat: None,
                montant_initial: Some(1_000_000),
                date_souscription: None,
                date_fin_demembrement: None,
                date_fin_pret: None,
                mensualite_credit: None,
                credit_crd: None,
                loyer_mensuel: None,
                versement_programme: None,
                montant_versement_programme: None,
                frequence_versement: None,
                reinvestissement_dividendes: None,
                notes: None,
                origine: Some("MON_CONSEIL".into()),
            })
            .unwrap();

        let day = chrono::Utc.with_ymd_and_hms(2026, 3, 15, 0, 0, 0).unwrap();
        let iso = day.to_rfc3339();

        db.create_investissement_valorisation(NewInvestissementValorisation {
            investissement_id: inv.id,
            montant: 1_100_000,
            date_valorisation: Some(iso.clone()),
            notes: None,
            stellium_versements_nets_centimes: None,
            stellium_perf_euro_centimes: None,
        })
        .unwrap();

        db.create_investissement_valorisation(NewInvestissementValorisation {
            investissement_id: inv.id,
            montant: 1_250_000,
            date_valorisation: Some(iso),
            notes: None,
            stellium_versements_nets_centimes: None,
            stellium_perf_euro_centimes: None,
        })
        .unwrap();

        let rows = db.get_valorisations_by_investissement(inv.id).unwrap();
        assert_eq!(rows.len(), 1);
        assert_eq!(rows[0].montant, 1_250_000);
    }

    #[test]
    fn create_investissement_mon_conseil_promotes_prospect_client_to_client() {
        let db = test_db();
        let mut prospect = sample_contact("Dupont", "Marie");
        prospect.categorie = "PROSPECT_CLIENT".into();
        let contact = db.create_contact(prospect).unwrap();
        let contact_id = contact.id.unwrap();

        db.create_investissement(NewInvestissement {
            contact_id: Some(contact_id),
            foyer_id: None,
            type_produit: "ASSURANCE_VIE".into(),
            partenaire_id: None,
            nom_produit: "Contrat test".into(),
            numero_contrat: None,
            montant_initial: Some(50_000),
            date_souscription: None,
            date_fin_demembrement: None,
            date_fin_pret: None,
            mensualite_credit: None,
            credit_crd: None,
            loyer_mensuel: None,
            versement_programme: None,
            montant_versement_programme: None,
            frequence_versement: None,
            reinvestissement_dividendes: None,
            notes: None,
            origine: Some("MON_CONSEIL".into()),
        })
        .unwrap();

        let updated = db.get_contact_by_id(contact_id).unwrap();
        assert_eq!(updated.categorie, "CLIENT");
    }

    #[test]
    fn create_investissement_mon_conseil_promotes_suspect_client_to_client() {
        let db = test_db();
        let mut suspect = sample_contact("Martin", "Paul");
        suspect.categorie = "SUSPECT_CLIENT".into();
        let contact = db.create_contact(suspect).unwrap();
        let contact_id = contact.id.unwrap();

        db.create_investissement(NewInvestissement {
            contact_id: Some(contact_id),
            foyer_id: None,
            type_produit: "SCPI".into(),
            partenaire_id: None,
            nom_produit: "SCPI test".into(),
            numero_contrat: None,
            montant_initial: Some(10_000),
            date_souscription: None,
            date_fin_demembrement: None,
            date_fin_pret: None,
            mensualite_credit: None,
            credit_crd: None,
            loyer_mensuel: None,
            versement_programme: None,
            montant_versement_programme: None,
            frequence_versement: None,
            reinvestissement_dividendes: None,
            notes: None,
            origine: Some("MON_CONSEIL".into()),
        })
        .unwrap();

        let updated = db.get_contact_by_id(contact_id).unwrap();
        assert_eq!(updated.categorie, "CLIENT");
    }

    #[test]
    fn create_investissement_existant_client_does_not_promote_prospect() {
        let db = test_db();
        let mut prospect = sample_contact("Bernard", "Luc");
        prospect.categorie = "PROSPECT_CLIENT".into();
        let contact = db.create_contact(prospect).unwrap();
        let contact_id = contact.id.unwrap();

        db.create_investissement(NewInvestissement {
            contact_id: Some(contact_id),
            foyer_id: None,
            type_produit: "ASSURANCE_VIE".into(),
            partenaire_id: None,
            nom_produit: "Patrimoine existant".into(),
            numero_contrat: None,
            montant_initial: Some(200_000),
            date_souscription: None,
            date_fin_demembrement: None,
            date_fin_pret: None,
            mensualite_credit: None,
            credit_crd: None,
            loyer_mensuel: None,
            versement_programme: None,
            montant_versement_programme: None,
            frequence_versement: None,
            reinvestissement_dividendes: None,
            notes: None,
            origine: Some("EXISTANT_CLIENT".into()),
        })
        .unwrap();

        let updated = db.get_contact_by_id(contact_id).unwrap();
        assert_eq!(updated.categorie, "PROSPECT_CLIENT");
    }

    #[test]
    fn souscription_event_eligible_only_mon_conseil_with_contact() {
        let db = test_db();
        let contact = db.create_contact(sample_contact("Martin", "Paul")).unwrap();
        let contact_id = contact.id.unwrap();

        let avec_moi = db
            .create_investissement(NewInvestissement {
                contact_id: Some(contact_id),
                foyer_id: None,
                type_produit: "ASSURANCE_VIE".into(),
                partenaire_id: None,
                nom_produit: "AV 1".into(),
                numero_contrat: None,
                montant_initial: Some(10_000),
                date_souscription: None,
                date_fin_demembrement: None,
                date_fin_pret: None,
                mensualite_credit: None,
                credit_crd: None,
                loyer_mensuel: None,
                versement_programme: None,
                montant_versement_programme: None,
                frequence_versement: None,
                reinvestissement_dividendes: None,
                notes: None,
                origine: Some("MON_CONSEIL".into()),
            })
            .unwrap();
        assert!(
            db.investissement_eligible_souscription_event(avec_moi.id)
                .unwrap()
        );

        let second_avec_moi = db
            .create_investissement(NewInvestissement {
                contact_id: Some(contact_id),
                foyer_id: None,
                type_produit: "PER".into(),
                partenaire_id: None,
                nom_produit: "PER 2".into(),
                numero_contrat: None,
                montant_initial: Some(5_000),
                date_souscription: None,
                date_fin_demembrement: None,
                date_fin_pret: None,
                mensualite_credit: None,
                credit_crd: None,
                loyer_mensuel: None,
                versement_programme: None,
                montant_versement_programme: None,
                frequence_versement: None,
                reinvestissement_dividendes: None,
                notes: None,
                origine: Some("MON_CONSEIL".into()),
            })
            .unwrap();
        assert!(
            db.investissement_eligible_souscription_event(second_avec_moi.id)
                .unwrap(),
            "chaque nouveau « avec moi » reste éligible (mode « à chaque souscription » du modèle)"
        );

        let a_cote = db
            .create_investissement(NewInvestissement {
                contact_id: Some(contact_id),
                foyer_id: None,
                type_produit: "LIVRET_A".into(),
                partenaire_id: None,
                nom_produit: "Livret A".into(),
                numero_contrat: None,
                montant_initial: Some(3_000),
                date_souscription: None,
                date_fin_demembrement: None,
                date_fin_pret: None,
                mensualite_credit: None,
                credit_crd: None,
                loyer_mensuel: None,
                versement_programme: None,
                montant_versement_programme: None,
                frequence_versement: None,
                reinvestissement_dividendes: None,
                notes: None,
                origine: Some("EXISTANT_CLIENT".into()),
            })
            .unwrap();
        assert!(
            !db.investissement_eligible_souscription_event(a_cote.id)
                .unwrap()
        );
    }

    fn investissement_with_souscription(
        db: &Database,
        contact_id: i64,
        year: i32,
        month: u32,
        montant_centimes: i64,
    ) {
        let ts = chrono::Utc
            .with_ymd_and_hms(year, month, 15, 0, 0, 0)
            .unwrap()
            .timestamp();
        let iso = chrono::DateTime::from_timestamp(ts, 0)
            .unwrap()
            .to_rfc3339();

        db.create_investissement(NewInvestissement {
            contact_id: Some(contact_id),
            foyer_id: None,
            type_produit: "ASSURANCE_VIE".into(),
            partenaire_id: None,
            nom_produit: "Contrat test".into(),
            numero_contrat: None,
            montant_initial: Some(montant_centimes),
            date_souscription: Some(iso),
            date_fin_demembrement: None,
            date_fin_pret: None,
            mensualite_credit: None,
            credit_crd: None,
            loyer_mensuel: None,
            versement_programme: None,
            montant_versement_programme: None,
            frequence_versement: None,
            reinvestissement_dividendes: None,
            notes: None,
            origine: Some("MON_CONSEIL".into()),
        })
        .unwrap();
    }

    #[test]
    fn get_yearly_activity_stats_groups_by_souscription_year() {
        let db = test_db();
        let alice = db.create_contact(sample_contact("Dupont", "Alice")).unwrap();
        let bob = db.create_contact(sample_contact("Martin", "Bob")).unwrap();

        investissement_with_souscription(&db, alice.id.unwrap(), 2024, 3, 10_000_00);
        investissement_with_souscription(&db, bob.id.unwrap(), 2024, 6, 5_000_00);
        investissement_with_souscription(&db, alice.id.unwrap(), 2025, 1, 20_000_00);

        let stats = db.get_yearly_activity_stats(None, None, None).unwrap();
        assert_eq!(stats.len(), 2);

        let y2024 = stats.iter().find(|s| s.year == 2024).unwrap();
        assert_eq!(y2024.clients, 2);
        assert!((y2024.panier_moyen - 7_500.0).abs() < 0.01);

        let y2025 = stats.iter().find(|s| s.year == 2025).unwrap();
        assert_eq!(y2025.clients, 1);
        assert!((y2025.panier_moyen - 20_000.0).abs() < 0.01);
    }

    #[test]
    fn get_yearly_activity_stats_filters_by_period_and_month_bucket() {
        let db = test_db();
        let alice = db.create_contact(sample_contact("Dupont", "Alice")).unwrap();
        let contact_id = alice.id.unwrap();

        investissement_with_souscription(&db, contact_id, 2024, 3, 10_000_00);
        investissement_with_souscription(&db, contact_id, 2024, 8, 5_000_00);
        investissement_with_souscription(&db, contact_id, 2025, 2, 20_000_00);

        let start = chrono::Utc
            .with_ymd_and_hms(2024, 1, 1, 0, 0, 0)
            .unwrap()
            .timestamp();
        let end = chrono::Utc
            .with_ymd_and_hms(2024, 12, 31, 23, 59, 59)
            .unwrap()
            .timestamp();

        let stats = db
            .get_yearly_activity_stats(Some(start), Some(end), Some("month"))
            .unwrap();
        assert_eq!(stats.len(), 2);
        assert!(stats.iter().any(|s| s.label == "2024-03"));
        assert!(stats.iter().any(|s| s.label == "2024-08"));
        assert!(!stats.iter().any(|s| s.label.starts_with("2025")));
    }

    #[test]
    fn get_activity_period_summary_aggregates_period() {
        let db = test_db();
        let alice = db.create_contact(sample_contact("Dupont", "Alice")).unwrap();
        let bob = db.create_contact(sample_contact("Martin", "Bob")).unwrap();

        investissement_with_souscription(&db, alice.id.unwrap(), 2024, 3, 10_000_00);
        investissement_with_souscription(&db, bob.id.unwrap(), 2024, 6, 5_000_00);

        let start = chrono::Utc
            .with_ymd_and_hms(2024, 1, 1, 0, 0, 0)
            .unwrap()
            .timestamp();
        let end = chrono::Utc
            .with_ymd_and_hms(2024, 12, 31, 23, 59, 59)
            .unwrap()
            .timestamp();

        let summary = db.get_activity_period_summary(start, end).unwrap();
        assert_eq!(summary.clients, 2);
        assert!((summary.total - 15_000.0).abs() < 0.01);
        assert!((summary.panier_moyen - 7_500.0).abs() < 0.01);
    }

    #[test]
    fn get_activity_bucket_contacts_matches_bucket_client_count() {
        let db = test_db();
        let alice = db.create_contact(sample_contact("Dupont", "Alice")).unwrap();
        let bob = db.create_contact(sample_contact("Martin", "Bob")).unwrap();
        let alice_id = alice.id.unwrap();
        let bob_id = bob.id.unwrap();

        investissement_with_souscription(&db, alice_id, 2024, 3, 10_000_00);
        investissement_with_souscription(&db, bob_id, 2024, 8, 5_000_00);

        let start = chrono::Utc
            .with_ymd_and_hms(2024, 1, 1, 0, 0, 0)
            .unwrap()
            .timestamp();
        let end = chrono::Utc
            .with_ymd_and_hms(2024, 12, 31, 23, 59, 59)
            .unwrap()
            .timestamp();

        let stats = db
            .get_yearly_activity_stats(Some(start), Some(end), Some("month"))
            .unwrap();
        let march = stats.iter().find(|s| s.label == "2024-03").unwrap();
        assert_eq!(march.clients, 1);

        let contacts = db
            .get_activity_bucket_contacts(start, end, "2024-03", Some("month"))
            .unwrap();
        assert_eq!(contacts.len(), 1);
        assert_eq!(contacts[0].contact_id, alice_id);
        assert_eq!(contacts[0].nom, "Dupont");
    }

    #[test]
    fn get_conversion_client_contacts_r1_matches_funnel_count() {
        let db = test_db();
        let c1 = db.create_contact(sample_contact("Dupont", "Alice")).unwrap();
        let c2 = db.create_contact(sample_contact("Martin", "Bob")).unwrap();
        let id1 = c1.id.unwrap();
        let id2 = c2.id.unwrap();

        db.update_contact(
            id1,
            &NewContact {
                date_r1: Some("2024-06-01T00:00:00+00:00".into()),
                ..sample_contact("Dupont", "Alice")
            },
            false,
        )
        .unwrap();
        db.update_contact(
            id2,
            &NewContact {
                date_r1: Some("2025-06-01T00:00:00+00:00".into()),
                ..sample_contact("Martin", "Bob")
            },
            false,
        )
        .unwrap();

        let start = chrono::Utc
            .with_ymd_and_hms(2024, 1, 1, 0, 0, 0)
            .unwrap()
            .timestamp();
        let end = chrono::Utc
            .with_ymd_and_hms(2024, 12, 31, 23, 59, 59)
            .unwrap()
            .timestamp();

        let stats = db
            .get_conversion_client_stats(Some(start), Some(end))
            .unwrap();
        assert_eq!(stats.rdv_r1, 1);

        let contacts = db
            .get_conversion_client_contacts(start, end, "r1")
            .unwrap();
        assert_eq!(contacts.len(), 1);
        assert_eq!(contacts[0].contact_id, id1);
    }

    #[test]
    fn get_conversion_filleul_contacts_invites_matches_funnel_count() {
        let db = test_db();
        let f1 = db
            .create_contact(NewContact {
                filleul_categorie: Some("PROSPECT_FILLEUL".into()),
                ..sample_contact("Legrand", "Paul")
            })
            .unwrap();
        db
            .create_contact(NewContact {
                filleul_categorie: Some("FILLEUL".into()),
                ..sample_contact("Bernard", "Luc")
            })
            .unwrap();

        db.update_contact(
            f1.id.unwrap(),
            &NewContact {
                type_invitation_filleul: Some("JD".into()),
                date_invitation_filleul: Some("2024-03-10T00:00:00+00:00".into()),
                presence_invitation_filleul: Some(1),
                filleul_categorie: Some("PROSPECT_FILLEUL".into()),
                ..sample_contact("Legrand", "Paul")
            },
            false,
        )
        .unwrap();

        let start = chrono::Utc
            .with_ymd_and_hms(2024, 1, 1, 0, 0, 0)
            .unwrap()
            .timestamp();
        let end = chrono::Utc
            .with_ymd_and_hms(2024, 12, 31, 23, 59, 59)
            .unwrap()
            .timestamp();

        let stats = db
            .get_conversion_filleul_stats(Some(start), Some(end))
            .unwrap();
        assert_eq!(stats.invites, 1);

        let contacts = db
            .get_conversion_filleul_contacts(start, end, "invites")
            .unwrap();
        assert_eq!(contacts.len(), 1);
        assert_eq!(contacts[0].nom, "Legrand");
    }

    #[test]
    fn get_conversion_client_stats_filters_by_r1_period() {
        let db = test_db();
        let c1 = db.create_contact(sample_contact("Dupont", "Alice")).unwrap();
        let c2 = db.create_contact(sample_contact("Martin", "Bob")).unwrap();
        let id1 = c1.id.unwrap();
        let id2 = c2.id.unwrap();

        db.update_contact(
            id1,
            &NewContact {
                date_r1: Some("2024-06-01T00:00:00+00:00".into()),
                ..sample_contact("Dupont", "Alice")
            },
            false,
        )
        .unwrap();
        db.update_contact(
            id2,
            &NewContact {
                date_r1: Some("2025-06-01T00:00:00+00:00".into()),
                ..sample_contact("Martin", "Bob")
            },
            false,
        )
        .unwrap();

        investissement_with_souscription(&db, id1, 2024, 7, 10_000_00);

        let start = chrono::Utc
            .with_ymd_and_hms(2024, 1, 1, 0, 0, 0)
            .unwrap()
            .timestamp();
        let end = chrono::Utc
            .with_ymd_and_hms(2024, 12, 31, 23, 59, 59)
            .unwrap()
            .timestamp();

        let stats = db
            .get_conversion_client_stats(Some(start), Some(end))
            .unwrap();
        assert_eq!(stats.rdv_r1, 1);
        assert_eq!(stats.signatures, 1);
        assert_eq!(stats.signatures_portfolio, 1);
    }

    #[test]
    fn get_conversion_filleul_stats_filters_by_invitation_period() {
        let db = test_db();
        let f1 = db
            .create_contact(NewContact {
                filleul_categorie: Some("PROSPECT_FILLEUL".into()),
                ..sample_contact("Legrand", "Paul")
            })
            .unwrap();
        let f2 = db
            .create_contact(NewContact {
                filleul_categorie: Some("FILLEUL".into()),
                ..sample_contact("Bernard", "Luc")
            })
            .unwrap();

        db.update_contact(
            f1.id.unwrap(),
            &NewContact {
                type_invitation_filleul: Some("JD".into()),
                date_invitation_filleul: Some("2024-03-10T00:00:00+00:00".into()),
                presence_invitation_filleul: Some(1),
                filleul_categorie: Some("PROSPECT_FILLEUL".into()),
                ..sample_contact("Legrand", "Paul")
            },
            false,
        )
        .unwrap();
        db.update_contact(
            f2.id.unwrap(),
            &NewContact {
                type_invitation_filleul: Some("PO".into()),
                date_invitation_filleul: Some("2025-01-15T00:00:00+00:00".into()),
                presence_invitation_filleul: Some(1),
                filleul_categorie: Some("FILLEUL".into()),
                ..sample_contact("Bernard", "Luc")
            },
            false,
        )
        .unwrap();

        let start = chrono::Utc
            .with_ymd_and_hms(2024, 1, 1, 0, 0, 0)
            .unwrap()
            .timestamp();
        let end = chrono::Utc
            .with_ymd_and_hms(2024, 12, 31, 23, 59, 59)
            .unwrap()
            .timestamp();

        let stats = db
            .get_conversion_filleul_stats(Some(start), Some(end))
            .unwrap();
        assert_eq!(stats.invites, 1);
        assert_eq!(stats.presents, 1);
        assert_eq!(stats.convertis, 0);
    }

    #[test]
    fn create_investissement_does_not_overwrite_existing_dernier_contact() {
        let db = test_db();
        let existing_ts = chrono::Utc.with_ymd_and_hms(2024, 1, 10, 0, 0, 0).unwrap().timestamp();
        let existing_iso = chrono::DateTime::from_timestamp(existing_ts, 0)
            .unwrap()
            .to_rfc3339();
        let contact = db
            .create_contact(NewContact {
                date_dernier_contact: Some(existing_iso),
                ..sample_contact("Martin", "Paul")
            })
            .unwrap();

        let souscription_ts = chrono::Utc.with_ymd_and_hms(2025, 6, 1, 0, 0, 0).unwrap().timestamp();
        let souscription_iso = chrono::DateTime::from_timestamp(souscription_ts, 0)
            .unwrap()
            .to_rfc3339();

        db.create_investissement(NewInvestissement {
            contact_id: contact.id,
            foyer_id: None,
            type_produit: "PER".into(),
            partenaire_id: None,
            nom_produit: "PER test".into(),
            numero_contrat: None,
            montant_initial: None,
            date_souscription: Some(souscription_iso),
            date_fin_demembrement: None,
            date_fin_pret: None,
            mensualite_credit: None,
            credit_crd: None,
            loyer_mensuel: None,
            versement_programme: None,
            montant_versement_programme: None,
            frequence_versement: None,
            reinvestissement_dividendes: None,
            notes: None,
            origine: Some("MON_CONSEIL".into()),
        })
        .unwrap();

        let updated = db.get_contact_by_id(contact.id.unwrap()).unwrap();
        assert_eq!(updated.date_dernier_contact, Some(existing_ts));
    }

    #[test]
    fn sync_dernier_contact_bumps_to_newer_souscription_when_linked_to_old_one() {
        let db = test_db();
        let contact = db.create_contact(sample_contact("Bernard", "Luc")).unwrap();
        let older_ts = chrono::Utc.with_ymd_and_hms(2024, 1, 10, 0, 0, 0).unwrap().timestamp();
        let newer_ts = chrono::Utc.with_ymd_and_hms(2025, 6, 1, 0, 0, 0).unwrap().timestamp();
        let older_iso = chrono::DateTime::from_timestamp(older_ts, 0).unwrap().to_rfc3339();
        let newer_iso = chrono::DateTime::from_timestamp(newer_ts, 0).unwrap().to_rfc3339();

        db.create_investissement(NewInvestissement {
            contact_id: contact.id,
            foyer_id: None,
            type_produit: "ASSURANCE_VIE".into(),
            partenaire_id: None,
            nom_produit: "AV 1".into(),
            numero_contrat: None,
            montant_initial: None,
            date_souscription: Some(older_iso),
            date_fin_demembrement: None,
            date_fin_pret: None,
            mensualite_credit: None,
            credit_crd: None,
            loyer_mensuel: None,
            versement_programme: None,
            montant_versement_programme: None,
            frequence_versement: None,
            reinvestissement_dividendes: None,
            notes: None,
            origine: Some("MON_CONSEIL".into()),
        })
        .unwrap();

        assert_eq!(
            db.get_contact_by_id(contact.id.unwrap()).unwrap().date_dernier_contact,
            Some(older_ts)
        );

        db.create_investissement(NewInvestissement {
            contact_id: contact.id,
            foyer_id: None,
            type_produit: "PER".into(),
            partenaire_id: None,
            nom_produit: "PER 2".into(),
            numero_contrat: None,
            montant_initial: None,
            date_souscription: Some(newer_iso),
            date_fin_demembrement: None,
            date_fin_pret: None,
            mensualite_credit: None,
            credit_crd: None,
            loyer_mensuel: None,
            versement_programme: None,
            montant_versement_programme: None,
            frequence_versement: None,
            reinvestissement_dividendes: None,
            notes: None,
            origine: Some("MON_CONSEIL".into()),
        })
        .unwrap();

        assert_eq!(
            db.get_contact_by_id(contact.id.unwrap()).unwrap().date_dernier_contact,
            Some(newer_ts)
        );
    }

    #[test]
    fn sync_dernier_contact_when_first_investissement_has_no_souscription() {
        let db = test_db();
        let contact = db.create_contact(sample_contact("Durand", "Anne")).unwrap();
        let souscription_ts = chrono::Utc.with_ymd_and_hms(2025, 6, 1, 0, 0, 0).unwrap().timestamp();
        let souscription_iso = chrono::DateTime::from_timestamp(souscription_ts, 0)
            .unwrap()
            .to_rfc3339();

        db.create_investissement(NewInvestissement {
            contact_id: contact.id,
            foyer_id: None,
            type_produit: "SCPI".into(),
            partenaire_id: None,
            nom_produit: "Sans date".into(),
            numero_contrat: None,
            montant_initial: None,
            date_souscription: None,
            date_fin_demembrement: None,
            date_fin_pret: None,
            mensualite_credit: None,
            credit_crd: None,
            loyer_mensuel: None,
            versement_programme: None,
            montant_versement_programme: None,
            frequence_versement: None,
            reinvestissement_dividendes: None,
            notes: None,
            origine: Some("MON_CONSEIL".into()),
        })
        .unwrap();

        assert!(db.get_contact_by_id(contact.id.unwrap()).unwrap().date_dernier_contact.is_none());

        db.create_investissement(NewInvestissement {
            contact_id: contact.id,
            foyer_id: None,
            type_produit: "PER".into(),
            partenaire_id: None,
            nom_produit: "Avec date".into(),
            numero_contrat: None,
            montant_initial: None,
            date_souscription: Some(souscription_iso),
            date_fin_demembrement: None,
            date_fin_pret: None,
            mensualite_credit: None,
            credit_crd: None,
            loyer_mensuel: None,
            versement_programme: None,
            montant_versement_programme: None,
            frequence_versement: None,
            reinvestissement_dividendes: None,
            notes: None,
            origine: Some("MON_CONSEIL".into()),
        })
        .unwrap();

        let updated = db.get_contact_by_id(contact.id.unwrap()).unwrap();
        assert_eq!(updated.date_dernier_contact, Some(souscription_ts));
    }

    #[test]
    fn sync_dernier_contact_closes_obsolete_suivi_alerte_after_newer_souscription() {
        let db = test_db();
        let contact = db.create_contact(sample_contact("Bernard", "Luc")).unwrap();
        let contact_id = contact.id.unwrap();
        let older_ts = chrono::Utc.with_ymd_and_hms(2022, 1, 10, 0, 0, 0).unwrap().timestamp();
        let newer_ts = chrono::Utc::now().timestamp() - 30 * 24 * 3600;
        let older_iso = chrono::DateTime::from_timestamp(older_ts, 0).unwrap().to_rfc3339();
        let newer_iso = chrono::DateTime::from_timestamp(newer_ts, 0).unwrap().to_rfc3339();

        db.create_investissement(NewInvestissement {
            contact_id: Some(contact_id),
            foyer_id: None,
            type_produit: "ASSURANCE_VIE".into(),
            partenaire_id: None,
            nom_produit: "AV 1".into(),
            numero_contrat: None,
            montant_initial: None,
            date_souscription: Some(older_iso),
            date_fin_demembrement: None,
            date_fin_pret: None,
            mensualite_credit: None,
            credit_crd: None,
            loyer_mensuel: None,
            versement_programme: None,
            montant_versement_programme: None,
            frequence_versement: None,
            reinvestissement_dividendes: None,
            notes: None,
            origine: Some("MON_CONSEIL".into()),
        })
        .unwrap();

        db.create_alerte(crate::database::models::NewAlerte {
            contact_id,
            type_alerte: "SUIVI_CLIENT_1AN".into(),
            message: "Suivi client".into(),
            date_alerte: Some(chrono::Utc::now().timestamp()),
        })
        .unwrap();
        assert_eq!(db.get_alertes_for_contact(contact_id).unwrap().len(), 1);

        db.create_investissement(NewInvestissement {
            contact_id: Some(contact_id),
            foyer_id: None,
            type_produit: "PER".into(),
            partenaire_id: None,
            nom_produit: "PER 2".into(),
            numero_contrat: None,
            montant_initial: None,
            date_souscription: Some(newer_iso),
            date_fin_demembrement: None,
            date_fin_pret: None,
            mensualite_credit: None,
            credit_crd: None,
            loyer_mensuel: None,
            versement_programme: None,
            montant_versement_programme: None,
            frequence_versement: None,
            reinvestissement_dividendes: None,
            notes: None,
            origine: Some("MON_CONSEIL".into()),
        })
        .unwrap();

        assert!(
            db.get_alertes_for_contact(contact_id).unwrap().is_empty(),
            "alerte suivi client doit être clôturée après remontée du dernier contact"
        );
    }

    #[test]
    fn update_contact_closes_obsolete_suivi_alerte_when_dernier_contact_recent() {
        let db = test_db();
        let old_ts = chrono::Utc::now().timestamp() - 400 * 24 * 3600;
        let old_iso = chrono::DateTime::from_timestamp(old_ts, 0).unwrap().to_rfc3339();
        let recent_iso = chrono::Utc::now().to_rfc3339();
        let contact = db
            .create_contact(NewContact {
                date_dernier_contact: Some(old_iso),
                ..sample_contact("Martin", "Paul")
            })
            .unwrap();
        let contact_id = contact.id.unwrap();

        db.create_alerte(crate::database::models::NewAlerte {
            contact_id,
            type_alerte: "SUIVI_CLIENT_1AN".into(),
            message: "Suivi client".into(),
            date_alerte: Some(chrono::Utc::now().timestamp()),
        })
        .unwrap();
        assert_eq!(db.get_alertes_for_contact(contact_id).unwrap().len(), 1);

        db.update_contact(
            contact_id,
            &NewContact {
                date_dernier_contact: Some(recent_iso),
                ..sample_contact("Martin", "Paul")
            },
            false,
        )
        .unwrap();

        assert!(
            db.get_alertes_for_contact(contact_id).unwrap().is_empty(),
            "alerte suivi client doit être clôturée après saisie d'un dernier contact récent"
        );
    }

    #[test]
    fn get_alertes_with_contacts_reads_integer_date_dernier_contact() {
        let db = test_db();
        let contact = db
            .create_contact(NewContact {
                date_dernier_contact: Some("2024-12-05T12:00:00+00:00".into()),
                ..sample_contact("NOM1", "Jean")
            })
            .unwrap();
        let contact_id = contact.id.unwrap();
        let stored_ts = contact
            .date_dernier_contact
            .expect("date_dernier_contact en base");

        db.get_connection()
            .execute(
                "INSERT INTO alertes (contact_id, type_alerte, message, date_alerte, lue, traitee)
                 VALUES (?1, 'SUIVI_CLIENT_1AN', 'Test alerte', ?2, 0, 0)",
                params![contact_id, stored_ts],
            )
            .unwrap();

        let alertes = db.get_alertes_with_contacts(Some(10)).unwrap();
        assert_eq!(alertes.len(), 1);
        assert_eq!(alertes[0].contact_id, contact_id);
        assert_eq!(alertes[0].date_dernier_contact, Some(stored_ts));
    }

    #[test]
    fn get_alertes_with_contacts_excludes_paused_contact_suivi_alerts() {
        let db = test_db();
        let contact = db
            .create_contact(NewContact {
                statut_suivi: Some("EN_PAUSE".into()),
                ..sample_contact("Pause", "Jean")
            })
            .unwrap();
        let contact_id = contact.id.unwrap();

        db.get_connection()
            .execute(
                "INSERT INTO alertes (contact_id, type_alerte, message, date_alerte, lue, traitee)
                 VALUES (?1, 'SUIVI_CLIENT_1AN', 'Suivi client', ?2, 0, 0)",
                params![contact_id, chrono::Utc::now().timestamp()],
            )
            .unwrap();

        assert!(
            db.get_alertes_with_contacts(None).unwrap().is_empty(),
            "alerte relationnelle masquée si suivi en pause"
        );

        db.get_connection()
            .execute(
                "INSERT INTO alertes (contact_id, type_alerte, message, date_alerte, lue, traitee)
                 VALUES (?1, 'FIN_DEMEMBREMENT', 'Fin SCPI', ?2, 0, 0)",
                params![contact_id, chrono::Utc::now().timestamp()],
            )
            .unwrap();

        let patrimoine = db.get_alertes_with_contacts(None).unwrap();
        assert_eq!(patrimoine.len(), 1);
        assert_eq!(patrimoine[0].type_alerte, "FIN_DEMEMBREMENT");
    }

    #[test]
    fn auto_etiquette_exclusion_suppresses_matching_suivi_alerte() {
        let db = test_db();
        db.ensure_default_segments_and_alerte_links().unwrap();
        db.ensure_default_etiquettes().unwrap();

        let old_ts = chrono::Utc::now().timestamp() - 400 * 24 * 3600;
        let old_iso = chrono::DateTime::from_timestamp(old_ts, 0).unwrap().to_rfc3339();
        let contact = db
            .create_contact(NewContact {
                date_dernier_contact: Some(old_iso),
                ..sample_contact("Petit", "Alain")
            })
            .unwrap();
        let contact_id = contact.id.unwrap();

        db.generer_alertes_automatiques().unwrap();
        let before = db
            .get_alertes_with_contacts(None)
            .unwrap()
            .into_iter()
            .filter(|a| a.contact_id == contact_id && a.type_alerte == "SUIVI_CLIENT_1AN")
            .count();
        assert_eq!(before, 1, "alerte suivi client attendue avant exclusion");

        let etiquette_id: i64 = db
            .get_connection()
            .query_row(
                "SELECT id FROM etiquettes WHERE LOWER(TRIM(nom)) = LOWER(TRIM('Suivi > 1 an'))",
                [],
                |row| row.get(0),
            )
            .unwrap();

        db.exclude_contact_from_auto_etiquette(contact_id, etiquette_id)
            .unwrap();

        let visible = db
            .get_alertes_with_contacts(None)
            .unwrap()
            .into_iter()
            .any(|a| a.contact_id == contact_id && a.type_alerte == "SUIVI_CLIENT_1AN");
        assert!(
            !visible,
            "alerte masquée après exclusion du calcul auto Suivi > 1 an"
        );

        db.generer_alertes_automatiques().unwrap();
        let recreated = db
            .get_alertes_with_contacts(None)
            .unwrap()
            .into_iter()
            .any(|a| a.contact_id == contact_id && a.type_alerte == "SUIVI_CLIENT_1AN");
        assert!(
            !recreated,
            "alerte non recréée après exclusion du calcul auto"
        );
    }

    #[test]
    fn generer_alertes_closes_orphan_suivi_alerts_for_paused_contacts() {
        let db = test_db();
        let contact = db
            .create_contact(NewContact {
                statut_suivi: Some("EN_PAUSE".into()),
                ..sample_contact("Orphelin", "Marie")
            })
            .unwrap();
        let contact_id = contact.id.unwrap();

        db.get_connection()
            .execute(
                "INSERT INTO alertes (contact_id, type_alerte, message, date_alerte, lue, traitee)
                 VALUES (?1, 'LEAD_SUIVI_6MOIS', 'Lead', ?2, 0, 0)",
                params![contact_id, chrono::Utc::now().timestamp()],
            )
            .unwrap();

        db.generer_alertes_automatiques().unwrap();

        let open: i64 = db
            .get_connection()
            .query_row(
                "SELECT COUNT(*) FROM alertes WHERE contact_id = ?1 AND traitee = 0",
                params![contact_id],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(open, 0, "alertes orphelines clôturées à la régénération");
    }

    #[test]
    fn demembrement_alert_when_investissement_has_foyer_only() {
        let db = test_db();
        let foyer = db
            .create_foyer(NewFoyer {
                nom: "Foyer TEST".into(),
                type_foyer: "COUPLE".into(),
                nombre_parts_fiscales: None,
                tranche_imposition: None,
                revenu_fiscal_reference: None,
                ir_net_a_payer: None,
                situation_patrimoniale: None,
                objectifs_patrimoniaux: None,
                notes: None,
            })
            .unwrap();

        let c1 = db
            .create_contact(NewContact {
                foyer_id: Some(foyer.id),
                role_foyer: Some("DECLARANT_1".into()),
                ..sample_contact("NOM1", "Jean")
            })
            .unwrap();
        db.create_contact(NewContact {
            foyer_id: Some(foyer.id),
            role_foyer: Some("DECLARANT_2".into()),
            ..sample_contact("NOM1", "Veronique")
        })
        .unwrap();

        let now = chrono::Utc::now().timestamp();
        let in_90_days = now + 90 * 24 * 3600;
        let iso = chrono::DateTime::from_timestamp(in_90_days, 0)
            .unwrap()
            .to_rfc3339();

        db.create_investissement(NewInvestissement {
            contact_id: None,
            foyer_id: Some(foyer.id),
            type_produit: "SCPI_DEMEMBREMENT".into(),
            partenaire_id: None,
            nom_produit: "Comete".into(),
            numero_contrat: None,
            montant_initial: Some(2_000_000),
            date_souscription: None,
            date_fin_demembrement: Some(iso),
            date_fin_pret: None,
            mensualite_credit: None,
            credit_crd: None,
            loyer_mensuel: None,
            versement_programme: None,
            montant_versement_programme: None,
            frequence_versement: None,
            reinvestissement_dividendes: None,
            notes: None,
            origine: Some("MON_CONSEIL".into()),
        })
        .unwrap();

        let created = db.check_and_create_demembrement_alerts().unwrap();
        assert_eq!(created.len(), 1);
        assert_eq!(created[0].contact_id, c1.id.unwrap());
        assert_eq!(created[0].type_alerte, "FIN_DEMEMBREMENT");
    }

    #[test]
    fn cleanup_orphaned_foyers_removes_foyer_without_members() {
        let db = test_db();
        let foyer = db
            .create_foyer(NewFoyer {
                nom: "Foyer ORPHELIN".into(),
                type_foyer: "COUPLE".into(),
                nombre_parts_fiscales: None,
                tranche_imposition: None,
                revenu_fiscal_reference: None,
                ir_net_a_payer: None,
                situation_patrimoniale: None,
                objectifs_patrimoniaux: None,
                notes: None,
            })
            .unwrap();

        let deleted = db.cleanup_orphaned_foyers().unwrap();
        assert!(deleted >= 1);

        let count: i64 = db
            .get_connection()
            .query_row(
                "SELECT COUNT(*) FROM foyers WHERE id = ?1",
                params![foyer.id],
                |r| r.get(0),
            )
            .unwrap();
        assert_eq!(count, 0);
    }

    #[test]
    fn update_contact_persists_foyer_id_and_role() {
        let db = test_db();
        let foyer = db
            .create_foyer(NewFoyer {
                nom: "Foyer PERSIST".into(),
                type_foyer: "COUPLE".into(),
                nombre_parts_fiscales: None,
                tranche_imposition: None,
                revenu_fiscal_reference: None,
                ir_net_a_payer: None,
                situation_patrimoniale: None,
                objectifs_patrimoniaux: None,
                notes: None,
            })
            .unwrap();

        let created = db
            .create_contact(NewContact {
                foyer_id: Some(foyer.id),
                role_foyer: Some("DECLARANT_1".into()),
                ..sample_contact("NOM2", "Jean")
            })
            .unwrap();
        let id = created.id.unwrap();

        let updated = db
            .update_contact(
                id,
                &NewContact {
                    foyer_id: Some(foyer.id),
                    role_foyer: Some("DECLARANT_2".into()),
                    email: Some("jean@example.com".into()),
                    ..sample_contact("NOM2", "Jean")
                },
                false,
            )
            .unwrap();

        assert_eq!(updated.foyer_id, Some(foyer.id));
        assert_eq!(updated.role_foyer.as_deref(), Some("DECLARANT_2"));
        assert_eq!(updated.email.as_deref(), Some("jean@example.com"));

        let reloaded = db.get_contact_by_id(id).unwrap();
        assert_eq!(reloaded.foyer_id, Some(foyer.id));
        assert_eq!(reloaded.role_foyer.as_deref(), Some("DECLARANT_2"));
    }

    #[test]
    fn investissements_by_contact_and_by_foyer() {
        let db = test_db();
        let foyer = db
            .create_foyer(NewFoyer {
                nom: "Foyer INV".into(),
                type_foyer: "COUPLE".into(),
                nombre_parts_fiscales: None,
                tranche_imposition: None,
                revenu_fiscal_reference: None,
                ir_net_a_payer: None,
                situation_patrimoniale: None,
                objectifs_patrimoniaux: None,
                notes: None,
            })
            .unwrap();

        let contact = db
            .create_contact(NewContact {
                foyer_id: Some(foyer.id),
                ..sample_contact("NOM3", "Paul")
            })
            .unwrap();
        let cid = contact.id.unwrap();

        db.create_investissement(NewInvestissement {
            contact_id: Some(cid),
            foyer_id: None,
            type_produit: "SCPI".into(),
            partenaire_id: None,
            nom_produit: "Perso".into(),
            numero_contrat: None,
            montant_initial: Some(10_000),
            date_souscription: None,
            date_fin_demembrement: None,
            date_fin_pret: None,
            mensualite_credit: None,
            credit_crd: None,
            loyer_mensuel: None,
            versement_programme: None,
            montant_versement_programme: None,
            frequence_versement: None,
            reinvestissement_dividendes: None,
            notes: None,
            origine: Some("MON_CONSEIL".into()),
        })
        .unwrap();

        db.create_investissement(NewInvestissement {
            contact_id: None,
            foyer_id: Some(foyer.id),
            type_produit: "ASSURANCE_VIE".into(),
            partenaire_id: None,
            nom_produit: "Commun".into(),
            numero_contrat: None,
            montant_initial: Some(20_000),
            date_souscription: None,
            date_fin_demembrement: None,
            date_fin_pret: None,
            mensualite_credit: None,
            credit_crd: None,
            loyer_mensuel: None,
            versement_programme: None,
            montant_versement_programme: None,
            frequence_versement: None,
            reinvestissement_dividendes: None,
            notes: None,
            origine: Some("MON_CONSEIL".into()),
        })
        .unwrap();

        let by_contact = db.get_investissements_by_contact(cid).unwrap();
        assert_eq!(by_contact.len(), 1);
        assert_eq!(by_contact[0].nom_produit, "Perso");

        let by_foyer = db.get_investissements_by_foyer(foyer.id).unwrap();
        assert_eq!(by_foyer.len(), 1);
        assert_eq!(by_foyer[0].nom_produit, "Commun");
    }

    #[test]
    fn delete_contact_clears_foyer_id_on_contact() {
        let db = test_db();
        let foyer = db
            .create_foyer(NewFoyer {
                nom: "Foyer DEL".into(),
                type_foyer: "COUPLE".into(),
                nombre_parts_fiscales: None,
                tranche_imposition: None,
                revenu_fiscal_reference: None,
                ir_net_a_payer: None,
                situation_patrimoniale: None,
                objectifs_patrimoniaux: None,
                notes: None,
            })
            .unwrap();

        let c = db
            .create_contact(NewContact {
                foyer_id: Some(foyer.id),
                ..sample_contact("X", "Y")
            })
            .unwrap();
        let id = c.id.unwrap();
        db.delete_contact(id).unwrap();

        let remaining: i64 = db
            .get_connection()
            .query_row(
                "SELECT COUNT(*) FROM contacts WHERE foyer_id = ?1",
                params![foyer.id],
                |r| r.get(0),
            )
            .unwrap();
        assert_eq!(remaining, 0);
    }

    #[test]
    fn cancel_pending_email_campaign_removes_from_ready_queue() {
        use crate::database::models::{NewEtiquette, NewTemplateEmail};

        let db = test_db();
        let now = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_secs() as i64;

        let tpl = db
            .create_template_email(NewTemplateEmail {
                nom: "Tpl cancel".into(),
                sujet: "Bonjour".into(),
                corps: "Corps".into(),
                categorie: "INFO".into(),
                variables: None,
                agenda_link_id: None,
                relance_template_id: None,
                tutoiement_template_id: None,
            })
            .unwrap();

        let etiqu = db
            .create_etiquette(NewEtiquette {
                nom: "Campagne cancel".into(),
                couleur: None,
                icone: None,
                description: None,
                priorite: Some(0),
                auto_condition_type: None,
                auto_condition_config: None,
                auto_categories: None,
                email_template_id: Some(tpl.id),
                email_delai_jours: Some(0),
                email_envoi_prevu: Some(now - 120),
                email_envoi_heure: None,
                email_envoi_jours_semaine: None,
                email_actif: Some(true),
                is_default: Some(false),
                actif: None,
                segment_id: None,
                rendement_cible: None,
            })
            .unwrap();

        let contact = db
            .create_contact(NewContact {
                email: Some("cancel@example.com".into()),
                ..sample_contact("Durand", "Paul")
            })
            .unwrap();
        let cid = contact.id.unwrap();

        db.attribuer_etiquette(cid, etiqu.id, Some("MANUEL".into()), None)
            .unwrap();

        let ready = db.get_etiquette_email_queue("ready").unwrap();
        assert_eq!(ready.len(), 1);
        let row_id = ready[0].contact_etiquette_id;

        db.cancel_pending_email_campaign(row_id, None).unwrap();
        assert!(db.get_etiquette_email_queue("ready").unwrap().is_empty());

        db.sync_pending_email_dates_for_etiquette(etiqu.id).unwrap();
        assert!(
            db.get_etiquette_email_queue("ready").unwrap().is_empty(),
            "un envoi annulé ne doit pas revenir après recalcul des dates seul"
        );
        assert_eq!(db.get_etiquette_email_queue("cancelled").unwrap().len(), 1);
        db.restore_pending_email_campaign(row_id, None).unwrap();
        assert_eq!(db.get_etiquette_email_queue("ready").unwrap().len(), 1);
    }

    #[test]
    fn cancel_template_envoi_does_not_cancel_etiquette_with_same_numeric_id() {
        use crate::database::models::{NewEtiquette, NewInvestissement, NewTemplateEmail};
        use crate::database::scpi_campaigns::{PrepareScpiCampaignInput, ScpiBulletinInput};

        let db = test_db();
        let now = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_secs() as i64;

        let tpl = db
            .create_template_email(NewTemplateEmail {
                nom: "Tpl suivi".into(),
                sujet: "Bonjour".into(),
                corps: "Corps".into(),
                categorie: "INFO".into(),
                variables: None,
                agenda_link_id: None,
                relance_template_id: None,
                tutoiement_template_id: None,
            })
            .unwrap();

        let etiqu = db
            .create_etiquette(NewEtiquette {
                nom: "Suivi 1 an".into(),
                couleur: None,
                icone: None,
                description: None,
                priorite: Some(0),
                auto_condition_type: None,
                auto_condition_config: None,
                auto_categories: None,
                email_template_id: Some(tpl.id),
                email_delai_jours: Some(0),
                email_envoi_prevu: Some(now - 120),
                email_envoi_heure: None,
                email_envoi_jours_semaine: None,
                email_actif: Some(true),
                is_default: Some(false),
                actif: None,
                segment_id: None,
                rendement_cible: None,
            })
            .unwrap();

        let contact_etiq = db
            .create_contact(NewContact {
                email: Some("akim@example.com".into()),
                ..sample_contact("SEKKAI", "Akim")
            })
            .unwrap();
        db.attribuer_etiquette(contact_etiq.id.unwrap(), etiqu.id, Some("MANUEL".into()), None)
            .unwrap();

        let contact_scpi = db
            .create_contact(NewContact {
                email: Some("nicolas@example.com".into()),
                ..sample_contact("CHOUX", "Nicolas")
            })
            .unwrap();
        let scpi_cid = contact_scpi.id.unwrap();
        db.create_investissement(NewInvestissement {
            contact_id: Some(scpi_cid),
            foyer_id: None,
            type_produit: "SCPI".into(),
            partenaire_id: None,
            nom_produit: "Comète".into(),
            numero_contrat: None,
            montant_initial: None,
            date_souscription: None,
            date_fin_demembrement: None,
            date_fin_pret: None,
            mensualite_credit: None,
            credit_crd: None,
            loyer_mensuel: None,
            versement_programme: None,
            montant_versement_programme: None,
            frequence_versement: None,
            reinvestissement_dividendes: None,
            notes: None,
            origine: None,
        })
        .unwrap();
        db.prepare_scpi_bulletin_campaign(PrepareScpiCampaignInput {
            periode: "T1 2026".into(),
            bulletins: vec![ScpiBulletinInput {
                nom_produit: "Comète".into(),
                summary_markdown: "Collecte stable".into(),
                fichier_source: None,
            }],
        })
        .unwrap();

        let ready = db.get_etiquette_email_queue("ready").unwrap();
        assert_eq!(ready.len(), 2);
        let etiquette_row = ready
            .iter()
            .find(|r| r.queue_row_kind == "etiquette")
            .expect("etiquette row");
        let template_row = ready
            .iter()
            .find(|r| r.queue_row_kind == "template")
            .expect("template row");
        assert_eq!(
            etiquette_row.contact_etiquette_id, template_row.contact_etiquette_id,
            "test setup: même id numérique sur les deux tables"
        );

        db.cancel_pending_email_campaign(template_row.contact_etiquette_id, Some("template"))
            .unwrap();

        let ready_after = db.get_etiquette_email_queue("ready").unwrap();
        assert_eq!(ready_after.len(), 1);
        assert_eq!(ready_after[0].queue_row_kind, "etiquette");
        assert_eq!(ready_after[0].contact_etiquette_id, etiquette_row.contact_etiquette_id);

        let cancelled = db.get_etiquette_email_queue("cancelled").unwrap();
        assert_eq!(cancelled.len(), 1);
        assert_eq!(cancelled[0].queue_row_kind, "template");

        db.restore_pending_email_campaign(template_row.contact_etiquette_id, Some("template"))
            .unwrap();
        let ready_restored = db.get_etiquette_email_queue("ready").unwrap();
        assert_eq!(ready_restored.len(), 2);
        assert!(
            ready_restored
                .iter()
                .any(|r| r.queue_row_kind == "template" && r.contact_id == scpi_cid)
        );
    }

    #[test]
    fn mark_campaign_response_routes_by_queue_row_kind_on_id_collision() {
        use crate::database::models::{NewEtiquette, NewTemplateEmail};
        use crate::database::scpi_campaigns::{PrepareScpiCampaignInput, ScpiBulletinInput};

        let db = test_db();
        let now = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_secs() as i64;

        let tpl = db
            .create_template_email(NewTemplateEmail {
                nom: "Etiquette tpl".into(),
                sujet: "Objet".into(),
                corps: "Corps".into(),
                categorie: "INFO".into(),
                variables: None,
                agenda_link_id: None,
                relance_template_id: None,
                tutoiement_template_id: None,
            })
            .unwrap();
        let etiqu = db
            .create_etiquette(NewEtiquette {
                nom: "Campagne test".into(),
                couleur: None,
                icone: None,
                description: None,
                priorite: Some(0),
                auto_condition_type: None,
                auto_condition_config: None,
                auto_categories: None,
                email_template_id: Some(tpl.id),
                email_delai_jours: Some(0),
                email_envoi_prevu: Some(now - 120),
                email_envoi_heure: None,
                email_envoi_jours_semaine: None,
                email_actif: Some(true),
                is_default: Some(false),
                actif: None,
                segment_id: None,
                rendement_cible: None,
            })
            .unwrap();

        let contact_etiq = db
            .create_contact(NewContact {
                email: Some("akim@example.com".into()),
                ..sample_contact("SEKKAI", "Akim")
            })
            .unwrap();
        db.attribuer_etiquette(contact_etiq.id.unwrap(), etiqu.id, Some("MANUEL".into()), None)
            .unwrap();

        let contact_scpi = db
            .create_contact(NewContact {
                email: Some("nicolas@example.com".into()),
                ..sample_contact("CHOUX", "Nicolas")
            })
            .unwrap();
        db.create_investissement(NewInvestissement {
            contact_id: Some(contact_scpi.id.unwrap()),
            foyer_id: None,
            type_produit: "SCPI".into(),
            partenaire_id: None,
            nom_produit: "Comète".into(),
            numero_contrat: None,
            montant_initial: None,
            date_souscription: None,
            date_fin_demembrement: None,
            date_fin_pret: None,
            mensualite_credit: None,
            credit_crd: None,
            loyer_mensuel: None,
            versement_programme: None,
            montant_versement_programme: None,
            frequence_versement: None,
            reinvestissement_dividendes: None,
            notes: None,
            origine: None,
        })
        .unwrap();
        db.prepare_scpi_bulletin_campaign(PrepareScpiCampaignInput {
            periode: "T1 2026".into(),
            bulletins: vec![ScpiBulletinInput {
                nom_produit: "Comète".into(),
                summary_markdown: "Collecte stable".into(),
                fichier_source: None,
            }],
        })
        .unwrap();

        let ready = db.get_etiquette_email_queue("ready").unwrap();
        let etiquette_row = ready
            .iter()
            .find(|r| r.queue_row_kind == "etiquette")
            .expect("etiquette row");
        let template_row = ready
            .iter()
            .find(|r| r.queue_row_kind == "template")
            .expect("template row");
        assert_eq!(
            etiquette_row.contact_etiquette_id, template_row.contact_etiquette_id,
            "test setup: même id numérique sur les deux tables"
        );
        let row_id = template_row.contact_etiquette_id;

        db.mark_etiquette_email_sent(row_id, None, None, Some("Etiquette"), None, None, None)
            .unwrap();
        db.mark_template_email_sent(row_id, None, None, Some("SCPI"), None, None, None)
            .unwrap();

        db.mark_email_campaign_response(row_id, "mail", None, None, None, None, Some("template"))
            .unwrap();

        let template_replied: i64 = db
            .get_connection()
            .query_row(
                "SELECT COUNT(*) FROM contact_template_envois
                 WHERE id = ?1 AND email_reponse_at IS NOT NULL",
                params![row_id],
                |row| row.get(0),
            )
            .unwrap();
        let etiquette_replied: i64 = db
            .get_connection()
            .query_row(
                "SELECT COUNT(*) FROM contact_etiquettes
                 WHERE id = ?1 AND email_reponse_at IS NOT NULL",
                params![row_id],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(template_replied, 1);
        assert_eq!(etiquette_replied, 0);
    }

    #[test]
    fn exceltis_etiquette_waits_for_stellium_before_email_ready() {
        use crate::database::models::{NewEtiquette, NewTemplateEmail};
        use crate::email::stellium_exceltis::format_exceltis_etiquette_nom;

        let db = test_db();
        let now = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_secs() as i64;

        let tpl = db
            .create_template_email(NewTemplateEmail {
                nom: "Exceltis tpl".into(),
                sujet: "Exceltis {{millesime}}".into(),
                corps: "Corps".into(),
                categorie: "INFO".into(),
                variables: None,
                agenda_link_id: None,
                relance_template_id: None,
                tutoiement_template_id: None,
            })
            .unwrap();

        let nom = format_exceltis_etiquette_nom(Some("Rendement"), 8, 2026).unwrap();
        let etiqu = db
            .create_etiquette(NewEtiquette {
                nom: nom.clone(),
                couleur: None,
                icone: None,
                description: None,
                priorite: Some(50),
                auto_condition_type: None,
                auto_condition_config: None,
                auto_categories: None,
                email_template_id: Some(tpl.id),
                email_delai_jours: Some(0),
                email_envoi_prevu: Some(1),
                email_envoi_heure: None,
                email_envoi_jours_semaine: None,
                email_actif: Some(true),
                is_default: Some(false),
                actif: Some(true),
                segment_id: None,
                rendement_cible: None,
            })
            .unwrap();

        let contact = db
            .create_contact(NewContact {
                email: Some("exceltis@example.com".into()),
                ..sample_contact("SEKKAI", "Maelys")
            })
            .unwrap();

        db.attribuer_etiquette(
            contact.id.unwrap(),
            etiqu.id,
            Some("MANUEL".into()),
            None,
        )
        .unwrap();

        assert!(
            db.get_etiquette_email_queue("ready").unwrap().is_empty(),
            "sans signal Stellium, pas d'envoi Exceltis en file prête"
        );

        let state_json = serde_json::json!({
            "signals": [{
                "gmailMessageId": "test-msg-aout-2026",
                "subject": "Remboursement Exceltis Rendement Août 2026",
                "millesimeLabel": "Août 2026",
                "etiquetteNom": nom,
                "etiquetteId": etiqu.id,
                "contactCount": 0,
                "receivedAt": now - 120,
            }]
        });
        db.set_setting(
            "stellium_exceltis_signals_v1",
            &state_json.to_string(),
        )
        .unwrap();

        db.sync_exceltis_etiquette_email_schedule(etiqu.id).unwrap();
        assert_eq!(
            db.get_etiquette_email_queue("ready").unwrap().len(),
            1,
            "après signal Stellium, l'envoi Exceltis doit être planifié"
        );
    }

    #[test]
    fn exceltis_etiquette_variant_nom_links_stellium_by_millesime() {
        use crate::database::models::{NewEtiquette, NewTemplateEmail};
        use crate::email::stellium_exceltis::format_exceltis_etiquette_nom;

        let db = test_db();
        let now = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_secs() as i64;

        let tpl = db
            .create_template_email(NewTemplateEmail {
                nom: "Exceltis tpl variant".into(),
                sujet: "Exceltis {{millesime}}".into(),
                corps: "Corps".into(),
                categorie: "INFO".into(),
                variables: None,
                agenda_link_id: None,
                relance_template_id: None,
                tutoiement_template_id: None,
            })
            .unwrap();

        let etiqu = db
            .create_etiquette(NewEtiquette {
                nom: "Exceltis Rendement - aout 2026".into(),
                couleur: None,
                icone: None,
                description: None,
                priorite: Some(50),
                auto_condition_type: None,
                auto_condition_config: None,
                auto_categories: None,
                email_template_id: Some(tpl.id),
                email_delai_jours: Some(0),
                email_envoi_prevu: Some(1),
                email_envoi_heure: None,
                email_envoi_jours_semaine: None,
                email_actif: Some(true),
                is_default: Some(false),
                actif: Some(true),
                segment_id: None,
                rendement_cible: None,
            })
            .unwrap();

        let contact = db
            .create_contact(NewContact {
                email: Some("variant@example.com".into()),
                ..sample_contact("VARIANT", "Test")
            })
            .unwrap();

        db.attribuer_etiquette(
            contact.id.unwrap(),
            etiqu.id,
            Some("MANUEL".into()),
            None,
        )
        .unwrap();

        let canonical = format_exceltis_etiquette_nom(Some("Rendement"), 8, 2026).unwrap();
        let state_json = serde_json::json!({
            "signals": [{
                "gmailMessageId": "test-msg-variant-aout-2026",
                "subject": "Remboursement Exceltis Rendement Août 2026",
                "millesimeLabel": "Août 2026",
                "etiquetteNom": canonical,
                "etiquetteId": null,
                "contactCount": 0,
                "receivedAt": now - 60,
            }]
        });
        db.set_setting(
            "stellium_exceltis_signals_v1",
            &state_json.to_string(),
        )
        .unwrap();

        db.sync_exceltis_etiquette_email_schedule(etiqu.id).unwrap();
        assert_eq!(
            db.get_etiquette_email_queue("ready").unwrap().len(),
            1,
            "nom variant doit matcher le signal Stellium par gamme et millésime"
        );
    }

    #[test]
    fn exceltis_different_gamme_same_millesime_does_not_link() {
        use crate::database::models::{NewEtiquette, NewTemplateEmail};
        use crate::email::stellium_exceltis::format_exceltis_etiquette_nom;

        let db = test_db();
        let now = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_secs() as i64;

        let tpl = db
            .create_template_email(NewTemplateEmail {
                nom: "Exceltis tpl gamme".into(),
                sujet: "Exceltis {{millesime}}".into(),
                corps: "Corps".into(),
                categorie: "INFO".into(),
                variables: None,
                agenda_link_id: None,
                relance_template_id: None,
                tutoiement_template_id: None,
            })
            .unwrap();

        let nom = format_exceltis_etiquette_nom(Some("Patrimoine"), 8, 2026).unwrap();
        let etiqu = db
            .create_etiquette(NewEtiquette {
                nom: nom.clone(),
                couleur: None,
                icone: None,
                description: None,
                priorite: Some(50),
                auto_condition_type: None,
                auto_condition_config: None,
                auto_categories: None,
                email_template_id: Some(tpl.id),
                email_delai_jours: Some(0),
                email_envoi_prevu: Some(1),
                email_envoi_heure: None,
                email_envoi_jours_semaine: None,
                email_actif: Some(true),
                is_default: Some(false),
                actif: Some(true),
                segment_id: None,
                rendement_cible: None,
            })
            .unwrap();

        let contact = db
            .create_contact(NewContact {
                email: Some("gamme@example.com".into()),
                ..sample_contact("GAMME", "Test")
            })
            .unwrap();

        db.attribuer_etiquette(
            contact.id.unwrap(),
            etiqu.id,
            Some("MANUEL".into()),
            None,
        )
        .unwrap();

        let rendement_nom = format_exceltis_etiquette_nom(Some("Rendement"), 8, 2026).unwrap();
        let state_json = serde_json::json!({
            "signals": [{
                "gmailMessageId": "test-msg-rendement-only",
                "subject": "Remboursement Exceltis Rendement Août 2026",
                "millesimeLabel": "Août 2026",
                "etiquetteNom": rendement_nom,
                "etiquetteId": null,
                "contactCount": 0,
                "receivedAt": now - 60,
            }]
        });
        db.set_setting(
            "stellium_exceltis_signals_v1",
            &state_json.to_string(),
        )
        .unwrap();

        db.sync_exceltis_etiquette_email_schedule(etiqu.id).unwrap();
        assert!(
            db.get_etiquette_email_queue("ready").unwrap().is_empty(),
            "signal Rendement ne doit pas planifier une étiquette Patrimoine"
        );
    }

    #[test]
    fn exceltis_legacy_stellium_signal_links_gamme_etiquette() {
        use crate::database::models::{NewEtiquette, NewTemplateEmail};

        let db = test_db();
        let now = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_secs() as i64;

        let tpl = db
            .create_template_email(NewTemplateEmail {
                nom: "Exceltis tpl legacy signal".into(),
                sujet: "Exceltis {{millesime}}".into(),
                corps: "Corps".into(),
                categorie: "INFO".into(),
                variables: None,
                agenda_link_id: None,
                relance_template_id: None,
                tutoiement_template_id: None,
            })
            .unwrap();

        let nom = "Exceltis Rendement — Août 2026".to_string();
        let etiqu = db
            .create_etiquette(NewEtiquette {
                nom: nom.clone(),
                couleur: None,
                icone: None,
                description: None,
                priorite: Some(50),
                auto_condition_type: None,
                auto_condition_config: None,
                auto_categories: None,
                email_template_id: Some(tpl.id),
                email_delai_jours: Some(0),
                email_envoi_prevu: Some(1),
                email_envoi_heure: None,
                email_envoi_jours_semaine: None,
                email_actif: Some(true),
                is_default: Some(false),
                actif: Some(true),
                segment_id: None,
                rendement_cible: None,
            })
            .unwrap();

        let contact = db
            .create_contact(NewContact {
                email: Some("legacy-signal@example.com".into()),
                ..sample_contact("LEGACY", "Signal")
            })
            .unwrap();

        db.attribuer_etiquette(
            contact.id.unwrap(),
            etiqu.id,
            Some("MANUEL".into()),
            None,
        )
        .unwrap();

        let state_json = serde_json::json!({
            "signals": [{
                "gmailMessageId": "test-msg-legacy-signal-nom",
                "subject": "Remboursement Exceltis Rendement Août 2026",
                "millesimeLabel": "Août 2026",
                "etiquetteNom": "Exceltis — Août 2026",
                "etiquetteId": null,
                "contactCount": 0,
                "receivedAt": now - 90,
            }]
        });
        db.set_setting(
            "stellium_exceltis_signals_v1",
            &state_json.to_string(),
        )
        .unwrap();

        db.sync_exceltis_etiquette_email_schedule(etiqu.id).unwrap();
        assert_eq!(
            db.get_etiquette_email_queue("ready").unwrap().len(),
            1,
            "signal legacy sans gamme dans etiquetteNom doit matcher via le sujet"
        );
    }

    #[test]
    fn exceltis_legacy_etiquette_links_gamme_signal() {
        use crate::database::models::{NewEtiquette, NewTemplateEmail};

        let db = test_db();
        let now = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_secs() as i64;

        let tpl = db
            .create_template_email(NewTemplateEmail {
                nom: "Exceltis tpl legacy etiquette".into(),
                sujet: "Exceltis {{millesime}}".into(),
                corps: "Corps".into(),
                categorie: "INFO".into(),
                variables: None,
                agenda_link_id: None,
                relance_template_id: None,
                tutoiement_template_id: None,
            })
            .unwrap();

        // Étiquette legacy d'avant la gamme : « Exceltis — {Mois} {Année} ».
        let etiqu = db
            .create_etiquette(NewEtiquette {
                nom: "Exceltis — Août 2026".into(),
                couleur: None,
                icone: None,
                description: None,
                priorite: Some(50),
                auto_condition_type: None,
                auto_condition_config: None,
                auto_categories: None,
                email_template_id: Some(tpl.id),
                email_delai_jours: Some(0),
                email_envoi_prevu: Some(1),
                email_envoi_heure: None,
                email_envoi_jours_semaine: None,
                email_actif: Some(true),
                is_default: Some(false),
                actif: Some(true),
                segment_id: None,
                rendement_cible: None,
            })
            .unwrap();

        let contact = db
            .create_contact(NewContact {
                email: Some("legacy-etiquette@example.com".into()),
                ..sample_contact("LEGACY", "Etiquette")
            })
            .unwrap();

        db.attribuer_etiquette(contact.id.unwrap(), etiqu.id, Some("MANUEL".into()), None)
            .unwrap();

        // Signal moderne avec gamme.
        let state_json = serde_json::json!({
            "signals": [{
                "gmailMessageId": "test-msg-gamme-legacy-etiquette",
                "subject": "Remboursement Exceltis Rendement Août 2026",
                "millesimeLabel": "Août 2026",
                "etiquetteNom": "Exceltis Rendement — Août 2026",
                "etiquetteId": null,
                "contactCount": 0,
                "receivedAt": now - 60,
            }]
        });
        db.set_setting("stellium_exceltis_signals_v1", &state_json.to_string())
            .unwrap();

        db.sync_exceltis_etiquette_email_schedule(etiqu.id).unwrap();
        assert_eq!(
            db.get_etiquette_email_queue("ready").unwrap().len(),
            1,
            "étiquette legacy sans gamme doit matcher un signal à gamme du même millésime"
        );
    }

    #[test]
    fn exceltis_etiquette_email_campaign_without_schedule_fields() {
        use crate::database::models::{NewEtiquette, NewTemplateEmail};
        use crate::email::stellium_exceltis::format_exceltis_etiquette_nom;

        let db = test_db();
        let tpl = db
            .create_template_email(NewTemplateEmail {
                nom: "Exceltis tpl".into(),
                sujet: "Exceltis {{millesime}}".into(),
                corps: "Corps".into(),
                categorie: "ARBITRAGE".into(),
                variables: None,
                agenda_link_id: None,
                relance_template_id: None,
                tutoiement_template_id: None,
            })
            .unwrap();

        let nom = format_exceltis_etiquette_nom(Some("Rendement"), 2, 2025).unwrap();
        let created = db
            .create_etiquette(NewEtiquette {
                nom: nom.clone(),
                couleur: None,
                icone: None,
                description: None,
                priorite: Some(50),
                auto_condition_type: None,
                auto_condition_config: None,
                auto_categories: None,
                email_template_id: Some(tpl.id),
                email_delai_jours: Some(0),
                email_envoi_prevu: None,
                email_envoi_heure: None,
                email_envoi_jours_semaine: None,
                email_actif: Some(true),
                is_default: Some(false),
                actif: Some(true),
                segment_id: None,
                rendement_cible: None,
            })
            .expect("campagne Exceltis sans date/heure doit être enregistrable");

        db.update_etiquette(
            created.id,
            &NewEtiquette {
                nom,
                couleur: Some(created.couleur.clone()),
                icone: None,
                description: created.description.clone(),
                priorite: Some(created.priorite),
                auto_condition_type: None,
                auto_condition_config: None,
                auto_categories: None,
                email_template_id: Some(tpl.id),
                email_delai_jours: Some(0),
                email_envoi_prevu: None,
                email_envoi_heure: None,
                email_envoi_jours_semaine: None,
                email_actif: Some(true),
                is_default: Some(false),
                actif: Some(true),
                segment_id: None,
                rendement_cible: None,
            },
        )
        .expect("mise à jour campagne Exceltis sans date/heure");
    }

    /// Simulation parcours CGP : créer l'étiquette → taguer → activer campagne → mail Stellium → file prête.
    #[test]
    fn exceltis_campaign_simulation_create_tag_enable_stellium_ready() {
        use crate::database::models::{NewContact, NewEtiquette, NewTemplateEmail};
        use crate::email::stellium_exceltis::format_exceltis_etiquette_nom;

        let db = test_db();
        let now = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_secs() as i64;

        let tpl = db
            .create_template_email(NewTemplateEmail {
                nom: "Exceltis — remboursement et arbitrage".into(),
                sujet: "Exceltis {{millesime}} — remboursement, {{prenom}}".into(),
                corps: "Corps campagne".into(),
                categorie: "ARBITRAGE".into(),
                variables: None,
                agenda_link_id: None,
                relance_template_id: None,
                tutoiement_template_id: None,
            })
            .unwrap();

        let nom = format_exceltis_etiquette_nom(Some("Rendement"), 2, 2025).unwrap();

        // Étape 1 — création (comme ensureExceltisEtiquette : template lié, campagne inactive)
        let etiqu = db
            .create_etiquette(NewEtiquette {
                nom: nom.clone(),
                couleur: Some("#EAB308".into()),
                icone: None,
                description: Some("Simulation Exceltis".into()),
                priorite: Some(50),
                auto_condition_type: None,
                auto_condition_config: None,
                auto_categories: None,
                email_template_id: Some(tpl.id),
                email_delai_jours: Some(0),
                email_envoi_prevu: None,
                email_envoi_heure: None,
                email_envoi_jours_semaine: None,
                email_actif: Some(false),
                is_default: Some(false),
                actif: Some(true),
                segment_id: None,
                rendement_cible: None,
            })
            .unwrap();

        let c1 = db
            .create_contact(NewContact {
                email: Some("client1@example.com".into()),
                ..sample_contact("DUPONT", "Jean")
            })
            .unwrap();
        let c2 = db
            .create_contact(NewContact {
                email: Some("client2@example.com".into()),
                ..sample_contact("BERNARD", "Luc")
            })
            .unwrap();

        // Étape 2 — pose manuelle sur les fiches
        db.attribuer_etiquette(c1.id.unwrap(), etiqu.id, Some("MANUEL".into()), None)
            .unwrap();
        db.attribuer_etiquette(c2.id.unwrap(), etiqu.id, Some("MANUEL".into()), None)
            .unwrap();

        assert!(
            db.get_etiquette_email_queue("ready").unwrap().is_empty(),
            "campagne inactive : aucun envoi"
        );

        // Étape 3 — activation campagne (onglet Email, sans date/heure)
        db.update_etiquette(
            etiqu.id,
            &NewEtiquette {
                nom: nom.clone(),
                couleur: Some("#EAB308".into()),
                icone: None,
                description: Some("Simulation Exceltis".into()),
                priorite: Some(50),
                auto_condition_type: None,
                auto_condition_config: None,
                auto_categories: None,
                email_template_id: Some(tpl.id),
                email_delai_jours: Some(0),
                email_envoi_prevu: None,
                email_envoi_heure: None,
                email_envoi_jours_semaine: None,
                email_actif: Some(true),
                is_default: Some(false),
                actif: Some(true),
                segment_id: None,
                rendement_cible: None,
            },
        )
        .unwrap();

        assert!(
            db.get_etiquette_email_queue("ready").unwrap().is_empty(),
            "sans mail Stellium : file prête vide"
        );
        assert!(
            db.get_etiquette_email_queue("incomplete")
                .unwrap()
                .iter()
                .all(|q| q.etiquette_id != etiqu.id),
            "Exceltis en attente Stellium n'apparaît pas dans « incomplète » (filtre SQL dédié)"
        );

        // Étape 4 — réception mail Stellium « Remboursement Exceltis Rendement Février 2025 »
        let state_json = serde_json::json!({
            "signals": [{
                "gmailMessageId": "sim-msg-fev-2025",
                "subject": "Remboursement Exceltis Rendement Février 2025",
                "millesimeLabel": "Février 2025",
                "etiquetteNom": nom,
                "etiquetteId": etiqu.id,
                "contactCount": 2,
                "receivedAt": now - 300,
            }]
        });
        db.set_setting("stellium_exceltis_signals_v1", &state_json.to_string())
            .unwrap();
        db.sync_exceltis_etiquette_email_schedule(etiqu.id).unwrap();

        // Étape 5 — file Suivi → Envois prête
        let ready = db.get_etiquette_email_queue("ready").unwrap();
        let ready_for_etiqu: Vec<_> = ready
            .iter()
            .filter(|q| q.etiquette_id == etiqu.id)
            .collect();
        assert_eq!(
            ready_for_etiqu.len(),
            2,
            "deux contacts doivent être prêts à envoyer"
        );
        assert!(ready_for_etiqu
            .iter()
            .all(|q| !q.template_sujet.is_empty() && !q.template_corps.is_empty()));
        assert!(
            ready_for_etiqu
                .iter()
                .all(|q| q.email_date_prevue.is_some() && q.email_date_prevue.unwrap() <= now),
            "date prévue basée sur le signal Stellium (passée)"
        );

        // Contact tagué après le signal : planifié immédiatement
        let c3 = db
            .create_contact(NewContact {
                email: Some("client3@example.com".into()),
                ..sample_contact("LEGRAND", "Paul")
            })
            .unwrap();
        db.attribuer_etiquette(c3.id.unwrap(), etiqu.id, Some("MANUEL".into()), None)
            .unwrap();
        let ready_after = db
            .get_etiquette_email_queue("ready")
            .unwrap()
            .into_iter()
            .filter(|q| q.etiquette_id == etiqu.id)
            .count();
        assert_eq!(
            ready_after, 3,
            "nouveau contact taggé après Stellium entre aussi en file"
        );
    }

    #[test]
    fn exceltis_email_queue_includes_rendement_cible() {
        use crate::database::models::{NewEtiquette, NewTemplateEmail};
        use crate::email::stellium_exceltis::format_exceltis_etiquette_nom;

        let db = test_db();
        let now = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_secs() as i64;

        let tpl = db
            .create_template_email(NewTemplateEmail {
                nom: "Exceltis tpl rendement".into(),
                sujet: "Exceltis {{millesime}}".into(),
                corps: "Perf {{rendement_exceltis}}".into(),
                categorie: "INFO".into(),
                variables: None,
                agenda_link_id: None,
                relance_template_id: None,
                tutoiement_template_id: None,
            })
            .unwrap();

        let nom = format_exceltis_etiquette_nom(Some("Rendement"), 2, 2025).unwrap();
        let etiqu = db
            .create_etiquette(NewEtiquette {
                nom: nom.clone(),
                couleur: None,
                icone: None,
                description: None,
                priorite: Some(50),
                auto_condition_type: None,
                auto_condition_config: None,
                auto_categories: None,
                email_template_id: Some(tpl.id),
                email_delai_jours: Some(0),
                email_envoi_prevu: Some(1),
                email_envoi_heure: None,
                email_envoi_jours_semaine: None,
                email_actif: Some(true),
                is_default: Some(false),
                actif: Some(true),
                segment_id: None,
                rendement_cible: Some("9 %/an".into()),
            })
            .unwrap();

        let contact = db
            .create_contact(NewContact {
                email: Some("rendement@example.com".into()),
                ..sample_contact("DUPONT", "Marie")
            })
            .unwrap();

        db.attribuer_etiquette(contact.id.unwrap(), etiqu.id, Some("MANUEL".into()), None)
            .unwrap();

        let state_json = serde_json::json!({
            "signals": [{
                "gmailMessageId": "sim-rendement",
                "subject": "Remboursement Exceltis Rendement Février 2025",
                "millesimeLabel": "Février 2025",
                "etiquetteNom": nom,
                "etiquetteId": etiqu.id,
                "contactCount": 1,
                "receivedAt": now - 60,
            }]
        });
        db.set_setting("stellium_exceltis_signals_v1", &state_json.to_string())
            .unwrap();
        db.sync_exceltis_etiquette_email_schedule(etiqu.id).unwrap();

        let ready = db.get_etiquette_email_queue("ready").unwrap();
        let row = ready
            .iter()
            .find(|q| q.etiquette_id == etiqu.id)
            .expect("ligne ready Exceltis");
        assert_eq!(row.rendement_exceltis, "9 %/an");
    }

    #[test]
    fn auto_recalc_keeps_cancelled_suivi_out_of_ready_queue() {
        use crate::database::models::{NewEtiquette, NewTemplateEmail};

        let db = test_db();
        db.ensure_default_segments_and_alerte_links().unwrap();
        db.ensure_default_etiquettes().unwrap();

        let tpl = db
            .create_template_email(NewTemplateEmail {
                nom: "Suivi tpl".into(),
                sujet: "Bonjour {{prenom}}".into(),
                corps: "Corps".into(),
                categorie: "INFO".into(),
                variables: None,
                agenda_link_id: None,
                relance_template_id: None,
                tutoiement_template_id: None,
            })
            .unwrap();
        let etiqu_before = db
            .get_all_etiquettes()
            .unwrap()
            .into_iter()
            .find(|e| e.nom.trim().eq_ignore_ascii_case("Suivi > 1 an"))
            .expect("étiquette Suivi > 1 an");
        let now = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_secs() as i64;
        db.update_etiquette(
            etiqu_before.id,
            &NewEtiquette {
                nom: etiqu_before.nom.clone(),
                couleur: Some(etiqu_before.couleur.clone()),
                icone: etiqu_before.icone.clone(),
                description: etiqu_before.description.clone(),
                priorite: Some(etiqu_before.priorite),
                auto_condition_type: etiqu_before.auto_condition_type.clone(),
                auto_condition_config: etiqu_before.auto_condition_config.clone(),
                auto_categories: etiqu_before.auto_categories.clone(),
                email_template_id: Some(tpl.id),
                email_delai_jours: Some(0),
                email_envoi_prevu: Some(now - 120),
                email_envoi_heure: etiqu_before.email_envoi_heure.clone(),
                email_envoi_jours_semaine: etiqu_before.email_envoi_jours_semaine.clone(),
                email_actif: Some(true),
                is_default: Some(etiqu_before.is_default),
                actif: Some(etiqu_before.actif),
                segment_id: etiqu_before.segment_id,
                rendement_cible: etiqu_before.rendement_cible.clone(),
            },
        )
        .unwrap();

        let old_ts = chrono::Utc::now().timestamp() - 400 * 24 * 3600;
        let old_iso = chrono::DateTime::from_timestamp(old_ts, 0).unwrap().to_rfc3339();
        let cid = db
            .create_contact(NewContact {
                date_dernier_contact: Some(old_iso),
                registre: Some("VOUS".into()),
                email: Some("vous.restore@example.com".into()),
                ..sample_contact("Boller", "Myriam")
            })
            .unwrap()
            .id
            .unwrap();

        db.check_and_apply_auto_etiquettes().unwrap();
        let row_id = db
            .get_etiquette_email_queue("ready")
            .unwrap()
            .into_iter()
            .find(|q| q.contact_id == cid)
            .expect("contact en file prête")
            .contact_etiquette_id;

        db.cancel_pending_email_campaign(row_id, None).unwrap();
        assert!(db.get_etiquette_email_queue("ready").unwrap().iter().all(|q| q.contact_id != cid));
        assert_eq!(db.get_etiquette_email_queue("cancelled").unwrap().len(), 1);

        db.check_and_apply_auto_etiquettes().unwrap();
        assert!(
            db.get_etiquette_email_queue("ready")
                .unwrap()
                .iter()
                .all(|q| q.contact_id != cid),
            "recalcul auto ne doit pas remettre un envoi retiré manuellement (✕)"
        );
        assert_eq!(
            db.get_etiquette_email_queue("cancelled")
                .unwrap()
                .iter()
                .filter(|q| q.contact_id == cid)
                .count(),
            1
        );
    }

    #[test]
    fn dismiss_cancelled_pending_keeps_out_of_queue_after_recalc() {
        use crate::database::models::{NewEtiquette, NewTemplateEmail};

        let db = test_db();
        db.ensure_default_segments_and_alerte_links().unwrap();
        db.ensure_default_etiquettes().unwrap();

        let tpl = db
            .create_template_email(NewTemplateEmail {
                nom: "Suivi tpl dismiss".into(),
                sujet: "Bonjour".into(),
                corps: "Corps".into(),
                categorie: "INFO".into(),
                variables: None,
                agenda_link_id: None,
                relance_template_id: None,
                tutoiement_template_id: None,
            })
            .unwrap();
        let etiqu_before = db
            .get_all_etiquettes()
            .unwrap()
            .into_iter()
            .find(|e| e.nom.trim().eq_ignore_ascii_case("Suivi > 1 an"))
            .expect("étiquette Suivi > 1 an");
        let now = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_secs() as i64;
        db.update_etiquette(
            etiqu_before.id,
            &NewEtiquette {
                nom: etiqu_before.nom.clone(),
                couleur: Some(etiqu_before.couleur.clone()),
                icone: etiqu_before.icone.clone(),
                description: etiqu_before.description.clone(),
                priorite: Some(etiqu_before.priorite),
                auto_condition_type: etiqu_before.auto_condition_type.clone(),
                auto_condition_config: etiqu_before.auto_condition_config.clone(),
                auto_categories: etiqu_before.auto_categories.clone(),
                email_template_id: Some(tpl.id),
                email_delai_jours: Some(0),
                email_envoi_prevu: Some(now - 120),
                email_envoi_heure: etiqu_before.email_envoi_heure.clone(),
                email_envoi_jours_semaine: etiqu_before.email_envoi_jours_semaine.clone(),
                email_actif: Some(true),
                is_default: Some(etiqu_before.is_default),
                actif: Some(etiqu_before.actif),
                segment_id: etiqu_before.segment_id,
                rendement_cible: etiqu_before.rendement_cible.clone(),
            },
        )
        .unwrap();

        let old_ts = chrono::Utc::now().timestamp() - 400 * 24 * 3600;
        let old_iso = chrono::DateTime::from_timestamp(old_ts, 0).unwrap().to_rfc3339();
        let cid = db
            .create_contact(NewContact {
                date_dernier_contact: Some(old_iso),
                email: Some("dismiss.cancel@example.com".into()),
                ..sample_contact("Laplace", "Philippe")
            })
            .unwrap()
            .id
            .unwrap();

        db.check_and_apply_auto_etiquettes().unwrap();
        let row_id = db
            .get_etiquette_email_queue("ready")
            .unwrap()
            .into_iter()
            .find(|q| q.contact_id == cid)
            .expect("contact en file prête")
            .contact_etiquette_id;

        db.cancel_pending_email_campaign(row_id, None).unwrap();
        assert_eq!(db.get_etiquette_email_queue("cancelled").unwrap().len(), 1);

        db.dismiss_cancelled_pending_email_campaign(row_id, None).unwrap();
        assert!(db.get_etiquette_email_queue("cancelled").unwrap().is_empty());
        assert!(
            db.get_etiquette_email_queue("ready")
                .unwrap()
                .iter()
                .all(|q| q.contact_id != cid)
        );

        db.check_and_apply_auto_etiquettes().unwrap();
        assert!(
            db.get_etiquette_email_queue("ready")
                .unwrap()
                .iter()
                .all(|q| q.contact_id != cid),
            "ignoré définitivement : pas de retour en file après recalcul"
        );
        assert!(db.get_etiquette_email_queue("cancelled").unwrap().is_empty());
    }

    #[test]
    fn cancel_incomplete_without_email_moves_to_cancelled_queue() {
        use crate::database::models::{NewEtiquette, NewTemplateEmail};

        let db = test_db();
        let tpl = db
            .create_template_email(NewTemplateEmail {
                nom: "Bienvenue incomplete".into(),
                sujet: "Bonjour {{prenom}}".into(),
                corps: "Corps".into(),
                categorie: "INFO".into(),
                variables: None,
                agenda_link_id: None,
                relance_template_id: None,
                tutoiement_template_id: None,
            })
            .unwrap();
        let now = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_secs() as i64;
        let etiqu = db
            .create_etiquette(NewEtiquette {
                nom: "Campagne incomplete".into(),
                couleur: None,
                icone: None,
                description: None,
                priorite: Some(0),
                auto_condition_type: None,
                auto_condition_config: None,
                auto_categories: None,
                email_template_id: Some(tpl.id),
                email_delai_jours: Some(0),
                email_envoi_prevu: Some(now - 120),
                email_envoi_heure: None,
                email_envoi_jours_semaine: None,
                email_actif: Some(true),
                is_default: Some(false),
                actif: None,
                segment_id: None,
                rendement_cible: None,
            })
            .unwrap();

        let contact = db
            .create_contact(NewContact {
                email: None,
                ..sample_contact("Pinto", "Rafael")
            })
            .unwrap();
        let cid = contact.id.unwrap();

        db.attribuer_etiquette(cid, etiqu.id, Some("MANUEL".into()), None)
            .unwrap();

        let incomplete = db.get_etiquette_email_queue("incomplete").unwrap();
        assert_eq!(incomplete.len(), 1);
        assert_eq!(incomplete[0].queue_issue.as_deref(), Some("NO_EMAIL"));
        let row_id = incomplete[0].contact_etiquette_id;

        db.cancel_pending_email_campaign(row_id, None).unwrap();
        assert!(db.get_etiquette_email_queue("incomplete").unwrap().is_empty());
        let cancelled = db.get_etiquette_email_queue("cancelled").unwrap();
        assert_eq!(cancelled.len(), 1);
        assert_eq!(cancelled[0].contact_id, cid);

        db.dismiss_cancelled_pending_email_campaign(row_id, None).unwrap();
        assert!(db.get_etiquette_email_queue("cancelled").unwrap().is_empty());
        assert!(db.get_etiquette_email_queue("incomplete").unwrap().is_empty());
    }

    #[test]
    fn cancel_template_incomplete_without_email_moves_to_cancelled_then_dismiss() {
        use crate::database::models::NewTemplateEmail;

        let db = test_db();
        let now = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_secs() as i64;
        let trigger_vars = r#"{"email_trigger":{"enabled":true,"condition_type":"DELAI_SANS_CONTACT","categories":["CLIENT"],"delai_jours":0}}"#;
        let tpl = db
            .create_template_email(NewTemplateEmail {
                nom: "Bienvenue nouveau client test".into(),
                sujet: "Bienvenue {{prenom}}".into(),
                corps: "Corps".into(),
                categorie: "BIENVENUE".into(),
                variables: Some(trigger_vars.into()),
                agenda_link_id: None,
                relance_template_id: None,
                tutoiement_template_id: None,
            })
            .unwrap();

        let contact = db
            .create_contact(NewContact {
                email: None,
                registre: Some("VOUS".into()),
                ..sample_contact("Pinto", "Rafael")
            })
            .unwrap();
        let cid = contact.id.unwrap();

        db.connection()
            .execute(
                "INSERT INTO contact_template_envois (
                    contact_id, template_id, trigger_event_at, email_date_prevue
                 ) VALUES (?1, ?2, ?3, ?4)",
                rusqlite::params![cid, tpl.id, now - 3600, now - 120],
            )
            .unwrap();

        let incomplete = db.get_etiquette_email_queue("incomplete").unwrap();
        assert_eq!(incomplete.len(), 1);
        assert!(
            incomplete[0].etiquette_nom.contains("Modèle"),
            "file modèle attendue"
        );
        assert_eq!(incomplete[0].queue_issue.as_deref(), Some("NO_EMAIL"));
        let row_id = incomplete[0].contact_etiquette_id;

        db.cancel_pending_email_campaign(row_id, Some("template")).unwrap();
        assert!(db.get_etiquette_email_queue("incomplete").unwrap().is_empty());
        let cancelled = db.get_etiquette_email_queue("cancelled").unwrap();
        assert_eq!(cancelled.len(), 1);

        db.dismiss_cancelled_pending_email_campaign(row_id, Some("template")).unwrap();
        assert!(db.get_etiquette_email_queue("cancelled").unwrap().is_empty());
        assert!(db.get_etiquette_email_queue("incomplete").unwrap().is_empty());
    }

    #[test]
    fn template_periode_annee_trigger_reschedules_after_period_reset() {
        use crate::database::models::{NewContact, NewTemplateEmail};

        let db = test_db();
        let now = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_secs() as i64;
        let (_, current_month) = crate::database::Database::auto_etiquette_now_and_month();
        let out_of_period_month = if current_month == 12 {
            1
        } else {
            current_month + 1
        };

        // Mois volontairement hors période courante → sync efface l'ancienne campagne.
        let trigger_vars = format!(
            r#"{{"email_trigger":{{"enabled":true,"condition_type":"PERIODE_ANNEE","condition_config":"{{\"mois_debut\":{out_of_period_month},\"mois_fin\":{out_of_period_month}}}","categories":["CLIENT"],"delai_jours":0}}}}"#
        );
        let tpl = db
            .create_template_email(NewTemplateEmail {
                nom: "Réduction impôt test période".into(),
                sujet: "Impôts {{prenom}}".into(),
                corps: "Corps".into(),
                categorie: "FISCALITE".into(),
                variables: Some(trigger_vars.into()),
                agenda_link_id: None,
                relance_template_id: None,
                tutoiement_template_id: None,
            })
            .unwrap();

        let contact = db
            .create_contact(NewContact {
                email: Some("client@example.com".into()),
                ..sample_contact("Martin", "Claire")
            })
            .unwrap();
        let cid = contact.id.unwrap();

        db.connection()
            .execute(
                "INSERT INTO contact_template_envois (
                    contact_id, template_id, trigger_event_at, email_date_prevue, email_envoye, email_date_envoi
                 ) VALUES (?1, ?2, ?3, ?4, 1, ?5)",
                rusqlite::params![cid, tpl.id, now - 86_400, now - 86_400, now - 86_400],
            )
            .unwrap();

        db.sync_template_email_triggers_for_contact(cid).unwrap();

        let count_after_reset: i64 = db
            .conn
            .query_row(
                "SELECT COUNT(*) FROM contact_template_envois WHERE contact_id = ?1 AND template_id = ?2",
                params![cid, tpl.id],
                |r| r.get(0),
            )
            .unwrap();
        assert_eq!(
            count_after_reset, 0,
            "hors période configurée, la campagne envoyée doit être effacée"
        );

        // Période incluant le mois courant → nouvelle proposition d'envoi.
        let in_period_vars = format!(
            r#"{{"email_trigger":{{"enabled":true,"condition_type":"PERIODE_ANNEE","condition_config":"{{\"mois_debut\":{current_month},\"mois_fin\":{current_month}}}","categories":["CLIENT"],"delai_jours":0}}}}"#
        );
        db.conn
            .execute(
                "UPDATE templates_email SET variables = ?1 WHERE id = ?2",
                params![in_period_vars, tpl.id],
            )
            .unwrap();

        let scheduled = db.sync_template_email_triggers_for_contact(cid).unwrap();
        assert_eq!(scheduled, 1);

        let pending: i64 = db
            .conn
            .query_row(
                "SELECT COUNT(*) FROM contact_template_envois
                 WHERE contact_id = ?1 AND template_id = ?2 AND email_envoye = 0",
                params![cid, tpl.id],
                |r| r.get(0),
            )
            .unwrap();
        assert_eq!(pending, 1, "dans la période, un nouvel envoi doit être proposé");
    }

    #[test]
    fn full_recalc_syncs_template_periode_annee_triggers() {
        use crate::database::models::{NewContact, NewTemplateEmail};

        let db = test_db();
        let (_, current_month) = crate::database::Database::auto_etiquette_now_and_month();
        let trigger_vars = format!(
            r#"{{"email_trigger":{{"enabled":true,"condition_type":"PERIODE_ANNEE","condition_config":"{{\"mois_debut\":{current_month},\"mois_fin\":{current_month}}}","categories":["CLIENT"],"delai_jours":0}}}}"#
        );
        db.create_template_email(NewTemplateEmail {
            nom: "Réduction impôt recalc bulk".into(),
            sujet: "Impôts {{prenom}}".into(),
            corps: "Corps".into(),
            categorie: "FISCALITE".into(),
            variables: Some(trigger_vars),
            agenda_link_id: None,
            relance_template_id: None,
            tutoiement_template_id: None,
        })
        .unwrap();

        let contact = db
            .create_contact(NewContact {
                email: Some("bulk@example.com".into()),
                ..sample_contact("Durand", "Paul")
            })
            .unwrap();
        let cid = contact.id.unwrap();

        db.check_and_apply_auto_etiquettes().unwrap();

        let pending: i64 = db
            .conn
            .query_row(
                "SELECT COUNT(*) FROM contact_template_envois WHERE contact_id = ?1 AND email_envoye = 0",
                params![cid],
                |r| r.get(0),
            )
            .unwrap();
        assert_eq!(
            pending, 1,
            "le recalcul complet doit alimenter la file des déclencheurs modèle"
        );
    }

    #[test]
    fn delete_template_email_clears_relance_link_on_parent() {
        use crate::database::models::NewTemplateEmail;

        let db = test_db();
        let relance = db
            .create_template_email(NewTemplateEmail {
                nom: "Relance — test orphan".into(),
                sujet: "Suite".into(),
                corps: "Corps".into(),
                categorie: "RELANCE".into(),
                variables: None,
                agenda_link_id: None,
                relance_template_id: None,
                tutoiement_template_id: None,
            })
            .unwrap();
        let parent = db
            .create_template_email(NewTemplateEmail {
                nom: "Parent test".into(),
                sujet: "Bonjour".into(),
                corps: "Corps".into(),
                categorie: "RELANCE".into(),
                variables: None,
                agenda_link_id: None,
                relance_template_id: Some(relance.id),
                tutoiement_template_id: None,
            })
            .unwrap();

        db.delete_template_email(relance.id).unwrap();

        let updated = db.get_template_email_by_id(parent.id).unwrap();
        assert!(updated.relance_template_id.is_none());
        assert!(db.get_template_email_by_id(relance.id).is_err());
    }

    #[test]
    fn etiquette_email_queue_ready_incomplete_sent() {
        use crate::database::models::{NewEtiquette, NewTemplateEmail};

        fn sample_etiquette(
            nom: &str,
            template_id: Option<i64>,
            envoi_prevu: Option<i64>,
            envoi_heure: Option<&str>,
        ) -> NewEtiquette {
            NewEtiquette {
                nom: nom.into(),
                couleur: None,
                icone: None,
                description: None,
                priorite: Some(0),
                auto_condition_type: None,
                auto_condition_config: None,
                auto_categories: None,
                email_template_id: template_id,
                email_delai_jours: Some(0),
                email_envoi_prevu: envoi_prevu,
                email_envoi_heure: envoi_heure.map(|s| s.to_string()),
                email_envoi_jours_semaine: None,
                email_actif: Some(true),
                is_default: Some(false),
                actif: None,
                segment_id: None,
                rendement_cible: None,
            }
        }

        let db = test_db();
        let now = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_secs() as i64;

        let tpl = db
            .create_template_email(NewTemplateEmail {
                nom: "Tpl test".into(),
                sujet: "Bonjour {{prenom}}".into(),
                corps: "Corps".into(),
                categorie: "INFO".into(),
                variables: None,
                agenda_link_id: None,
                relance_template_id: None,
                tutoiement_template_id: None,
            })
            .unwrap();
        let relance_tpl = db
            .create_template_email(NewTemplateEmail {
                nom: "Relance tpl test".into(),
                sujet: "RELANCER {{prenom}}".into(),
                corps: "Suite sans reponse".into(),
                categorie: "RELANCE".into(),
                variables: None,
                agenda_link_id: None,
                relance_template_id: None,
                tutoiement_template_id: None,
            })
            .unwrap();
        db.update_template_email(
            tpl.id,
            &NewTemplateEmail {
                nom: tpl.nom.clone(),
                sujet: tpl.sujet.clone(),
                corps: tpl.corps.clone(),
                categorie: tpl.categorie.clone(),
                variables: tpl.variables.clone(),
                agenda_link_id: tpl.agenda_link_id.clone(),
                relance_template_id: Some(relance_tpl.id),
                tutoiement_template_id: None,
            },
        )
        .unwrap();

        let etiqu = db
            .create_etiquette(sample_etiquette(
                "Campagne test",
                Some(tpl.id),
                Some(now + 86_400),
                None,
            ))
            .unwrap();

        let contact = db
            .create_contact(NewContact {
                email: Some("client@example.com".into()),
                telephone: Some("0601020304".into()),
                ..sample_contact("Martin", "Alice")
            })
            .unwrap();
        let cid = contact.id.unwrap();

        db.attribuer_etiquette(cid, etiqu.id, Some("MANUEL".into()), None)
            .unwrap();

        assert!(db.get_etiquette_email_queue("ready").unwrap().is_empty());
        let scheduled = db.get_etiquette_email_queue("scheduled").unwrap();
        assert_eq!(scheduled.len(), 1);
        assert_eq!(scheduled[0].queue_issue.as_deref(), Some("SCHEDULED"));
        assert!(db.get_etiquette_email_queue("incomplete").unwrap().is_empty());

        db.update_etiquette(
            etiqu.id,
            &sample_etiquette("Campagne test", Some(tpl.id), Some(now - 120), None),
        )
        .unwrap();

        let ready = db.get_etiquette_email_queue("ready").unwrap();
        assert_eq!(ready.len(), 1);
        assert_eq!(ready[0].contact_telephone.as_deref(), Some("0601020304"));

        let ce_id = ready[0].contact_etiquette_id;
        db.mark_etiquette_email_sent(ce_id, None, None, Some("Objet test"), Some("Corps test"), None, None)
            .unwrap();
        assert!(db.get_etiquette_email_queue("ready").unwrap().is_empty());
        assert_eq!(db.get_etiquette_email_queue("sent").unwrap().len(), 1);
        assert!(
            db.get_etiquette_email_queue("followup").unwrap().is_empty(),
            "envoi récent : pas encore en relance"
        );
        let timeline_after_send = db.get_exchange_history_timeline(None).unwrap();
        let sent_row = timeline_after_send
            .iter()
            .find(|e| e.entry_kind == "email_campagne" && e.contact_id == cid)
            .expect("fil après envoi");
        assert_eq!(sent_row.sent_body.as_deref(), Some("Corps test"));
        assert_eq!(sent_row.sent_subject.as_deref(), Some("Objet test"));

        db.prepare_email_campaign_relance(ce_id, None).unwrap();
        let timeline_after_relance_prep = db.get_exchange_history_timeline(None).unwrap();
        assert!(
            timeline_after_relance_prep
                .iter()
                .any(|e| e.contact_id == cid && e.entry_kind == "email_campagne"),
            "1er envoi visible après préparation relance (sans réponse)"
        );
        let ready_relance = db.get_etiquette_email_queue("ready").unwrap();
        assert_eq!(ready_relance.len(), 1);
        assert!(ready_relance[0].email_is_relance);
        assert!(ready_relance[0].template_sujet.contains("RELANCER"));

        assert_eq!(db.get_interactions_by_contact(cid).unwrap().len(), 0);
        assert!(db
            .mark_etiquette_email_sent(999_999, None, None, None, None, None, None)
            .is_err());

        db.mark_etiquette_email_sent(ce_id, None, None, Some("Objet relance"), None, None, None)
            .unwrap();
        let after_relance = db.get_interactions_by_contact(cid).unwrap();
        assert_eq!(after_relance.len(), 1);
        assert!(
            after_relance.iter().any(|i| {
                i.contenu
                    .as_deref()
                    .is_some_and(|c| c.contains("relance email (2e envoi)"))
            })
        );
        db.mark_etiquette_email_sent(ce_id, None, None, Some("Objet relance"), None, None, None)
            .unwrap();
        assert_eq!(db.get_interactions_by_contact(cid).unwrap().len(), 1);

        db.create_alerte(crate::database::models::NewAlerte {
            contact_id: cid,
            type_alerte: "SUIVI_CLIENT_1AN".into(),
            message: "Test alerte".into(),
            date_alerte: Some(now),
        })
        .unwrap();
        assert_eq!(db.get_alertes_for_contact(cid).unwrap().len(), 1);

        let date_before_mail = db.get_contact_by_id(cid).unwrap().date_dernier_contact;
        db.mark_email_campaign_response(ce_id, "mail", None, None, None, None, None)
            .unwrap();
        assert!(
            db.get_etiquette_email_queue("sent").unwrap().is_empty(),
            "réponse client : plus en attente dans sent"
        );
        assert!(
            db.get_etiquette_email_queue("followup").unwrap().is_empty(),
            "réponse client : plus en relance"
        );
        assert_eq!(db.get_interactions_by_contact(cid).unwrap().len(), 1);
        assert_eq!(
            db.get_contact_by_id(cid).unwrap().date_dernier_contact,
            date_before_mail,
            "réponse mail ne doit pas mettre à jour le dernier contact"
        );
        assert_eq!(
            db.get_alertes_for_contact(cid).unwrap().len(),
            1,
            "réponse mail ne clôture pas les alertes suivi client"
        );

        db.mark_email_campaign_response(ce_id, "mail", None, None, None, None, None)
            .unwrap();
        assert_eq!(db.get_interactions_by_contact(cid).unwrap().len(), 1);

        let contact_rdv = db
            .create_contact(NewContact {
                email: Some("rdv@example.com".into()),
                ..sample_contact("Durand", "Paul")
            })
            .unwrap();
        let cid_rdv = contact_rdv.id.unwrap();
        db.attribuer_etiquette(cid_rdv, etiqu.id, Some("MANUEL".into()), None)
            .unwrap();
        db.update_etiquette(
            etiqu.id,
            &sample_etiquette("Campagne test", Some(tpl.id), Some(now - 60), None),
        )
        .unwrap();
        let ce_rdv = db
            .get_etiquette_email_queue("ready")
            .unwrap()
            .into_iter()
            .find(|q| q.contact_id == cid_rdv)
            .expect("file prête pour contact RDV")
            .contact_etiquette_id;
        db.mark_etiquette_email_sent(ce_rdv, None, None, Some("Objet RDV"), None, None, None)
            .unwrap();
        db.create_alerte(crate::database::models::NewAlerte {
            contact_id: cid_rdv,
            type_alerte: "SUIVI_CLIENT_1AN".into(),
            message: "Test alerte RDV".into(),
            date_alerte: Some(now),
        })
        .unwrap();
        assert!(db.get_contact_by_id(cid_rdv).unwrap().date_dernier_contact.is_none());
        let rdv_at = now + 86400 * 10;
        db.mark_email_campaign_response(ce_rdv, "rdv", None, None, None, Some(rdv_at), None)
            .unwrap();
        assert_eq!(
            db.get_contact_by_id(cid_rdv).unwrap().date_dernier_contact,
            Some(rdv_at),
            "RDV pris enregistre la date du rendez-vous comme dernier contact"
        );
        assert!(
            db.get_alertes_for_contact(cid_rdv).unwrap().is_empty(),
            "alerte suivi clôturée quand la date RDV est récente"
        );

        let timeline = db.get_exchange_history_timeline(None).unwrap();
        let bruno_email = timeline
            .iter()
            .find(|e| e.entry_kind == "email_campagne" && e.contact_id == cid)
            .expect("fil email campagne");
        assert_eq!(bruno_email.email_reponse_type.as_deref(), Some("mail"));

        let no_email = db
            .create_contact(NewContact {
                email: None,
                ..sample_contact("Sans", "Mail")
            })
            .unwrap();
        db.attribuer_etiquette(no_email.id.unwrap(), etiqu.id, Some("MANUEL".into()), None)
            .unwrap();
        let incomplete = db.get_etiquette_email_queue("incomplete").unwrap();
        assert!(
            incomplete
                .iter()
                .any(|i| i.queue_issue.as_deref() == Some("NO_EMAIL"))
        );
    }

    #[test]
    fn etiquette_email_queue_registre_tu_main_and_relance() {
        use crate::database::models::{NewEtiquette, NewTemplateEmail};

        fn sample_etiquette(nom: &str, template_id: i64, envoi_prevu: i64) -> NewEtiquette {
            NewEtiquette {
                nom: nom.into(),
                couleur: None,
                icone: None,
                description: None,
                priorite: Some(0),
                auto_condition_type: None,
                auto_condition_config: None,
                auto_categories: None,
                email_template_id: Some(template_id),
                email_delai_jours: Some(0),
                email_envoi_prevu: Some(envoi_prevu),
                email_envoi_heure: None,
                email_envoi_jours_semaine: None,
                email_actif: Some(true),
                is_default: Some(false),
                actif: None,
                segment_id: None,
                rendement_cible: None,
            }
        }

        let db = test_db();
        let now = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_secs() as i64;

        let main_vous = db
            .create_template_email(NewTemplateEmail {
                nom: "Campagne registre".into(),
                sujet: "SUJET_VOUS_MAIN".into(),
                corps: "CORPS_VOUS_MAIN".into(),
                categorie: "INFO".into(),
                variables: None,
                agenda_link_id: None,
                relance_template_id: None,
                tutoiement_template_id: None,
            })
            .unwrap();
        let main_tu = db
            .create_template_email(NewTemplateEmail {
                nom: "Campagne registre (tu)".into(),
                sujet: "SUJET_TU_MAIN".into(),
                corps: "CORPS_TU_MAIN".into(),
                categorie: "INFO".into(),
                variables: None,
                agenda_link_id: None,
                relance_template_id: None,
                tutoiement_template_id: None,
            })
            .unwrap();
        let rel_vous = db
            .create_template_email(NewTemplateEmail {
                nom: "Relance — Campagne registre".into(),
                sujet: "SUJET_VOUS_REL".into(),
                corps: "CORPS_VOUS_REL".into(),
                categorie: "RELANCE".into(),
                variables: None,
                agenda_link_id: None,
                relance_template_id: None,
                tutoiement_template_id: None,
            })
            .unwrap();
        let rel_tu = db
            .create_template_email(NewTemplateEmail {
                nom: "Relance — Campagne registre (tu)".into(),
                sujet: "SUJET_TU_REL".into(),
                corps: "CORPS_TU_REL".into(),
                categorie: "RELANCE".into(),
                variables: None,
                agenda_link_id: None,
                relance_template_id: None,
                tutoiement_template_id: None,
            })
            .unwrap();

        db.update_template_email(
            rel_vous.id,
            &NewTemplateEmail {
                nom: rel_vous.nom.clone(),
                sujet: rel_vous.sujet.clone(),
                corps: rel_vous.corps.clone(),
                categorie: rel_vous.categorie.clone(),
                variables: rel_vous.variables.clone(),
                agenda_link_id: rel_vous.agenda_link_id.clone(),
                relance_template_id: None,
                tutoiement_template_id: Some(rel_tu.id),
            },
        )
        .unwrap();
        db.update_template_email(
            main_vous.id,
            &NewTemplateEmail {
                nom: main_vous.nom.clone(),
                sujet: main_vous.sujet.clone(),
                corps: main_vous.corps.clone(),
                categorie: main_vous.categorie.clone(),
                variables: main_vous.variables.clone(),
                agenda_link_id: main_vous.agenda_link_id.clone(),
                relance_template_id: Some(rel_vous.id),
                tutoiement_template_id: Some(main_tu.id),
            },
        )
        .unwrap();

        let etiqu = db
            .create_etiquette(sample_etiquette(
                "Campagne registre tu",
                main_vous.id,
                now - 60,
            ))
            .unwrap();

        let mut contact_tu = sample_contact("Tuto", "Client");
        contact_tu.registre = Some("TU".into());
        contact_tu.email = Some("tu@example.com".into());
        let cid_tu = db.create_contact(contact_tu).unwrap().id.unwrap();
        db.attribuer_etiquette(cid_tu, etiqu.id, Some("MANUEL".into()), None)
            .unwrap();

        let ready_tu = db.get_etiquette_email_queue("ready").unwrap();
        let row_tu = ready_tu
            .iter()
            .find(|q| q.contact_id == cid_tu)
            .expect("file prête contact TU");
        assert_eq!(row_tu.template_sujet, "SUJET_TU_MAIN");
        assert_eq!(row_tu.template_corps, "CORPS_TU_MAIN");
        assert_eq!(row_tu.contact_registre.as_deref(), Some("TU"));

        let ce_tu = row_tu.contact_etiquette_id;
        db.mark_etiquette_email_sent(ce_tu, None, None, Some("Envoi 1"), None, None, None)
            .unwrap();

        let mut contact_vous = sample_contact("Vouvoi", "Client");
        contact_vous.registre = Some("VOUS".into());
        contact_vous.email = Some("vous@example.com".into());
        let cid_vous = db.create_contact(contact_vous).unwrap().id.unwrap();
        db.attribuer_etiquette(cid_vous, etiqu.id, Some("MANUEL".into()), None)
            .unwrap();
        let row_vous = db
            .get_etiquette_email_queue("ready")
            .unwrap()
            .into_iter()
            .find(|q| q.contact_id == cid_vous)
            .expect("file prête contact VOUS");
        assert_eq!(row_vous.template_sujet, "SUJET_VOUS_MAIN");
        assert_eq!(row_vous.template_corps, "CORPS_VOUS_MAIN");

        db.prepare_email_campaign_relance(ce_tu, None).unwrap();
        let relance_row = db
            .get_etiquette_email_queue("ready")
            .unwrap()
            .into_iter()
            .find(|q| q.contact_etiquette_id == ce_tu)
            .expect("relance prête pour contact TU");
        assert!(relance_row.email_is_relance);
        assert_eq!(relance_row.template_sujet, "SUJET_TU_REL");
        assert_eq!(relance_row.template_corps, "CORPS_TU_REL");
    }

    #[test]
    fn suivi_1an_email_queue_includes_vous_and_tu_after_full_recalc() {
        use crate::database::models::{NewEtiquette, NewTemplateEmail};

        let db = test_db();
        db.ensure_default_segments_and_alerte_links().unwrap();
        db.ensure_default_etiquettes().unwrap();

        let tpl_vous = db
            .create_template_email(NewTemplateEmail {
                nom: "Suivi 1an vous".into(),
                sujet: "Bonjour {{prenom}}, vos investissements".into(),
                corps: "Corps vous".into(),
                categorie: "INFO".into(),
                variables: None,
                agenda_link_id: None,
                relance_template_id: None,
                tutoiement_template_id: None,
            })
            .unwrap();
        let tpl_tu = db
            .create_template_email(NewTemplateEmail {
                nom: "Suivi 1an (tu)".into(),
                sujet: "Bonjour {{prenom}}, tes investissements".into(),
                corps: "Corps tu".into(),
                categorie: "INFO".into(),
                variables: None,
                agenda_link_id: None,
                relance_template_id: None,
                tutoiement_template_id: None,
            })
            .unwrap();
        db.update_template_email(
            tpl_vous.id,
            &NewTemplateEmail {
                nom: tpl_vous.nom.clone(),
                sujet: tpl_vous.sujet.clone(),
                corps: tpl_vous.corps.clone(),
                categorie: tpl_vous.categorie.clone(),
                variables: tpl_vous.variables.clone(),
                agenda_link_id: tpl_vous.agenda_link_id.clone(),
                relance_template_id: None,
                tutoiement_template_id: Some(tpl_tu.id),
            },
        )
        .unwrap();

        let etiqu_before = db
            .get_all_etiquettes()
            .unwrap()
            .into_iter()
            .find(|e| e.nom.trim().eq_ignore_ascii_case("Suivi > 1 an"))
            .expect("étiquette Suivi > 1 an");
        let etiquette_id = etiqu_before.id;
        let now = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_secs() as i64;
        db.update_etiquette(
            etiquette_id,
            &NewEtiquette {
                nom: etiqu_before.nom.clone(),
                couleur: Some(etiqu_before.couleur.clone()),
                icone: etiqu_before.icone.clone(),
                description: etiqu_before.description.clone(),
                priorite: Some(etiqu_before.priorite),
                auto_condition_type: etiqu_before.auto_condition_type.clone(),
                auto_condition_config: etiqu_before.auto_condition_config.clone(),
                auto_categories: etiqu_before.auto_categories.clone(),
                email_template_id: Some(tpl_vous.id),
                email_delai_jours: Some(0),
                email_envoi_prevu: Some(now - 120),
                email_envoi_heure: etiqu_before.email_envoi_heure.clone(),
                email_envoi_jours_semaine: etiqu_before.email_envoi_jours_semaine.clone(),
                email_actif: Some(true),
                is_default: Some(etiqu_before.is_default),
                actif: Some(etiqu_before.actif),
                segment_id: etiqu_before.segment_id,
                rendement_cible: etiqu_before.rendement_cible.clone(),
            },
        )
        .unwrap();

        let old_ts = chrono::Utc::now().timestamp() - 400 * 24 * 3600;
        let old_iso = chrono::DateTime::from_timestamp(old_ts, 0).unwrap().to_rfc3339();

        let cid_vous = db
            .create_contact(NewContact {
                date_dernier_contact: Some(old_iso.clone()),
                registre: Some("VOUS".into()),
                email: Some("vous.client@example.com".into()),
                ..sample_contact("Martin", "Paul")
            })
            .unwrap()
            .id
            .unwrap();
        let cid_tu = db
            .create_contact(NewContact {
                date_dernier_contact: Some(old_iso),
                registre: Some("TU".into()),
                email: Some("tu.client@example.com".into()),
                ..sample_contact("Amari", "Rayane")
            })
            .unwrap()
            .id
            .unwrap();

        db.check_and_apply_auto_etiquettes().unwrap();

        let ready = db.get_etiquette_email_queue("ready").unwrap();
        let row_vous = ready
            .iter()
            .find(|q| q.contact_id == cid_vous)
            .expect("contact VOUS dans la file prête");
        let row_tu = ready
            .iter()
            .find(|q| q.contact_id == cid_tu)
            .expect("contact TU dans la file prête");
        assert_eq!(row_vous.contact_registre.as_deref(), Some("VOUS"));
        assert_eq!(row_tu.contact_registre.as_deref(), Some("TU"));
        assert!(row_vous.template_sujet.contains("vos"));
        assert!(row_tu.template_sujet.contains("tes"));
    }

    #[test]
    fn stale_sent_suivi_campaign_reopens_into_ready_for_vous() {
        use crate::database::models::{NewEtiquette, NewTemplateEmail};

        let db = test_db();
        db.ensure_default_segments_and_alerte_links().unwrap();
        db.ensure_default_etiquettes().unwrap();

        let tpl = db
            .create_template_email(NewTemplateEmail {
                nom: "Suivi vous".into(),
                sujet: "Bonjour {{prenom}}, vos placements".into(),
                corps: "Corps vous".into(),
                categorie: "INFO".into(),
                variables: None,
                agenda_link_id: None,
                relance_template_id: None,
                tutoiement_template_id: None,
            })
            .unwrap();

        let etiqu_before = db
            .get_all_etiquettes()
            .unwrap()
            .into_iter()
            .find(|e| e.nom.trim().eq_ignore_ascii_case("Suivi > 1 an"))
            .expect("étiquette Suivi > 1 an");
        let now = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_secs() as i64;
        db.update_etiquette(
            etiqu_before.id,
            &NewEtiquette {
                nom: etiqu_before.nom.clone(),
                couleur: Some(etiqu_before.couleur.clone()),
                icone: etiqu_before.icone.clone(),
                description: etiqu_before.description.clone(),
                priorite: Some(etiqu_before.priorite),
                auto_condition_type: etiqu_before.auto_condition_type.clone(),
                auto_condition_config: etiqu_before.auto_condition_config.clone(),
                auto_categories: etiqu_before.auto_categories.clone(),
                email_template_id: Some(tpl.id),
                email_delai_jours: Some(0),
                email_envoi_prevu: Some(now - 120),
                email_envoi_heure: etiqu_before.email_envoi_heure.clone(),
                email_envoi_jours_semaine: etiqu_before.email_envoi_jours_semaine.clone(),
                email_actif: Some(true),
                is_default: Some(etiqu_before.is_default),
                actif: Some(etiqu_before.actif),
                segment_id: etiqu_before.segment_id,
                rendement_cible: etiqu_before.rendement_cible.clone(),
            },
        )
        .unwrap();

        let old_ts = chrono::Utc::now().timestamp() - 400 * 24 * 3600;
        let old_iso = chrono::DateTime::from_timestamp(old_ts, 0).unwrap().to_rfc3339();
        let cid = db
            .create_contact(NewContact {
                date_dernier_contact: Some(old_iso),
                registre: Some("VOUS".into()),
                email: Some("vous.stale@example.com".into()),
                ..sample_contact("Durand", "Claire")
            })
            .unwrap()
            .id
            .unwrap();

        db.check_and_apply_auto_etiquettes().unwrap();
        let ce_id = db
            .get_etiquette_email_queue("ready")
            .unwrap()
            .into_iter()
            .find(|q| q.contact_id == cid)
            .expect("première attribution en file prête")
            .contact_etiquette_id;

        let sent_at = now - 10 * 24 * 3600;
        db.get_connection()
            .execute(
                "UPDATE contact_etiquettes SET email_envoye = 1, email_date_envoi = ?1, email_date_prevue = NULL
                 WHERE id = ?2",
                rusqlite::params![sent_at, ce_id],
            )
            .unwrap();

        assert!(
            db.get_etiquette_email_queue("ready")
                .unwrap()
                .iter()
                .all(|q| q.contact_id != cid),
            "contact envoyé absent de la file prête"
        );

        db.check_and_apply_auto_etiquettes().unwrap();
        assert!(
            db.get_etiquette_email_queue("ready")
                .unwrap()
                .iter()
                .all(|q| q.contact_id != cid),
            "sans réponse client : ne pas remettre en file prête au recalcul"
        );
        let followup = db.get_etiquette_email_queue("followup").unwrap();
        assert!(
            followup.iter().any(|q| q.contact_id == cid),
            "délai dépassé sans réponse : bascule en relance, pas en prêt à envoyer"
        );
        let row = followup
            .into_iter()
            .find(|q| q.contact_id == cid)
            .expect("ligne relance");
        assert_eq!(row.contact_registre.as_deref(), Some("VOUS"));
        assert!(row.template_sujet.contains("vos"));
    }

    #[test]
    fn mail_response_keeps_sent_campaign_out_of_ready_after_recalc() {
        use crate::database::models::{NewEtiquette, NewTemplateEmail};

        let db = test_db();
        let now = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_secs() as i64;

        let tpl = db
            .create_template_email(NewTemplateEmail {
                nom: "Suivi mail no reopen".into(),
                sujet: "Bonjour {{prenom}}".into(),
                corps: "Corps".into(),
                categorie: "INFO".into(),
                variables: None,
                agenda_link_id: None,
                relance_template_id: None,
                tutoiement_template_id: None,
            })
            .unwrap();
        let _etiqu = db
            .create_etiquette(NewEtiquette {
                nom: "Campagne mail no reopen".into(),
                couleur: None,
                icone: None,
                description: None,
                priorite: Some(0),
                auto_condition_type: Some("DELAI_SANS_CONTACT".into()),
                auto_condition_config: Some(
                    r#"{"jours": 365, "inclure_sans_date": false}"#.into(),
                ),
                auto_categories: Some(r#"["CLIENT"]"#.into()),
                email_template_id: Some(tpl.id),
                email_delai_jours: Some(0),
                email_envoi_prevu: Some(now - 120),
                email_envoi_heure: None,
                email_envoi_jours_semaine: None,
                email_actif: Some(true),
                is_default: Some(false),
                actif: None,
                segment_id: None,
                rendement_cible: None,
            })
            .unwrap();

        let old_ts = chrono::Utc::now().timestamp() - 400 * 24 * 3600;
        let old_iso = chrono::DateTime::from_timestamp(old_ts, 0).unwrap().to_rfc3339();
        let cid = db
            .create_contact(NewContact {
                date_dernier_contact: Some(old_iso),
                email: Some("mail.no.reopen@example.com".into()),
                ..sample_contact("Test", "MailNoReopen")
            })
            .unwrap()
            .id
            .unwrap();

        db.check_and_apply_auto_etiquettes().unwrap();
        let ce_id = db
            .get_etiquette_email_queue("ready")
            .unwrap()
            .into_iter()
            .find(|q| q.contact_id == cid)
            .expect("file prête")
            .contact_etiquette_id;

        db.mark_etiquette_email_sent(
            ce_id,
            Some("gmail-msg-suivi"),
            Some("gmail-thread-suivi"),
            Some("Objet suivi"),
            None,
            None,
            None,
        )
        .unwrap();

        db.mark_email_campaign_response(ce_id, "mail", Some("Merci, à bientôt"), None, None, None, None)
            .unwrap();

        db.check_and_apply_auto_etiquettes().unwrap();

        assert!(
            db.get_etiquette_email_queue("ready")
                .unwrap()
                .iter()
                .all(|q| q.contact_id != cid),
            "réponse mail : pas de retour en file prête au recalcul"
        );
        assert!(
            db.get_etiquette_email_queue("sent")
                .unwrap()
                .iter()
                .all(|q| q.contact_id != cid),
            "réponse mail : plus en attente envoyés"
        );
        assert!(
            db.get_etiquette_email_queue("followup")
                .unwrap()
                .iter()
                .all(|q| q.contact_id != cid),
            "réponse mail : plus en relance"
        );
        let row: (i64, Option<i64>, Option<String>) = db
            .get_connection()
            .query_row(
                "SELECT email_envoye, email_reponse_at, email_reponse_type FROM contact_etiquettes WHERE id = ?1",
                rusqlite::params![ce_id],
                |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?)),
            )
            .unwrap();
        assert_eq!(row.0, 1, "envoi toujours marqué comme parti");
        assert!(row.1.is_some(), "réponse conservée");
        assert_eq!(row.2.as_deref(), Some("mail"));
    }

    #[test]
    fn repair_misplaced_sent_campaign_restores_from_send_log() {
        use crate::database::models::{NewEtiquette, NewTemplateEmail};

        let db = test_db();
        let now = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_secs() as i64;

        let tpl = db
            .create_template_email(NewTemplateEmail {
                nom: "Tpl repair".into(),
                sujet: "Bonjour".into(),
                corps: "Corps".into(),
                categorie: "INFO".into(),
                variables: None,
                agenda_link_id: None,
                relance_template_id: None,
                tutoiement_template_id: None,
            })
            .unwrap();
        let etiqu = db
            .create_etiquette(NewEtiquette {
                nom: "Campagne repair".into(),
                couleur: None,
                icone: None,
                description: None,
                priorite: Some(0),
                auto_condition_type: None,
                auto_condition_config: None,
                auto_categories: None,
                email_template_id: Some(tpl.id),
                email_delai_jours: Some(0),
                email_envoi_prevu: Some(now - 60),
                email_envoi_heure: None,
                email_envoi_jours_semaine: None,
                email_actif: Some(true),
                is_default: Some(false),
                actif: None,
                segment_id: None,
                rendement_cible: None,
            })
            .unwrap();
        let cid = db
            .create_contact(NewContact {
                email: Some("repair@example.com".into()),
                ..sample_contact("Repair", "Alice")
            })
            .unwrap()
            .id
            .unwrap();
        db.attribuer_etiquette(cid, etiqu.id, Some("MANUEL".into()), None)
            .unwrap();
        let ce_id = db
            .get_etiquette_email_queue("ready")
            .unwrap()
            .into_iter()
            .find(|q| q.contact_id == cid)
            .expect("file prête")
            .contact_etiquette_id;

        db.mark_etiquette_email_sent(
            ce_id,
            Some("gmail-msg-1"),
            Some("gmail-thread-1"),
            Some("Objet initial"),
            Some("Corps initial"),
            None,
            None,
        )
        .unwrap();
        assert_eq!(db.get_etiquette_email_queue("sent").unwrap().len(), 1);

        db.get_connection()
            .execute(
                "UPDATE contact_etiquettes SET email_envoye = 0, email_date_envoi = NULL,
                 email_date_prevue = ?1, email_gmail_message_id = NULL, email_gmail_thread_id = NULL
                 WHERE id = ?2",
                params![now, ce_id],
            )
            .unwrap();
        assert!(
            db.get_etiquette_email_queue("ready")
                .unwrap()
                .iter()
                .any(|q| q.contact_id == cid)
        );
        assert_eq!(db.count_misplaced_sent_campaigns().unwrap(), 1);

        let repaired = db.repair_misplaced_sent_campaigns().unwrap();
        assert_eq!(repaired, 1);
        assert_eq!(db.count_misplaced_sent_campaigns().unwrap(), 0);
        assert!(
            db.get_etiquette_email_queue("ready")
                .unwrap()
                .iter()
                .all(|q| q.contact_id != cid)
        );
        assert!(
            db.get_etiquette_email_queue("sent")
                .unwrap()
                .iter()
                .any(|q| q.contact_id == cid)
        );
    }

    #[test]
    fn misplaced_sent_campaign_skips_reopen_ready_and_no_attendre_reponse() {
        use crate::database::models::{NewEtiquette, NewTemplateEmail};

        let db = test_db();
        let now = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_secs() as i64;

        let tpl_no_wait = db
            .create_template_email(NewTemplateEmail {
                nom: "Tpl sans attente".into(),
                sujet: "Bonjour".into(),
                corps: "Corps".into(),
                categorie: "INFO".into(),
                variables: Some(r#"{"email_suivi_reponse":{"attendre_reponse":false}}"#.into()),
                agenda_link_id: None,
                relance_template_id: None,
                tutoiement_template_id: None,
            })
            .unwrap();
        let tpl_answered = db
            .create_template_email(NewTemplateEmail {
                nom: "Tpl avec trace reponse".into(),
                sujet: "Bonjour".into(),
                corps: "Corps".into(),
                categorie: "INFO".into(),
                variables: None,
                agenda_link_id: None,
                relance_template_id: None,
                tutoiement_template_id: None,
            })
            .unwrap();

        for (tpl_id, contact_email, nom) in [
            (tpl_no_wait.id, "nowait@example.com", "NoWait"),
            (tpl_answered.id, "answered@example.com", "Answered"),
        ] {
            let etiqu = db
                .create_etiquette(NewEtiquette {
                    nom: format!("Campagne {nom}"),
                    couleur: None,
                    icone: None,
                    description: None,
                    priorite: Some(0),
                    auto_condition_type: None,
                    auto_condition_config: None,
                    auto_categories: None,
                    email_template_id: Some(tpl_id),
                    email_delai_jours: Some(0),
                    email_envoi_prevu: Some(now - 60),
                    email_envoi_heure: None,
                    email_envoi_jours_semaine: None,
                    email_actif: Some(true),
                    is_default: Some(false),
                    actif: None,
            segment_id: None,
            rendement_cible: None,
        })
                .unwrap();
            let cid = db
                .create_contact(NewContact {
                    email: Some(contact_email.into()),
                    ..sample_contact(nom, "Test")
                })
                .unwrap()
                .id
                .unwrap();
            db.attribuer_etiquette(cid, etiqu.id, Some("MANUEL".into()), None)
                .unwrap();
            let ce_id = db
                .get_etiquette_email_queue("ready")
                .unwrap()
                .into_iter()
                .find(|q| q.contact_id == cid)
                .expect("file prête")
                .contact_etiquette_id;
            db.mark_etiquette_email_sent(
                ce_id,
                Some("gmail-msg"),
                None,
                Some("Objet"),
                None,
                None,
                None,
            )
            .unwrap();
            db.get_connection()
                .execute(
                    "UPDATE contact_etiquettes SET email_envoye = 0, email_date_envoi = NULL,
                     email_date_prevue = ?1
                     WHERE id = ?2",
                    params![now, ce_id],
                )
                .unwrap();
            if nom == "Answered" {
                db.get_connection()
                    .execute(
                        "UPDATE contact_etiquettes SET email_reponse_body = 'Merci'
                         WHERE id = ?1",
                        params![ce_id],
                    )
                    .unwrap();
            }
        }

        assert_eq!(
            db.count_misplaced_sent_campaigns().unwrap(),
            0,
            "pas de restauration pour réouverture volontaire ou sans attente de réponse"
        );
    }

    #[test]
    fn etiquette_email_queue_sent_excludes_after_response_and_followup_after_delay() {
        use crate::database::models::{NewEtiquette, NewTemplateEmail};

        let db = test_db();
        let now = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_secs() as i64;

        let tpl = db
            .create_template_email(NewTemplateEmail {
                nom: "Tpl attente".into(),
                sujet: "Bonjour".into(),
                corps: "Corps".into(),
                categorie: "INFO".into(),
                variables: None,
                agenda_link_id: None,
                relance_template_id: None,
                tutoiement_template_id: None,
            })
            .unwrap();

        let etiqu = db
            .create_etiquette(NewEtiquette {
                nom: "Campagne attente".into(),
                couleur: None,
                icone: None,
                description: None,
                priorite: Some(0),
                auto_condition_type: None,
                auto_condition_config: None,
                auto_categories: None,
                email_template_id: Some(tpl.id),
                email_delai_jours: Some(0),
                email_envoi_prevu: Some(now - 60),
                email_envoi_heure: None,
                email_envoi_jours_semaine: None,
                email_actif: Some(true),
                is_default: Some(false),
                actif: None,
            segment_id: None,
            rendement_cible: None,
        })
            .unwrap();

        let contact = db
            .create_contact(NewContact {
                email: Some("attente@example.com".into()),
                ..sample_contact("Attente", "Bob")
            })
            .unwrap();
        let cid = contact.id.unwrap();
        db.attribuer_etiquette(cid, etiqu.id, Some("MANUEL".into()), None)
            .unwrap();

        let ce_id = db
            .get_etiquette_email_queue("ready")
            .unwrap()
            .into_iter()
            .find(|q| q.contact_id == cid)
            .expect("file prête")
            .contact_etiquette_id;

        db.mark_etiquette_email_sent(ce_id, None, None, Some("Objet"), None, None, None)
            .unwrap();

        assert_eq!(db.get_etiquette_email_queue("sent").unwrap().len(), 1);
        assert!(db.get_etiquette_email_queue("followup").unwrap().is_empty());

        let old_send = now - 10 * 86_400;
        db.get_connection()
            .execute(
                "UPDATE contact_etiquettes SET email_date_envoi = ?1 WHERE id = ?2",
                params![old_send, ce_id],
            )
            .unwrap();

        assert!(
            db.get_etiquette_email_queue("sent").unwrap().is_empty(),
            "délai dépassé : plus en attente"
        );
        assert_eq!(
            db.get_etiquette_email_queue("followup").unwrap().len(),
            1,
            "délai dépassé : bascule en relance"
        );

        db.mark_email_campaign_response(ce_id, "mail", None, None, None, None, None)
            .unwrap();
        assert!(db.get_etiquette_email_queue("sent").unwrap().is_empty());
        assert!(db.get_etiquette_email_queue("followup").unwrap().is_empty());
    }

    #[test]
    fn auto_etiquette_matches_foyer_investissement() {
        use crate::database::models::{NewEtiquette, NewInvestissement};

        let db = test_db();
        let foyer = db
            .create_foyer(NewFoyer {
                nom: "Foyer TEST".into(),
                type_foyer: "COUPLE".into(),
                nombre_parts_fiscales: None,
                tranche_imposition: None,
                revenu_fiscal_reference: None,
                ir_net_a_payer: None,
                situation_patrimoniale: None,
                objectifs_patrimoniaux: None,
                notes: None,
            })
            .unwrap();

        let contact = db
            .create_contact(NewContact {
                foyer_id: Some(foyer.id),
                categorie: "CLIENT".into(),
                ..sample_contact("Lopez", "Marie")
            })
            .unwrap();
        let cid = contact.id.unwrap();

        db.create_investissement(NewInvestissement {
            contact_id: None,
            foyer_id: Some(foyer.id),
            type_produit: "SCPI".into(),
            partenaire_id: None,
            nom_produit: "Foyer only".into(),
            numero_contrat: None,
            montant_initial: Some(50_000),
            date_souscription: None,
            date_fin_demembrement: None,
            date_fin_pret: None,
            mensualite_credit: None,
            credit_crd: None,
            loyer_mensuel: None,
            versement_programme: None,
            montant_versement_programme: None,
            frequence_versement: None,
            reinvestissement_dividendes: None,
            notes: None,
            origine: Some("MON_CONSEIL".into()),
        })
        .unwrap();

        let etiqu = db
            .create_etiquette(NewEtiquette {
                nom: "A une SCPI".into(),
                couleur: None,
                icone: None,
                description: None,
                priorite: Some(10),
                auto_condition_type: Some("TYPE_PRODUIT".into()),
                auto_condition_config: Some(r#"{"types":["SCPI"]}"#.into()),
                auto_categories: Some(r#"["CLIENT"]"#.into()),
                email_template_id: None,
                email_delai_jours: Some(0),
                email_envoi_prevu: None,
                email_envoi_heure: None,
                email_envoi_jours_semaine: None,
                email_actif: Some(false),
                is_default: Some(false),
            actif: None,
            segment_id: None,
            rendement_cible: None,
        })
            .unwrap();

        let assigned = db.check_and_apply_auto_etiquettes().unwrap();
        assert!(assigned >= 1);

        let count: i64 = db
            .conn
            .query_row(
                "SELECT COUNT(*) FROM contact_etiquettes WHERE contact_id = ?1 AND etiquette_id = ?2",
                params![cid, etiqu.id],
                |r| r.get(0),
            )
            .unwrap();
        assert_eq!(count, 1);
    }

    #[test]
    fn auto_etiquette_type_produit_types_only_matches_empty_nom() {
        use crate::database::models::{NewContact, NewEtiquette, NewInvestissement};

        let db = test_db();
        let cid = db
            .create_contact(NewContact {
                email: Some("scpi-sans-nom@example.com".into()),
                ..sample_contact("LEFEVRE", "Claire")
            })
            .unwrap()
            .id
            .unwrap();

        db.create_investissement(NewInvestissement {
            contact_id: Some(cid),
            foyer_id: None,
            type_produit: "SCPI".into(),
            partenaire_id: None,
            nom_produit: "   ".into(),
            numero_contrat: None,
            montant_initial: Some(10_000),
            date_souscription: None,
            date_fin_demembrement: None,
            date_fin_pret: None,
            mensualite_credit: None,
            credit_crd: None,
            loyer_mensuel: None,
            versement_programme: None,
            montant_versement_programme: None,
            frequence_versement: None,
            reinvestissement_dividendes: None,
            notes: None,
            origine: Some("MON_CONSEIL".into()),
        })
        .unwrap();

        let etiqu = db
            .create_etiquette(NewEtiquette {
                nom: "Toute SCPI".into(),
                couleur: None,
                icone: None,
                description: None,
                priorite: Some(10),
                auto_condition_type: Some("TYPE_PRODUIT".into()),
                auto_condition_config: Some(r#"{"types":["SCPI"]}"#.into()),
                auto_categories: Some(r#"["CLIENT"]"#.into()),
                email_template_id: None,
                email_delai_jours: Some(0),
                email_envoi_prevu: None,
                email_envoi_heure: None,
                email_envoi_jours_semaine: None,
                email_actif: Some(false),
                is_default: Some(false),
                actif: None,
                segment_id: None,
                rendement_cible: None,
            })
            .unwrap();

        db.check_and_apply_auto_etiquettes().unwrap();

        let count: i64 = db
            .conn
            .query_row(
                "SELECT COUNT(*) FROM contact_etiquettes WHERE contact_id = ?1 AND etiquette_id = ?2",
                params![cid, etiqu.id],
                |r| r.get(0),
            )
            .unwrap();
        assert_eq!(count, 1);
    }

    #[test]
    fn auto_etiquette_type_produit_matches_nom_produit_only() {
        use crate::database::models::{NewContact, NewEtiquette, NewInvestissement};

        let db = test_db();
        let cid = db
            .create_contact(NewContact {
                email: Some("epargne@example.com".into()),
                ..sample_contact("MARTIN", "Paul")
            })
            .unwrap()
            .id
            .unwrap();

        db.create_investissement(NewInvestissement {
            contact_id: Some(cid),
            foyer_id: None,
            type_produit: "SCPI".into(),
            partenaire_id: None,
            nom_produit: "Epargne Pierre".into(),
            numero_contrat: None,
            montant_initial: Some(10_000),
            date_souscription: None,
            date_fin_demembrement: None,
            date_fin_pret: None,
            mensualite_credit: None,
            credit_crd: None,
            loyer_mensuel: None,
            versement_programme: None,
            montant_versement_programme: None,
            frequence_versement: None,
            reinvestissement_dividendes: None,
            notes: None,
            origine: Some("MON_CONSEIL".into()),
        })
        .unwrap();

        db.create_investissement(NewInvestissement {
            contact_id: Some(cid),
            foyer_id: None,
            type_produit: "SCPI".into(),
            partenaire_id: None,
            nom_produit: "Comète".into(),
            numero_contrat: None,
            montant_initial: Some(5_000),
            date_souscription: None,
            date_fin_demembrement: None,
            date_fin_pret: None,
            mensualite_credit: None,
            credit_crd: None,
            loyer_mensuel: None,
            versement_programme: None,
            montant_versement_programme: None,
            frequence_versement: None,
            reinvestissement_dividendes: None,
            notes: None,
            origine: Some("MON_CONSEIL".into()),
        })
        .unwrap();

        let etiqu = db
            .create_etiquette(NewEtiquette {
                nom: "Epargne Pierre".into(),
                couleur: None,
                icone: None,
                description: None,
                priorite: Some(10),
                auto_condition_type: Some("TYPE_PRODUIT".into()),
                auto_condition_config: Some(r#"{"noms_produit":["Epargne Pierre"]}"#.into()),
                auto_categories: Some(r#"["CLIENT"]"#.into()),
                email_template_id: None,
                email_delai_jours: Some(0),
                email_envoi_prevu: None,
                email_envoi_heure: None,
                email_envoi_jours_semaine: None,
                email_actif: Some(false),
                is_default: Some(false),
                actif: None,
                segment_id: None,
                rendement_cible: None,
            })
            .unwrap();

        let assigned = db.check_and_apply_auto_etiquettes().unwrap();
        assert!(assigned >= 1);

        let count: i64 = db
            .conn
            .query_row(
                "SELECT COUNT(*) FROM contact_etiquettes WHERE contact_id = ?1 AND etiquette_id = ?2",
                params![cid, etiqu.id],
                |r| r.get(0),
            )
            .unwrap();
        assert_eq!(count, 1);
    }

    #[test]
    fn auto_etiquette_type_produit_matches_type_and_nom_together() {
        use crate::database::models::{NewContact, NewEtiquette, NewInvestissement};

        let db = test_db();
        let cid = db
            .create_contact(NewContact {
                email: Some("mix@example.com".into()),
                ..sample_contact("DURAND", "Anne")
            })
            .unwrap()
            .id
            .unwrap();

        db.create_investissement(NewInvestissement {
            contact_id: Some(cid),
            foyer_id: None,
            type_produit: "SCPI".into(),
            partenaire_id: None,
            nom_produit: "Epargne Pierre".into(),
            numero_contrat: None,
            montant_initial: Some(10_000),
            date_souscription: None,
            date_fin_demembrement: None,
            date_fin_pret: None,
            mensualite_credit: None,
            credit_crd: None,
            loyer_mensuel: None,
            versement_programme: None,
            montant_versement_programme: None,
            frequence_versement: None,
            reinvestissement_dividendes: None,
            notes: None,
            origine: Some("MON_CONSEIL".into()),
        })
        .unwrap();

        db.create_investissement(NewInvestissement {
            contact_id: Some(cid),
            foyer_id: None,
            type_produit: "ASSURANCE_VIE".into(),
            partenaire_id: None,
            nom_produit: "Epargne Pierre".into(),
            numero_contrat: None,
            montant_initial: Some(5_000),
            date_souscription: None,
            date_fin_demembrement: None,
            date_fin_pret: None,
            mensualite_credit: None,
            credit_crd: None,
            loyer_mensuel: None,
            versement_programme: None,
            montant_versement_programme: None,
            frequence_versement: None,
            reinvestissement_dividendes: None,
            notes: None,
            origine: Some("MON_CONSEIL".into()),
        })
        .unwrap();

        let etiqu = db
            .create_etiquette(NewEtiquette {
                nom: "SCPI Epargne Pierre".into(),
                couleur: None,
                icone: None,
                description: None,
                priorite: Some(10),
                auto_condition_type: Some("TYPE_PRODUIT".into()),
                auto_condition_config: Some(
                    r#"{"types":["SCPI"],"noms_produit":["Epargne Pierre"]}"#.into(),
                ),
                auto_categories: Some(r#"["CLIENT"]"#.into()),
                email_template_id: None,
                email_delai_jours: Some(0),
                email_envoi_prevu: None,
                email_envoi_heure: None,
                email_envoi_jours_semaine: None,
                email_actif: Some(false),
                is_default: Some(false),
                actif: None,
                segment_id: None,
                rendement_cible: None,
            })
            .unwrap();

        db.check_and_apply_auto_etiquettes().unwrap();

        let count: i64 = db
            .conn
            .query_row(
                "SELECT COUNT(*) FROM contact_etiquettes WHERE contact_id = ?1 AND etiquette_id = ?2",
                params![cid, etiqu.id],
                |r| r.get(0),
            )
            .unwrap();
        assert_eq!(count, 1);
    }

    #[test]
    fn merge_duplicate_reduction_impot_etiquettes_collapses_aliases() {
        use crate::database::models::NewEtiquette;

        let db = test_db();
        let a = db
            .create_etiquette(NewEtiquette {
                nom: REDUCTION_IMPOT_ETIQUETTE_CANONICAL.into(),
                couleur: Some("#10B981".into()),
                icone: None,
                description: None,
                priorite: Some(60),
                auto_condition_type: Some("PERIODE_ANNEE".into()),
                auto_condition_config: Some(r#"{"mois_debut": 10, "mois_fin": 11}"#.into()),
                auto_categories: Some(r#"["CLIENT"]"#.into()),
                email_template_id: None,
                email_delai_jours: Some(0),
                email_envoi_prevu: None,
                email_envoi_heure: None,
                email_envoi_jours_semaine: None,
                email_actif: Some(false),
                is_default: Some(true),
                actif: None,
            segment_id: None,
            rendement_cible: None,
        })
            .unwrap();
        db.create_etiquette(NewEtiquette {
            nom: "RDV fin d'année".into(),
            couleur: Some("#10B981".into()),
            icone: None,
            description: None,
            priorite: Some(50),
            auto_condition_type: Some("PERIODE_ANNEE".into()),
            auto_condition_config: Some(r#"{"mois_debut": 10, "mois_fin": 11}"#.into()),
            auto_categories: Some(r#"["CLIENT"]"#.into()),
            email_template_id: None,
            email_delai_jours: Some(0),
            email_envoi_prevu: None,
            email_envoi_heure: None,
            email_envoi_jours_semaine: None,
            email_actif: Some(false),
            is_default: Some(true),
                actif: None,
                segment_id: None,
                rendement_cible: None,
            })
        .unwrap();

        let merged = db.merge_duplicate_reduction_impot_etiquettes().unwrap();
        assert_eq!(merged, 1);
        assert_eq!(db.count_etiquettes().unwrap(), 1);

        let nom: String = db
            .conn
            .query_row(
                "SELECT nom FROM etiquettes WHERE id = ?1",
                params![a.id],
                |r| r.get(0),
            )
            .unwrap();
        assert_eq!(nom, REDUCTION_IMPOT_ETIQUETTE_CANONICAL);
    }

    #[test]
    fn ensure_default_etiquettes_preserves_custom_config() {
        let db = test_db();
        db.ensure_default_etiquettes().unwrap();

        let custom_config = r#"{"jours": 400}"#;
        db.conn
            .execute(
                "UPDATE etiquettes SET auto_condition_config = ?1 WHERE nom = ?2",
                params![custom_config, "Suivi > 1 an"],
            )
            .unwrap();

        db.ensure_default_etiquettes().unwrap();

        let config: String = db
            .conn
            .query_row(
                "SELECT auto_condition_config FROM etiquettes WHERE nom = ?1",
                params!["Suivi > 1 an"],
                |r| r.get(0),
            )
            .unwrap();
        assert_eq!(config, custom_config);
    }

    #[test]
    fn delai_sans_contact_inclure_sans_date_false_skips_contact_without_date() {
        use crate::database::models::NewEtiquette;

        let db = test_db();
        let contact = db
            .create_contact(NewContact {
                date_dernier_contact: None,
                ..sample_contact("SansDate", "Paul")
            })
            .unwrap();
        let cid = contact.id.unwrap();

        let etiqu = db
            .create_etiquette(NewEtiquette {
                nom: "Delai strict".into(),
                couleur: None,
                icone: None,
                description: None,
                priorite: Some(0),
                auto_condition_type: Some("DELAI_SANS_CONTACT".into()),
                auto_condition_config: Some(
                    r#"{"jours": 30, "inclure_sans_date": false}"#.into(),
                ),
                auto_categories: Some(r#"["CLIENT"]"#.into()),
                email_template_id: None,
                email_delai_jours: Some(0),
                email_envoi_prevu: None,
                email_envoi_heure: None,
                email_envoi_jours_semaine: None,
                email_actif: Some(false),
                is_default: Some(false),
            actif: None,
            segment_id: None,
            rendement_cible: None,
        })
            .unwrap();

        db.check_auto_etiquettes_for_contact(cid).unwrap();

        let count: i64 = db
            .conn
            .query_row(
                "SELECT COUNT(*) FROM contact_etiquettes WHERE contact_id = ?1 AND etiquette_id = ?2",
                params![cid, etiqu.id],
                |r| r.get(0),
            )
            .unwrap();
        assert_eq!(count, 0);

        db.conn
            .execute(
                "UPDATE etiquettes SET auto_condition_config = ?1 WHERE id = ?2",
                params![r#"{"jours": 30, "inclure_sans_date": true}"#, etiqu.id],
            )
            .unwrap();

        db.check_auto_etiquettes_for_contact(cid).unwrap();
        let count_after: i64 = db
            .conn
            .query_row(
                "SELECT COUNT(*) FROM contact_etiquettes WHERE contact_id = ?1 AND etiquette_id = ?2",
                params![cid, etiqu.id],
                |r| r.get(0),
            )
            .unwrap();
        assert_eq!(count_after, 1);
    }

    #[test]
    fn create_etiquette_rejects_duplicate_nom() {
        use crate::database::models::NewEtiquette;

        let db = test_db();
        let mk = || NewEtiquette {
            nom: "Doublon test".into(),
            couleur: None,
            icone: None,
            description: None,
            priorite: Some(0),
            auto_condition_type: None,
            auto_condition_config: None,
            auto_categories: None,
            email_template_id: None,
            email_delai_jours: Some(0),
            email_envoi_prevu: None,
            email_envoi_heure: None,
            email_envoi_jours_semaine: None,
            email_actif: Some(false),
            is_default: Some(false),
            actif: None,
            segment_id: None,
            rendement_cible: None,
        };
        db.create_etiquette(mk()).unwrap();
        let err = db.create_etiquette(mk()).unwrap_err();
        assert!(
            err.to_string().contains("existe déjà"),
            "unexpected: {}",
            err
        );
    }

    #[test]
    fn deactivate_etiquette_removes_auto_assignments() {
        use crate::database::models::NewEtiquette;

        let db = test_db();
        let contact = db.create_contact(sample_contact("Actif", "Test")).unwrap();
        let cid = contact.id.unwrap();

        let etiqu = db
            .create_etiquette(NewEtiquette {
                nom: "Temp auto".into(),
                couleur: None,
                icone: None,
                description: None,
                priorite: Some(0),
                auto_condition_type: Some("DELAI_SANS_CONTACT".into()),
                auto_condition_config: Some(r#"{"jours": 0, "inclure_sans_date": true}"#.into()),
                auto_categories: Some(r#"["CLIENT"]"#.into()),
                email_template_id: None,
                email_delai_jours: Some(0),
                email_envoi_prevu: None,
                email_envoi_heure: None,
                email_envoi_jours_semaine: None,
                email_actif: Some(false),
                is_default: Some(false),
                actif: Some(true),
                segment_id: None,
                rendement_cible: None,
            })
            .unwrap();

        db.attribuer_etiquette(cid, etiqu.id, Some("AUTO".into()), None)
            .unwrap();

        db.update_etiquette(
            etiqu.id,
            &NewEtiquette {
                nom: etiqu.nom.clone(),
                couleur: Some(etiqu.couleur.clone()),
                icone: etiqu.icone.clone(),
                description: etiqu.description.clone(),
                priorite: Some(etiqu.priorite),
                auto_condition_type: etiqu.auto_condition_type.clone(),
                auto_condition_config: etiqu.auto_condition_config.clone(),
                auto_categories: etiqu.auto_categories.clone(),
                email_template_id: etiqu.email_template_id,
                email_delai_jours: Some(etiqu.email_delai_jours),
                email_envoi_prevu: etiqu.email_envoi_prevu,
                email_envoi_heure: etiqu.email_envoi_heure.clone(),
                email_envoi_jours_semaine: etiqu.email_envoi_jours_semaine.clone(),
                email_actif: Some(etiqu.email_actif),
                is_default: Some(etiqu.is_default),
                actif: Some(false),
                segment_id: None,
                rendement_cible: None,
            },
        )
        .unwrap();

        let count: i64 = db
            .conn
            .query_row(
                "SELECT COUNT(*) FROM contact_etiquettes WHERE contact_id = ?1 AND etiquette_id = ?2",
                params![cid, etiqu.id],
                |r| r.get(0),
            )
            .unwrap();
        assert_eq!(count, 0);

        let actif_db: i64 = db
            .conn
            .query_row(
                "SELECT actif FROM etiquettes WHERE id = ?1",
                params![etiqu.id],
                |r| r.get(0),
            )
            .unwrap();
        assert_eq!(actif_db, 0);
    }

    #[test]
    fn delete_default_etiquette_is_blocked() {
        let db = test_db();
        db.ensure_default_etiquettes().unwrap();
        let id: i64 = db
            .conn
            .query_row(
                "SELECT id FROM etiquettes WHERE nom = ?1",
                params!["Suivi > 1 an"],
                |r| r.get(0),
            )
            .unwrap();
        let err = db.delete_etiquette(id).unwrap_err();
        assert!(err.to_string().contains("défaut"));
    }

    #[test]
    fn create_etiquette_rejects_auto_rule_without_categories() {
        use crate::database::models::NewEtiquette;

        let db = test_db();
        let err = db
            .create_etiquette(NewEtiquette {
                nom: "Auto sans cat".into(),
                couleur: None,
                icone: None,
                description: None,
                priorite: Some(0),
                auto_condition_type: Some("DELAI_SANS_CONTACT".into()),
                auto_condition_config: Some(r#"{"jours": 90}"#.into()),
                auto_categories: Some("[]".into()),
                email_template_id: None,
                email_delai_jours: Some(0),
                email_envoi_prevu: None,
                email_envoi_heure: None,
                email_envoi_jours_semaine: None,
                email_actif: Some(false),
                is_default: Some(false),
            actif: None,
            segment_id: None,
            rendement_cible: None,
        })
            .unwrap_err();
        assert!(
            err.to_string().contains("catégorie"),
            "unexpected: {}",
            err
        );
    }

    #[test]
    fn auto_etiquette_exclusion_blocks_reassignment_after_retirer() {
        use crate::database::models::NewEtiquette;

        let db = test_db();
        let contact = db.create_contact(sample_contact("Exclu", "Alice")).unwrap();
        let cid = contact.id.unwrap();

        let etiqu = db
            .create_etiquette(NewEtiquette {
                nom: "Auto exclu test".into(),
                couleur: None,
                icone: None,
                description: None,
                priorite: Some(0),
                auto_condition_type: Some("DELAI_SANS_CONTACT".into()),
                auto_condition_config: Some(r#"{"jours": 0, "inclure_sans_date": true}"#.into()),
                auto_categories: Some(r#"["CLIENT"]"#.into()),
                email_template_id: None,
                email_delai_jours: Some(0),
                email_envoi_prevu: None,
                email_envoi_heure: None,
                email_envoi_jours_semaine: None,
                email_actif: Some(false),
                is_default: Some(false),
                actif: Some(true),
                segment_id: None,
                rendement_cible: None,
            })
            .unwrap();

        db.check_auto_etiquettes_for_contact(cid).unwrap();
        let count_before: i64 = db
            .conn
            .query_row(
                "SELECT COUNT(*) FROM contact_etiquettes WHERE contact_id = ?1 AND etiquette_id = ?2",
                params![cid, etiqu.id],
                |r| r.get(0),
            )
            .unwrap();
        assert_eq!(count_before, 1);

        db.retirer_etiquette(cid, etiqu.id, true).unwrap();

        let excluded: i64 = db
            .conn
            .query_row(
                "SELECT COUNT(*) FROM contact_etiquette_auto_exclusions WHERE contact_id = ?1 AND etiquette_id = ?2",
                params![cid, etiqu.id],
                |r| r.get(0),
            )
            .unwrap();
        assert_eq!(excluded, 1);

        db.check_auto_etiquettes_for_contact(cid).unwrap();
        let count_after: i64 = db
            .conn
            .query_row(
                "SELECT COUNT(*) FROM contact_etiquettes WHERE contact_id = ?1 AND etiquette_id = ?2",
                params![cid, etiqu.id],
                |r| r.get(0),
            )
            .unwrap();
        assert_eq!(count_after, 0);
    }

    #[test]
    fn auto_etiquette_removed_when_contact_category_no_longer_matches() {
        use crate::database::models::NewEtiquette;

        let db = test_db();
        let contact = db.create_contact(sample_contact("CatChange", "Bob")).unwrap();
        let cid = contact.id.unwrap();

        let etiqu = db
            .create_etiquette(NewEtiquette {
                nom: "Clients seulement".into(),
                couleur: None,
                icone: None,
                description: None,
                priorite: Some(0),
                auto_condition_type: Some("DELAI_SANS_CONTACT".into()),
                auto_condition_config: Some(r#"{"jours": 0, "inclure_sans_date": true}"#.into()),
                auto_categories: Some(r#"["CLIENT"]"#.into()),
                email_template_id: None,
                email_delai_jours: Some(0),
                email_envoi_prevu: None,
                email_envoi_heure: None,
                email_envoi_jours_semaine: None,
                email_actif: Some(false),
                is_default: Some(false),
                actif: Some(true),
                segment_id: None,
                rendement_cible: None,
            })
            .unwrap();

        db.attribuer_etiquette(cid, etiqu.id, Some("AUTO".into()), None)
            .unwrap();

        db.update_contact(
            cid,
            &NewContact {
                categorie: "PROSPECT".into(),
                ..sample_contact("CatChange", "Bob")
            },
            false,
        )
        .unwrap();

        db.check_auto_etiquettes_for_contact(cid).unwrap();

        let count: i64 = db
            .conn
            .query_row(
                "SELECT COUNT(*) FROM contact_etiquettes WHERE contact_id = ?1 AND etiquette_id = ?2",
                params![cid, etiqu.id],
                |r| r.get(0),
            )
            .unwrap();
        assert_eq!(count, 0);
    }

    #[test]
    fn auto_etiquette_removed_on_full_recalc_when_category_no_longer_matches() {
        use crate::database::models::NewEtiquette;

        let db = test_db();
        let contact = db.create_contact(sample_contact("FullRecalc", "Ann")).unwrap();
        let cid = contact.id.unwrap();

        let etiqu = db
            .create_etiquette(NewEtiquette {
                nom: "Clients full recalc".into(),
                couleur: None,
                icone: None,
                description: None,
                priorite: Some(0),
                auto_condition_type: Some("DELAI_SANS_CONTACT".into()),
                auto_condition_config: Some(r#"{"jours": 0, "inclure_sans_date": true}"#.into()),
                auto_categories: Some(r#"["CLIENT"]"#.into()),
                email_template_id: None,
                email_delai_jours: Some(0),
                email_envoi_prevu: None,
                email_envoi_heure: None,
                email_envoi_jours_semaine: None,
                email_actif: Some(false),
                is_default: Some(false),
                actif: Some(true),
                segment_id: None,
                rendement_cible: None,
            })
            .unwrap();

        db.attribuer_etiquette(cid, etiqu.id, Some("AUTO".into()), None)
            .unwrap();

        db.update_contact(
            cid,
            &NewContact {
                categorie: "PROSPECT".into(),
                ..sample_contact("FullRecalc", "Ann")
            },
            false,
        )
        .unwrap();

        db.check_and_apply_auto_etiquettes().unwrap();

        let count: i64 = db
            .conn
            .query_row(
                "SELECT COUNT(*) FROM contact_etiquettes WHERE contact_id = ?1 AND etiquette_id = ?2",
                params![cid, etiqu.id],
                |r| r.get(0),
            )
            .unwrap();
        assert_eq!(count, 0);
    }
}
