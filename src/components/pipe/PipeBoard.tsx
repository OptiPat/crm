import { useEffect, useMemo, useRef, useState } from "react";
import { GripVertical } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import type { PipeRecord } from "@/lib/api/tauri-pipe";
import type { PipeTimelineEntryRecord } from "@/lib/api/tauri-pipe-timeline";
import {
  groupAffairesByBoardColumn,
  isPipeBoardColumn,
  isPipeBoardDropTargetColumn,
  isPipeBoardRdvDropTargetColumn,
  PIPE_BOARD_COLUMN_LABELS,
  PIPE_BOARD_FUNNEL_COLUMNS,
  PIPE_BOARD_OUTCOME_COLUMNS,
  resolveAffaireBoardColumn,
  type PipeBoardColumn,
} from "@/lib/pipe/pipe-board-columns";
import { PIPE_BOARD_COLUMN_COLORS } from "@/lib/pipe/pipe-stage-colors";
import { formatPipeParticipantsLabel } from "@/lib/pipe/pipe-types";
import { cn } from "@/lib/utils";

const DRAG_THRESHOLD_PX = 6;
const BOARD_TICK_MS = 30_000;
const ETUDE_REALISEE_LABEL = "\u00C9tude r\u00E9alis\u00E9e";

function formatUpdatedAt(ts: number): string {
  return new Date(ts * 1000).toLocaleDateString("fr-FR", {
    day: "2-digit",
    month: "short",
  });
}

function columnFromElement(el: Element | null): PipeBoardColumn | null {
  const column = el?.closest("[data-pipe-stage]");
  const raw = column?.getAttribute("data-pipe-stage");
  return raw && isPipeBoardColumn(raw) ? raw : null;
}

interface PipeBoardProps {
  affaires: PipeRecord[];
  selectedId: number | null;
  rdvEntriesByPipeId: Record<number, PipeTimelineEntryRecord[]>;
  onSelect: (pipe: PipeRecord) => void;
  onRequestStageChange: (pipe: PipeRecord, column: PipeBoardColumn) => void;
  onToggleEtudeRealisee: (pipe: PipeRecord, checked: boolean) => void;
}

