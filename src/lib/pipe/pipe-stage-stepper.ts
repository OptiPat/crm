import type { PipeTimelineEntryRecord } from "@/lib/api/tauri-pipe-timeline";
import {
  isPipeRdvStage,
  isPipeRdvStageCompleted,
} from "@/lib/pipe/pipe-rdv-stage";
import {
  getLinearStageIndex,
  PIPE_LINEAR_STAGES,
  type PipeLinearStage,
  type PipeStage,
} from "@/lib/pipe/pipe-types";

export type PipeCommercialStepperStepState = "done" | "active" | "pending";

/** Index de l'étape mise en avant (bleu) dans le stepper commercial. */
export function getEffectiveActiveLinearIndex(
  currentStage: PipeStage,
  entries: PipeTimelineEntryRecord[],
  now: Date = new Date()
): number {
  const linearIndex = getLinearStageIndex(currentStage);
  if (linearIndex < 0) return -1;

  const current = PIPE_LINEAR_STAGES[linearIndex] as PipeLinearStage;
  if (isPipeRdvStage(current) && isPipeRdvStageCompleted(current, entries, now)) {
    return Math.min(linearIndex + 1, PIPE_LINEAR_STAGES.length - 1);
  }
  return linearIndex;
}

export function getPipeCommercialStepperStepState(
  step: PipeLinearStage,
  currentStage: PipeStage,
  entries: PipeTimelineEntryRecord[],
  now: Date = new Date()
): PipeCommercialStepperStepState {
  const stepIndex = getLinearStageIndex(step);
  const linearIndex = getLinearStageIndex(currentStage);
  if (linearIndex < 0 || stepIndex < 0) return "pending";

  const rdvCompleted = isPipeRdvStage(step) && isPipeRdvStageCompleted(step, entries, now);
  const done = stepIndex < linearIndex || rdvCompleted;

  const effectiveActiveIndex = getEffectiveActiveLinearIndex(currentStage, entries, now);
  if (stepIndex === effectiveActiveIndex && !done) return "active";

  return done ? "done" : "pending";
}
