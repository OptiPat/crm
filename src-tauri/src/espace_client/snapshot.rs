use std::collections::HashMap;

use crate::database::models::{Contact, EspaceEcheance, Investissement};
use crate::database::Database;
use crate::database::espace_client::ESPACE_STATUT_ACTIF;

use super::sync_payload::{
    EspaceClientAccesSnapshot, EspaceClientContactSnapshot, EspaceClientDemandeLine,
    EspaceClientInvestissementLine, EspaceClientPartenaireLine, EspaceClientRdvLien,
    EspaceClientSyncPayload, EspaceClientTimelineEvent, ESPACE_SYNC_SCHEMA_VERSION,
};
use super::visibilite::{
    FoyerMemberRef, PatrimoineInvestissement, PatrimoineViewer, is_investissement_visible_to_viewer,
};

pub fn build_espace_client_snapshot(
    db: &Database,
    contact_id: i64,
) -> Result<EspaceClientSyncPayload, String> {
    build_espace_client_snapshot_with_sequence(db, contact_id, None)
}

pub fn build_espace_client_snapshot_for_push(
    db: &Database,
    contact_id: i64,
) -> Result<EspaceClientSyncPayload, String> {
    let sequence = db
        .reserve_espace_sync_sequence()
        .map_err(|e| e.to_string())?;
    build_espace_client_snapshot_with_sequence(db, contact_id, Some(sequence))
}

fn build_espace_client_snapshot_with_sequence(
    db: &Database,
    contact_id: i64,
    sequence: Option<i64>,
) -> Result<EspaceClientSyncPayload, String> {
    let contact = db
        .get_contact_by_id(contact_id)
        .map_err(|e| e.to_string())?;

    let acces = db
        .get_espace_acces_by_contact(contact_id)
        .map_err(|e| e.to_string())?
        .ok_or_else(|| "Aucun accès espace client pour ce contact".to_string())?;

    if acces.statut != ESPACE_STATUT_ACTIF {
        return Err("L'accès espace client n'est pas actif".to_string());
    }

    let now = chrono::Utc::now().timestamp();
    let sequence = sequence.unwrap_or(0);

    let foyer_members = load_foyer_members(db, &contact)?;
    let viewer = PatrimoineViewer {
        id: contact_id,
        foyer_id: contact.foyer_id,
        role_foyer: contact.role_foyer.clone(),
    };

    let patrimoine_rows = load_patrimoine_rows(db, &contact)?;
    let visible: Vec<Investissement> = patrimoine_rows
        .into_iter()
        .filter(|inv| {
            is_investissement_visible_to_viewer(
                &PatrimoineInvestissement {
                    contact_id: inv.contact_id,
                    foyer_id: inv.foyer_id,
                    statut: Some(inv.statut.clone()),
                },
                &viewer,
                &foyer_members,
                now,
                false,
            )
        })
        .collect();

    let investissements = visible
        .iter()
        .map(map_investissement_line)
        .collect::<Vec<_>>();

    let partenaires = load_partenaires_for_investissements(db, &visible)?;

    // Les liens de prise de rendez-vous sont ceux du profil CGP, déjà utilisés
    // par les modèles d'emails : une seule liste à tenir à jour.
    let rdv_liens = collect_rdv_liens(db);

    let echeances = db
        .list_espace_echeances(contact_id)
        .map_err(|e| e.to_string())?;
    let timeline = build_timeline(&visible, &echeances, &rdv_liens);

    let demandes = db
        .list_espace_demandes_for_sync(contact_id)
        .map_err(|e| e.to_string())?
        .into_iter()
        .map(|d| EspaceClientDemandeLine {
            id: d.id,
            type_document: d.type_document,
            template_key: d.template_key,
            libelle: d.libelle,
            statut: d.statut,
            demande_at: d.demande_at,
        })
        .collect();

    Ok(EspaceClientSyncPayload {
        schema_version: ESPACE_SYNC_SCHEMA_VERSION,
        sequence,
        generated_at: now,
        contact: EspaceClientContactSnapshot {
            contact_id,
            prenom: contact.prenom,
            nom: contact.nom,
        },
        acces: EspaceClientAccesSnapshot {
            statut: acces.statut,
            email_utilise: acces.email_utilise.clone(),
            // Empreinte seule : c'est elle qui autorise la toute première
            // connexion, avec le code dicté de vive voix au client.
            activation_code_hash: db
                .get_espace_activation_code_hash(contact_id)
                .map_err(|e| e.to_string())?,
            premiere_connexion_at: acces.premiere_connexion_at,
        },
        investissements,
        partenaires,
        timeline,
        demandes,
        rdv_liens,
        // Simple lecture : la paire est créée par la commande de push, qui
        // dispose du handle nécessaire au chiffrement de la clé privée.
        depot_public_key: db
            .get_setting(crate::espace_client::config::DEPOT_PUBLIC_KEY_SETTING)
            .map_err(|e| e.to_string())?
            .map(|v| v.trim().to_string())
            .filter(|v| !v.is_empty()),
    })
}

