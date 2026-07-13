import type { PipeRecord } from "@/lib/api/tauri-pipe";
import {
  isManualPipeStageChangeAllowed,
  isPipeBoardRdvDropTargetStage,
  type PipeStage,
} from "@/lib/pipe/pipe-types";
import { isPipeRdvStage, type PipeRdvStage } from "@/lib/pipe/pipe-rdv-stage";

export type PipeBoardStageDropAction =
  | { kind: "ignore" }
  | { kind: "plan-rdv"; rdvStage: PipeRdvStage }
  | { kind: "manual-advance"; stage: PipeStage };

export function resolvePipeBoardStageDrop(
  pipe: Pick<PipeRecord, "stage">,
  target: PipeStage
): PipeBoardStageDropAction {
  if (pipe.stage === target) return { kind: "ignore" };
  if (isPipeBoardRdvDropTargetStage(target) && isPipeRdvStage(target)) {
    return { kind: "plan-rdv", rdvStage: target };
  }
  if (isManualPipeStageChangeAllowed(target)) {
    return { kind: "manual-advance", stage: target };
  }
  return { kind: "ignore" };
}
