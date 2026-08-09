//! R2 — Cloisonnement conjugal (miroir de `src/lib/patrimoine/visibilite.ts`).

use chrono::Datelike;

#[derive(Debug, Clone)]
pub struct PatrimoineViewer {
    pub id: i64,
    pub foyer_id: Option<i64>,
    pub role_foyer: Option<String>,
}

#[derive(Debug, Clone)]
pub struct FoyerMemberRef {
    pub id: i64,
    pub role_foyer: Option<String>,
    pub date_naissance: Option<i64>,
}

#[derive(Debug, Clone)]
pub struct PatrimoineInvestissement {
    pub contact_id: Option<i64>,
    pub foyer_id: Option<i64>,
    pub statut: Option<String>,
}

fn is_parent_role(role: Option<&str>) -> bool {
    matches!(role, Some("DECLARANT_1") | Some("DECLARANT_2"))
}

fn is_declarant_role(role: Option<&str>) -> bool {
    matches!(role, Some("DECLARANT_1") | Some("DECLARANT_2"))
}

fn compute_age_years(date_naissance_unix: i64, ref_unix: i64) -> i32 {
    let birth = chrono::DateTime::from_timestamp(date_naissance_unix, 0)
        .unwrap_or_else(chrono::Utc::now);
    let reference = chrono::DateTime::from_timestamp(ref_unix, 0).unwrap_or_else(chrono::Utc::now);
    let birth_date = birth.date_naive();
    let ref_date = reference.date_naive();
    let mut age = ref_date.year() - birth_date.year();
    if (ref_date.month(), ref_date.day()) < (birth_date.month(), birth_date.day()) {
        age -= 1;
    }
    age
}

pub fn is_contact_minor_at(date_naissance: Option<i64>, ref_unix: i64) -> bool {
    let Some(birth) = date_naissance.filter(|d| *d > 0) else {
        return false;
    };
    compute_age_years(birth, ref_unix) < 18
}

fn is_common_foyer_investment(inv: &PatrimoineInvestissement) -> bool {
    inv.foyer_id.is_some()
        && inv.contact_id.map(|id| id <= 0).unwrap_or(true)
}

fn same_foyer(viewer: &PatrimoineViewer, inv: &PatrimoineInvestissement) -> bool {
    matches!(
        (viewer.foyer_id, inv.foyer_id),
        (Some(vf), Some(inf)) if vf == inf
    )
}

fn find_member<'a>(members: &'a [FoyerMemberRef], contact_id: i64) -> Option<&'a FoyerMemberRef> {
    members.iter().find(|m| m.id == contact_id)
}

fn is_owner_in_viewer_foyer(
    owner_id: i64,
    viewer: &PatrimoineViewer,
    foyer_members: &[FoyerMemberRef],
) -> bool {
    viewer.foyer_id.is_some() && foyer_members.iter().any(|m| m.id == owner_id)
}

fn is_minor_child_member(owner: &FoyerMemberRef, ref_unix: i64) -> bool {
    if owner.role_foyer.as_deref() != Some("ENFANT") {
        return false;
    }
    // Sans date de naissance, rien ne distingue un enfant de 10 ans d'un enfant
    // majeur de 25 ans : exposer ses avoirs aux parents serait le même incident
    // que le cas conjoint. Le conseiller renseigne la date pour rendre visible.
    if owner.date_naissance.map(|d| d <= 0).unwrap_or(true) {
        return false;
    }
    is_contact_minor_at(owner.date_naissance, ref_unix)
}

fn is_spouse_personal_investment(
    viewer: &PatrimoineViewer,
    owner_id: i64,
    members: &[FoyerMemberRef],
) -> bool {
    if !is_declarant_role(viewer.role_foyer.as_deref()) {
        return false;
    }
    let Some(owner) = find_member(members, owner_id) else {
        return false;
    };
    if !is_declarant_role(owner.role_foyer.as_deref()) {
        return false;
    }
    owner.id != viewer.id
}

