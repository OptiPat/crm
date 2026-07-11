import type { PipeRecord } from "@/lib/api/tauri-pipe";
import type { usePipeTimeline } from "@/hooks/usePipeTimeline";
import { PIPE_STAGE_LABELS } from "@/lib/pipe/pipe-types";
import type { PipeTimelineUserType } from "@/lib/pipe/pipe-timeline-types";
import {
  applyRdvStageOnSave,
  formatRdvEntryTitle,
  type PipeRdvStage,
} from "@/lib/pipe/pipe-rdv-stage";
import { toast } from "sonner";

export async function addPipeTimelineEntryWithRdvStage(options: {
  timeline: ReturnType<typeof usePipeTimeline>;
  pipe?: Pick<PipeRecord, "id" | "stage" | "pipe_type"> | null;
  entryType: PipeTimelineUserType;
  rdvStage?: PipeRdvStage;
  titre: string;
  contenu: string | null;
  occurredAtUnix: number;
}) {
  const titre =
    options.entryType === "RDV" && options.rdvStage
      ? formatRdvEntryTitle(options.rdvStage)
      : options.titre;

  await options.timeline.addEntry({
    entry_type: options.entryType,
    titre,
    contenu: options.contenu,
    occurred_at: options.occurredAtUnix,
  });

  if (options.entryType !== "RDV" || !options.rdvStage || !options.pipe) {
    return null;
  }

  return applyRdvStageOnSave({
    pipe: options.pipe,
    rdvStage: options.rdvStage,
    occurredAt: options.occurredAtUnix,
    notes: options.contenu,
  });
}

export function toastAfterRdvSave(
  rdvStage: PipeRdvStage,
  result: { advanced: boolean; scheduledDateLabel?: string } | null,
  fallbackSuccess = "RDV ajouté"
) {
  if (!result) {
    toast.success(fallbackSuccess);
    return;
  }
  if (result.advanced) {
    toast.success(`RDV enregistré — avancement : ${PIPE_STAGE_LABELS[rdvStage]}`);
    return;
  }
  if (result.scheduledDateLabel) {
    toast.success(
      `RDV planifié. Passage en ${PIPE_STAGE_LABELS[rdvStage]} le ${result.scheduledDateLabel}.`
    );
    return;
  }
  toast.success(fallbackSuccess);
}
