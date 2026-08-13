use chrono::{TimeZone, Utc};

use crate::database::models::{Investissement, NewInvestissement, NewInvestissementValorisation};
use crate::database::Database;
use crate::espace_client::avoir_catalogue::{
    normaliser_nom_produit, type_autorise_pour_panier,
};
use crate::espace_client::portal_api::{
    ack_espace_avoir_declaration, pull_espace_avoir_declarations, PortalAvoirDeclarationLine,
};

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ImportEspaceAvoirDeclarationsResult {
    pub imported: usize,
    pub errors: Vec<String>,
    #[serde(skip)]
    pub a_accuser: Vec<i64>,
}

pub fn import_espace_avoir_declarations(
    app: &tauri::AppHandle,
    db: &Database,
    contact_id: i64,
) -> Result<ImportEspaceAvoirDeclarationsResult, String> {
    let declarations = pull_espace_avoir_declarations(app, db, contact_id)?;
    if declarations.is_empty() {
        return Ok(ImportEspaceAvoirDeclarationsResult {
            imported: 0,
            errors: vec![],
            a_accuser: vec![],
        });
    }

    let mut imported = 0usize;
    let mut errors = Vec::new();
    let mut a_accuser = Vec::new();

    for decl in declarations {
        match import_one_avoir(db, contact_id, &decl) {
            Ok(true) => {
                imported += 1;
                a_accuser.push(decl.id);
            }
            Ok(false) => {}
            Err(message) => errors.push(format!("Avoir {} : {message}", decl.id)),
        }
    }

    Ok(ImportEspaceAvoirDeclarationsResult {
        imported,
        errors,
        a_accuser,
    })
}

/// Accuse réception une fois la nouvelle photo en ligne.
///
/// Une déclaration non accusée sera réimportée : si une ligne
/// `DECLARE_CLIENT` existe déjà (même type + nom normalisé), on la met à
/// jour au lieu d'en créer une seconde. La valorisation du jour est
/// upsertée, pas dupliquée.
pub fn ack_espace_avoir_declarations(
    app: &tauri::AppHandle,
    db: &Database,
    contact_id: i64,
    declaration_ids: &[i64],
) -> Vec<String> {
    let mut errors = Vec::new();
    for id in declaration_ids {
        if let Err(message) = ack_espace_avoir_declaration(app, db, contact_id, *id) {
            errors.push(format!("Avoir {id} : accusé de réception refusé ({message})"));
        }
    }
    errors
}

fn find_existing_declare_client(
    existing: &[Investissement],
    type_produit: &str,
    nom_produit: &str,
) -> Option<i64> {
    let nom_norm = normaliser_nom_produit(nom_produit);
    existing.iter().find_map(|inv| {
        if inv.origine != "DECLARE_CLIENT" {
            return None;
        }
        if inv.type_produit != type_produit {
            return None;
        }
        if normaliser_nom_produit(&inv.nom_produit) != nom_norm {
            return None;
        }
        Some(inv.id)
    })
}

