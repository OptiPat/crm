import { useMemo, useState } from "react";
import { Archive, ArchiveRestore } from "lucide-react";
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
  groupPlacementOperationsByBoardColumn,
  placementBoardRowBadge,
  PLACEMENT_BOARD_BADGE_LABELS,
  placementBoardRowShowsNonConformeAlert,
  PLACEMENT_BOARD_COLUMN_COLORS,
  PLACEMENT_BOARD_COLUMN_LABELS,
  PLACEMENT_BOARD_COLUMN_LABELS_SHORT,
  PLACEMENT_BOARD_COLUMNS,
  type PlacementBoardColumn,
} from "@/lib/placement/placement-operation-board";
import { placementOperationIsArchivable } from "@/lib/placement/placement-operation-tracking";
import { cn } from "@/lib/utils";

/** Colonne où s'affichent les suivis archivés (à la demande). */
const ARCHIVE_COLUMN = "client_mail" as const;

export type PlacementBoardActionOptions = {
  /** Archivage groupé : pas de toast ni de rechargement par carte. */
  silent?: boolean;
};

interface PipePlacementBoardProps {
  rows: PlacementOperationWithContact[];
  /** Suivis archivés (affichés grisés dans « Mail client » via « Voir les archivés »). */
  archivedRows?: PlacementOperationWithContact[];
  selectedOperationId: number | null;
  onSelect: (row: PlacementOperationWithContact) => void;
  /** Archivage d'un suivi terminé (mail client envoyé) — l'opération reste comptée. */
  onArchive: (
    row: PlacementOperationWithContact,
    options?: PlacementBoardActionOptions
  ) => Promise<boolean>;
  onUnarchive: (row: PlacementOperationWithContact) => Promise<boolean>;
  /** Désélection (ex. carte archivée sélectionnée quand on masque les archivés). */
  onClearSelection?: () => void;
  /** Fin d'un archivage groupé : un seul récapitulatif, puis rechargement. */
  onArchiveManyDone?: (result: { archived: number; failed: number }) => void;
  busyOperationId?: number | null;
}

