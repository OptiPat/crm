//! Chemin local OneDrive (client de synchro) à partir des métadonnées Graph.

use crate::contact_name::normalize_contact_name;
use std::collections::HashSet;
use std::path::{Path, PathBuf};

/// Convertit `parentReference.path` Graph (`/drive/root:/Dossier clients`) en segment relatif.
pub fn graph_parent_path_to_relative(parent_path: &str) -> Option<String> {
    let rest = parent_path.strip_prefix("/drive/root:")?;
    let trimmed = rest.trim_start_matches('/');
    if trimmed.is_empty() {
        return None;
    }
    Some(trimmed.replace('/', std::path::MAIN_SEPARATOR_STR))
}

pub fn join_drive_relative(parent_relative: &str, item_name: &str) -> PathBuf {
    PathBuf::from(parent_relative).join(item_name)
}

fn push_unique(path: PathBuf, out: &mut Vec<PathBuf>, seen: &mut HashSet<String>) {
    let key = path.to_string_lossy().to_lowercase();
    if seen.insert(key) {
        out.push(path);
    }
}

fn path_ends_with_name(path: &Path, name: &str) -> bool {
    path.file_name()
        .and_then(|n| n.to_str())
        .is_some_and(|segment| normalize_contact_name(segment) == normalize_contact_name(name))
}

fn find_child_dir_insensitive(parent: &Path, folder_name: &str) -> Option<PathBuf> {
    if !parent.is_dir() {
        return None;
    }
    let target = normalize_contact_name(folder_name);
    let entries = std::fs::read_dir(parent).ok()?;
    for entry in entries.flatten() {
        let path = entry.path();
        if !path.is_dir() {
            continue;
        }
        let Some(name) = path.file_name().and_then(|n| n.to_str()) else {
            continue;
        };
        if normalize_contact_name(name) == target {
            return Some(path);
        }
    }
    None
}

/// Racines OneDrive courantes sur Windows (client de synchro).
pub fn guess_onedrive_sync_roots() -> Vec<PathBuf> {
    let mut roots = Vec::new();
    let mut seen = HashSet::new();

    let mut push = |path: PathBuf| {
        if path.is_dir() {
            let key = path.to_string_lossy().to_lowercase();
            if seen.insert(key) {
                roots.push(path);
            }
        }
    };

    for key in ["OneDrive", "OneDriveCommercial", "OneDriveConsumer"] {
        if let Ok(value) = std::env::var(key) {
            push(PathBuf::from(value));
        }
    }

    if let Some(home) = std::env::var_os("USERPROFILE").or_else(|| std::env::var_os("HOME")) {
        let home = PathBuf::from(home);
        for name in ["OneDrive", "OneDrive - Personal"] {
            push(home.join(name));
        }
    }

    for letter in b'D'..=b'Z' {
        let drive = format!("{}:\\OneDrive", letter as char);
        push(PathBuf::from(drive));
    }

    roots
}

pub struct LocalFolderResolveInput<'a> {
    pub configured_local: Option<&'a str>,
    pub cloud_root_name: Option<&'a str>,
    pub graph_relative: Option<&'a str>,
    pub folder_name: Option<&'a str>,
}

