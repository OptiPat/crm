import { Badge } from "@/components/ui/badge";
import type { PipeRecord } from "@/lib/api/tauri-pipe";
import { getPipeStageBadgeClasses } from "@/lib/pipe/pipe-stage-colors";
import {
  formatVersementComplementaireAffaireStageLabel,
  versementComplementaireAffaireStageBadgeClasses,
} from "@/lib/pipe/pipe-suivi";
import { isPipeStage, PIPE_STAGE_LABELS } from "@/lib/pipe/pipe-types";
import { cn } from "@/lib/utils";

export function PipeStageBadge({
  stage,
  pipe,
}: {
  stage: string;
  pipe?: Pick<PipeRecord, "pipe_type" | "parent_pipe_id" | "titre" | "stage">;
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
  if (!stage || !isPipeStage(stage)) return null;
  return (
    <Badge variant="outline" className={cn("font-normal", getPipeStageBadgeClasses(stage))}>
      {PIPE_STAGE_LABELS[stage]}
    </Badge>
  );
}
