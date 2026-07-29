import { useMemo, useRef, useState } from "react";
import { GripVertical } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import type { ParrainagePipeRecord } from "@/lib/api/tauri-parrainage-pipe";
import { groupParrainagePipesByStage } from "@/lib/parrainage-pipe/parrainage-pipe-board-utils";
import {
  formatParrainageContactLabel,
  isParrainagePipeStage,
  PARRAINAGE_PIPE_BOARD_STAGES,
  PARRAINAGE_PIPE_STAGE_LABELS,
  type ParrainagePipeStage,
} from "@/lib/parrainage-pipe/parrainage-pipe-types";
import { cn } from "@/lib/utils";

const DRAG_THRESHOLD_PX = 6;

const STAGE_COLORS: Record<ParrainagePipeStage, { header: string; card: string }> = {
  A_CONTACTER: {
    header: "bg-slate-500/15 text-slate-700 dark:text-slate-300",
    card: "border-slate-300/60",
  },
  PRISE_DE_CONTACT: {
    header: "bg-blue-500/15 text-blue-700 dark:text-blue-300",
    card: "border-blue-300/50",
  },
  CONFIRME: {
    header: "bg-violet-500/15 text-violet-700 dark:text-violet-300",
    card: "border-violet-300/50",
  },
  PRESENT: {
    header: "bg-amber-500/15 text-amber-800 dark:text-amber-300",
    card: "border-amber-300/50",
  },
  INSCRIT: {
    header: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
    card: "border-emerald-300/50",
  },
  REFUSE: {
    header: "bg-rose-500/15 text-rose-700 dark:text-rose-300",
    card: "border-rose-300/50",
  },
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
    <div className="grid h-full min-h-0 flex-1 grid-cols-3 gap-1.5 p-2 sm:grid-cols-6 sm:gap-2 sm:p-3">
      {PARRAINAGE_PIPE_BOARD_STAGES.map((stage) => {
        const list = byStage[stage];
        const colors = STAGE_COLORS[stage];
        const isDropTarget = dragOverStage === stage;
        return (
          <div
            key={stage}
            data-parrainage-stage={stage}
            className={cn(
              "flex min-h-0 min-w-0 flex-col rounded-lg border border-border/50 bg-muted/20",
              isDropTarget && "ring-2 ring-primary/50"
            )}
          >
            <div
              className={cn(
                "flex items-center justify-between gap-1 border-b border-border/40 px-2 py-1.5 text-[11px] font-medium sm:text-xs",
                colors.header
              )}
            >
              <span className="truncate">{PARRAINAGE_PIPE_STAGE_LABELS[stage]}</span>
              <span className="tabular-nums opacity-70">{list.length}</span>
            </div>
            <div className="flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto p-1.5">
              {list.map((pipe) => {
                const selected = pipe.id === selectedId;
                const dragging = pipe.id === draggingId;
                return (
                  <button
                    key={pipe.id}
                    type="button"
                    onPointerDown={(e) => handlePointerDown(e, pipe)}
                    onPointerMove={handlePointerMove}
                    onPointerUp={finishPointerDrag}
                    onPointerCancel={handlePointerCancel}
                    className={cn(
                      "group w-full rounded-md border bg-card p-2 text-left shadow-sm transition",
                      colors.card,
                      selected && "ring-2 ring-primary",
                      dragging && "opacity-50"
                    )}
                  >
                    <div className="flex items-start gap-1">
                      <GripVertical className="mt-0.5 size-3.5 shrink-0 text-muted-foreground/60" />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1">
                          <p className="truncate text-xs font-medium sm:text-sm">
                            {formatParrainageContactLabel(pipe)}
                          </p>
                          {pipe.invitation_type && (
                            <Badge variant="outline" className="h-4 px-1 text-[9px]">
                              {pipe.invitation_type}
                            </Badge>
                          )}
                        </div>
                        <p className="text-[10px] text-muted-foreground mt-0.5">
                          {formatUpdatedAt(pipe.updated_at)}
                        </p>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}
