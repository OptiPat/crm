//! Génération des brouillons SMS anniversaire (port de `scripts/n8n-anniversaires-templates.js`).

use crate::database::birthdays::BirthdayContactToday;
use rand::seq::SliceRandom;

use super::message_settings::{BirthdayMessageProfileBodies, BirthdayMessageSettingsPayload};

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Genre {
    M,
    F,
    N,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Registre {
    Tu,
    Vous,
}

#[derive(Debug, Clone)]
pub struct BirthdayDraft {
    #[allow(dead_code)]
    pub contact_id: i64,
    pub name: String,
    pub message: String,
}

pub fn genre_from_civilite(civilite: Option<&str>) -> Genre {
    match civilite.unwrap_or("").trim().to_uppercase().as_str() {
        "MME" => Genre::F,
        "M" => Genre::M,
        _ => Genre::N,
    }
}

pub fn normalize_registre(registre: &str) -> Registre {
    if registre.trim().eq_ignore_ascii_case("TU") {
        Registre::Tu
    } else {
        Registre::Vous
    }
}

fn extract_prenom(prenom: &str, display_name: &str) -> String {
    let source = if prenom.trim().is_empty() {
        display_name.trim()
    } else {
        prenom.trim()
    };
    source
        .split_whitespace()
        .next()
        .unwrap_or("ami")
        .to_string()
}

pub const PRENOM_PLACEHOLDER: &str = "{prenom}";

fn salutation(registre: Registre, prenom: &str) -> String {
    match registre {
        Registre::Tu => format!("Salut {prenom}"),
        Registre::Vous => format!("Bonjour {prenom}"),
    }
}

fn closing_line(registre: Registre) -> &'static str {
    match registre {
        Registre::Tu => "À très vite.",
        Registre::Vous => "À bientôt.",
    }
}

/// Message complet (salutation + corps + formule), sans emoji (SMS / WhatsApp).
fn compose_message(prenom: &str, registre: Registre, body: &str) -> String {
    let sal = salutation(registre, prenom);
    format!(
        "{sal}, joyeux anniversaire !\n{body}\n{}",
        closing_line(registre)
    )
}

/// Variante éditables : message complet avec `{prenom}` (pas corps seul).
pub fn is_full_variant_template(text: &str) -> bool {
    text.lines()
        .next()
        .unwrap_or("")
        .trim()
        .contains("joyeux anniversaire")
}

pub fn wrap_body_as_full_variant(body: &str, registre: Registre) -> String {
    let body = body.trim();
    if body.is_empty() {
        return String::new();
    }
    if is_full_variant_template(body) {
        return body.to_string();
    }
    compose_message(PRENOM_PLACEHOLDER, registre, body)
}

pub fn apply_variant_template(template: &str, prenom: &str) -> String {
    template
        .replace(PRENOM_PLACEHOLDER, prenom)
        .trim()
        .to_string()
}

fn angle_performance(prenom: &str, registre: Registre, genre: Genre) -> String {
    let body = match (registre, genre) {
        (Registre::Tu, Genre::F) => {
            "Si ton sourire et ton expérience étaient un actif financier, le rendement de cette année ferait sauter la banque !"
        }
        (Registre::Vous, Genre::F) => {
            "Si votre sourire et votre expérience étaient un actif financier, le rendement de cette année ferait sauter la banque !"
        }
        (Registre::Tu, _) => {
            "Si ton expérience et ta présence étaient un actif financier, le rendement de cette année ferait sauter la banque !"
        }
        (Registre::Vous, _) => {
            "Si votre expérience et votre présence étaient un actif financier, le rendement de cette année ferait sauter la banque !"
        }
    };
    compose_message(prenom, registre, body)
}

