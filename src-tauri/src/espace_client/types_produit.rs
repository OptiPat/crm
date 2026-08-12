//! Classement des types de produit — source unique côté Rust.
//!
//! Ces listes doivent rester identiques à celles du CRM en TypeScript :
//! `IMMOBILIER_TYPES` de `investissement-display.ts` et
//! `SCPI_VALORISATION_TYPES` de `investissement-encours.ts`. Le test
//! `immobilier-types-alignes.test.ts` compare les fichiers et échoue si un type
//! est ajouté d'un seul côté — l'oublier ici ferait silencieusement disparaître
//! le loyer ou le revenu qu'un client vient de saisir.
//!
//! Le portail, lui, ne tient aucune liste : la photo lui transmet le caractère
//! immobilier et SCPI de chaque ligne (`estImmobilier`, `estScpi`). Les
//! « placements financiers » n'ont pas de liste — ils sont le complément, donc
//! rien ne peut y être oublié.

pub const IMMOBILIER_TYPES: [&str; 25] = [
    "IMMOBILIER",
    "LMNP",
    "LMP",
    "PINEL",
    "MALRAUX",
    "DENORMANDIE",
    "JEANBRUN",
    "BESSON",
    "SCELLIER",
    "ROBIEN",
    "MEHAIGNERIE",
    "PERISSOL",
    "DUFLOT",
    "BORLOO",
    "RP",
    "RS",
    "DEFICIT_FONCIER",
    "MONUMENT_HISTORIQUE",
    "LOCATIF",
    "LOCATIF_CLASSIQUE",
    "NUE_PROPRIETE",
    "RESIDENCE_PRINCIPALE",
    "COLOCATION",
    "MONOLOCATION",
    "SCI",
];

pub fn is_immobilier_type(type_produit: &str) -> bool {
    IMMOBILIER_TYPES.contains(&type_produit)
}

/// SCPI, quelle que soit l'origine : ce sont les seules lignes qui portent un
/// revenu perçu déclarable par le client.
pub const SCPI_TYPES: [&str; 3] = ["SCPI", "SCPI_DEMEMBREMENT", "SCPI_FISCALE"];

pub fn is_scpi_type(type_produit: &str) -> bool {
    SCPI_TYPES.contains(&type_produit)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn recognises_the_main_immobilier_types() {
        assert!(is_immobilier_type("LMNP"));
        assert!(is_immobilier_type("MALRAUX"));
        assert!(is_immobilier_type("SCI"));
        assert!(!is_immobilier_type("SCPI"));
        assert!(!is_immobilier_type("ASSURANCE_VIE"));
        assert!(!is_immobilier_type(""));
    }

    #[test]
    fn recognises_the_scpi_types() {
        assert!(is_scpi_type("SCPI"));
        assert!(is_scpi_type("SCPI_FISCALE"));
        assert!(is_scpi_type("SCPI_DEMEMBREMENT"));
        assert!(!is_scpi_type("SCI"), "société civile immobilière, pas SCPI");
        assert!(!is_scpi_type(""));
    }

    /// Une entrée en double passerait inaperçue et fausserait la comparaison
    /// avec les listes TypeScript.
    #[test]
    fn the_lists_have_no_duplicate() {
        for liste in [IMMOBILIER_TYPES.as_slice(), SCPI_TYPES.as_slice()] {
            let mut vus = std::collections::HashSet::new();
            for type_produit in liste {
                assert!(vus.insert(type_produit), "{type_produit} en double");
            }
        }
    }

    /// Un type ne peut pas être immobilier et SCPI : les deux drapeaux
    /// commandent des champs différents dans le formulaire client.
    #[test]
    fn the_two_lists_do_not_overlap() {
        for type_produit in SCPI_TYPES {
            assert!(
                !is_immobilier_type(type_produit),
                "{type_produit} classé dans les deux listes"
            );
        }
    }
}
