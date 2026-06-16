import { Check, FileUp, ClipboardCheck, LayoutList } from "lucide-react";
import type { RioImportStep } from "@/lib/documents/rio-import-preview";

const STEPS: Array<{ id: RioImportStep; label: string; icon: typeof FileUp }> = [
  { id: 1, label: "Fichier", icon: FileUp },
  { id: 2, label: "Vérification", icon: ClipboardCheck },
  { id: 3, label: "Patrimoine", icon: LayoutList },
];

interface RioImportStepperProps {
  currentStep: RioImportStep;
  /** Masque l'étape patrimoine (ex. import QPI sans tri). */
  showPatrimoineStep?: boolean;
  className?: string;
}

export function RioImportStepper({
  currentStep,
  showPatrimoineStep = true,
  className = "",
}: RioImportStepperProps) {
  const visibleSteps = showPatrimoineStep ? STEPS : STEPS.filter((s) => s.id !== 3);

  return (
    <div className={`flex items-center justify-center gap-1 sm:gap-2 ${className}`}>
      {visibleSteps.map((step, index) => {
        const done = step.id < currentStep;
        const active = step.id === currentStep;
        const Icon = step.icon;

        return (
          <div key={step.id} className="flex items-center">
            <div className="flex flex-col items-center gap-1 min-w-[4.5rem]">
              <div
                className={`w-9 h-9 rounded-full flex items-center justify-center text-sm font-medium transition-all ${
                  done
                    ? "bg-green-500 text-white"
                    : active
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted text-muted-foreground"
                }`}
              >
                {done ? <Check className="h-4 w-4" aria-hidden /> : <Icon className="h-4 w-4" aria-hidden />}
              </div>
              <span
                className={`text-[11px] font-medium text-center leading-tight ${
                  active ? "text-primary" : "text-muted-foreground"
                }`}
              >
                {step.label}
              </span>
            </div>
            {index < visibleSteps.length - 1 && (
              <div
                className={`w-8 sm:w-12 h-1 mx-1 rounded ${
                  step.id < currentStep ? "bg-green-500" : "bg-muted"
                }`}
                aria-hidden
              />
            )}
          </div>
        );
      })}
    </div>
  );
}
