import { ChevronRight } from "lucide-react";
import type { PipeRecord } from "@/lib/api/tauri-pipe";
import type { usePipeTimeline } from "@/hooks/usePipeTimeline";
import { PipeSuiviQuickAdd } from "@/components/pipe/PipeSuiviQuickAdd";
import { PipeSuiviStelliumActAdd } from "@/components/pipe/PipeSuiviStelliumActAdd";
import { PipeStageBadge } from "@/components/pipe/PipeStageBadge";

interface PipeSuiviSectionProps {
  pipe: PipeRecord;
  childAffaires: PipeRecord[];
  timeline: ReturnType<typeof usePipeTimeline>;
  onJournalAdded?: () => void;
  onOpenChildAffaire: (pipe: PipeRecord) => void;
}

export function PipeSuiviSection({
  pipe,
  childAffaires,
  timeline,
  onJournalAdded,
  onOpenChildAffaire,
}: PipeSuiviSectionProps) {
  return (
    <div className="space-y-6">
      <PipeSuiviQuickAdd
        timeline={timeline}
        pipe={pipe}
        onAdded={onJournalAdded}
      />

      <PipeSuiviStelliumActAdd timeline={timeline} pipe={pipe} onAdded={onJournalAdded} />

      {childAffaires.length > 0 && (
        <div className="space-y-2">
          <p className="text-sm font-medium">Affaires rattachées</p>
          <ul className="space-y-1.5">
            {childAffaires.map((child) => (
              <li key={child.id}>
                <button
                  type="button"
                  onClick={() => onOpenChildAffaire(child)}
                  className="flex w-full items-center justify-between gap-2 rounded-lg border px-3 py-2 text-left text-sm hover:bg-muted/50 transition-colors"
                >
                  <span className="min-w-0 truncate font-medium">{child.titre}</span>
                  <span className="flex shrink-0 items-center gap-1.5">
                    {child.stage ? (
                      <PipeStageBadge stage={child.stage} pipe={child} />
                    ) : (
                      <span className="text-xs text-muted-foreground">Affaire</span>
                    )}
                    <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
