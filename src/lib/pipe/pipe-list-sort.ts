import type { PipeRecord } from "@/lib/api/tauri-pipe";
import type { PlacementPipeOpenCount } from "@/lib/api/tauri-box-placement";
import {
  PLACEMENT_BOARD_COLUMNS,
  type PlacementBoardColumn,
} from "@/lib/placement/placement-operation-board";
import { placementCountsShowListBadge } from "@/lib/pipe/pipe-list-badges";
import { isPipeStage, PIPE_STAGES } from "@/lib/pipe/pipe-types";

/** Rang unifié hors pipeline commercial / suivi Stellium (actions ponctuelles). */
const ACTION_ADVANCEMENT_RANK =
  Math.max(PIPE_STAGES.length, PLACEMENT_BOARD_COLUMNS.length);

export type PipeListSortKey =
  | "updated_desc"
  | "updated_asc"
  | "titre_asc"
  | "avancement_asc"
  | "avancement_desc";

export const DEFAULT_PIPE_LIST_SORT: PipeListSortKey = "updated_desc";

export const PIPE_LIST_SORT_KEYS: PipeListSortKey[] = [
  "updated_desc",
  "updated_asc",
  "titre_asc",
  "avancement_asc",
  "avancement_desc",
];

export const PIPE_LIST_SORT_LABELS: Record<PipeListSortKey, string> = {
  updated_desc: "Modification — plus récent",
  updated_asc: "Modification — plus ancien",
  titre_asc: "Titre — A → Z",
  avancement_asc: "Avancement — début → fin",
  avancement_desc: "Avancement — fin → début",
};

export function isPipeListSortKey(value: string): value is PipeListSortKey {
  return (PIPE_LIST_SORT_KEYS as readonly string[]).includes(value);
}

export interface PipeListSortContext {
  columnByPipe: Record<number, { column: PlacementBoardColumn; count: number }>;
  countsByPipe: Record<number, PlacementPipeOpenCount>;
}

function affaireAdvancementRank(stage: string): number {
  if (!isPipeStage(stage)) return PIPE_STAGES.length;
  return PIPE_STAGES.indexOf(stage);
}

function suiviAdvancementRank(
  pipeId: number,
  countsByPipe: Record<number, PlacementPipeOpenCount>,
  columnByPipe: Record<number, { column: PlacementBoardColumn; count: number }>
): number {
  const counts = countsByPipe[pipeId];
  if (placementCountsShowListBadge(counts)) {
    if (counts!.non_conforme > 0) {
      return PLACEMENT_BOARD_COLUMNS.indexOf("conforme_after_nc");
    }
    if (counts!.pending > 0) {
      return PLACEMENT_BOARD_COLUMNS.indexOf("waiting");
    }
    if (counts!.unsent > 0) {
      return PLACEMENT_BOARD_COLUMNS.indexOf("declare") - 1;
    }
  }

  const entry = columnByPipe[pipeId];
  if (!entry) return -1;
  return PLACEMENT_BOARD_COLUMNS.indexOf(entry.column);
}

export function getPipeAdvancementRank(
  pipe: PipeRecord,
  context: PipeListSortContext
): number {
  if (pipe.pipe_type === "AFFAIRE") {
    return affaireAdvancementRank(pipe.stage);
  }
  if (pipe.pipe_type === "ACTE_GESTION") {
    return suiviAdvancementRank(pipe.id, context.countsByPipe, context.columnByPipe);
  }
  return ACTION_ADVANCEMENT_RANK;
}

function comparePipeAdvancement(
  a: PipeRecord,
  b: PipeRecord,
  context: PipeListSortContext,
  direction: "asc" | "desc"
): number {
  const rankA = getPipeAdvancementRank(a, context);
  const rankB = getPipeAdvancementRank(b, context);
  const rankCmp = rankA - rankB;
  if (rankCmp !== 0) return direction === "asc" ? rankCmp : -rankCmp;

  return a.titre.localeCompare(b.titre, "fr", { sensitivity: "base" });
}

export function sortPipesForList(
  pipes: PipeRecord[],
  sortKey: PipeListSortKey,
  context: PipeListSortContext
): PipeRecord[] {
  const sorted = [...pipes];

  switch (sortKey) {
    case "updated_desc":
      sorted.sort((a, b) => b.updated_at - a.updated_at || a.id - b.id);
      break;
    case "updated_asc":
      sorted.sort((a, b) => a.updated_at - b.updated_at || a.id - b.id);
      break;
    case "titre_asc":
      sorted.sort(
        (a, b) =>
          a.titre.localeCompare(b.titre, "fr", { sensitivity: "base" }) || a.id - b.id
      );
      break;
    case "avancement_asc":
      sorted.sort((a, b) => comparePipeAdvancement(a, b, context, "asc") || a.id - b.id);
      break;
    case "avancement_desc":
      sorted.sort((a, b) => comparePipeAdvancement(a, b, context, "desc") || a.id - b.id);
      break;
  }

  return sorted;
}