fn import_one_avoir(
    db: &Database,
    contact_id: i64,
    decl: &PortalAvoirDeclarationLine,
) -> Result<bool, String> {
    if !type_autorise_pour_panier(&decl.panier, &decl.type_produit) {
        return Err("Type de produit non autorisé".into());
    }
    if decl.valorisation_centimes <= 0 {
        return Err("Valorisation invalide".into());
    }

    let date_souscription = decl.date_souscription.and_then(|ts| {
        Utc.timestamp_opt(ts, 0)
            .single()
            .map(|dt| dt.to_rfc3339())
    });
    let date_fin_pret = decl.date_fin_pret.and_then(|ts| {
        Utc.timestamp_opt(ts, 0)
            .single()
            .map(|dt| dt.to_rfc3339())
    });
    let date_valo = Utc
        .timestamp_opt(decl.created_at, 0)
        .single()
        .ok_or_else(|| "Date invalide".to_string())?
        .to_rfc3339();

    // Rejeu si l'accusé n'a pas abouti : même contact, DECLARE_CLIENT,
    // type + nom normalisé. Jamais de fusion avec une ligne cabinet (R9).
    let existing = db
        .get_investissements_by_contact(contact_id)
        .map_err(|e| e.to_string())?;
    let existing_id =
        find_existing_declare_client(&existing, &decl.type_produit, &decl.nom_produit);

    let inv_id = if let Some(id) = existing_id {
        db.apply_espace_client_avoir_replay(
            id,
            decl.date_souscription,
            decl.loyer_mensuel_centimes,
            decl.mensualite_credit_centimes,
            decl.date_fin_pret,
        )
        .map_err(|e| e.to_string())?;
        id
    } else {
        let inv = db
            .create_investissement(NewInvestissement {
                contact_id: Some(contact_id),
                foyer_id: None,
                type_produit: decl.type_produit.clone(),
                partenaire_id: None,
                nom_produit: decl.nom_produit.clone(),
                numero_contrat: None,
                montant_initial: Some(decl.valorisation_centimes),
                date_souscription,
                date_fin_demembrement: None,
                date_fin_pret,
                date_dernier_arbitrage: None,
                date_prochain_arbitrage: None,
                mensualite_credit: decl.mensualite_credit_centimes,
                credit_crd: None,
                loyer_mensuel: decl.loyer_mensuel_centimes,
                prevoyance_perso: None,
                prevoyance_pro: None,
                prevoyance_versement_mensuel: None,
                versement_programme: None,
                montant_versement_programme: None,
                frequence_versement: None,
                reinvestissement_dividendes: None,
                notes: Some("Espace client".into()),
                origine: Some("DECLARE_CLIENT".into()),
            })
            .map_err(|e| e.to_string())?;
        inv.id
    };

    db.create_investissement_valorisation(NewInvestissementValorisation {
        investissement_id: inv_id,
        montant: decl.valorisation_centimes,
        date_valorisation: Some(date_valo),
        notes: Some("Espace client".into()),
        stellium_versements_nets_centimes: None,
        stellium_perf_euro_centimes: None,
    })
    .map_err(|e| e.to_string())?;

    db.touch_investissement_derniere_maj_client(inv_id, decl.created_at)
        .map_err(|e| e.to_string())?;

    Ok(true)
}

#[cfg(test)]
mod tests {
    use super::find_existing_declare_client;
    use crate::database::models::Investissement;
    use crate::espace_client::avoir_catalogue::type_autorise_pour_panier;

    fn sample(id: i64, origine: &str, type_produit: &str, nom: &str) -> Investissement {
        Investissement {
            id,
            contact_id: Some(1),
            foyer_id: None,
            type_produit: type_produit.into(),
            partenaire_id: None,
            nom_produit: nom.into(),
            numero_contrat: None,
            url_contrat: None,
            montant_initial: Some(1),
            date_souscription: None,
            date_fin_demembrement: None,
            date_fin_pret: None,
            mensualite_credit: None,
            credit_crd: None,
            loyer_mensuel: None,
            prevoyance_perso: false,
            prevoyance_pro: false,
            prevoyance_versement_mensuel: None,
            versement_programme: false,
            montant_versement_programme: None,
            frequence_versement: None,
            reinvestissement_dividendes: false,
            notes: None,
            origine: origine.into(),
            statut: "ACTIF".into(),
            date_cloture: None,
            date_dernier_arbitrage: None,
            date_prochain_arbitrage: None,
            encours_actuel: None,
            encours_date: None,
            derniere_maj_client: None,
            montant_investi_total: None,
            stellium_versements_nets_centimes: None,
            stellium_perf_euro_centimes: None,
            created_at: 0,
            updated_at: 0,
        }
    }

    #[test]
    fn import_rejects_a_type_outside_the_catalogue() {
        assert!(!type_autorise_pour_panier("immobilier", "JEANBRUN"));
        assert!(type_autorise_pour_panier("immobilier", "LMNP"));
    }

    #[test]
    fn replay_reuses_the_declared_line_not_a_cabinet_line() {
        let lines = vec![
            sample(10, "MON_CONSEIL", "PER", "  Swiss  Life "),
            sample(11, "DECLARE_CLIENT", "PER", "Swiss Life"),
        ];
        assert_eq!(
            find_existing_declare_client(&lines, "PER", "swiss  life"),
            Some(11)
        );
        assert_eq!(
            find_existing_declare_client(&lines, "PER", "Corum"),
            None
        );
        assert_eq!(
            find_existing_declare_client(&lines, "ASSURANCE_VIE", "Swiss Life"),
            None
        );
    }
}
