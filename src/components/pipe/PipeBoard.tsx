import { useMemo, useState } from "react";
import { GripVertical } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { setPipeStage, type PipeRecord } from "@/lib/api/tauri-pipe";
import { groupAffairesByStage } from "@/lib/pipe/pipe-board-utils";
import {
  formatPipeContactLabel,
  PIPE_STAGE_LABELS,
  PIPE_STAGES,
  type PipeStage,
} from "@/lib/pipe/pipe-types";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

const DRAG_MIME = "application/x-patrimoine-pipe-id";

function formatUpdatedAt(ts: number): string {
  return new Date(ts * 1000).toLocaleDateString("fr-FR", {
    day: "2-digit",
    month: "short",
  });
}

interface PipeBoardProps {
  affaires: PipeRecord[];
  selectedId: number | null;
  onSelect: (pipe: PipeRecord) => void;
}

export function PipeBoard({ affaires, selectedId, onSelect }: PipeBoardProps) {
  const byStage = useMemo(() => groupAffairesByStage(affaires), [affaires]);
  const [dragOverStage, setDragOverStage] = useState<PipeStage | null>(null);
  const [movingId, setMovingId] = useState<number | null>(null);

  const readDraggedPipeId = (e: React.DragEvent): number | null => {
    const raw = e.dataTransfer.getData(DRAG_MIME);
    const id = Number(raw);
    return Number.isFinite(id) && id > 0 ? id : null;
  };

  const handleDragStart = (e: React.DragEvent, pipe: PipeRecord) => {
    e.dataTransfer.setData(DRAG_MIME, String(pipe.id));
    e.dataTransfer.effectAllowed = "move";
  };

  const handleDragOverColumn = (e: React.DragEvent, stage: PipeStage) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    setDragOverStage(stage);
  };

  const handleDropOnColumn = async (e: React.DragEvent, stage: PipeStage) => {
    e.preventDefault();
    setDragOverStage(null);
    const pipeId = readDraggedPipeId(e);
    if (!pipeId) return;

    const pipe = affaires.find((p) => p.id === pipeId);
    if (!pipe || pipe.stage === stage) return;

    setMovingId(pipeId);
    try {
      await setPipeStage(pipeId, stage);
      toast.success(`Avancement : ${PIPE_STAGE_LABELS[stage]}`);
    } catch (err) {
      toast.error(String(err));
    } finally {
      setMovingId(null);
    }
  };

  if (affaires.length === 0) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center px-6 py-16 text-center">
        <p className="text-sm font-medium">Aucune affaire sur le tableau</p>
        <p className="text-sm text-muted-foreground mt-2 max-w-md">
          Créez une affaire avec le bouton ci-dessus — elle apparaîtra dans la colonne
          Prospection.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-1 min-h-0 overflow-x-auto overflow-y-hidden p-4">
      <div className="flex h-full min-h-[420px] gap-3">
        {PIPE_STAGES.map((stage) => {
          const list = byStage[stage];
          const isTerminal = stage === "GAGNEE" || stage === "PERDUE_OU_EN_ATTENTE";
          const isDragOver = dragOverStage === stage;

          return (
            <section
              key={stage}
              className={cn(
                "flex w-[min(100vw-2rem,240px)] shrink-0 flex-col rounded-xl border bg-muted/15 transition-colors",
                isDragOver && "border-primary bg-primary/5 ring-1 ring-primary/30",
                isTerminal && "bg-muted/25"
              )}
              onDragOver={(e) => handleDragOverColumn(e, stage)}
              onDragLeave={() => setDragOverStage((prev) => (prev === stage ? null : prev))}
              onDrop={(e) => void handleDropOnColumn(e, stage)}
            >
              <header className="flex items-center justify-between gap-2 border-b px-3 py-2.5">
                <h3 className="text-sm font-medium leading-tight">{PIPE_STAGE_LABELS[stage]}</h3>
                <Badge variant="secondary" className="font-normal tabular-nums">
                  {list.length}
                </Badge>
              </header>

              <div className="flex-1 space-y-2 overflow-y-auto p-2 min-h-[120px]">
                {list.length === 0 ? (
                  <p className="px-1 py-6 text-center text-xs text-muted-foreground">
                    Glissez une affaire ici
                  </p>
                ) : (
                  list.map((pipe) => {
                    const selected = pipe.id === selectedId;
                    const moving = pipe.id === movingId;
                    return (
                      <article
                        key={pipe.id}
                        draggable={!moving}
                        onDragStart={(e) => handleDragStart(e, pipe)}
                        onDragEnd={() => setDragOverStage(null)}
                        className={cn(
                          "rounded-lg border bg-card p-2.5 shadow-sm transition-opacity",
                          selected && "border-primary ring-1 ring-primary/40",
                          moving && "opacity-50"
                        )}
                      >
                        <div className="flex items-start gap-1.5">
                          <GripVertical
                            className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground/60 cursor-grab active:cursor-grabbing"
                            aria-hidden
                          />
                          <button
                            type="button"
                            className="min-w-0 flex-1 text-left"
                            onClick={() => onSelect(pipe)}
                          >
                            <p className="text-sm font-medium leading-snug line-clamp-2">
                              {pipe.titre}
                            </p>
                            <p className="text-xs text-muted-foreground mt-1 truncate">
                              {formatPipeContactLabel(pipe)}
                            </p>
                            <p className="text-[11px] text-muted-foreground/80 mt-0.5">
                              {formatUpdatedAt(pipe.updated_at)}
                            </p>
                          </button>
                        </div>
                      </article>
                    );
                  })
                )}
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}
