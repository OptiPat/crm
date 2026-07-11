import { setPipeStage, type PipeRecord } from "@/lib/api/tauri-pipe";
import type { PipeTimelineEntryRecord } from "@/lib/api/tauri-pipe-timeline";
import type { usePipeTimeline } from "@/hooks/usePipeTimeline";
import { formatRdvCancellationNote } from "@/lib/pipe/pipe-rdv-delete";
import { PIPE_STAGE_LABELS } from "@/lib/pipe/pipe-types";

export async function applyRdvCancelled(options: {
  timeline: ReturnType<typeof usePipeTimeline>;
  entry: PipeTimelineEntryRecord;
  note?: string | null;
}) {
  const cancellationNote = formatRdvCancellationNote(options.entry, options.note);
  const now = Math.floor(Date.now() / 1000);

  await options.timeline.addEntry({
    entry_type: "NOTE",
    titre: "RDV annulé",
    contenu: cancellationNote,
    occurred_at: now,
  });
  await options.timeline.removeEntry(options.entry.id);
}

export async function applyRdvRevertToProspection(options: {
  timeline: ReturnType<typeof usePipeTimeline>;
  pipe: Pick<PipeRecord, "id" | "stage" | "pipe_type">;
  entry: PipeTimelineEntryRecord;
  note?: string | null;
}) {
  const cancellationNote = formatRdvCancellationNote(options.entry, options.note);
  await options.timeline.removeEntry(options.entry.id);

  if (options.pipe.pipe_type !== "AFFAIRE") return null;

  const stageNotes = cancellationNote.trim() || null;
  return setPipeStage(options.pipe.id, "PROSPECTION", { notes: stageNotes });
}

export function toastAfterRdvRevert(reverted: boolean) {
  if (reverted) {
    return `Affaire remise en ${PIPE_STAGE_LABELS.PROSPECTION}`;
  }
  return "RDV supprimé";
}
