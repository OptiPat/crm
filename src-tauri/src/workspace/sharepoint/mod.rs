mod client;
mod conflict;
mod schema;
mod urls;
#[cfg(test)]
pub(crate) mod test_server;

pub use client::{
    map_graph_http_error, ParsedDriveItem, ParsedSharePointDeltaItem, ParsedSharePointDrive,
    ParsedSharePointListItem, SharePointConnectionTestResult, SharePointDeltaResult,
    SharePointGraphClient, SharePointSiteRef,
};
#[cfg(test)]
pub use client::GraphEntityVersion;
pub use conflict::{GraphWriteConflict, GraphWriteOutcome};
#[cfg(test)]
pub use conflict::PreconditionFailedDetails;
pub use schema::{
    LIST_CRM_AUDIT, LIST_CRM_DATA, LIST_CRM_LOCKS, LIST_CRM_PRESENCE, LIST_CRM_SEQUENCES,
    TEAM_WORKSPACE_LISTS,
};
pub use urls::SharePointGraphUrls;
