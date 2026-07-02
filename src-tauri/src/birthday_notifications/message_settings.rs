//! Variantes SMS / WhatsApp / Telegram anniversaire (settings locaux).

use super::messages::{wrap_body_as_full_variant, Registre};
use crate::database::Database;
use serde::{Deserialize, Serialize};

pub const SETTING_MESSAGE_CUSTOM: &str = "birthday_message_use_custom";
pub const SETTING_BODIES_TU: &str = "birthday_message_bodies_tu";
pub const SETTING_BODIES_VOUS: &str = "birthday_message_bodies_vous";
pub const SETTING_BODIES_PROFILE: &str = "birthday_message_bodies_profile";

#[derive(Debug, Clone, Serialize, Deserialize, Default, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct BirthdayMessageProfileBodies {
    pub tu_m: Vec<String>,
    pub tu_f: Vec<String>,
    pub tu_n: Vec<String>,
    pub vous_m: Vec<String>,
    pub vous_f: Vec<String>,
    pub vous_n: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct BirthdayMessageSettingsPayload {
    pub use_custom: bool,
    /// Legacy (migration) — ignoré si une tranche genre est renseignée.
    #[serde(default)]
    pub bodies_tu: Vec<String>,
    #[serde(default)]
    pub bodies_vous: Vec<String>,
    #[serde(default)]
    pub profile: BirthdayMessageProfileBodies,
}

fn parse_bodies_json(raw: Option<String>) -> Vec<String> {
    let Some(raw) = raw.filter(|s| !s.trim().is_empty()) else {
        return Vec::new();
    };
    serde_json::from_str::<Vec<String>>(&raw).unwrap_or_default()
}

fn parse_profile_json(raw: Option<String>) -> BirthdayMessageProfileBodies {
    let Some(raw) = raw.filter(|s| !s.trim().is_empty()) else {
        return BirthdayMessageProfileBodies::default();
    };
    serde_json::from_str::<BirthdayMessageProfileBodies>(&raw).unwrap_or_default()
}

pub fn normalize_bodies(bodies: Vec<String>) -> Vec<String> {
    bodies
        .into_iter()
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty())
        .collect()
}

fn normalize_profile(mut profile: BirthdayMessageProfileBodies) -> BirthdayMessageProfileBodies {
    profile.tu_m = normalize_bodies(profile.tu_m);
    profile.tu_f = normalize_bodies(profile.tu_f);
    profile.tu_n = normalize_bodies(profile.tu_n);
    profile.vous_m = normalize_bodies(profile.vous_m);
    profile.vous_f = normalize_bodies(profile.vous_f);
    profile.vous_n = normalize_bodies(profile.vous_n);
    profile
}

pub fn profile_has_any_bodies(profile: &BirthdayMessageProfileBodies) -> bool {
    !profile.tu_m.is_empty()
        || !profile.tu_f.is_empty()
        || !profile.tu_n.is_empty()
        || !profile.vous_m.is_empty()
        || !profile.vous_f.is_empty()
        || !profile.vous_n.is_empty()
}

fn migrate_profile_full_variants(profile: &mut BirthdayMessageProfileBodies) {
    profile.tu_m = normalize_bodies(
        profile
            .tu_m
            .iter()
            .map(|b| wrap_body_as_full_variant(b, Registre::Tu))
            .collect(),
    );
    profile.tu_f = normalize_bodies(
        profile
            .tu_f
            .iter()
            .map(|b| wrap_body_as_full_variant(b, Registre::Tu))
            .collect(),
    );
    profile.tu_n = normalize_bodies(
        profile
            .tu_n
            .iter()
            .map(|b| wrap_body_as_full_variant(b, Registre::Tu))
            .collect(),
    );
    profile.vous_m = normalize_bodies(
        profile
            .vous_m
            .iter()
            .map(|b| wrap_body_as_full_variant(b, Registre::Vous))
            .collect(),
    );
    profile.vous_f = normalize_bodies(
        profile
            .vous_f
            .iter()
            .map(|b| wrap_body_as_full_variant(b, Registre::Vous))
            .collect(),
    );
    profile.vous_n = normalize_bodies(
        profile
            .vous_n
            .iter()
            .map(|b| wrap_body_as_full_variant(b, Registre::Vous))
            .collect(),
    );
}

