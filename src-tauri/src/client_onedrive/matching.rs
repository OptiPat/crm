//! Rattachement dossiers OneDrive ↔ contacts CRM (NOM Prénom, nom seul, foyers).

use crate::contact_name::{contact_name_key_canonical, normalize_contact_name};
use crate::database::client_onedrive::ClientOneDriveFolderProposal;
use std::collections::{HashMap, HashSet};

pub fn format_contact_folder_name(nom: &str, prenom: &str) -> String {
    format!("{} {}", nom.trim(), prenom.trim())
}

fn folder_name_keys(name: &str) -> Vec<String> {
    let normalized = normalize_contact_name(name);
    if normalized.is_empty() {
        return Vec::new();
    }
    let mut keys = vec![normalized.clone()];
    if let Some((a, b)) = normalized.split_once(' ') {
        if !a.is_empty() && !b.is_empty() {
            keys.push(contact_name_key_canonical(a, b));
            keys.push(contact_name_key_canonical(b, a));
        }
    }
    if let Some((a, b)) = normalized.split_once(" & ") {
        if !a.is_empty() && !b.is_empty() {
            keys.push(contact_name_key_canonical(a, b));
        }
    }
    keys.sort();
    keys.dedup();
    keys
}

fn contact_folder_keys(nom: &str, prenom: &str) -> Vec<String> {
    let direct = format_contact_folder_name(nom, prenom);
    let reversed = format!("{} {}", prenom.trim(), nom.trim());
    let mut keys = folder_name_keys(&direct);
    keys.extend(folder_name_keys(&reversed));
    keys.push(contact_name_key_canonical(nom, prenom));
    keys.push(contact_name_key_canonical(prenom, nom));
    keys.sort();
    keys.dedup();
    keys
}

fn folder_names_equal(a: &str, b: &str) -> bool {
    let a = a.trim();
    let b = b.trim();
    a.eq_ignore_ascii_case(b) || normalize_contact_name(a) == normalize_contact_name(b)
}

fn resolve_rename_against_siblings(
    proposal: &mut ClientOneDriveFolderProposal,
    source_folder_id: &str,
    folders: &[(String, String, Option<String>)],
    linked_ids: &HashSet<String>,
) {
    let Some(ref target) = proposal.suggested_folder_name else {
        return;
    };
    let Some((existing_id, existing_name, existing_url)) = folders.iter().find(|(id, name, _)| {
        id != source_folder_id && folder_names_equal(name, target)
    }) else {
        return;
    };
    // Ne pas basculer vers un dossier frère si le dossier source est déjà partagé.
    if linked_ids.contains(source_folder_id) {
        return;
    }
    if linked_ids.contains(existing_id) {
        return;
    }

    proposal.folder_id = existing_id.clone();
    proposal.folder_name = existing_name.clone();
    proposal.web_url = existing_url.clone();
    proposal.suggested_folder_name = None;
    proposal.match_kind = "existing".into();
    proposal.confidence = "high".into();
}

fn dedupe_proposals(
    proposals: Vec<ClientOneDriveFolderProposal>,
) -> Vec<ClientOneDriveFolderProposal> {
    let mut seen: HashSet<(String, Option<i64>, Option<i64>)> = HashSet::new();
    let mut out = Vec::new();
    for proposal in proposals {
        let key = (
            proposal.folder_id.clone(),
            proposal.contact_id,
            proposal.foyer_id,
        );
        if seen.insert(key) {
            out.push(proposal);
        }
    }
    out
}

fn folder_needs_crm_rename(folder_name: &str, crm_label: &str) -> bool {
    let folder = folder_name.trim();
    let label = crm_label.trim();
    if folder.is_empty() || label.is_empty() {
        return false;
    }
    if folder == label {
        return false;
    }
    if folder.eq_ignore_ascii_case(label) {
        return false;
    }
    normalize_contact_name(folder) != normalize_contact_name(label)
}

/// Dossier OneDrive nommé uniquement par le nom de famille (ex. « DUPONT »).
pub fn is_surname_only_folder_name(folder_name: &str) -> bool {
    let trimmed = folder_name.trim();
    if trimmed.is_empty() {
        return false;
    }
    !trimmed.contains(' ') && !trimmed.contains('&')
}

#[derive(Debug, Clone)]
struct ExactTarget {
    contact_id: Option<i64>,
    foyer_id: Option<i64>,
    label: String,
    source: String,
}

#[derive(Debug, Clone)]
struct SurnameTarget {
    contact_id: Option<i64>,
    foyer_id: Option<i64>,
    label: String,
    source: String,
}

