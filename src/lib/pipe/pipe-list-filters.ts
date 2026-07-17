import type { PipeRecord } from "@/lib/api/tauri-pipe";
import type { PlacementPipeOpenCount } from "@/lib/api/tauri-box-placement";
import {
  PLACEMENT_BOARD_COLUMNS,
  PLACEMENT_SUIVI_LIST_COLUMN_LABELS,
  type PlacementBoardColumn,
} from "@/lib/placement/placement-operation-board";
import { PLACEMENT_UNDECLARED_BOX_LABEL } from "@/lib/placement/placement-operation-tracking";
import { placementCountsShowListBadge } from "@/lib/pipe/pipe-list-badges";
import {
  DEFAULT_PIPE_LIST_SORT,
  isPipeListSortKey,
  type PipeListSortKey,
} from "@/lib/pipe/pipe-list-sort";
import {
  formatPipeParticipantsLabel,
  isPipeStage,
  isPipeType,
  PIPE_STAGE_LABELS,
  PIPE_STAGES,
  PIPE_TYPES,
  type PipeStage,
  type PipeType,
} from "@/lib/pipe/pipe-types";

export const PIPE_LIST_FILTERS_KEY = "crm:pipe-list-filters";

export const PIPE_LIST_SUIVI_ALERT_STEPS = [
  "unsent",
  "pending",
  "non_conforme",
] as const;

export type PipeListSuiviAlertStep = (typeof PIPE_LIST_SUIVI_ALERT_STEPS)[number];

export const PIPE_LIST_SUIVI_STEP_FILTERS = [
  "journal",
  ...PIPE_LIST_SUIVI_ALERT_STEPS,
  ...PLACEMENT_BOARD_COLUMNS,
] as const;

export type PipeListSuiviStepFilter = (typeof PIPE_LIST_SUIVI_STEP_FILTERS)[number];

export type PipeListStageFilter = "ALL" | PipeStage | PipeListSuiviStepFilter;

export type PipeListFilters = {
  search: string;
  pipeType: PipeType | "ALL";
  stage: PipeListStageFilter;
  sort: PipeListSortKey;
};

export const DEFAULT_PIPE_LIST_FILTERS: PipeListFilters = {
  search: "",
  pipeType: "ALL",
  stage: "ALL",
  sort: DEFAULT_PIPE_LIST_SORT,
};

export const PIPE_LIST_SUIVI_STEP_LABELS: Record<PipeListSuiviStepFilter, string> = {
  journal: "Journal",
  unsent: PLACEMENT_UNDECLARED_BOX_LABEL,
  pending: "En attente",
  non_conforme: "Non conforme",
  ...PLACEMENT_SUIVI_LIST_COLUMN_LABELS,
};

export function isPipeListSuiviStepFilter(value: string): value is PipeListSuiviStepFilter {
  return (PIPE_LIST_SUIVI_STEP_FILTERS as readonly string[]).includes(value);
}

export function isPipeListStageFilter(value: string): value is PipeListStageFilter {
  return value === "ALL" || isPipeStage(value) || isPipeListSuiviStepFilter(value);
}

export function formatPipeListStageFilterLabel(stage: PipeListStageFilter): string {
  if (stage === "ALL") return "Toutes étapes";
  if (isPipeStage(stage)) return PIPE_STAGE_LABELS[stage];
  return PIPE_LIST_SUIVI_STEP_LABELS[stage];
}

export function coercePipeListStageForPipeType(
  pipeType: PipeType | "ALL",
  stage: PipeListStageFilter
): PipeListStageFilter {
  if (stage === "ALL") return "ALL";
  if (pipeType === "AFFAIRE") {
    return isPipeStage(stage) ? stage : "ALL";
  }
  if (pipeType === "ACTE_GESTION") {
    return isPipeListSuiviStepFilter(stage) ? stage : "ALL";
  }
  return "ALL";
}

export interface PipeListFilterContext {
  columnByPipe: Record<number, { column: PlacementBoardColumn; count: number }>;
  countsByPipe: Record<number, PlacementPipeOpenCount>;
  /** Faux tant que les opérations placement ne sont pas chargées (évite faux « Journal »). */
  placementContextReady?: boolean;
}

