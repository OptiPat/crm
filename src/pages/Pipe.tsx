import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Briefcase, ClipboardList } from "lucide-react";
import { listPipes, getPipeById, setPipeEtudeRealisee, type PipeRecord } from "@/lib/api/tauri-pipe";
import { listPipeRdvEntriesForBoard, type PipeTimelineEntryRecord } from "@/lib/api/tauri-pipe-timeline";
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
  filterPipesForActiveView,
  isPipeArchived,
  loadPipeShowArchived,
  savePipeShowArchived,
} from "@/lib/pipe/pipe-board-utils";
import {
  loadPipeSection,
  pipeSectionIsListe,
  pipeSectionNeedsPlacementBoard,
  savePipeSection,
  type PipeSection,
} from "@/lib/pipe/pipe-section";
import { filterPlacementRowsForBoard } from "@/lib/placement/placement-operation-board";
import {
  filterPipesForList,
  loadPipeListFilters,
  savePipeListFilters,
  type PipeListFilters,
} from "@/lib/pipe/pipe-list-filters";
import { buildSuiviPlacementColumnByPipe } from "@/lib/pipe/pipe-list-badges";
import { sortPipesForList } from "@/lib/pipe/pipe-list-sort";
import { resolvePipeBoardStageDrop } from "@/lib/pipe/pipe-board-stage-actions";
import {
  groupRdvEntriesByPipeId,
  resolveAffaireBoardColumn,
  type PipeBoardColumn,
} from "@/lib/pipe/pipe-board-columns";
import { confirmDiscardPipeFormEdits } from "@/lib/pipe/pipe-form-dirty";
import { trackVersementAffaireOnPipeCreate } from "@/lib/placement/pipe-placement-tracking";
import { type PipeStage, type PipeType } from "@/lib/pipe/pipe-types";
import {
  defaultPlanOptionForRdvStage,
  rdvStageFromPlanOption,
  type PipeRdvPlanOption,
} from "@/lib/pipe/pipe-rdv-plan-option";
import { type PipeRdvStage } from "@/lib/pipe/pipe-rdv-stage";
import {
  clearPipeFocusId,
  consumePipeFocusId,
  peekPipeFocusId,
  PIPE_FOCUS_EVENT,
} from "@/lib/navigation/pipe-navigation";
import { usePipeListR1MissingDocs } from "@/hooks/usePipeListR1MissingDocs";
import { usePipeListR3MissingDocs } from "@/hooks/usePipeListR3MissingDocs";
import { usePipeListR3ImmoMissingDocs } from "@/hooks/usePipeListR3ImmoMissingDocs";
import { usePipeChecklistTemplates } from "@/hooks/usePipeChecklistTemplates";
import { useR3ImmoChecklistTemplate } from "@/hooks/useR3ImmoChecklistTemplate";
import { PipeChecklistSettingsDialog } from "@/components/pipe/PipeChecklistSettingsDialog";
import { PipePageToolbar } from "@/components/pipe/PipePageToolbar";
import { PipeList } from "@/components/pipe/PipeList";
import { PipeListToolbar } from "@/components/pipe/PipeListToolbar";
import { PipeBoard } from "@/components/pipe/PipeBoard";
import { PipePlacementBoard } from "@/components/pipe/PipePlacementBoard";
import { PipeRemunerationBoard } from "@/components/pipe/PipeRemunerationBoard";
import { PipeFormPanel } from "@/components/pipe/PipeFormPanel";
import { PipeDetailPanel } from "@/components/pipe/PipeDetailPanel";
import { PipeStageAdvanceDialog } from "@/components/pipe/PipeStageAdvanceDialog";
import { PipeDetailLayoutToolbar } from "@/components/pipe/PipeDetailLayoutToolbar";
import { RdvPlanifierDialog } from "@/components/calendar/RdvPlanifierDialog";
import { toast } from "sonner";
import { usePipeStageAdvance } from "@/hooks/usePipeStageAdvance";
import { cn } from "@/lib/utils";

type PanelMode = "empty" | "create" | "view" | "edit";

