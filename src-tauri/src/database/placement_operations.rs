//! Suivi des opérations partenaire Stellium Box Placement.

use rusqlite::{params, OptionalExtension, Result, Row};
use super::pipe::{PIPE_TYPE_AFFAIRE, PIPE_TYPE_ACTE_GESTION};

pub fn placement_operation_requires_montant(
    operation_type: &str,
    stellium_label: Option<&str>,
    pipe_type: Option<&str>,
) -> bool {
    let op = operation_type.trim().to_uppercase();
    let label = stellium_label.unwrap_or("").trim();
    let pipe = pipe_type.unwrap_or("").trim();
    if op == OP_SOUSCRIPTION && pipe == PIPE_TYPE_AFFAIRE {
        return true;
    }
    if op == OP_VERSEMENT {
        if pipe == PIPE_TYPE_AFFAIRE {
            return true;
        }
        if pipe == PIPE_TYPE_ACTE_GESTION && label == "Versement complémentaire" {
            return true;
        }
    }
    false
}

fn merge_placement_remuneration_fields_on_existing(
    conn: &rusqlite::Connection,
    existing_id: i64,
    input: &super::models::NewPlacementOperation,
) -> Result<()> {
    let mut sets: Vec<&str> = Vec::new();
    let now = now_unix();
    if input.montant_centimes.filter(|m| *m > 0).is_some() {
        sets.push("montant_centimes");
    }
    if input
        .type_produit
        .as_ref()
        .map(|s| !s.trim().is_empty())
        .unwrap_or(false)
    {
        sets.push("type_produit");
    }
    if sets.is_empty() {
        return Ok(());
    }
    let sql = format!(
        "UPDATE placement_operations SET montant_centimes = COALESCE(?1, montant_centimes),
         type_produit = COALESCE(?2, type_produit), updated_at = ?3 WHERE id = ?4"
    );
    conn.execute(
        &sql,
        params![
            input.montant_centimes,
            input.type_produit,
            now,
            existing_id
        ],
    )?;
    Ok(())
}

pub const STATUS_PENDING: &str = "PENDING";
pub const STATUS_CONFORME: &str = "CONFORME";
pub const STATUS_NON_CONFORME: &str = "NON_CONFORME";

pub const OP_ARBITRAGE: &str = "ARBITRAGE";
pub const OP_VERSEMENT: &str = "VERSEMENT";
pub const OP_REINVESTISSEMENT: &str = "REINVESTISSEMENT";
pub const OP_SOUSCRIPTION: &str = "SOUSCRIPTION";
pub const OP_AUTRE: &str = "AUTRE";

const VALID_STATUSES: &[&str] = &[STATUS_PENDING, STATUS_CONFORME, STATUS_NON_CONFORME];
const VALID_OPERATION_TYPES: &[&str] = &[
    OP_ARBITRAGE,
    OP_VERSEMENT,
    OP_REINVESTISSEMENT,
    OP_SOUSCRIPTION,
    OP_AUTRE,
];

pub fn is_valid_placement_status(status: &str) -> bool {
    VALID_STATUSES.contains(&status)
}

pub fn is_valid_placement_operation_type(operation_type: &str) -> bool {
    VALID_OPERATION_TYPES.contains(&operation_type)
}

fn now_unix() -> i64 {
    chrono::Utc::now().timestamp()
}

fn map_placement_row(row: &Row<'_>) -> Result<super::models::PlacementOperation> {
    Ok(super::models::PlacementOperation {
        id: row.get(0)?,
        contact_id: row.get(1)?,
        pipe_id: row.get(2)?,
        pipe_timeline_entry_id: row.get(3)?,
        operation_type: row.get(4)?,
        product_label: row.get(5)?,
        stellium_label: row.get(6)?,
        status: row.get(7)?,
        gmail_message_id: row.get(8)?,
        email_subject: row.get(9)?,
        email_received_at: row.get(10)?,
        created_at: row.get(11)?,
        updated_at: row.get(12)?,
        client_notified_at: row.get(13)?,
        non_conforme_at: row.get(14)?,
        partner_resent_at: row.get(15)?,
        dismissed_at: row.get(16)?,
        montant_centimes: row.get(17)?,
        type_produit: row.get(18)?,
        investissement_id: row.get(19)?,
        pv_manual: row.get(20)?,
    })
}

const PLACEMENT_SELECT: &str = "po.id, po.contact_id, po.pipe_id, po.pipe_timeline_entry_id,
    po.operation_type, po.product_label, po.stellium_label, po.status,
    po.gmail_message_id, po.email_subject, po.email_received_at, po.created_at, po.updated_at,
    po.client_notified_at, po.non_conforme_at, po.partner_resent_at, po.dismissed_at,
    po.montant_centimes, po.type_produit, po.investissement_id, po.pv_manual";

pub fn placement_operation_is_dismissed(op: &super::models::PlacementOperation) -> bool {
    op.dismissed_at.map(|t| t > 0).unwrap_or(false)
}

pub fn normalize_stellium_label(value: &str) -> String {
    value
        .trim()
        .to_lowercase()
        .replace('é', "e")
        .replace('è', "e")
        .replace('ê', "e")
}

pub fn placement_stellium_labels_match(declared: &str, from_email: &str) -> bool {
    normalize_stellium_label(declared) == normalize_stellium_label(from_email)
}

fn operation_has_stellium_label(op: &super::models::PlacementOperation) -> bool {
    op.stellium_label
        .as_ref()
        .map(|s| !s.trim().is_empty())
        .unwrap_or(false)
}

fn filter_candidates_by_stellium_label(
    candidates: Vec<super::models::PlacementOperation>,
    stellium_label: &str,
) -> Vec<super::models::PlacementOperation> {
    candidates
        .into_iter()
        .filter(|op| {
            op.stellium_label
                .as_ref()
                .map(|label| placement_stellium_labels_match(label, stellium_label))
                .unwrap_or(false)
        })
        .collect()
}

fn filter_candidates_legacy_operation_type(
    candidates: Vec<super::models::PlacementOperation>,
    operation_type: &str,
) -> Vec<super::models::PlacementOperation> {
    candidates
        .into_iter()
        .filter(|op| !operation_has_stellium_label(op) && op.operation_type == operation_type)
        .collect()
}

fn pool_candidates_for_stellium_label(
    candidates: Vec<super::models::PlacementOperation>,
    stellium_label: &str,
) -> Vec<super::models::PlacementOperation> {
    let by_label = filter_candidates_by_stellium_label(candidates.clone(), stellium_label);
    if !by_label.is_empty() {
        return by_label;
    }
    let operation_type_legacy = map_stellium_label_to_operation_type(stellium_label);
    filter_candidates_legacy_operation_type(candidates, operation_type_legacy)
}

pub fn normalize_stellium_product_label(value: &str) -> String {
    let mut normalized = value
        .trim()
        .to_lowercase()
        .replace('é', "e")
        .replace('è', "e")
        .replace('ê', "e")
        .replace('\u{2019}', "'");
    loop {
        let stripped = strip_alpsi_cif_product_suffix(&normalized);
        if stripped == normalized {
            break;
        }
        normalized = stripped;
    }
    normalized.split_whitespace().collect::<Vec<_>>().join(" ")
}

fn strip_alpsi_cif_product_suffix(value: &str) -> String {
    let mut s = value.trim().to_string();
    loop {
        let lower = s.to_lowercase();
        let Some(next) = lower
            .strip_suffix(" (alpsi)")
            .or_else(|| lower.strip_suffix(" (cif)"))
            .or_else(|| lower.strip_suffix(" alpsi"))
            .or_else(|| lower.strip_suffix(" cif"))
        else {
            break;
        };
        s = next.trim().to_string();
    }
    s
}

pub fn placement_stellium_products_match(declared: &str, from_email: &str) -> bool {
    normalize_stellium_product_label(declared) == normalize_stellium_product_label(from_email)
}

pub fn map_stellium_label_to_operation_type(label: &str) -> &'static str {
    let lower = normalize_stellium_label(label);
    if lower.contains("arbitrage") {
        return OP_ARBITRAGE;
    }
    if lower.contains("versement") {
        return OP_VERSEMENT;
    }
    if lower.contains("reinvestissement") {
        return OP_REINVESTISSEMENT;
    }
    if lower.contains("souscription") {
        return OP_SOUSCRIPTION;
    }
    OP_AUTRE
}

pub fn placement_conforme_needs_client_notify(
    op: &super::models::PlacementOperation,
) -> bool {
    op.status == STATUS_CONFORME
        && !op.client_notified_at.map(|t| t > 0).unwrap_or(false)
}

/// Email client auto : uniquement si l'opération a été journalisée sur un pipe (Suivi ou affaire).
pub fn placement_operation_is_pipe_tracked(
    op: &super::models::PlacementOperation,
) -> bool {
    op.pipe_timeline_entry_id.map(|id| id > 0).unwrap_or(false)
}

pub fn placement_operation_eligible_for_client_email(
    op: &super::models::PlacementOperation,
) -> bool {
    placement_conforme_needs_client_notify(op) && placement_operation_is_pipe_tracked(op)
}