fn migrate_legacy_into_profile(
    profile: &mut BirthdayMessageProfileBodies,
    bodies_tu: &[String],
    bodies_vous: &[String],
) {
    if profile_has_any_bodies(profile) {
        return;
    }
    if !bodies_tu.is_empty() {
        profile.tu_m = bodies_tu.to_vec();
        profile.tu_f = bodies_tu.to_vec();
    }
    if !bodies_vous.is_empty() {
        profile.vous_m = bodies_vous.to_vec();
        profile.vous_f = bodies_vous.to_vec();
    }
}

pub fn load_birthday_message_settings(db: &Database) -> Result<BirthdayMessageSettingsPayload, String> {
    let use_custom = db
        .get_setting(SETTING_MESSAGE_CUSTOM)
        .map_err(|e| e.to_string())?
        .map(|v| v == "true")
        .unwrap_or(false);

    let bodies_tu = normalize_bodies(parse_bodies_json(
        db.get_setting(SETTING_BODIES_TU).map_err(|e| e.to_string())?,
    ));
    let bodies_vous = normalize_bodies(parse_bodies_json(
        db.get_setting(SETTING_BODIES_VOUS).map_err(|e| e.to_string())?,
    ));
    let mut profile = normalize_profile(parse_profile_json(
        db.get_setting(SETTING_BODIES_PROFILE).map_err(|e| e.to_string())?,
    ));
    migrate_legacy_into_profile(&mut profile, &bodies_tu, &bodies_vous);
    migrate_profile_full_variants(&mut profile);

    Ok(BirthdayMessageSettingsPayload {
        use_custom,
        bodies_tu,
        bodies_vous,
        profile,
    })
}

pub fn save_birthday_message_settings(
    db: &Database,
    settings: &BirthdayMessageSettingsPayload,
) -> Result<BirthdayMessageSettingsPayload, String> {
    let mut profile = normalize_profile(settings.profile.clone());
    migrate_profile_full_variants(&mut profile);
    let bodies_tu = normalize_bodies(settings.bodies_tu.clone());
    let bodies_vous = normalize_bodies(settings.bodies_vous.clone());
    let has_bodies = profile_has_any_bodies(&profile)
        || !bodies_tu.is_empty()
        || !bodies_vous.is_empty();
    let use_custom = settings.use_custom && has_bodies;

    db.set_setting(
        SETTING_MESSAGE_CUSTOM,
        if use_custom { "true" } else { "false" },
    )
    .map_err(|e| e.to_string())?;
    db.set_setting(
        SETTING_BODIES_PROFILE,
        &serde_json::to_string(&profile).map_err(|e| e.to_string())?,
    )
    .map_err(|e| e.to_string())?;
    db.set_setting(SETTING_BODIES_TU, "[]").map_err(|e| e.to_string())?;
    db.set_setting(SETTING_BODIES_VOUS, "[]").map_err(|e| e.to_string())?;

    Ok(BirthdayMessageSettingsPayload {
        use_custom,
        bodies_tu: vec![],
        bodies_vous: vec![],
        profile,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::database::Database;

    #[test]
    fn migrate_legacy_tu_vous_into_profile() {
        let db = Database::open_in_memory_for_tests().unwrap();
        db.set_setting(SETTING_MESSAGE_CUSTOM, "true").unwrap();
        db.set_setting(SETTING_BODIES_TU, r#"["Corps tu"]"#).unwrap();
        db.set_setting(SETTING_BODIES_VOUS, r#"["Corps vous"]"#).unwrap();
        let loaded = load_birthday_message_settings(&db).unwrap();
        assert!(loaded.profile.tu_m[0].starts_with("Salut {prenom}, joyeux anniversaire !"));
        assert!(loaded.profile.tu_m[0].ends_with("À très vite."));
        assert!(loaded.profile.vous_f[0].starts_with("Bonjour {prenom}, joyeux anniversaire !"));
    }

    #[test]
    fn save_persists_profile_json() {
        let db = Database::open_in_memory_for_tests().unwrap();
        let mut profile = BirthdayMessageProfileBodies::default();
        profile.tu_f = vec!["Salut corps F".into()];
        let saved = save_birthday_message_settings(
            &db,
            &BirthdayMessageSettingsPayload {
                use_custom: true,
                bodies_tu: vec![],
                bodies_vous: vec![],
                profile,
            },
        )
        .unwrap();
        assert!(saved.use_custom);
        assert_eq!(
            saved.profile.tu_f,
            vec!["Salut {prenom}, joyeux anniversaire !\nSalut corps F\nÀ très vite."]
        );
        let loaded = load_birthday_message_settings(&db).unwrap();
        assert_eq!(loaded.profile.tu_f, saved.profile.tu_f);
    }
}
