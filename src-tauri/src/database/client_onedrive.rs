use super::Database;
use rusqlite::{params, OptionalExtension, Result};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;

pub const SETTING_ROOT_FOLDER_ID: &str = "client_onedrive_root_folder_id";
pub const SETTING_ROOT_FOLDER_NAME: &str = "client_onedrive_root_folder_name";
pub const SETTING_LOCAL_SYNC_ROOT: &str = "client_onedrive_local_sync_root";

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ClientOneDriveConfig {
    pub root_folder_id: Option<String>,
    pub root_folder_name: Option<String>,
    pub local_sync_root: Option<String>,
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

impl Database {
    pub fn get_client_onedrive_config(&self) -> Result<ClientOneDriveConfig> {
        Ok(ClientOneDriveConfig {
            root_folder_id: self.get_setting(SETTING_ROOT_FOLDER_ID)?,
            root_folder_name: self.get_setting(SETTING_ROOT_FOLDER_NAME)?,
            local_sync_root: self.get_setting(SETTING_LOCAL_SYNC_ROOT)?,
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
        self.set_setting(
            SETTING_LOCAL_SYNC_ROOT,
            config.local_sync_root.as_deref().unwrap_or(""),
        )?;
        Ok(())
    }

    pub fn save_client_onedrive_local_sync_root(&self, path: &str) -> Result<()> {
        self.set_setting(SETTING_LOCAL_SYNC_ROOT, path)
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
                source: "foyer".into(),
            }));
        }
        if let Some(foyer_id) = foyer_id {
            if let Some(link) =
                self.resolve_couple_foyer_member_onedrive_link(contact_id, foyer_id)?
            {
                return Ok(Some(link));
            }
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

    /// Dossier OneDrive relié à un autre membre du même foyer couple.
    fn resolve_couple_foyer_member_onedrive_link(
        &self,
        contact_id: i64,
        foyer_id: i64,
    ) -> Result<Option<ClientOneDriveFolderLink>> {
        let mut stmt = self.conn.prepare(
            "SELECT c2.onedrive_folder_id, c2.onedrive_folder_name, c2.onedrive_web_url
             FROM contacts c1
             JOIN foyers f ON f.id = c1.foyer_id AND f.id = ?2 AND f.type_foyer = 'COUPLE'
             JOIN contacts c2 ON c2.foyer_id = f.id AND c2.id != c1.id
             WHERE c1.id = ?1
               AND c2.onedrive_folder_id IS NOT NULL
               AND c2.onedrive_folder_name IS NOT NULL
             LIMIT 1",
        )?;
        let row = stmt.query_row(params![contact_id, foyer_id], |row| {
            Ok((
                row.get::<_, String>(0)?,
                row.get::<_, String>(1)?,
                row.get::<_, Option<String>>(2)?,
            ))
        });
        match row {
            Ok((folder_id, folder_name, web_url)) => Ok(Some(ClientOneDriveFolderLink {
                folder_id,
                folder_name,
                web_url,
                source: "inherited".into(),
            })),
            Err(rusqlite::Error::QueryReturnedNoRows) => Ok(None),
            Err(e) => Err(e),
        }
    }

    pub fn clear_foyer_members_contact_onedrive_links(&self, foyer_id: i64) -> Result<()> {
        self.conn.execute(
            "UPDATE contacts
             SET onedrive_folder_id = NULL, onedrive_folder_name = NULL,
                 onedrive_web_url = NULL, updated_at = unixepoch()
             WHERE foyer_id = ?1",
            params![foyer_id],
        )?;
        Ok(())
    }

    pub fn clear_contact_onedrive_link_by_id(&self, contact_id: i64) -> Result<()> {
        self.conn.execute(
            "UPDATE contacts
             SET onedrive_folder_id = NULL, onedrive_folder_name = NULL,
                 onedrive_web_url = NULL, updated_at = unixepoch()
             WHERE id = ?1",
            params![contact_id],
        )?;
        Ok(())
    }

    pub fn clear_foyer_onedrive_link(&self, foyer_id: i64) -> Result<()> {
        self.conn.execute(
            "UPDATE foyers
             SET onedrive_folder_id = NULL, onedrive_folder_name = NULL,
                 onedrive_web_url = NULL, updated_at = unixepoch()
             WHERE id = ?1",
            params![foyer_id],
        )?;
        Ok(())
    }

    pub fn clear_onedrive_link_for_contact(&self, contact_id: i64) -> Result<bool> {
        let has_own_link = self
            .conn
            .query_row::<i64, _, _>(
                "SELECT 1 FROM contacts WHERE id = ?1 AND onedrive_folder_id IS NOT NULL LIMIT 1",
                params![contact_id],
                |row| row.get(0),
            )
            .optional()?
            .is_some();
        if has_own_link {
            self.clear_contact_onedrive_link_by_id(contact_id)?;
            return Ok(true);
        }

        let contact = self.get_contact_by_id(contact_id)?;
        if let Some(foyer_id) = contact.foyer_id {
            let foyer_has_link = self
                .conn
                .query_row::<i64, _, _>(
                    "SELECT 1 FROM foyers WHERE id = ?1 AND onedrive_folder_id IS NOT NULL LIMIT 1",
                    params![foyer_id],
                    |row| row.get(0),
                )
                .optional()?
                .is_some();
            if foyer_has_link {
                self.clear_foyer_onedrive_link(foyer_id)?;
                self.clear_foyer_members_contact_onedrive_links(foyer_id)?;
                return Ok(true);
            }
        }

        Ok(false)
    }

    pub fn list_contact_onedrive_folder_ids(&self) -> Result<HashMap<i64, String>> {
        let mut map = HashMap::new();
        let mut stmt = self.conn.prepare(
            "SELECT id, onedrive_folder_id FROM contacts WHERE onedrive_folder_id IS NOT NULL",
        )?;
        let rows = stmt.query_map([], |row| {
            Ok((row.get::<_, i64>(0)?, row.get::<_, String>(1)?))
        })?;
        for row in rows {
            let (contact_id, folder_id) = row?;
            map.insert(contact_id, folder_id);
        }
        Ok(map)
    }

    pub fn list_onedrive_folder_contact_labels_excluding(
        &self,
        folder_id: &str,
        exclude_contact_id: i64,
    ) -> Result<Vec<String>> {
        let mut stmt = self.conn.prepare(
            "SELECT nom, prenom FROM contacts
             WHERE onedrive_folder_id = ?1 AND id != ?2
             ORDER BY nom COLLATE NOCASE, prenom COLLATE NOCASE",
        )?;
        let rows = stmt.query_map(params![folder_id, exclude_contact_id], |row| {
            let nom: String = row.get(0)?;
            let prenom: String = row.get(1)?;
            Ok(format!("{nom} {prenom}"))
        })?;
        rows.collect()
    }

    pub fn propagate_onedrive_folder_link_rename(
        &self,
        old_folder_id: &str,
        new_folder_id: &str,
        folder_name: &str,
        web_url: Option<&str>,
    ) -> Result<()> {
        self.conn.execute(
            "UPDATE contacts
             SET onedrive_folder_id = ?1, onedrive_folder_name = ?2,
                 onedrive_web_url = ?3, updated_at = unixepoch()
             WHERE onedrive_folder_id = ?4",
            params![new_folder_id, folder_name, web_url, old_folder_id],
        )?;
        self.conn.execute(
            "UPDATE foyers
             SET onedrive_folder_id = ?1, onedrive_folder_name = ?2,
                 onedrive_web_url = ?3, updated_at = unixepoch()
             WHERE onedrive_folder_id = ?4",
            params![new_folder_id, folder_name, web_url, old_folder_id],
        )?;
        Ok(())
    }

    pub fn list_client_onedrive_link_flags(&self) -> Result<Vec<(i64, bool)>> {
        let mut stmt = self.conn.prepare(
            "SELECT c.id,
                    CASE
                      WHEN c.onedrive_folder_id IS NOT NULL THEN 1
                      WHEN f.onedrive_folder_id IS NOT NULL THEN 1
                      WHEN EXISTS (
                        SELECT 1 FROM contacts c2
                        JOIN foyers f2 ON f2.id = c2.foyer_id AND f2.type_foyer = 'COUPLE'
                        WHERE c2.foyer_id = c.foyer_id
                          AND c2.id != c.id
                          AND c2.onedrive_folder_id IS NOT NULL
                      ) THEN 1
                      ELSE 0
                    END AS linked
             FROM contacts c
             LEFT JOIN foyers f ON f.id = c.foyer_id
             WHERE c.categorie IN ('CLIENT', 'PROSPECT_CLIENT')",
        )?;
        let rows = stmt.query_map([], |row| Ok((row.get::<_, i64>(0)?, row.get::<_, i64>(1)? == 1)))?;
        rows.collect()
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
}

#[cfg(test)]
mod tests {
    use crate::database::models::{NewContact, NewFoyer};
    use crate::database::Database;

    fn test_db() -> Database {
        Database::open_in_memory_for_tests().expect("in-memory db")
    }

    fn sample_contact(nom: &str, prenom: &str) -> NewContact {
        NewContact {
            categorie: "CLIENT".into(),
            nom: nom.into(),
            prenom: prenom.into(),
            statut_suivi: Some("ACTIF".into()),
            ..Default::default()
        }
    }

    fn couple_foyer_with_members(db: &Database) -> (i64, i64, i64) {
        let foyer = db
            .create_foyer(NewFoyer {
                nom: "PERALTA & MARTIN".into(),
                type_foyer: "COUPLE".into(),
                nombre_parts_fiscales: None,
                tranche_imposition: None,
                revenu_fiscal_reference: None,
                ir_net_a_payer: None,
                situation_patrimoniale: None,
                objectifs_patrimoniaux: None,
                notes: None,
            })
            .unwrap();
        let flora = db
            .create_contact(NewContact {
                foyer_id: Some(foyer.id),
                role_foyer: Some("DECLARANT_1".into()),
                ..sample_contact("PERALTA", "Flora")
            })
            .unwrap();
        let conjoint = db
            .create_contact(NewContact {
                foyer_id: Some(foyer.id),
                role_foyer: Some("DECLARANT_2".into()),
                ..sample_contact("MARTIN", "Paul")
            })
            .unwrap();
        (foyer.id, flora.id.unwrap(), conjoint.id.unwrap())
    }

    #[test]
    fn resolve_contact_inherits_spouse_onedrive_link_in_couple_foyer() {
        let db = test_db();
        let (foyer_id, flora_id, conjoint_id) = couple_foyer_with_members(&db);
        db.set_contact_onedrive_link(
            flora_id,
            "folder-abc",
            "PERALTA Flora",
            Some("https://example.com/folder-abc"),
        )
        .unwrap();

        let link = db
            .resolve_contact_onedrive_link(conjoint_id)
            .unwrap()
            .expect("conjoint doit voir le dossier du foyer");

        assert_eq!(link.folder_id, "folder-abc");
        assert_eq!(link.source, "inherited");

        db.set_foyer_onedrive_link(
            foyer_id,
            "folder-abc",
            "PERALTA Flora",
            Some("https://example.com/folder-abc"),
        )
        .unwrap();
        db.clear_foyer_members_contact_onedrive_links(foyer_id)
            .unwrap();

        let link = db
            .resolve_contact_onedrive_link(conjoint_id)
            .unwrap()
            .expect("lien foyer direct");
        assert_eq!(link.folder_id, "folder-abc");
        assert_eq!(link.source, "foyer");
    }

    #[test]
    fn multiple_contacts_can_share_same_onedrive_folder() {
        let db = test_db();
        let parent = db.create_contact(sample_contact("GUETTE", "Julie")).unwrap();
        let child = db.create_contact(sample_contact("GUETTE", "Emma")).unwrap();
        let parent_id = parent.id.unwrap();
        let child_id = child.id.unwrap();

        db.set_contact_onedrive_link(
            parent_id,
            "folder-shared",
            "GUETTE Julie",
            Some("https://example.com/shared"),
        )
        .unwrap();
        db.set_contact_onedrive_link(
            child_id,
            "folder-shared",
            "GUETTE Julie",
            Some("https://example.com/shared"),
        )
        .unwrap();

        let parent_link = db
            .resolve_contact_onedrive_link(parent_id)
            .unwrap()
            .expect("parent linked");
        let child_link = db
            .resolve_contact_onedrive_link(child_id)
            .unwrap()
            .expect("child linked");
        assert_eq!(parent_link.folder_id, "folder-shared");
        assert_eq!(child_link.folder_id, "folder-shared");

        let flags = db.list_client_onedrive_link_flags().unwrap();
        assert!(flags.iter().any(|(id, linked)| *id == parent_id && *linked));
        assert!(flags.iter().any(|(id, linked)| *id == child_id && *linked));
    }

    #[test]
    fn unlink_one_of_shared_contacts_keeps_other() {
        let db = test_db();
        let parent = db.create_contact(sample_contact("GUETTE", "Julie")).unwrap();
        let child = db.create_contact(sample_contact("GUETTE", "Emma")).unwrap();
        let parent_id = parent.id.unwrap();
        let child_id = child.id.unwrap();
        db.set_contact_onedrive_link(parent_id, "folder-shared", "GUETTE Julie", None)
            .unwrap();
        db.set_contact_onedrive_link(child_id, "folder-shared", "GUETTE Julie", None)
            .unwrap();

        assert!(db.clear_onedrive_link_for_contact(child_id).unwrap());

        assert!(db
            .resolve_contact_onedrive_link(parent_id)
            .unwrap()
            .is_some());
        assert!(db
            .resolve_contact_onedrive_link(child_id)
            .unwrap()
            .is_none());
    }

    #[test]
    fn unlink_inherited_spouse_link_does_not_clear_spouse() {
        let db = test_db();
        let (_foyer_id, flora_id, conjoint_id) = couple_foyer_with_members(&db);
        db.set_contact_onedrive_link(flora_id, "folder-abc", "PERALTA Flora", None)
            .unwrap();

        assert!(!db.clear_onedrive_link_for_contact(conjoint_id).unwrap());
        assert!(db
            .resolve_contact_onedrive_link(flora_id)
            .unwrap()
            .is_some());
        assert!(db
            .resolve_contact_onedrive_link(conjoint_id)
            .unwrap()
            .is_some());
    }

    #[test]
    fn propagate_onedrive_folder_link_rename_updates_all_contacts() {
        let db = test_db();
        let parent = db.create_contact(sample_contact("GUETTE", "Julie")).unwrap();
        let child = db.create_contact(sample_contact("GUETTE", "Emma")).unwrap();
        let parent_id = parent.id.unwrap();
        let child_id = child.id.unwrap();
        db.set_contact_onedrive_link(parent_id, "folder-old", "GUETTE Julie", None)
            .unwrap();
        db.set_contact_onedrive_link(child_id, "folder-old", "GUETTE Julie", None)
            .unwrap();

        db.propagate_onedrive_folder_link_rename(
            "folder-old",
            "folder-new",
            "GUETTE Julie",
            Some("https://example.com/new"),
        )
        .unwrap();

        for contact_id in [parent_id, child_id] {
            let link = db
                .resolve_contact_onedrive_link(contact_id)
                .unwrap()
                .expect("contact still linked");
            assert_eq!(link.folder_id, "folder-new");
            assert_eq!(link.folder_name, "GUETTE Julie");
        }
    }
}
