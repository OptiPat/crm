import { Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import type { PipeTimelineEntryRecord } from "@/lib/api/tauri-pipe-timeline";
import { PipeRdvPlanStageButton } from "@/components/pipe/PipeRdvPlanStageButton";
import {
  formatRdvPlanOptionLabel,
  planOptionsForRdvStage,
  stageHasPlanVariants,
  type PipeRdvPlanOption,
} from "@/lib/pipe/pipe-rdv-plan-option";
import { isPipeRdvStage, type PipeRdvStage } from "@/lib/pipe/pipe-rdv-stage";
import {
  getPipeCommercialStepperStepState,
  getSuggestedRdvPlanStage,
  shouldShowPlanAnotherR3,
} from "@/lib/pipe/pipe-stage-stepper";
import {
  isPipeStage,
  PIPE_LINEAR_STAGES,
  PIPE_STAGE_DESCRIPTIONS,
  PIPE_STAGE_FIELD_LABEL,
  PIPE_STAGE_LABELS,
} from "@/lib/pipe/pipe-types";
import { phaseHasRdvActivityForStage } from "@/lib/pipe/pipe-rdv-delete";
import { cn } from "@/lib/utils";

interface PipeStageStepperProps {
  currentStage: string;
  timelineEntries?: PipeTimelineEntryRecord[];
  onViewProspection?: () => void;
  onPlanRdv?: (planOption: PipeRdvPlanOption) => void;
}

export function PipeStageStepper({
  currentStage,
  timelineEntries = [],
  onViewProspection,
  onPlanRdv,
}: PipeStageStepperProps) {
  if (!isPipeStage(currentStage)) return null;

  const stage = currentStage;

  const suggestedRdvStage = getSuggestedRdvPlanStage(stage, timelineEntries);

  const handleProspectionClick = () => {
    if (stage !== "PROSPECTION") {
      onViewProspection?.();
      return;
    }
    document
      .getElementById("pipe-prospection-section")
      ?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const showPlanNextRdv =
    suggestedRdvStage &&
    onPlanRdv &&
    stage !== "GAGNEE" &&
    stage !== "PERDUE_OU_EN_ATTENTE";

  const showPlanAnotherR2 =
    onPlanRdv && phaseHasRdvActivityForStage(timelineEntries, "R2");

  const showPlanAnotherR3 = onPlanRdv && shouldShowPlanAnotherR3(stage, timelineEntries);

  return (
    <div className="space-y-2">
      <p className="text-sm font-medium">{PIPE_STAGE_FIELD_LABEL}</p>

      <div className="overflow-x-auto pb-1">
        <div className="flex min-w-max items-center gap-1" aria-label="Étapes commerciales">
          {PIPE_LINEAR_STAGES.map((step, index) => {
            const stepState = getPipeCommercialStepperStepState(step, stage, timelineEntries);
            const done = stepState === "done";
            const active = stepState === "active";
            const isProspection = step === "PROSPECTION";
            const isRdvStep = isPipeRdvStage(step);

            const stepContent = (
              <>
                <span
                  className={cn(
                    "flex h-8 w-8 items-center justify-center rounded-full text-xs font-medium transition-colors",
                    done && "bg-green-600 text-white",
                    active && !done && "bg-primary text-primary-foreground",
                    !done && !active && "bg-muted text-muted-foreground"
                  )}
                >
                  {done ? <Check className="h-4 w-4" aria-hidden /> : index + 1}
                </span>
                <span
                  className={cn(
                    "text-[11px] font-medium text-center leading-tight max-w-[4.5rem]",
                    active ? "text-primary" : "text-muted-foreground"
                  )}
                >
                  {PIPE_STAGE_LABELS[step]}
                </span>
              </>
            );

            const stepButtonClass = cn(
              "flex flex-col items-center gap-1 min-w-[3.75rem] rounded-lg px-1 py-1 transition-colors",
              "cursor-pointer hover:bg-muted/60",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            );

            return (
              <div key={step} className="flex items-center">
                {isProspection ? (
                  <button
                    type="button"
                    onClick={handleProspectionClick}
                    title={PIPE_STAGE_DESCRIPTIONS[step]}
                    className={stepButtonClass}
                  >
                    {stepContent}
                  </button>
                ) : isRdvStep && active && onPlanRdv && stageHasPlanVariants(step) ? (
                  <Popover>
                    <PopoverTrigger asChild>
                      <button
                        type="button"
                        title={PIPE_STAGE_DESCRIPTIONS[step]}
                        className={stepButtonClass}
                      >
                        {stepContent}
                      </button>
                    </PopoverTrigger>
                    <PopoverContent className="w-52 p-2" align="center">
                      <p className="mb-2 px-1 text-xs text-muted-foreground">
                        Planifier {PIPE_STAGE_LABELS[step]}
                      </p>
                      <div className="flex flex-col gap-1">
                        {planOptionsForRdvStage(step as PipeRdvStage).map((option) => (
                          <Button
                            key={option}
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="h-8 justify-start text-xs"
                            onClick={() => onPlanRdv(option)}
                          >
                            {formatRdvPlanOptionLabel(option)}
                          </Button>
                        ))}
                      </div>
                    </PopoverContent>
                  </Popover>
                ) : isRdvStep && active && onPlanRdv ? (
                  <button
                    type="button"
                    onClick={() => onPlanRdv(step as PipeRdvPlanOption)}
                    title={PIPE_STAGE_DESCRIPTIONS[step]}
                    className={stepButtonClass}
                  >
                    {stepContent}
                  </button>
                ) : (
                  <div
                    title={PIPE_STAGE_DESCRIPTIONS[step]}
                    className="flex flex-col items-center gap-1 min-w-[3.75rem] rounded-lg px-1 py-1"
                    aria-current={active ? "step" : undefined}
                  >
                    {stepContent}
                  </div>
                )}
                {index < PIPE_LINEAR_STAGES.length - 1 && (
                  <div
                    className={cn(
                      "mx-0.5 h-0.5 w-6 sm:w-8 rounded",
                      done ? "bg-green-600" : "bg-muted"
                    )}
                    aria-hidden
                  />
                )}
              </div>
            );
          })}
        </div>
      </div>

      {(showPlanNextRdv || showPlanAnotherR2 || showPlanAnotherR3) && (
        <div className="flex flex-wrap gap-2">
          {showPlanNextRdv && suggestedRdvStage ? (
            <PipeRdvPlanStageButton stage={suggestedRdvStage} onSelect={onPlanRdv} />
          ) : null}
          {showPlanAnotherR2 ? (
            <PipeRdvPlanStageButton
              stage="R2"
              variant="ghost"
              actionLabel="Planifier un autre R2"
              onSelect={onPlanRdv}
            />
          ) : null}
          {showPlanAnotherR3 ? (
            <PipeRdvPlanStageButton
              stage="R3"
              variant="ghost"
              actionLabel="Planifier un autre R3"
              onSelect={onPlanRdv}
            />
          ) : null}
        </div>
      )}
    </div>
  );
}