fn proposal_already_linked_to_target(
    proposal: &ClientOneDriveFolderProposal,
    contact_folder_ids: &HashMap<i64, String>,
) -> bool {
    if let Some(contact_id) = proposal.contact_id {
        return contact_folder_ids
            .get(&contact_id)
            .is_some_and(|folder_id| folder_id == &proposal.folder_id);
    }
    false
}

pub fn propose_folder_matches(
    folders: &[(String, String, Option<String>)], // id, name, web_url
    contacts: &[(i64, String, String, Option<i64>)],
    foyers: &[(i64, String, Option<String>, Option<String>, Option<String>)],
    linked_ids: &HashSet<String>,
    contact_folder_ids: &HashMap<i64, String>,
) -> Vec<ClientOneDriveFolderProposal> {
    let mut contact_map: HashMap<String, ExactTarget> = HashMap::new();
    for (id, nom, prenom, _) in contacts {
        let label = format_contact_folder_name(nom, prenom);
        let target = ExactTarget {
            contact_id: Some(*id),
            foyer_id: None,
            label: label.clone(),
            source: "contact".into(),
        };
        for key in contact_folder_keys(nom, prenom) {
            contact_map.entry(key).or_insert_with(|| target.clone());
        }
    }

    let mut foyer_map: HashMap<String, ExactTarget> = HashMap::new();
    for (id, nom, type_foyer, m_nom, m_prenom) in foyers {
        if type_foyer.as_deref() != Some("COUPLE") {
            continue;
        }
        let label = nom.trim().to_string();
        let target = ExactTarget {
            contact_id: None,
            foyer_id: Some(*id),
            label: label.clone(),
            source: "foyer".into(),
        };
        for key in folder_name_keys(&label) {
            foyer_map.entry(key).or_insert_with(|| target.clone());
        }
        if let (Some(nom), Some(prenom)) = (m_nom, m_prenom) {
            let member = format_contact_folder_name(nom, prenom);
            for key in folder_name_keys(&member) {
                foyer_map.entry(key).or_insert_with(|| target.clone());
            }
        }
    }

    let mut surname_contacts: HashMap<String, Vec<SurnameTarget>> = HashMap::new();
    for (id, nom, prenom, _) in contacts {
        let key = normalize_contact_name(nom);
        if key.is_empty() {
            continue;
        }
        surname_contacts
            .entry(key)
            .or_default()
            .push(SurnameTarget {
                contact_id: Some(*id),
                foyer_id: None,
                label: format_contact_folder_name(nom, prenom),
                source: "contact".into(),
            });
    }

    let mut surname_foyers: HashMap<String, Vec<SurnameTarget>> = HashMap::new();
    for (id, nom, type_foyer, _, _) in foyers {
        if type_foyer.as_deref() != Some("COUPLE") {
            continue;
        }
        let key = normalize_contact_name(nom);
        if key.is_empty() {
            continue;
        }
        surname_foyers
            .entry(key)
            .or_default()
            .push(SurnameTarget {
                contact_id: None,
                foyer_id: Some(*id),
                label: nom.trim().to_string(),
                source: "foyer".into(),
            });
    }

    let mut proposals = Vec::new();
    for (folder_id, folder_name, web_url) in folders {
        if let Some(mut proposal) =
            match_exact(folder_id, folder_name, web_url, &contact_map, &foyer_map)
        {
            resolve_rename_against_siblings(&mut proposal, folder_id, folders, linked_ids);
            if !proposal_already_linked_to_target(&proposal, contact_folder_ids) {
                proposals.push(proposal);
            }
            continue;
        }

        if is_surname_only_folder_name(folder_name) {
            if let Some(mut proposal) = match_surname(
                folder_id,
                folder_name,
                web_url,
                &surname_contacts,
                &surname_foyers,
            ) {
                resolve_rename_against_siblings(&mut proposal, folder_id, folders, linked_ids);
                if !proposal_already_linked_to_target(&proposal, contact_folder_ids) {
                    proposals.push(proposal);
                }
                continue;
            }
        }

        proposals.push(ClientOneDriveFolderProposal {
            folder_id: folder_id.clone(),
            folder_name: folder_name.clone(),
            web_url: web_url.clone(),
            contact_id: None,
            foyer_id: None,
            label: folder_name.clone(),
            confidence: "none".into(),
            source: "unmatched".into(),
            match_kind: "none".into(),
            suggested_folder_name: None,
        });
    }

    proposals.sort_by(|a, b| {
        confidence_rank(&b.confidence)
            .cmp(&confidence_rank(&a.confidence))
            .then_with(|| a.folder_name.to_lowercase().cmp(&b.folder_name.to_lowercase()))
    });
    dedupe_proposals(proposals)
}

