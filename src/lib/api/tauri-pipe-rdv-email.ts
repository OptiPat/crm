import { invoke } from "@tauri-apps/api/core";

export interface PipeRdvReminderSchedule {
  id: number;
  pipe_timeline_entry_id: number;
  pipe_id: number;
  contact_id: number;
  template_id: number;
  send_at: number;
  rdv_at: number;
  rdv_end_at: number;
  visio_link?: string | null;
  event_location?: string | null;
}

export interface PipeRdvReminderScheduleUpsert {
  pipe_id: number;
  contact_id: number;
  template_id: number;
  send_at: number;
  rdv_at: number;
  rdv_end_at: number;
  visio_link?: string | null;
  event_location?: string | null;
}

export async function replacePipeRdvReminderSchedules(input: {
  pipeTimelineEntryId: number;
  rows: PipeRdvReminderScheduleUpsert[];
}): Promise<void> {
  return invoke<void>("replace_pipe_rdv_reminder_schedules", {
    input: {
      pipe_timeline_entry_id: input.pipeTimelineEntryId,
      rows: input.rows.map((r) => ({
        pipe_id: r.pipe_id,
        contact_id: r.contact_id,
        template_id: r.template_id,
        send_at: r.send_at,
        rdv_at: r.rdv_at,
        rdv_end_at: r.rdv_end_at,
        visio_link: r.visio_link ?? null,
        event_location: r.event_location ?? null,
      })),
    },
  });
}

export async function cancelPipeRdvReminderSchedules(
  pipeTimelineEntryId: number
): Promise<number> {
  return invoke<number>("cancel_pipe_rdv_reminder_schedules", {
    pipeTimelineEntryId,
  });
}

export async function listDuePipeRdvReminderSchedules(
  limit?: number
): Promise<PipeRdvReminderSchedule[]> {
  return invoke<PipeRdvReminderSchedule[]>("list_due_pipe_rdv_reminder_schedules", {
    limit: limit ?? 20,
  });
}

export async function markPipeRdvReminderScheduleSent(scheduleId: number): Promise<void> {
  return invoke<void>("mark_pipe_rdv_reminder_schedule_sent", { scheduleId });
}
