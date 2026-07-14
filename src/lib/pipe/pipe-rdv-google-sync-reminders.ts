import type { AgendaGooglePipeSyncResult } from "@/lib/api/tauri-calendar";
import { getPipeRdvCalendarEventForTimeline } from "@/lib/api/tauri-calendar";
import { getPipeById } from "@/lib/api/tauri-pipe";
import { getPipeTimelineEntry } from "@/lib/api/tauri-pipe-timeline";
import { pipeRdvCalendarEndAt } from "@/lib/pipe/pipe-rdv-google-calendar";
import { resyncPipeRdvScheduledEmails } from "@/lib/pipe/pipe-rdv-confirmation-email";
import { rdvStageFromEntryTitre } from "@/lib/pipe/pipe-rdv-stage";

/** Replanifie les emails planifiés après un report détecté côté Google Agenda. */
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

      const pipe = await getPipeById(entry.pipe_id);
      const calendar = await getPipeRdvCalendarEventForTimeline(timelineEntryId);
      const startAtUnix = calendar?.start_at ?? entry.occurred_at;
      const endAtUnix = calendar?.end_at ?? pipeRdvCalendarEndAt(startAtUnix);

      await resyncPipeRdvScheduledEmails({
        pipe: {
          id: pipe.id,
          contact_id: pipe.contact_id,
          secondary_contact_id: pipe.secondary_contact_id,
        },
        rdvStage,
        pipeTimelineEntryId: timelineEntryId,
        startAtUnix,
        endAtUnix,
        visioLink: calendar?.visio_link ?? null,
        eventLocation: calendar?.event_location ?? null,
        notifyOnError: false,
      });
    } catch (e) {
      console.warn(
        `Emails planifiés RDV Pipe après sync Google (timeline ${timelineEntryId}):`,
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
