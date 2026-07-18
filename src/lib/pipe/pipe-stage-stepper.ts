import type { PipeTimelineEntryRecord } from "@/lib/api/tauri-pipe-timeline";
import { phaseHasRdvActivityForStage } from "@/lib/pipe/pipe-rdv-delete";
import {
  isPipeRdvStage,
  isPipeRdvStageCompleted,
  type PipeRdvStage,
} from "@/lib/pipe/pipe-rdv-stage";
import {
  getLinearStageIndex,
  getNextLinearStage,
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
    // R3 : plusieurs RDV possibles (Placements, Immo) tant que l'affaire reste à R3
    if (current === "R3") return linearIndex;
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
  const done =
    stepIndex < linearIndex ||
    (rdvCompleted && !(currentStage === "R3" && step === "R3"));

  const effectiveActiveIndex = getEffectiveActiveLinearIndex(currentStage, entries, now);
  if (stepIndex === effectiveActiveIndex && !done) return "active";
  if (currentStage === "R3" && step === "R3") return "active";

  return done ? "done" : "pending";
}

function getNextRdvStageAfter(stage: PipeRdvStage): PipeRdvStage | null {
  const next = getNextLinearStage(stage);
  return next && isPipeRdvStage(next) ? next : null;
}

/** RDV manquant sur le jalon, sinon RDV de l'étape suivante (anticipation). */
function suggestedRdvForMilestoneStage(
  milestone: PipeRdvStage,
  entries: PipeTimelineEntryRecord[]
): PipeRdvStage | null {
  if (!phaseHasRdvActivityForStage(entries, milestone)) {
    return milestone;
  }
  return getNextRdvStageAfter(milestone);
}

/**
 * Prochain RDV à proposer via « Planifier le RDV … » (stepper).
 * Tient compte du RDV manquant sur l'étape active, pas seulement de l'étape linéaire suivante.
 */
export function getSuggestedRdvPlanStage(
  currentStage: PipeStage,
  entries: PipeTimelineEntryRecord[],
  now: Date = new Date()
): PipeRdvStage | null {
  const effectiveActiveIndex = getEffectiveActiveLinearIndex(currentStage, entries, now);
  if (effectiveActiveIndex < 0) return null;

  const activeStep = PIPE_LINEAR_STAGES[effectiveActiveIndex];

  if (isPipeRdvStage(activeStep)) {
    return suggestedRdvForMilestoneStage(activeStep, entries);
  }

  if (activeStep === "PROSPECTION") {
    return suggestedRdvForMilestoneStage("R1", entries);
  }

  return null;
}

/** Bouton « Planifier un autre R3 » (Placements / Immo) tant que l'affaire est à R3. */
export function shouldShowPlanAnotherR3(
  currentStage: PipeStage,
  entries: PipeTimelineEntryRecord[]
): boolean {
  return currentStage === "R3" && phaseHasRdvActivityForStage(entries, "R3");
}