fn load_partenaires_for_investissements(
    db: &Database,
    investissements: &[Investissement],
) -> Result<Vec<EspaceClientPartenaireLine>, String> {
    let mut ids: Vec<i64> = investissements
        .iter()
        .filter_map(|inv| inv.partenaire_id)
        .collect();
    ids.sort_unstable();
    ids.dedup();

    let mut partenaires = Vec::with_capacity(ids.len());
    for id in ids {
        let Ok(partner) = db.get_partenaire_by_id(id) else {
            // Partenaire supprimé ou id orphelin : la sync patrimoine continue sans lien extranet.
            continue;
        };
        partenaires.push(EspaceClientPartenaireLine {
            id: partner.id,
            raison_sociale: partner.raison_sociale,
            url_extranet: partner.url_extranet,
        });
    }
    Ok(partenaires)
}

fn load_foyer_members(db: &Database, contact: &Contact) -> Result<Vec<FoyerMemberRef>, String> {
    let contact_id = contact.id.ok_or_else(|| "Contact sans identifiant".to_string())?;

    let Some(foyer_id) = contact.foyer_id else {
        return Ok(vec![FoyerMemberRef {
            id: contact_id,
            role_foyer: contact.role_foyer.clone(),
            date_naissance: contact.date_naissance,
        }]);
    };

    let members = db
        .get_contacts_by_foyer(foyer_id)
        .map_err(|e| e.to_string())?;

    Ok(members
        .into_iter()
        .filter_map(|m| {
            let id = m.id?;
            Some(FoyerMemberRef {
                id,
                role_foyer: m.role_foyer,
                date_naissance: m.date_naissance,
            })
        })
        .collect())
}

fn load_patrimoine_rows(db: &Database, contact: &Contact) -> Result<Vec<Investissement>, String> {
    let contact_id = contact.id.ok_or_else(|| "Contact sans identifiant".to_string())?;
    let mut by_id: HashMap<i64, Investissement> = HashMap::new();

    for inv in db
        .get_investissements_by_contact(contact_id)
        .map_err(|e| e.to_string())?
    {
        by_id.insert(inv.id, inv);
    }

    if let Some(foyer_id) = contact.foyer_id {
        for inv in db
            .get_investissements_by_foyer(foyer_id)
            .map_err(|e| e.to_string())?
        {
            by_id.entry(inv.id).or_insert(inv);
        }
        for inv in db
            .get_investissements_by_foyer_contacts(foyer_id)
            .map_err(|e| e.to_string())?
        {
            by_id.entry(inv.id).or_insert(inv);
        }
    }

    let mut rows: Vec<Investissement> = by_id.into_values().collect();
    rows.sort_by(|a, b| b.date_souscription.cmp(&a.date_souscription));
    Ok(rows)
}

