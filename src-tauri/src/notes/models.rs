use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PersonalNote {
    pub id: i64,
    pub title: String,
    pub content_html: String,
    pub category: Option<String>,
    pub pinned: bool,
    pub created_at: i64,
    pub updated_at: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct NewPersonalNote {
    pub title: String,
    pub content_html: String,
    pub category: Option<String>,
    pub pinned: Option<bool>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UpdatePersonalNote {
    pub title: String,
    pub content_html: String,
    pub category: Option<String>,
    pub pinned: Option<bool>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SharedNoteContribution {
    pub id: String,
    pub note_id: String,
    pub author_installation_id: String,
    pub author_name: String,
    pub content_html: String,
    pub created_at: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SharedNote {
    pub id: String,
    pub title: String,
    pub content_html: String,
    pub author_installation_id: String,
    pub author_name: String,
    pub created_at: i64,
    pub updated_at: i64,
    pub contributions: Vec<SharedNoteContribution>,
    pub can_edit: bool,
    pub can_delete: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct NewSharedNote {
    pub title: String,
    pub content_html: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UpdateSharedNote {
    pub title: String,
    pub content_html: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct NewSharedNoteContribution {
    pub note_id: String,
    pub content_html: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SharedNotesSyncResult {
    pub synced: bool,
    pub notes: Vec<SharedNote>,
    pub message: Option<String>,
}
