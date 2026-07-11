import { setPipeStage, type PipeRecord } from "@/lib/api/tauri-pipe";
import type { PipeTimelineEntryRecord } from "@/lib/api/tauri-pipe-timeline";
import type { usePipeTimeline } from "@/hooks/usePipeTimeline";
import {
  buildRdvCancelledTimelinePayload,
  canRevertPipeToProspection,
} from "@/lib/pipe/pipe-rdv-delete";
import { PIPE_STAGE_LABELS } from "@/lib/pipe/pipe-types";

export async function applyRdvCancelled(options: {
  timeline: ReturnType<typeof usePipeTimeline>;
  pipe?: Pick<PipeRecord, "id" | "stage" | "pipe_type"> | null;
  entry: PipeTimelineEntryRecord;
  note?: string | null;
}): Promise<{ revertedToProspection: boolean }> {
  const { titre, contenu } = buildRdvCancelledTimelinePayload(options.entry, options.note);
  const now = Math.floor(Date.now() / 1000);

  await options.timeline.addEntry({
    entry_type: "NOTE",
    titre,
    contenu,
    occurred_at: now,
  });
  await options.timeline.removeEntry(options.entry.id);

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

export function toastAfterRdvCancelled(
  rdvLabel: string,
  result: { revertedToProspection: boolean }
): string {
  if (result.revertedToProspection) {
    return `${rdvLabel} annulé — affaire remise en ${PIPE_STAGE_LABELS.PROSPECTION}`;
  }
  return `${rdvLabel} annulé`;
}
