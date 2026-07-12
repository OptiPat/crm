import type { TemplateEmail } from "@/lib/api/tauri-templates-email";
import { getTemplateEmailById } from "@/lib/api/tauri-templates-email";
import type { PipeRecord } from "@/lib/api/tauri-pipe";
import {
  computePipeRdvReminderSendAt,
  parseTemplateEmailPipeRdvReminder,
} from "@/lib/emails/template-email-pipe-rdv";
import {
  cancelPipeRdvReminderSchedules,
  replacePipeRdvReminderSchedules,
} from "@/lib/api/tauri-pipe-rdv-email";
import type { RdvVisioOptions } from "@/lib/calendar/rdv-visio";
import { resolveRdvEmailVisioAndLieu } from "@/lib/pipe/pipe-rdv-email-vars";

export async function syncPipeRdvReminderSchedules(options: {
  pipeTimelineEntryId: number;
  pipe: Pick<
    PipeRecord,
    | "id"
    | "contact_id"
    | "secondary_contact_id"
  >;
  template: TemplateEmail;
  startAtUnix: number;
  endAtUnix: number;
  visioLink?: string | null;
  eventLocation?: string | null;
  visio?: RdvVisioOptions;
  physicalAddress?: string | null;
}): Promise<void> {
  const reminder = parseTemplateEmailPipeRdvReminder(options.template.variables);
  if (!reminder.enabled) {
    await cancelPipeRdvReminderSchedules(options.pipeTimelineEntryId);
    return;
  }

  const sendAt = computePipeRdvReminderSendAt(options.startAtUnix, reminder);
  if (sendAt == null) {
    await cancelPipeRdvReminderSchedules(options.pipeTimelineEntryId);
    return;
  }

  let reminderTemplateId = options.template.id;
  if (!reminder.use_same_message && reminder.reminder_template_id) {
    reminderTemplateId = reminder.reminder_template_id;
  }

  try {
    await getTemplateEmailById(reminderTemplateId);
  } catch {
    await cancelPipeRdvReminderSchedules(options.pipeTimelineEntryId);
    return;
  }

  const contactIds = [options.pipe.contact_id, options.pipe.secondary_contact_id].filter(
    (id): id is number => id != null && id > 0
  );
  const uniqueIds = [...new Set(contactIds)];

  const { lien_visio, lieu_rdv } = resolveRdvEmailVisioAndLieu({
    visioLink: options.visioLink,
    eventLocation: options.eventLocation,
    visio: options.visio,
    physicalAddress: options.physicalAddress,
  });

  const rows = uniqueIds.map((contactId) => ({
    pipe_id: options.pipe.id,
    contact_id: contactId,
    template_id: reminderTemplateId,
    send_at: sendAt,
    rdv_at: options.startAtUnix,
    rdv_end_at: options.endAtUnix,
    visio_link: lien_visio || null,
    event_location: lieu_rdv || null,
  }));

  if (rows.length === 0) {
    await cancelPipeRdvReminderSchedules(options.pipeTimelineEntryId);
    return;
  }

  await replacePipeRdvReminderSchedules({
    pipeTimelineEntryId: options.pipeTimelineEntryId,
    rows,
  });
}
