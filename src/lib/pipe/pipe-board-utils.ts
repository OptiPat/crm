import type { PipeRecord } from "@/lib/api/tauri-pipe";
import { isVersementComplementaireAffaire } from "@/lib/pipe/pipe-suivi";
import { isPipeStage, isPipeType, PIPE_STAGES, pipeTypeUsesStage, type PipeStage } from "@/lib/pipe/pipe-types";

export const PIPE_VIEW_MODE_KEY = "crm:pipe-view-mode";

export type PipeViewMode = "board" | "list";

export const PIPE_BOARD_TAB_KEY = "crm:pipe-board-tab";

export type PipeBoardTab = "affaires" | "actes" | "remuneration";

export function loadPipeBoardTab(): PipeBoardTab {
  try {
    const raw = localStorage.getItem(PIPE_BOARD_TAB_KEY);
    if (raw === "affaires" || raw === "actes" || raw === "remuneration") return raw;
  } catch {
    /* ignore */
  }
  return "affaires";
}

export function savePipeBoardTab(tab: PipeBoardTab): void {
  try {
    localStorage.setItem(PIPE_BOARD_TAB_KEY, tab);
  } catch {
    /* ignore */
  }
}

export function loadPipeViewMode(): PipeViewMode {
  try {
    const raw = localStorage.getItem(PIPE_VIEW_MODE_KEY);
    if (raw === "board" || raw === "list") return raw;
  } catch {
    /* ignore */
  }
  return "board";
}

export function savePipeViewMode(mode: PipeViewMode): void {
  try {
    localStorage.setItem(PIPE_VIEW_MODE_KEY, mode);
  } catch {
    /* ignore */
  }
}

/** Affaires éligibles au tableau kanban (avancement valide, hors versements complémentaires rattachés à un Suivi). */
export function filterAffairesForBoard(pipes: PipeRecord[]): PipeRecord[] {
  return pipes.filter(
    (p) =>
      isPipeType(p.pipe_type) &&
      pipeTypeUsesStage(p.pipe_type) &&
      isPipeStage(p.stage) &&
      !isVersementComplementaireAffaire(p)
  );
}

export function groupAffairesByStage(
  affaires: PipeRecord[]
): Record<PipeStage, PipeRecord[]> {
  const groups = Object.fromEntries(
    PIPE_STAGES.map((stage) => [stage, [] as PipeRecord[]])
  ) as Record<PipeStage, PipeRecord[]>;

  for (const pipe of affaires) {
    if (isPipeStage(pipe.stage)) {
      groups[pipe.stage].push(pipe);
    }
  }

  for (const stage of PIPE_STAGES) {
    groups[stage].sort((a, b) => b.updated_at - a.updated_at);
  }

  return groups;
}
