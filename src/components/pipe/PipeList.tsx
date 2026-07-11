import { cn } from "@/lib/utils";
import type { PipeRecord } from "@/lib/api/tauri-pipe";
import { formatPipeContactLabel } from "@/lib/pipe/pipe-types";
import { PipeTypeBadge } from "@/components/pipe/PipeTypeBadge";
import { PipeStageBadge } from "@/components/pipe/PipeStageBadge";

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
}

export function PipeList({ pipes, selectedId, onSelect }: PipeListProps) {
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
          <button
            key={pipe.id}
            type="button"
            onClick={() => onSelect(pipe)}
            className={cn(
              "w-full px-4 py-3 text-left transition-colors hover:bg-muted/50",
              selected && "bg-primary/5 border-l-2 border-l-primary"
            )}
          >
            <div className="flex flex-wrap items-center gap-1.5 mb-1">
              <PipeTypeBadge pipeType={pipe.pipe_type} />
              <PipeStageBadge stage={pipe.stage} />
            </div>
            <p className="font-medium text-sm truncate">{pipe.titre}</p>
            <p className="text-xs text-muted-foreground mt-0.5 truncate">
              {formatPipeContactLabel(pipe)}
              {" · "}
              {formatUpdatedAt(pipe.updated_at)}
            </p>
          </button>
        );
      })}
    </div>
  );
}
