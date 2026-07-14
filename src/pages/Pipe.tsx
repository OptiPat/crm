import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Briefcase, ClipboardList, LayoutGrid, List, PhoneCall } from "lucide-react";
import { Button } from "@/components/ui/button";
import { listPipes, type PipeRecord } from "@/lib/api/tauri-pipe";
import {
  getPlacementOpenCountsByPipe,
  PLACEMENT_OPERATIONS_CHANGED_EVENT,
  type PlacementPipeOpenCount,
} from "@/lib/api/tauri-box-placement";
import { subscribePipeChanged } from "@/lib/pipe/pipe-events";
import { subscribeContactsChanged } from "@/lib/contacts/contact-events";
import {
  filterAffairesForBoard,
  loadPipeViewMode,
  savePipeViewMode,
  type PipeViewMode,
} from "@/lib/pipe/pipe-board-utils";
import {
  filterPipesForList,
  loadPipeListFilters,
  savePipeListFilters,
  type PipeListFilters,
} from "@/lib/pipe/pipe-list-filters";
import { resolvePipeBoardStageDrop } from "@/lib/pipe/pipe-board-stage-actions";
import { confirmDiscardPipeFormEdits } from "@/lib/pipe/pipe-form-dirty";
import { buildVersementAffaireTitre } from "@/lib/pipe/pipe-suivi";
import { type PipeStage, type PipeType } from "@/lib/pipe/pipe-types";
import { type PipeRdvStage } from "@/lib/pipe/pipe-rdv-stage";
import { PipeList } from "@/components/pipe/PipeList";
import { PipeListToolbar } from "@/components/pipe/PipeListToolbar";
import { PipeBoard } from "@/components/pipe/PipeBoard";
import { PipeFormPanel } from "@/components/pipe/PipeFormPanel";
import { PipeDetailPanel } from "@/components/pipe/PipeDetailPanel";
import { PipeStageAdvanceDialog } from "@/components/pipe/PipeStageAdvanceDialog";
import { RdvPlanifierDialog } from "@/components/calendar/RdvPlanifierDialog";
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

export function Pipe() {
  const [pipes, setPipes] = useState<PipeRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<PipeViewMode>(() => loadPipeViewMode());
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
  const formIsDirtyRef = useRef(false);

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
    const unsubPipe = subscribePipeChanged(() => {
      void loadPipes();
    });
    const unsubContacts = subscribeContactsChanged(() => {
      void loadPipes();
    });
    const onPlacementChanged = () => {
      void loadPlacementCounts();
    };
    window.addEventListener(PLACEMENT_OPERATIONS_CHANGED_EVENT, onPlacementChanged);
    return () => {
      unsubPipe();
      unsubContacts();
      window.removeEventListener(PLACEMENT_OPERATIONS_CHANGED_EVENT, onPlacementChanged);
    };
  }, [loadPipes, loadPlacementCounts]);

  const setViewModePersisted = (mode: PipeViewMode) => {
    setViewMode(mode);
    savePipeViewMode(mode);
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

  const openCreateVersementAffaire = (suivi: PipeRecord) => {
    openCreate("AFFAIRE", {
      parentPipeId: suivi.id,
      contactId: suivi.contact_id,
      titre: buildVersementAffaireTitre(suivi),
    });
  };

  const openView = (pipe: PipeRecord) => {
    setSelectedPipe(pipe);
    setPanelMode("view");
  };

  const openEdit = () => {
    if (selectedPipe) setPanelMode("edit");
  };

  const handleSaved = (pipe: PipeRecord) => {
    setCreatePrefill(null);
    setSelectedPipe(pipe);
    setPanelMode("view");
    void loadPipes();
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
      {panelMode === "empty" && viewMode === "board" && (
        <div className="flex h-full flex-col items-center justify-center px-6 py-12 text-center">
          <Briefcase className="h-10 w-10 text-muted-foreground/50 mb-4" />
          <p className="text-sm font-medium">Sélectionnez une affaire dans le tableau</p>
          <p className="text-sm text-muted-foreground mt-2 max-w-sm">
            Cliquez une carte (ex. colonne Prospection). Le panneau à droite affiche
            l&apos;avancement ; en Prospection, prescripteur et source du lead.
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
          onPlanSuiviRdv={() => openRdvPlanifier(selectedPipe)}
          onCreateVersementAffaire={() => openCreateVersementAffaire(selectedPipe)}
          onOpenChildAffaire={openView}
          focusHistoriqueToken={focusHistoriqueToken}
        />
      )}
    </>
  );

  return (
    <div className="flex flex-col gap-4 min-h-[calc(100vh-10rem)]">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <PipeViewToggle mode={viewMode} onChange={setViewModePersisted} />
        <PipeCreateButtons onCreate={openCreate} />
      </div>

      {error && <p className="text-sm text-destructive px-1">{error}</p>}

      {viewMode === "board" ? (
        <div
          className={cn(
            "flex flex-1 min-h-0 flex-col lg:flex-row gap-0",
            "rounded-xl border border-border/70 bg-card shadow-sm overflow-hidden"
          )}
        >
          <div className="flex flex-1 min-h-[280px] min-w-0 flex-col lg:min-h-0">
            {loading ? (
              <p className="px-4 py-6 text-sm text-muted-foreground">Chargement…</p>
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

          <aside
            className={cn(
              "min-h-[280px] lg:min-h-0 lg:w-[min(100%,400px)] lg:shrink-0",
              "border-t lg:border-t-0 lg:border-l border-border/70 bg-background/50"
            )}
          >
            {detailPanel}
          </aside>
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
