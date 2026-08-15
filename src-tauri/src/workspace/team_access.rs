//! Contrôle d'accès au cache équipe : Entra avant toute lecture.
//!
//! Ne touche jamais `patrimoine-crm.db`. SQLCipher n'est pas réactivé : le cache
//! équipe est un SQLite mémoire pendant la session, scellé (XChaCha20) sur disque
//! avec une clé délivrée par SharePoint après Entra. SharePoint reste la source
//! reconstructible.

use crate::database::workspace::WorkspaceConfig;
use crate::workspace::cache_seal::wipe_plaintext_team_cache;
use crate::workspace::enrollment::load_workspace_enrollment;
use crate::workspace::identity::{
    clear_authoritative_identity_cache, require_fresh_sensitive_team_authority, WorkspaceAuthority,
};
use crate::workspace::team_cache_key::{
    load_session_dek_from_sharepoint, refresh_session_dek_from_sharepoint, wipe_session_dek,
};
use tauri::AppHandle;

pub const TEAM_ACCESS_REVOKED_CODE: &str = "team_access_revoked";
pub const TEAM_ACCESS_REQUIRED_CODE: &str = "team_access_required";

pub const TEAM_ACCESS_REVOKED_MESSAGE: &str =
    "Accès équipe révoqué. Ce compte Microsoft n'est plus autorisé à ouvrir le CRM.";
pub const TEAM_ACCESS_REQUIRED_MESSAGE: &str =
    "Une connexion Microsoft équipe valide est requise. Le cache local reste scellé.";

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum TeamAccessDenialKind {
    Revoked,
    AuthorityRequired,
}

pub fn team_access_error_code(kind: TeamAccessDenialKind) -> &'static str {
    match kind {
        TeamAccessDenialKind::Revoked => TEAM_ACCESS_REVOKED_CODE,
        TeamAccessDenialKind::AuthorityRequired => TEAM_ACCESS_REQUIRED_CODE,
    }
}

pub fn team_access_public_message(kind: TeamAccessDenialKind) -> &'static str {
    match kind {
        TeamAccessDenialKind::Revoked => TEAM_ACCESS_REVOKED_MESSAGE,
        TeamAccessDenialKind::AuthorityRequired => TEAM_ACCESS_REQUIRED_MESSAGE,
    }
}

pub fn classify_team_authority_error(error: &str) -> TeamAccessDenialKind {
    let lower = error.to_lowercase();
    if error.contains("n'appartient à aucun groupe")
        || error.contains("appartient aux deux groupes")
        || lower.contains("invalid_grant")
        || lower.contains("aadsts50173")
        || lower.contains("aadsts70008")
        || lower.contains("aadsts500011")
        || error.contains("Accès SharePoint refusé pour ce compte ou ce site")
        || error.contains("Clé de cache équipe introuvable")
        || error.contains("clés de cache équipe contradictoires")
    {
        TeamAccessDenialKind::Revoked
    } else {
        TeamAccessDenialKind::AuthorityRequired
    }
}

pub fn should_wipe_plaintext_on_denial(kind: TeamAccessDenialKind) -> bool {
    kind == TeamAccessDenialKind::Revoked
}

fn purge_revoked_team_local_artifacts(app: &AppHandle) {
    if let Err(wipe_error) = wipe_plaintext_team_cache(app) {
        eprintln!("⚠️ Purge du cache équipe clair après révocation : {wipe_error}");
    }
    if let Err(purge_error) = crate::workspace::documents::purge_local_team_document_cache(app) {
        eprintln!("⚠️ Purge du cache documentaire équipe après révocation : {purge_error}");
    }
}

pub fn should_lock_open_session_on_denial(kind: TeamAccessDenialKind) -> bool {
    matches!(
        kind,
        TeamAccessDenialKind::Revoked | TeamAccessDenialKind::AuthorityRequired
    )
}

pub fn parse_team_access_denial(error: &str) -> Option<TeamAccessDenialKind> {
    if error.contains(TEAM_ACCESS_REVOKED_MESSAGE)
        || error.starts_with(TEAM_ACCESS_REVOKED_CODE)
    {
        Some(TeamAccessDenialKind::Revoked)
    } else if error.contains(TEAM_ACCESS_REQUIRED_MESSAGE)
        || error.starts_with(TEAM_ACCESS_REQUIRED_CODE)
    {
        Some(TeamAccessDenialKind::AuthorityRequired)
    } else if is_team_authority_error(error) {
        Some(classify_team_authority_error(error))
    } else {
        None
    }
}

pub fn is_team_authority_error(error: &str) -> bool {
    let lower = error.to_lowercase();
    error.contains("n'appartient à aucun groupe")
        || error.contains("appartient aux deux groupes")
        || error.contains("Connectez d'abord un compte Microsoft")
        || error.contains("Session mode équipe expirée")
        || error.contains("Session Microsoft expirée")
        || error.contains("groupes Microsoft Entra")
        || lower.contains("invalid_grant")
        || lower.contains("aadsts")
        || lower.contains("rafraîchissement du token")
        || lower.contains("requête microsoft graph")
        || lower.contains("appartenance groupes entra")
        || lower.contains("profil microsoft")
        || error.contains("Accès SharePoint refusé")
        || error.contains("clé de cache équipe")
        || error.contains("Clé de cache équipe")
        || error.contains("clés de cache équipe")
}

