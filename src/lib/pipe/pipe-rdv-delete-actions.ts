import { setPipeStage, type PipeRecord } from "@/lib/api/tauri-pipe";
import type {
  NewPipeTimelineEntryInput,
  PipeTimelineEntryRecord,
} from "@/lib/api/tauri-pipe-timeline";
import { listPipeTimelineEntries } from "@/lib/api/tauri-pipe-timeline";
import type { usePipeTimeline } from "@/hooks/usePipeTimeline";
import {
  buildRdvCancelledTimelinePayload,
  resolveStageAfterRdvCancellation,
} from "@/lib/pipe/pipe-rdv-delete";
import { markPipeRdvCalendarCancelled, resolvePipeRdvGoogleEventId } from "@/lib/api/tauri-calendar";
import { cancelLinkedGoogleRdv } from "@/lib/calendar/rdv-planifier";
import { rdvStageFromEntryTitre } from "@/lib/pipe/pipe-rdv-stage";
import { PIPE_STAGE_LABELS, type PipeStage } from "@/lib/pipe/pipe-types";

type TimelineEntryWriter = (
  input: Omit<NewPipeTimelineEntryInput, "pipe_id">
) => Promise<PipeTimelineEntryRecord>;

type TimelineEntryRemover = (id: number) => Promise<void>;

export async function executeRdvCancellation(options: {
  pipe?: Pick<PipeRecord, "id" | "stage" | "pipe_type"> | null;
  entry: PipeTimelineEntryRecord;
  note?: string | null;
  /** Retire l'événement Google Agenda lié (défaut : oui). */
  cancelGoogle?: boolean;
  allEntries?: PipeTimelineEntryRecord[];
  addEntry: TimelineEntryWriter;
  removeEntry: TimelineEntryRemover;
}): Promise<{ revertedStage: PipeStage | null; googleCancelled: boolean }> {
  const { titre, contenu } = buildRdvCancelledTimelinePayload(options.entry, options.note);
  const now = Math.floor(Date.now() / 1000);

  let googleCancelled = false;
  if (options.cancelGoogle !== false) {
    const googleId =
      options.entry.google_event_id?.trim() ||
      (await resolvePipeRdvGoogleEventId(options.entry.id).catch(() => null));
    if (googleId) {
      await cancelLinkedGoogleRdv(googleId);
      googleCancelled = true;
    }
  }

  const pipe = options.pipe;
  let revertStage: PipeStage | null = null;
  if (pipe?.pipe_type === "AFFAIRE") {
    const rdvStage = rdvStageFromEntryTitre(options.entry.titre);
    if (rdvStage && pipe.stage === rdvStage) {
      const entries =
        options.allEntries ?? (await listPipeTimelineEntries(pipe.id));
      revertStage = resolveStageAfterRdvCancellation(
        pipe.stage,
        options.entry,
        entries
      );
    }
  }

  await options.addEntry({
    entry_type: "NOTE",
    titre,
    contenu,
    occurred_at: now,
  });
  await markPipeRdvCalendarCancelled(options.entry.id);
  await options.removeEntry(options.entry.id);

  if (revertStage) {
    await setPipeStage(pipe!.id, revertStage, { notes: null });
    return { revertedStage: revertStage, googleCancelled };
  }

  return { revertedStage: null, googleCancelled };
}

export async function applyRdvCancelled(options: {
  timeline: ReturnType<typeof usePipeTimeline>;
  pipe?: Pick<PipeRecord, "id" | "stage" | "pipe_type"> | null;
  entry: PipeTimelineEntryRecord;
  note?: string | null;
  cancelGoogle?: boolean;
}): Promise<{ revertedStage: PipeStage | null; googleCancelled: boolean }> {
  return executeRdvCancellation({
    pipe: options.pipe,
    entry: options.entry,
    note: options.note,
    cancelGoogle: options.cancelGoogle,
    allEntries: options.timeline.entries,
    addEntry: (input) => options.timeline.addEntry(input),
    removeEntry: (id) => options.timeline.removeEntry(id),
  });
}

export function toastAfterRdvCancelled(
  rdvLabel: string,
  result: { revertedStage: PipeStage | null }
): string {
  if (result.revertedStage) {
    return `${rdvLabel} annulé — avancement : ${PIPE_STAGE_LABELS[result.revertedStage]}`;
  }
  return `${rdvLabel} annulé`;
}
