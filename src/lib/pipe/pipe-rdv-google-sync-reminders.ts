import type { AgendaGooglePipeSyncResult } from "@/lib/api/tauri-calendar";
import { getPipeRdvCalendarEventForTimeline } from "@/lib/api/tauri-calendar";
import { getPipeById } from "@/lib/api/tauri-pipe";
import { getPipeTimelineEntry } from "@/lib/api/tauri-pipe-timeline";
import { resolvePipeRdvTemplateForStage } from "@/lib/emails/template-email-pipe-rdv";
import { pipeRdvCalendarEndAt } from "@/lib/pipe/pipe-rdv-google-calendar";
import { syncPipeRdvReminderSchedules } from "@/lib/pipe/pipe-rdv-reminder-schedule";
import { rdvStageFromEntryTitre } from "@/lib/pipe/pipe-rdv-stage";

/** Replanifie les rappels email après un report détecté côté Google Agenda. */
export async function resyncPipeRdvRemindersAfterGoogleReschedule(
  timelineEntryIds: number[]
): Promise<void> {
  const uniqueIds = [...new Set(timelineEntryIds.filter((id) => id > 0))];
  for (const timelineEntryId of uniqueIds) {
    try {
      const entry = await getPipeTimelineEntry(timelineEntryId);
      if (entry.entry_type !== "RDV") continue;

      const rdvStage = rdvStageFromEntryTitre(entry.titre);
      if (!rdvStage) continue;

      const template = await resolvePipeRdvTemplateForStage(rdvStage);
      if (!template) continue;

      const pipe = await getPipeById(entry.pipe_id);
      const calendar = await getPipeRdvCalendarEventForTimeline(timelineEntryId);
      const startAtUnix = calendar?.start_at ?? entry.occurred_at;
      const endAtUnix = calendar?.end_at ?? pipeRdvCalendarEndAt(startAtUnix);

      await syncPipeRdvReminderSchedules({
        pipeTimelineEntryId: timelineEntryId,
        pipe: {
          id: pipe.id,
          contact_id: pipe.contact_id,
          secondary_contact_id: pipe.secondary_contact_id,
        },
        template,
        startAtUnix,
        endAtUnix,
        visioLink: null,
        eventLocation: null,
      });
    } catch (e) {
      console.warn(
        `Rappel RDV Pipe après sync Google (timeline ${timelineEntryId}):`,
        e
      );
    }
  }
}

export async function handlePipeGoogleAgendaSyncResult(
  sync: AgendaGooglePipeSyncResult
): Promise<void> {
  const ids = sync.rescheduled_timeline_entry_ids ?? [];
  if (ids.length === 0) return;
  await resyncPipeRdvRemindersAfterGoogleReschedule(ids);
}
