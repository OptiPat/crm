import { Monitor, Smartphone } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ClientPreviewViewport } from "./ClientPreviewAdvisorPanel";
import { CP } from "./client-preview-theme";

export interface ClientPreviewViewportToggleProps {
  viewport: ClientPreviewViewport;
  onChange: (viewport: ClientPreviewViewport) => void;
  className?: string;
}

export function ClientPreviewViewportToggle({
  viewport,
  onChange,
  className,
}: ClientPreviewViewportToggleProps) {
  return (
    <div
      className={cn("flex justify-center", CP.padX, className)}
      role="group"
      aria-label="Format d'affichage"
    >
      <div className="inline-flex rounded-xl border border-[var(--cp-line)] bg-[var(--cp-surface)] p-1">
        {(
          [
            ["mobile", "Mobile", Smartphone],
            ["desktop", "Ordinateur", Monitor],
          ] as const
        ).map(([id, label, Icon]) => (
          <button
            key={id}
            type="button"
            onClick={() => onChange(id)}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs transition-colors",
              viewport === id
                ? "bg-[var(--cp-surface-raised)] text-[var(--cp-ink)]"
                : "text-[var(--cp-ink-faint)] hover:text-[var(--cp-ink-muted)]"
            )}
          >
            <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden />
            {label}
          </button>
        ))}
      </div>
    </div>
  );
}
