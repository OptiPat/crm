//! Arbre de règles v1 (ET / OU) + feuilles (6 types historiques + A_ETIQUETTE, JAMAIS_CONTACT).

use super::{models::Contact, Database};
use rusqlite::Result;
use serde::{Deserialize, Serialize};
use serde_json::Value;

const RULE_VERSION: i64 = 1;

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(untagged)]
pub enum RuleNode {
    Tree {
        #[serde(default = "default_v")]
        v: i64,
        op: String,
        children: Vec<RuleNode>,
    },
    Leaf {
        #[serde(rename = "type")]
        condition_type: String,
        #[serde(default)]
        config: Value,
        #[serde(default)]
        categories: Vec<String>,
    },
}

fn default_v() -> i64 {
    RULE_VERSION
}

/// Règle effective pour une étiquette ou un segment.
#[derive(Debug, Clone)]
pub struct EffectiveAutoRule {
    pub tree: RuleNode,
}

impl Database {
    /// Construit l'arbre depuis une étiquette (segment lié > RULE_TREE > legacy type+config).
    pub fn resolve_etiquette_auto_rule(
        &self,
        etiquette: &super::models::Etiquette,
    ) -> Result<Option<EffectiveAutoRule>> {
        if let Some(segment_id) = etiquette.segment_id {
            if let Some(seg) = self.get_segment_by_id(segment_id)? {
                if seg.actif {
                    return Ok(Some(EffectiveAutoRule {
                        tree: parse_rule_json(Some(&seg.rule_json), None, None, None)?,
                    }));
                }
                return Ok(None);
            }
        }
        if etiquette.auto_condition_type.as_deref() == Some("RULE_TREE") {
            if let Some(cfg) = etiquette.auto_condition_config.as_ref() {
                return Ok(Some(EffectiveAutoRule {
                    tree: parse_rule_json(
                        Some(cfg),
                        etiquette.auto_condition_type.as_deref(),
                        etiquette.auto_condition_config.as_deref(),
                        etiquette.auto_categories.as_deref(),
                    )?,
                }));
            }
            return Ok(None);
        }
        if let Some(t) = etiquette.auto_condition_type.as_ref() {
            if t.trim().is_empty() {
                return Ok(None);
            }
            return Ok(Some(EffectiveAutoRule {
                tree: legacy_leaf_from_etiquette(etiquette)?,
            }));
        }
        Ok(None)
    }

    pub fn contact_matches_rule_tree(
        &self,
        contact: &Contact,
        tree: &RuleNode,
        now: i64,
        current_month: i32,
        organisation_self_id: Option<i64>,
    ) -> Result<bool> {
        match tree {
            RuleNode::Tree { op, children, .. } => {
                if children.is_empty() {
                    return Ok(false);
                }
                let op = op.to_ascii_lowercase();
                if op == "or" {
                    for child in children {
                        if self.contact_matches_rule_tree(
                            contact,
                            child,
                            now,
                            current_month,
                            organisation_self_id,
                        )? {
                            return Ok(true);
                        }
                    }
                    return Ok(false);
                }
                // défaut : AND
                for child in children {
                    if !self.contact_matches_rule_tree(
                        contact,
                        child,
                        now,
                        current_month,
                        organisation_self_id,
                    )? {
                        return Ok(false);
                    }
                }
                Ok(true)
            }
            RuleNode::Leaf {
                condition_type,
                config,
                categories,
            } => {
                let contact_id = match contact.id {
                    Some(id) => id,
                    None => return Ok(false),
                };
                if categories.is_empty() {
                    return Ok(false);
                }
                if !Self::contact_matches_auto_categories(
                    contact,
                    categories,
                    organisation_self_id,
                ) {
                    return Ok(false);
                }
                let config_str = serde_json::to_string(config).ok();
                let cfg_ref = config_str.as_ref();
                self.evaluate_auto_etiquette_condition(
                    contact,
                    contact_id,
                    condition_type,
                    cfg_ref,
                    categories,
                    now,
                    current_month,
                )
            }
        }
    }

    /// Un contact correspond-il au segment ?
    pub fn contact_matches_segment(
        &self,
        contact: &Contact,
        segment_id: i64,
    ) -> Result<bool> {
        let seg = self.get_segment_by_id(segment_id)?;
        let Some(seg) = seg else {
            return Ok(false);
        };
        if !seg.actif {
            return Ok(false);
        }
        if contact.statut_suivi == "ARCHIVE" || contact.statut_suivi == "EN_PAUSE" {
            return Ok(false);
        }
        let tree = parse_rule_json(Some(&seg.rule_json), None, None, None)?;
        let (now, current_month) = Self::auto_etiquette_now_and_month();
        let org_self_id = self.resolve_organisation_self_contact_id()?;
        self.contact_matches_rule_tree(contact, &tree, now, current_month, org_self_id)
    }

