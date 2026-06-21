import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { X } from "lucide-react";

export function ContactsActiveFilters({
  searchQuery,
  onClearSearch,
  statutFilter,
  statutLabel,
  onClearStatut,
  etiquetteFilter,
  etiquetteLabel,
  onClearEtiquette,
  segmentFilter,
  segmentLabel,
  onClearSegment,
  needsFollowupOnly,
  onToggleNeedsFollowup,
  followupCount,
  pipelineStageLabel,
  onClearPipelineStage,
}: {
  searchQuery: string;
  onClearSearch: () => void;
  statutFilter: string;
  statutLabel: string;
  onClearStatut: () => void;
  etiquetteFilter: string;
  etiquetteLabel?: string;
  onClearEtiquette: () => void;
  segmentFilter?: string;
  segmentLabel?: string;
  onClearSegment?: () => void;
  needsFollowupOnly: boolean;
  onToggleNeedsFollowup: () => void;
  followupCount: number;
  pipelineStageLabel?: string;
  onClearPipelineStage?: () => void;
}) {
  const hasChips =
    searchQuery.trim() ||
    statutFilter !== "ALL" ||
    etiquetteFilter !== "ALL" ||
    (segmentFilter != null && segmentFilter !== "ALL") ||
    needsFollowupOnly ||
    Boolean(pipelineStageLabel);

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button
        type="button"
        variant={needsFollowupOnly ? "default" : "outline"}
        size="sm"
        className="h-8"
        onClick={onToggleNeedsFollowup}
        disabled={followupCount === 0 && !needsFollowupOnly}
      >
        À recontacter
        {followupCount > 0 && (
          <Badge variant="secondary" className="ml-1.5 h-5 px-1.5 tabular-nums">
            {followupCount}
          </Badge>
        )}
      </Button>
      {hasChips && (
        <div className="flex flex-wrap items-center gap-1.5 pl-1 border-l border-border/60">
          {searchQuery.trim() && (
            <FilterChip label={`Recherche : ${searchQuery.trim()}`} onRemove={onClearSearch} />
          )}
          {statutFilter !== "ALL" && (
            <FilterChip label={statutLabel} onRemove={onClearStatut} />
          )}
          {etiquetteFilter !== "ALL" && etiquetteLabel && (
            <FilterChip label={etiquetteLabel} onRemove={onClearEtiquette} />
          )}
          {segmentFilter != null &&
            segmentFilter !== "ALL" &&
            segmentLabel &&
            onClearSegment && (
              <FilterChip label={segmentLabel} onRemove={onClearSegment} />
            )}
          {pipelineStageLabel && onClearPipelineStage && (
            <FilterChip label={pipelineStageLabel} onRemove={onClearPipelineStage} />
          )}
        </div>
      )}
    </div>
  );
}

function FilterChip({ label, onRemove }: { label: string; onRemove: () => void }) {
  return (
    <Badge variant="secondary" className="gap-1 pr-1 font-normal">
      <span className="max-w-[12rem] truncate">{label}</span>
      <button
        type="button"
        className="rounded-full p-0.5 hover:bg-muted"
        onClick={onRemove}
        aria-label={`Retirer le filtre ${label}`}
      >
        <X className="h-3 w-3" />
      </button>
    </Badge>
  );
}
