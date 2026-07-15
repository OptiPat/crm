import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Briefcase, ClipboardList, LayoutGrid, List, PhoneCall, Euro } from "lucide-react";
import { Button } from "@/components/ui/button";
import { listPipes, type PipeRecord } from "@/lib/api/tauri-pipe";
import {
  dismissPlacementOperation,
  getPlacementOpenCountsByPipe,
  listPlacementOperations,
  notifyPlacementOperationsChanged,
  PLACEMENT_OPERATIONS_CHANGED_EVENT,
  type PlacementOperationWithContact,
  type PlacementPipeOpenCount,
} from "@/lib/api/tauri-box-placement";
import { subscribePipeChanged } from "@/lib/pipe/pipe-events";
import { subscribeContactsChanged } from "@/lib/contacts/contact-events";
import {
  filterAffairesForBoard,
  loadPipeBoardTab,
  loadPipeViewMode,
  savePipeBoardTab,
  savePipeViewMode,
  type PipeBoardTab,
  type PipeViewMode,
} from "@/lib/pipe/pipe-board-utils";
import { filterPlacementRowsForBoard } from "@/lib/placement/placement-operation-board";
import {
  filterPipesForList,
  loadPipeListFilters,
  savePipeListFilters,
  type PipeListFilters,
} from "@/lib/pipe/pipe-list-filters";
import { resolvePipeBoardStageDrop } from "@/lib/pipe/pipe-board-stage-actions";
import { confirmDiscardPipeFormEdits } from "@/lib/pipe/pipe-form-dirty";
import { trackVersementAffaireOnPipeCreate } from "@/lib/placement/pipe-placement-tracking";
import { type PipeStage, type PipeType } from "@/lib/pipe/pipe-types";
import { type PipeRdvStage } from "@/lib/pipe/pipe-rdv-stage";
import { PipeList } from "@/components/pipe/PipeList";
import { PipeListToolbar } from "@/components/pipe/PipeListToolbar";
import { PipeBoard } from "@/components/pipe/PipeBoard";
import { PipePlacementBoard } from "@/components/pipe/PipePlacementBoard";
import { PipeRemunerationBoard } from "@/components/pipe/PipeRemunerationBoard";
import { PipeFormPanel } from "@/components/pipe/PipeFormPanel";
import { PipeDetailPanel } from "@/components/pipe/PipeDetailPanel";
import { PipeStageAdvanceDialog } from "@/components/pipe/PipeStageAdvanceDialog";
import { RdvPlanifierDialog } from "@/components/calendar/RdvPlanifierDialog";
import { toast } from "sonner";
import { usePipeStageAdvance } from "@/hooks/usePipeStageAdvance";
import { cn } from "@/lib/utils";

type PanelMode = "empty" | "create" | "view" | "edit";

function PipeCreateButtons({ onCreate }: { onCreate: (type: PipeType) => void }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="gap-1.5"
        onClick={() => onCreate("AFFAIRE")}
      >
        <Briefcase className="h-3.5 w-3.5" />
        Affaire
      </Button>
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="gap-1.5"
        onClick={() => onCreate("ACTE_GESTION")}
      >
        <ClipboardList className="h-3.5 w-3.5" />
        Suivi
      </Button>
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="gap-1.5"
        onClick={() => onCreate("ACTION")}
      >
        <PhoneCall className="h-3.5 w-3.5" />
        Action
      </Button>
    </div>
  );
}

function PipeViewToggle({
  mode,
  onChange,
}: {
  mode: PipeViewMode;
  onChange: (mode: PipeViewMode) => void;
}) {
  return (
    <div className="inline-flex rounded-lg border p-1 bg-muted/30">
      <Button
        type="button"
        variant={mode === "board" ? "secondary" : "ghost"}
        size="sm"
        className="h-8 gap-1.5 px-3"
        onClick={() => onChange("board")}
      >
        <LayoutGrid className="h-3.5 w-3.5" />
        Tableau
      </Button>
      <Button
        type="button"
        variant={mode === "list" ? "secondary" : "ghost"}
        size="sm"
        className="h-8 gap-1.5 px-3"
        onClick={() => onChange("list")}
      >
        <List className="h-3.5 w-3.5" />
        Liste
      </Button>
    </div>
  );
}

