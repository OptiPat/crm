import { useCallback, useEffect, useMemo, useState } from "react";
import { Briefcase, ClipboardList, LayoutGrid, List, PhoneCall } from "lucide-react";
import { Button } from "@/components/ui/button";
import { listPipes, type PipeRecord } from "@/lib/api/tauri-pipe";
import { subscribePipeChanged } from "@/lib/pipe/pipe-events";
import {
  filterAffairesForBoard,
  loadPipeViewMode,
  savePipeViewMode,
  type PipeViewMode,
} from "@/lib/pipe/pipe-board-utils";
import { type PipeType } from "@/lib/pipe/pipe-types";
import { PipeList } from "@/components/pipe/PipeList";
import { PipeBoard } from "@/components/pipe/PipeBoard";
import { PipeFormPanel } from "@/components/pipe/PipeFormPanel";
import { PipeDetailPanel } from "@/components/pipe/PipeDetailPanel";
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
        Acte
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
  const [panelMode, setPanelMode] = useState<PanelMode>("empty");
  const [selectedPipe, setSelectedPipe] = useState<PipeRecord | null>(null);
  const [createType, setCreateType] = useState<PipeType>("AFFAIRE");

  const affaires = useMemo(() => filterAffairesForBoard(pipes), [pipes]);

  const loadPipes = useCallback(async () => {
    try {
      setError(null);
      const rows = await listPipes();
      setPipes(rows);
      setSelectedPipe((prev) => (prev ? rows.find((p) => p.id === prev.id) ?? null : null));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadPipes();
    return subscribePipeChanged(() => {
      void loadPipes();
    });
  }, [loadPipes]);

  const setViewModePersisted = (mode: PipeViewMode) => {
    setViewMode(mode);
    savePipeViewMode(mode);
  };

  const openCreate = (type: PipeType) => {
    setCreateType(type);
    setSelectedPipe(null);
    setPanelMode("create");
  };

  const openView = (pipe: PipeRecord) => {
    setSelectedPipe(pipe);
    setPanelMode("view");
  };

  const openEdit = () => {
    if (selectedPipe) setPanelMode("edit");
  };

  const handleSaved = (pipe: PipeRecord) => {
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
    if (selectedPipe) {
      setPanelMode("view");
    } else {
      setPanelMode("empty");
    }
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
            Affaires, actes de gestion et actions — tous liés à un contact.
          </p>
        </div>
      )}

      {(panelMode === "create" || panelMode === "edit") && (
        <PipeFormPanel
          key={panelMode === "edit" ? `edit-${selectedPipe?.id}` : `create-${createType}`}
          pipe={panelMode === "edit" ? selectedPipe : null}
          allPipes={pipes}
          initialType={panelMode === "edit" ? undefined : createType}
          onSuccess={handleSaved}
          onCancel={cancelPanel}
        />
      )}

      {panelMode === "view" && selectedPipe && (
        <PipeDetailPanel pipe={selectedPipe} onEdit={openEdit} onDeleted={handleDeleted} />
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
            <div className="border-b px-4 py-3">
              <p className="text-sm font-medium">
                {pipes.length} pipe{pipes.length !== 1 ? "s" : ""}
              </p>
              <p className="text-xs text-muted-foreground mt-0.5">
                {affaires.length} affaire{affaires.length !== 1 ? "s" : ""} · actes et actions
                inclus
              </p>
            </div>

            <div className="flex-1 overflow-y-auto min-h-0">
              {loading ? (
                <p className="px-4 py-6 text-sm text-muted-foreground">Chargement…</p>
              ) : (
                <PipeList
                  pipes={pipes}
                  selectedId={selectedPipe?.id ?? null}
                  onSelect={openView}
                />
              )}
            </div>
          </aside>

          <main className="flex-1 min-w-0 min-h-[360px] lg:min-h-0 bg-background/50">
            {detailPanel}
          </main>
        </div>
      )}
    </div>
  );
}
