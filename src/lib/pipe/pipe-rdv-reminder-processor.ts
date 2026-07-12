import { getContactById } from "@/lib/api/tauri-contacts";
import { getEmailConnectionStatus } from "@/lib/api/tauri-email-oauth";
import { getPipeById } from "@/lib/api/tauri-pipe";
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

export type PipeRdvReminderProcessResult = {
  processed: number;
  sent: number;
  skipped: number;
  errors: string[];
};

/** Rappel inutile si le RDV a déjà commencé (app relancée tardivement). */
export function isPipeRdvReminderExpired(
  rdvAtUnix: number,
  nowUnix = Math.floor(Date.now() / 1000)
): boolean {
  return rdvAtUnix <= nowUnix;
}

async function sendDueReminder(schedule: PipeRdvReminderSchedule): Promise<"sent" | "skipped"> {
  if (isPipeRdvReminderExpired(schedule.rdv_at)) {
    await markPipeRdvReminderScheduleSent(schedule.id);
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

  await sendPipeRdvTemplatedEmailToContact({
    contact,
    pipe,
    principal,
    tutoiement,
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
    return { processed: 0, sent: 0, skipped: 0, errors: [] };
  }

  const due = await listDuePipeRdvReminderSchedules(limit);
  let sent = 0;
  let skipped = 0;
  const errors: string[] = [];

  for (const schedule of due) {
    try {
      const outcome = await sendDueReminder(schedule);
      if (outcome === "sent") sent += 1;
      else skipped += 1;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      errors.push(msg);
      await logEmailSendError({
        contactId: schedule.contact_id,
        templateNom: `Rappel RDV #${schedule.template_id}`,
        errorMessage: msg,
        sendMode: "pipe_rdv_reminder",
      }).catch(() => {});
    }
  }

  return { processed: due.length, sent, skipped, errors };
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
