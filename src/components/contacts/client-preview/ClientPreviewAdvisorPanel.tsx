import { Eye, EyeOff, Monitor, Smartphone, Wallet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export type ClientPreviewViewport = "mobile" | "desktop";

export interface ClientPreviewAdvisorPanelProps {
  visibleCount: number;
  hiddenCount: number;
  valorisationLabel: string | null;
  viewport: ClientPreviewViewport;
  onViewportChange: (viewport: ClientPreviewViewport) => void;
  onOpenPatrimoine?: () => void;
  lastSyncLabel?: string | null;
}

function ViewportToggle({
  viewport,
  onChange,
}: {
  viewport: ClientPreviewViewport;
  onChange: (v: ClientPreviewViewport) => void;
}) {
  return (
    <div
      className="inline-flex rounded-lg border border-border bg-muted/50 p-0.5"
      role="group"
      aria-label="Format d'aperçu"
    >
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
            "inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors",
            viewport === id
              ? "bg-background text-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground"
          )}
        >
          <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden />
          {label}
        </button>
      ))}
    </div>
  );
}

export function ClientPreviewAdvisorPanel({
  visibleCount,
  hiddenCount,
  valorisationLabel,
  viewport,
  onViewportChange,
  onOpenPatrimoine,
  lastSyncLabel,
}: ClientPreviewAdvisorPanelProps) {
  return (
    <div className="w-full max-w-3xl space-y-3 font-sans">
      <div className="rounded-lg border border-border bg-card px-4 py-3 shadow-sm">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0 space-y-1.5 text-sm">
            <p className="font-medium text-foreground">Aperçu conseiller</p>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-muted-foreground">
              <span className="inline-flex items-center gap-1.5">
                <Eye className="h-3.5 w-3.5 shrink-0" aria-hidden />
                {visibleCount} placement{visibleCount !== 1 ? "s" : ""} visible
              </span>
              {hiddenCount > 0 ? (
                <span className="inline-flex items-center gap-1.5 text-amber-700 dark:text-amber-400">
                  <EyeOff className="h-3.5 w-3.5 shrink-0" aria-hidden />
                  {hiddenCount} masqué{hiddenCount !== 1 ? "s" : ""} (confidentialité)
                </span>
              ) : null}
            </div>
            {valorisationLabel ? (
              <p className="text-xs text-muted-foreground">
                Dernière valorisation suivie :{" "}
                <span className="text-foreground">{valorisationLabel}</span>
              </p>
            ) : null}
            <p className="text-xs text-muted-foreground">
              {lastSyncLabel ? (
                <>
                  Dernière synchro espace client :{" "}
                  <span className="text-foreground">{lastSyncLabel}</span>
                </>
              ) : (
                <span className="italic">Espace client non encore synchronisé</span>
              )}
            </p>
          </div>

          <div className="flex shrink-0 flex-wrap items-center gap-2">
            {onOpenPatrimoine ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-8"
                onClick={onOpenPatrimoine}
              >
                <Wallet className="mr-1.5 h-3.5 w-3.5" aria-hidden />
                Patrimoine
              </Button>
            ) : null}
            <ViewportToggle viewport={viewport} onChange={onViewportChange} />
          </div>
        </div>
      </div>
    </div>
  );
}
