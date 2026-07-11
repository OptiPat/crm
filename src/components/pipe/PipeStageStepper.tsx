import { Check } from "lucide-react";
import {
  isPipeStage,
  PIPE_LINEAR_STAGES,
  PIPE_STAGE_DESCRIPTIONS,
  PIPE_STAGE_FIELD_LABEL,
  PIPE_STAGE_LABELS,
} from "@/lib/pipe/pipe-types";
import { cn } from "@/lib/utils";

interface PipeStageStepperProps {
  currentStage: string;
  onViewProspection?: () => void;
}

export function PipeStageStepper({
  currentStage,
  onViewProspection,
}: PipeStageStepperProps) {
  if (!isPipeStage(currentStage)) return null;

  const stage = currentStage;

  const linearIndex = PIPE_LINEAR_STAGES.indexOf(
    stage as (typeof PIPE_LINEAR_STAGES)[number]
  );

  const handleProspectionClick = () => {
    if (stage !== "PROSPECTION") {
      onViewProspection?.();
      return;
    }
    document
      .getElementById("pipe-prospection-section")
      ?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  return (
    <div className="space-y-2">
      <p className="text-sm font-medium">{PIPE_STAGE_FIELD_LABEL}</p>

      <div className="overflow-x-auto pb-1">
        <div className="flex min-w-max items-center gap-1" aria-label="Étapes commerciales">
          {PIPE_LINEAR_STAGES.map((step, index) => {
            const done = linearIndex >= 0 && index < linearIndex;
            const active = step === stage;
            const isProspection = step === "PROSPECTION";

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

            return (
              <div key={step} className="flex items-center">
                {isProspection ? (
                  <button
                    type="button"
                    onClick={handleProspectionClick}
                    title={PIPE_STAGE_DESCRIPTIONS[step]}
                    className={cn(
                      "flex flex-col items-center gap-1 min-w-[3.75rem] rounded-lg px-1 py-1 transition-colors",
                      "cursor-pointer hover:bg-muted/60",
                      "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    )}
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
    </div>
  );
}
