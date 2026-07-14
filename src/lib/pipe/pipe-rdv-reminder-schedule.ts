import type { TemplateEmail } from "@/lib/api/tauri-templates-email";
import { getTemplateEmailById } from "@/lib/api/tauri-templates-email";
import type { PipeRecord } from "@/lib/api/tauri-pipe";
import {
  computePipeRdvFollowUpSendAt,
  computePipeRdvReminderSendAt,
  parseTemplateEmailPipeRdvFollowUp,
  parseTemplateEmailPipeRdvReminder,
  type PipeRdvScheduleKind,
} from "@/lib/emails/template-email-pipe-rdv";
import {
  cancelPipeRdvReminderSchedules,
  replacePipeRdvReminderSchedules,
  type PipeRdvReminderScheduleUpsert,
} from "@/lib/api/tauri-pipe-rdv-email";
import type { RdvVisioOptions } from "@/lib/calendar/rdv-visio";
import { resolveRdvEmailVisioAndLieu } from "@/lib/pipe/pipe-rdv-email-vars";

function participantContactIds(
  pipe: Pick<PipeRecord, "contact_id" | "secondary_contact_id">
): number[] {
  const contactIds = [pipe.contact_id, pipe.secondary_contact_id].filter(
    (id): id is number => id != null && id > 0
  );
  return [...new Set(contactIds)];
}

async function resolveDedicatedTemplateId(
  templateId: number
): Promise<number | null> {
  try {
    await getTemplateEmailById(templateId);
    return templateId;
  } catch {
    return null;
  }
}

async function buildScheduleRows(options: {
  pipeTimelineEntryId: number;
  pipe: Pick<PipeRecord, "id" | "contact_id" | "secondary_contact_id">;
  template: TemplateEmail;
  startAtUnix: number;
  endAtUnix: number;
  visioLink?: string | null;
  eventLocation?: string | null;
  visio?: RdvVisioOptions;
  physicalAddress?: string | null;
  scheduleKind: PipeRdvScheduleKind;
  enabled: boolean;
  sendAt: number | null;
  dedicatedTemplateId: number | null;
}): Promise<PipeRdvReminderScheduleUpsert[]> {
  if (!options.enabled || options.sendAt == null) {
    return [];
  }

  let reminderTemplateId = options.template.id;
  if (options.dedicatedTemplateId) {
    const resolved = await resolveDedicatedTemplateId(options.dedicatedTemplateId);
    if (resolved == null) return [];
    reminderTemplateId = resolved;
  }

  const uniqueIds = participantContactIds(options.pipe);
  const { lien_visio, lieu_rdv } = resolveRdvEmailVisioAndLieu({
    visioLink: options.visioLink,
    eventLocation: options.eventLocation,
    visio: options.visio,
    physicalAddress: options.physicalAddress,
  });

  return uniqueIds.map((contactId) => ({
    pipe_id: options.pipe.id,
    contact_id: contactId,
    template_id: reminderTemplateId,
    send_at: options.sendAt!,
    rdv_at: options.startAtUnix,
    rdv_end_at: options.endAtUnix,
    schedule_kind: options.scheduleKind,
    visio_link: lien_visio || null,
    event_location: lieu_rdv || null,
  }));
}

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
  const followUp = parseTemplateEmailPipeRdvFollowUp(options.template.variables);

  const beforeSendAt = reminder.enabled
    ? computePipeRdvReminderSendAt(options.startAtUnix, reminder)
    : null;
  const afterSendAt = followUp.enabled
    ? computePipeRdvFollowUpSendAt(options.endAtUnix, followUp)
    : null;

  if (!reminder.enabled) {
    await cancelPipeRdvReminderSchedules(options.pipeTimelineEntryId, "before");
  }
  if (!followUp.enabled) {
    await cancelPipeRdvReminderSchedules(options.pipeTimelineEntryId, "after");
  }

  const beforeRows = await buildScheduleRows({
    pipeTimelineEntryId: options.pipeTimelineEntryId,
    pipe: options.pipe,
    template: options.template,
    startAtUnix: options.startAtUnix,
    endAtUnix: options.endAtUnix,
    visioLink: options.visioLink,
    eventLocation: options.eventLocation,
    visio: options.visio,
    physicalAddress: options.physicalAddress,
    scheduleKind: "before",
    enabled: reminder.enabled,
    sendAt: beforeSendAt,
    dedicatedTemplateId:
      !reminder.use_same_message && reminder.reminder_template_id
        ? reminder.reminder_template_id
        : null,
  });

  const afterRows = await buildScheduleRows({
    pipeTimelineEntryId: options.pipeTimelineEntryId,
    pipe: options.pipe,
    template: options.template,
    startAtUnix: options.startAtUnix,
    endAtUnix: options.endAtUnix,
    visioLink: options.visioLink,
    eventLocation: options.eventLocation,
    visio: options.visio,
    physicalAddress: options.physicalAddress,
    scheduleKind: "after",
    enabled: followUp.enabled,
    sendAt: afterSendAt,
    dedicatedTemplateId:
      !followUp.use_same_message && followUp.follow_up_template_id
        ? followUp.follow_up_template_id
        : null,
  });

  const rows = [...beforeRows, ...afterRows];

  if (reminder.enabled && beforeSendAt == null) {
    await cancelPipeRdvReminderSchedules(options.pipeTimelineEntryId, "before");
  }
  if (followUp.enabled && afterSendAt == null) {
    await cancelPipeRdvReminderSchedules(options.pipeTimelineEntryId, "after");
  }

  if (rows.length === 0) {
    return;
  }

  await replacePipeRdvReminderSchedules({
    pipeTimelineEntryId: options.pipeTimelineEntryId,
    rows,
  });
}
