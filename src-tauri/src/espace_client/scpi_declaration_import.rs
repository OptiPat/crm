use chrono::{TimeZone, Utc};

use crate::database::models::{Investissement, NewInvestissementRevenuPercu, NewInvestissementValorisation};
use crate::database::Database;
use crate::espace_client::portal_api::{
    ack_espace_scpi_declaration, pull_espace_scpi_declarations, PortalScpiDeclarationLine,
};
use crate::espace_client::snapshot::load_foyer_members;
use crate::espace_client::visibilite::{
    is_investissement_visible_to_viewer, PatrimoineInvestissement, PatrimoineViewer,
};

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ImportEspaceScpiDeclarationsResult {
    pub imported: usize,
    pub errors: Vec<String>,
    /// Déclarations écrites en base, dont le portail n'a pas encore reçu
    /// l'accusé de réception. Voir `ack_espace_scpi_declarations`.
    #[serde(skip)]
    pub a_accuser: Vec<i64>,
}

pub fn import_espace_scpi_declarations(
    app: &tauri::AppHandle,
    db: &Database,
    contact_id: i64,
) -> Result<ImportEspaceScpiDeclarationsResult, String> {
    let declarations = pull_espace_scpi_declarations(app, db, contact_id)?;
    if declarations.is_empty() {
        return Ok(ImportEspaceScpiDeclarationsResult {
            imported: 0,
            errors: vec![],
            a_accuser: vec![],
        });
    }

    let mut imported = 0usize;
    let mut errors = Vec::new();
    let mut a_accuser = Vec::new();

    for decl in declarations {
        match import_one_declaration(db, contact_id, &decl) {
            Ok(true) => {
                imported += 1;
                a_accuser.push(decl.id);
            }
            Ok(false) => {}
            Err(message) => errors.push(format!("Déclaration {} : {message}", decl.id)),
        }
    }

    Ok(ImportEspaceScpiDeclarationsResult {
        imported,
        errors,
        a_accuser,
    })
}

/// Accuse réception une fois la nouvelle photo en ligne.
///
/// Le portail cesse d'afficher une déclaration dès qu'elle est accusée : le
/// faire avant la synchronisation ferait disparaître de l'écran du client le
/// montant qu'il vient de saisir, jusqu'à la prochaine photo réussie. Une
/// déclaration non accusée sera simplement réimportée, sans doublon —
/// valorisations et revenus sont mis à jour par jour, pas ajoutés.
pub fn ack_espace_scpi_declarations(
    app: &tauri::AppHandle,
    db: &Database,
    contact_id: i64,
    declaration_ids: &[i64],
) -> Vec<String> {
    let mut errors = Vec::new();
    for id in declaration_ids {
        if let Err(message) = ack_espace_scpi_declaration(app, db, contact_id, *id) {
            errors.push(format!("Déclaration {id} : accusé de réception refusé ({message})"));
        }
    }
    errors
}

fn import_one_declaration(
    db: &Database,
    contact_id: i64,
    decl: &PortalScpiDeclarationLine,
) -> Result<bool, String> {
    let inv = db
        .get_investissement_by_id(decl.investissement_id)
        .map_err(|e| e.to_string())?;

    if !investissement_visible_to_espace_contact(db, contact_id, &inv)? {
        return Err("Investissement hors périmètre client".into());
    }
    if inv.origine != "MON_CONSEIL" {
        return Err("Origine non importable".into());
    }
    if !matches!(
        inv.type_produit.as_str(),
        "SCPI" | "SCPI_FISCALE" | "SCPI_DEMEMBREMENT"
    ) {
        return Err("Type produit non SCPI".into());
    }

    let date_rfc3339 = Utc
        .timestamp_opt(decl.date_ts, 0)
        .single()
        .ok_or_else(|| "Date invalide".to_string())?
        .to_rfc3339();

    db.create_investissement_valorisation(NewInvestissementValorisation {
        investissement_id: decl.investissement_id,
        montant: decl.valorisation_centimes,
        date_valorisation: Some(date_rfc3339.clone()),
        notes: Some("Espace client".into()),
        stellium_versements_nets_centimes: None,
        stellium_perf_euro_centimes: None,
    })
    .map_err(|e| e.to_string())?;

    if let Some(montant) = decl.revenu_percu_centimes {
        if montant > 0 {
            db.create_investissement_revenu_percu(NewInvestissementRevenuPercu {
                investissement_id: decl.investissement_id,
                montant,
                date_perception: Some(date_rfc3339),
                source: Some("ESPACE_CLIENT".into()),
            })
            .map_err(|e| e.to_string())?;
        }
    }

    db.touch_investissement_derniere_maj_client(decl.investissement_id, decl.created_at)
        .map_err(|e| e.to_string())?;

    Ok(true)
}

fn investissement_visible_to_espace_contact(
    db: &Database,
    contact_id: i64,
    inv: &Investissement,
) -> Result<bool, String> {
    let contact = db
        .get_contact_by_id(contact_id)
        .map_err(|e| e.to_string())?;
    let foyer_members = load_foyer_members(db, &contact)?;
    let viewer = PatrimoineViewer {
        id: contact_id,
        foyer_id: contact.foyer_id,
        role_foyer: contact.role_foyer.clone(),
    };
    let now = chrono::Utc::now().timestamp();
    Ok(is_investissement_visible_to_viewer(
        &PatrimoineInvestissement {
            contact_id: inv.contact_id,
            foyer_id: inv.foyer_id,
            statut: Some(inv.statut.clone()),
        },
        &viewer,
        &foyer_members,
        now,
        false,
    ))
}
