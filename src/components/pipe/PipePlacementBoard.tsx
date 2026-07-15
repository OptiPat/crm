import { useMemo, useState } from "react";
import { X } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { PlacementOperationWithContact } from "@/lib/api/tauri-box-placement";
import {
  formatPlacementBoardActeLabel,
  formatPlacementBoardCardDate,
  formatPlacementBoardCardSubtitle,
  formatPlacementBoardContactLabel,
  groupPlacementOperationsByBoardColumn,
  placementBoardRowBadge,
  PLACEMENT_BOARD_BADGE_LABELS,
  placementBoardRowShowsNonConformeAlert,
  PLACEMENT_BOARD_COLUMN_COLORS,
  PLACEMENT_BOARD_COLUMN_LABELS,
  PLACEMENT_BOARD_COLUMN_LABELS_SHORT,
  PLACEMENT_BOARD_COLUMNS,
} from "@/lib/placement/placement-operation-board";
import { cn } from "@/lib/utils";

interface PipePlacementBoardProps {
  rows: PlacementOperationWithContact[];
  selectedOperationId: number | null;
  onSelect: (row: PlacementOperationWithContact) => void;
  onDismiss: (row: PlacementOperationWithContact) => Promise<void>;
  dismissingOperationId?: number | null;
}

export function PipePlacementBoard({
  rows,
  selectedOperationId,
  onSelect,
  onDismiss,
  dismissingOperationId = null,
}: PipePlacementBoardProps) {
  const byColumn = useMemo(() => groupPlacementOperationsByBoardColumn(rows), [rows]);
  const [dismissTarget, setDismissTarget] = useState<PlacementOperationWithContact | null>(null);

  const confirmDismiss = async () => {
    if (!dismissTarget) return;
    await onDismiss(dismissTarget);
    setDismissTarget(null);
  };

  if (rows.length === 0) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center px-6 py-16 text-center">
        <p className="text-sm font-medium">Aucun acte partenaire en cours</p>
        <p className="text-sm text-muted-foreground mt-2 max-w-md">
          Les opérations Stellium déclarées sur un suivi apparaissent ici jusqu&apos;à un retrait
          manuel (y compris après le mail client).
        </p>
      </div>
    );
  }

  return (
    <>
      <div className="grid h-full min-h-[min(70vh,calc(100vh-12rem))] min-h-0 flex-1 grid-cols-6 gap-1.5 p-2 sm:gap-2 sm:p-3">
        {PLACEMENT_BOARD_COLUMNS.map((column) => {
          const list = byColumn[column];
          const colors = PLACEMENT_BOARD_COLUMN_COLORS[column];
          const fullLabel = PLACEMENT_BOARD_COLUMN_LABELS[column];
          const shortLabel = PLACEMENT_BOARD_COLUMN_LABELS_SHORT[column];

          return (
            <section
              key={column}
              className={cn(
                "flex min-h-0 min-w-0 flex-col rounded-lg border border-t-2 sm:rounded-xl",
                colors.column,
                colors.accent
              )}
            >
              <header
                className={cn(
                  "flex items-center justify-between gap-1 border-b px-1.5 py-1.5 sm:px-2 sm:py-2",
                  colors.header
                )}
                title={fullLabel}
              >
                <h3
                  className={cn(
                    "truncate text-[10px] font-medium leading-tight sm:text-xs",
                    colors.title
                  )}
                >
                  <span className="hidden min-[1280px]:inline">{fullLabel}</span>
                  <span className="min-[1280px]:hidden">{shortLabel}</span>
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
                  <p className="px-1 py-6 text-center text-xs text-muted-foreground">—</p>
                ) : (
                  list.map((row) => {
                    const { operation } = row;
                    const selected = operation.id === selectedOperationId;
                    const nonConforme = placementBoardRowShowsNonConformeAlert(operation);
                    const rowBadge = placementBoardRowBadge(operation);
                    const cardDate = formatPlacementBoardCardDate(operation, column);
                    const dismissing = dismissingOperationId === operation.id;
                    return (
                      <article
                        key={operation.id}
                        role="button"
                        tabIndex={0}
                        onClick={() => onSelect(row)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            onSelect(row);
                          }
                        }}
                        className={cn(
                          "group relative rounded-md border bg-card p-1.5 shadow-sm transition-colors sm:rounded-lg sm:p-2",
                          "cursor-pointer hover:border-primary/40 hover:bg-muted/30",
                          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                          selected && "border-primary ring-1 ring-primary/40",
                          nonConforme &&
                            "border-red-500 bg-red-50/60 ring-2 ring-red-400/50 animate-pulse dark:bg-red-950/30 dark:border-red-600"
                        )}
                      >
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="absolute right-1 top-1 h-6 w-6 opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100"
                          disabled={dismissing}
                          aria-label="Retirer du tableau"
                          onClick={(e) => {
                            e.stopPropagation();
                            setDismissTarget(row);
                          }}
                          hidden={operation.status === "NON_CONFORME"}
                        >
                          <X className="h-3.5 w-3.5" />
                        </Button>

                        <div className="flex flex-wrap items-center gap-0.5 pr-7 min-w-0">
                          {nonConforme ? (
                            <Badge className="h-4 max-w-full shrink truncate px-1 text-[9px] font-medium leading-none bg-red-600 text-white hover:bg-red-600">
                              NC
                            </Badge>
                          ) : null}
                          {rowBadge ? (
                            <Badge
                              variant="outline"
                              title={PLACEMENT_BOARD_BADGE_LABELS[rowBadge]}
                              className="h-4 max-w-full shrink truncate px-1 text-[9px] font-normal leading-none border-slate-300 text-slate-700 dark:border-slate-600 dark:text-slate-300"
                            >
                              {PLACEMENT_BOARD_BADGE_LABELS[rowBadge]}
                            </Badge>
                          ) : null}
                        </div>

                        <p className="mt-1 text-[11px] font-medium leading-snug line-clamp-2 sm:text-xs">
                          {formatPlacementBoardActeLabel(operation)}
                        </p>
                        <p className="mt-0.5 truncate text-[11px] text-muted-foreground sm:text-xs">
                          {formatPlacementBoardCardSubtitle(row)}
                        </p>
                        {cardDate ? (
                          <p className="mt-1 text-[10px] text-muted-foreground/80 leading-snug">
                            {cardDate.prefix} {cardDate.formatted}
                          </p>
                        ) : null}
                      </article>
                    );
                  })
                )}
              </div>
            </section>
          );
        })}
      </div>

      <AlertDialog
        open={dismissTarget != null}
        onOpenChange={(open) => {
          if (!open && !dismissingOperationId) setDismissTarget(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Retirer du tableau ?</AlertDialogTitle>
            <AlertDialogDescription>
              {dismissTarget ? (
                <>
                  <span className="font-medium text-foreground">
                    {formatPlacementBoardActeLabel(dismissTarget.operation)}
                  </span>
                  {" — "}
                  {formatPlacementBoardContactLabel(dismissTarget)}
                  <br />
                  L&apos;opération disparaît du tableau et du suivi actif. Aucun mail client
                  n&apos;est envoyé.
                </>
              ) : null}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={!!dismissingOperationId}>Annuler</AlertDialogCancel>
            <AlertDialogAction
              disabled={!!dismissingOperationId}
              onClick={(e) => {
                e.preventDefault();
                void confirmDismiss();
              }}
            >
              {dismissingOperationId ? "Retrait…" : "Retirer"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