fn angle_fiscal(prenom: &str, registre: Registre, genre: Genre) -> String {
    let intro = "S'il y avait un impôt sur l'élégance qui augmente chaque année, ";
    let body = match (registre, genre) {
        (Registre::Tu, Genre::F) => {
            format!("{intro}tu serais lourdement taxée pour cause de surperformance !")
        }
        (Registre::Tu, Genre::M) => {
            format!("{intro}tu serais lourdement taxé pour cause de surperformance !")
        }
        (Registre::Tu, Genre::N) => {
            format!("{intro}ta surperformance te placerait dans la tranche la plus élevée !")
        }
        (Registre::Vous, Genre::F) => {
            format!("{intro}vous seriez lourdement taxée pour cause de surperformance !")
        }
        (Registre::Vous, Genre::M) => {
            format!("{intro}vous seriez lourdement taxé pour cause de surperformance !")
        }
        (Registre::Vous, Genre::N) => {
            format!("{intro}votre surperformance vous placerait dans la tranche la plus élevée !")
        }
    };
    compose_message(prenom, registre, &body)
}

fn angle_sympathie(prenom: &str, registre: Registre, genre: Genre) -> String {
    let intro =
        "Heureusement que le capital sympathie est totalement exonéré d'impôt, car ";
    let body = match (registre, genre) {
        (Registre::Tu, Genre::F) => format!(
            "{intro}ta surperformance de l'année t'aurait rendue lourdement imposable !"
        ),
        (Registre::Vous, Genre::F) => format!(
            "{intro}votre surperformance de l'année vous aurait rendue lourdement imposable !"
        ),
        (Registre::Tu, _) => {
            format!("{intro}ta surperformance de l'année t'aurait rendu lourdement imposable !")
        }
        (Registre::Vous, _) => format!(
            "{intro}votre surperformance de l'année vous aurait rendu lourdement imposable !"
        ),
    };
    compose_message(prenom, registre, &body)
}

fn angle_inflation(prenom: &str, registre: Registre) -> String {
    let body = match registre {
        Registre::Tu => {
            "Si le temps qui passe était soumis à l'inflation, ton énergie et ta bonne humeur resteraient le meilleur moyen de protéger ton capital !"
        }
        Registre::Vous => {
            "Si le temps qui passe était soumis à l'inflation, votre énergie et votre bonne humeur resteraient le meilleur moyen de protéger votre capital !"
        }
    };
    compose_message(prenom, registre, body)
}

fn angle_prestige(prenom: &str, registre: Registre) -> String {
    compose_message(
        prenom,
        registre,
        "C'est le propre des très grands investissements : chaque année qui passe ajoute une couche de prestige et de valeur !",
    )
}

fn angle_capital_temps(prenom: &str, registre: Registre) -> String {
    let body = match registre {
        Registre::Tu => {
            "Ton capital temps produit des intérêts composés depuis des années, et aujourd'hui le rendement est juste historique !"
        }
        Registre::Vous => {
            "Votre capital temps produit des intérêts composés depuis des années, et aujourd'hui le rendement est juste historique !"
        }
    };
    compose_message(prenom, registre, body)
}

type AngleFn = fn(&str, Registre, Genre) -> String;

fn build_angle_pool(genre: Genre) -> Vec<AngleFn> {
    let mut pool: Vec<AngleFn> = vec![
        angle_performance,
        angle_fiscal,
        |p, r, _| angle_capital_temps(p, r),
        |p, r, _| angle_inflation(p, r),
        |p, r, _| angle_prestige(p, r),
    ];
    if matches!(genre, Genre::M | Genre::F) {
        pool.push(angle_sympathie);
    }
    pool
}

fn custom_bodies_for<'a>(
    settings: &'a BirthdayMessageSettingsPayload,
    registre: Registre,
    genre: Genre,
) -> &'a [String] {
    let profile = &settings.profile;
    let primary: &[String] = match (registre, genre) {
        (Registre::Tu, Genre::M) => &profile.tu_m,
        (Registre::Tu, Genre::F) => &profile.tu_f,
        (Registre::Tu, Genre::N) => &profile.tu_n,
        (Registre::Vous, Genre::M) => &profile.vous_m,
        (Registre::Vous, Genre::F) => &profile.vous_f,
        (Registre::Vous, Genre::N) => &profile.vous_n,
    };
    if !primary.is_empty() {
        return primary;
    }
    match (registre, genre) {
        (Registre::Tu, Genre::N) if !profile.tu_m.is_empty() => &profile.tu_m,
        (Registre::Tu, Genre::N) if !profile.tu_f.is_empty() => &profile.tu_f,
        (Registre::Vous, Genre::N) if !profile.vous_m.is_empty() => &profile.vous_m,
        (Registre::Vous, Genre::N) if !profile.vous_f.is_empty() => &profile.vous_f,
        (Registre::Tu, _) if !settings.bodies_tu.is_empty() => &settings.bodies_tu,
        (Registre::Vous, _) if !settings.bodies_vous.is_empty() => &settings.bodies_vous,
        _ => &[],
    }
}