    /// Compte les contacts correspondant à un segment (hors archive/pause).
    pub fn count_contacts_for_segment(&self, segment_id: i64) -> Result<i64> {
        let contacts = self.get_all_contacts()?;
        let mut n = 0i64;
        for c in &contacts {
            if self.contact_matches_segment(c, segment_id)? {
                n += 1;
            }
        }
        Ok(n)
    }

    #[cfg(test)]
    pub fn evaluate_rule_tree_for_contact(
        &self,
        contact_id: i64,
        rule_json: &str,
    ) -> Result<bool> {
        let contact = self.get_contact_by_id(contact_id)?;
        let tree = parse_rule_json(Some(&rule_json.to_string()), None, None, None)?;
        let (now, current_month) = Self::auto_etiquette_now_and_month();
        let org_self_id = self.resolve_organisation_self_contact_id()?;
        self.contact_matches_rule_tree(&contact, &tree, now, current_month, org_self_id)
    }
}

pub fn parse_rule_json(
    rule_json: Option<&String>,
    legacy_type: Option<&str>,
    legacy_config: Option<&str>,
    legacy_categories: Option<&str>,
) -> Result<RuleNode, rusqlite::Error> {
    if let Some(raw) = rule_json {
        if let Ok(node) = serde_json::from_str::<RuleNode>(raw) {
            return Ok(node);
        }
        if let Ok(v) = serde_json::from_str::<Value>(raw) {
            if v.get("v").is_some() || v.get("op").is_some() || v.get("children").is_some() {
                if let Ok(node) = serde_json::from_value::<RuleNode>(v) {
                    return Ok(node);
                }
            }
        }
    }
    if let Some(t) = legacy_type {
        if !t.trim().is_empty() && t != "RULE_TREE" {
            let cats: Vec<String> = legacy_categories
                .and_then(|c| serde_json::from_str(c).ok())
                .unwrap_or_default();
            let cfg: Value = legacy_config
                .and_then(|c| serde_json::from_str(c).ok())
                .unwrap_or(Value::Object(Default::default()));
            return Ok(RuleNode::Leaf {
                condition_type: t.to_string(),
                config: cfg,
                categories: cats,
            });
        }
    }
    Err(rusqlite::Error::InvalidParameterName(
        "Règle invalide ou vide".to_string(),
    ))
}

fn legacy_leaf_from_etiquette(
    etiquette: &super::models::Etiquette,
) -> Result<RuleNode, rusqlite::Error> {
    let t = etiquette
        .auto_condition_type
        .as_deref()
        .unwrap_or("")
        .to_string();
    let cats: Vec<String> = etiquette
        .auto_categories
        .as_ref()
        .and_then(|c| serde_json::from_str(c).ok())
        .unwrap_or_default();
    let cfg: Value = etiquette
        .auto_condition_config
        .as_ref()
        .and_then(|c| serde_json::from_str(c).ok())
        .unwrap_or(Value::Object(Default::default()));
    Ok(RuleNode::Leaf {
        condition_type: t,
        config: cfg,
        categories: cats,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parse_legacy_leaf() {
        let node = parse_rule_json(
            None,
            Some("DELAI_SANS_CONTACT"),
            Some(r#"{"jours":365}"#),
            Some(r#"["CLIENT"]"#),
        )
        .unwrap();
        match node {
            RuleNode::Leaf { condition_type, .. } => {
                assert_eq!(condition_type, "DELAI_SANS_CONTACT");
            }
            _ => panic!("expected leaf"),
        }
    }

    #[test]
    fn parse_and_tree() {
        let raw = r#"{"v":1,"op":"and","children":[{"type":"DELAI_SANS_CONTACT","config":{"jours":180},"categories":["CLIENT"]},{"type":"TYPE_PRODUIT","config":{"types":["SCPI"]},"categories":["CLIENT"]}]}"#;
        let node = parse_rule_json(Some(&raw.to_string()), None, None, None).unwrap();
        match node {
            RuleNode::Tree { children, .. } => assert_eq!(children.len(), 2),
            _ => panic!("expected tree"),
        }
    }
}
