use super::SharePointSiteRef;

const GRAPH_HOST: &str = "https://graph.microsoft.com";

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct SharePointGraphUrls {
    pub api_version: String,
    pub site: SharePointSiteRef,
    graph_host: String,
}

impl SharePointGraphUrls {
    pub fn new(site: SharePointSiteRef) -> Self {
        Self {
            api_version: "v1.0".into(),
            site,
            graph_host: GRAPH_HOST.into(),
        }
    }

    pub fn with_api_version(mut self, api_version: impl Into<String>) -> Self {
        self.api_version = api_version.into();
        self
    }

    #[cfg(test)]
    pub fn with_graph_host(mut self, graph_host: impl Into<String>) -> Self {
        self.graph_host = graph_host.into().trim_end_matches('/').to_string();
        self
    }

    fn base(&self) -> String {
        format!("{}/{}", self.graph_host, self.api_version)
    }

    /// Résout un site SharePoint par hostname et chemin (`/sites/crm`).
    pub fn site_by_path(&self) -> String {
        let path = if self.site.site_path.starts_with('/') {
            self.site.site_path.clone()
        } else {
            format!("/{}", self.site.site_path)
        };
        format!("{}/sites/{}:{}", self.base(), self.site.hostname, path)
    }

    pub fn site_lists(&self, site_id: &str) -> String {
        format!("{}/sites/{site_id}/lists", self.base())
    }

    pub fn site_lists_filtered(&self, site_id: &str, filter: &str) -> String {
        format!(
            "{}/sites/{site_id}/lists?$filter={}",
            self.base(),
            encode_odata_filter(filter)
        )
    }

    pub fn create_site_list(&self, site_id: &str) -> String {
        format!("{}/sites/{site_id}/lists", self.base())
    }

    pub fn list_columns(&self, site_id: &str, list_id: &str) -> String {
        format!("{}/sites/{site_id}/lists/{list_id}/columns", self.base())
    }

    pub fn list_items(&self, site_id: &str, list_id: &str) -> String {
        format!(
            "{}/sites/{site_id}/lists/{list_id}/items?expand=fields",
            self.base()
        )
    }

    pub fn list_items_filtered(&self, site_id: &str, list_id: &str, filter: &str) -> String {
        format!(
            "{}/sites/{site_id}/lists/{list_id}/items?expand=fields&$filter={}",
            self.base(),
            encode_odata_filter(filter)
        )
    }

    pub fn list_items_delta(&self, site_id: &str, list_id: &str) -> String {
        format!(
            "{}/sites/{site_id}/lists/{list_id}/items/delta?$expand=fields",
            self.base()
        )
    }

    pub fn list_item(&self, site_id: &str, list_id: &str, item_id: &str) -> String {
        format!(
            "{}/sites/{site_id}/lists/{list_id}/items/{item_id}?expand=fields",
            self.base()
        )
    }

    pub fn list_item_fields(&self, site_id: &str, list_id: &str, item_id: &str) -> String {
        format!(
            "{}/sites/{site_id}/lists/{list_id}/items/{item_id}/fields",
            self.base()
        )
    }

    pub fn delete_list_item(&self, site_id: &str, list_id: &str, item_id: &str) -> String {
        format!(
            "{}/sites/{site_id}/lists/{list_id}/items/{item_id}",
            self.base()
        )
    }

    pub fn site_drives(&self, site_id: &str) -> String {
        format!("{}/sites/{site_id}/drives", self.base())
    }

    #[cfg(test)]
    pub fn drive_root_children(&self, drive_id: &str) -> String {
        format!("{}/drives/{drive_id}/root/children", self.base())
    }

    pub fn drive_root_file_content(&self, drive_id: &str, file_name: &str) -> String {
        format!(
            "{}/drives/{drive_id}/root:/{file_name}:/content",
            self.base()
        )
    }

    pub fn drive_item_content(&self, drive_id: &str, item_id: &str) -> String {
        format!("{}/drives/{drive_id}/items/{item_id}/content", self.base())
    }

    pub fn drive_item(&self, drive_id: &str, item_id: &str) -> String {
        format!("{}/drives/{drive_id}/items/{item_id}", self.base())
    }
}

fn encode_odata_filter(filter: &str) -> String {
    filter
        .chars()
        .map(|ch| match ch {
            ' ' => "%20".to_string(),
            '\'' => "%27".to_string(),
            '=' => "%3D".to_string(),
            '&' => "%26".to_string(),
            other => other.to_string(),
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    fn sample_site() -> SharePointSiteRef {
        SharePointSiteRef {
            hostname: "contoso.sharepoint.com".into(),
            site_path: "/sites/crm-team".into(),
        }
    }

    #[test]
    fn site_by_path_uses_hostname_colon_path_format() {
        let urls = SharePointGraphUrls::new(sample_site());
        assert_eq!(
            urls.site_by_path(),
            "https://graph.microsoft.com/v1.0/sites/contoso.sharepoint.com:/sites/crm-team"
        );
    }

    #[test]
    fn site_lists_filtered_encodes_spaces_and_quotes() {
        let urls = SharePointGraphUrls::new(sample_site());
        let url = urls.site_lists_filtered("site-abc", "displayName eq 'CRM_Presence'");
        assert!(url.contains("displayName%20eq%20%27CRM_Presence%27"));
    }

    #[test]
    fn list_and_drive_urls_are_composed_from_site_and_resource_ids() {
        let urls = SharePointGraphUrls::new(sample_site());
        assert_eq!(
            urls.list_items("site-abc", "list-123"),
            "https://graph.microsoft.com/v1.0/sites/site-abc/lists/list-123/items?expand=fields"
        );
        assert_eq!(
            urls.drive_root_children("drive-xyz"),
            "https://graph.microsoft.com/v1.0/drives/drive-xyz/root/children"
        );
        assert_eq!(
            urls.drive_root_file_content("drive-xyz", "CRM_Document_7_test.pdf"),
            "https://graph.microsoft.com/v1.0/drives/drive-xyz/root:/CRM_Document_7_test.pdf:/content"
        );
        assert_eq!(
            urls.drive_item_content("drive-xyz", "item-7"),
            "https://graph.microsoft.com/v1.0/drives/drive-xyz/items/item-7/content"
        );
    }
}
