import { getContactById } from "@/lib/api/tauri-contacts";
import { getEmailConnectionStatus } from "@/lib/api/tauri-email-oauth";
import { getPipeById } from "@/lib/api/tauri-pipe";
import { getPipeTimelineEntry } from "@/lib/api/tauri-pipe-timeline";
import {
  listDuePipeRdvReminderSchedules,
  markPipeRdvReminderScheduleSent,
  type PipeRdvReminderSchedule,
} from "@/lib/api/tauri-pipe-rdv-email";
import { logEmailSendError } from "@/lib/api/tauri-email-send-log";
import {
  loadPipeRdvTemplatePair,
  sendPipeRdvTemplatedEmailToContact,
} from "@/lib/pipe/pipe-rdv-confirmation-email";
import { rdvStageFromEntryTitre } from "@/lib/pipe/pipe-rdv-stage";

export type PipeRdvReminderProcessResult = {
  processed: number;
  sent: number;
  sentBefore: number;
  sentAfter: number;
  skipped: number;
  errors: string[];
};

export function formatPipeRdvScheduledEmailTrayNotify(options: {
  sentBefore: number;
  sentAfter: number;
}): { title: string; body: string } | null {
  const { sentBefore, sentAfter } = options;
  const total = sentBefore + sentAfter;
  if (total <= 0) return null;

  const parts: string[] = [];
  if (sentBefore > 0) {
    parts.push(
      sentBefore === 1 ? "1 rappel avant RDV" : `${sentBefore} rappels avant RDV`
    );
  }
  if (sentAfter > 0) {
    parts.push(
      sentAfter === 1 ? "1 suivi après RDV" : `${sentAfter} suivis après RDV`
    );
  }

  return {
    title: "CRM W.Y.S — Email RDV Pipe",
    body: `${parts.join(", ")} envoyé${total > 1 ? "s" : ""}.`,
  };
}

/** Rappel inutile si le RDV a déjà commencé (app relancée tardivement). */
export function isPipeRdvReminderExpired(
  rdvAtUnix: number,
  nowUnix = Math.floor(Date.now() / 1000)
): boolean {
  return rdvAtUnix <= nowUnix;
}

/** Suivi post-RDV inutile tant que le RDV n'est pas terminé. */
export function isPipeRdvFollowUpNotReady(
  rdvEndAtUnix: number,
  nowUnix = Math.floor(Date.now() / 1000)
): boolean {
  return rdvEndAtUnix > nowUnix;
}

async function sendDueReminder(schedule: PipeRdvReminderSchedule): Promise<"sent" | "skipped"> {
  const nowUnix = Math.floor(Date.now() / 1000);
  if (
    schedule.schedule_kind === "before" &&
    isPipeRdvReminderExpired(schedule.rdv_at, nowUnix)
  ) {
    await markPipeRdvReminderScheduleSent(schedule.id);
    return "skipped";
  }
  if (
    schedule.schedule_kind === "after" &&
    isPipeRdvFollowUpNotReady(schedule.rdv_end_at, nowUnix)
  ) {
    return "skipped";
  }

  const [contact, pipe] = await Promise.all([
    getContactById(schedule.contact_id),
    getPipeById(schedule.pipe_id),
  ]);

  const participantIds = [pipe.contact_id, pipe.secondary_contact_id].filter(
    (id): id is number => id != null && id > 0
  );
  if (!participantIds.includes(contact.id)) {
    await markPipeRdvReminderScheduleSent(schedule.id);
    return "skipped";
  }

  if (!contact.email?.trim().includes("@")) {
    await markPipeRdvReminderScheduleSent(schedule.id);
    return "skipped";
  }

  const { principal, tutoiement } = await loadPipeRdvTemplatePair(schedule.template_id);

  const timelineEntry = await getPipeTimelineEntry(schedule.pipe_timeline_entry_id).catch(
    () => null
  );
  const rdvStage = timelineEntry ? rdvStageFromEntryTitre(timelineEntry.titre) ?? undefined : undefined;

  await sendPipeRdvTemplatedEmailToContact({
    contact,
    pipe,
    principal,
    tutoiement,
    rdvStage,
    timelineEntryTitre: timelineEntry?.titre,
    startAtUnix: schedule.rdv_at,
    endAtUnix: schedule.rdv_end_at,
    visioLink: schedule.visio_link,
    eventLocation: schedule.event_location,
  });

  await markPipeRdvReminderScheduleSent(schedule.id);
  return "sent";
}

/** Traite les rappels RDV Pipe échus (appelé en arrière-plan). */
let reminderProcessInFlight: Promise<PipeRdvReminderProcessResult> | null = null;

async function processDuePipeRdvRemindersInner(
  limit = 10
): Promise<PipeRdvReminderProcessResult> {
  const status = await getEmailConnectionStatus();
  if (!status.connected) {
    return { processed: 0, sent: 0, sentBefore: 0, sentAfter: 0, skipped: 0, errors: [] };
  }

  const due = await listDuePipeRdvReminderSchedules(limit);
  let sent = 0;
  let sentBefore = 0;
  let sentAfter = 0;
  let skipped = 0;
  const errors: string[] = [];

  for (const schedule of due) {
    try {
      const outcome = await sendDueReminder(schedule);
      if (outcome === "sent") {
        sent += 1;
        if (schedule.schedule_kind === "after") sentAfter += 1;
        else sentBefore += 1;
      } else skipped += 1;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      errors.push(msg);
      await logEmailSendError({
        contactId: schedule.contact_id,
        templateNom: `${
          schedule.schedule_kind === "after" ? "Suivi" : "Rappel"
        } RDV #${schedule.template_id}`,
        errorMessage: msg,
        sendMode:
          schedule.schedule_kind === "after" ? "pipe_rdv_follow_up" : "pipe_rdv_reminder",
      }).catch(() => {});
    }
  }

  return { processed: due.length, sent, sentBefore, sentAfter, skipped, errors };
}

export async function processDuePipeRdvReminders(
  limit = 10
): Promise<PipeRdvReminderProcessResult> {
  if (reminderProcessInFlight) return reminderProcessInFlight;
  reminderProcessInFlight = processDuePipeRdvRemindersInner(limit).finally(() => {
    reminderProcessInFlight = null;
  });
  return reminderProcessInFlight;
}