fn map_investissement_line(inv: &Investissement) -> EspaceClientInvestissementLine {
    EspaceClientInvestissementLine {
        id: inv.id,
        type_produit: inv.type_produit.clone(),
        partenaire_id: inv.partenaire_id,
        nom_produit: inv.nom_produit.clone(),
        montant_initial: inv.montant_initial,
        encours_actuel: inv.encours_actuel,
        encours_date: inv.encours_date,
        origine: inv.origine.clone(),
        statut: inv.statut.clone(),
        date_souscription: inv.date_souscription,
        date_fin_demembrement: inv.date_fin_demembrement,
        date_fin_pret: inv.date_fin_pret,
        date_prochain_arbitrage: inv.date_prochain_arbitrage,
        derniere_maj_client: inv.derniere_maj_client,
        mensualite_credit: inv.mensualite_credit,
        credit_crd: inv.credit_crd,
        loyer_mensuel: inv.loyer_mensuel,
        url_contrat: inv.url_contrat.clone(),
        versement_programme: inv.versement_programme,
        montant_versement_programme: inv.montant_versement_programme,
        frequence_versement: inv.frequence_versement.clone(),
        reinvestissement_dividendes: inv.reinvestissement_dividendes,
        reinvestissement_pourcent: if inv.reinvestissement_dividendes {
            parse_reinvestissement_pourcent(inv.notes.as_deref())
        } else {
            None
        },
    }
}

/// Extrait le premier « N% » des notes (saisie formulaire réinvestissement).
fn parse_reinvestissement_pourcent(notes: Option<&str>) -> Option<i64> {
    let notes = notes?;
    let bytes = notes.as_bytes();
    let mut i = 0;
    while i < bytes.len() {
        if bytes[i].is_ascii_digit() {
            let start = i;
            while i < bytes.len() && bytes[i].is_ascii_digit() {
                i += 1;
            }
            if i < bytes.len() && bytes[i] == b'%' {
                let n: i64 = notes[start..i].parse().ok()?;
                if (1..=100).contains(&n) {
                    return Some(n);
                }
            }
        } else {
            i += 1;
        }
    }
    Some(100)
}

/// Liens d'agenda proposés au client. Un profil sans lien donne une liste vide
/// et le bouton n'apparaît pas. Les adresses non sécurisées sont écartées :
/// elles restent utilisables dans un email, pas depuis un espace patrimonial.
fn collect_rdv_liens(db: &Database) -> Vec<EspaceClientRdvLien> {
    let Ok(cgp) = db.get_cgp_config() else {
        return Vec::new();
    };
    cgp.agenda_links
        .into_iter()
        .filter(|lien| lien.url.trim().starts_with("https://"))
        .map(|lien| {
            let libelle = lien.label.trim();
            EspaceClientRdvLien {
                id: lien.id.trim().to_string(),
                libelle: if libelle.is_empty() {
                    "Prendre rendez-vous".to_string()
                } else {
                    libelle.to_string()
                },
                url: lien.url.trim().to_string(),
            }
        })
        .collect()
}

/// Échéances du client : celles que portent ses placements, et celles que le
/// conseiller a rédigées pour lui.
///
/// Ni les alertes ni les tâches n'y figurent, et elles ne sont même pas
/// transmises : ce sont ses pense-bêtes de travail, rédigés pour lui. Plusieurs
/// types d'alerte diraient au client qu'il n'a pas été suivi, voire qu'il est
/// fiché comme prospect.
fn build_timeline(
    investissements: &[Investissement],
    echeances: &[EspaceEcheance],
    rdv_liens: &[EspaceClientRdvLien],
) -> Vec<EspaceClientTimelineEvent> {
    let mut events = Vec::new();

    for inv in investissements {
        if inv.statut == "CLOTURE" {
            continue;
        }
        push_inv_date(
            &mut events,
            inv,
            inv.date_fin_demembrement,
            "fin_demembrement",
            "Fin de démembrement",
        );
        push_inv_date(&mut events, inv, inv.date_fin_pret, "fin_pret", "Fin de prêt");
    }

    for echeance in echeances {
        // L'adresse est résolue ici : un lien supprimé des réglages laisse
        // simplement l'échéance sans bouton, plutôt qu'un bouton mort.
        let rdv_url = echeance.rdv_lien_id.as_deref().and_then(|id| {
            rdv_liens
                .iter()
                .find(|lien| lien.id == id)
                .map(|lien| lien.url.clone())
        });
        events.push(EspaceClientTimelineEvent {
            id: format!("echeance-{}", echeance.id),
            kind: "conseiller".into(),
            date: echeance.date_echeance,
            label: echeance.titre.clone(),
            detail: echeance.message.clone(),
            type_produit: None,
            origine: None,
            rdv_url,
        });
    }

    // La vue client annonce des échéances « à venir » : un démembrement clos
    // en 2019 arriverait sinon en tête de liste, le tri étant croissant.
    let maintenant = chrono::Utc::now().timestamp();
    events.retain(|event| event.date >= maintenant);

    events.sort_by(|a, b| a.date.cmp(&b.date));
    events
}