export function Pipe() {
  const [pipes, setPipes] = useState<PipeRecord[]>([]);
  const [rdvEntriesByPipeId, setRdvEntriesByPipeId] = useState<
    Record<number, PipeTimelineEntryRecord[]>
  >({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [section, setSection] = useState<PipeSection>(() => loadPipeSection());
  const { templates: checklistTemplates, reload: reloadChecklistTemplates } =
    usePipeChecklistTemplates();
  const { template: r3ImmoChecklistTemplate, reload: reloadR3ImmoChecklistTemplate } =
    useR3ImmoChecklistTemplate();
  const [checklistSettingsOpen, setChecklistSettingsOpen] = useState(false);
  const r1MissingByPipeId = usePipeListR1MissingDocs(
    pipeSectionIsListe(section),
    checklistTemplates
  );
  const r3MissingByPipeId = usePipeListR3MissingDocs(
    pipeSectionIsListe(section),
    checklistTemplates
  );
  const r3ImmoMissingByPipeId = usePipeListR3ImmoMissingDocs(
    pipeSectionIsListe(section),
    pipes,
    r3ImmoChecklistTemplate
  );
  const [listFilters, setListFilters] = useState<PipeListFilters>(() => loadPipeListFilters());
  const [showArchived, setShowArchived] = useState(() => loadPipeShowArchived());
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
  const [rdvPlanifierPlanOption, setRdvPlanifierPlanOption] = useState<
    PipeRdvPlanOption | undefined
  >();
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
  const [detailExpanded, setDetailExpanded] = useState(false);
  const formIsDirtyRef = useRef(false);
  const placementBoardLoadedRef = useRef(false);
  const pendingPipeFocusRef = useRef<number | null>(consumePipeFocusId());
  const pipesRef = useRef<PipeRecord[]>([]);
  const selectedPipeRef = useRef<PipeRecord | null>(null);
  const loadPipesGenerationRef = useRef(0);
  const loadPlacementBoardRowsGenerationRef = useRef(0);
  const detailExpandedBeforeFormRef = useRef<boolean | null>(null);

  const PIPE_RELOAD_DEBOUNCE_MS = 150;

  const handleFormDirtyChange = useCallback((isDirty: boolean) => {
    formIsDirtyRef.current = isDirty;
  }, []);

  const expandDetail = useCallback(() => {
    setDetailExpanded(true);
  }, []);

  const expandBoardDetailIfNeeded = useCallback(() => {
    if (!pipeSectionIsListe(section)) {
      setDetailExpanded(true);
    }
  }, [section]);

  const backToBoard = useCallback(() => {
    if (panelMode === "edit" && formIsDirtyRef.current && !confirmDiscardPipeFormEdits()) {
      return;
    }
    setCreatePrefill(null);
    setSelectedPipe(null);
    setSelectedPlacementOperationId(null);
    setPanelMode("empty");
    setDetailExpanded(false);
    detailExpandedBeforeFormRef.current = null;
  }, [panelMode]);

  useEffect(() => {
    if (panelMode !== "edit") {
      formIsDirtyRef.current = false;
    }
  }, [panelMode]);

  useEffect(() => {
    if (panelMode === "edit" || panelMode === "create") {
      setDetailExpanded((current) => {
        if (detailExpandedBeforeFormRef.current === null) {
          detailExpandedBeforeFormRef.current = current;
        }
        return true;
      });
      return;
    }

    if (panelMode === "view" && detailExpandedBeforeFormRef.current !== null) {
      const restore = detailExpandedBeforeFormRef.current;
      detailExpandedBeforeFormRef.current = null;
      setDetailExpanded(restore);
      return;
    }

    if (panelMode === "empty") {
      detailExpandedBeforeFormRef.current = null;
      setDetailExpanded(false);
    }
  }, [panelMode]);

  useEffect(() => {
    pipesRef.current = pipes;
  }, [pipes]);

  useEffect(() => {
    selectedPipeRef.current = selectedPipe;
  }, [selectedPipe]);

  const focusPipeById = useCallback(async (pipeId: number, rowsHint?: PipeRecord[]) => {
    const rows = rowsHint ?? pipesRef.current;
    const found = rows.find((p) => p.id === pipeId);
    if (found) {
      setSelectedPipe(found);
      setPanelMode("view");
      expandBoardDetailIfNeeded();
      clearPipeFocusId();
      return;
    }
    try {
      const pipe = await getPipeById(pipeId);
      setSelectedPipe(pipe);
      setPanelMode("view");
      expandBoardDetailIfNeeded();
      clearPipeFocusId();
    } catch {
      clearPipeFocusId();
    }
  }, [expandBoardDetailIfNeeded]);

  const syncSelectedPipeAfterLoad = useCallback(
    async (rows: PipeRecord[], generation: number) => {
      const prev = selectedPipeRef.current;
      if (!prev) return;

      const found = rows.find((p) => p.id === prev.id);
      if (found) {
        if (generation === loadPipesGenerationRef.current) {
          setSelectedPipe(found);
        }
        return;
      }

      if (!showArchived && isPipeArchived(prev)) {
        if (generation === loadPipesGenerationRef.current) {
          setSelectedPipe(null);
          setPanelMode("empty");
        }
        return;
      }

      try {
        const fresh = await getPipeById(prev.id);
        if (generation !== loadPipesGenerationRef.current) return;
        if (!showArchived && isPipeArchived(fresh)) {
          setSelectedPipe(null);
          setPanelMode("empty");
          return;
        }
        setSelectedPipe(fresh);
      } catch {
        if (generation !== loadPipesGenerationRef.current) return;
        setSelectedPipe(null);
        setPanelMode("empty");
      }
    },
    [showArchived]
  );

  const stageAdvance = usePipeStageAdvance((pipe) => {
    setSelectedPipe(pipe);
    setPanelMode("view");
    void loadPipes();
  });

  const activePipes = useMemo(
    () => filterPipesForActiveView(pipes, showArchived),
    [pipes, showArchived]
  );

  const affaires = useMemo(() => filterAffairesForBoard(activePipes), [activePipes]);
  const suiviColumnByPipe = useMemo(
    () => buildSuiviPlacementColumnByPipe(placementBoardRows),
    [placementBoardRows]
  );

  const filteredListPipes = useMemo(() => {
    const filtered = filterPipesForList(activePipes, listFilters, {
      columnByPipe: suiviColumnByPipe,
      countsByPipe: placementCountsByPipe,
      placementContextReady: !placementBoardLoading,
      rdvEntriesByPipeId,
    });
    return sortPipesForList(filtered, listFilters.sort, {
      columnByPipe: suiviColumnByPipe,
      countsByPipe: placementCountsByPipe,
      rdvEntriesByPipeId,
    });
  }, [
    activePipes,
    listFilters,
    suiviColumnByPipe,
    placementCountsByPipe,
    placementBoardLoading,
    rdvEntriesByPipeId,
  ]);

  const setListFiltersPersisted = (filters: PipeListFilters) => {
    setListFilters(filters);
    savePipeListFilters(filters);
  };

  const openRdvPlanifier = useCallback(
    (
      pipe: PipeRecord,
      planOption?: PipeRdvPlanOption,
      options?: { keepPanelMode?: boolean; isDirty?: boolean }
    ) => {
      if (options?.isDirty && !confirmDiscardPipeFormEdits()) return;
      setSelectedPipe(pipe);
      if (!options?.keepPanelMode) setPanelMode("view");
      setRdvPlanifierPipe(pipe);
      setRdvPlanifierPlanOption(planOption);
      setRdvPlanifierStage(planOption ? rdvStageFromPlanOption(planOption) : undefined);
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

  const loadPlacementBoardRows = useCallback(
    async (options?: { silent?: boolean; includeArchived?: boolean }) => {
      const generation = ++loadPlacementBoardRowsGenerationRef.current;
      const silent = options?.silent ?? placementBoardLoadedRef.current;
      const includeArchived = options?.includeArchived ?? showArchived;
      if (!silent) setPlacementBoardLoading(true);
      try {
        const rows = await listPlacementOperations(includeArchived);
        if (generation !== loadPlacementBoardRowsGenerationRef.current) return;
        setPlacementBoardRows(filterPlacementRowsForBoard(rows));
        placementBoardLoadedRef.current = true;
      } catch {
        if (generation !== loadPlacementBoardRowsGenerationRef.current) return;
        if (!placementBoardLoadedRef.current) setPlacementBoardRows([]);
      } finally {
        if (generation === loadPlacementBoardRowsGenerationRef.current && !silent) {
          setPlacementBoardLoading(false);
        }
      }
    },
    [showArchived]
  );

  const loadPipes = useCallback(async (options?: { includeArchived?: boolean }) => {
    const generation = ++loadPipesGenerationRef.current;
    const includeArchived = options?.includeArchived ?? showArchived;
    try {
      setError(null);
      const [rows, rdvRows] = await Promise.all([
        listPipes(includeArchived),
        listPipeRdvEntriesForBoard(),
      ]);
      if (generation !== loadPipesGenerationRef.current) return;

      setPipes(rows);
      pipesRef.current = rows;
      setRdvEntriesByPipeId(groupRdvEntriesByPipeId(rdvRows));

      const focusId = pendingPipeFocusRef.current ?? peekPipeFocusId();
      pendingPipeFocusRef.current = null;
      if (focusId) {
        await focusPipeById(focusId, rows);
        if (generation !== loadPipesGenerationRef.current) return;
      } else {
        await syncSelectedPipeAfterLoad(rows, generation);
      }

      if (generation !== loadPipesGenerationRef.current) return;
      await loadPlacementCounts();
    } catch (err) {
      if (generation !== loadPipesGenerationRef.current) return;
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      if (generation === loadPipesGenerationRef.current) {
        setLoading(false);
      }
    }
  }, [focusPipeById, loadPlacementCounts, showArchived, syncSelectedPipeAfterLoad]);

  useEffect(() => {
    const onPipeFocus = (event: Event) => {
      const pipeId = (event as CustomEvent<{ pipeId: number }>).detail?.pipeId;
      if (!pipeId) return;
      pendingPipeFocusRef.current = null;
      void focusPipeById(pipeId);
    };
    window.addEventListener(PIPE_FOCUS_EVENT, onPipeFocus);
    return () => window.removeEventListener(PIPE_FOCUS_EVENT, onPipeFocus);
  }, [focusPipeById]);

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
        if (pipeSectionNeedsPlacementBoard(section)) {
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
  }, [loadPipes, loadPlacementCounts, section, loadPlacementBoardRows]);

  useEffect(() => {
    void loadPipes();
  }, [showArchived, loadPipes]);

  useEffect(() => {
    if (pipeSectionNeedsPlacementBoard(section)) {
      void loadPlacementBoardRows({ silent: placementBoardLoadedRef.current });
    }
  }, [section, showArchived, loadPlacementBoardRows]);

  const setSectionPersisted = (next: PipeSection) => {
    setSection(next);
    savePipeSection(next);
    setSelectedPlacementOperationId(null);
    setSelectedPipe(null);
    setPanelMode("empty");
    setDetailExpanded(false);
    detailExpandedBeforeFormRef.current = null;
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
    expandBoardDetailIfNeeded();
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
    if (pipe) {
      setSelectedPipe(pipe);
      setPanelMode("view");
      expandBoardDetailIfNeeded();
      return;
    }
    // Suivi archivé hors liste active : ouvrir quand même (acte Stellium encore ouvert).
    void (async () => {
      try {
        const archivedOrMissing = await getPipeById(pipeId);
        setSelectedPipe(archivedOrMissing);
        setPanelMode("view");
        expandBoardDetailIfNeeded();
      } catch {
        toast.warning("Suivi introuvable — actualisez la page.");
        setPanelMode("empty");
        setSelectedPipe(null);
      }
    })();
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
    section === "affaires" &&
    (panelMode === "create" ||
      panelMode === "edit" ||
      (panelMode === "view" && selectedPipe != null));
  const showSuiviStelliumBoardAside =
    section === "suivi_stellium" &&
    (panelMode === "create" ||
      panelMode === "edit" ||
      (panelMode === "view" && selectedPipe != null));
  const showBoardAside = showAffairesBoardAside || showSuiviStelliumBoardAside;
  const showDetailChrome =
    showBoardAside && (panelMode === "view" || panelMode === "create" || panelMode === "edit");
  const boardLayoutSplit = showBoardAside && !detailExpanded;

  const detailChrome = showDetailChrome ? (
    <div className="shrink-0 border-b border-border/60 bg-muted/15 px-4 py-2">
      <PipeDetailLayoutToolbar
        expanded={detailExpanded}
        onExpand={expandDetail}
        onBackToBoard={backToBoard}
      />
    </div>
  ) : null;

  const openEdit = () => {
    if (selectedPipe) setPanelMode("edit");
  };

  const handleSaved = (pipe: PipeRecord) => {
    const wasCreate = panelMode === "create";
    setCreatePrefill(null);
    setSelectedPipe(pipe);
    if (!pipeSectionIsListe(section)) {
      detailExpandedBeforeFormRef.current = true;
    }
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

  const handleArchived = () => {
    setShowArchived(false);
    savePipeShowArchived(false);
    setSelectedPipe(null);
    setPanelMode("empty");
    void loadPipes({ includeArchived: false });
  };

  const handlePipeRefreshed = (pipe: PipeRecord) => {
    setSelectedPipe(pipe);
    void loadPipes();
  };

  const setShowArchivedPersisted = (value: boolean) => {
    setShowArchived(value);
    savePipeShowArchived(value);
    if (!value) {
      const prev = selectedPipeRef.current;
      if (prev && isPipeArchived(prev)) {
        setSelectedPipe(null);
        setPanelMode("empty");
      }
    }
    // Rechargement explicite avec la valeur demandée (évite une course sur le closure showArchived).
    void loadPipes({ includeArchived: value });
    if (pipeSectionNeedsPlacementBoard(section)) {
      void loadPlacementBoardRows({ includeArchived: value, silent: true });
    }
  };

  const cancelPanel = () => {
    setCreatePrefill(null);
    if (selectedPipe) {
      setPanelMode("view");
    } else {
      setPanelMode("empty");
    }
  };

  const handleRequestStageChange = (pipe: PipeRecord, target: PipeBoardColumn) => {
    const current = resolveAffaireBoardColumn(pipe, rdvEntriesByPipeId[pipe.id] ?? []);
    const action = resolvePipeBoardStageDrop(current, target);
    const isDirty = panelMode === "edit" && formIsDirtyRef.current;
    if (action.kind === "plan-rdv") {
      openRdvPlanifier(pipe, defaultPlanOptionForRdvStage(action.rdvStage), { isDirty });
      return;
    }
    if (action.kind === "manual-advance") {
      if (isDirty && !confirmDiscardPipeFormEdits()) return;
      if (panelMode === "edit") setPanelMode("view");
      stageAdvance.requestStageChange(pipe.id, action.stage, pipe.titre);
    }
  };

  const handleToggleEtudeRealisee = (pipe: PipeRecord, checked: boolean) => {
    setPipes((prev) =>
      prev.map((row) => (row.id === pipe.id ? { ...row, etude_realisee: checked } : row))
    );
    setSelectedPipe((prev) =>
      prev && prev.id === pipe.id ? { ...prev, etude_realisee: checked } : prev
    );
    void setPipeEtudeRealisee(pipe.id, checked).catch(() => {
      setPipes((prev) =>
        prev.map((row) =>
          row.id === pipe.id ? { ...row, etude_realisee: pipe.etude_realisee } : row
        )
      );
      setSelectedPipe((prev) =>
        prev && prev.id === pipe.id ? { ...prev, etude_realisee: pipe.etude_realisee } : prev
      );
      toast.error("Impossible d'enregistrer l'étude réalisée.");
    });
  };

  const handleRequestRdvStageFromForm = (stage: PipeRdvStage, options: { isDirty: boolean }) => {
    if (!selectedPipe) return;
    openRdvPlanifier(selectedPipe, defaultPlanOptionForRdvStage(stage), {
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
      {panelMode === "empty" && section === "affaires" && (
        <div className="flex h-full flex-col items-center justify-center px-6 py-12 text-center">
          <Briefcase className="h-10 w-10 text-muted-foreground/50 mb-4" />
          <p className="text-sm font-medium">Sélectionnez une affaire dans le tableau</p>
          <p className="text-sm text-muted-foreground mt-2 max-w-sm">
            Cliquez une carte pour ouvrir la fiche. « Retour au tableau » ramène au kanban.
          </p>
        </div>
      )}

      {panelMode === "empty" && section === "suivi_stellium" && (
        <div className="flex h-full flex-col items-center justify-center px-6 py-12 text-center">
          <ClipboardList className="h-10 w-10 text-muted-foreground/50 mb-4" />
          <p className="text-sm font-medium">Sélectionnez une opération Stellium</p>
          <p className="text-sm text-muted-foreground mt-2 max-w-sm">
            Chaque carte est une opération partenaire en cours. Le panneau ouvre le dossier
            suivi associé avec l&apos;avancement détaillé.
          </p>
        </div>
      )}

      {panelMode === "empty" && section === "liste" && (
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
          onArchived={handleArchived}
          onRefreshed={handlePipeRefreshed}
          onPlanRdv={(planOption) => openRdvPlanifier(selectedPipe, planOption)}
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
      <PipePageToolbar
        section={section}
        showArchived={showArchived}
        onSectionChange={setSectionPersisted}
        onShowArchivedChange={setShowArchivedPersisted}
        onCreate={openCreate}
        onOpenSettings={() => setChecklistSettingsOpen(true)}
      />

      {error && <p className="text-sm text-destructive px-1">{error}</p>}

      {!pipeSectionIsListe(section) ? (
        <div
          className={cn(
            "flex flex-1 min-h-0 flex-col gap-0",
            boardLayoutSplit ? "lg:flex-row" : "",
            "rounded-xl border border-border/70 bg-card shadow-sm overflow-hidden"
          )}
        >
          <div
            className={cn(
              "flex flex-1 min-h-[320px] min-w-0 flex-col",
              boardLayoutSplit ? "lg:min-h-0" : "w-full",
              showBoardAside && detailExpanded && "hidden"
            )}
          >
            {loading || (section === "suivi_stellium" && placementBoardLoading) ? (
              <p className="px-4 py-6 text-sm text-muted-foreground">Chargement…</p>
            ) : section === "suivi_stellium" ? (
              <PipePlacementBoard
                rows={placementBoardRows}
                selectedOperationId={selectedPlacementOperationId}
                onSelect={openPlacementOperation}
                onDismiss={handleDismissPlacementOperation}
                dismissingOperationId={dismissingPlacementId}
              />
            ) : section === "remuneration" ? (
              <div className="p-4 overflow-auto">
                <PipeRemunerationBoard />
              </div>
            ) : (
              <PipeBoard
                affaires={affaires}
                selectedId={selectedPipe?.id ?? null}
                rdvEntriesByPipeId={rdvEntriesByPipeId}
                onSelect={openView}
                onRequestStageChange={(pipe, column) =>
                  void handleRequestStageChange(pipe, column)
                }
                onToggleEtudeRealisee={handleToggleEtudeRealisee}
              />
            )}
          </div>

          {showBoardAside ? (
            <aside
              className={cn(
                "flex min-h-[280px] flex-col bg-background/50",
                detailExpanded
                  ? "min-h-0 w-full flex-1"
                  : "lg:min-h-0 lg:w-[min(100%,400px)] lg:shrink-0 border-t lg:border-t-0 lg:border-l border-border/70"
              )}
            >
              {detailChrome}
              <div className="min-h-0 flex-1 overflow-hidden">{detailPanel}</div>
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
              totalCount={activePipes.length}
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
                  suiviColumnByPipe={suiviColumnByPipe}
                  r1MissingByPipeId={r1MissingByPipeId}
                  r3MissingByPipeId={r3MissingByPipeId}
                  r3ImmoMissingByPipeId={r3ImmoMissingByPipeId}
                  rdvEntriesByPipeId={rdvEntriesByPipeId}
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
              setRdvPlanifierPlanOption(undefined);
            }
          }}
          context={{
            kind: "pipe",
            pipe: rdvPlanifierPipe,
            rdvStage: rdvPlanifierStage,
            rdvPlanOption: rdvPlanifierPlanOption,
          }}
          onCreated={() => {
            void loadPipes();
            if (rdvPlanifierPipe?.pipe_type === "ACTE_GESTION") {
              setFocusHistoriqueToken((t) => t + 1);
            }
          }}
        />
      )}

      <PipeChecklistSettingsDialog
        open={checklistSettingsOpen}
        onOpenChange={setChecklistSettingsOpen}
        onSaved={() => {
          void reloadChecklistTemplates();
          void reloadR3ImmoChecklistTemplate();
        }}
      />
    </div>
  );
}
