/// Secrets d'environnement du portail — séparation sync / auth.
///
/// `ESPACE_SYNC_SECRET` : signature HMAC CRM ↔ portail uniquement.
/// `ESPACE_AUTH_SECRET` : empreintes des codes OTP et jetons de session.
pub fn load_auth_secret(sync_secret: &str, production: bool) -> String {
    resolve_auth_secret(
        std::env::var("ESPACE_AUTH_SECRET").ok().as_deref(),
        sync_secret,
        production,
    )
}

fn resolve_auth_secret(
    auth_env: Option<&str>,
    sync_secret: &str,
    production: bool,
) -> String {
    match auth_env {
        Some(raw) => {
            let secret = raw.trim().to_string();
            if secret.is_empty() {
                if production {
                    panic!("ESPACE_AUTH_SECRET ne peut pas être vide en production");
                }
                tracing::warn!(
                    "ESPACE_AUTH_SECRET vide : repli sur ESPACE_SYNC_SECRET (dev uniquement)"
                );
                return sync_secret.to_string();
            }
            if production && secret == sync_secret {
                panic!(
                    "ESPACE_AUTH_SECRET doit être distinct de ESPACE_SYNC_SECRET en production"
                );
            }
            secret
        }
        None => {
            if production {
                panic!(
                    "ESPACE_AUTH_SECRET requis en production (distinct de ESPACE_SYNC_SECRET)"
                );
            }
            tracing::warn!(
                "ESPACE_AUTH_SECRET absent : repli sur ESPACE_SYNC_SECRET (acceptable en dev uniquement)"
            );
            sync_secret.to_string()
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn rejects_identical_secrets_in_production() {
        let result = std::panic::catch_unwind(|| {
            resolve_auth_secret(Some("same-secret"), "same-secret", true);
        });
        assert!(result.is_err());
    }

    #[test]
    fn accepts_distinct_secrets_in_production() {
        let secret = resolve_auth_secret(Some("auth-only"), "sync-only", true);
        assert_eq!(secret, "auth-only");
    }

    #[test]
    fn dev_fallback_uses_sync_secret() {
        let secret = resolve_auth_secret(None, "dev-sync", false);
        assert_eq!(secret, "dev-sync");
    }
}