export function PipePlacementBoard({
  rows,
  archivedRows = [],
  selectedOperationId,
  onSelect,
  onArchive,
  onUnarchive,
  onClearSelection,
  onArchiveManyDone,
  busyOperationId = null,
}: PipePlacementBoardProps) {
  const byColumn = useMemo(() => groupPlacementOperationsByBoardColumn(rows), [rows]);
  const [showArchivedOps, setShowArchivedOps] = useState(false);
  const [archiveAllTargets, setArchiveAllTargets] = useState<PlacementOperationWithContact[] | null>(
    null
  );
  const [archivingAll, setArchivingAll] = useState(false);
  const busy = archivingAll || busyOperationId != null;
  const archivedVisible = showArchivedOps && archivedRows.length > 0;

  const confirmArchiveAll = async () => {
    if (!archiveAllTargets) return;
    setArchivingAll(true);
    let archived = 0;
    let failed = 0;
    try {
      for (const row of archiveAllTargets) {
        if (await onArchive(row, { silent: true })) archived += 1;
        else failed += 1;
      }
    } finally {
      setArchivingAll(false);
      setArchiveAllTargets(null);
      onArchiveManyDone?.({ archived, failed });
    }
  };

  const selectRow = (row: PlacementOperationWithContact) => {
    if (archivingAll) return;
    onSelect(row);
  };

  const archivedToggle =
    archivedRows.length > 0 || showArchivedOps ? (
      <div className="flex shrink-0 items-center justify-end gap-2 border-b border-border/60 px-3 py-1.5">
        <Button
          type="button"
          variant={showArchivedOps ? "secondary" : "ghost"}
          size="sm"
          className="h-7 gap-1.5 text-xs"
          aria-pressed={showArchivedOps}
          disabled={archivingAll}
          onClick={() => {
            const next = !showArchivedOps;
            setShowArchivedOps(next);
            // Masquer les archivés : ne pas laisser le panneau ouvert sur une carte invisible.
            if (
              !next &&
              selectedOperationId != null &&
              archivedRows.some((row) => row.operation.id === selectedOperationId)
            ) {
              onClearSelection?.();
            }
          }}
        >
          <Archive className="h-3.5 w-3.5" aria-hidden />
          {showArchivedOps ? "Masquer les archivés" : "Voir les archivés"} ({archivedRows.length})
        </Button>
      </div>
    ) : null;

  if (rows.length === 0 && !archivedVisible) {
    return (
      <>
        {archivedToggle}
        <div className="flex flex-1 flex-col items-center justify-center px-6 py-16 text-center">
          <p className="text-sm font-medium">Aucun acte partenaire en cours</p>
          <p className="text-sm text-muted-foreground mt-2 max-w-md">
            Les opérations Stellium déclarées sur un suivi apparaissent ici jusqu&apos;à leur
            archivage, une fois le mail client envoyé.
          </p>
        </div>
      </>
    );
  }

  const renderCard = (
    row: PlacementOperationWithContact,
    column: PlacementBoardColumn,
    archivedCard: boolean
  ) => {
    const { operation } = row;
    const selected = operation.id === selectedOperationId;
    const nonConforme = !archivedCard && placementBoardRowShowsNonConformeAlert(operation);
    const rowBadge = archivedCard ? null : placementBoardRowBadge(operation);
    const cardDate = formatPlacementBoardCardDate(operation, column);
    const rowBusy = busyOperationId === operation.id;
    const archivable = !archivedCard && placementOperationIsArchivable(operation);
    return (
      <article
        key={operation.id}
        role="button"
        tabIndex={0}
        aria-disabled={archivingAll || undefined}
        onClick={() => selectRow(row)}
        onKeyDown={(e) => {
          // Entrée / Espace sur un bouton de la carte : ne pas ouvrir la carte.
          if (e.target !== e.currentTarget) return;
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            selectRow(row);
          }
        }}
        className={cn(
          "group relative rounded-md border bg-card p-1.5 shadow-sm transition-colors sm:rounded-lg sm:p-2",
          "cursor-pointer hover:border-primary/40 hover:bg-muted/30",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
          selected && "border-primary ring-1 ring-primary/40",
          archivedCard && "border-dashed opacity-60 hover:opacity-90",
          archivingAll && "cursor-default",
          nonConforme &&
            "border-red-500 bg-red-50/60 ring-2 ring-red-400/50 animate-pulse dark:bg-red-950/30 dark:border-red-600"
        )}
      >
        {archivable ? (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="absolute right-1 top-1 h-6 w-6 text-muted-foreground hover:text-foreground"
            disabled={busy}
            aria-label="Archiver"
            title="Archiver"
            onClick={(e) => {
              e.stopPropagation();
              void onArchive(row);
            }}
          >
            <Archive className="h-3.5 w-3.5" />
          </Button>
        ) : null}

        <div className="flex flex-wrap items-center gap-0.5 pr-7 min-w-0">
          {archivedCard ? (
            <Badge
              variant="outline"
              className="h-4 max-w-full shrink truncate px-1 text-[9px] font-normal leading-none"
            >
              Archivé
            </Badge>
          ) : null}
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
        {archivedCard ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="mt-1.5 h-7 w-full gap-1 text-[11px]"
            disabled={busy}
            onClick={(e) => {
              e.stopPropagation();
              void onUnarchive(row);
            }}
          >
            <ArchiveRestore className="h-3.5 w-3.5" aria-hidden />
            {rowBusy ? "Désarchivage…" : "Désarchiver"}
          </Button>
        ) : null}
      </article>
    );
  };

  return (
    <>
      {archivedToggle}
      <div className="grid h-full min-h-[min(70vh,calc(100vh-12rem))] min-h-0 flex-1 grid-cols-6 gap-1.5 p-2 sm:gap-2 sm:p-3">
        {PLACEMENT_BOARD_COLUMNS.map((column) => {
          const list = byColumn[column];
          const archivedList = column === ARCHIVE_COLUMN && archivedVisible ? archivedRows : [];
          const archivableList =
            column === ARCHIVE_COLUMN
              ? list.filter((row) => placementOperationIsArchivable(row.operation))
              : [];
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
                <div className="flex shrink-0 items-center gap-1">
                  {archivableList.length > 1 ? (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-6 px-1.5 text-[11px]"
                      disabled={busy}
                      title={`Archiver les ${archivableList.length} suivis dont le mail client a été envoyé`}
                      onClick={() => setArchiveAllTargets(archivableList)}
                    >
                      Tout archiver
                    </Button>
                  ) : null}
                  <Badge
                    variant="secondary"
                    className={cn(
                      "h-5 min-w-5 shrink-0 justify-center px-1 font-normal tabular-nums text-[10px]",
                      colors.badge
                    )}
                  >
                    {list.length}
                  </Badge>
                </div>
              </header>

              <div className="min-h-[80px] flex-1 space-y-1.5 overflow-y-auto p-1 sm:space-y-2 sm:p-1.5">
                {list.length === 0 && archivedList.length === 0 ? (
                  <p className="px-1 py-6 text-center text-xs text-muted-foreground">—</p>
                ) : (
                  <>
                    {list.map((row) => renderCard(row, column, false))}
                    {archivedList.map((row) => renderCard(row, column, true))}
                  </>
                )}
              </div>
            </section>
          );
        })}
      </div>

      <AlertDialog
        open={archiveAllTargets != null}
        onOpenChange={(open) => {
          if (!open && !archivingAll) setArchiveAllTargets(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Archiver les {archiveAllTargets?.length ?? 0} suivis terminés ?
            </AlertDialogTitle>
            <AlertDialogDescription>
              Seuls les suivis dont le mail client a été envoyé sont archivés : leurs cartes
              quittent le tableau. Ils restent comptés (rémunération, historique) et se retrouvent
              via « Voir les archivés ».
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={archivingAll}>Annuler</AlertDialogCancel>
            <AlertDialogAction
              disabled={archivingAll}
              onClick={(e) => {
                e.preventDefault();
                void confirmArchiveAll();
              }}
            >
              {archivingAll ? "Archivage…" : "Tout archiver"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