pub fn resolve_local_onedrive_folder(input: LocalFolderResolveInput<'_>) -> Option<PathBuf> {
    let folder_name = input.folder_name.or_else(|| {
        input
            .graph_relative
            .and_then(|relative| Path::new(relative).file_name())
            .and_then(|name| name.to_str())
    });

    let mut roots = Vec::new();
    let mut seen_roots = HashSet::new();
    if let Some(configured) = input.configured_local.filter(|s| !s.trim().is_empty()) {
        let path = PathBuf::from(configured);
        if path.is_dir() {
            let key = path.to_string_lossy().to_lowercase();
            if seen_roots.insert(key) {
                roots.push(path);
            }
        }
    }
    for root in guess_onedrive_sync_roots() {
        let key = root.to_string_lossy().to_lowercase();
        if seen_roots.insert(key) {
            roots.push(root);
        }
    }

    let mut candidates = Vec::new();
    let mut seen_candidates = HashSet::new();

    for root in &roots {
        if let Some(relative) = input.graph_relative.filter(|s| !s.is_empty()) {
            push_unique(root.join(relative), &mut candidates, &mut seen_candidates);
        }
        if let Some(name) = folder_name {
            push_unique(root.join(name), &mut candidates, &mut seen_candidates);
        }
        if let (Some(cloud_root), Some(name)) = (input.cloud_root_name, folder_name) {
            push_unique(
                root.join(cloud_root).join(name),
                &mut candidates,
                &mut seen_candidates,
            );
            if path_ends_with_name(root, cloud_root) {
                push_unique(root.join(name), &mut candidates, &mut seen_candidates);
            }
        }
        if let Some(parent) = root.parent() {
            if let Some(relative) = input.graph_relative.filter(|s| !s.is_empty()) {
                push_unique(parent.join(relative), &mut candidates, &mut seen_candidates);
            }
        }
    }

    for candidate in candidates {
        if candidate.is_dir() {
            return Some(candidate);
        }
    }

    for root in &roots {
        if let Some(name) = folder_name {
            if let Some(found) = find_child_dir_insensitive(root, name) {
                return Some(found);
            }
            if let Some(cloud_root) = input.cloud_root_name {
                let clients_root = if path_ends_with_name(root, cloud_root) {
                    root.clone()
                } else {
                    root.join(cloud_root)
                };
                if let Some(found) = find_child_dir_insensitive(&clients_root, name) {
                    return Some(found);
                }
            }
        }
    }

    None
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use std::time::{SystemTime, UNIX_EPOCH};

    fn temp_dir(prefix: &str) -> PathBuf {
        let nanos = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .expect("clock")
            .as_nanos();
        let path = std::env::temp_dir().join(format!("{prefix}-{nanos}"));
        fs::create_dir_all(&path).expect("temp dir");
        path
    }

    #[test]
    fn graph_parent_path_strips_nested_segments() {
        let relative = graph_parent_path_to_relative("/drive/root:/Dossier clients/Sous-dossier")
            .expect("relative");
        assert!(relative.contains("Dossier clients"));
        assert!(relative.contains("Sous-dossier"));
    }

    #[test]
    fn resolve_local_folder_when_user_picked_clients_root() {
        let base = temp_dir("onedrive-local");
        let clients_root = base.join("Dossier Clients PRODEMIAL");
        let contact_dir = clients_root.join("PERALTA Flora");
        fs::create_dir_all(&contact_dir).expect("contact dir");

        let resolved = resolve_local_onedrive_folder(LocalFolderResolveInput {
            configured_local: Some(clients_root.to_string_lossy().as_ref()),
            cloud_root_name: Some("Dossier Clients PRODEMIAL"),
            graph_relative: Some("Dossier Clients PRODEMIAL\\PERALTA Flora"),
            folder_name: Some("PERALTA Flora"),
        })
        .expect("local folder");

        assert_eq!(resolved, contact_dir);
        let _ = fs::remove_dir_all(base);
    }

    #[test]
    fn resolve_local_folder_from_sync_root_on_d_drive() {
        let base = temp_dir("onedrive-sync");
        let clients_root = base.join("Dossier Clients PRODEMIAL");
        let contact_dir = clients_root.join("PERALTA Flora");
        fs::create_dir_all(&contact_dir).expect("contact dir");

        let resolved = resolve_local_onedrive_folder(LocalFolderResolveInput {
            configured_local: Some(base.to_string_lossy().as_ref()),
            cloud_root_name: Some("Dossier Clients PRODEMIAL"),
            graph_relative: Some("Dossier Clients PRODEMIAL\\PERALTA Flora"),
            folder_name: Some("PERALTA Flora"),
        })
        .expect("local folder");

        assert_eq!(resolved, contact_dir);
        let _ = fs::remove_dir_all(base);
    }
}
