//! Fichiers AppData jumelés aux copies `.db` (config, logos) — même principe que `documents/`.

use crate::documents_storage::copy_dir_all;
use std::fs;
use std::path::{Path, PathBuf};

/// Fichiers à la racine AppData (OAuth, verrou, branding…).
const ROOT_FILES: &[&str] = &[
    "auth.json",
    "secrets.key",
    "secrets.key.os",
    "email_oauth.json",
    "newsletter_config.json",
    "branding.json",
    "branding-os-state.json",
];
const SECRET_KEY_FILES: &[&str] = &["secrets.key", "secrets.key.os"];

/// Sous-dossiers AppData à copier intégralement.
const CONFIG_DIRS: &[&str] = &["logos", "icons"];
const AUTH_ATTEMPTS_FILE: &str = "auth_attempts.json";

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

    restore_root_files(app_data_dir, backup_config_dir)?;

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

    clear_auth_attempts_state(app_data_dir)?;
    Ok(())
}

fn restore_root_files(
    app_data_dir: &Path,
    backup_config_dir: &Path,
) -> std::io::Result<()> {
    let mut incoming = Vec::new();
    for name in ROOT_FILES {
        let source = backup_config_dir.join(name);
        if source.is_file() {
            incoming.push((*name, fs::read(source)?));
        }
    }
    if incoming.is_empty() {
        return Ok(());
    }

    let has_incoming_key = incoming
        .iter()
        .any(|(name, _)| SECRET_KEY_FILES.contains(name));
    let touched: Vec<&str> = ROOT_FILES
        .iter()
        .copied()
        .filter(|name| {
            incoming
                .iter()
                .any(|(incoming_name, _)| incoming_name == name)
                || (has_incoming_key && SECRET_KEY_FILES.contains(name))
        })
        .collect();

    let mut original = Vec::new();
    for name in &touched {
        let live = app_data_dir.join(name);
        if live.exists() && !live.is_file() {
            return Err(std::io::Error::new(
                std::io::ErrorKind::InvalidData,
                format!(
                    "Le chemin de configuration n'est pas un fichier : {}",
                    live.display()
                ),
            ));
        }
        original.push((*name, live.is_file().then(|| fs::read(&live)).transpose()?));
    }

    let restore_result = (|| {
        for (name, contents) in &incoming {
            crate::atomic_file::write(&app_data_dir.join(name), contents)?;
        }
        if has_incoming_key {
            for name in SECRET_KEY_FILES {
                if incoming
                    .iter()
                    .any(|(incoming_name, _)| incoming_name == name)
                {
                    continue;
                }
                let stale = app_data_dir.join(name);
                if stale.is_file() {
                    fs::remove_file(stale)?;
                }
            }
        }
        Ok::<(), std::io::Error>(())
    })();

    if let Err(restore_error) = restore_result {
        let rollback_result = (|| {
            for (name, contents) in &original {
                let live = app_data_dir.join(name);
                match contents {
                    Some(contents) => crate::atomic_file::write(&live, contents)?,
                    None if live.is_file() => fs::remove_file(live)?,
                    None => {}
                }
            }
            Ok::<(), std::io::Error>(())
        })();
        return match rollback_result {
            Ok(()) => Err(restore_error),
            Err(rollback_error) => Err(std::io::Error::new(
                restore_error.kind(),
                format!(
                    "Restauration de la configuration échouée ({restore_error}) et rollback incomplet ({rollback_error})"
                ),
            )),
        };
    }

    Ok(())
}