pub fn is_investissement_visible_to_viewer(
    inv: &PatrimoineInvestissement,
    viewer: &PatrimoineViewer,
    foyer_members: &[FoyerMemberRef],
    now_unix: i64,
    include_cloture: bool,
) -> bool {
    if inv.statut.as_deref() == Some("CLOTURE") && !include_cloture {
        return false;
    }

    if inv.contact_id == Some(viewer.id) {
        return true;
    }

    if is_common_foyer_investment(inv) && same_foyer(viewer, inv) {
        return true;
    }

    let Some(owner_id) = inv.contact_id.filter(|id| *id > 0) else {
        return false;
    };

    if !is_owner_in_viewer_foyer(owner_id, viewer, foyer_members) {
        return false;
    }

    if let (Some(inv_foyer), Some(viewer_foyer)) = (inv.foyer_id, viewer.foyer_id) {
        if inv_foyer != viewer_foyer {
            return false;
        }
    }

    let Some(owner) = find_member(foyer_members, owner_id) else {
        return false;
    };

    if owner.role_foyer.as_deref() == Some("ENFANT") && is_parent_role(viewer.role_foyer.as_deref()) {
        return is_minor_child_member(owner, now_unix);
    }

    if is_spouse_personal_investment(viewer, owner_id, foyer_members) {
        return false;
    }

    false
}

#[cfg(test)]
mod tests {
    use super::*;

    const NOW: i64 = 1_700_000_000;

    fn adult_birthday(years_ago: i32) -> i64 {
        let ref_dt = chrono::DateTime::from_timestamp(NOW, 0).unwrap();
        (ref_dt - chrono::Duration::days(365 * years_ago as i64))
            .timestamp()
    }

    fn viewer_jean() -> PatrimoineViewer {
        PatrimoineViewer {
            id: 1,
            foyer_id: Some(10),
            role_foyer: Some("DECLARANT_1".into()),
        }
    }

    fn members_with_child() -> Vec<FoyerMemberRef> {
        vec![
            FoyerMemberRef {
                id: 1,
                role_foyer: Some("DECLARANT_1".into()),
                date_naissance: None,
            },
            FoyerMemberRef {
                id: 2,
                role_foyer: Some("DECLARANT_2".into()),
                date_naissance: None,
            },
            FoyerMemberRef {
                id: 3,
                role_foyer: Some("ENFANT".into()),
                date_naissance: Some(adult_birthday(12)),
            },
        ]
    }

    #[test]
    fn child_personal_without_foyer_id_is_visible_to_parent() {
        let inv = PatrimoineInvestissement {
            contact_id: Some(3),
            foyer_id: None,
            statut: Some("ACTIF".into()),
        };
        assert!(is_investissement_visible_to_viewer(
            &inv,
            &viewer_jean(),
            &members_with_child(),
            NOW,
            false
        ));
    }

    #[test]
    fn child_without_birthdate_is_hidden_from_parent() {
        let members = vec![
            FoyerMemberRef {
                id: 1,
                role_foyer: Some("DECLARANT_1".into()),
                date_naissance: None,
            },
            FoyerMemberRef {
                id: 3,
                role_foyer: Some("ENFANT".into()),
                date_naissance: None,
            },
        ];
        let inv = PatrimoineInvestissement {
            contact_id: Some(3),
            foyer_id: None,
            statut: Some("ACTIF".into()),
        };
        assert!(!is_investissement_visible_to_viewer(
            &inv,
            &viewer_jean(),
            &members,
            NOW,
            false
        ));
    }

    #[test]
    fn adult_child_is_hidden_from_parent() {
        let members = vec![
            FoyerMemberRef {
                id: 1,
                role_foyer: Some("DECLARANT_1".into()),
                date_naissance: None,
            },
            FoyerMemberRef {
                id: 4,
                role_foyer: Some("ENFANT".into()),
                date_naissance: Some(adult_birthday(25)),
            },
        ];
        let inv = PatrimoineInvestissement {
            contact_id: Some(4),
            foyer_id: Some(10),
            statut: Some("ACTIF".into()),
        };
        assert!(!is_investissement_visible_to_viewer(
            &inv,
            &viewer_jean(),
            &members,
            NOW,
            false
        ));
    }

    #[test]
    fn spouse_personal_is_hidden() {
        let inv = PatrimoineInvestissement {
            contact_id: Some(2),
            foyer_id: Some(10),
            statut: Some("ACTIF".into()),
        };
        assert!(!is_investissement_visible_to_viewer(
            &inv,
            &viewer_jean(),
            &members_with_child(),
            NOW,
            false
        ));
    }
}
