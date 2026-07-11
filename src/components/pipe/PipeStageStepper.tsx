import { ArrowRight, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { setPipeStage } from "@/lib/api/tauri-pipe";
import {
  getNextLinearStage,
  isPipeStage,
  isTerminalPipeStage,
  PIPE_LINEAR_STAGES,
  PIPE_STAGE_DESCRIPTIONS,
  PIPE_STAGE_FIELD_LABEL,
  PIPE_STAGE_LABELS,
  type PipeStage,
} from "@/lib/pipe/pipe-types";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

interface PipeStageStepperProps {
  pipeId: number;
  currentStage: string;
}

export function PipeStageStepper({ pipeId, currentStage }: PipeStageStepperProps) {
  if (!isPipeStage(currentStage)) return null;

  const stage = currentStage;
  const nextStage = getNextLinearStage(stage);
  const terminal = isTerminalPipeStage(stage);

  const handleSetStage = async (target: PipeStage) => {
    if (target === stage) return;
    try {
      await setPipeStage(pipeId, target);
      toast.success(`Avancement : ${PIPE_STAGE_LABELS[target]}`);
    } catch (err) {
      toast.error(String(err));
    }
  };

  const linearIndex = PIPE_LINEAR_STAGES.indexOf(
    stage as (typeof PIPE_LINEAR_STAGES)[number]
  );

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-medium">{PIPE_STAGE_FIELD_LABEL}</p>
        {nextStage && !terminal && (
          <Button
            type="button"
            variant="secondary"
            size="sm"
            className="h-8 gap-1.5 text-xs"
            onClick={() => void handleSetStage(nextStage)}
          >
            Étape suivante
            <ArrowRight className="h-3.5 w-3.5" />
          </Button>
        )}
      </div>

      <div className="overflow-x-auto pb-1">
        <div className="flex min-w-max items-center gap-1">
          {PIPE_LINEAR_STAGES.map((step, index) => {
            const done = linearIndex >= 0 && index < linearIndex;
            const active = step === stage;

            return (
              <div key={step} className="flex items-center">
                <button
                  type="button"
                  onClick={() => {
                    if (step === "PROSPECTION" && step === stage) {
                      document
                        .getElementById("pipe-prospection-section")
                        ?.scrollIntoView({ behavior: "smooth", block: "start" });
                      return;
                    }
                    void handleSetStage(step);
                  }}
                  title={PIPE_STAGE_DESCRIPTIONS[step]}
                  className={cn(
                    "flex flex-col items-center gap-1 min-w-[3.75rem] rounded-lg px-1 py-1 transition-colors",
                    "cursor-pointer hover:bg-muted/60",
                    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  )}
                >
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
                </button>
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

      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          variant={stage === "PERDUE_OU_EN_ATTENTE" ? "default" : "outline"}
          size="sm"
          className="h-8 text-xs"
          onClick={() => void handleSetStage("PERDUE_OU_EN_ATTENTE")}
        >
          {PIPE_STAGE_LABELS.PERDUE_OU_EN_ATTENTE}
        </Button>
        <p className="text-xs text-muted-foreground flex-1 min-w-[12rem]">
          {PIPE_STAGE_DESCRIPTIONS[stage]}
        </p>
      </div>
    </div>
  );
}
