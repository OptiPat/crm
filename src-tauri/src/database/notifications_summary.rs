//! Compteurs notifications barre (1 IPC côté frontend).

use rusqlite::Result;

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
    pub stellium_signals: Vec<crate::email::stellium_exceltis::StelliumExceltisSignal>,
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

        Ok(AppNotificationsSummaryDto {
            ready: self.queue_notification_bucket("ready")?,
            followup: self.queue_notification_bucket("followup")?,
            incomplete: self.queue_notification_bucket("incomplete")?,
            sent: self.queue_notification_bucket("sent")?,
            alertes: NotificationQueueBucket {
                count: alertes_count,
                focus_contact_id: alertes_focus,
            },
            stellium_signals,
        })
    }
}