fn confidence_rank(confidence: &str) -> u8 {
    match confidence {
        "high" => 4,
        "medium" => 3,
        "ambiguous" => 2,
        _ => 1,
    }
}

fn match_exact(
    folder_id: &str,
    folder_name: &str,
    web_url: &Option<String>,
    contact_map: &HashMap<String, ExactTarget>,
    foyer_map: &HashMap<String, ExactTarget>,
) -> Option<ClientOneDriveFolderProposal> {
    let keys = folder_name_keys(folder_name);
    for key in &keys {
        if let Some(t) = foyer_map.get(key) {
            return Some(proposal_from_exact_match(
                folder_id,
                folder_name,
                web_url,
                t,
            ));
        }
        if let Some(t) = contact_map.get(key) {
            return Some(proposal_from_exact_match(
                folder_id,
                folder_name,
                web_url,
                t,
            ));
        }
    }
    None
}

fn proposal_from_exact_match(
    folder_id: &str,
    folder_name: &str,
    web_url: &Option<String>,
    target: &ExactTarget,
) -> ClientOneDriveFolderProposal {
    let needs_rename = folder_needs_crm_rename(folder_name, &target.label);
    ClientOneDriveFolderProposal {
        folder_id: folder_id.to_string(),
        folder_name: folder_name.to_string(),
        web_url: web_url.clone(),
        contact_id: target.contact_id,
        foyer_id: target.foyer_id,
        label: target.label.clone(),
        confidence: if needs_rename { "medium".into() } else { "high".into() },
        source: target.source.clone(),
        match_kind: if needs_rename {
            "rename".into()
        } else {
            "exact".into()
        },
        suggested_folder_name: if needs_rename {
            Some(target.label.clone())
        } else {
            None
        },
    }
}

