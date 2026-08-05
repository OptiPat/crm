//! Table de comparabilité des catégories Cristalliance.
//!
//! Source unique de vérité partagée avec le diagnostic frontend : le même fichier JSON est lu
//! ici (`include_str!`) et par `src/lib/fund-watchlist/fund-watchlist-diagnostic-thresholds.ts`.
//! Décisions de regroupement documentées dans `docs/CATEGORIES-VEILLE-FONDS.md`.

use serde::Deserialize;
use std::collections::{HashMap, HashSet};
use std::sync::OnceLock;

const TABLE_JSON: &str = include_str!("../../../src/lib/fund-watchlist/fund-categories.json");

/// Normalisation commune aux deux moteurs (doit rester identique à
/// `normalizeFundWatchlistCategory` côté TypeScript).
pub(super) fn normalize_category(raw: &str) -> String {
    raw.trim()
        .to_lowercase()
        .replace('’', "'")
        .replace(['é', 'è', 'ê', 'ë'], "e")
        .replace(['à', 'â'], "a")
        .replace(['ù', 'û'], "u")
        .replace(['î', 'ï'], "i")
        .replace(['ô', 'ö'], "o")
        .replace('ç', "c")
}

#[derive(Deserialize)]
struct RawFamily {
    key: String,
    label: String,
    /// `actions` | `diversified` | `rates` : profil de repli quand la volatilité 3 ans mesurée
    /// manque. Même champ que celui lu côté TypeScript, donc jamais deux tables à maintenir.
    volatility: String,
    categories: Vec<String>,
}

#[derive(Deserialize)]
struct RawTable {
    #[serde(default)]
    excluded: Vec<String>,
    families: Vec<RawFamily>,
}

struct CategoryTable {
    family_by_label: HashMap<String, String>,
    label_by_family: HashMap<String, String>,
    volatility_by_family: HashMap<String, String>,
    excluded: HashSet<String>,
}

fn table() -> &'static CategoryTable {
    static TABLE: OnceLock<CategoryTable> = OnceLock::new();
    TABLE.get_or_init(|| {
        let raw: RawTable = serde_json::from_str(TABLE_JSON)
            .expect("fund-categories.json invalide (table de comparabilité)");
        let mut family_by_label = HashMap::new();
        let mut label_by_family = HashMap::new();
        let mut volatility_by_family = HashMap::new();
        for family in raw.families {
            for categorie in &family.categories {
                family_by_label.insert(normalize_category(categorie), family.key.clone());
            }
            volatility_by_family.insert(family.key.clone(), family.volatility);
            label_by_family.insert(family.key, family.label);
        }
        CategoryTable {
            family_by_label,
            label_by_family,
            volatility_by_family,
            excluded: raw.excluded.iter().map(|c| normalize_category(c)).collect(),
        }
    })
}

/// Famille explicite d'un libellé déjà normalisé, `None` si la table ne le connaît pas.
pub(super) fn family_for_normalized(normalized: &str) -> Option<&'static str> {
    table().family_by_label.get(normalized).map(String::as_str)
}

/// Libellé lisible d'une famille de la table, `None` pour les clés issues des mots-clés.
pub(super) fn label_for_family(key: &str) -> Option<&'static str> {
    table().label_by_family.get(key).map(String::as_str)
}

/// Profil de volatilité de repli d'un libellé Cristalliance (`actions` / `diversified` / `rates`),
/// `None` si la table ne connaît pas le libellé.
pub(crate) fn volatility_class_for_category(raw: &str) -> Option<&'static str> {
    let family = table().family_by_label.get(&normalize_category(raw))?;
    table().volatility_by_family.get(family).map(String::as_str)
}

/// Catégories sans diagnostic ni comparaison possible (valorisation lissée).
pub(super) fn is_excluded_normalized(normalized: &str) -> bool {
    table().excluded.contains(normalized)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn loads_table_and_resolves_families() {
        assert_eq!(
            family_for_normalized(&normalize_category("Actions France Grandes Cap.")),
            Some("actions_europe_grandes")
        );
        assert_eq!(
            family_for_normalized(&normalize_category("Actions Europe Petites Cap.")),
            Some("actions_europe_petites_moyennes")
        );
        assert_eq!(family_for_normalized("libelle inconnu"), None);
    }

    #[test]
    fn separates_labels_the_keyword_rules_confused() {
        let bond = family_for_normalized(&normalize_category("Global Diversified Bond"));
        let alloc = family_for_normalized(&normalize_category("Allocation EUR Flexible"));
        assert!(bond.is_some() && alloc.is_some());
        assert_ne!(bond, alloc);

        let immo = family_for_normalized(&normalize_category("Immobilier - Indirect Zone Euro"));
        let equity = family_for_normalized(&normalize_category("Actions Zone Euro Grandes Cap."));
        assert_ne!(immo, equity);
    }

    #[test]
    fn exposes_family_labels_and_exclusions() {
        assert_eq!(
            label_for_family("actions_europe_grandes"),
            Some("Actions Europe grandes cap.")
        );
        assert_eq!(label_for_family("cle_inexistante"), None);
        assert!(is_excluded_normalized(&normalize_category("FCPR")));
        assert!(!is_excluded_normalized(&normalize_category("Actions Italie")));
        assert_eq!(
            volatility_class_for_category("Actions France Grandes Cap."),
            Some("actions")
        );
        assert_eq!(
            volatility_class_for_category("Obligations EUR Très Court Terme"),
            Some("rates")
        );
        assert_eq!(volatility_class_for_category("libelle inconnu"), None);
    }
}
