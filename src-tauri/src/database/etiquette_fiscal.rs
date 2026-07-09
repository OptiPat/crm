//! Fiscalité pour règles auto étiquettes (TMI, IR net) — contact puis fallback foyer.

use super::models::Contact;

pub const STANDARD_TMI_RATES: [i32; 5] = [0, 11, 30, 41, 45];

/// Normalise une TMI texte vers un taux standard (0, 11, 30, 41, 45).
pub fn normalize_tmi_rate(raw: Option<&str>) -> Option<i32> {
    let s = raw?.trim();
    if s.is_empty() || s == "-" {
        return None;
    }
    let cleaned = s
        .replace('%', "")
        .replace(',', ".")
        .trim()
        .to_string();
    let cleaned = cleaned
        .strip_prefix("TMI")
        .or_else(|| cleaned.strip_prefix("tmi"))
        .unwrap_or(&cleaned)
        .trim()
        .trim_start_matches(':')
        .trim();
    let n: f64 = cleaned.parse().ok()?;
    if !n.is_finite() || n < 0.0 {
        return None;
    }
    let rounded = n.round() as i32;
    if (n - f64::from(rounded)).abs() > 0.01 {
        return None;
    }
    if STANDARD_TMI_RATES.contains(&rounded) {
        Some(rounded)
    } else {
        None
    }
}

fn compare_ir_net(actual: f64, operator: &str, target: f64) -> bool {
    const EPS: f64 = 0.005;
    match operator {
        "lte" => actual <= target + EPS,
        "eq" => (actual - target).abs() <= EPS,
        _ => actual + EPS >= target, // gte (défaut)
    }
}

impl super::Database {
    pub(super) fn resolve_contact_tmi_rate(&self, contact: &Contact) -> rusqlite::Result<Option<i32>> {
        if let Some(rate) = normalize_tmi_rate(contact.tranche_imposition.as_deref()) {
            return Ok(Some(rate));
        }
        if let Some(fid) = contact.foyer_id {
            if let Ok(foyer) = self.get_foyer_by_id(fid) {
                return Ok(normalize_tmi_rate(foyer.tranche_imposition.as_deref()));
            }
        }
        Ok(None)
    }

    pub(super) fn resolve_contact_ir_net(&self, contact: &Contact) -> rusqlite::Result<Option<f64>> {
        if let Some(v) = contact.ir_net_a_payer {
            return Ok(Some(v));
        }
        if let Some(fid) = contact.foyer_id {
            if let Ok(foyer) = self.get_foyer_by_id(fid) {
                return Ok(foyer.ir_net_a_payer);
            }
        }
        Ok(None)
    }

    pub(super) fn contact_matches_tmi_condition(
        &self,
        contact: &Contact,
        config: Option<&String>,
    ) -> rusqlite::Result<bool> {
        let Some(config_str) = config else {
            return Ok(false);
        };
        let Ok(parsed) = serde_json::from_str::<serde_json::Value>(config_str) else {
            return Ok(false);
        };
        let tranches: Vec<i32> = parsed["tranches"]
            .as_array()
            .map(|arr| {
                arr.iter()
                    .filter_map(|v| {
                        v.as_i64()
                            .and_then(|n| i32::try_from(n).ok())
                            .or_else(|| normalize_tmi_rate(v.as_str()))
                    })
                    .collect()
            })
            .unwrap_or_default();
        if tranches.is_empty() {
            return Ok(false);
        }
        let Some(rate) = self.resolve_contact_tmi_rate(contact)? else {
            return Ok(false);
        };
        Ok(tranches.contains(&rate))
    }

    pub(super) fn contact_matches_ir_net_condition(
        &self,
        contact: &Contact,
        config: Option<&String>,
    ) -> rusqlite::Result<bool> {
        let Some(config_str) = config else {
            return Ok(false);
        };
        let Ok(parsed) = serde_json::from_str::<serde_json::Value>(config_str) else {
            return Ok(false);
        };
        let operator = parsed["operator"].as_str().unwrap_or("gte");
        let Some(target) = parsed["montant"].as_f64() else {
            return Ok(false);
        };
        let Some(actual) = self.resolve_contact_ir_net(contact)? else {
            return Ok(false);
        };
        Ok(compare_ir_net(actual, operator, target))
    }

