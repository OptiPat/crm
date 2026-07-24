use crate::email::oauth_send::{refresh_oauth_connection_if_needed, OAuthConnectionSlot};
use crate::email::oauth_store::{EmailOAuthConnection, EmailOAuthStore};
use tauri::AppHandle;

pub fn resolve_microsoft_team_connection(
    app: &AppHandle,
) -> Result<Option<EmailOAuthConnection>, String> {
    let store = EmailOAuthStore::load(app)?;
    if let Some(ref conn) = store.microsoft_team_connection {
        let mut c = conn.clone();
        refresh_oauth_connection_if_needed(app, &mut c, OAuthConnectionSlot::MicrosoftTeam)?;
        return Ok(Some(c));
    }
    Ok(None)
}
