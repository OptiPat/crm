import type { PipeRecord } from "@/lib/api/tauri-pipe";
import {
  formatPipeParticipantsLabel,
  isPipeStage,
  isPipeType,
  PIPE_STAGES,
  PIPE_TYPES,
  type PipeStage,
  type PipeType,
} from "@/lib/pipe/pipe-types";

export const PIPE_LIST_FILTERS_KEY = "crm:pipe-list-filters";

export type PipeListFilters = {
  search: string;
  pipeType: PipeType | "ALL";
  stage: PipeStage | "ALL";
};

export const DEFAULT_PIPE_LIST_FILTERS: PipeListFilters = {
  search: "",
  pipeType: "ALL",
  stage: "ALL",
};

export function loadPipeListFilters(): PipeListFilters {
  try {
    const raw = localStorage.getItem(PIPE_LIST_FILTERS_KEY);
    if (!raw) return DEFAULT_PIPE_LIST_FILTERS;
    const parsed = JSON.parse(raw) as Partial<PipeListFilters>;
    return {
      search: typeof parsed.search === "string" ? parsed.search : "",
      pipeType:
        parsed.pipeType === "ALL" ||
        (typeof parsed.pipeType === "string" && isPipeType(parsed.pipeType))
          ? parsed.pipeType
          : "ALL",
      stage:
        parsed.stage === "ALL" ||
        (typeof parsed.stage === "string" && isPipeStage(parsed.stage))
          ? parsed.stage
          : "ALL",
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
  filters: PipeListFilters
): PipeRecord[] {
  const q = filters.search.trim().toLowerCase();
  return pipes.filter((pipe) => {
    if (filters.pipeType !== "ALL" && pipe.pipe_type !== filters.pipeType) {
      return false;
    }
    if (filters.stage !== "ALL" && pipe.stage !== filters.stage) {
      return false;
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
