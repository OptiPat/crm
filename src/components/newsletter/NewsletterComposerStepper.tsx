import { Check, FileText, Send, Users, ClipboardCheck } from "lucide-react";
import type { NewsletterComposerStep } from "@/lib/newsletter/newsletter-composer-steps";

const STEP_ICONS = {
  audience: Users,
  content: FileText,
  prepare: ClipboardCheck,
  send: Send,
} as const;

type NewsletterComposerStepperProps = {
  steps: NewsletterComposerStep[];
  className?: string;
};

export function NewsletterComposerStepper({ steps, className = "" }: NewsletterComposerStepperProps) {
  return (
    <div className={`flex items-center justify-center gap-1 sm:gap-2 ${className}`}>
      {steps.map((step, index) => {
        const Icon = STEP_ICONS[step.id];
        const done = step.done;
        const active = step.active;

        return (
          <div key={step.id} className="flex items-center">
            <div className="flex flex-col items-center gap-1 min-w-[4.25rem] sm:min-w-[4.75rem]">
              <div
                className={`w-8 h-8 sm:w-9 sm:h-9 rounded-full flex items-center justify-center text-sm font-medium transition-all ${
                  done ?
                    "bg-green-500 text-white"
                  : active ?
                    "bg-primary text-primary-foreground"
                  : "bg-muted text-muted-foreground"
                }`}
              >
                {done ?
                  <Check className="h-4 w-4" aria-hidden />
                : <Icon className="h-4 w-4" aria-hidden />}
              </div>
              <span
                className={`text-[10px] sm:text-[11px] font-medium text-center leading-tight ${
                  active ? "text-primary" : "text-muted-foreground"
                }`}
              >
                {step.label}
              </span>
            </div>
            {index < steps.length - 1 && (
              <div
                className={`w-6 sm:w-10 h-1 mx-0.5 sm:mx-1 rounded ${
                  step.done ? "bg-green-500" : "bg-muted"
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
