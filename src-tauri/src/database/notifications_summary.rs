//! Compteurs notifications barre (1 IPC côté frontend).

use rusqlite::{params, Result};

#[derive(serde::Serialize)]
pub struct NotificationQueueBucket {
    pub count: u32,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub focus_contact_id: Option<i64>,
}

#[derive(serde::Serialize)]
pub struct AppNotificationsSummaryDto {
    pub ready: NotificationQueueBucket,
    pub followup: NotificationQueueBucket,
    pub incomplete: NotificationQueueBucket,
    pub sent: NotificationQueueBucket,
    pub alertes: NotificationQueueBucket,
    pub taches_urgent: NotificationQueueBucket,
    pub stellium_signals: Vec<crate::email::stellium_exceltis::StelliumExceltisSignal>,
}

#[derive(serde::Serialize)]
pub struct TrayDigestPipeRdvItem {
    pub calendar_event_id: i64,
    pub start_at: i64,
    pub timeline_titre: Option<String>,
    pub contact_nom: String,
    pub contact_prenom: String,
}

#[derive(serde::Serialize)]
pub struct TrayDigestSnapshotDto {
    pub pipe_rdvs_within_2h: Vec<TrayDigestPipeRdvItem>,
    pub alertes_count: u32,
    pub taches_urgent_count: u32,
    pub emails_ready_count: u32,
    pub placement_pending_count: u32,
    pub placement_non_conforme_count: u32,
}

impl super::Database {
    fn queue_notification_bucket(&self, status: &str) -> Result<NotificationQueueBucket> {
        let items = self.get_etiquette_email_queue(status)?;
        let count = items.len() as u32;
        let focus_contact_id = if count == 1 {
            Some(items[0].contact_id)
        } else {
            None
        };
        Ok(NotificationQueueBucket {
            count,
            focus_contact_id,
        })
    }

    pub fn get_app_notifications_summary(
        &self,
        stellium_signals: Vec<crate::email::stellium_exceltis::StelliumExceltisSignal>,
    ) -> Result<AppNotificationsSummaryDto> {
        let alertes = self.get_alertes_non_traitees()?;
        let alertes_count = alertes.len() as u32;
        let alertes_focus = if alertes_count == 1 {
            Some(alertes[0].contact_id)
        } else {
            None
        };

        let (taches_urgent_count, taches_urgent_focus) = self.count_taches_urgent_echeance()?;

        Ok(AppNotificationsSummaryDto {
            ready: self.queue_notification_bucket("ready")?,
            followup: self.queue_notification_bucket("followup")?,
            incomplete: self.queue_notification_bucket("incomplete")?,
            sent: self.queue_notification_bucket("sent")?,
            alertes: NotificationQueueBucket {
                count: alertes_count,
                focus_contact_id: alertes_focus,
            },
            taches_urgent: NotificationQueueBucket {
                count: taches_urgent_count,
                focus_contact_id: taches_urgent_focus,
            },
            stellium_signals,
        })
    }

    /// Snapshot léger pour la notification tray « point du jour » (1 IPC).
    pub fn get_tray_digest_snapshot(&self) -> Result<TrayDigestSnapshotDto> {
        let now = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_secs() as i64;
        let window_end = now + 2 * 3600;

        let mut stmt = self.conn.prepare(
            "SELECT ce.id, ce.start_at, c.nom, c.prenom, pte.titre
             FROM calendar_events ce
             INNER JOIN contacts c ON c.id = ce.contact_id
             LEFT JOIN pipe_timeline_entries pte ON pte.id = ce.pipe_timeline_entry_id
             WHERE ce.pipe_timeline_entry_id IS NOT NULL
               AND ce.event_status != 'cancelled'
               AND ce.rdv_effectue = 0
               AND ce.start_at >= ?1 AND ce.start_at <= ?2
             ORDER BY ce.start_at ASC",
        )?;
        let pipe_rdvs_within_2h = stmt
            .query_map(params![now, window_end], |row| {
                Ok(TrayDigestPipeRdvItem {
                    calendar_event_id: row.get(0)?,
                    start_at: row.get(1)?,
                    contact_nom: row.get(2)?,
                    contact_prenom: row.get(3)?,
                    timeline_titre: row.get(4)?,
                })
            })?
            .collect::<Result<Vec<_>>>()?;

        let alertes_count = self.count_alertes_non_traitees()? as u32;
        let (taches_urgent_count, _) = self.count_taches_urgent_echeance()?;
        let emails_ready_count = self.queue_notification_bucket("ready")?.count;
        let (placement_pending_count, placement_non_conforme_count) =
            self.count_open_placement_operations()?;

        Ok(TrayDigestSnapshotDto {
            pipe_rdvs_within_2h,
            alertes_count,
            taches_urgent_count,
            emails_ready_count,
            placement_pending_count,
            placement_non_conforme_count,
        })
    }
}
