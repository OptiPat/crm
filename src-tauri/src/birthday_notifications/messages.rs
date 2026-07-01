//! Génération des brouillons SMS anniversaire (port de `scripts/n8n-anniversaires-templates.js`).

use crate::database::birthdays::BirthdayContactToday;
use rand::seq::SliceRandom;

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

fn salutation(registre: Registre, prenom: &str) -> String {
    match registre {
        Registre::Tu => format!("Salut {prenom}"),
        Registre::Vous => format!("Bonjour {prenom}"),
    }
}

fn closing(registre: Registre) -> &'static str {
    match registre {
        Registre::Tu => "à très vite",
        Registre::Vous => "à bientôt",
    }
}

fn angle_performance(prenom: &str, registre: Registre, genre: Genre) -> String {
    let sal = salutation(registre, prenom);
    let end = closing(registre);
    match (registre, genre) {
        (Registre::Tu, Genre::F) => format!(
            "{sal}, joyeux anniversaire ! Si ton sourire et ton expérience étaient un actif financier, le rendement de cette année ferait sauter la banque — {end}. 📈"
        ),
        (Registre::Vous, Genre::F) => format!(
            "{sal}, joyeux anniversaire ! Si votre sourire et votre expérience étaient un actif financier, le rendement de cette année ferait sauter la banque — {end}. 📈"
        ),
        (Registre::Tu, _) => format!(
            "{sal}, joyeux anniversaire ! Si ton expérience et ta présence étaient un actif financier, le rendement de cette année ferait sauter la banque — {end}. 📈"
        ),
        (Registre::Vous, _) => format!(
            "{sal}, joyeux anniversaire ! Si votre expérience et votre présence étaient un actif financier, le rendement de cette année ferait sauter la banque — {end}. 📈"
        ),
    }
}

fn angle_fiscal(prenom: &str, registre: Registre, genre: Genre) -> String {
    let sal = salutation(registre, prenom);
    let end = closing(registre);
    let intro = "S'il y avait un impôt sur l'élégance qui augmente chaque année, ";
    match (registre, genre) {
        (Registre::Tu, Genre::F) => format!(
            "{sal}, joyeux anniversaire ! {intro}tu serais lourdement taxée pour cause de surperformance — {end}. 🥂"
        ),
        (Registre::Tu, Genre::M) => format!(
            "{sal}, joyeux anniversaire ! {intro}tu serais lourdement taxé pour cause de surperformance — {end}. 🥂"
        ),
        (Registre::Tu, Genre::N) => format!(
            "{sal}, joyeux anniversaire ! {intro}ta surperformance te placerait dans la tranche la plus élevée — {end}. 🥂"
        ),
        (Registre::Vous, Genre::F) => format!(
            "{sal}, joyeux anniversaire ! {intro}vous seriez lourdement taxée pour cause de surperformance — {end}. 🥂"
        ),
        (Registre::Vous, Genre::M) => format!(
            "{sal}, joyeux anniversaire ! {intro}vous seriez lourdement taxé pour cause de surperformance — {end}. 🥂"
        ),
        (Registre::Vous, Genre::N) => format!(
            "{sal}, joyeux anniversaire ! {intro}votre surperformance vous placerait dans la tranche la plus élevée — {end}. 🥂"
        ),
    }
}

fn angle_sympathie(prenom: &str, registre: Registre, genre: Genre) -> String {
    let sal = salutation(registre, prenom);
    let end = closing(registre);
    let intro =
        "Heureusement que le capital sympathie est totalement exonéré d'impôt, car ";
    match (registre, genre) {
        (Registre::Tu, Genre::F) => format!(
            "{sal}, joyeux anniversaire ! {intro}ta surperformance de l'année t'aurait rendue lourdement imposable — {end}. 🎉"
        ),
        (Registre::Vous, Genre::F) => format!(
            "{sal}, joyeux anniversaire ! {intro}votre surperformance de l'année vous aurait rendue lourdement imposable — {end}. 🎉"
        ),
        (Registre::Tu, _) => format!(
            "{sal}, joyeux anniversaire ! {intro}ta surperformance de l'année t'aurait rendu lourdement imposable — {end}. 🎉"
        ),
        (Registre::Vous, _) => format!(
            "{sal}, joyeux anniversaire ! {intro}votre surperformance de l'année vous aurait rendu lourdement imposable — {end}. 🎉"
        ),
    }
}

