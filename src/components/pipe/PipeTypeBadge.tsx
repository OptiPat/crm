import { Badge } from "@/components/ui/badge";
import { PIPE_TYPE_LABELS, isPipeType, type PipeType } from "@/lib/pipe/pipe-types";

const TYPE_VARIANT: Record<PipeType, "default" | "secondary" | "outline"> = {
  AFFAIRE: "default",
  ACTE_GESTION: "secondary",
  ACTION: "outline",
};

export function PipeTypeBadge({ pipeType }: { pipeType: string }) {
  const type = isPipeType(pipeType) ? pipeType : "ACTION";
  return (
    <Badge variant={TYPE_VARIANT[type]} className="font-normal">
      {PIPE_TYPE_LABELS[type]}
    </Badge>
  );
}