impl super::Database {
    pub fn migrate_placement_operations_table(&self) -> Result<()> {
        self.conn.execute_batch(
            "
            CREATE TABLE IF NOT EXISTS placement_operations (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                contact_id INTEGER NOT NULL,
                pipe_id INTEGER,
                pipe_timeline_entry_id INTEGER,
                operation_type TEXT NOT NULL,
                product_label TEXT,
                stellium_label TEXT,
                status TEXT NOT NULL DEFAULT 'PENDING',
                gmail_message_id TEXT,
                email_subject TEXT,
                email_received_at INTEGER,
                created_at INTEGER NOT NULL,
                updated_at INTEGER NOT NULL,
                FOREIGN KEY (contact_id) REFERENCES contacts(id) ON DELETE CASCADE,
                FOREIGN KEY (pipe_id) REFERENCES pipes(id) ON DELETE SET NULL,
                FOREIGN KEY (pipe_timeline_entry_id) REFERENCES pipe_timeline_entries(id) ON DELETE SET NULL
            );
            CREATE UNIQUE INDEX IF NOT EXISTS idx_placement_ops_gmail
                ON placement_operations(gmail_message_id)
                WHERE gmail_message_id IS NOT NULL;
            CREATE INDEX IF NOT EXISTS idx_placement_ops_contact ON placement_operations(contact_id);
            CREATE INDEX IF NOT EXISTS idx_placement_ops_pipe ON placement_operations(pipe_id);
            CREATE INDEX IF NOT EXISTS idx_placement_ops_status ON placement_operations(status);
            ",
        )?;
        if !self.table_has_column("placement_operations", "client_notified_at")? {
            self.conn.execute(
                "ALTER TABLE placement_operations ADD COLUMN client_notified_at INTEGER",
                [],
            )?;
            println!("✅ Migration: client_notified_at sur placement_operations");
        }
        if !self.table_has_column("placement_operations", "non_conforme_at")? {
            self.conn.execute(
                "ALTER TABLE placement_operations ADD COLUMN non_conforme_at INTEGER",
                [],
            )?;
            println!("✅ Migration: non_conforme_at sur placement_operations");
        }
        if !self.table_has_column("placement_operations", "partner_resent_at")? {
            self.conn.execute(
                "ALTER TABLE placement_operations ADD COLUMN partner_resent_at INTEGER",
                [],
            )?;
            println!("✅ Migration: partner_resent_at sur placement_operations");
        }
        if !self.table_has_column("placement_operations", "dismissed_at")? {
            self.conn.execute(
                "ALTER TABLE placement_operations ADD COLUMN dismissed_at INTEGER",
                [],
            )?;
            println!("✅ Migration: dismissed_at sur placement_operations");
        }
        if !self.table_has_column("placement_operations", "montant_centimes")? {
            self.conn.execute(
                "ALTER TABLE placement_operations ADD COLUMN montant_centimes INTEGER",
                [],
            )?;
            println!("✅ Migration: montant_centimes sur placement_operations");
        }
        if !self.table_has_column("placement_operations", "type_produit")? {
            self.conn.execute(
                "ALTER TABLE placement_operations ADD COLUMN type_produit TEXT",
                [],
            )?;
            println!("✅ Migration: type_produit sur placement_operations");
        }
        if !self.table_has_column("placement_operations", "investissement_id")? {
            self.conn.execute(
                "ALTER TABLE placement_operations ADD COLUMN investissement_id INTEGER",
                [],
            )?;
            println!("✅ Migration: investissement_id sur placement_operations");
        }
        if !self.table_has_column("placement_operations", "pv_manual")? {
            self.conn.execute(
                "ALTER TABLE placement_operations ADD COLUMN pv_manual REAL",
                [],
            )?;
            println!("✅ Migration: pv_manual sur placement_operations");
        }
        Ok(())
    }

