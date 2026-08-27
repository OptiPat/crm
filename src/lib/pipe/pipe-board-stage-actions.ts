import type { PipeBoardColumn } from "@/lib/pipe/pipe-board-columns";
import {
  isPipeBoardManualDropTargetColumn,
  isPipeBoardRdvDropTargetColumn,
  rdvStageFromBoardColumn,
} from "@/lib/pipe/pipe-board-columns";
import type { PipeRdvStage } from "@/lib/pipe/pipe-rdv-stage";
import type { PipeStage } from "@/lib/pipe/pipe-types";

export type PipeBoardStageDropAction =
  | { kind: "ignore" }
  | { kind: "plan-rdv"; rdvStage: PipeRdvStage }
  | { kind: "manual-advance"; stage: PipeStage };

export function resolvePipeBoardStageDrop(
  currentColumn: PipeBoardColumn,
  target: PipeBoardColumn
): PipeBoardStageDropAction {
  if (currentColumn === target) return { kind: "ignore" };
  if (isPipeBoardRdvDropTargetColumn(target)) {
    const rdvStage = rdvStageFromBoardColumn(target);
    if (rdvStage) return { kind: "plan-rdv", rdvStage };
  }
  if (isPipeBoardManualDropTargetColumn(target)) {
    return { kind: "manual-advance", stage: target };
  }
  return { kind: "ignore" };
}
