import { Check } from "lucide-react";
import {
  getPlacementOperationStepperSteps,
  PLACEMENT_STEPPER_FIELD_LABEL,
  type PlacementStepperStep,
  type PlacementStepperStepState,
} from "@/lib/placement/placement-operation-stepper";
import type { PlacementOperation } from "@/lib/api/tauri-box-placement";
import { cn } from "@/lib/utils";

interface PipePlacementStepperProps {
  operation: PlacementOperation;
  /** Masquer le titre « Avancement » (plusieurs opérations sur le même pipe). */
  hideTitle?: boolean;
}

function stepDotClass(state: PlacementStepperStepState, step: PlacementStepperStep) {
  if (state === "done") {
    if (step.id === "first_response") {
      return step.responseNonConforme ? "bg-red-600 text-white" : "bg-green-600 text-white";
    }
    return "bg-green-600 text-white";
  }
  if (state === "active") {
    if (step.id === "first_response" && step.responseNonConforme) {
      return "bg-red-600 text-white";
    }
    return "bg-primary text-primary-foreground";
  }
  return "bg-muted text-muted-foreground";
}

export function PipePlacementStepper({ operation, hideTitle = false }: PipePlacementStepperProps) {
  const steps = getPlacementOperationStepperSteps(operation);

  return (
    <div className="space-y-2">
      {!hideTitle && <p className="text-sm font-medium">{PLACEMENT_STEPPER_FIELD_LABEL}</p>}

      <div className="overflow-x-auto pb-1">
        <div
          className="flex min-w-max items-center gap-1"
          aria-label="Étapes suivi partenaire Stellium"
        >
          {steps.map((step, index) => {
            const done = step.state === "done";
            const active = step.state === "active";
            const stepNumber = index + 1;

            return (
              <div key={step.id} className="flex items-center">
                <div
                  className="flex flex-col items-center gap-1 min-w-[3.75rem] rounded-lg px-1 py-1"
                  aria-current={active ? "step" : undefined}
                >
                  <span
                    className={cn(
                      "flex h-8 w-8 items-center justify-center rounded-full text-xs font-medium transition-colors",
                      stepDotClass(step.state, step)
                    )}
                  >
                    {done ? <Check className="h-4 w-4" aria-hidden /> : stepNumber}
                  </span>
                  <span
                    className={cn(
                      "text-[11px] font-medium text-center leading-tight max-w-[4.5rem]",
                      active ? "text-primary" : "text-muted-foreground"
                    )}
                  >
                    {step.label}
                  </span>
                  {step.sublabel ? (
                    <span className="text-[10px] text-muted-foreground text-center leading-tight max-w-[4.5rem] line-clamp-2">
                      {step.sublabel}
                    </span>
                  ) : null}
                </div>
                {index < steps.length - 1 && (
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
