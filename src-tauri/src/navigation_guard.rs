use tauri::{plugin::TauriPlugin, Runtime};
use url::Url;

fn is_allowed_navigation(url: &Url, development: bool) -> bool {
    if url.scheme() == "about" && url.as_str() == "about:blank" {
        return true;
    }
    if url.scheme() == "tauri" {
        return true;
    }
    if matches!(url.scheme(), "http" | "https") && url.host_str() == Some("tauri.localhost") {
        return true;
    }
    development
        && url.scheme() == "http"
        && matches!(url.host_str(), Some("localhost" | "127.0.0.1"))
        && url.port() == Some(1420)
}

pub fn init<R: Runtime>() -> TauriPlugin<R> {
    tauri::plugin::Builder::new("navigation-guard")
        .on_navigation(|webview, url| {
            let allowed = is_allowed_navigation(url, cfg!(debug_assertions));
            if !allowed {
                eprintln!(
                    "Navigation webview bloquée ({}): {}",
                    webview.label(),
                    url
                );
            }
            allowed
        })
        .build()
}

#[cfg(test)]
mod tests {
    use super::is_allowed_navigation;
    use url::Url;

    fn allowed(url: &str, development: bool) -> bool {
        is_allowed_navigation(&Url::parse(url).unwrap(), development)
    }

    #[test]
    fn allows_only_internal_application_origins() {
        assert!(allowed("tauri://localhost/", false));
        assert!(allowed("https://tauri.localhost/", false));
        assert!(allowed("http://tauri.localhost/", false));
        assert!(allowed("about:blank", false));

        assert!(!allowed("https://example.com/", false));
        assert!(!allowed("data:text/html,hello", false));
        assert!(!allowed("javascript:alert(1)", false));
    }

    #[test]
    fn development_origin_is_exact_and_never_allowed_in_release() {
        assert!(allowed("http://localhost:1420/", true));
        assert!(allowed("http://127.0.0.1:1420/", true));
        assert!(!allowed("http://localhost:1420/", false));
        assert!(!allowed("http://localhost:9999/", true));
        assert!(!allowed("https://localhost:1420/", true));
        assert!(!allowed("http://localhost.attacker.test:1420/", true));
    }
}
