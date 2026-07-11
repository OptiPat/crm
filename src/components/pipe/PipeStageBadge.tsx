import { Badge } from "@/components/ui/badge";
import { isPipeStage, PIPE_STAGE_LABELS } from "@/lib/pipe/pipe-types";

export function PipeStageBadge({ stage }: { stage: string }) {
  if (!stage || !isPipeStage(stage)) return null;
  return (
    <Badge variant="outline" className="font-normal">
      {PIPE_STAGE_LABELS[stage]}
    </Badge>
  );
}
