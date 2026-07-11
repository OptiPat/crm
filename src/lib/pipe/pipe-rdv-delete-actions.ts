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
import { markPipeRdvCalendarCancelled } from "@/lib/api/tauri-calendar";
import { PIPE_STAGE_LABELS } from "@/lib/pipe/pipe-types";

type TimelineEntryWriter = (
  input: Omit<NewPipeTimelineEntryInput, "pipe_id">
) => Promise<PipeTimelineEntryRecord>;

type TimelineEntryRemover = (id: number) => Promise<void>;

export async function executeRdvCancellation(options: {
  pipe?: Pick<PipeRecord, "id" | "stage" | "pipe_type"> | null;
  entry: PipeTimelineEntryRecord;
  note?: string | null;
  addEntry: TimelineEntryWriter;
  removeEntry: TimelineEntryRemover;
}): Promise<{ revertedToProspection: boolean }> {
  const { titre, contenu } = buildRdvCancelledTimelinePayload(options.entry, options.note);
  const now = Math.floor(Date.now() / 1000);

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
    return { revertedToProspection: true };
  }

  return { revertedToProspection: false };
}

export async function applyRdvCancelled(options: {
  timeline: ReturnType<typeof usePipeTimeline>;
  pipe?: Pick<PipeRecord, "id" | "stage" | "pipe_type"> | null;
  entry: PipeTimelineEntryRecord;
  note?: string | null;
}): Promise<{ revertedToProspection: boolean }> {
  return executeRdvCancellation({
    pipe: options.pipe,
    entry: options.entry,
    note: options.note,
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