export function PipeBoard({
  affaires,
  selectedId,
  rdvEntriesByPipeId,
  onSelect,
  onRequestStageChange,
  onToggleEtudeRealisee,
}: PipeBoardProps) {
  const nowMsRef = useRef(Date.now());
  const [nowMs, setNowMs] = useState(() => nowMsRef.current);
  const draggingIdRef = useRef<number | null>(null);
  useEffect(() => {
    const id = window.setInterval(() => {
      if (draggingIdRef.current != null) return;
      const next = Date.now();
      nowMsRef.current = next;
      setNowMs(next);
    }, BOARD_TICK_MS);
    return () => window.clearInterval(id);
  }, []);

  const now = useMemo(() => new Date(nowMs), [nowMs]);
  const byColumn = useMemo(
    () => groupAffairesByBoardColumn(affaires, rdvEntriesByPipeId, now),
    [affaires, rdvEntriesByPipeId, now]
  );
  const [dragOverColumn, setDragOverColumn] = useState<PipeBoardColumn | null>(null);
  const [draggingId, setDraggingId] = useState<number | null>(null);
  const pointerDragRef = useRef<{
    pipeId: number;
    startX: number;
    startY: number;
    active: boolean;
  } | null>(null);

  const requestMoveToColumn = (pipeId: number, column: PipeBoardColumn) => {
    if (!isPipeBoardDropTargetColumn(column)) return;
    const pipe = affaires.find((p) => p.id === pipeId);
    if (!pipe) return;
    const current = resolveAffaireBoardColumn(pipe, rdvEntriesByPipeId[pipe.id] ?? [], now);
    if (current === column) return;
    onRequestStageChange(pipe, column);
  };

  const handlePointerDown = (e: React.PointerEvent, pipe: PipeRecord) => {
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
      draggingIdRef.current = drag.pipeId;
      setDraggingId(drag.pipeId);
    }

    const column = columnFromElement(document.elementFromPoint(e.clientX, e.clientY));
    setDragOverColumn(column && isPipeBoardDropTargetColumn(column) ? column : null);
  };

  const finishPointerDrag = async (e: React.PointerEvent) => {
    const drag = pointerDragRef.current;
    if (!drag) return;

    pointerDragRef.current = null;
    draggingIdRef.current = null;
    setDraggingId(null);
    setDragOverColumn(null);

    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }

    if (!drag.active) {
      const pipe = affaires.find((p) => p.id === drag.pipeId);
      if (pipe) onSelect(pipe);
      return;
    }

    const column = columnFromElement(document.elementFromPoint(e.clientX, e.clientY));
    if (column && isPipeBoardDropTargetColumn(column)) {
      requestMoveToColumn(drag.pipeId, column);
    }
  };

  const handlePointerCancel = (e: React.PointerEvent) => {
    pointerDragRef.current = null;
    draggingIdRef.current = null;
    setDraggingId(null);
    setDragOverColumn(null);
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
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

  const renderColumn = (column: PipeBoardColumn) => {
    const list = byColumn[column];
    const colors = PIPE_BOARD_COLUMN_COLORS[column];
    const isDragOver = dragOverColumn === column;
    const dropAllowed = isPipeBoardDropTargetColumn(column);

    return (
      <section
        key={column}
        data-pipe-stage={column}
        className={cn(
          "flex min-h-0 min-w-0 flex-col rounded-lg border border-t-2 transition-colors sm:rounded-xl",
          colors.column,
          colors.accent,
          isDragOver && dropAllowed && "border-primary bg-primary/5 ring-1 ring-primary/30"
        )}
      >
        <header
          className={cn(
            "flex items-start justify-between gap-0.5 border-b px-1.5 py-1.5 sm:px-2 sm:py-2",
            colors.header
          )}
          title={PIPE_BOARD_COLUMN_LABELS[column]}
        >
          <h3
            className={cn(
              "min-w-0 text-[11px] font-medium leading-tight sm:text-xs",
              colors.title
            )}
          >
            {PIPE_BOARD_COLUMN_LABELS[column]}
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

        <div className="min-h-[72px] flex-1 space-y-1.5 overflow-y-auto p-1 sm:space-y-2 sm:p-1.5">
          {list.length === 0 ? (
            <p className="px-0.5 py-4 text-center text-[10px] text-muted-foreground sm:text-xs">
              {dropAllowed
                ? isPipeBoardRdvDropTargetColumn(column)
                  ? "RDV ici"
                  : "Déposer ici"
                : column.endsWith("_REALISE")
                  ? "Relancer"
                  : "—"}
            </p>
          ) : (
            list.map((pipe) => {
              const selected = pipe.id === selectedId;
              const dragging = pipe.id === draggingId;
              const showEtude = column === "R2_POSITIONNE";
              return (
                <article
                  key={pipe.id}
                  onPointerDown={(e) => handlePointerDown(e, pipe)}
                  onPointerMove={handlePointerMove}
                  onPointerUp={(e) => void finishPointerDrag(e)}
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
                      <p className="text-[11px] font-medium leading-snug line-clamp-2 sm:text-xs">
                        {pipe.titre}
                      </p>
                      <p className="mt-0.5 truncate text-[10px] text-muted-foreground sm:text-[11px]">
                        {formatPipeParticipantsLabel(pipe)}
                      </p>
                      <p className="mt-0.5 text-[9px] text-muted-foreground/80 sm:text-[10px]">
                        {formatUpdatedAt(pipe.updated_at)}
                      </p>
                      {showEtude ? (
                        <div
                          className="mt-1.5 flex items-center gap-1.5 overflow-visible text-[10px] leading-normal text-muted-foreground"
                          onPointerDown={(event) => event.stopPropagation()}
                          onClick={(event) => event.stopPropagation()}
                        >
                          <Checkbox
                            checked={Boolean(pipe.etude_realisee)}
                            onCheckedChange={(value) =>
                              onToggleEtudeRealisee(pipe, value === true)
                            }
                            className="h-3.5 w-3.5"
                            aria-label={ETUDE_REALISEE_LABEL}
                          />
                          <span className="pt-px" title={ETUDE_REALISEE_LABEL}>
                            {ETUDE_REALISEE_LABEL}
                          </span>
                        </div>
                      ) : null}
                    </div>
                  </div>
                </article>
              );
            })
          )}
        </div>
      </section>
    );
  };

  return (
    <div className="flex h-full min-h-0 flex-1 flex-col gap-1.5 overflow-hidden p-2 sm:gap-2 sm:p-3">
      <div className="grid min-h-0 flex-1 grid-cols-7 gap-1.5">
        {PIPE_BOARD_FUNNEL_COLUMNS.map(renderColumn)}
      </div>
      <div className="grid h-[28%] min-h-[8.5rem] shrink-0 grid-cols-2 gap-1.5">
        {PIPE_BOARD_OUTCOME_COLUMNS.map(renderColumn)}
      </div>
    </div>
  );
}
