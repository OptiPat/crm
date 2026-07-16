import type { PlacementOperationWithContact } from "@/lib/api/tauri-box-placement";
import type { PlacementPipeOpenCount } from "@/lib/api/tauri-box-placement";
import {
  filterPlacementRowsForBoard,
  getPlacementBoardColumn,
  PLACEMENT_BOARD_COLUMN_COLORS,
  PLACEMENT_BOARD_COLUMNS,
  PLACEMENT_SUIVI_LIST_COLUMN_LABELS,
  type PlacementBoardColumn,
} from "@/lib/placement/placement-operation-board";

export { PLACEMENT_SUIVI_LIST_COLUMN_LABELS as PIPE_LIST_SUIVI_COLUMN_LABELS };

export type PipeListSuiviStatusBadge = {
  label: string;
  badgeClassName: string;
};

export function placementCountsShowListBadge(
  counts: Pick<PlacementPipeOpenCount, "unsent" | "pending" | "non_conforme"> | undefined
): boolean {
  return (
    counts != null &&
    (counts.unsent > 0 || counts.pending > 0 || counts.non_conforme > 0)
  );
}

/** Colonne kanban la plus en amont par pipe suivi (pour la liste). */
export function buildSuiviPlacementColumnByPipe(
  rows: PlacementOperationWithContact[]
): Record<number, { column: PlacementBoardColumn; count: number }> {
  const boardRows = filterPlacementRowsForBoard(rows);
  const columnsByPipe = new Map<number, PlacementBoardColumn[]>();

  for (const row of boardRows) {
    const pipeId = row.operation.pipe_id;
    if (pipeId == null || pipeId <= 0) continue;
    const column = getPlacementBoardColumn(row.operation);
    if (!column) continue;
    const list = columnsByPipe.get(pipeId) ?? [];
    list.push(column);
    columnsByPipe.set(pipeId, list);
  }

  const result: Record<number, { column: PlacementBoardColumn; count: number }> = {};
  for (const [pipeId, columns] of columnsByPipe) {
    const column =
      PLACEMENT_BOARD_COLUMNS.find((candidate) => columns.includes(candidate)) ?? columns[0];
    result[pipeId] = {
      column,
      count: columns.filter((value) => value === column).length,
    };
  }
  return result;
}

export function resolveSuiviListStatusBadge(
  pipeId: number,
  columnByPipe: Record<number, { column: PlacementBoardColumn; count: number }>
): PipeListSuiviStatusBadge {
  const entry = columnByPipe[pipeId];
  if (entry) {
    const shortLabel = PLACEMENT_SUIVI_LIST_COLUMN_LABELS[entry.column];
    const colors = PLACEMENT_BOARD_COLUMN_COLORS[entry.column];
    return {
      label: entry.count > 1 ? `${shortLabel} · ${entry.count}` : shortLabel,
      badgeClassName: colors.badge,
    };
  }
  return {
    label: "Journal",
    badgeClassName: "bg-muted text-muted-foreground border-border",
  };
}

export const PIPE_ACTION_LIST_BADGE: PipeListSuiviStatusBadge = {
  label: "Ponctuel",
  badgeClassName: "bg-muted text-muted-foreground border-border",
};