    pub fn create_placement_operation(
        &self,
        input: super::models::NewPlacementOperation,
    ) -> Result<super::models::PlacementOperation> {
        if input.contact_id <= 0 {
            return Err(rusqlite::Error::InvalidParameterName(
                "contact_id invalide".into(),
            ));
        }
        if !is_valid_placement_operation_type(&input.operation_type) {
            return Err(rusqlite::Error::InvalidParameterName(
                "operation_type invalide".into(),
            ));
        }

        let mut pipe_type: Option<String> = None;
        let mut existing_pending: Option<super::models::PlacementOperation> = None;
        if let Some(pipe_id) = input.pipe_id.filter(|id| *id > 0) {
            pipe_type = Some(self.get_pipe_by_id(pipe_id)?.pipe_type);
            existing_pending = if let Some(label) = input
                .stellium_label
                .as_ref()
                .filter(|s| !s.trim().is_empty())
            {
                self.find_pending_placement_for_pipe_label(
                    pipe_id,
                    label,
                    input.product_label.as_deref(),
                )?
            } else {
                self.find_pending_placement_for_pipe(pipe_id, &input.operation_type)?
            };
        }
        let requires_montant = placement_operation_requires_montant(
            &input.operation_type,
            input.stellium_label.as_deref(),
            pipe_type.as_deref(),
        );
        let has_montant = input.montant_centimes.filter(|m| *m > 0).is_some()
            || existing_pending
                .as_ref()
                .and_then(|op| op.montant_centimes)
                .filter(|m| *m > 0)
                .is_some();
        if requires_montant && !has_montant {
            return Err(rusqlite::Error::InvalidParameterName(
                "montant souscrit requis pour cette opération".into(),
            ));
        }

        let mut existing_to_link = existing_pending;
        if existing_to_link.is_none() {
            if let (Some(pipe_id), Some(_)) = (
                input.pipe_id.filter(|id| *id > 0),
                input.pipe_timeline_entry_id.filter(|id| *id > 0),
            ) {
                if let Some(label) = input
                    .stellium_label
                    .as_ref()
                    .filter(|s| !s.trim().is_empty())
                {
                    existing_to_link = self.find_placement_for_workflow_journal_link(
                        pipe_id,
                        label,
                        input.product_label.as_deref(),
                    )?;
                }
            }
        }

        if let Some(pipe_id) = input.pipe_id {
            if pipe_id > 0 {
                if let Some(existing) = existing_to_link {
                    merge_placement_remuneration_fields_on_existing(
                        &self.conn,
                        existing.id,
                        &input,
                    )?;
                    if let Some(entry_id) = input.pipe_timeline_entry_id.filter(|id| *id > 0) {
                        if existing.pipe_timeline_entry_id != Some(entry_id) {
                            let now = now_unix();
                            self.conn.execute(
                                "UPDATE placement_operations
                                 SET pipe_timeline_entry_id = ?1, updated_at = ?2
                                 WHERE id = ?3",
                                params![entry_id, now, existing.id],
                            )?;
                            self.maybe_create_investissement_from_gagnee_affaire(pipe_id, None)?;
                            return self.get_placement_operation_by_id(existing.id);
                        }
                    }
                    self.maybe_create_investissement_from_gagnee_affaire(pipe_id, None)?;
                    return self.get_placement_operation_by_id(existing.id);
                }
            }
        }
        let now = now_unix();
        self.conn.execute(
            "INSERT INTO placement_operations (
                contact_id, pipe_id, pipe_timeline_entry_id, operation_type,
                product_label, stellium_label, status, created_at, updated_at,
                montant_centimes, type_produit
             ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11)",
            params![
                input.contact_id,
                input.pipe_id,
                input.pipe_timeline_entry_id,
                input.operation_type,
                input.product_label,
                input.stellium_label,
                STATUS_PENDING,
                now,
                now,
                input.montant_centimes,
                input.type_produit,
            ],
        )?;
        let id = self.conn.last_insert_rowid();
        if let Some(pipe_id) = input.pipe_id.filter(|id| *id > 0) {
            self.maybe_create_investissement_from_gagnee_affaire(pipe_id, None)?;
        }
        self.get_placement_operation_by_id(id)
    }

    pub fn get_placement_operation_by_id(
        &self,
        id: i64,
    ) -> Result<super::models::PlacementOperation> {
        let mut stmt = self.conn.prepare(&format!(
            "SELECT {PLACEMENT_SELECT} FROM placement_operations po WHERE po.id = ?1"
        ))?;
        let mut rows = stmt.query_map(params![id], map_placement_row)?;
        rows.next()
            .transpose()?
            .ok_or(rusqlite::Error::QueryReturnedNoRows)
    }

    pub fn list_placement_operations_for_pipe(
        &self,
        pipe_id: i64,
    ) -> Result<Vec<super::models::PlacementOperation>> {
        let mut stmt = self.conn.prepare(&format!(
            "SELECT {PLACEMENT_SELECT}
             FROM placement_operations po
             WHERE po.pipe_id = ?1
             ORDER BY po.updated_at DESC, po.id DESC"
        ))?;
        let rows = stmt.query_map(params![pipe_id], map_placement_row)?;
        let mut result = Vec::new();
        for row in rows {
            result.push(row?);
        }
        Ok(result)
    }

    pub fn list_placement_operations_with_contacts(
        &self,
    ) -> Result<Vec<super::models::PlacementOperationWithContact>> {
        let mut stmt = self.conn.prepare(&format!(
            "SELECT {PLACEMENT_SELECT}, c.nom, c.prenom, p.titre
             FROM placement_operations po
             INNER JOIN contacts c ON c.id = po.contact_id
             LEFT JOIN pipes p ON p.id = po.pipe_id
             ORDER BY
               CASE po.status
                 WHEN 'NON_CONFORME' THEN 0
                 WHEN 'PENDING' THEN 1
                 WHEN 'CONFORME' THEN
                   CASE
                     WHEN po.client_notified_at IS NULL OR po.client_notified_at <= 0 THEN 2
                     ELSE 4
                   END
                 ELSE 3
               END,
               po.updated_at DESC,
               po.id DESC"
        ))?;
        let rows = stmt.query_map([], |row| {
            let operation = map_placement_row(row)?;
            Ok(super::models::PlacementOperationWithContact {
                operation,
                contact_nom: row.get(21)?,
                contact_prenom: row.get(22)?,
                pipe_titre: row.get(23)?,
            })
        })?;
        let mut result = Vec::new();
        for row in rows {
            result.push(row?);
        }
        Ok(result)
    }

    fn find_pending_placement_for_pipe_label(
        &self,
        pipe_id: i64,
        stellium_label: &str,
        product_label: Option<&str>,
    ) -> Result<Option<super::models::PlacementOperation>> {
        let pending = self.list_placements_for_pipe_and_status(pipe_id, STATUS_PENDING, false)?;
        let pool = pool_candidates_for_stellium_label(pending, stellium_label);
        let pool = Self::filter_pool_by_declared_product(pool, product_label);
        Ok(pool.into_iter().next())
    }

    /// Opération déjà répondue par Stellium mais sans journal d'envoi CRM (course mail / confirmation).
    fn find_placement_for_workflow_journal_link(
        &self,
        pipe_id: i64,
        stellium_label: &str,
        product_label: Option<&str>,
    ) -> Result<Option<super::models::PlacementOperation>> {
        let mut candidates = Vec::new();
        for status in [STATUS_CONFORME, STATUS_NON_CONFORME] {
            candidates.extend(self.list_placements_for_pipe_and_status(pipe_id, status, false)?);
        }
        let pool = pool_candidates_for_stellium_label(candidates, stellium_label);
        let pool = Self::filter_pool_by_declared_product(pool, product_label);
        let pool: Vec<_> = pool
            .into_iter()
            .filter(|op| {
                !placement_operation_is_dismissed(op)
                    && !op.pipe_timeline_entry_id.map(|id| id > 0).unwrap_or(false)
            })
            .collect();
        Ok(pool.into_iter().next())
    }

    fn journal_placement_partner_email_response(
        &self,
        op: &super::models::PlacementOperation,
        status: &str,
        email_received_at: i64,
        email_subject: Option<&str>,
    ) -> Result<()> {
        let pipe_id = match op.pipe_id.filter(|id| *id > 0) {
            Some(id) => id,
            None => return Ok(()),
        };
        let titre = match status {
            STATUS_CONFORME => "Réponse Stellium — Conforme",
            STATUS_NON_CONFORME => "Réponse Stellium — Non conforme",
            _ => return Ok(()),
        };
        let mut contenu_parts: Vec<String> = Vec::new();
        if let Some(acte) = op
            .stellium_label
            .as_ref()
            .map(|s| s.trim())
            .filter(|s| !s.is_empty())
        {
            contenu_parts.push(acte.to_string());
        }
        if let Some(produit) = op
            .product_label
            .as_ref()
            .map(|s| s.trim())
            .filter(|s| !s.is_empty())
        {
            contenu_parts.push(produit.to_string());
        }
        if let Some(subj) = email_subject.map(str::trim).filter(|s| !s.is_empty()) {
            contenu_parts.push(subj.to_string());
        }
        let contenu = if contenu_parts.is_empty() {
            None
        } else {
            Some(contenu_parts.join("\n"))
        };
        self.create_pipe_timeline_entry(super::models::NewPipeTimelineEntry {
            pipe_id,
            entry_type: "NOTE".into(),
            titre: Some(titre.into()),
            contenu,
            occurred_at: Some(email_received_at),
        })?;
        Ok(())
    }

    fn find_pending_placement_for_pipe(
        &self,
        pipe_id: i64,
        operation_type: &str,
    ) -> Result<Option<super::models::PlacementOperation>> {
        let mut stmt = self.conn.prepare(&format!(
            "SELECT {PLACEMENT_SELECT}
             FROM placement_operations po
             WHERE po.pipe_id = ?1 AND po.operation_type = ?2 AND po.status = ?3
             ORDER BY po.id DESC
             LIMIT 1"
        ))?;
        let mut rows = stmt.query_map(
            params![pipe_id, operation_type, STATUS_PENDING],
            map_placement_row,
        )?;
        Ok(rows.next().transpose()?)
    }

    /// Le mail Stellium doit être postérieur à la déclaration CRM (journal / création opération).
    pub(crate) fn placement_email_received_after_operation_created(
        op: &super::models::PlacementOperation,
        email_received_at: i64,
    ) -> bool {
        email_received_at >= op.created_at
    }

    fn filter_placement_candidates_by_email_date(
        candidates: Vec<super::models::PlacementOperation>,
        email_received_at: i64,
    ) -> Vec<super::models::PlacementOperation> {
        candidates
            .into_iter()
            .filter(|op| Self::placement_email_received_after_operation_created(op, email_received_at))
            .collect()
    }

    pub fn placement_operation_exists_for_gmail(&self, gmail_message_id: &str) -> Result<bool> {
        let count: i64 = self.conn.query_row(
            "SELECT COUNT(*) FROM placement_operations WHERE gmail_message_id = ?1",
            params![gmail_message_id],
            |row| row.get(0),
        )?;
        Ok(count > 0)
    }

    pub fn get_placement_operation_by_gmail_message_id(
        &self,
        gmail_message_id: &str,
    ) -> Result<Option<super::models::PlacementOperation>> {
        let mut stmt = self.conn.prepare(&format!(
            "SELECT {PLACEMENT_SELECT} FROM placement_operations po WHERE po.gmail_message_id = ?1"
        ))?;
        let mut rows = stmt.query_map(params![gmail_message_id], map_placement_row)?;
        Ok(rows.next().transpose()?)
    }

    pub fn update_placement_operation_status(
        &self,
        id: i64,
        status: &str,
    ) -> Result<super::models::PlacementOperation> {
        if !is_valid_placement_status(status) {
            return Err(rusqlite::Error::InvalidParameterName(
                "status invalide".into(),
            ));
        }
        let now = now_unix();
        self.conn.execute(
            "UPDATE placement_operations SET status = ?1, updated_at = ?2 WHERE id = ?3",
            params![status, now, id],
        )?;
        self.get_placement_operation_by_id(id)
    }

    pub fn mark_placement_client_notified(&self, id: i64) -> Result<bool> {
        let op = self.get_placement_operation_by_id(id)?;
        if !placement_operation_eligible_for_client_email(&op) {
            return Ok(false);
        }
        let now = now_unix();
        let updated = self.conn.execute(
            "UPDATE placement_operations SET client_notified_at = ?1, updated_at = ?2
             WHERE id = ?3 AND (client_notified_at IS NULL OR client_notified_at <= 0)",
            params![now, now, id],
        )?;
        Ok(updated > 0)
    }

    /// Marque le renvoi du dossier corrigé chez Stellium (parcours non conforme).
    /// Retire l'opération du tableau et du suivi actif (sans envoi mail client).
    /// Retire du workflow les actes encore liés à un pipe (ex. suppression du suivi).
    pub fn dismiss_placement_operations_for_pipe(&self, pipe_id: i64) -> Result<u32> {
        let now = now_unix();
        let updated = self.conn.execute(
            "UPDATE placement_operations SET dismissed_at = ?1, updated_at = ?1
             WHERE pipe_id = ?2
             AND (dismissed_at IS NULL OR dismissed_at <= 0)",
            params![now, pipe_id],
        )?;
        Ok(updated as u32)
    }

    pub fn dismiss_placement_operation(
        &self,
        id: i64,
    ) -> Result<super::models::PlacementOperation> {
        let op = self.get_placement_operation_by_id(id)?;
        if op.status == STATUS_NON_CONFORME {
            return Err(rusqlite::Error::InvalidParameterName(
                "retrait impossible sur une opération non conforme — traiter ou marquer conforme".into(),
            ));
        }
        if placement_operation_is_dismissed(&op) {
            return Ok(op);
        }
        let now = now_unix();
        self.conn.execute(
            "UPDATE placement_operations SET dismissed_at = ?1, updated_at = ?2
             WHERE id = ?3",
            params![now, now, id],
        )?;
        self.get_placement_operation_by_id(id)
    }

    pub fn mark_placement_partner_resent(&self, id: i64) -> Result<super::models::PlacementOperation> {
        let op = self.get_placement_operation_by_id(id)?;
        if op.status != STATUS_NON_CONFORME {
            return Err(rusqlite::Error::InvalidParameterName(
                "renvoi partenaire uniquement si non conforme".into(),
            ));
        }
        let now = now_unix();
        self.conn.execute(
            "UPDATE placement_operations SET partner_resent_at = ?1, updated_at = ?2 WHERE id = ?3",
            params![now, now, id],
        )?;
        self.get_placement_operation_by_id(id)
    }

    /// Réserve l'envoi client (atomique) avant sendEmail — évite les doubles envois concurrents.
    pub fn reserve_placement_client_notification(&self, id: i64) -> Result<bool> {
        let op = self.get_placement_operation_by_id(id)?;
        if !placement_operation_eligible_for_client_email(&op) {
            return Ok(false);
        }
        let now = now_unix();
        let updated = self.conn.execute(
            "UPDATE placement_operations SET client_notified_at = ?1, updated_at = ?2
             WHERE id = ?3
               AND status = ?4
               AND (client_notified_at IS NULL OR client_notified_at <= 0)
               AND pipe_timeline_entry_id IS NOT NULL
               AND pipe_timeline_entry_id > 0",
            params![now, now, id, STATUS_CONFORME],
        )?;
        Ok(updated > 0)
    }

    pub fn release_placement_client_notification(&self, id: i64) -> Result<bool> {
        let now = now_unix();
        let updated = self.conn.execute(
            "UPDATE placement_operations SET client_notified_at = NULL, updated_at = ?1
             WHERE id = ?2",
            params![now, id],
        )?;
        Ok(updated > 0)
    }

    pub fn find_latest_suivi_pipe_id_for_contact(
        &self,
        contact_id: i64,
    ) -> Result<Option<i64>> {
        self.conn
            .query_row(
                "SELECT id FROM pipes
                 WHERE contact_id = ?1 AND pipe_type = ?2
                 ORDER BY updated_at DESC, id DESC
                 LIMIT 1",
                params![contact_id, PIPE_TYPE_ACTE_GESTION],
                |row| row.get(0),
            )
            .optional()
    }

    fn placement_products_match(declared: &str, from_email: &str) -> bool {
        placement_stellium_products_match(declared, from_email)
    }

    fn filter_pool_by_declared_product(
        candidates: Vec<super::models::PlacementOperation>,
        product_label: Option<&str>,
    ) -> Vec<super::models::PlacementOperation> {
        match product_label.filter(|s| !s.trim().is_empty()) {
            Some(product) => candidates
                .into_iter()
                .filter(|op| {
                    op.product_label
                        .as_ref()
                        .map(|p| Self::placement_products_match(p, product))
                        .unwrap_or(false)
                })
                .collect(),
            None => candidates
                .into_iter()
                .filter(|op| {
                    op.product_label
                        .as_ref()
                        .map(|s| s.trim().is_empty())
                        .unwrap_or(true)
                })
                .collect(),
        }
    }

    fn pick_oldest_placement_candidate(
        pool: Vec<super::models::PlacementOperation>,
    ) -> Option<super::models::PlacementOperation> {
        let mut sorted = pool;
        sorted.sort_by_key(|op| (op.created_at, op.id));
        sorted.into_iter().next()
    }

    fn list_placements_for_contact_and_status(
        &self,
        contact_id: i64,
        status: &str,
        without_gmail_only: bool,
    ) -> Result<Vec<super::models::PlacementOperation>> {
        let gmail_clause = if without_gmail_only {
            " AND (po.gmail_message_id IS NULL OR po.gmail_message_id = '')"
        } else {
            ""
        };
        let sql = format!(
            "SELECT {PLACEMENT_SELECT}
             FROM placement_operations po
             WHERE po.contact_id = ?1 AND po.status = ?2{gmail_clause}
             ORDER BY po.id DESC"
        );
        let mut stmt = self.conn.prepare(&sql)?;
        let rows = stmt.query_map(params![contact_id, status], map_placement_row)?;
        let mut result = Vec::new();
        for row in rows {
            result.push(row?);
        }
        Ok(result)
    }

    fn list_placements_for_pipe_and_status(
        &self,
        pipe_id: i64,
        status: &str,
        without_gmail_only: bool,
    ) -> Result<Vec<super::models::PlacementOperation>> {
        let gmail_clause = if without_gmail_only {
            " AND (po.gmail_message_id IS NULL OR po.gmail_message_id = '')"
        } else {
            ""
        };
        let sql = format!(
            "SELECT {PLACEMENT_SELECT}
             FROM placement_operations po
             WHERE po.pipe_id = ?1 AND po.status = ?2
               AND (po.dismissed_at IS NULL OR po.dismissed_at <= 0){gmail_clause}
             ORDER BY po.id DESC"
        );
        let mut stmt = self.conn.prepare(&sql)?;
        let rows = stmt.query_map(params![pipe_id, status], map_placement_row)?;
        let mut result = Vec::new();
        for row in rows {
            result.push(row?);
        }
        Ok(result)
    }

    fn find_placement_on_pipe_for_email_match(
        &self,
        pipe_id: i64,
        stellium_label: &str,
        status: &str,
        without_gmail_only: bool,
        product_label: Option<&str>,
        email_received_at: i64,
    ) -> Result<Option<super::models::PlacementOperation>> {
        let all = self.list_placements_for_pipe_and_status(pipe_id, status, without_gmail_only)?;
        let pool = pool_candidates_for_stellium_label(all, stellium_label);
        Ok(Self::pick_unique_placement_candidate(
            pool,
            product_label,
            Some(pipe_id),
            email_received_at,
        ))
    }

    fn pick_unique_placement_candidate(
        candidates: Vec<super::models::PlacementOperation>,
        product_label: Option<&str>,
        pipe_id_hint: Option<i64>,
        email_received_at: i64,
    ) -> Option<super::models::PlacementOperation> {
        let candidates =
            Self::filter_placement_candidates_by_email_date(candidates, email_received_at);
        if candidates.is_empty() {
            return None;
        }
        let mut pool = candidates;
        if let Some(hint) = pipe_id_hint.filter(|id| *id > 0) {
            let on_hint: Vec<_> = pool
                .iter()
                .filter(|op| op.pipe_id == Some(hint))
                .cloned()
                .collect();
            if !on_hint.is_empty() {
                pool = on_hint;
            }
        }
        if let Some(product) = product_label.filter(|s| !s.trim().is_empty()) {
            let with_product: Vec<_> = pool
                .iter()
                .filter(|op| {
                    op.product_label
                        .as_ref()
                        .map(|p| Self::placement_products_match(p, product))
                        .unwrap_or(false)
                })
                .cloned()
                .collect();
            if with_product.len() == 1 {
                return Some(with_product[0].clone());
            }
            if !with_product.is_empty() {
                pool = with_product;
            }
        }
        if pool.len() == 1 {
            return Some(pool[0].clone());
        }
        if Self::should_fifo_placement_pool(&pool, product_label) {
            return Self::pick_oldest_placement_candidate(pool);
        }
        None
    }

    fn should_fifo_placement_pool(
        pool: &[super::models::PlacementOperation],
        product_label: Option<&str>,
    ) -> bool {
        if pool.len() <= 1 {
            return false;
        }
        let Some(email_product) = product_label.filter(|s| !s.trim().is_empty()) else {
            return false;
        };
        pool.iter().all(|op| {
            op.product_label
                .as_ref()
                .map(|p| Self::placement_products_match(p, email_product))
                .unwrap_or(false)
        })
    }

    pub fn count_open_placements_for_email_match(
        &self,
        contact_id: i64,
        stellium_label: &str,
        new_status: &str,
        email_received_at: i64,
    ) -> Result<usize> {
        Ok(
            self.list_placement_candidates_for_email_match(
                contact_id,
                stellium_label,
                new_status,
                email_received_at,
                None,
            )?
            .len(),
        )
    }

    fn list_placement_candidates_for_email_match(
        &self,
        contact_id: i64,
        stellium_label: &str,
        new_status: &str,
        email_received_at: i64,
        pipe_id_hint: Option<i64>,
    ) -> Result<Vec<super::models::PlacementOperation>> {
        let mut candidates =
            self.list_placements_for_contact_and_status(contact_id, STATUS_PENDING, false)?;
        if new_status == STATUS_CONFORME {
            candidates.extend(self.list_placements_for_contact_and_status(
                contact_id,
                STATUS_NON_CONFORME,
                false,
            )?);
            candidates.extend(self.list_placements_for_contact_and_status(
                contact_id,
                STATUS_CONFORME,
                true,
            )?);
        }
        let mut candidates = pool_candidates_for_stellium_label(candidates, stellium_label);
        candidates =
            Self::filter_placement_candidates_by_email_date(candidates, email_received_at);
        if let Some(hint) = pipe_id_hint.filter(|id| *id > 0) {
            let on_hint: Vec<_> = candidates
                .iter()
                .filter(|op| op.pipe_id == Some(hint))
                .cloned()
                .collect();
            if !on_hint.is_empty() {
                candidates = on_hint;
            }
        }
        Ok(candidates)
    }

    pub fn find_placement_for_email_match(
        &self,
        contact_id: i64,
        stellium_label: &str,
        new_status: &str,
        product_label: Option<&str>,
        email_received_at: i64,
        pipe_id_hint: Option<i64>,
    ) -> Result<Option<super::models::PlacementOperation>> {
        let pipe_id = pipe_id_hint.filter(|id| *id > 0);
        if let Some(pipe_id) = pipe_id {
            if let Some(op) = self.find_placement_on_pipe_for_email_match(
                pipe_id,
                stellium_label,
                STATUS_PENDING,
                false,
                product_label,
                email_received_at,
            )? {
                return Ok(Some(op));
            }
            if new_status == STATUS_CONFORME {
                if let Some(op) = self.find_placement_on_pipe_for_email_match(
                    pipe_id,
                    stellium_label,
                    STATUS_NON_CONFORME,
                    false,
                    product_label,
                    email_received_at,
                )? {
                    return Ok(Some(op));
                }
                if let Some(op) = self.find_placement_on_pipe_for_email_match(
                    pipe_id,
                    stellium_label,
                    STATUS_CONFORME,
                    true,
                    product_label,
                    email_received_at,
                )? {
                    return Ok(Some(op));
                }
            }
        }

        let candidates = self.list_placement_candidates_for_email_match(
            contact_id,
            stellium_label,
            new_status,
            email_received_at,
            pipe_id_hint,
        )?;
        Ok(Self::pick_unique_placement_candidate(
            candidates,
            product_label,
            pipe_id_hint,
            email_received_at,
        ))
    }

    pub fn count_open_placement_operations(&self) -> Result<(u32, u32)> {
        let pending: i64 = self.conn.query_row(
            "SELECT COUNT(*) FROM placement_operations
             WHERE status = ?1
               AND (dismissed_at IS NULL OR dismissed_at <= 0)
               AND NOT (
                 (pipe_id IS NULL OR pipe_id <= 0)
                 AND (pipe_timeline_entry_id IS NULL OR pipe_timeline_entry_id <= 0)
                 AND (email_received_at IS NULL OR email_received_at <= 0)
                 AND (gmail_message_id IS NULL OR TRIM(gmail_message_id) = '')
               )",
            params![STATUS_PENDING],
            |row| row.get(0),
        )?;
        let non_conforme: i64 = self.conn.query_row(
            "SELECT COUNT(*) FROM placement_operations WHERE status = ?1",
            params![STATUS_NON_CONFORME],
            |row| row.get(0),
        )?;
        Ok((pending as u32, non_conforme as u32))
    }

    pub fn count_placement_non_conforme_with_focus(&self) -> Result<(u32, Option<i64>)> {
        let count: i64 = self.conn.query_row(
            "SELECT COUNT(*) FROM placement_operations WHERE status = ?1",
            params![STATUS_NON_CONFORME],
            |row| row.get(0),
        )?;
        let focus_contact_id = if count == 1 {
            self.conn
                .query_row(
                    "SELECT contact_id FROM placement_operations WHERE status = ?1
                     ORDER BY updated_at DESC, id DESC LIMIT 1",
                    params![STATUS_NON_CONFORME],
                    |row| row.get::<_, i64>(0),
                )
                .ok()
        } else {
            None
        };
        Ok((count as u32, focus_contact_id))
    }

    pub fn get_placement_open_counts_by_pipe(
        &self,
    ) -> Result<std::collections::HashMap<i64, (u32, u32, u32)>> {
        let mut stmt = self.conn.prepare(
            "SELECT pipe_id,
                    SUM(CASE
                          WHEN status = ?1
                           AND (pipe_timeline_entry_id IS NULL OR pipe_timeline_entry_id <= 0)
                          THEN 1 ELSE 0 END),
                    SUM(CASE
                          WHEN status = ?1
                           AND pipe_timeline_entry_id IS NOT NULL
                           AND pipe_timeline_entry_id > 0
                          THEN 1 ELSE 0 END),
                    SUM(CASE WHEN status = ?2 THEN 1 ELSE 0 END)
             FROM placement_operations
             WHERE pipe_id IS NOT NULL
               AND (dismissed_at IS NULL OR dismissed_at <= 0)
             GROUP BY pipe_id",
        )?;
        let rows = stmt.query_map(
            params![STATUS_PENDING, STATUS_NON_CONFORME],
            |row| {
                Ok((
                    row.get::<_, i64>(0)?,
                    row.get::<_, i64>(1)? as u32,
                    row.get::<_, i64>(2)? as u32,
                    row.get::<_, i64>(3)? as u32,
                ))
            },
        )?;
        let mut map = std::collections::HashMap::new();
        for row in rows {
            let (pipe_id, unsent, pending, non_conforme) = row?;
            if unsent > 0 || pending > 0 || non_conforme > 0 {
                map.insert(pipe_id, (unsent, pending, non_conforme));
            }
        }
        Ok(map)
    }

    pub fn apply_placement_email_update(
        &self,
        contact_id: i64,
        operation_type: &str,
        status: &str,
        stellium_label: Option<&str>,
        product_label: Option<&str>,
        gmail_message_id: &str,
        email_subject: Option<&str>,
        email_received_at: i64,
        pipe_id_hint: Option<i64>,
    ) -> Result<(super::models::PlacementOperation, bool)> {
        if self.placement_operation_exists_for_gmail(gmail_message_id)? {
            let existing = self
                .get_placement_operation_by_gmail_message_id(gmail_message_id)?
                .ok_or(rusqlite::Error::QueryReturnedNoRows)?;
            return Ok((existing, false));
        }

        if !is_valid_placement_status(status) {
            return Err(rusqlite::Error::InvalidParameterName(
                "status invalide".into(),
            ));
        }
        if !is_valid_placement_operation_type(operation_type) {
            return Err(rusqlite::Error::InvalidParameterName(
                "operation_type invalide".into(),
            ));
        }

        let pending = self.find_placement_for_email_match(
            contact_id,
            stellium_label.unwrap_or(""),
            status,
            product_label,
            email_received_at,
            pipe_id_hint,
        )?;

        let now = now_unix();
        if let Some(op) = pending {
            let pipe_id_to_set = if op.pipe_id.filter(|id| *id > 0).is_some() {
                None
            } else {
                pipe_id_hint.filter(|id| *id > 0)
            };
            let product_to_set: Option<&str> = if op
                .product_label
                .as_ref()
                .map(|s| !s.trim().is_empty())
                .unwrap_or(false)
            {
                None
            } else {
                product_label
            };
            self.conn.execute(
                "UPDATE placement_operations SET
                    status = ?1,
                    stellium_label = COALESCE(?2, stellium_label),
                    product_label = COALESCE(?3, product_label),
                    gmail_message_id = ?4,
                    email_subject = ?5,
                    email_received_at = ?6,
                    pipe_id = COALESCE(?7, pipe_id),
                    non_conforme_at = CASE
                        WHEN ?1 = 'NON_CONFORME' AND (non_conforme_at IS NULL OR non_conforme_at <= 0)
                        THEN ?6
                        ELSE non_conforme_at
                    END,
                    updated_at = ?8
                 WHERE id = ?9",
                params![
                    status,
                    stellium_label,
                    product_to_set,
                    gmail_message_id,
                    email_subject,
                    email_received_at,
                    pipe_id_to_set,
                    now,
                    op.id,
                ],
            )?;
            let updated = self.get_placement_operation_by_id(op.id)?;
            self.journal_placement_partner_email_response(
                &updated,
                status,
                email_received_at,
                email_subject,
            )?;
            return Ok((updated, true));
        }

        Err(rusqlite::Error::InvalidParameterName(
            "aucune opération placement en attente pour ce mail".into(),
        ))
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::database::models::NewContact;

    fn sample_contact(nom: &str, prenom: &str) -> NewContact {
        NewContact {
            categorie: "CLIENT".into(),
            nom: nom.into(),
            prenom: prenom.into(),
            statut_suivi: Some("ACTIF".into()),                ..Default::default()
        }
    }

    fn email_received_after_operation(op: &super::super::models::PlacementOperation) -> i64 {
        op.created_at + 60
    }

    #[test]
    fn normalize_stellium_product_labels() {
        assert_eq!(
            normalize_stellium_product_label("Comète (ALPSI)"),
            "comete"
        );
        assert_eq!(
            normalize_stellium_product_label("Activimmo ALPSI"),
            "activimmo"
        );
        assert_eq!(
            normalize_stellium_product_label("Corum Origin CIF"),
            "corum origin"
        );
        assert!(placement_stellium_products_match("Comète", "Comète (ALPSI)"));
    }

    #[test]
    fn map_stellium_labels() {
        assert_eq!(
            map_stellium_label_to_operation_type("Arbitrage libre"),
            OP_ARBITRAGE
        );
        assert_eq!(
            map_stellium_label_to_operation_type("Versements programmés : Mise en place"),
            OP_VERSEMENT
        );
        assert!(placement_stellium_labels_match(
            "Modification administrative : RIB",
            "Modification administrative : RIB"
        ));
        assert!(!placement_stellium_labels_match(
            "Arbitrage libre",
            "Modification administrative : RIB"
        ));
    }

    #[test]
    fn apply_email_update_requires_existing_pending() {
        let db = super::super::Database::open_in_memory_for_tests().unwrap();
        db.migrate_placement_operations_table().unwrap();
        let contact = db.create_contact(sample_contact("Dupont", "Jean")).unwrap();
        let contact_id = contact.id.unwrap();

        let err = db
            .apply_placement_email_update(
                contact_id,
                OP_ARBITRAGE,
                STATUS_CONFORME,
                Some("Arbitrage libre"),
                Some("Cristalliance Evoluvie"),
                "msg-orphan",
                Some("subject"),
                1_700_000_000,
                None,
            )
            .unwrap_err();
        assert!(err.to_string().contains("aucune opération placement"));
    }

    #[test]
    fn non_conforme_at_and_partner_resent_for_stepper() {
        let db = super::super::Database::open_in_memory_for_tests().unwrap();
        db.migrate_placement_operations_table().unwrap();
        let contact = db.create_contact(sample_contact("Dupont", "Jean")).unwrap();
        let contact_id = contact.id.unwrap();
        let pending = db
            .create_placement_operation(super::super::models::NewPlacementOperation {
                contact_id,
                pipe_id: None,
                pipe_timeline_entry_id: None,
                operation_type: OP_ARBITRAGE.into(),
                product_label: Some("Cristalliance Avenir".into()),
                stellium_label: Some("Arbitrage libre".into()),                ..Default::default()
            })
            .unwrap();
        let received_at = email_received_after_operation(&pending);
        let (updated, _) = db
            .apply_placement_email_update(
                contact_id,
                OP_ARBITRAGE,
                STATUS_NON_CONFORME,
                Some("Arbitrage libre"),
                Some("Cristalliance Avenir"),
                "msg-nc",
                Some("NC"),
                received_at,
                None,
            )
            .unwrap();
        assert_eq!(updated.status, STATUS_NON_CONFORME);
        assert_eq!(updated.non_conforme_at, Some(received_at));

        let resent = db.mark_placement_partner_resent(updated.id).unwrap();
        assert!(resent.partner_resent_at.unwrap() > 0);
    }

    #[test]
    fn delete_pipe_dismisses_linked_placement_operations() {
        let db = super::super::Database::open_in_memory_for_tests().unwrap();
        db.migrate_placement_operations_table().unwrap();
        db.migrate_pipes_table().unwrap();
        let contact = db.create_contact(sample_contact("Alameda", "Luc")).unwrap();
        let contact_id = contact.id.unwrap();
        let pipe = db
            .create_pipe(super::super::models::NewPipe {
                contact_id,
                secondary_contact_id: None,
                pipe_type: PIPE_TYPE_ACTE_GESTION.into(),
                parent_pipe_id: None,
                titre: "Suivi juillet".into(),
                stage: None,
                notes: None,
            })
            .unwrap();
        let op = db
            .create_placement_operation(super::super::models::NewPlacementOperation {
                contact_id,
                pipe_id: Some(pipe.id),
                pipe_timeline_entry_id: None,
                operation_type: OP_ARBITRAGE.into(),
                product_label: Some("Fipavie Ingénierie".into()),
                stellium_label: Some("Rachats programmés : Mise en place".into()),                ..Default::default()
            })
            .unwrap();
        db.delete_pipe(pipe.id).unwrap();
        let refreshed = db.get_placement_operation_by_id(op.id).unwrap();
        assert!(refreshed.dismissed_at.unwrap() > 0);
    }

    #[test]
    fn dismiss_placement_operation_hides_from_active_workflow() {
        let db = super::super::Database::open_in_memory_for_tests().unwrap();
        db.migrate_placement_operations_table().unwrap();
        let contact = db.create_contact(sample_contact("Dupont", "Jean")).unwrap();
        let contact_id = contact.id.unwrap();
        let pending = db
            .create_placement_operation(super::super::models::NewPlacementOperation {
                contact_id,
                pipe_id: None,
                pipe_timeline_entry_id: None,
                operation_type: OP_ARBITRAGE.into(),
                product_label: Some("Cristalliance Avenir".into()),
                stellium_label: Some("Arbitrage libre".into()),                ..Default::default()
            })
            .unwrap();
        let dismissed = db.dismiss_placement_operation(pending.id).unwrap();
        assert!(dismissed.dismissed_at.unwrap() > 0);
        let again = db.dismiss_placement_operation(pending.id).unwrap();
        assert_eq!(again.dismissed_at, dismissed.dismissed_at);
    }

    #[test]
    fn reserve_placement_client_notification_is_exclusive() {
        let db = super::super::Database::open_in_memory_for_tests().unwrap();
        db.migrate_placement_operations_table().unwrap();
        db.migrate_pipes_table().unwrap();
        db.migrate_pipe_timeline_table().unwrap();
        let contact = db.create_contact(sample_contact("Dupont", "Jean")).unwrap();
        let contact_id = contact.id.unwrap();
        let pipe = db
            .create_pipe(super::super::models::NewPipe {
                contact_id,
                secondary_contact_id: None,
                pipe_type: PIPE_TYPE_ACTE_GESTION.into(),
                parent_pipe_id: None,
                titre: "Suivi".into(),
                stage: None,
                notes: None,
            })
            .unwrap();
        let entry = db
            .list_pipe_timeline_entries(pipe.id)
            .unwrap()
            .into_iter()
            .find(|e| e.entry_type == "CREATION")
            .unwrap();

        let op = db
            .update_placement_operation_status(
                db.create_placement_operation(super::super::models::NewPlacementOperation {
                    contact_id,
                    pipe_id: Some(pipe.id),
                    pipe_timeline_entry_id: Some(entry.id),
                    operation_type: OP_ARBITRAGE.into(),
                    product_label: None,
                    stellium_label: None,                ..Default::default()
            })
                .unwrap()
                .id,
                STATUS_CONFORME,
            )
            .unwrap();

        assert!(db.reserve_placement_client_notification(op.id).unwrap());
        assert!(!db.reserve_placement_client_notification(op.id).unwrap());
        assert!(db.release_placement_client_notification(op.id).unwrap());
        assert!(db.reserve_placement_client_notification(op.id).unwrap());
    }

    #[test]
    fn create_pending_souscription_without_montant_reuses_existing_draft() {
        let db = super::super::Database::open_in_memory_for_tests().unwrap();
        db.migrate_placement_operations_table().unwrap();
        db.migrate_pipes_table().unwrap();
        let contact = db.create_contact(sample_contact("Dupont", "Jean")).unwrap();
        let contact_id = contact.id.unwrap();
        let affaire = db
            .create_pipe(super::super::models::NewPipe {
                contact_id,
                secondary_contact_id: None,
                pipe_type: PIPE_TYPE_AFFAIRE.into(),
                parent_pipe_id: None,
                titre: "Affaire test".into(),
                stage: Some("R3".into()),
                notes: None,
            })
            .unwrap();

        let draft = db
            .create_placement_operation(super::super::models::NewPlacementOperation {
                contact_id,
                pipe_id: Some(affaire.id),
                pipe_timeline_entry_id: None,
                operation_type: OP_SOUSCRIPTION.into(),
                product_label: Some("Corum Origin".into()),
                stellium_label: Some("Souscription".into()),
                montant_centimes: Some(5_000_000),
                type_produit: Some("SCPI".into()),
            })
            .unwrap();

        let confirmed = db
            .create_placement_operation(super::super::models::NewPlacementOperation {
                contact_id,
                pipe_id: Some(affaire.id),
                pipe_timeline_entry_id: None,
                operation_type: OP_SOUSCRIPTION.into(),
                product_label: Some("Corum Origin".into()),
                stellium_label: Some("Souscription".into()),
                ..Default::default()
            })
            .unwrap();

        assert_eq!(confirmed.id, draft.id);
        assert_eq!(confirmed.montant_centimes, Some(5_000_000));
    }

    #[test]
    fn create_and_apply_email_update() {
        let db = super::super::Database::open_in_memory_for_tests().unwrap();
        db.migrate_placement_operations_table().unwrap();
        let contact = db.create_contact(sample_contact("Dupont", "Jean")).unwrap();
        let contact_id = contact.id.unwrap();

        let pending = db
            .create_placement_operation(super::super::models::NewPlacementOperation {
                contact_id,
                pipe_id: None,
                pipe_timeline_entry_id: None,
                operation_type: OP_ARBITRAGE.into(),
                product_label: None,
                stellium_label: None,                ..Default::default()
            })
            .unwrap();
        assert_eq!(pending.status, STATUS_PENDING);

        let (updated, changed) = db
            .apply_placement_email_update(
                contact_id,
                OP_ARBITRAGE,
                STATUS_CONFORME,
                Some("Arbitrage libre"),
                Some("Cristalliance Evoluvie"),
                "msg-1",
                Some("subject"),
                email_received_after_operation(&pending),
                None,
            )
            .unwrap();
        assert!(changed);
        assert_eq!(updated.id, pending.id);
        assert_eq!(updated.status, STATUS_CONFORME);
        assert_eq!(updated.gmail_message_id.as_deref(), Some("msg-1"));
    }

    #[test]
    fn apply_email_update_journals_partner_response_on_pipe() {
        let db = super::super::Database::open_in_memory_for_tests().unwrap();
        db.migrate_placement_operations_table().unwrap();
        db.migrate_pipes_table().unwrap();
        db.migrate_pipe_timeline_table().unwrap();
        let contact = db.create_contact(sample_contact("Gillodes", "Lea")).unwrap();
        let contact_id = contact.id.unwrap();
        let pipe = db
            .create_pipe(super::super::models::NewPipe {
                contact_id,
                secondary_contact_id: None,
                pipe_type: PIPE_TYPE_ACTE_GESTION.into(),
                parent_pipe_id: None,
                titre: "Suivi juillet".into(),
                stage: None,
                notes: None,
            })
            .unwrap();
        let pending = db
            .create_placement_operation(super::super::models::NewPlacementOperation {
                contact_id,
                pipe_id: Some(pipe.id),
                pipe_timeline_entry_id: None,
                operation_type: OP_ARBITRAGE.into(),
                product_label: Some("Cristalliance Evoluvie".into()),
                stellium_label: Some("Arbitrage libre".into()),
                ..Default::default()
            })
            .unwrap();
        let received_at = email_received_after_operation(&pending);

        let (_, changed) = db
            .apply_placement_email_update(
                contact_id,
                OP_ARBITRAGE,
                STATUS_CONFORME,
                Some("Arbitrage libre"),
                Some("Cristalliance Evoluvie"),
                "msg-lea",
                Some("Box placement - Envoi dossier"),
                received_at,
                Some(pipe.id),
            )
            .unwrap();
        assert!(changed);

        let notes: Vec<_> = db
            .list_pipe_timeline_entries(pipe.id)
            .unwrap()
            .into_iter()
            .filter(|e| e.entry_type == "NOTE")
            .collect();
        assert_eq!(notes.len(), 1);
        assert_eq!(
            notes[0].titre.as_deref(),
            Some("Réponse Stellium — Conforme")
        );
    }

    #[test]
    fn create_links_journal_on_conforme_after_stellium_email() {
        use super::super::models::NewPipeTimelineEntry;

        let db = super::super::Database::open_in_memory_for_tests().unwrap();
        db.migrate_placement_operations_table().unwrap();
        db.migrate_pipes_table().unwrap();
        db.migrate_pipe_timeline_table().unwrap();
        let contact = db.create_contact(sample_contact("Gillodes", "Lea")).unwrap();
        let contact_id = contact.id.unwrap();
        let pipe = db
            .create_pipe(super::super::models::NewPipe {
                contact_id,
                secondary_contact_id: None,
                pipe_type: PIPE_TYPE_ACTE_GESTION.into(),
                parent_pipe_id: None,
                titre: "Suivi juillet".into(),
                stage: None,
                notes: None,
            })
            .unwrap();
        let draft = db
            .create_placement_operation(super::super::models::NewPlacementOperation {
                contact_id,
                pipe_id: Some(pipe.id),
                pipe_timeline_entry_id: None,
                operation_type: OP_ARBITRAGE.into(),
                product_label: Some("Cristalliance Evoluvie".into()),
                stellium_label: Some("Arbitrage libre".into()),
                ..Default::default()
            })
            .unwrap();
        let received_at = email_received_after_operation(&draft);
        db.apply_placement_email_update(
            contact_id,
            OP_ARBITRAGE,
            STATUS_CONFORME,
            Some("Arbitrage libre"),
            Some("Cristalliance Evoluvie"),
            "msg-lea-2",
            Some("subject"),
            received_at,
            Some(pipe.id),
        )
        .unwrap();

        let journal = db
            .create_pipe_timeline_entry(NewPipeTimelineEntry {
                pipe_id: pipe.id,
                entry_type: "NOTE".into(),
                titre: Some("Arbitrage libre — Cristalliance Evoluvie".into()),
                contenu: None,
                occurred_at: Some(received_at + 30),
            })
            .unwrap();
        let linked = db
            .create_placement_operation(super::super::models::NewPlacementOperation {
                contact_id,
                pipe_id: Some(pipe.id),
                pipe_timeline_entry_id: Some(journal.id),
                operation_type: OP_ARBITRAGE.into(),
                product_label: Some("Cristalliance Evoluvie".into()),
                stellium_label: Some("Arbitrage libre".into()),
                ..Default::default()
            })
            .unwrap();

        assert_eq!(linked.id, draft.id);
        assert_eq!(linked.status, STATUS_CONFORME);
        assert_eq!(linked.pipe_timeline_entry_id, Some(journal.id));
    }

    #[test]
    fn create_updates_timeline_on_existing_pending() {
        use super::super::models::NewPipeTimelineEntry;

        let db = super::super::Database::open_in_memory_for_tests().unwrap();
        db.migrate_placement_operations_table().unwrap();
        db.migrate_pipes_table().unwrap();
        db.migrate_pipe_timeline_table().unwrap();
        let contact = db.create_contact(sample_contact("Dupont", "Jean")).unwrap();
        let contact_id = contact.id.unwrap();
        let pipe = db
            .create_pipe(super::super::models::NewPipe {
                contact_id,
                secondary_contact_id: None,
                pipe_type: PIPE_TYPE_ACTE_GESTION.into(),
                parent_pipe_id: None,
                titre: "Suivi test".into(),
                stage: None,
                notes: None,
            })
            .unwrap();
        let pipe_id = pipe.id;
        let entry1 = db
            .create_pipe_timeline_entry(NewPipeTimelineEntry {
                pipe_id,
                entry_type: "ARBITRAGE".into(),
                titre: Some("Arbitrage".into()),
                contenu: None,
                occurred_at: Some(1_700_000_000),
            })
            .unwrap();
        let entry2 = db
            .create_pipe_timeline_entry(NewPipeTimelineEntry {
                pipe_id,
                entry_type: "ARBITRAGE".into(),
                titre: Some("Arbitrage 2".into()),
                contenu: None,
                occurred_at: Some(1_700_000_100),
            })
            .unwrap();

        let first = db
            .create_placement_operation(super::super::models::NewPlacementOperation {
                contact_id,
                pipe_id: Some(pipe_id),
                pipe_timeline_entry_id: Some(entry1.id),
                operation_type: OP_ARBITRAGE.into(),
                product_label: None,
                stellium_label: None,                ..Default::default()
            })
            .unwrap();
        assert_eq!(first.pipe_timeline_entry_id, Some(entry1.id));

        let second = db
            .create_placement_operation(super::super::models::NewPlacementOperation {
                contact_id,
                pipe_id: Some(pipe_id),
                pipe_timeline_entry_id: Some(entry2.id),
                operation_type: OP_ARBITRAGE.into(),
                product_label: None,
                stellium_label: None,                ..Default::default()
            })
            .unwrap();
        assert_eq!(second.id, first.id);
        assert_eq!(second.pipe_timeline_entry_id, Some(entry2.id));
    }

    #[test]
    fn find_email_match_rejects_mail_before_operation_created() {
        let db = super::super::Database::open_in_memory_for_tests().unwrap();
        db.migrate_placement_operations_table().unwrap();
        let contact = db.create_contact(sample_contact("Dupont", "Jean")).unwrap();
        let contact_id = contact.id.unwrap();

        let new_op = db
            .create_placement_operation(super::super::models::NewPlacementOperation {
                contact_id,
                pipe_id: None,
                pipe_timeline_entry_id: None,
                operation_type: OP_ARBITRAGE.into(),
                product_label: None,
                stellium_label: None,                ..Default::default()
            })
            .unwrap();

        let old_email_at = new_op.created_at - 86_400 * 60;
        let matched = db
            .find_placement_for_email_match(
                contact_id,
                "Arbitrage libre",
                STATUS_CONFORME,
                Some("Cristalliance Evoluvie"),
                old_email_at,
                None,
            )
            .unwrap();
        assert!(matched.is_none());

        let matched_after = db
            .find_placement_for_email_match(
                contact_id,
                "Arbitrage libre",
                STATUS_CONFORME,
                Some("Cristalliance Evoluvie"),
                email_received_after_operation(&new_op),
                None,
            )
            .unwrap()
            .expect("match after operation");
        assert_eq!(matched_after.id, new_op.id);
    }

    #[test]
    fn find_email_match_ambiguous_when_multiple_pending_same_type() {
        let db = super::super::Database::open_in_memory_for_tests().unwrap();
        db.migrate_placement_operations_table().unwrap();
        db.migrate_pipes_table().unwrap();
        let contact = db.create_contact(sample_contact("Dupont", "Jean")).unwrap();
        let contact_id = contact.id.unwrap();
        let pipe_a = db
            .create_pipe(super::super::models::NewPipe {
                contact_id,
                secondary_contact_id: None,
                pipe_type: "AFFAIRE".into(),
                parent_pipe_id: None,
                titre: "Affaire A".into(),
                stage: Some("R3".into()),
                notes: None,
            })
            .unwrap();
        let pipe_b = db
            .create_pipe(super::super::models::NewPipe {
                contact_id,
                secondary_contact_id: None,
                pipe_type: "AFFAIRE".into(),
                parent_pipe_id: None,
                titre: "Affaire B".into(),
                stage: Some("R3".into()),
                notes: None,
            })
            .unwrap();

        db.create_placement_operation(super::super::models::NewPlacementOperation {
            contact_id,
            pipe_id: Some(pipe_a.id),
            pipe_timeline_entry_id: Some(1),
            operation_type: OP_SOUSCRIPTION.into(),
            product_label: None,
            montant_centimes: Some(50_000_00),
            stellium_label: None,                ..Default::default()
            })
        .unwrap();
        db.create_placement_operation(super::super::models::NewPlacementOperation {
            contact_id,
            pipe_id: Some(pipe_b.id),
            pipe_timeline_entry_id: Some(2),
            operation_type: OP_SOUSCRIPTION.into(),
            product_label: None,
            montant_centimes: Some(60_000_00),
            stellium_label: None,                ..Default::default()
            })
        .unwrap();

        let email_at = now_unix();
        let matched = db
            .find_placement_for_email_match(
                contact_id,
                "Souscription partenaire",
                STATUS_CONFORME,
                Some("Cristalliance Evoluvie"),
                email_at,
                None,
            )
            .unwrap();
        assert!(matched.is_none());
    }

    #[test]
    fn find_email_match_by_exact_stellium_label() {
        let db = super::super::Database::open_in_memory_for_tests().unwrap();
        db.migrate_placement_operations_table().unwrap();
        let contact = db.create_contact(sample_contact("Dupont", "Jean")).unwrap();
        let contact_id = contact.id.unwrap();

        let arbitrage = db
            .create_placement_operation(super::super::models::NewPlacementOperation {
                contact_id,
                pipe_id: None,
                pipe_timeline_entry_id: None,
                operation_type: OP_ARBITRAGE.into(),
                product_label: None,
                stellium_label: Some("Arbitrage libre".into()),                ..Default::default()
            })
            .unwrap();
        let rib = db
            .create_placement_operation(super::super::models::NewPlacementOperation {
                contact_id,
                pipe_id: None,
                pipe_timeline_entry_id: None,
                operation_type: OP_AUTRE.into(),
                product_label: None,
                stellium_label: Some("Modification administrative : RIB".into()),                ..Default::default()
            })
            .unwrap();

        let matched_rib = db
            .find_placement_for_email_match(
                contact_id,
                "Modification administrative : RIB",
                STATUS_CONFORME,
                None,
                email_received_after_operation(&rib),
                None,
            )
            .unwrap()
            .expect("match RIB");
        assert_eq!(matched_rib.id, rib.id);

        let matched_arbitrage = db
            .find_placement_for_email_match(
                contact_id,
                "Arbitrage libre",
                STATUS_CONFORME,
                None,
                email_received_after_operation(&arbitrage),
                None,
            )
            .unwrap()
            .expect("match arbitrage");
        assert_eq!(matched_arbitrage.id, arbitrage.id);

        let only_arbitrage_db = super::super::Database::open_in_memory_for_tests().unwrap();
        only_arbitrage_db.migrate_placement_operations_table().unwrap();
        let only_contact = only_arbitrage_db
            .create_contact(sample_contact("Martin", "Paul"))
            .unwrap();
        let only_contact_id = only_contact.id.unwrap();
        only_arbitrage_db
            .create_placement_operation(super::super::models::NewPlacementOperation {
                contact_id: only_contact_id,
                pipe_id: None,
                pipe_timeline_entry_id: None,
                operation_type: OP_ARBITRAGE.into(),
                product_label: None,
                stellium_label: Some("Arbitrage libre".into()),                ..Default::default()
            })
            .unwrap();
        let wrong = only_arbitrage_db
            .find_placement_for_email_match(
                only_contact_id,
                "Modification administrative : RIB",
                STATUS_CONFORME,
                None,
                email_received_after_operation(&arbitrage),
                None,
            )
            .unwrap();
        assert!(wrong.is_none());
    }

    #[test]
    fn create_dedupes_by_pipe_and_stellium_label() {
        use super::super::models::NewPipeTimelineEntry;

        let db = super::super::Database::open_in_memory_for_tests().unwrap();
        db.migrate_placement_operations_table().unwrap();
        db.migrate_pipes_table().unwrap();
        db.migrate_pipe_timeline_table().unwrap();
        let contact = db.create_contact(sample_contact("Dupont", "Jean")).unwrap();
        let contact_id = contact.id.unwrap();
        let pipe = db
            .create_pipe(super::super::models::NewPipe {
                contact_id,
                secondary_contact_id: None,
                pipe_type: PIPE_TYPE_ACTE_GESTION.into(),
                parent_pipe_id: None,
                titre: "Suivi test".into(),
                stage: None,
                notes: None,
            })
            .unwrap();
        let entry1 = db
            .create_pipe_timeline_entry(NewPipeTimelineEntry {
                pipe_id: pipe.id,
                entry_type: "NOTE".into(),
                titre: Some("Arbitrage libre".into()),
                contenu: None,
                occurred_at: Some(1_700_000_000),
            })
            .unwrap();
        let entry2 = db
            .create_pipe_timeline_entry(NewPipeTimelineEntry {
                pipe_id: pipe.id,
                entry_type: "NOTE".into(),
                titre: Some("RIB".into()),
                contenu: None,
                occurred_at: Some(1_700_000_100),
            })
            .unwrap();

        let arbitrage = db
            .create_placement_operation(super::super::models::NewPlacementOperation {
                contact_id,
                pipe_id: Some(pipe.id),
                pipe_timeline_entry_id: Some(entry1.id),
                operation_type: OP_ARBITRAGE.into(),
                product_label: None,
                stellium_label: Some("Arbitrage libre".into()),                ..Default::default()
            })
            .unwrap();
        let arbitrage_again = db
            .create_placement_operation(super::super::models::NewPlacementOperation {
                contact_id,
                pipe_id: Some(pipe.id),
                pipe_timeline_entry_id: Some(entry1.id),
                operation_type: OP_ARBITRAGE.into(),
                product_label: None,
                stellium_label: Some("Arbitrage libre".into()),                ..Default::default()
            })
            .unwrap();
        assert_eq!(arbitrage_again.id, arbitrage.id);

        let rib = db
            .create_placement_operation(super::super::models::NewPlacementOperation {
                contact_id,
                pipe_id: Some(pipe.id),
                pipe_timeline_entry_id: Some(entry2.id),
                operation_type: OP_AUTRE.into(),
                product_label: None,
                stellium_label: Some("Modification administrative : RIB".into()),                ..Default::default()
            })
            .unwrap();
        assert_ne!(rib.id, arbitrage.id);
    }

    #[test]
    fn create_allows_same_label_different_products_on_same_pipe() {
        let db = super::super::Database::open_in_memory_for_tests().unwrap();
        db.migrate_placement_operations_table().unwrap();
        db.migrate_pipes_table().unwrap();
        let contact = db.create_contact(sample_contact("Dupont", "Jean")).unwrap();
        let contact_id = contact.id.unwrap();
        let pipe = db
            .create_pipe(super::super::models::NewPipe {
                contact_id,
                secondary_contact_id: None,
                pipe_type: PIPE_TYPE_ACTE_GESTION.into(),
                parent_pipe_id: None,
                titre: "Suivi test".into(),
                stage: None,
                notes: None,
            })
            .unwrap();

        let vp_evoluper = db
            .create_placement_operation(super::super::models::NewPlacementOperation {
                contact_id,
                pipe_id: Some(pipe.id),
                pipe_timeline_entry_id: None,
                operation_type: OP_VERSEMENT.into(),
                product_label: Some("Cristalliance EvoluPER".into()),
                stellium_label: Some("Versements programmés : Modification".into()),                ..Default::default()
            })
            .unwrap();
        let vp_avenir = db
            .create_placement_operation(super::super::models::NewPlacementOperation {
                contact_id,
                pipe_id: Some(pipe.id),
                pipe_timeline_entry_id: None,
                operation_type: OP_VERSEMENT.into(),
                product_label: Some("Cristalliance Avenir".into()),
                stellium_label: Some("Versements programmés : Modification".into()),                ..Default::default()
            })
            .unwrap();
        assert_ne!(vp_evoluper.id, vp_avenir.id);

        let vp_avenir_again = db
            .create_placement_operation(super::super::models::NewPlacementOperation {
                contact_id,
                pipe_id: Some(pipe.id),
                pipe_timeline_entry_id: None,
                operation_type: OP_VERSEMENT.into(),
                product_label: Some("Cristalliance Avenir".into()),
                stellium_label: Some("Versements programmés : Modification".into()),                ..Default::default()
            })
            .unwrap();
        assert_eq!(vp_avenir_again.id, vp_avenir.id);
    }

    #[test]
    fn find_email_match_fifo_when_same_label_and_product() {
        let db = super::super::Database::open_in_memory_for_tests().unwrap();
        db.migrate_placement_operations_table().unwrap();
        let contact = db.create_contact(sample_contact("Dupont", "Jean")).unwrap();
        let contact_id = contact.id.unwrap();

        let first = db
            .create_placement_operation(super::super::models::NewPlacementOperation {
                contact_id,
                pipe_id: None,
                pipe_timeline_entry_id: None,
                operation_type: OP_VERSEMENT.into(),
                product_label: Some("Cristalliance Avenir".into()),
                stellium_label: Some("Versements programmés : Modification".into()),                ..Default::default()
            })
            .unwrap();
        let second = db
            .create_placement_operation(super::super::models::NewPlacementOperation {
                contact_id,
                pipe_id: None,
                pipe_timeline_entry_id: None,
                operation_type: OP_VERSEMENT.into(),
                product_label: Some("Cristalliance Avenir".into()),
                stellium_label: Some("Versements programmés : Modification".into()),                ..Default::default()
            })
            .unwrap();
        assert_ne!(first.id, second.id);

        let matched = db
            .find_placement_for_email_match(
                contact_id,
                "Versements programmés : Modification",
                STATUS_CONFORME,
                Some("Cristalliance Avenir"),
                email_received_after_operation(&first),
                None,
            )
            .unwrap()
            .expect("fifo oldest");
        assert_eq!(matched.id, first.id);
    }

    #[test]
    fn find_email_match_on_same_pipe_requires_matching_product() {
        let db = super::super::Database::open_in_memory_for_tests().unwrap();
        db.migrate_placement_operations_table().unwrap();
        db.migrate_pipes_table().unwrap();
        let contact = db.create_contact(sample_contact("Dupont", "Jean")).unwrap();
        let contact_id = contact.id.unwrap();
        let pipe = db
            .create_pipe(super::super::models::NewPipe {
                contact_id,
                secondary_contact_id: None,
                pipe_type: PIPE_TYPE_ACTE_GESTION.into(),
                parent_pipe_id: None,
                titre: "Suivi test".into(),
                stage: None,
                notes: None,
            })
            .unwrap();

        let evoluper = db
            .create_placement_operation(super::super::models::NewPlacementOperation {
                contact_id,
                pipe_id: Some(pipe.id),
                pipe_timeline_entry_id: None,
                operation_type: OP_VERSEMENT.into(),
                product_label: Some("Cristalliance EvoluPER".into()),
                stellium_label: Some("Versements programmés : Modification".into()),                ..Default::default()
            })
            .unwrap();
        db.create_placement_operation(super::super::models::NewPlacementOperation {
            contact_id,
            pipe_id: Some(pipe.id),
            pipe_timeline_entry_id: None,
            operation_type: OP_VERSEMENT.into(),
            product_label: Some("Cristalliance Avenir".into()),
            stellium_label: Some("Versements programmés : Modification".into()),                ..Default::default()
            })
        .unwrap();

        let wrong = db
            .find_placement_for_email_match(
                contact_id,
                "Versements programmés : Modification",
                STATUS_CONFORME,
                Some("Cristalliance Avenir"),
                email_received_after_operation(&evoluper),
                Some(pipe.id),
            )
            .unwrap()
            .expect("match avenir not evoluper");
        assert_eq!(
            wrong.product_label.as_deref(),
            Some("Cristalliance Avenir")
        );
    }

    #[test]
    fn find_email_match_unique_by_product_label() {
        let db = super::super::Database::open_in_memory_for_tests().unwrap();
        db.migrate_placement_operations_table().unwrap();
        db.migrate_pipes_table().unwrap();
        let contact = db.create_contact(sample_contact("Dupont", "Jean")).unwrap();
        let contact_id = contact.id.unwrap();
        let pipe_a = db
            .create_pipe(super::super::models::NewPipe {
                contact_id,
                secondary_contact_id: None,
                pipe_type: "AFFAIRE".into(),
                parent_pipe_id: None,
                titre: "Affaire A".into(),
                stage: Some("R3".into()),
                notes: None,
            })
            .unwrap();
        let pipe_b = db
            .create_pipe(super::super::models::NewPipe {
                contact_id,
                secondary_contact_id: None,
                pipe_type: "AFFAIRE".into(),
                parent_pipe_id: None,
                titre: "Affaire B".into(),
                stage: Some("R3".into()),
                notes: None,
            })
            .unwrap();

        db.create_placement_operation(super::super::models::NewPlacementOperation {
            contact_id,
            pipe_id: Some(pipe_a.id),
            pipe_timeline_entry_id: Some(1),
            operation_type: OP_SOUSCRIPTION.into(),
            product_label: Some("Produit Alpha".into()),
            montant_centimes: Some(50_000_00),
            stellium_label: None,                ..Default::default()
            })
        .unwrap();
        let target = db
            .create_placement_operation(super::super::models::NewPlacementOperation {
                contact_id,
                pipe_id: Some(pipe_b.id),
                pipe_timeline_entry_id: Some(2),
                operation_type: OP_SOUSCRIPTION.into(),
                product_label: Some("Produit Beta".into()),
                montant_centimes: Some(60_000_00),
                stellium_label: None,                ..Default::default()
            })
            .unwrap();

        let matched = db
            .find_placement_for_email_match(
                contact_id,
                "Souscription partenaire",
                STATUS_CONFORME,
                Some("Produit Beta"),
                email_received_after_operation(&target),
                None,
            )
            .unwrap()
            .expect("match by product");
        assert_eq!(matched.id, target.id);
    }

    #[test]
    fn apply_email_keeps_pipe_id_when_already_set() {
        let db = super::super::Database::open_in_memory_for_tests().unwrap();
        db.migrate_placement_operations_table().unwrap();
        db.migrate_pipes_table().unwrap();
        let contact = db.create_contact(sample_contact("Dupont", "Jean")).unwrap();
        let contact_id = contact.id.unwrap();
        let old_pipe = db
            .create_pipe(super::super::models::NewPipe {
                contact_id,
                secondary_contact_id: None,
                pipe_type: PIPE_TYPE_ACTE_GESTION.into(),
                parent_pipe_id: None,
                titre: "Ancien suivi".into(),
                stage: None,
                notes: None,
            })
            .unwrap();
        let new_pipe = db
            .create_pipe(super::super::models::NewPipe {
                contact_id,
                secondary_contact_id: None,
                pipe_type: PIPE_TYPE_ACTE_GESTION.into(),
                parent_pipe_id: None,
                titre: "Nouveau suivi".into(),
                stage: None,
                notes: None,
            })
            .unwrap();

        let pending = db
            .create_placement_operation(super::super::models::NewPlacementOperation {
                contact_id,
                pipe_id: Some(old_pipe.id),
                pipe_timeline_entry_id: None,
                operation_type: OP_ARBITRAGE.into(),
                product_label: None,
                stellium_label: None,                ..Default::default()
            })
            .unwrap();

        let (updated, changed) = db
            .apply_placement_email_update(
                contact_id,
                OP_ARBITRAGE,
                STATUS_CONFORME,
                Some("Arbitrage libre"),
                Some("Produit test"),
                "msg-pipe",
                Some("subject"),
                email_received_after_operation(&pending),
                Some(new_pipe.id),
            )
            .unwrap();
        assert!(changed);
        assert_eq!(updated.id, pending.id);
        assert_eq!(updated.pipe_id, Some(old_pipe.id));
    }

    #[test]
    fn apply_email_attaches_gmail_to_manual_conforme_without_duplicate() {
        let db = super::super::Database::open_in_memory_for_tests().unwrap();
        db.migrate_placement_operations_table().unwrap();
        let contact = db.create_contact(sample_contact("Dupont", "Jean")).unwrap();
        let contact_id = contact.id.unwrap();

        let manual = db
            .update_placement_operation_status(
                db.create_placement_operation(super::super::models::NewPlacementOperation {
                    contact_id,
                    pipe_id: None,
                    pipe_timeline_entry_id: None,
                    operation_type: OP_ARBITRAGE.into(),
                    product_label: Some("AV Generali".into()),
                    stellium_label: None,                ..Default::default()
            })
                .unwrap()
                .id,
                STATUS_CONFORME,
            )
            .unwrap();
        assert!(manual.gmail_message_id.is_none());

        let (updated, changed) = db
            .apply_placement_email_update(
                contact_id,
                OP_ARBITRAGE,
                STATUS_CONFORME,
                Some("Arbitrage libre"),
                Some("Cristalliance Evoluvie"),
                "msg-manual",
                Some("subject"),
                email_received_after_operation(&manual),
                None,
            )
            .unwrap();
        assert!(changed);
        assert_eq!(updated.id, manual.id);
        assert_eq!(updated.gmail_message_id.as_deref(), Some("msg-manual"));
        assert_eq!(updated.product_label.as_deref(), Some("AV Generali"));

        let all = db.list_placement_operations_with_contacts().unwrap();
        assert_eq!(all.len(), 1);
    }

    #[test]
    fn client_email_eligible_only_when_pipe_journalized() {
        use super::super::models::NewPipeTimelineEntry;

        let db = super::super::Database::open_in_memory_for_tests().unwrap();
        db.migrate_placement_operations_table().unwrap();
        db.migrate_pipes_table().unwrap();
        db.migrate_pipe_timeline_table().unwrap();
        let contact = db.create_contact(sample_contact("Dupont", "Jean")).unwrap();
        let contact_id = contact.id.unwrap();
        let pipe = db
            .create_pipe(super::super::models::NewPipe {
                contact_id,
                secondary_contact_id: None,
                pipe_type: PIPE_TYPE_ACTE_GESTION.into(),
                parent_pipe_id: None,
                titre: "Suivi test".into(),
                stage: None,
                notes: None,
            })
            .unwrap();
        let entry = db
            .create_pipe_timeline_entry(NewPipeTimelineEntry {
                pipe_id: pipe.id,
                entry_type: "ARBITRAGE".into(),
                titre: Some("Arbitrage".into()),
                contenu: None,
                occurred_at: Some(1_700_000_000),
            })
            .unwrap();

        let from_pipe = db
            .create_placement_operation(super::super::models::NewPlacementOperation {
                contact_id,
                pipe_id: Some(pipe.id),
                pipe_timeline_entry_id: Some(entry.id),
                operation_type: OP_ARBITRAGE.into(),
                product_label: None,
                stellium_label: None,                ..Default::default()
            })
            .unwrap();
        assert!(!placement_operation_eligible_for_client_email(&from_pipe));

        let mut conforme = db
            .update_placement_operation_status(from_pipe.id, STATUS_CONFORME)
            .unwrap();
        assert!(placement_operation_eligible_for_client_email(&conforme));

        conforme.pipe_timeline_entry_id = None;
        assert!(!placement_operation_eligible_for_client_email(&conforme));
    }

    #[test]
    fn create_souscription_affaire_without_montant_is_rejected() {
        let db = super::super::Database::open_in_memory_for_tests().unwrap();
        db.migrate_placement_operations_table().unwrap();
        db.migrate_pipes_table().unwrap();
        let contact = db.create_contact(sample_contact("Dupont", "Jean")).unwrap();
        let contact_id = contact.id.unwrap();
        let affaire = db
            .create_pipe(super::super::models::NewPipe {
                contact_id,
                secondary_contact_id: None,
                pipe_type: PIPE_TYPE_AFFAIRE.into(),
                parent_pipe_id: None,
                titre: "Affaire sans montant".into(),
                stage: Some("R3".into()),
                notes: None,
            })
            .unwrap();

        let err = db
            .create_placement_operation(super::super::models::NewPlacementOperation {
                contact_id,
                pipe_id: Some(affaire.id),
                pipe_timeline_entry_id: None,
                operation_type: OP_SOUSCRIPTION.into(),
                product_label: Some("Corum Origin".into()),
                stellium_label: Some("Souscription".into()),
                montant_centimes: None,
                type_produit: None,
            })
            .unwrap_err()
            .to_string();

        assert!(err.contains("montant souscrit requis"));
    }
}
