import { Badge } from "@/components/ui/badge";
import type { PlacementPipeOpenCount } from "@/lib/api/tauri-box-placement";
import {
  placementCountsShowListBadge,
  resolveSuiviListStatusBadge,
  type PipeListSuiviStatusBadge,
} from "@/lib/pipe/pipe-list-badges";
import type { PlacementBoardColumn } from "@/lib/placement/placement-operation-board";
import { cn } from "@/lib/utils";

export function PipeSuiviListBadge({
  pipeId,
  counts,
  columnByPipe,
}: {
  pipeId: number;
  counts: Pick<PlacementPipeOpenCount, "unsent" | "pending" | "non_conforme"> | undefined;
  columnByPipe: Record<number, { column: PlacementBoardColumn; count: number }>;
}) {
  if (placementCountsShowListBadge(counts)) return null;

  const badge = resolveSuiviListStatusBadge(pipeId, columnByPipe);
  return <PipeListStatusBadgeView badge={badge} />;
}

export function PipeListStatusBadgeView({ badge }: { badge: PipeListSuiviStatusBadge }) {
  return (
    <Badge variant="outline" className={cn("font-normal", badge.badgeClassName)}>
      {badge.label}
    </Badge>
  );
}
