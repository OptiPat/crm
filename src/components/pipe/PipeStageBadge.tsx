import { Badge } from "@/components/ui/badge";
import type { PipeRecord } from "@/lib/api/tauri-pipe";
import type { PipeTimelineEntryRecord } from "@/lib/api/tauri-pipe-timeline";
import {
  PIPE_BOARD_COLUMN_LABELS,
  resolveAffaireBoardColumn,
} from "@/lib/pipe/pipe-board-columns";
import {
  getPipeBoardColumnBadgeClasses,
  getPipeStageBadgeClasses,
} from "@/lib/pipe/pipe-stage-colors";
import {
  formatVersementComplementaireAffaireStageLabel,
  versementComplementaireAffaireStageBadgeClasses,
} from "@/lib/pipe/pipe-suivi";
import { isPipeStage, PIPE_STAGE_LABELS } from "@/lib/pipe/pipe-types";
import { cn } from "@/lib/utils";

export function PipeStageBadge({
  stage,
  pipe,
  timelineEntries,
}: {
  stage: string;
  pipe?: Pick<PipeRecord, "pipe_type" | "parent_pipe_id" | "titre" | "stage">;
  timelineEntries?: PipeTimelineEntryRecord[];
}) {
  const versementLabel = pipe ? formatVersementComplementaireAffaireStageLabel(pipe) : null;
  if (versementLabel && pipe) {
    return (
      <Badge
        variant="outline"
        className={cn(
          "font-normal",
          versementComplementaireAffaireStageBadgeClasses(pipe.stage as "PROSPECTION" | "GAGNEE")
        )}
      >
        {versementLabel}
      </Badge>
    );
  }
  if (pipe?.pipe_type === "AFFAIRE" && timelineEntries !== undefined) {
    const column = resolveAffaireBoardColumn(pipe, timelineEntries);
    return (
      <Badge variant="outline" className={cn("font-normal", getPipeBoardColumnBadgeClasses(column))}>
        {PIPE_BOARD_COLUMN_LABELS[column]}
      </Badge>
    );
  }
  if (!stage || !isPipeStage(stage)) return null;
  return (
    <Badge variant="outline" className={cn("font-normal", getPipeStageBadgeClasses(stage))}>
      {PIPE_STAGE_LABELS[stage]}
    </Badge>
  );
}
