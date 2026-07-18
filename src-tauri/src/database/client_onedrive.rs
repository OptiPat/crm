use super::Database;
use rusqlite::{params, Result};
use serde::{Deserialize, Serialize};

pub const SETTING_ROOT_FOLDER_ID: &str = "client_onedrive_root_folder_id";
pub const SETTING_ROOT_FOLDER_NAME: &str = "client_onedrive_root_folder_name";

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ClientOneDriveConfig {
    pub root_folder_id: Option<String>,
    pub root_folder_name: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ClientOneDriveFolderLink {
    pub folder_id: String,
    pub folder_name: String,
    pub web_url: Option<String>,
    pub source: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ClientOneDriveFolderProposal {
    pub folder_id: String,
    pub folder_name: String,
    pub web_url: Option<String>,
    pub contact_id: Option<i64>,
    pub foyer_id: Option<i64>,
    pub label: String,
    pub confidence: String,
    pub source: String,
    /// `exact` | `surname` | `ambiguous_surname` | `none`
    pub match_kind: String,
    /// Nom cible convention CRM (renommage OneDrive proposé).
    pub suggested_folder_name: Option<String>,
}

#[derive(Debug, Clone)]
pub struct OneDriveFolderOwner {
    pub contact_id: Option<i64>,
    pub foyer_id: Option<i64>,
    pub label: String,
}

impl Database {
    pub fn get_client_onedrive_config(&self) -> Result<ClientOneDriveConfig> {
        Ok(ClientOneDriveConfig {
            root_folder_id: self.get_setting(SETTING_ROOT_FOLDER_ID)?,
            root_folder_name: self.get_setting(SETTING_ROOT_FOLDER_NAME)?,
        })
    }

    pub fn save_client_onedrive_config(&self, config: &ClientOneDriveConfig) -> Result<()> {
        self.set_setting(
            SETTING_ROOT_FOLDER_ID,
            config.root_folder_id.as_deref().unwrap_or(""),
        )?;
        self.set_setting(
            SETTING_ROOT_FOLDER_NAME,
            config.root_folder_name.as_deref().unwrap_or(""),
        )?;
        Ok(())
    }

    pub fn set_foyer_onedrive_link(
        &self,
        foyer_id: i64,
        folder_id: &str,
        folder_name: &str,
        web_url: Option<&str>,
    ) -> Result<()> {
        self.conn.execute(
            "UPDATE foyers SET onedrive_folder_id = ?1, onedrive_folder_name = ?2,
             onedrive_web_url = ?3, updated_at = unixepoch() WHERE id = ?4",
            params![folder_id, folder_name, web_url, foyer_id],
        )?;
        Ok(())
    }

    pub fn set_contact_onedrive_link(
        &self,
        contact_id: i64,
        folder_id: &str,
        folder_name: &str,
        web_url: Option<&str>,
    ) -> Result<()> {
        self.conn.execute(
            "UPDATE contacts SET onedrive_folder_id = ?1, onedrive_folder_name = ?2,
             onedrive_web_url = ?3, updated_at = unixepoch() WHERE id = ?4",
            params![folder_id, folder_name, web_url, contact_id],
        )?;
        Ok(())
    }

    pub fn resolve_contact_onedrive_link(
        &self,
        contact_id: i64,
    ) -> Result<Option<ClientOneDriveFolderLink>> {
        let mut stmt = self.conn.prepare(
            "SELECT c.onedrive_folder_id, c.onedrive_folder_name, c.onedrive_web_url,
                    c.foyer_id, f.onedrive_folder_id, f.onedrive_folder_name, f.onedrive_web_url
             FROM contacts c
             LEFT JOIN foyers f ON f.id = c.foyer_id
             WHERE c.id = ?1",
        )?;
        let row = stmt.query_row(params![contact_id], |row| {
            Ok((
                row.get::<_, Option<String>>(0)?,
                row.get::<_, Option<String>>(1)?,
                row.get::<_, Option<String>>(2)?,
                row.get::<_, Option<i64>>(3)?,
                row.get::<_, Option<String>>(4)?,
                row.get::<_, Option<String>>(5)?,
                row.get::<_, Option<String>>(6)?,
            ))
        })?;
        let (
            c_id,
            c_name,
            c_url,
            foyer_id,
            f_id,
            f_name,
            f_url,
        ) = row;
        if let (Some(folder_id), Some(folder_name)) = (f_id, f_name) {
            return Ok(Some(ClientOneDriveFolderLink {
                folder_id,
                folder_name,
                web_url: f_url,
                source: if foyer_id.is_some() {
                    "foyer".into()
                } else {
                    "foyer".into()
                },
            }));
        }
        if let (Some(folder_id), Some(folder_name)) = (c_id, c_name) {
            return Ok(Some(ClientOneDriveFolderLink {
                folder_id,
                folder_name,
                web_url: c_url,
                source: "contact".into(),
            }));
        }
        Ok(None)
    }

    pub fn list_contacts_for_onedrive_matching(
        &self,
    ) -> Result<Vec<(i64, String, String, Option<i64>)>> {
        let mut stmt = self.conn.prepare(
            "SELECT id, nom, prenom, foyer_id FROM contacts
             WHERE categorie IN ('CLIENT', 'PROSPECT_CLIENT')
             ORDER BY nom COLLATE NOCASE, prenom COLLATE NOCASE",
        )?;
        let rows = stmt.query_map([], |row| {
            Ok((
                row.get(0)?,
                row.get(1)?,
                row.get(2)?,
                row.get(3)?,
            ))
        })?;
        rows.collect()
    }

    pub fn list_foyers_for_onedrive_matching(
        &self,
    ) -> Result<Vec<(i64, String, Option<String>, Option<String>, Option<String>)>> {
        let mut stmt = self.conn.prepare(
            "SELECT f.id, f.nom, f.type_foyer,
                    (SELECT c1.nom FROM contacts c1 WHERE c1.foyer_id = f.id ORDER BY c1.id LIMIT 1),
                    (SELECT c1.prenom FROM contacts c1 WHERE c1.foyer_id = f.id ORDER BY c1.id LIMIT 1)
             FROM foyers f
             ORDER BY f.nom COLLATE NOCASE",
        )?;
        let rows = stmt.query_map([], |row| {
            Ok((
                row.get(0)?,
                row.get(1)?,
                row.get(2)?,
                row.get(3)?,
                row.get(4)?,
            ))
        })?;
        rows.collect()
    }

    pub fn list_linked_onedrive_folder_ids(&self) -> Result<Vec<String>> {
        let mut ids = Vec::new();
        let mut stmt = self.conn.prepare(
            "SELECT onedrive_folder_id FROM contacts WHERE onedrive_folder_id IS NOT NULL
             UNION SELECT onedrive_folder_id FROM foyers WHERE onedrive_folder_id IS NOT NULL",
        )?;
        let rows = stmt.query_map([], |row| row.get::<_, String>(0))?;
        for id in rows {
            ids.push(id?);
        }
        Ok(ids)
    }

    pub fn find_onedrive_folder_owner(
        &self,
        folder_id: &str,
    ) -> Result<Option<OneDriveFolderOwner>> {
        let mut stmt = self.conn.prepare(
            "SELECT id, nom, prenom FROM contacts WHERE onedrive_folder_id = ?1 LIMIT 1",
        )?;
        if let Ok((id, nom, prenom)) = stmt.query_row(params![folder_id], |row| {
            Ok((row.get::<_, i64>(0)?, row.get::<_, String>(1)?, row.get::<_, String>(2)?))
        }) {
            return Ok(Some(OneDriveFolderOwner {
                contact_id: Some(id),
                foyer_id: None,
                label: format!("{nom} {prenom}"),
            }));
        }
        let mut stmt = self.conn.prepare(
            "SELECT id, nom FROM foyers WHERE onedrive_folder_id = ?1 LIMIT 1",
        )?;
        if let Ok((id, nom)) = stmt.query_row(params![folder_id], |row| {
            Ok((row.get::<_, i64>(0)?, row.get::<_, String>(1)?))
        }) {
            return Ok(Some(OneDriveFolderOwner {
                contact_id: None,
                foyer_id: Some(id),
                label: nom,
            }));
        }
        Ok(None)
    }
}
