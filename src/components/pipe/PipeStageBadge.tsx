import { Badge } from "@/components/ui/badge";
import { getPipeStageBadgeClasses } from "@/lib/pipe/pipe-stage-colors";
import { isPipeStage, PIPE_STAGE_LABELS } from "@/lib/pipe/pipe-types";
import { cn } from "@/lib/utils";

export function PipeStageBadge({ stage }: { stage: string }) {
  if (!stage || !isPipeStage(stage)) return null;
  return (
    <Badge variant="outline" className={cn("font-normal", getPipeStageBadgeClasses(stage))}>
      {PIPE_STAGE_LABELS[stage]}
    </Badge>
  );
}