/// Vérifie Entra **avant** toute lecture du cache équipe, puis charge la clé
/// SharePoint en mémoire. En cas de révocation confirmée, supprime le SQLite
/// clair local (le fichier scellé et `patrimoine-crm.db` restent intacts).
pub fn prepare_team_cache_open(app: &AppHandle) -> Result<Option<WorkspaceAuthority>, String> {
    let Some(enrollment) = load_workspace_enrollment(app)? else {
        return Ok(None);
    };
    if !enrollment.sync_activated {
        return Ok(None);
    }
    let authority = authorize_team_enrollment(app, &enrollment.to_workspace_config())?;
    load_session_dek_from_sharepoint(app, &enrollment).map_err(|source| {
        let kind = classify_team_authority_error(&source);
        eprintln!("⚠️ Clé de cache équipe refusée ({kind:?}) : {source}");
        crate::licensing::set_workspace_write_allowed(false);
        clear_authoritative_identity_cache();
        wipe_session_dek();
        if should_wipe_plaintext_on_denial(kind) {
            purge_revoked_team_local_artifacts(app);
        }
        team_access_public_message(kind).to_string()
    })?;
    Ok(Some(authority))
}

pub fn revalidate_open_team_session(app: &AppHandle) -> Result<(), String> {
    let Some(enrollment) = load_workspace_enrollment(app)? else {
        return Ok(());
    };
    if !enrollment.sync_activated {
        return Ok(());
    }
    authorize_team_enrollment(app, &enrollment.to_workspace_config())?;
    refresh_session_dek_from_sharepoint(app, &enrollment).map_err(|source| {
        let kind = classify_team_authority_error(&source);
        eprintln!("⚠️ Revalidation clé cache équipe refusée ({kind:?}) : {source}");
        crate::licensing::set_workspace_write_allowed(false);
        clear_authoritative_identity_cache();
        if should_wipe_plaintext_on_denial(kind) {
            purge_revoked_team_local_artifacts(app);
        }
        team_access_public_message(kind).to_string()
    })?;
    Ok(())
}

pub fn authorize_team_enrollment(
    app: &AppHandle,
    config: &WorkspaceConfig,
) -> Result<WorkspaceAuthority, String> {
    match require_fresh_sensitive_team_authority(app, config) {
        Ok(authority) => Ok(authority),
        Err(source) => {
            let kind = classify_team_authority_error(&source);
            eprintln!("⚠️ Accès cache équipe refusé ({kind:?}) : {source}");
            crate::licensing::set_workspace_write_allowed(false);
            clear_authoritative_identity_cache();
            if should_wipe_plaintext_on_denial(kind) {
                purge_revoked_team_local_artifacts(app);
            }
            Err(team_access_public_message(kind).to_string())
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn group_removal_is_a_confirmed_revocation() {
        assert_eq!(
            classify_team_authority_error(
                "Ce compte Microsoft n'appartient à aucun groupe CRM configuré (conseiller ou secrétaire)."
            ),
            TeamAccessDenialKind::Revoked
        );
        assert!(should_wipe_plaintext_on_denial(TeamAccessDenialKind::Revoked));
        assert!(should_lock_open_session_on_denial(TeamAccessDenialKind::Revoked));
    }

    #[test]
    fn disabled_account_token_is_a_confirmed_revocation() {
        assert_eq!(
            classify_team_authority_error(
                "Rafraîchissement du token: invalid_grant AADSTS50173"
            ),
            TeamAccessDenialKind::Revoked
        );
    }

    #[test]
    fn network_or_expired_session_does_not_wipe_unsynced_plaintext() {
        let kind = classify_team_authority_error(
            "Requête Microsoft Graph impossible : dns error",
        );
        assert_eq!(kind, TeamAccessDenialKind::AuthorityRequired);
        assert!(!should_wipe_plaintext_on_denial(kind));
        assert!(should_lock_open_session_on_denial(kind));
        assert_eq!(
            classify_team_authority_error(
                "Session Microsoft expirée ou invalide. Reconnectez le compte équipe."
            ),
            TeamAccessDenialKind::AuthorityRequired
        );
    }

    #[test]
    fn sharepoint_site_denial_is_a_confirmed_revocation() {
        assert_eq!(
            classify_team_authority_error(
                "Accès SharePoint refusé pour ce compte ou ce site."
            ),
            TeamAccessDenialKind::Revoked
        );
    }

    #[test]
    fn missing_or_conflicting_cache_key_is_a_confirmed_revocation() {
        assert_eq!(
            classify_team_authority_error("Clé de cache équipe introuvable sur SharePoint."),
            TeamAccessDenialKind::Revoked
        );
        assert_eq!(
            classify_team_authority_error(
                "Plusieurs clés de cache équipe contradictoires sur SharePoint."
            ),
            TeamAccessDenialKind::Revoked
        );
    }

    #[test]
    fn public_messages_are_stable_for_the_unlock_screen() {
        assert_eq!(
            parse_team_access_denial(TEAM_ACCESS_REVOKED_MESSAGE),
            Some(TeamAccessDenialKind::Revoked)
        );
        assert_eq!(
            parse_team_access_denial(TEAM_ACCESS_REQUIRED_MESSAGE),
            Some(TeamAccessDenialKind::AuthorityRequired)
        );
        assert!(parse_team_access_denial("Cache équipe clair invalide").is_none());
    }
}
