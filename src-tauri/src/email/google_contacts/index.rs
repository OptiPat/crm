//! Index complet des contacts Google (people/me/connections) — anti-doublons à la création.

use super::{normalize_phone_for_match, trim_opt, GooglePerson};
use crate::database::models::Contact;
use reqwest::blocking::Client;
use serde::Deserialize;
use std::collections::{HashMap, HashSet};

const PEOPLE_BASE: &str = "https://people.googleapis.com/v1";
const INDEX_FIELDS: &str = "names,emailAddresses,phoneNumbers,metadata";

fn before_critical_read() {
    super::before_critical_read();
}

fn send_index_page(
    client: &Client,
    page_token: Option<&str>,
) -> Result<ListConnectionsResponse, String> {
    before_critical_read();
    super::send_with_rate_limit_retry("Liste Google Contacts", || {
        let mut req = client.get(format!("{PEOPLE_BASE}/people/me/connections"));
        req = req.query(&[
            ("personFields", INDEX_FIELDS),
            ("pageSize", "1000"),
            ("sortOrder", "LAST_MODIFIED_ASCENDING"),
        ]);
        if let Some(token) = page_token {
            req = req.query(&[("pageToken", token)]);
        }
        req.send()
    })
    .and_then(|resp| {
        resp.json()
            .map_err(|e| format!("Réponse liste Google Contacts invalide : {e}"))
    })
}

#[derive(Debug, Deserialize)]
struct ListConnectionsResponse {
    connections: Option<Vec<GooglePerson>>,
    #[serde(rename = "nextPageToken", default)]
    next_page_token: Option<String>,
}

fn push_unique(map: &mut HashMap<String, Vec<String>>, key: String, resource_name: String) {
    let entry = map.entry(key).or_default();
    if !entry.iter().any(|r| r == &resource_name) {
        entry.push(resource_name);
    }
}

/// Index email (minuscule) / téléphone (normalisé FR) → resourceNames Google (doublons possibles).
pub struct GoogleContactIndex {
    by_email: HashMap<String, Vec<String>>,
    by_phone: HashMap<String, Vec<String>>,
    persons: HashMap<String, GooglePerson>,
    full_load: bool,
}

impl GoogleContactIndex {
    pub fn load(client: &Client) -> Result<Self, String> {
        let mut by_email = HashMap::new();
        let mut by_phone = HashMap::new();
        let mut persons = HashMap::new();
        let mut page_token: Option<String> = None;

        loop {
            let body = send_index_page(
                client,
                page_token.as_deref(),
            )?;

            for person in body.connections.unwrap_or_default() {
                let Some(rn) = person
                    .resource_name
                    .clone()
                    .filter(|s| !s.is_empty())
                else {
                    continue;
                };
                persons.insert(rn.clone(), person.clone());
                for e in &person.email_addresses {
                    if let Some(val) = trim_opt(e.value.as_ref()) {
                        push_unique(&mut by_email, val.to_ascii_lowercase(), rn.clone());
                    }
                }
                for p in &person.phone_numbers {
                    if let Some(val) = trim_opt(p.value.as_ref()) {
                        if let Some(key) = normalize_phone_for_match(&val) {
                            push_unique(&mut by_phone, key, rn.clone());
                        }
                    }
                }
            }

            page_token = body.next_page_token.filter(|t| !t.is_empty());
            if page_token.is_none() {
                break;
            }
        }

        Ok(Self {
            by_email,
            by_phone,
            persons,
            full_load: true,
        })
    }

    pub fn is_full_load(&self) -> bool {
        self.full_load
    }

    pub fn get_person(&self, resource_name: &str) -> Option<&GooglePerson> {
        self.persons.get(resource_name)
    }

    pub fn lookup_resource_names(&self, contact: &Contact) -> Vec<String> {
        let mut seen = HashSet::new();
        let mut out = Vec::new();
        if let Some(email) = trim_opt(contact.email.as_ref()) {
            if let Some(list) = self.by_email.get(&email.to_ascii_lowercase()) {
                for rn in list {
                    if seen.insert(rn.clone()) {
                        out.push(rn.clone());
                    }
                }
            }
        }
        if let Some(phone) = trim_opt(contact.telephone.as_ref()) {
            if let Some(nine) = normalize_phone_for_match(&phone) {
                if let Some(list) = self.by_phone.get(&nine) {
                    for rn in list {
                        if seen.insert(rn.clone()) {
                            out.push(rn.clone());
                        }
                    }
                }
            }
        }
        out
    }

    /// Après création / liaison — évite un second doublon dans le même batch.
    pub fn register(&mut self, contact: &Contact, resource_name: &str) {
        if let Some(email) = trim_opt(contact.email.as_ref()) {
            push_unique(
                &mut self.by_email,
                email.to_ascii_lowercase(),
                resource_name.to_string(),
            );
        }
        if let Some(phone) = trim_opt(contact.telephone.as_ref()) {
            if let Some(nine) = normalize_phone_for_match(&phone) {
                push_unique(&mut self.by_phone, nine, resource_name.to_string());
            }
        }
    }

    pub fn register_person(&mut self, person: GooglePerson) {
        if let Some(rn) = person.resource_name.clone().filter(|s| !s.is_empty()) {
            self.persons.insert(rn, person);
        }
    }

    pub fn unregister(&mut self, resource_name: &str) {
        self.persons.remove(resource_name);
        for list in self.by_email.values_mut() {
            list.retain(|r| r != resource_name);
        }
        for list in self.by_phone.values_mut() {
            list.retain(|r| r != resource_name);
        }
    }

    pub fn iter_persons(&self) -> impl Iterator<Item = &GooglePerson> {
        self.persons.values()
    }

    pub fn clone_for_session(&self) -> Self {
        Self {
            by_email: self.by_email.clone(),
            by_phone: self.by_phone.clone(),
            persons: self.persons.clone(),
            full_load: self.full_load,
        }
    }

    #[cfg(test)]
    pub fn from_test_data(
        by_email: HashMap<String, Vec<String>>,
        by_phone: HashMap<String, Vec<String>>,
        persons: HashMap<String, GooglePerson>,
    ) -> Self {
        Self {
            by_email,
            by_phone,
            persons,
            full_load: true,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn lookup_returns_all_resource_names_for_email() {
        let index = GoogleContactIndex {
            by_email: HashMap::from([(
                "jean@example.com".into(),
                vec!["people/c1".into(), "people/c2".into()],
            )]),
            by_phone: HashMap::new(),
            persons: HashMap::new(),
            full_load: true,
        };
        let contact = Contact {
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
            nom: "Dupont".into(),
            prenom: "Jean".into(),
            email: Some("jean@example.com".into()),
            telephone: None,
            adresse: None,
            code_postal: None,
            ville: None,
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
            statut_suivi: "ACTIF".into(),
            registre: None,
            notes: None,
            famille_regroupement_exclu: false,
            google_contact_resource_name: None,
            google_synced_at: None,
            created_at: Some(0),
            updated_at: Some(0),
        };
        assert_eq!(index.lookup_resource_names(&contact).len(), 2);
    }
}
