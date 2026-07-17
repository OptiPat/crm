import { cn } from "@/lib/utils";
import type { PipeRecord } from "@/lib/api/tauri-pipe";
import { formatPipeParticipantsLabel } from "@/lib/pipe/pipe-types";
import { PipeTypeBadge } from "@/components/pipe/PipeTypeBadge";
import { PipeStageBadge } from "@/components/pipe/PipeStageBadge";
import { PipePlacementBadge } from "@/components/pipe/PipePlacementBadge";
import { PipeR1MissingDocsBadge } from "@/components/pipe/PipeR1MissingDocsBadge";
import {
  PipeListStatusBadgeView,
  PipeSuiviListBadge,
} from "@/components/pipe/PipeSuiviListBadge";
import type { PlacementPipeOpenCount } from "@/lib/api/tauri-box-placement";
import type { PlacementBoardColumn } from "@/lib/placement/placement-operation-board";
import { PIPE_ACTION_LIST_BADGE } from "@/lib/pipe/pipe-list-badges";
import { isSuiviPipe } from "@/lib/pipe/pipe-suivi";

function formatUpdatedAt(ts: number): string {
  return new Date(ts * 1000).toLocaleDateString("fr-FR", {
    day: "2-digit",
    month: "short",
  });
}

interface PipeListProps {
  pipes: PipeRecord[];
  selectedId: number | null;
  onSelect: (pipe: PipeRecord) => void;
  placementCountsByPipe?: Record<number, PlacementPipeOpenCount>;
  suiviColumnByPipe?: Record<number, { column: PlacementBoardColumn; count: number }>;
  r1MissingByPipeId?: Record<number, string[]>;
}

export function PipeList({
  pipes,
  selectedId,
  onSelect,
  placementCountsByPipe = {},
  suiviColumnByPipe = {},
  r1MissingByPipeId = {},
}: PipeListProps) {
  if (pipes.length === 0) {
    return (
      <div className="px-4 py-8 text-center text-sm text-muted-foreground">
        Aucun pipe. Utilisez les boutons ci-dessus pour commencer.
      </div>
    );
  }

  return (
    <div className="divide-y">
      {pipes.map((pipe) => {
        const selected = pipe.id === selectedId;
        return (
          <div
            key={pipe.id}
            role="button"
            tabIndex={0}
            onClick={() => onSelect(pipe)}
            onKeyDown={(event) => {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                onSelect(pipe);
              }
            }}
            className={cn(
              "w-full px-4 py-3 text-left transition-colors hover:bg-muted/50 cursor-pointer",
              selected && "bg-primary/5 border-l-2 border-l-primary"
            )}
          >
            <div className="flex flex-wrap items-center gap-1.5 mb-1">
              <PipeTypeBadge pipeType={pipe.pipe_type} />
              {pipe.pipe_type === "AFFAIRE" ? (
                <PipeStageBadge stage={pipe.stage} pipe={pipe} />
              ) : null}
              {pipe.pipe_type === "AFFAIRE" && r1MissingByPipeId[pipe.id]?.length ? (
                <PipeR1MissingDocsBadge
                  missingLabels={r1MissingByPipeId[pipe.id]}
                  onClick={(event) => event.stopPropagation()}
                />
              ) : null}
              {isSuiviPipe(pipe) ? (
                <>
                  <PipePlacementBadge counts={placementCountsByPipe[pipe.id]} />
                  <PipeSuiviListBadge
                    pipeId={pipe.id}
                    counts={placementCountsByPipe[pipe.id]}
                    columnByPipe={suiviColumnByPipe}
                  />
                </>
              ) : null}
              {pipe.pipe_type === "ACTION" ? (
                <PipeListStatusBadgeView badge={PIPE_ACTION_LIST_BADGE} />
              ) : null}
            </div>
            <p className="font-medium text-sm truncate">{pipe.titre}</p>
            <p className="text-xs text-muted-foreground mt-0.5 truncate">
              {formatPipeParticipantsLabel(pipe)}
              {" · "}
              {formatUpdatedAt(pipe.updated_at)}
            </p>
          </div>
        );
      })}
    </div>
  );
}