fn builtin_bodies_for(registre: Registre, genre: Genre) -> Vec<String> {
    let profile = list_builtin_bodies_full();
    match (registre, genre) {
        (Registre::Tu, Genre::M) => profile.tu_m,
        (Registre::Tu, Genre::F) => profile.tu_f,
        (Registre::Tu, Genre::N) => profile.tu_n,
        (Registre::Vous, Genre::M) => profile.vous_m,
        (Registre::Vous, Genre::F) => profile.vous_f,
        (Registre::Vous, Genre::N) => profile.vous_n,
    }
}

fn try_builtin_profile_template(
    prenom: &str,
    registre: Registre,
    genre: Genre,
    rng: &mut impl rand::Rng,
) -> Option<String> {
    let bodies = builtin_bodies_for(registre, genre);
    let template = bodies.choose(rng)?;
    Some(apply_variant_template(template, prenom))
}

fn try_custom_message(
    prenom: &str,
    registre: Registre,
    genre: Genre,
    settings: &BirthdayMessageSettingsPayload,
    rng: &mut impl rand::Rng,
) -> Option<String> {
    if !settings.use_custom {
        return None;
    }
    let bodies = custom_bodies_for(settings, registre, genre);
    let template = bodies.choose(rng)?;
    let full = wrap_body_as_full_variant(template, registre);
    Some(apply_variant_template(&full, prenom))
}

pub fn generate_message(
    prenom: &str,
    registre: Registre,
    genre: Genre,
    rng: &mut impl rand::Rng,
    settings: &BirthdayMessageSettingsPayload,
) -> String {
    if settings.use_custom {
        if let Some(msg) = try_custom_message(prenom, registre, genre, settings, rng) {
            return msg;
        }
        // Tranche profil vide : intégrés de la même tranche (pas les angles live).
        if let Some(msg) = try_builtin_profile_template(prenom, registre, genre, rng) {
            return msg;
        }
    }
    let pool = build_angle_pool(genre);
    let angle = pool.choose(rng).copied().unwrap_or(angle_performance);
    angle(prenom, registre, genre)
}

pub fn generate_draft(
    contact: &BirthdayContactToday,
    rng: &mut impl rand::Rng,
    settings: &BirthdayMessageSettingsPayload,
) -> BirthdayDraft {
    let prenom = extract_prenom(&contact.prenom, &contact.display_name);
    let registre = normalize_registre(&contact.registre);
    let genre = genre_from_civilite(contact.civilite.as_deref());
    let message = generate_message(&prenom, registre, genre, rng, settings);
    let name = if contact.display_name.trim().is_empty() {
        format!("{} {}", contact.prenom.trim(), contact.nom.trim())
            .trim()
            .to_string()
    } else {
        contact.display_name.clone()
    };
    BirthdayDraft {
        contact_id: contact.id,
        name,
        message,
    }
}

pub fn format_telegram_notification(name: &str, message: &str) -> String {
    format!("Anniversaire : {name}\n\n{message}")
}

/// Toutes les variantes intégrées (aperçu UI), sans tirage aléatoire.
pub fn list_builtin_previews() -> (Vec<String>, Vec<String>) {
    let tu: Vec<String> = build_angle_pool(Genre::M)
        .iter()
        .map(|angle| angle("Paul", Registre::Tu, Genre::M))
        .collect();
    let vous: Vec<String> = build_angle_pool(Genre::F)
        .iter()
        .map(|angle| angle("Alice", Registre::Vous, Genre::F))
        .collect();
    (tu, vous)
}

fn list_builtin_bodies_for(registre: Registre, genre: Genre) -> Vec<String> {
    build_angle_pool(genre)
        .iter()
        .map(|angle| angle(PRENOM_PLACEHOLDER, registre, genre))
        .collect()
}