fn match_surname(
    folder_id: &str,
    folder_name: &str,
    web_url: &Option<String>,
    surname_contacts: &HashMap<String, Vec<SurnameTarget>>,
    surname_foyers: &HashMap<String, Vec<SurnameTarget>>,
) -> Option<ClientOneDriveFolderProposal> {
    let key = normalize_contact_name(folder_name);
    if key.is_empty() {
        return None;
    }

    let mut candidates: Vec<SurnameTarget> = Vec::new();
    if let Some(foyers) = surname_foyers.get(&key) {
        candidates.extend(foyers.iter().cloned());
    }
    if let Some(contacts) = surname_contacts.get(&key) {
        candidates.extend(contacts.iter().cloned());
    }

    if candidates.is_empty() {
        return None;
    }

    if candidates.len() == 1 {
        let t = &candidates[0];
        let suggested = t.label.clone();
        let needs_rename = !folder_name.eq_ignore_ascii_case(&suggested);
        return Some(ClientOneDriveFolderProposal {
            folder_id: folder_id.to_string(),
            folder_name: folder_name.to_string(),
            web_url: web_url.clone(),
            contact_id: t.contact_id,
            foyer_id: t.foyer_id,
            label: t.label.clone(),
            confidence: if needs_rename { "medium".into() } else { "high".into() },
            source: t.source.clone(),
            match_kind: if needs_rename { "surname".into() } else { "exact".into() },
            suggested_folder_name: if needs_rename {
                Some(suggested)
            } else {
                None
            },
        });
    }

    let labels: Vec<String> = candidates.iter().map(|c| c.label.clone()).collect();
    let summary = if labels.len() <= 3 {
        labels.join(", ")
    } else {
        format!("{} contacts ({})", labels.len(), labels[..2].join(", "))
    };

    Some(ClientOneDriveFolderProposal {
        folder_id: folder_id.to_string(),
        folder_name: folder_name.to_string(),
        web_url: web_url.clone(),
        contact_id: None,
        foyer_id: None,
        label: summary,
        confidence: "ambiguous".into(),
        source: "ambiguous_surname".into(),
        match_kind: "ambiguous_surname".into(),
        suggested_folder_name: None,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn detects_surname_only_folder() {
        assert!(is_surname_only_folder_name("DUPONT"));
        assert!(is_surname_only_folder_name("  Martin "));
        assert!(!is_surname_only_folder_name("DUPONT Jean"));
        assert!(!is_surname_only_folder_name("DUPONT & MARTIN"));
    }

    #[test]
    fn proposes_surname_rename() {
        let folders = vec![(
            "f1".into(),
            "DUPONT".into(),
            Some("https://example.com".into()),
        )];
        let contacts = vec![(1, "DUPONT".into(), "Jean".into(), None)];
        let proposals = propose_folder_matches(&folders, &contacts, &[], &HashSet::new(), &HashMap::new());
        assert_eq!(proposals.len(), 1);
        assert_eq!(proposals[0].match_kind, "surname");
        assert_eq!(proposals[0].confidence, "medium");
        assert_eq!(proposals[0].suggested_folder_name.as_deref(), Some("DUPONT Jean"));
        assert_eq!(proposals[0].contact_id, Some(1));
    }

    #[test]
    fn ambiguous_surname_when_homonyms() {
        let folders = vec![("f1".into(), "DUPONT".into(), None)];
        let contacts = vec![
            (1, "DUPONT".into(), "Jean".into(), None),
            (2, "DUPONT".into(), "Marie".into(), None),
        ];
        let proposals = propose_folder_matches(&folders, &contacts, &[], &HashSet::new(), &HashMap::new());
        assert_eq!(proposals[0].confidence, "ambiguous");
        assert!(proposals[0].contact_id.is_none());
    }

    #[test]
    fn exact_match_skips_surname() {
        let folders = vec![("f1".into(), "DUPONT Jean".into(), None)];
        let contacts = vec![(1, "DUPONT".into(), "Jean".into(), None)];
        let proposals = propose_folder_matches(&folders, &contacts, &[], &HashSet::new(), &HashMap::new());
        assert_eq!(proposals[0].match_kind, "exact");
        assert_eq!(proposals[0].confidence, "high");
        assert!(proposals[0].suggested_folder_name.is_none());
    }

    #[test]
    fn proposes_rename_for_prenom_nom_order() {
        let folders = vec![("f1".into(), "Tifene MERIAU".into(), None)];
        let contacts = vec![(1, "MERIAU".into(), "Tifène".into(), None)];
        let proposals = propose_folder_matches(&folders, &contacts, &[], &HashSet::new(), &HashMap::new());
        assert_eq!(proposals.len(), 1);
        assert_eq!(proposals[0].match_kind, "rename");
        assert_eq!(proposals[0].confidence, "medium");
        assert_eq!(
            proposals[0].suggested_folder_name.as_deref(),
            Some("MERIAU Tifène")
        );
        assert_eq!(proposals[0].contact_id, Some(1));
    }

    #[test]
    fn uses_existing_sibling_when_target_name_already_exists() {
        let folders = vec![
            ("f1".into(), "Tifene MERIAU".into(), None),
            ("f2".into(), "MERIAU Tifène".into(), None),
        ];
        let contacts = vec![(1, "MERIAU".into(), "Tifène".into(), None)];
        let proposals = propose_folder_matches(&folders, &contacts, &[], &HashSet::new(), &HashMap::new());
        let linked: Vec<_> = proposals
            .iter()
            .filter(|p| p.contact_id == Some(1))
            .collect();
        assert_eq!(linked.len(), 1);
        assert_eq!(linked[0].folder_id, "f2");
        assert!(linked[0].suggested_folder_name.is_none());
        assert_eq!(linked[0].match_kind, "existing");
    }

    #[test]
    fn skips_proposal_when_contact_already_linked_to_folder() {
        let folders = vec![("f1".into(), "DUPONT Jean".into(), None)];
        let contacts = vec![(1, "DUPONT".into(), "Jean".into(), None)];
        let mut contact_links = HashMap::new();
        contact_links.insert(1, "f1".into());
        let linked: HashSet<String> = ["f1".into()].into_iter().collect();
        let proposals = propose_folder_matches(&folders, &contacts, &[], &linked, &contact_links);
        assert!(proposals.is_empty());
    }

    #[test]
    fn does_not_redirect_rename_when_source_folder_already_linked() {
        let folders = vec![("f1".into(), "Tifene MERIAU".into(), None)];
        let contacts = vec![(1, "MERIAU".into(), "Tifène".into(), None)];
        let linked: HashSet<String> = ["f1".into()].into_iter().collect();
        let proposals = propose_folder_matches(&folders, &contacts, &[], &linked, &HashMap::new());
        let linked_proposal = proposals
            .iter()
            .find(|p| p.contact_id == Some(1))
            .expect("proposal for contact");
        assert_eq!(linked_proposal.folder_id, "f1");
        assert_eq!(linked_proposal.match_kind, "rename");
    }
}
