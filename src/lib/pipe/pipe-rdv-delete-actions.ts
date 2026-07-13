import { setPipeStage, type PipeRecord } from "@/lib/api/tauri-pipe";
import type {
  NewPipeTimelineEntryInput,
  PipeTimelineEntryRecord,
} from "@/lib/api/tauri-pipe-timeline";
import type { usePipeTimeline } from "@/hooks/usePipeTimeline";
import {
  buildRdvCancelledTimelinePayload,
  canRevertPipeToProspection,
} from "@/lib/pipe/pipe-rdv-delete";
import { markPipeRdvCalendarCancelled, resolvePipeRdvGoogleEventId } from "@/lib/api/tauri-calendar";
import { cancelLinkedGoogleRdv } from "@/lib/calendar/rdv-planifier";
import { PIPE_STAGE_LABELS } from "@/lib/pipe/pipe-types";

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
  addEntry: TimelineEntryWriter;
  removeEntry: TimelineEntryRemover;
}): Promise<{ revertedToProspection: boolean; googleCancelled: boolean }> {
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

  await options.addEntry({
    entry_type: "NOTE",
    titre,
    contenu,
    occurred_at: now,
  });
  await markPipeRdvCalendarCancelled(options.entry.id);
  await options.removeEntry(options.entry.id);

  const pipe = options.pipe;
  if (
    pipe?.pipe_type === "AFFAIRE" &&
    pipe.stage !== "PROSPECTION" &&
    canRevertPipeToProspection(pipe.stage)
  ) {
    await setPipeStage(pipe.id, "PROSPECTION", { notes: null });
    return { revertedToProspection: true, googleCancelled };
  }

  return { revertedToProspection: false, googleCancelled };
}

export async function applyRdvCancelled(options: {
  timeline: ReturnType<typeof usePipeTimeline>;
  pipe?: Pick<PipeRecord, "id" | "stage" | "pipe_type"> | null;
  entry: PipeTimelineEntryRecord;
  note?: string | null;
  cancelGoogle?: boolean;
}): Promise<{ revertedToProspection: boolean; googleCancelled: boolean }> {
  return executeRdvCancellation({
    pipe: options.pipe,
    entry: options.entry,
    note: options.note,
    cancelGoogle: options.cancelGoogle,
    addEntry: (input) => options.timeline.addEntry(input),
    removeEntry: (id) => options.timeline.removeEntry(id),
  });
}

export function toastAfterRdvCancelled(
  rdvLabel: string,
  result: { revertedToProspection: boolean }
): string {
  if (result.revertedToProspection) {
    return `${rdvLabel} annulé — affaire remise en ${PIPE_STAGE_LABELS.PROSPECTION}`;
  }
  return `${rdvLabel} annulé`;
}