export function pipeMatchesSuiviAdvancementFilter(
  pipe: PipeRecord,
  step: PipeListSuiviStepFilter,
  context: PipeListFilterContext
): boolean {
  if (pipe.pipe_type !== "ACTE_GESTION") return false;

  const counts = context.countsByPipe[pipe.id];

  switch (step) {
    case "journal":
      return !placementCountsShowListBadge(counts) && context.columnByPipe[pipe.id] == null;
    case "unsent":
      return (counts?.unsent ?? 0) > 0;
    case "pending":
      return (counts?.pending ?? 0) > 0;
    case "non_conforme":
      return (counts?.non_conforme ?? 0) > 0;
    default:
      return (
        !placementCountsShowListBadge(counts) &&
        context.columnByPipe[pipe.id]?.column === step
      );
  }
}

export function loadPipeListFilters(): PipeListFilters {
  try {
    const raw = localStorage.getItem(PIPE_LIST_FILTERS_KEY);
    if (!raw) return DEFAULT_PIPE_LIST_FILTERS;
    const parsed = JSON.parse(raw) as Partial<PipeListFilters>;
    const pipeType =
      parsed.pipeType === "ALL" ||
      (typeof parsed.pipeType === "string" && isPipeType(parsed.pipeType))
        ? parsed.pipeType
        : "ALL";
    const stageRaw =
      parsed.stage === "ALL" ||
      (typeof parsed.stage === "string" && isPipeListStageFilter(parsed.stage))
        ? parsed.stage
        : "ALL";
    return {
      search: typeof parsed.search === "string" ? parsed.search : "",
      pipeType,
      stage: coercePipeListStageForPipeType(pipeType, stageRaw),
      sort:
        typeof parsed.sort === "string" && isPipeListSortKey(parsed.sort)
          ? parsed.sort
          : DEFAULT_PIPE_LIST_SORT,
    };
  } catch {
    return DEFAULT_PIPE_LIST_FILTERS;
  }
}

export function savePipeListFilters(filters: PipeListFilters): void {
  try {
    localStorage.setItem(PIPE_LIST_FILTERS_KEY, JSON.stringify(filters));
  } catch {
    /* ignore */
  }
}

export function filterPipesForList(
  pipes: PipeRecord[],
  filters: PipeListFilters,
  context?: PipeListFilterContext
): PipeRecord[] {
  const q = filters.search.trim().toLowerCase();
  return pipes.filter((pipe) => {
    if (filters.pipeType !== "ALL" && pipe.pipe_type !== filters.pipeType) {
      return false;
    }
    if (filters.stage !== "ALL") {
      if (isPipeStage(filters.stage)) {
        if (pipe.stage !== filters.stage) return false;
      } else if (isPipeListSuiviStepFilter(filters.stage)) {
        if (context?.placementContextReady === false) {
          // Attendre le chargement placement avant de filtrer par avancement suivi.
        } else if (!context || !pipeMatchesSuiviAdvancementFilter(pipe, filters.stage, context)) {
          return false;
        }
      }
    }
    if (!q) return true;
    const haystack = [
      pipe.titre,
      formatPipeParticipantsLabel(pipe),
      pipe.parent_titre ?? "",
    ]
      .join(" ")
      .toLowerCase();
    return haystack.includes(q);
  });
}

export function hasActivePipeListFilters(filters: PipeListFilters): boolean {
  return (
    filters.search.trim() !== "" ||
    filters.pipeType !== "ALL" ||
    filters.stage !== "ALL"
  );
}

export const PIPE_LIST_FILTER_PIPE_TYPES = ["ALL", ...PIPE_TYPES] as const;
export const PIPE_LIST_FILTER_STAGES = ["ALL", ...PIPE_STAGES] as const;
export const PIPE_LIST_FILTER_SUIVI_STEPS = ["ALL", ...PIPE_LIST_SUIVI_STEP_FILTERS] as const;