    /// Revenus annuels contact, sinon RBG contact/foyer (`revenu_fiscal_reference`).
    pub(super) fn resolve_contact_revenus_annuels(
        &self,
        contact: &Contact,
    ) -> rusqlite::Result<Option<f64>> {
        if let Some(v) = contact.revenus_annuels {
            if v.is_finite() && v > 0.0 {
                return Ok(Some(v));
            }
        }
        if let Some(v) = contact.revenu_fiscal_reference {
            if v.is_finite() && v > 0.0 {
                return Ok(Some(v));
            }
        }
        if let Some(fid) = contact.foyer_id {
            if let Ok(foyer) = self.get_foyer_by_id(fid) {
                if let Some(v) = foyer.revenu_fiscal_reference {
                    if v.is_finite() && v > 0.0 {
                        return Ok(Some(v));
                    }
                }
            }
        }
        Ok(None)
    }

    pub(super) fn contact_matches_revenus_annuels_condition(
        &self,
        contact: &Contact,
        config: Option<&String>,
    ) -> rusqlite::Result<bool> {
        let Some(config_str) = config else {
            return Ok(false);
        };
        let Ok(parsed) = serde_json::from_str::<serde_json::Value>(config_str) else {
            return Ok(false);
        };
        let operator = parsed["operator"].as_str().unwrap_or("gte");
        let Some(target) = parsed["montant"].as_f64() else {
            return Ok(false);
        };
        let Some(actual) = self.resolve_contact_revenus_annuels(contact)? else {
            return Ok(false);
        };
        Ok(compare_ir_net(actual, operator, target))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn normalize_tmi_variants() {
        assert_eq!(normalize_tmi_rate(Some("11")), Some(11));
        assert_eq!(normalize_tmi_rate(Some("11 %")), Some(11));
        assert_eq!(normalize_tmi_rate(Some("11%")), Some(11));
        assert_eq!(normalize_tmi_rate(Some("TMI 30")), Some(30));
        assert_eq!(normalize_tmi_rate(Some("0")), Some(0));
        assert_eq!(normalize_tmi_rate(Some("12")), None);
        assert_eq!(normalize_tmi_rate(Some("")), None);
    }

    #[test]
    fn compare_ir_net_ops() {
        assert!(compare_ir_net(4000.0, "gte", 4000.0));
        assert!(compare_ir_net(5000.0, "gte", 4000.0));
        assert!(!compare_ir_net(3999.0, "gte", 4000.0));
        assert!(compare_ir_net(3000.0, "lte", 4000.0));
        assert!(compare_ir_net(4000.0, "eq", 4000.0));
    }

    #[test]
    fn revenus_annuels_contact_then_foyer_fallback() {
        use super::super::models::NewContact;
        let db = super::super::Database::open_in_memory_for_tests().unwrap();
        let c = NewContact {
            nom: "DUPONT".into(),
            prenom: "Jean".into(),
            email: Some("j@example.com".into()),
            revenus_annuels: Some(65_000.0),
            ..Default::default()
        };
        let created = db.create_contact(c).unwrap();
        let contact = db.get_contact_by_id(created.id.unwrap()).unwrap();
        let cfg = r#"{"operator":"gte","montant":60000}"#.to_string();
        assert!(
            db.contact_matches_revenus_annuels_condition(&contact, Some(&cfg))
                .unwrap()
        );

        let c2 = NewContact {
            nom: "MARTIN".into(),
            prenom: "Paul".into(),
            email: Some("p@example.com".into()),
            revenus_annuels: Some(50_000.0),
            ..Default::default()
        };
        let created2 = db.create_contact(c2).unwrap();
        let contact2 = db.get_contact_by_id(created2.id.unwrap()).unwrap();
        assert!(
            !db.contact_matches_revenus_annuels_condition(&contact2, Some(&cfg))
                .unwrap()
        );
    }
}