function PipeBoardTabToggle({
  tab,
  onChange,
}: {
  tab: PipeBoardTab;
  onChange: (tab: PipeBoardTab) => void;
}) {
  return (
    <div className="inline-flex rounded-lg border p-1 bg-muted/30">
      <Button
        type="button"
        variant={tab === "affaires" ? "secondary" : "ghost"}
        size="sm"
        className="h-8 gap-1.5 px-3"
        onClick={() => onChange("affaires")}
      >
        <Briefcase className="h-3.5 w-3.5" />
        Affaires
      </Button>
      <Button
        type="button"
        variant={tab === "actes" ? "secondary" : "ghost"}
        size="sm"
        className="h-8 gap-1.5 px-3"
        onClick={() => onChange("actes")}
      >
        <ClipboardList className="h-3.5 w-3.5" />
        Suivi gestion
      </Button>
      <Button
        type="button"
        variant={tab === "remuneration" ? "secondary" : "ghost"}
        size="sm"
        className="h-8 gap-1.5 px-3"
        onClick={() => onChange("remuneration")}
      >
        <Euro className="h-3.5 w-3.5" />
        Rémunération
      </Button>
    </div>
  );
}

export function Pipe() {
  const [pipes, setPipes] = useState<PipeRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<PipeViewMode>(() => loadPipeViewMode());
  const [boardTab, setBoardTab] = useState<PipeBoardTab>(() => loadPipeBoardTab());
  const [listFilters, setListFilters] = useState<PipeListFilters>(() => loadPipeListFilters());
  const [panelMode, setPanelMode] = useState<PanelMode>("empty");
  const [selectedPipe, setSelectedPipe] = useState<PipeRecord | null>(null);
  const [createType, setCreateType] = useState<PipeType>("AFFAIRE");
  const [createPrefill, setCreatePrefill] = useState<{
    parentPipeId?: number;
    contactId?: number;
    titre?: string;
  } | null>(null);
  const [rdvPlanifierOpen, setRdvPlanifierOpen] = useState(false);
  const [rdvPlanifierPipe, setRdvPlanifierPipe] = useState<PipeRecord | null>(null);
  const [rdvPlanifierStage, setRdvPlanifierStage] = useState<PipeRdvStage | undefined>();
  const [focusHistoriqueToken, setFocusHistoriqueToken] = useState(0);
  const [placementCountsByPipe, setPlacementCountsByPipe] = useState<
    Record<number, PlacementPipeOpenCount>
  >({});
  const [placementBoardRows, setPlacementBoardRows] = useState<PlacementOperationWithContact[]>(
    []
  );
  const [placementBoardLoading, setPlacementBoardLoading] = useState(false);
  const [selectedPlacementOperationId, setSelectedPlacementOperationId] = useState<number | null>(
    null
  );
  const [dismissingPlacementId, setDismissingPlacementId] = useState<number | null>(null);
  const formIsDirtyRef = useRef(false);
  const placementBoardLoadedRef = useRef(false);

  const PIPE_RELOAD_DEBOUNCE_MS = 150;

  const handleFormDirtyChange = useCallback((isDirty: boolean) => {
    formIsDirtyRef.current = isDirty;
  }, []);

  useEffect(() => {
    if (panelMode !== "edit") {
      formIsDirtyRef.current = false;
    }
  }, [panelMode]);

  const stageAdvance = usePipeStageAdvance((pipe) => {
    setSelectedPipe(pipe);
    setPanelMode("view");
    void loadPipes();
  });

  const affaires = useMemo(() => filterAffairesForBoard(pipes), [pipes]);
  const filteredListPipes = useMemo(
    () => filterPipesForList(pipes, listFilters),
    [pipes, listFilters]
  );

  const setListFiltersPersisted = (filters: PipeListFilters) => {
    setListFilters(filters);
    savePipeListFilters(filters);
  };

  const openRdvPlanifier = useCallback(
    (
      pipe: PipeRecord,
      rdvStage?: PipeRdvStage,
      options?: { keepPanelMode?: boolean; isDirty?: boolean }
    ) => {
      if (options?.isDirty && !confirmDiscardPipeFormEdits()) return;
      setSelectedPipe(pipe);
      if (!options?.keepPanelMode) setPanelMode("view");
      setRdvPlanifierPipe(pipe);
      setRdvPlanifierStage(rdvStage);
      setRdvPlanifierOpen(true);
    },
    []
  );

  const loadPlacementCounts = useCallback(async () => {
    try {
      const rows = await getPlacementOpenCountsByPipe();
      const map: Record<number, PlacementPipeOpenCount> = {};
      for (const row of rows) {
        map[row.pipe_id] = row;
      }
      setPlacementCountsByPipe(map);
    } catch {
      setPlacementCountsByPipe({});
    }
  }, []);

  const loadPlacementBoardRows = useCallback(async (options?: { silent?: boolean }) => {
    const silent = options?.silent ?? placementBoardLoadedRef.current;
    if (!silent) setPlacementBoardLoading(true);
    try {
      const rows = await listPlacementOperations();
      setPlacementBoardRows(filterPlacementRowsForBoard(rows));
      placementBoardLoadedRef.current = true;
    } catch {
      if (!placementBoardLoadedRef.current) setPlacementBoardRows([]);
    } finally {
      if (!silent) setPlacementBoardLoading(false);
    }
  }, []);

  const loadPipes = useCallback(async () => {
    try {
      setError(null);
      const rows = await listPipes();
      setPipes(rows);
      setSelectedPipe((prev) => (prev ? rows.find((p) => p.id === prev.id) ?? null : null));
      await loadPlacementCounts();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [loadPlacementCounts]);

  useEffect(() => {
    void loadPipes();

    const debounceRef = { id: null as number | null };
    const schedule = (fn: () => void) => {
      if (debounceRef.id != null) window.clearTimeout(debounceRef.id);
      debounceRef.id = window.setTimeout(() => {
        debounceRef.id = null;
        fn();
      }, PIPE_RELOAD_DEBOUNCE_MS);
    };

    const unsubPipe = subscribePipeChanged(() => {
      schedule(() => {
        void loadPipes();
      });
    });
    const unsubContacts = subscribeContactsChanged(() => {
      schedule(() => {
        void loadPipes();
      });
    });
    const onPlacementChanged = () => {
      schedule(() => {
        void loadPlacementCounts();
        if (boardTab === "actes") {
          void loadPlacementBoardRows({ silent: true });
        }
      });
    };
    window.addEventListener(PLACEMENT_OPERATIONS_CHANGED_EVENT, onPlacementChanged);
    return () => {
      unsubPipe();
      unsubContacts();
      window.removeEventListener(PLACEMENT_OPERATIONS_CHANGED_EVENT, onPlacementChanged);
      if (debounceRef.id != null) window.clearTimeout(debounceRef.id);
    };
  }, [loadPipes, loadPlacementCounts, boardTab, loadPlacementBoardRows]);

  useEffect(() => {
    if (viewMode === "board" && boardTab === "actes") {
      void loadPlacementBoardRows({ silent: placementBoardLoadedRef.current });
    }
  }, [viewMode, boardTab, loadPlacementBoardRows]);

  const setViewModePersisted = (mode: PipeViewMode) => {
    setViewMode(mode);
    savePipeViewMode(mode);
  };

  const setBoardTabPersisted = (tab: PipeBoardTab) => {
    setBoardTab(tab);
    savePipeBoardTab(tab);
    setSelectedPlacementOperationId(null);
    setSelectedPipe(null);
    setPanelMode("empty");
  };

  const childAffaires = useMemo(() => {
    if (!selectedPipe) return [];
    return pipes.filter(
      (p) => p.parent_pipe_id === selectedPipe.id && p.pipe_type === "AFFAIRE"
    );
  }, [pipes, selectedPipe]);

  const openCreate = (type: PipeType, prefill?: typeof createPrefill) => {
    setCreateType(type);
    setCreatePrefill(prefill ?? null);
    setSelectedPipe(null);
    setPanelMode("create");
  };


  const openView = (pipe: PipeRecord) => {
    setSelectedPlacementOperationId(null);
    setSelectedPipe(pipe);
    setPanelMode("view");
  };

  const openPlacementOperation = (row: PlacementOperationWithContact) => {
    setSelectedPlacementOperationId(row.operation.id);
    const pipeId = row.operation.pipe_id;
    if (pipeId == null || pipeId <= 0) {
      toast.warning("Aucun suivi lié — déclarez l'acte sur le suivi ou retirez-le du tableau.");
      setPanelMode("empty");
      setSelectedPipe(null);
      return;
    }
    const pipe = pipes.find((p) => p.id === pipeId);
    if (!pipe) {
      toast.warning("Suivi introuvable — actualisez la page.");
      setPanelMode("empty");
      setSelectedPipe(null);
      return;
    }
    setSelectedPipe(pipe);
    setPanelMode("view");
  };

  const handleDismissPlacementOperation = async (row: PlacementOperationWithContact) => {
    setDismissingPlacementId(row.operation.id);
    try {
      await dismissPlacementOperation(row.operation.id);
      notifyPlacementOperationsChanged();
      if (selectedPlacementOperationId === row.operation.id) {
        setSelectedPlacementOperationId(null);
        setSelectedPipe(null);
        setPanelMode("empty");
      }
      await loadPlacementBoardRows({ silent: true });
      toast.success("Opération retirée du tableau");
    } catch (err) {
      toast.error(String(err));
    } finally {
      setDismissingPlacementId(null);
    }
  };

  const showAffairesBoardAside =
    boardTab === "affaires" &&
    (panelMode === "create" ||
      panelMode === "edit" ||
      (panelMode === "view" && selectedPipe != null));
  const showActesBoardAside = boardTab === "actes" && panelMode === "view" && selectedPipe != null;
  const showBoardAside = showAffairesBoardAside || showActesBoardAside;

  const openEdit = () => {
    if (selectedPipe) setPanelMode("edit");
  };

  const handleSaved = (pipe: PipeRecord) => {
    const wasCreate = panelMode === "create";
    setCreatePrefill(null);
    setSelectedPipe(pipe);
    setPanelMode("view");
    void loadPipes();
    if (wasCreate) {
      void trackVersementAffaireOnPipeCreate(pipe).catch((err) => {
        console.error(err);
        toast.warning(
          "Affaire créée, mais le suivi versement Stellium n'a pas pu être initialisé. Renseignez le montant sur l'affaire."
        );
      });
    }
  };

  const handleDeleted = () => {
    setSelectedPipe(null);
    setPanelMode("empty");
    void loadPipes();
  };

  const cancelPanel = () => {
    setCreatePrefill(null);
    if (selectedPipe) {
      setPanelMode("view");
    } else {
      setPanelMode("empty");
    }
  };

  const handleRequestStageChange = (pipe: PipeRecord, target: PipeStage) => {
    const action = resolvePipeBoardStageDrop(pipe, target);
    const isDirty = panelMode === "edit" && formIsDirtyRef.current;
    if (action.kind === "plan-rdv") {
      openRdvPlanifier(pipe, action.rdvStage, { isDirty });
      return;
    }
    if (action.kind === "manual-advance") {
      if (isDirty && !confirmDiscardPipeFormEdits()) return;
      if (panelMode === "edit") setPanelMode("view");
      stageAdvance.requestStageChange(pipe.id, action.stage, pipe.titre);
    }
  };

  const handleRequestRdvStageFromForm = (stage: PipeRdvStage, options: { isDirty: boolean }) => {
    if (!selectedPipe) return;
    openRdvPlanifier(selectedPipe, stage, {
      keepPanelMode: true,
      isDirty: options.isDirty,
    });
  };

  const handleRequestTerminalStageFromForm = (
    stage: PipeStage,
    options: { isDirty: boolean }
  ) => {
    if (!selectedPipe) return;
    if (options.isDirty && !confirmDiscardPipeFormEdits()) return;
    setPanelMode("view");
    stageAdvance.requestStageChange(selectedPipe.id, stage, selectedPipe.titre);
  };

  const detailPanel = (
    <>
      {panelMode === "empty" && viewMode === "board" && boardTab === "affaires" && (
        <div className="flex h-full flex-col items-center justify-center px-6 py-12 text-center">
          <Briefcase className="h-10 w-10 text-muted-foreground/50 mb-4" />
          <p className="text-sm font-medium">Sélectionnez une affaire dans le tableau</p>
          <p className="text-sm text-muted-foreground mt-2 max-w-sm">
            Cliquez une carte (ex. colonne Prospection). Le panneau à droite affiche
            l&apos;avancement ; en Prospection, prescripteur et source du lead.
          </p>
        </div>
      )}

      {panelMode === "empty" && viewMode === "board" && boardTab === "actes" && (
        <div className="flex h-full flex-col items-center justify-center px-6 py-12 text-center">
          <ClipboardList className="h-10 w-10 text-muted-foreground/50 mb-4" />
          <p className="text-sm font-medium">Sélectionnez un acte dans le tableau</p>
          <p className="text-sm text-muted-foreground mt-2 max-w-sm">
            Chaque carte est une opération Stellium en cours. Le panneau ouvre le suivi
            associé avec l&apos;avancement détaillé.
          </p>
        </div>
      )}

      {panelMode === "empty" && viewMode === "list" && (
        <div className="flex h-full flex-col items-center justify-center px-6 py-12 text-center">
          <Briefcase className="h-10 w-10 text-muted-foreground/50 mb-4" />
          <p className="text-sm font-medium">Sélectionnez un pipe ou créez-en un</p>
          <p className="text-sm text-muted-foreground mt-2 max-w-sm">
            Affaires, suivis et actions — tous liés à un contact.
          </p>
        </div>
      )}

      {(panelMode === "create" || panelMode === "edit") && (
        <PipeFormPanel
          key={
            panelMode === "edit"
              ? `edit-${selectedPipe?.id}`
              : `create-${createType}-${createPrefill?.parentPipeId ?? "solo"}`
          }
          pipe={panelMode === "edit" ? selectedPipe : null}
          allPipes={pipes}
          initialType={panelMode === "edit" ? undefined : createType}
          defaultContactId={createPrefill?.contactId}
          initialParentPipeId={createPrefill?.parentPipeId ?? null}
          initialTitre={createPrefill?.titre}
          onRequestRdvStage={
            panelMode === "edit" && selectedPipe ? handleRequestRdvStageFromForm : undefined
          }
          onRequestTerminalStage={
            panelMode === "edit" && selectedPipe
              ? handleRequestTerminalStageFromForm
              : undefined
          }
          onDirtyChange={panelMode === "edit" ? handleFormDirtyChange : undefined}
          onSuccess={handleSaved}
          onCancel={cancelPanel}
        />
      )}

      {panelMode === "view" && selectedPipe && (
        <PipeDetailPanel
          pipe={selectedPipe}
          childAffaires={childAffaires}
          onEdit={openEdit}
          onDeleted={handleDeleted}
          onPlanRdv={(stage) => openRdvPlanifier(selectedPipe, stage)}
          onOpenChildAffaire={openView}
          onOpenParentPipe={(parentId) => {
            const parent = pipes.find((p) => p.id === parentId);
            if (parent) openView(parent);
          }}
          focusHistoriqueToken={focusHistoriqueToken}
        />
      )}
    </>
  );

  return (
    <div className="flex flex-col gap-4 min-h-[calc(100vh-10rem)]">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <PipeViewToggle mode={viewMode} onChange={setViewModePersisted} />
          {viewMode === "board" ? (
            <PipeBoardTabToggle tab={boardTab} onChange={setBoardTabPersisted} />
          ) : null}
        </div>
        <PipeCreateButtons onCreate={openCreate} />
      </div>

      {error && <p className="text-sm text-destructive px-1">{error}</p>}

      {viewMode === "board" ? (
        <div
          className={cn(
            "flex flex-1 min-h-0 flex-col gap-0",
            showBoardAside ? "lg:flex-row" : "",
            "rounded-xl border border-border/70 bg-card shadow-sm overflow-hidden"
          )}
        >
          <div
            className={cn(
              "flex flex-1 min-h-[320px] min-w-0 flex-col",
              showBoardAside ? "lg:min-h-0" : "w-full"
            )}
          >
            {loading || (boardTab === "actes" && placementBoardLoading) ? (
              <p className="px-4 py-6 text-sm text-muted-foreground">Chargement…</p>
            ) : boardTab === "actes" ? (
              <PipePlacementBoard
                rows={placementBoardRows}
                selectedOperationId={selectedPlacementOperationId}
                onSelect={openPlacementOperation}
                onDismiss={handleDismissPlacementOperation}
                dismissingOperationId={dismissingPlacementId}
              />
            ) : boardTab === "remuneration" ? (
              <div className="p-4 overflow-auto">
                <PipeRemunerationBoard />
              </div>
            ) : (
              <PipeBoard
                affaires={affaires}
                selectedId={selectedPipe?.id ?? null}
                onSelect={openView}
                onRequestStageChange={(pipe, stage) =>
                  void handleRequestStageChange(pipe, stage)
                }
              />
            )}
          </div>

          {showBoardAside ? (
            <aside
              className={cn(
                "min-h-[280px] lg:min-h-0 lg:w-[min(100%,400px)] lg:shrink-0",
                "border-t lg:border-t-0 lg:border-l border-border/70 bg-background/50"
              )}
            >
              {detailPanel}
            </aside>
          ) : null}
        </div>
      ) : (
        <div
          className={cn(
            "flex flex-1 min-h-0 flex-col lg:flex-row gap-4",
            "rounded-xl border border-border/70 bg-card shadow-sm overflow-hidden"
          )}
        >
          <aside className="flex flex-col lg:w-[min(100%,380px)] lg:shrink-0 lg:border-r border-border/70 min-h-[320px] lg:min-h-0">
            <PipeListToolbar
              filters={listFilters}
              resultCount={filteredListPipes.length}
              totalCount={pipes.length}
              onChange={setListFiltersPersisted}
            />

            <div className="flex-1 overflow-y-auto min-h-0">
              {loading ? (
                <p className="px-4 py-6 text-sm text-muted-foreground">Chargement…</p>
              ) : (
                <PipeList
                  pipes={filteredListPipes}
                  selectedId={selectedPipe?.id ?? null}
                  onSelect={openView}
                  placementCountsByPipe={placementCountsByPipe}
                />
              )}
            </div>
          </aside>

          <main className="flex-1 min-w-0 min-h-[360px] lg:min-h-0 bg-background/50">
            {detailPanel}
          </main>
        </div>
      )}
      <PipeStageAdvanceDialog
        pending={stageAdvance.pending}
        saving={stageAdvance.saving}
        onCancel={stageAdvance.cancelStageChange}
        onConfirm={stageAdvance.confirmStageChange}
      />
      {rdvPlanifierPipe && (
        <RdvPlanifierDialog
          open={rdvPlanifierOpen}
          onOpenChange={(open) => {
            setRdvPlanifierOpen(open);
            if (!open) {
              setRdvPlanifierPipe(null);
              setRdvPlanifierStage(undefined);
            }
          }}
          context={{
            kind: "pipe",
            pipe: rdvPlanifierPipe,
            rdvStage: rdvPlanifierStage,
          }}
          onCreated={() => {
            void loadPipes();
            if (rdvPlanifierPipe?.pipe_type === "ACTE_GESTION") {
              setFocusHistoriqueToken((t) => t + 1);
            }
          }}
        />
      )}
    </div>
  );
}
