//! Propositions de liaison CRM ↔ Google par nom/prénom (validation manuelle).

use super::{
    auth_client, get_person_by_resource_name, google_access_token, google_has_crm_email,
    google_has_crm_phone, person_primary_email, person_primary_phone, pick_best_match,
    sync_contact_to_google, trim_opt, with_db, GoogleContactIndex, GoogleContactSyncResult,
    GooglePerson, SESSION_INDEX,
};
use crate::commands::DbState;
use crate::contact_name::names_match;
use crate::database::models::Contact;
use reqwest::blocking::Client;
use serde::Serialize;
use tauri::AppHandle;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GoogleContactNameCandidate {
    pub resource_name: String,
    pub google_prenom: String,
    pub google_nom: String,
    pub google_email: Option<String>,
    pub google_phone: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GoogleContactNameProposal {
    pub contact_id: i64,
    pub prenom: String,
    pub nom: String,
    pub crm_email: Option<String>,
    pub crm_phone: Option<String>,
    pub candidates: Vec<GoogleContactNameCandidate>,
}

fn person_nom_prenom(person: &GooglePerson) -> (String, String) {
    let name = person.names.first();
    (
        name.and_then(|n| trim_opt(n.family_name.as_ref()))
            .unwrap_or_default(),
        name.and_then(|n| trim_opt(n.given_name.as_ref()))
            .unwrap_or_default(),
    )
}

fn candidate_conflicts_with_crm(contact: &Contact, person: &GooglePerson) -> bool {
    if let Some(ref em) = trim_opt(contact.email.as_ref()) {
        let has_any = person
            .email_addresses
            .iter()
            .any(|e| trim_opt(e.value.as_ref()).is_some());
        if has_any && !google_has_crm_email(person, em) {
            return true;
        }
    }
    if let Some(ref ph) = trim_opt(contact.telephone.as_ref()) {
        let has_any = person
            .phone_numbers
            .iter()
            .any(|p| trim_opt(p.value.as_ref()).is_some());
        if has_any && !google_has_crm_phone(person, ph) {
            return true;
        }
    }
    false
}

fn already_matched_by_email_or_phone(contact: &Contact, index: &GoogleContactIndex) -> bool {
    if contact
        .google_contact_resource_name
        .as_ref()
        .is_some_and(|s| !s.is_empty())
    {
        return true;
    }
    for rn in index.lookup_resource_names(contact) {
        if let Some(person) = index.get_person(&rn) {
            if pick_best_match(contact, std::slice::from_ref(person)).is_some() {
                return true;
            }
        }
    }
    false
}

fn person_to_candidate(person: &GooglePerson) -> Option<GoogleContactNameCandidate> {
    let rn = person.resource_name.clone().filter(|s| !s.is_empty())?;
    let (google_nom, google_prenom) = person_nom_prenom(person);
    Some(GoogleContactNameCandidate {
        resource_name: rn,
        google_prenom,
        google_nom,
        google_email: person_primary_email(person),
        google_phone: person_primary_phone(person),
    })
}

fn collect_name_proposals_for_contact(
    contact: &Contact,
    index: &GoogleContactIndex,
) -> Option<GoogleContactNameProposal> {
    let contact_id = contact.id?;
    if trim_opt(Some(&contact.nom)).is_none() || trim_opt(Some(&contact.prenom)).is_none() {
        return None;
    }
    if already_matched_by_email_or_phone(contact, index) {
        return None;
    }

    let mut candidates = Vec::new();
    for person in index.iter_persons() {
        let (google_nom, google_prenom) = person_nom_prenom(person);
        if google_nom.is_empty() && google_prenom.is_empty() {
            continue;
        }
        if !names_match(
            &contact.nom,
            &contact.prenom,
            &google_nom,
            &google_prenom,
        ) {
            continue;
        }
        if candidate_conflicts_with_crm(contact, person) {
            continue;
        }
        if let Some(c) = person_to_candidate(person) {
            candidates.push(c);
        }
    }

    if candidates.is_empty() {
        return None;
    }

    candidates.sort_by(|a, b| {
        a.google_nom
            .cmp(&b.google_nom)
            .then_with(|| a.google_prenom.cmp(&b.google_prenom))
    });

    Some(GoogleContactNameProposal {
        contact_id,
        prenom: contact.prenom.clone(),
        nom: contact.nom.clone(),
        crm_email: trim_opt(contact.email.as_ref()),
        crm_phone: trim_opt(contact.telephone.as_ref()),
        candidates,
    })
}

pub fn list_google_contact_name_proposals(
    app: &AppHandle,
    db_state: &DbState,
) -> Result<Vec<GoogleContactNameProposal>, String> {
    let token = google_access_token(app)?;
    let client = auth_client(&token);
    let index = GoogleContactIndex::load(&client)?;

    if let Ok(mut guard) = SESSION_INDEX.lock() {
        *guard = Some(index.clone_for_session());
    }

    let contacts = with_db(db_state, |db| {
        db.get_all_contacts()
            .map_err(|e| e.to_string())
    })?;

    let dismissed = with_db(db_state, |db| {
        db.google_contact_name_proposal_dismissed_ids()
            .map_err(|e| e.to_string())
    })?;

    let mut proposals = Vec::new();
    for contact in contacts {
        if contact.id.is_some_and(|id| dismissed.contains(&id)) {
            continue;
        }
        if let Some(p) = collect_name_proposals_for_contact(&contact, &index) {
            proposals.push(p);
        }
    }

    proposals.sort_by(|a, b| {
        a.nom
            .cmp(&b.nom)
            .then_with(|| a.prenom.cmp(&b.prenom))
    });

    Ok(proposals)
}

pub fn dismiss_google_contact_name_proposal(
    db_state: &DbState,
    contact_id: i64,
) -> Result<(), String> {
    with_db(db_state, |db| {
        db.dismiss_google_contact_name_proposal(contact_id)
            .map_err(|e| e.to_string())?;
        Ok(())
    })
}

pub fn apply_google_contact_name_proposal(
    app: &AppHandle,
    db_state: &DbState,
    contact_id: i64,
    resource_name: &str,
) -> Result<GoogleContactSyncResult, String> {
    let token = google_access_token(app)?;
    let client: Client = auth_client(&token);

    let contact = with_db(db_state, |db| {
        db.get_contact_by_id(contact_id)
            .map_err(|e| e.to_string())
    })?;

    let person = get_person_by_resource_name(&client, resource_name)?;
    let (google_nom, google_prenom) = person_nom_prenom(&person);
    if !names_match(
        &contact.nom,
        &contact.prenom,
        &google_nom,
        &google_prenom,
    ) {
        return Err("Le nom Google ne correspond plus à la fiche CRM.".into());
    }
    if candidate_conflicts_with_crm(&contact, &person) {
        return Err("Email ou téléphone CRM incompatible avec la fiche Google.".into());
    }

    let mut enriched_email = false;
    let mut enriched_phone = false;

    if let Some(g) = person_primary_email(&person) {
        if trim_opt(contact.email.as_ref()).is_none() {
            with_db(db_state, |db| {
                db.enrich_contact_email_if_empty(contact_id, &g)
                    .map_err(|e| e.to_string())?;
                Ok(())
            })?;
            enriched_email = true;
        }
    }
    if let Some(g) = person_primary_phone(&person) {
        if trim_opt(contact.telephone.as_ref()).is_none() {
            with_db(db_state, |db| {
                db.enrich_contact_phone_if_empty(contact_id, &g)
                    .map_err(|e| e.to_string())?;
                Ok(())
            })?;
            enriched_phone = true;
        }
    }

    with_db(db_state, |db| {
        db.set_google_contact_link(contact_id, resource_name)
            .map_err(|e| e.to_string())?;
        Ok(())
    })?;

    let contact = with_db(db_state, |db| {
        db.get_contact_by_id(contact_id)
            .map_err(|e| e.to_string())
    })?;

    if let Ok(mut guard) = SESSION_INDEX.lock() {
        if let Some(index) = guard.as_mut() {
            index.register(&contact, resource_name);
            index.register_person(person);
        }
    }

    let has_coords = trim_opt(contact.email.as_ref()).is_some()
        || trim_opt(contact.telephone.as_ref()).is_some();
    if has_coords {
        return sync_contact_to_google(app, db_state, contact_id, None);
    }

    let action = if enriched_email || enriched_phone {
        "linked_enriched".into()
    } else {
        "linked".into()
    };

    Ok(GoogleContactSyncResult {
        action,
        resource_name: Some(resource_name.to_string()),
        enriched_email,
        enriched_phone,
        duplicates_removed: 0,
        message: Some("Contact associé à Google (validation manuelle).".into()),
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::email::google_contacts::{GoogleEmail, GoogleName, GooglePhone};

    fn sample_crm(nom: &str, prenom: &str, email: Option<&str>, phone: Option<&str>) -> Contact {
        Contact {
            id: Some(1),
            famille_id: None,
            foyer_id: None,
            role_foyer: None,
            role_famille: None,
            categorie: "CLIENT".into(),
            filleul_categorie: None,
            parrain_id: None,
            prescripteur_id: None,
            civilite: None,
            nom: nom.into(),
            prenom: prenom.into(),
            email: email.map(String::from),
            telephone: phone.map(String::from),
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
            epargne_precaution_souhaitee: None,
            objectifs_patrimoniaux: None,
            tranche_imposition: None,
            nombre_parts_fiscales: None,
            revenu_fiscal_reference: None,
            ir_net_a_payer: None,
            source_lead: None,
            profil_risque_sri: None,
            date_dernier_contact: None,
            date_prochain_suivi: None,
            date_dernier_contact_filleul: None,
            date_prochain_suivi_filleul: None,
            date_r1: None,
            type_invitation_filleul: None,
            date_invitation_filleul: None,
            date_inscription_filleul: None,
            presence_invitation_filleul: None,
            filleul_titre: None,
            filleul_qualification: None,
            filleul_volume: None,
            filleul_volume_manager: None,
            statut_suivi: "ACTIF".into(),
            registre: None,
            notes: None,
            famille_regroupement_exclu: false,
            google_contact_resource_name: None,
            google_synced_at: None,
            created_at: Some(0),
            updated_at: Some(0),
        }
    }

    fn google_person(
        rn: &str,
        nom: &str,
        prenom: &str,
        email: Option<&str>,
        phone: Option<&str>,
    ) -> GooglePerson {
        GooglePerson {
            resource_name: Some(rn.into()),
            etag: None,
            metadata: None,
            names: vec![GoogleName {
                given_name: Some(prenom.into()),
                family_name: Some(nom.into()),
            }],
            email_addresses: email
                .map(|e| GoogleEmail {
                    value: Some(e.into()),
                })
                .into_iter()
                .collect(),
            phone_numbers: phone
                .map(|p| GooglePhone {
                    value: Some(p.into()),
                })
                .into_iter()
                .collect(),
        }
    }

    #[test]
    fn skips_when_email_already_matches_index() {
        let contact = sample_crm("Dupont", "Jean", Some("jean@example.com"), None);
        let person = google_person("people/c1", "Dupont", "Jean", Some("jean@example.com"), None);
        let mut persons = std::collections::HashMap::new();
        persons.insert("people/c1".into(), person);
        let index = GoogleContactIndex::from_test_data(
            std::collections::HashMap::from([(
                "jean@example.com".into(),
                vec!["people/c1".into()],
            )]),
            std::collections::HashMap::new(),
            persons,
        );
        assert!(collect_name_proposals_for_contact(&contact, &index).is_none());
    }

    #[test]
    fn proposes_when_name_match_and_no_crm_coords() {
        let contact = sample_crm("Dupont", "Jean", None, None);
        let person = google_person(
            "people/c1",
            "Dupont",
            "Jean",
            Some("jean@example.com"),
            Some("0612345678"),
        );
        let mut persons = std::collections::HashMap::new();
        persons.insert("people/c1".into(), person);
        let index = GoogleContactIndex::from_test_data(
            std::collections::HashMap::new(),
            std::collections::HashMap::new(),
            persons,
        );
        let p = collect_name_proposals_for_contact(&contact, &index).unwrap();
        assert_eq!(p.candidates.len(), 1);
        assert_eq!(p.candidates[0].google_email.as_deref(), Some("jean@example.com"));
    }

    #[test]
    fn rejects_conflicting_crm_email() {
        let contact = sample_crm("Dupont", "Jean", Some("autre@example.com"), None);
        let person = google_person("people/c1", "Dupont", "Jean", Some("jean@example.com"), None);
        assert!(candidate_conflicts_with_crm(&contact, &person));
    }
}