/// Corps éditables par registre (tu/vous) et genre (M/F/N).
pub fn list_builtin_bodies_full() -> BirthdayMessageProfileBodies {
    BirthdayMessageProfileBodies {
        tu_m: list_builtin_bodies_for(Registre::Tu, Genre::M),
        tu_f: list_builtin_bodies_for(Registre::Tu, Genre::F),
        tu_n: list_builtin_bodies_for(Registre::Tu, Genre::N),
        vous_m: list_builtin_bodies_for(Registre::Vous, Genre::M),
        vous_f: list_builtin_bodies_for(Registre::Vous, Genre::F),
        vous_n: list_builtin_bodies_for(Registre::Vous, Genre::N),
    }
}

/// Legacy — tu masculin, vous féminin (messages complets).
#[allow(dead_code)]
pub fn list_builtin_bodies() -> (Vec<String>, Vec<String>) {
    let profile = list_builtin_bodies_full();
    (profile.tu_m.clone(), profile.vous_f.clone())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn list_builtin_bodies_full_has_six_per_profile() {
        let profile = list_builtin_bodies_full();
        assert_eq!(profile.tu_m.len(), 6);
        assert_eq!(profile.tu_f.len(), 6);
        assert_eq!(profile.tu_n.len(), 5);
        assert_ne!(profile.tu_m[0], profile.tu_f[0]);
    }

    #[test]
    fn custom_message_uses_gender_profile() {
        use super::super::message_settings::BirthdayMessageProfileBodies;
        let settings = BirthdayMessageSettingsPayload {
            use_custom: true,
            bodies_tu: vec![],
            bodies_vous: vec![],
            profile: BirthdayMessageProfileBodies {
                tu_f: vec!["Corps féminin tu.".into()],
                ..Default::default()
            },
        };
        use rand::SeedableRng;
        let mut rng = rand::rngs::StdRng::seed_from_u64(1);
        let msg = try_custom_message("Alice", Registre::Tu, Genre::F, &settings, &mut rng);
        assert!(msg.unwrap().contains("Corps féminin tu."));
    }

    #[test]
    fn list_builtin_bodies_include_salutation_and_closing() {
        let profile = list_builtin_bodies_full();
        assert!(profile.tu_m[0].starts_with("Salut {prenom}, joyeux anniversaire !"));
        assert!(profile.tu_m[0].ends_with("À très vite."));
        assert!(profile.vous_f[0].starts_with("Bonjour {prenom}, joyeux anniversaire !"));
        assert!(profile.vous_f[0].ends_with("À bientôt."));
    }

    #[test]
    fn list_builtin_previews_exposes_six_variants_per_registre() {
        let (tu, vous) = list_builtin_previews();
        assert_eq!(tu.len(), 6);
        assert_eq!(vous.len(), 6);
        assert!(tu[0].starts_with("Salut Paul, joyeux anniversaire !"));
        assert!(vous[0].starts_with("Bonjour Alice, joyeux anniversaire !"));
    }

    #[test]
    fn genre_from_civilite_maps_mme_and_m() {
        assert_eq!(genre_from_civilite(Some("MME")), Genre::F);
        assert_eq!(genre_from_civilite(Some("M")), Genre::M);
        assert_eq!(genre_from_civilite(None), Genre::N);
    }

    #[test]
    fn angle_fiscal_tu_male_multiline_without_emoji() {
        let msg = angle_fiscal("Bruno", Registre::Tu, Genre::M);
        assert_eq!(
            msg,
            "Salut Bruno, joyeux anniversaire !\n\
             S'il y avait un impôt sur l'élégance qui augmente chaque année, \
             tu serais lourdement taxé pour cause de surperformance !\n\
             À très vite."
        );
        assert!(!msg.contains('📈'));
        assert!(!msg.contains('🥂'));
    }

    #[test]
    fn angle_fiscal_vous_feminine() {
        let msg = angle_fiscal("Alice", Registre::Vous, Genre::F);
        assert!(msg.contains("taxée"));
        assert!(msg.starts_with("Bonjour Alice, joyeux anniversaire !\n"));
        assert!(msg.ends_with("À bientôt."));
    }

    #[test]
    fn angle_sympathie_only_for_binary_genre_in_pool() {
        let pool_m = build_angle_pool(Genre::M);
        let pool_n = build_angle_pool(Genre::N);
        assert_eq!(pool_m.len(), 6);
        assert_eq!(pool_n.len(), 5);
    }

    #[test]
    fn custom_body_replaces_prenom_in_full_template() {
        use rand::SeedableRng;
        let settings = BirthdayMessageSettingsPayload {
            use_custom: true,
            bodies_tu: vec![],
            bodies_vous: vec![],
            profile: {
                use super::super::message_settings::BirthdayMessageProfileBodies;
                BirthdayMessageProfileBodies {
                    tu_m: vec![
                        "Salut {prenom}, joyeux anniversaire !\nProfite bien de ta journée {prenom} !\nÀ très vite."
                            .into(),
                    ],
                    ..Default::default()
                }
            },
        };
        let mut rng = rand::rngs::StdRng::seed_from_u64(1);
        let msg = generate_message("Paul", Registre::Tu, Genre::M, &mut rng, &settings);
        assert_eq!(
            msg,
            "Salut Paul, joyeux anniversaire !\nProfite bien de ta journée Paul !\nÀ très vite."
        );
    }

    #[test]
    fn custom_body_only_legacy_wraps_salutation_closing() {
        use rand::SeedableRng;
        let settings = BirthdayMessageSettingsPayload {
            use_custom: true,
            bodies_tu: vec!["Profite bien de ta journée {prenom} !".into()],
            bodies_vous: vec![],
            profile: BirthdayMessageProfileBodies::default(),
        };
        let mut rng = rand::rngs::StdRng::seed_from_u64(1);
        let msg = generate_message("Paul", Registre::Tu, Genre::M, &mut rng, &settings);
        assert_eq!(
            msg,
            "Salut Paul, joyeux anniversaire !\nProfite bien de ta journée Paul !\nÀ très vite."
        );
    }

    #[test]
    fn custom_mode_empty_slice_uses_builtin_profile_templates() {
        use rand::SeedableRng;
        let settings = BirthdayMessageSettingsPayload {
            use_custom: true,
            bodies_tu: vec![],
            bodies_vous: vec![],
            profile: BirthdayMessageProfileBodies {
                tu_m: vec!["Salut {prenom}, joyeux anniversaire !\nPerso tu.\nÀ très vite.".into()],
                ..Default::default()
            },
        };
        let mut rng = rand::rngs::StdRng::seed_from_u64(99);
        let msg = generate_message("Alice", Registre::Vous, Genre::F, &mut rng, &settings);
        assert!(msg.starts_with("Bonjour Alice, joyeux anniversaire !"));
        assert!(!msg.contains("Perso tu."));
    }

    #[test]
    fn custom_vous_picks_vous_list() {
        use rand::SeedableRng;
        let settings = BirthdayMessageSettingsPayload {
            use_custom: true,
            bodies_tu: vec![],
            bodies_vous: vec!["Belle journée à vous.".into()],
            profile: BirthdayMessageProfileBodies::default(),
        };
        let mut rng = rand::rngs::StdRng::seed_from_u64(1);
        let msg = generate_message("Alice", Registre::Vous, Genre::F, &mut rng, &settings);
        assert!(msg.starts_with("Bonjour Alice, joyeux anniversaire !"));
        assert!(msg.contains("Belle journée à vous."));
    }

    #[test]
    fn generate_message_is_deterministic_with_seeded_rng() {
        use rand::SeedableRng;
        let settings = BirthdayMessageSettingsPayload::default();
        let mut rng1 = rand::rngs::StdRng::seed_from_u64(42);
        let mut rng2 = rand::rngs::StdRng::seed_from_u64(42);
        let m1 = generate_message("Paul", Registre::Tu, Genre::M, &mut rng1, &settings);
        let m2 = generate_message("Paul", Registre::Tu, Genre::M, &mut rng2, &settings);
        assert_eq!(m1, m2);
        assert!(m1.starts_with("Salut Paul, joyeux anniversaire !\n"));
    }

    #[test]
    fn telegram_format_matches_n8n() {
        let text = format_telegram_notification(
            "Alice DUPONT",
            "Bonjour Alice, joyeux anniversaire !\nTest.\nÀ bientôt.",
        );
        assert!(text.starts_with("Anniversaire : Alice DUPONT"));
        assert!(text.contains("Bonjour Alice"));
    }
}