fn angle_inflation(prenom: &str, registre: Registre) -> String {
    let sal = salutation(registre, prenom);
    let end = closing(registre);
    match registre {
        Registre::Tu => format!(
            "{sal}, joyeux anniversaire ! Si le temps qui passe était soumis à l'inflation, ton énergie et ta bonne humeur resteraient le meilleur moyen de protéger ton capital — {end}. 🚀"
        ),
        Registre::Vous => format!(
            "{sal}, joyeux anniversaire ! Si le temps qui passe était soumis à l'inflation, votre énergie et votre bonne humeur resteraient le meilleur moyen de protéger votre capital — {end}. 🚀"
        ),
    }
}

fn angle_prestige(prenom: &str, registre: Registre) -> String {
    let sal = salutation(registre, prenom);
    let end = closing(registre);
    format!(
        "{sal}, joyeux anniversaire ! C'est le propre des très grands investissements : chaque année qui passe ajoute une couche de prestige et de valeur — {end}. 📈"
    )
}

fn angle_capital_temps(prenom: &str, registre: Registre) -> String {
    let sal = salutation(registre, prenom);
    let end = closing(registre);
    match registre {
        Registre::Tu => format!(
            "{sal}, joyeux anniversaire ! Ton capital temps produit des intérêts composés depuis des années, et aujourd'hui le rendement est juste historique — {end}. 🎁"
        ),
        Registre::Vous => format!(
            "{sal}, joyeux anniversaire ! Votre capital temps produit des intérêts composés depuis des années, et aujourd'hui le rendement est juste historique — {end}. 🎁"
        ),
    }
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

pub fn generate_message(
    prenom: &str,
    registre: Registre,
    genre: Genre,
    rng: &mut impl rand::Rng,
) -> String {
    let pool = build_angle_pool(genre);
    let angle = pool.choose(rng).copied().unwrap_or(angle_performance);
    angle(prenom, registre, genre)
}

pub fn generate_draft(contact: &BirthdayContactToday, rng: &mut impl rand::Rng) -> BirthdayDraft {
    let prenom = extract_prenom(&contact.prenom, &contact.display_name);
    let registre = normalize_registre(&contact.registre);
    let genre = genre_from_civilite(contact.civilite.as_deref());
    let message = generate_message(&prenom, registre, genre, rng);
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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn genre_from_civilite_maps_mme_and_m() {
        assert_eq!(genre_from_civilite(Some("MME")), Genre::F);
        assert_eq!(genre_from_civilite(Some("M")), Genre::M);
        assert_eq!(genre_from_civilite(None), Genre::N);
    }

    #[test]
    fn angle_fiscal_vous_feminine() {
        let msg = angle_fiscal("Alice", Registre::Vous, Genre::F);
        assert!(msg.contains("taxée"));
        assert!(msg.contains("Bonjour Alice"));
    }

    #[test]
    fn angle_sympathie_only_for_binary_genre_in_pool() {
        let pool_m = build_angle_pool(Genre::M);
        let pool_n = build_angle_pool(Genre::N);
        assert_eq!(pool_m.len(), 6);
        assert_eq!(pool_n.len(), 5);
    }

    #[test]
    fn generate_message_is_deterministic_with_seeded_rng() {
        use rand::SeedableRng;
        let mut rng1 = rand::rngs::StdRng::seed_from_u64(42);
        let mut rng2 = rand::rngs::StdRng::seed_from_u64(42);
        let m1 = generate_message("Paul", Registre::Tu, Genre::M, &mut rng1);
        let m2 = generate_message("Paul", Registre::Tu, Genre::M, &mut rng2);
        assert_eq!(m1, m2);
        assert!(m1.starts_with("Salut Paul"));
    }

    #[test]
    fn telegram_format_matches_n8n() {
        let text = format_telegram_notification(
            "Alice DUPONT",
            "Bonjour Alice, joyeux anniversaire ! Test — à bientôt. 📈",
        );
        assert!(text.starts_with("Anniversaire : Alice DUPONT"));
        assert!(text.contains("Bonjour Alice"));
    }
}
