//! Tableau de bord campagne perf Stellium (file Prêts / envoyés par période).

use super::stellium_perf_campaigns::{
    STELLIUM_PERF_DIGEST_VERSION, STELLIUM_PERF_TEMPLATE_NOM, STELLIUM_PERF_TEMPLATE_TU_NOM,
};
use super::Database;
use rusqlite::{params, Result};
use serde::{Deserialize, Serialize};

pub const STELLIUM_LAST_PREPARE_SETTING: &str = "stellium_last_perf_campaign_prepare";

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StelliumPerfLastPrepareSnapshot {
    pub periode: String,
    pub batch_key: String,
    pub prepared_at: i64,
    pub contract_count: u64,
    pub contacts_matched: u64,
    pub contacts_queued: u64,
    pub contacts_no_email: u64,
    pub contacts_proxy_to_parent: u64,
    pub contacts_skipped_already_sent: u64,
    pub digest_version: i64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StelliumPerfCampaignDashboard {
    pub last_prepare: Option<StelliumPerfLastPrepareSnapshot>,
    pub ready_count: u64,
    pub sent_since_prepare: u64,
    pub current_digest_version: i64,
}

fn stellium_batch_base_from_key(batch_key: &str) -> &str {
    batch_key.split('-').next().unwrap_or(batch_key)
}

impl Database {
    pub fn save_stellium_last_prepare_snapshot(
        &self,
        snapshot: &StelliumPerfLastPrepareSnapshot,
    ) -> Result<()> {
        let json = serde_json::to_string(snapshot).map_err(|e| {
            rusqlite::Error::InvalidParameterName(format!("JSON serialize error: {e}"))
        })?;
        self.set_setting(STELLIUM_LAST_PREPARE_SETTING, &json)
    }

    fn load_stellium_last_prepare_snapshot(&self) -> Result<Option<StelliumPerfLastPrepareSnapshot>> {
        match self.get_setting(STELLIUM_LAST_PREPARE_SETTING)? {
            Some(raw) => {
                let parsed = serde_json::from_str(&raw).map_err(|e| {
                    rusqlite::Error::InvalidParameterName(format!("JSON parse error: {e}"))
                })?;
                Ok(Some(parsed))
            }
            None => Ok(None),
        }
    }

    fn count_stellium_ready_for_batch_base(&self, batch_base: &str) -> Result<u64> {
        let now = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_secs() as i64;
        self.conn.query_row(
            "SELECT COUNT(*) FROM contact_template_envois cte
             INNER JOIN templates_email t ON t.id = cte.template_id
             INNER JOIN contacts c ON c.id = cte.contact_id
             WHERE t.nom IN (?1, ?2)
               AND COALESCE(cte.campaign_batch_key, '') LIKE ?3 || '-%'
               AND cte.email_envoye = 0
               AND COALESCE(cte.email_annule, 0) = 0
               AND COALESCE(cte.email_suivi_ignore, 0) = 0
               AND cte.email_date_prevue IS NOT NULL
               AND cte.email_date_prevue <= ?4
               AND c.email IS NOT NULL AND TRIM(c.email) != ''",
            params![
                STELLIUM_PERF_TEMPLATE_NOM,
                STELLIUM_PERF_TEMPLATE_TU_NOM,
                batch_base,
                now,
            ],
            |row| row.get(0),
        )
    }

    fn count_stellium_sent_for_batch_base(&self, batch_base: &str) -> Result<u64> {
        self.conn.query_row(
            "SELECT COUNT(*) FROM contact_template_envois cte
             INNER JOIN templates_email t ON t.id = cte.template_id
             WHERE t.nom IN (?1, ?2)
               AND COALESCE(cte.campaign_batch_key, '') LIKE ?3 || '-%'
               AND cte.email_envoye = 1",
            params![
                STELLIUM_PERF_TEMPLATE_NOM,
                STELLIUM_PERF_TEMPLATE_TU_NOM,
                batch_base,
            ],
            |row| row.get(0),
        )
    }

    fn infer_stellium_last_prepare_from_queue(&self) -> Result<Option<StelliumPerfLastPrepareSnapshot>> {
        let row: Option<(String, i64, String)> = self
            .conn
            .query_row(
                "SELECT COALESCE(cte.campaign_batch_key, ''), cte.trigger_event_at, cte.campaign_variables
                 FROM contact_template_envois cte
                 INNER JOIN templates_email t ON t.id = cte.template_id
                 WHERE t.nom IN (?1, ?2)
                   AND COALESCE(cte.campaign_batch_key, '') != ''
                 ORDER BY cte.trigger_event_at DESC
                 LIMIT 1",
                params![STELLIUM_PERF_TEMPLATE_NOM, STELLIUM_PERF_TEMPLATE_TU_NOM],
                |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)),
            )
            .ok();

        let Some((batch_key, prepared_at, vars_json)) = row else {
            return Ok(None);
        };
        if batch_key.trim().is_empty() {
            return Ok(None);
        }

        let batch_base = stellium_batch_base_from_key(batch_key.trim()).to_string();
        let periode = serde_json::from_str::<serde_json::Value>(&vars_json)
            .ok()
            .and_then(|v| {
                v.get("periode")
                    .and_then(|p| p.as_str())
                    .map(|s| s.to_string())
            })
            .unwrap_or_else(|| batch_base.clone());

        Ok(Some(StelliumPerfLastPrepareSnapshot {
            periode,
            batch_key: batch_base,
            prepared_at,
            contract_count: 0,
            contacts_matched: 0,
            contacts_queued: 0,
            contacts_no_email: 0,
            contacts_proxy_to_parent: 0,
            contacts_skipped_already_sent: 0,
            digest_version: STELLIUM_PERF_DIGEST_VERSION,
        }))
    }

    pub fn get_stellium_perf_campaign_dashboard(&self) -> Result<StelliumPerfCampaignDashboard> {
        let last_prepare = match self.load_stellium_last_prepare_snapshot()? {
            Some(snap) => Some(snap),
            None => self.infer_stellium_last_prepare_from_queue()?,
        };
        let ready_count = match last_prepare.as_ref() {
            Some(snap) => self.count_stellium_ready_for_batch_base(&snap.batch_key)?,
            None => 0,
        };
        let sent_since_prepare = match last_prepare.as_ref() {
            Some(snap) => self.count_stellium_sent_for_batch_base(&snap.batch_key)?,
            None => 0,
        };
        Ok(StelliumPerfCampaignDashboard {
            last_prepare,
            ready_count,
            sent_since_prepare,
            current_digest_version: STELLIUM_PERF_DIGEST_VERSION,
        })
    }
}
