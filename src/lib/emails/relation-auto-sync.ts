import { syncEmailCampaignResponses } from "@/lib/api/tauri-email";
import { syncCalendarRdv } from "@/lib/api/tauri-calendar";
import { getEmailConnectionStatus } from "@/lib/api/tauri-email-oauth";
import { notifyRelationChanged } from "@/lib/etiquettes/etiquette-events";

export interface RelationAutoSyncResult {
  skipped: boolean;
  mail_detected: number;
  rdv_campaign_detected: number;
  calendar_accepted: number;
  calendar_declined: number;
  calendar_cancelled: number;
  errors: string[];
}

/**
 * Sync Gmail (réponses campagnes) + Google Agenda (RDV CRM planifiés).
 * Utilisé par le hook global, Envois → « Vérifier maintenant », et après création RDV.
 */
export async function runRelationAutoSync(): Promise<RelationAutoSyncResult> {
  const status = await getEmailConnectionStatus();
  const mailReady =
    status.connected &&
    (status.provider === "google" || status.provider === "microsoft");
  const calendarReady = status.google_calendar_connected;
  if (!mailReady && !calendarReady) {
    return {
      skipped: true,
      mail_detected: 0,
      rdv_campaign_detected: 0,
      calendar_accepted: 0,
      calendar_declined: 0,
      calendar_cancelled: 0,
      errors: [],
    };
  }

  const errors: string[] = [];
  let mailDetected = 0;
  let rdvCampaignDetected = 0;
  let calendarAccepted = 0;
  let calendarDeclined = 0;
  let calendarCancelled = 0;

  try {
    if (mailReady) {
      const email = await syncEmailCampaignResponses();
      mailDetected = email.mail_detected;
      rdvCampaignDetected = email.rdv_detected;
      errors.push(...email.errors);
    }
  } catch (e) {
    errors.push(e instanceof Error ? e.message : String(e));
  }

  try {
    if (calendarReady) {
      const cal = await syncCalendarRdv();
      calendarAccepted = cal.accepted;
      calendarDeclined = cal.declined;
      calendarCancelled = cal.cancelled;
      errors.push(...cal.errors);
    }
  } catch (e) {
    errors.push(e instanceof Error ? e.message : String(e));
  }

  const changed =
    mailDetected > 0 ||
    rdvCampaignDetected > 0 ||
    calendarAccepted > 0 ||
    calendarDeclined > 0 ||
    calendarCancelled > 0;

  if (changed) {
    notifyRelationChanged();
  }

  return {
    skipped: false,
    mail_detected: mailDetected,
    rdv_campaign_detected: rdvCampaignDetected,
    calendar_accepted: calendarAccepted,
    calendar_declined: calendarDeclined,
    calendar_cancelled: calendarCancelled,
    errors,
  };
}
