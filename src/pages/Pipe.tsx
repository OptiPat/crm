import { useCallback, useEffect, useState } from "react";
import { Briefcase, ClipboardList, PhoneCall } from "lucide-react";
import { Button } from "@/components/ui/button";
import { listPipes, type PipeRecord } from "@/lib/api/tauri-pipe";
import { subscribePipeChanged } from "@/lib/pipe/pipe-events";
import { type PipeType } from "@/lib/pipe/pipe-types";
import { PipeList } from "@/components/pipe/PipeList";
import { PipeFormPanel } from "@/components/pipe/PipeFormPanel";
import { PipeDetailPanel } from "@/components/pipe/PipeDetailPanel";
import { cn } from "@/lib/utils";

type PanelMode = "empty" | "create" | "view" | "edit";

export function Pipe() {
  const [pipes, setPipes] = useState<PipeRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [panelMode, setPanelMode] = useState<PanelMode>("empty");
  const [selectedPipe, setSelectedPipe] = useState<PipeRecord | null>(null);
  const [createType, setCreateType] = useState<PipeType>("AFFAIRE");

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

  return (
    <div className="flex flex-col gap-4 min-h-[calc(100vh-10rem)]">
      <div
        className={cn(
          "flex flex-1 min-h-0 flex-col lg:flex-row gap-4",
          "rounded-xl border border-border/70 bg-card shadow-sm overflow-hidden"
        )}
      >
        {/* Liste — colonne gauche */}
        <aside className="flex flex-col lg:w-[min(100%,380px)] lg:shrink-0 lg:border-r border-border/70 min-h-[320px] lg:min-h-0">
          <div className="border-b px-4 py-3 space-y-3">
            <div>
              <p className="text-sm font-medium">{pipes.length} pipe{pipes.length !== 1 ? "s" : ""}</p>
              <p className="text-xs text-muted-foreground">
                Affaire, acte de gestion ou action — lié à un contact.
              </p>
            </div>
            <div className="grid grid-cols-3 gap-1.5">
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-auto flex-col gap-1 py-2 px-1 text-xs"
                onClick={() => openCreate("AFFAIRE")}
              >
                <Briefcase className="h-3.5 w-3.5" />
                Affaire
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-auto flex-col gap-1 py-2 px-1 text-xs"
                onClick={() => openCreate("ACTE_GESTION")}
              >
                <ClipboardList className="h-3.5 w-3.5" />
                Acte
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-auto flex-col gap-1 py-2 px-1 text-xs"
                onClick={() => openCreate("ACTION")}
              >
                <PhoneCall className="h-3.5 w-3.5" />
                Action
              </Button>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto min-h-0">
            {loading && (
              <p className="px-4 py-6 text-sm text-muted-foreground">Chargement…</p>
            )}
            {error && <p className="px-4 py-6 text-sm text-destructive">{error}</p>}
            {!loading && !error && (
              <PipeList
                pipes={pipes}
                selectedId={selectedPipe?.id ?? null}
                onSelect={openView}
              />
            )}
          </div>
        </aside>

        {/* Panneau droit — détail / formulaire */}
        <main className="flex-1 min-w-0 min-h-[360px] lg:min-h-0 bg-background/50">
          {panelMode === "empty" && (
            <div className="flex h-full flex-col items-center justify-center px-6 py-12 text-center">
              <Briefcase className="h-10 w-10 text-muted-foreground/50 mb-4" />
              <p className="text-sm font-medium">Sélectionnez un pipe ou créez-en un</p>
              <p className="text-sm text-muted-foreground mt-2 max-w-sm">
                Utilisez les boutons Affaire, Acte ou Action à gauche — le formulaire s&apos;ouvre ici,
                sans fenêtre flottante.
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
            <PipeDetailPanel
              pipe={selectedPipe}
              onEdit={openEdit}
              onDeleted={handleDeleted}
            />
          )}
        </main>
      </div>
    </div>
  );
}
