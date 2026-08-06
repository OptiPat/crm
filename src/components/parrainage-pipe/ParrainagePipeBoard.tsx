import { useMemo, useRef, useState } from "react";
import { GripVertical } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import type { ParrainagePipeRecord } from "@/lib/api/tauri-parrainage-pipe";
import { groupParrainagePipesByStage } from "@/lib/parrainage-pipe/parrainage-pipe-board-utils";
import { PARRAINAGE_PIPE_STAGE_BOARD_COLORS } from "@/lib/parrainage-pipe/parrainage-pipe-stage-colors";
import {
  formatParrainageContactLabel,
  isParrainagePipeStage,
  PARRAINAGE_PIPE_BOARD_STAGES,
  PARRAINAGE_PIPE_STAGE_LABELS,
  type ParrainagePipeStage,
} from "@/lib/parrainage-pipe/parrainage-pipe-types";
import { cn } from "@/lib/utils";

const DRAG_THRESHOLD_PX = 6;

/** Libellés compacts pour tenir en 6 colonnes sans scroll horizontal. */
const PARRAINAGE_PIPE_BOARD_LABELS: Record<ParrainagePipeStage, string> = {
  A_CONTACTER: "À contact.",
  ATTENTE_REPONSE: "Attente",
  PRISE_DE_CONTACT: "Contact",
  CONFIRME: "Confirmé",
  PRESENT: "Présent",
  INSCRIT: "Inscrit",
  REFUSE: "Refusé",
};

function formatUpdatedAt(ts: number): string {
  return new Date(ts * 1000).toLocaleDateString("fr-FR", {
    day: "2-digit",
    month: "short",
  });
}

function stageFromElement(el: Element | null): ParrainagePipeStage | null {
  const column = el?.closest("[data-parrainage-stage]");
  const raw = column?.getAttribute("data-parrainage-stage");
  return raw && isParrainagePipeStage(raw) ? raw : null;
}

interface ParrainagePipeBoardProps {
  pipes: ParrainagePipeRecord[];
  selectedId: number | null;
  onSelect: (pipe: ParrainagePipeRecord) => void;
  onRequestStageChange: (pipe: ParrainagePipeRecord, stage: ParrainagePipeStage) => void;
}

