use serde_json::Value;
use std::fs;
use std::path::PathBuf;

fn repository_root() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .parent()
        .expect("src-tauri must have a repository parent")
        .to_path_buf()
}

fn read_json(relative_path: &str) -> Value {
    let path = repository_root().join(relative_path);
    let raw = fs::read_to_string(&path)
        .unwrap_or_else(|error| panic!("failed to read {}: {error}", path.display()));
    serde_json::from_str(&raw)
        .unwrap_or_else(|error| panic!("invalid JSON in {}: {error}", path.display()))
}

fn source_files(directory: &std::path::Path, files: &mut Vec<PathBuf>) {
    for entry in fs::read_dir(directory).expect("source directory") {
        let path = entry.expect("source entry").path();
        if path.is_dir() {
            source_files(&path, files);
        } else if matches!(
            path.extension().and_then(|extension| extension.to_str()),
            Some("ts" | "tsx")
        ) {
            files.push(path);
        }
    }
}

fn permission_ids(capability: &Value) -> Vec<&str> {
    capability["permissions"]
        .as_array()
        .expect("permissions array")
        .iter()
        .filter_map(|permission| {
            permission
                .as_str()
                .or_else(|| permission["identifier"].as_str())
        })
        .collect()
}

#[test]
fn production_csp_blocks_script_eval_and_arbitrary_network_requests() {
    let config = read_json("src-tauri/tauri.conf.json");
    let csp = config["app"]["security"]["csp"]
        .as_str()
        .expect("CSP string");

    assert!(!csp.contains("'unsafe-eval'"));
    assert!(csp.contains("script-src 'self'"));
    assert!(csp.contains("connect-src 'self'"));
    assert!(csp.contains("ipc: http://ipc.localhost"));
    assert!(!csp.contains("https://*"));
    assert!(!csp.contains("localhost:1420"));
    assert!(csp.contains("object-src 'none'"));
    assert!(csp.contains("base-uri 'none'"));

    let dev_csp = config["app"]["security"]["devCsp"]
        .as_str()
        .expect("development CSP string");
    assert!(dev_csp.contains("http://localhost:1420"));
    assert!(dev_csp.contains("ws://localhost:1420"));

    let index = fs::read_to_string(repository_root().join("index.html")).unwrap();
    assert!(!index.contains("fonts.googleapis.com"));
    assert!(!index.contains("fonts.gstatic.com"));

    assert_eq!(
        config["app"]["security"]["assetProtocol"]["enable"],
        serde_json::json!(false)
    );
}

#[test]
fn main_window_capability_uses_only_required_core_and_file_permissions() {
    let capability = read_json("src-tauri/capabilities/default.json");
    let permissions = permission_ids(&capability);

    for forbidden in [
        "core:default",
        "core:webview:default",
        "core:window:default",
        "dialog:default",
        "fs:default",
        "fs:allow-read-file",
        "fs:allow-copy-file",
        "fs:allow-exists",
        "fs:allow-mkdir",
        "fs:allow-remove",
        "fs:allow-stat",
        "fs:scope-home",
        "fs:scope-desktop",
        "fs:scope-document",
        "fs:scope-download",
    ] {
        assert!(
            !permissions.contains(&forbidden),
            "overly broad permission remains enabled: {forbidden}"
        );
    }

    for required in [
        "core:app:allow-version",
        "core:event:allow-listen",
        "core:event:allow-unlisten",
        "core:window:allow-is-visible",
        "dialog:allow-open",
        "fs:scope",
    ] {
        assert!(
            permissions.contains(&required),
            "required permission is missing: {required}"
        );
    }
}

#[test]
fn desktop_capability_does_not_expose_plugin_defaults() {
    let capability = read_json("src-tauri/capabilities/desktop.json");
    let permissions = permission_ids(&capability);

    for forbidden in [
        "updater:default",
        "process:default",
        "autostart:default",
        "core:tray:default",
        "notification:default",
    ] {
        assert!(
            !permissions.contains(&forbidden),
            "plugin default remains enabled: {forbidden}"
        );
    }

    for required in [
        "updater:allow-check",
        "updater:allow-download-and-install",
        "process:allow-restart",
        "notification:allow-is-permission-granted",
        "notification:allow-request-permission",
        "notification:allow-register-action-types",
        "notification:allow-register-listener",
        "notification:allow-notify",
    ] {
        assert!(
            permissions.contains(&required),
            "required desktop permission is missing: {required}"
        );
    }
}

#[test]
fn privileged_file_and_shell_plugins_are_not_frontend_dependencies() {
    let package = read_json("package.json");
    for dependency in ["@tauri-apps/plugin-shell", "@tauri-apps/plugin-fs"] {
        assert!(
            package["dependencies"][dependency].is_null(),
            "privileged frontend plugin must not be shipped: {dependency}"
        );
    }

    let cargo = fs::read_to_string(repository_root().join("src-tauri/Cargo.toml")).unwrap();
    assert!(!cargo.contains("\"protocol-asset\""));
    assert!(!cargo.contains("\"devtools\""));
    assert!(cargo.contains("features = [\"shellexecute-on-windows\"]"));
}

#[test]
fn frontend_source_cannot_import_privileged_file_or_shell_apis() {
    let mut files = Vec::new();
    source_files(&repository_root().join("src"), &mut files);
    for path in files {
        let source = fs::read_to_string(&path).unwrap();
        for forbidden in ["@tauri-apps/plugin-fs", "@tauri-apps/plugin-shell"] {
            assert!(
                !source.contains(forbidden),
                "privileged API imported in {}: {forbidden}",
                path.display()
            );
        }
    }
}

#[test]
fn secure_file_commands_are_registered_in_the_single_invoke_handler() {
    let main = fs::read_to_string(repository_root().join("src-tauri/src/main.rs")).unwrap();
    for command in [
        "stage_document_file_cmd",
        "import_managed_logo_file_cmd",
        "remove_managed_logo_file_cmd",
        "read_local_image_file_cmd",
        "read_public_branding_logo_file_cmd",
    ] {
        assert!(
            main.matches(command).count() >= 2,
            "secure file command is not imported and registered: {command}"
        );
    }
}