fn clear_auth_attempts_state(app_data_dir: &Path) -> std::io::Result<()> {
    let path = app_data_dir.join(AUTH_ATTEMPTS_FILE);
    if !path.exists() {
        return Ok(());
    }
    let write_result = fs::write(
        &path,
        r#"{"failed_attempts":0,"blocked_until":null}"#,
    );
    let remove_result = fs::remove_file(&path);
    match (write_result, remove_result) {
        (Err(write_error), Err(remove_error))
            if remove_error.kind() != std::io::ErrorKind::NotFound =>
        {
            Err(std::io::Error::new(
                write_error.kind(),
                format!(
                    "Réinitialisation des tentatives impossible : écriture={write_error}, suppression={remove_error}"
                ),
            ))
        }
        _ => Ok(()),
    }
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
        assert!(dest.join("secrets.key").is_file());
        assert!(dest.join("logos/cabinet-logo.png").is_file());

        fs::write(app_data.join("auth.json"), b"{}").expect("overwrite auth");
        fs::write(app_data.join("secrets.key.os"), b"stale-protected-key").expect("protected key");
        fs::write(
            app_data.join(AUTH_ATTEMPTS_FILE),
            br#"{"failed_attempts":8,"blocked_until":9999999999}"#,
        )
        .expect("attempts");
        fs::remove_dir_all(&logos).expect("remove logos");

        restore_app_config_from_backup(&app_data, &dest).expect("restore config");
        let auth = fs::read_to_string(app_data.join("auth.json")).expect("read auth");
        assert!(auth.contains("password_hash"));
        assert!(app_data.join("secrets.key").is_file());
        assert!(!app_data.join("secrets.key.os").exists());
        assert!(app_data.join("logos/cabinet-logo.png").is_file());
        assert!(!app_data.join(AUTH_ATTEMPTS_FILE).exists());

        let _ = fs::remove_dir_all(&app_data);
    }

    #[test]
    fn restoring_protected_key_removes_stale_legacy_key() {
        let app_data = unique_temp_dir();
        let backup_config = unique_temp_dir();
        fs::create_dir_all(&app_data).expect("app data");
        fs::create_dir_all(&backup_config).expect("backup config");
        fs::write(app_data.join("secrets.key"), b"stale-legacy-key").expect("legacy key");
        fs::write(backup_config.join("secrets.key.os"), b"protected-key")
            .expect("protected key");

        restore_app_config_from_backup(&app_data, &backup_config).expect("restore config");

        assert!(!app_data.join("secrets.key").exists());
        assert_eq!(
            fs::read(app_data.join("secrets.key.os")).expect("read protected key"),
            b"protected-key"
        );
        let _ = fs::remove_dir_all(app_data);
        let _ = fs::remove_dir_all(backup_config);
    }

    #[test]
    fn failed_key_restore_preserves_the_live_protected_key() {
        let app_data = unique_temp_dir();
        let backup_config = unique_temp_dir();
        fs::create_dir_all(app_data.join("secrets.key")).expect("conflicting directory");
        fs::create_dir_all(&backup_config).expect("backup config");
        fs::write(app_data.join("secrets.key.os"), b"live-protected-key").expect("live key");
        fs::write(backup_config.join("secrets.key"), b"backup-legacy-key")
            .expect("backup key");

        assert!(restore_app_config_from_backup(&app_data, &backup_config).is_err());
        assert_eq!(
            fs::read(app_data.join("secrets.key.os")).expect("preserved live key"),
            b"live-protected-key"
        );

        let _ = fs::remove_dir_all(app_data);
        let _ = fs::remove_dir_all(backup_config);
    }

    #[test]
    fn failed_config_restore_preserves_all_live_root_files() {
        let app_data = unique_temp_dir();
        let backup_config = unique_temp_dir();
        fs::create_dir_all(app_data.join("auth.json")).expect("conflicting directory");
        fs::create_dir_all(&backup_config).expect("backup config");
        fs::write(app_data.join("secrets.key.os"), b"live-protected-key").expect("live key");
        fs::write(backup_config.join("auth.json"), b"backup-auth").expect("backup auth");
        fs::write(backup_config.join("secrets.key"), b"backup-legacy-key")
            .expect("backup key");

        assert!(restore_app_config_from_backup(&app_data, &backup_config).is_err());
        assert_eq!(
            fs::read(app_data.join("secrets.key.os")).expect("preserved live key"),
            b"live-protected-key"
        );
        assert!(!app_data.join("secrets.key").exists());

        let _ = fs::remove_dir_all(app_data);
        let _ = fs::remove_dir_all(backup_config);
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