fn push_inv_date(
    events: &mut Vec<EspaceClientTimelineEvent>,
    inv: &Investissement,
    date: Option<i64>,
    kind: &str,
    prefix: &str,
) {
    let Some(date) = date.filter(|d| *d > 0) else {
        return;
    };
    let display = {
        let nom = inv.nom_produit.trim();
        if nom.is_empty() {
            inv.type_produit.clone()
        } else {
            nom.to_string()
        }
    };
    events.push(EspaceClientTimelineEvent {
        id: format!("inv-{}-{kind}", inv.id),
        kind: kind.into(),
        date,
        label: format!("{prefix} — {display}"),
        // Pas de détail : le nom est déjà dans le titre.
        detail: None,
        type_produit: Some(inv.type_produit.clone()),
        origine: Some(inv.origine.clone()),
        rdv_url: None,
    });
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::database::espace_client::ESPACE_STATUT_ACTIF;
    use crate::database::models::NewContact;

    #[test]
    fn snapshot_requires_active_access() {
        let db = Database::open_in_memory_for_tests().unwrap();
        let contact = db
            .create_contact(NewContact {
                categorie: "CLIENT".into(),
                nom: "DUPONT".into(),
                prenom: "Jean".into(),
                email: Some("jean@example.com".into()),
                ..Default::default()
            })
            .unwrap();
        let contact_id = contact.id.unwrap();
        let err = build_espace_client_snapshot(&db, contact_id).unwrap_err();
        assert!(err.contains("accès"));

        db.activate_espace_acces(contact_id, "jean@example.com", "hash-activation-test")
            .unwrap();
        let payload = build_espace_client_snapshot(&db, contact_id).unwrap();
        assert_eq!(payload.acces.statut, ESPACE_STATUT_ACTIF);
    }

    #[test]
    fn timeline_excludes_prochain_arbitrage_from_client_sync() {
        use crate::database::models::Investissement;

        let inv = Investissement {
            id: 1,
            contact_id: Some(1),
            foyer_id: None,
            type_produit: "PER".into(),
            partenaire_id: None,
            nom_produit: "PER".into(),
            numero_contrat: None,
            url_contrat: None,
            montant_initial: None,
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
            origine: "MON_CONSEIL".into(),
            statut: "ACTIF".into(),
            date_cloture: None,
            date_dernier_arbitrage: None,
            date_prochain_arbitrage: Some(1_700_000_000),
            encours_actuel: None,
            encours_date: None,
            derniere_maj_client: None,
            montant_investi_total: None,
            stellium_versements_nets_centimes: None,
            stellium_perf_euro_centimes: None,
            created_at: 0,
            updated_at: 0,
        };

        let events = build_timeline(&[inv], &[], &[]);
        assert!(!events.iter().any(|e| e.kind == "prochain_arbitrage"));
    }

    fn echeance_test(
        id: i64,
        date_echeance: i64,
        titre: &str,
        rdv_lien_id: Option<&str>,
    ) -> EspaceEcheance {
        EspaceEcheance {
            id,
            contact_id: 1,
            date_echeance,
            titre: titre.into(),
            message: None,
            rdv_lien_id: rdv_lien_id.map(str::to_string),
            created_at: 0,
            updated_at: 0,
        }
    }

    fn lien_test(id: &str, url: &str) -> EspaceClientRdvLien {
        EspaceClientRdvLien {
            id: id.into(),
            libelle: "Bilan".into(),
            url: url.into(),
        }
    }

    /// L'échéance désigne un lien par identifiant ; c'est l'adresse résolue
    /// qui part au portail, pour qu'il n'ait pas à connaître les agendas.
    #[test]
    fn advisor_deadline_carries_its_booking_url() {
        let futur = chrono::Utc::now().timestamp() + 86_400;
        let events = build_timeline(
            &[],
            &[echeance_test(1, futur, "Aide déclaration", Some("bilan"))],
            &[lien_test("bilan", "https://calendar.example.com/bilan")],
        );

        assert_eq!(events.len(), 1);
        assert_eq!(events[0].kind, "conseiller");
        assert_eq!(events[0].label, "Aide déclaration");
        assert_eq!(
            events[0].rdv_url.as_deref(),
            Some("https://calendar.example.com/bilan")
        );
    }

    /// Lien retiré des réglages : l'échéance reste, sans bouton mort.
    #[test]
    fn deadline_pointing_at_a_removed_link_loses_its_button() {
        let futur = chrono::Utc::now().timestamp() + 86_400;
        let events = build_timeline(
            &[],
            &[echeance_test(1, futur, "Aide déclaration", Some("disparu"))],
            &[lien_test("bilan", "https://calendar.example.com/bilan")],
        );

        assert_eq!(events.len(), 1);
        assert!(events[0].rdv_url.is_none());
    }

    /// Une adresse en clair reste acceptable dans un email ; sur un espace qui
    /// affiche du patrimoine, elle ne doit pas être proposée.
    #[test]
    fn only_secure_agenda_links_reach_the_client() {
        use crate::database::models::{AgendaLink, CgpConfig};

        let db = crate::database::Database::open_in_memory_for_tests().unwrap();
        db.save_cgp_config(&CgpConfig {
            agenda_links: vec![
                AgendaLink {
                    id: "bilan".into(),
                    label: "Bilan annuel".into(),
                    url: "https://calendar.example.com/bilan".into(),
                },
                AgendaLink {
                    id: "clair".into(),
                    label: "Non securise".into(),
                    url: "http://calendar.example.com/point".into(),
                },
            ],
            ..Default::default()
        })
        .unwrap();

        let liens = collect_rdv_liens(&db);
        assert_eq!(liens.len(), 1);
        assert_eq!(liens[0].id, "bilan");
        assert_eq!(liens[0].libelle, "Bilan annuel");
    }

    /// Profil sans lien : liste vide, et le bouton disparaît côté client.
    #[test]
    fn no_agenda_link_gives_no_button() {
        let db = crate::database::Database::open_in_memory_for_tests().unwrap();
        assert!(collect_rdv_liens(&db).is_empty());
    }

    /// La section s'intitule « échéances à venir » : une échéance datée de
    /// l'an dernier arriverait en tête, le tri étant croissant.
    #[test]
    fn past_deadlines_are_left_out() {
        let passe = chrono::Utc::now().timestamp() - 86_400;
        let futur = chrono::Utc::now().timestamp() + 86_400;
        let events = build_timeline(
            &[],
            &[
                echeance_test(1, passe, "Déjà passée", None),
                echeance_test(2, futur, "À venir", None),
            ],
            &[],
        );

        assert_eq!(events.len(), 1);
        assert_eq!(events[0].id, "echeance-2");
    }

    #[test]
    fn load_partenaires_skips_orphan_partenaire_ids() {
        let db = Database::open_in_memory_for_tests().unwrap();
        let inv = Investissement {
            id: 1,
            contact_id: Some(1),
            foyer_id: None,
            type_produit: "ASSURANCE_VIE".into(),
            partenaire_id: Some(99_999),
            nom_produit: "Contrat".into(),
            numero_contrat: None,
            url_contrat: None,
            montant_initial: None,
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
            origine: "MON_CONSEIL".into(),
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
        };

        let partenaires = load_partenaires_for_investissements(&db, &[inv]).unwrap();
        assert!(partenaires.is_empty());
    }
}