export function ParrainagePipeBoard({
  pipes,
  selectedId,
  onSelect,
  onRequestStageChange,
}: ParrainagePipeBoardProps) {
  const byStage = useMemo(() => groupParrainagePipesByStage(pipes), [pipes]);
  const [dragOverStage, setDragOverStage] = useState<ParrainagePipeStage | null>(null);
  const [draggingId, setDraggingId] = useState<number | null>(null);
  const pointerDragRef = useRef<{
    pipeId: number;
    startX: number;
    startY: number;
    active: boolean;
  } | null>(null);

  const requestMoveToStage = (pipeId: number, stage: ParrainagePipeStage) => {
    const pipe = pipes.find((p) => p.id === pipeId);
    if (!pipe || pipe.stage === stage) return;
    onRequestStageChange(pipe, stage);
  };

  const handlePointerDown = (e: React.PointerEvent, pipe: ParrainagePipeRecord) => {
    if (e.button !== 0) return;
    pointerDragRef.current = {
      pipeId: pipe.id,
      startX: e.clientX,
      startY: e.clientY,
      active: false,
    };
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    const drag = pointerDragRef.current;
    if (!drag) return;
    const dx = e.clientX - drag.startX;
    const dy = e.clientY - drag.startY;
    if (!drag.active && Math.hypot(dx, dy) < DRAG_THRESHOLD_PX) return;
    if (!drag.active) {
      drag.active = true;
      setDraggingId(drag.pipeId);
    }
    const stage = stageFromElement(document.elementFromPoint(e.clientX, e.clientY));
    setDragOverStage(stage);
  };

  const finishPointerDrag = (e: React.PointerEvent) => {
    const drag = pointerDragRef.current;
    if (!drag) return;
    pointerDragRef.current = null;
    setDraggingId(null);
    setDragOverStage(null);
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
    if (!drag.active) {
      const pipe = pipes.find((p) => p.id === drag.pipeId);
      if (pipe) onSelect(pipe);
      return;
    }
    const stage = stageFromElement(document.elementFromPoint(e.clientX, e.clientY));
    if (stage) requestMoveToStage(drag.pipeId, stage);
  };

  const handlePointerCancel = (e: React.PointerEvent) => {
    pointerDragRef.current = null;
    setDraggingId(null);
    setDragOverStage(null);
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
  };

  if (pipes.length === 0) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center px-6 py-16 text-center">
        <p className="text-sm font-medium">Aucun prospect sur le pipe parrainage</p>
        <p className="text-sm text-muted-foreground mt-2 max-w-md">
          Ajoutez des contacts pour suivre vos prises de contact, confirmations JD/PO et inscriptions.
        </p>
      </div>
    );
  }

  return (
    <div className="grid h-full min-h-0 flex-1 grid-cols-2 gap-1.5 p-2 min-[900px]:grid-cols-4 sm:gap-2 sm:p-3 lg:grid-cols-7">
      {PARRAINAGE_PIPE_BOARD_STAGES.map((stage) => {
        const list = byStage[stage];
        const colors = PARRAINAGE_PIPE_STAGE_BOARD_COLORS[stage];
        const isDragOver = dragOverStage === stage;
        return (
          <section
            key={stage}
            data-parrainage-stage={stage}
            className={cn(
              "flex min-h-0 min-w-0 flex-col rounded-lg border border-t-2 transition-colors sm:rounded-xl",
              colors.column,
              colors.accent,
              isDragOver && "border-primary bg-primary/5 ring-1 ring-primary/30"
            )}
          >
            <header
              className={cn(
                "flex items-center justify-between gap-1 border-b px-1.5 py-1.5 sm:px-2 sm:py-2",
                colors.header
              )}
              title={PARRAINAGE_PIPE_STAGE_LABELS[stage]}
            >
              <h3
                className={cn(
                  "truncate text-[10px] font-medium leading-tight sm:text-xs",
                  colors.title
                )}
              >
                <span className="hidden min-[1280px]:inline">
                  {PARRAINAGE_PIPE_STAGE_LABELS[stage]}
                </span>
                <span className="min-[1280px]:hidden">{PARRAINAGE_PIPE_BOARD_LABELS[stage]}</span>
              </h3>
              <Badge
                variant="secondary"
                className={cn(
                  "h-5 min-w-5 shrink-0 justify-center px-1 font-normal tabular-nums text-[10px]",
                  colors.badge
                )}
              >
                {list.length}
              </Badge>
            </header>

            <div className="min-h-[80px] flex-1 space-y-1.5 overflow-y-auto p-1 sm:space-y-2 sm:p-1.5">
              {list.length === 0 ? (
                <p className="px-0.5 py-4 text-center text-[10px] text-muted-foreground sm:text-xs">
                  Déposer ici
                </p>
              ) : (
                list.map((pipe) => {
                  const selected = pipe.id === selectedId;
                  const dragging = pipe.id === draggingId;
                  return (
                    <article
                      key={pipe.id}
                      onPointerDown={(e) => handlePointerDown(e, pipe)}
                      onPointerMove={handlePointerMove}
                      onPointerUp={finishPointerDrag}
                      onPointerCancel={handlePointerCancel}
                      className={cn(
                        "touch-none rounded-md border bg-card p-1.5 shadow-sm transition-opacity sm:rounded-lg sm:p-2",
                        "cursor-grab active:cursor-grabbing",
                        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                        selected && "border-primary ring-1 ring-primary/40",
                        dragging && "opacity-50"
                      )}
                    >
                      <div className="flex items-start gap-1 select-none">
                        <GripVertical
                          className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground/70 sm:h-4 sm:w-4"
                          aria-hidden
                        />
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1">
                            <p className="text-[11px] font-medium leading-snug line-clamp-2 sm:text-xs">
                              {formatParrainageContactLabel(pipe)}
                            </p>
                            {pipe.invitation_type && (
                              <Badge variant="outline" className="h-4 px-1 text-[9px]">
                                {pipe.invitation_type}
                              </Badge>
                            )}
                          </div>
                          <p className="mt-0.5 text-[9px] text-muted-foreground/80 sm:text-[10px]">
                            {formatUpdatedAt(pipe.updated_at)}
                          </p>
                        </div>
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
  );
}
