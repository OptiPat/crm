//! Fichiers AppData jumelés aux copies `.db` (config, logos) — même principe que `documents/`.

use crate::documents_storage::copy_dir_all;
use std::fs;
use std::path::{Path, PathBuf};

/// Fichiers à la racine AppData (OAuth, verrou, branding…).
const ROOT_FILES: &[&str] = &[
    "auth.json",
    "secrets.key",
    "email_oauth.json",
    "newsletter_config.json",
    "branding.json",
    "branding-os-state.json",
];

/// Sous-dossiers AppData à copier intégralement.
const CONFIG_DIRS: &[&str] = &["logos", "icons"];

pub fn paired_config_backup_dir_name(db_backup_filename: &str) -> Option<String> {
    let stem = db_backup_filename.strip_suffix(".db")?;
    if !stem.starts_with("patrimoine-crm_") {
        return None;
    }
    Some(format!("{stem}_config"))
}

fn config_backup_dir(backups_dir: &Path, db_backup_stem: &str) -> PathBuf {
    backups_dir.join(format!("{db_backup_stem}_config"))
}

fn safe_dir_name(name: &str) -> bool {
    !name.is_empty()
        && name
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || matches!(c, '_' | '-' | '.'))
}

/// Copie auth, secrets, OAuth, newsletter, branding et logos vers `backups/{stem}_config`.
pub fn backup_app_config_files(
    app_data_dir: &Path,
    backups_dir: &Path,
    db_backup_stem: &str,
) -> std::io::Result<Option<PathBuf>> {
    let dest = config_backup_dir(backups_dir, db_backup_stem);
    let mut copied = false;

    for name in ROOT_FILES {
        let src = app_data_dir.join(name);
        if src.is_file() {
            if !copied {
                fs::create_dir_all(&dest)?;
                copied = true;
            }
            fs::copy(&src, dest.join(name))?;
        }
    }

    for dir_name in CONFIG_DIRS {
        let src = app_data_dir.join(dir_name);
        if src.is_dir() {
            if !copied {
                fs::create_dir_all(&dest)?;
                copied = true;
            }
            let target = dest.join(dir_name);
            if target.exists() {
                fs::remove_dir_all(&target)?;
            }
            copy_dir_all(&src, &target)?;
        }
    }

    Ok(if copied { Some(dest) } else { None })
}

/// Restaure les fichiers de config depuis une sauvegarde jumelée.
pub fn restore_app_config_from_backup(
    app_data_dir: &Path,
    backup_config_dir: &Path,
) -> std::io::Result<()> {
    if !backup_config_dir.is_dir() {
        return Ok(());
    }

    for name in ROOT_FILES {
        let src = backup_config_dir.join(name);
        if src.is_file() {
            fs::copy(&src, app_data_dir.join(name))?;
        }
    }

    for dir_name in CONFIG_DIRS {
        let src = backup_config_dir.join(dir_name);
        if !src.is_dir() {
            continue;
        }
        let live = app_data_dir.join(dir_name);
        if live.exists() {
            fs::remove_dir_all(&live)?;
        }
        copy_dir_all(&src, &live)?;
    }

    Ok(())
}

pub fn prune_paired_config_backups(backups_dir: &Path, db_files_to_remove: &[PathBuf]) {
    for db_path in db_files_to_remove {
        let Some(name) = db_path.file_name().and_then(|n| n.to_str()) else {
            continue;
        };
        let Some(dir_name) = paired_config_backup_dir_name(name) else {
            continue;
        };
        if !safe_dir_name(&dir_name) {
            continue;
        }
        let dir_path = backups_dir.join(&dir_name);
        if dir_path.is_dir() {
            let _ = fs::remove_dir_all(&dir_path);
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::atomic::{AtomicU64, Ordering};

    fn unique_temp_dir() -> PathBuf {
        static COUNTER: AtomicU64 = AtomicU64::new(0);
        let n = COUNTER.fetch_add(1, Ordering::Relaxed);
        std::env::temp_dir().join(format!(
            "patrimoine_crm_backup_sidecar_test_{}_{}",
            std::process::id(),
            n
        ))
    }

    #[test]
    fn backup_and_restore_app_config_files() {
        let app_data = unique_temp_dir();
        fs::create_dir_all(&app_data).expect("app data");
        fs::write(app_data.join("auth.json"), br#"{"password_hash":"x"}"#).expect("auth");
        fs::write(app_data.join("secrets.key"), b"secret-bytes").expect("secrets");
        let logos = app_data.join("logos");
        fs::create_dir_all(&logos).expect("logos");
        fs::write(logos.join("cabinet-logo.png"), b"png").expect("logo");

        let backups_dir = app_data.join("backups");
        fs::create_dir_all(&backups_dir).expect("backups");
        let stem = "patrimoine-crm_test_config";

        let dest = backup_app_config_files(&app_data, &backups_dir, stem)
            .expect("backup config")
            .expect("some files copied");
        assert!(dest.join("auth.json").is_file());
        assert!(dest.join("logos/cabinet-logo.png").is_file());

        fs::write(app_data.join("auth.json"), b"{}").expect("overwrite auth");
        fs::remove_dir_all(&logos).expect("remove logos");

        restore_app_config_from_backup(&app_data, &dest).expect("restore config");
        let auth = fs::read_to_string(app_data.join("auth.json")).expect("read auth");
        assert!(auth.contains("password_hash"));
        assert!(app_data.join("logos/cabinet-logo.png").is_file());

        let _ = fs::remove_dir_all(&app_data);
    }

    #[test]
    fn paired_config_backup_dir_name_matches_db_stem() {
        assert_eq!(
            paired_config_backup_dir_name("patrimoine-crm_20260101_120000_123.db"),
            Some("patrimoine-crm_20260101_120000_123_config".into())
        );
        assert_eq!(paired_config_backup_dir_name("evil.db"), None);
    }
}
