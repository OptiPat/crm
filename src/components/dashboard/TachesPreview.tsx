import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ArrowRight, Clock, FileText } from "lucide-react";
import { getAllTaches, updateTache, type Tache } from "@/lib/api/tauri-taches";
import { subscribeTachesChanged } from "@/lib/taches/tache-events";
import {
  ECHEANCE_TONE_CLASS,
  echeanceLabel,
  echeanceState,
} from "@/lib/taches/tache-display";
import { TacheForm } from "@/components/taches/TacheForm";
import { ArbitrageFicheTemplatePickDialog } from "@/components/taches/ArbitrageFicheTemplatePickDialog";
import { cn } from "@/lib/utils";
import { filterAndSortTachesDashboardCockpit } from "@/lib/taches/tache-filters";
import { useArbitrageTacheDone } from "@/hooks/useArbitrageTacheDone";
import { useArbitrageFicheConseil } from "@/hooks/useArbitrageFicheConseil";
import { isArbitrageAutoTask } from "@/lib/alertes/arbitrage-alerte";
import {
  buildPostponedTachePayload,
  TACHE_POSTPONE_OPTIONS,
} from "@/lib/taches/postpone-tache";
import { toast } from "sonner";
import { DashboardPanel } from "./dashboard-ui";
import type { DashboardDrillDownOpenContact } from "@/lib/dashboard/dashboard-drill-down";

interface TachesPreviewProps {
  onNavigate?: (page: string) => void;
  onOpenContact?: DashboardDrillDownOpenContact;
}

export function TachesPreview({ onNavigate, onOpenContact }: TachesPreviewProps) {
  const [taches, setTaches] = useState<Tache[]>([]);
  const [loading, setLoading] = useState(true);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Tache | null>(null);

  const load = useCallback(async () => {
    try {
      const all = await getAllTaches();
      setTaches(all.filter((t) => t.statut !== "FAIT"));
    } catch (error) {
      console.error("Erreur tâches:", error);
    } finally {
      setLoading(false);
    }
  }, []);

  const { tryComplete, dialog: arbitrageDialog } = useArbitrageTacheDone(() => void load());
  const {
    startFicheConseil,
    pendingPick,
    setPendingPick,
    confirmTemplatePick,
    busy: ficheBusy,
  } = useArbitrageFicheConseil();

  useEffect(() => {
    void load();
    return subscribeTachesChanged(() => void load());
  }, [load]);

  const visibles = filterAndSortTachesDashboardCockpit(taches);
  const horsScope = taches.length - visibles.length;
  const previewContactIds = visibles.flatMap(
    (t) => t.contacts?.map((c) => c.contact_id) ?? []
  );

  const handleDone = (tache: Tache) => {
    void tryComplete(tache);
  };

  const handlePostpone = async (tache: Tache, days: number) => {
    try {
      await updateTache(tache.id, buildPostponedTachePayload(tache, days));
      toast.success("Échéance reportée");
      await load();
    } catch (error) {
      toast.error(`Erreur : ${String(error)}`);
    }
  };

  const openTache = (tache: Tache) => {
    setEditing(tache);
    setFormOpen(true);
  };

  const description = loading
    ? "Chargement…"
    : visibles.length > 0
      ? `${visibles.length} tâche${visibles.length > 1 ? "s" : ""} en retard ou sous 7 jours${
          horsScope > 0 ? ` · ${horsScope} autre${horsScope > 1 ? "s" : ""} plus tard` : ""
        }`
      : taches.length > 0
        ? `${taches.length} tâche${taches.length > 1 ? "s" : ""} à faire, aucune sous 7 jours`
        : "Rien à faire pour le moment";

  return (
    <DashboardPanel
      title="Tâches à faire"
      description={description}
      action={
        onNavigate ? (
          <Button
            variant="outline"
            size="sm"
            className="shrink-0 gap-1"
            onClick={() => onNavigate("taches")}
          >
            Toutes les tâches
            <ArrowRight className="h-4 w-4" />
          </Button>
        ) : undefined
      }
    >
      {loading ? (
        <div className="space-y-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-12 rounded-xl bg-muted/50 animate-pulse" />
          ))}
        </div>
      ) : visibles.length === 0 ? (
        <p className="text-sm text-muted-foreground py-6 text-center">
          {taches.length > 0
            ? "Aucune tâche en retard ou à échéance sous 7 jours"
            : "Aucune tâche en attente"}
        </p>
      ) : (
        <ul className="space-y-2 min-w-0">
          {visibles.map((tache) => {
            const state = echeanceState(tache.date_echeance, tache.statut);
            const firstContact = tache.contacts?.[0] ?? null;
            const extraCount = (tache.contacts?.length ?? 0) - 1;
            return (
              <li
                key={tache.id}
                className="flex items-center gap-2 sm:gap-3 p-3 rounded-xl border border-border/70 bg-background/80 hover:bg-accent/50 transition-colors min-w-0"
              >
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="shrink-0 h-8 px-2.5 text-xs"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleDone(tache);
                  }}
                >
                  Fait
                </Button>
                <div className="flex-1 min-w-0 overflow-hidden text-left">
                  <button
                    type="button"
                    className="w-full text-left"
                    onClick={() => openTache(tache)}
                  >
                    <p className="font-medium text-sm text-foreground truncate">
                      {tache.titre}
                    </p>
                  </button>
                  <div className="flex flex-wrap items-center gap-x-2 text-xs mt-0.5">
                    <span className={cn(ECHEANCE_TONE_CLASS[state])}>
                      {echeanceLabel(tache.date_echeance, tache.statut)}
                    </span>
                    {firstContact ? (
                      <>
                        <span className="text-muted-foreground">·</span>
                        {onOpenContact ? (
                          <button
                            type="button"
                            className="text-muted-foreground hover:text-foreground truncate"
                            onClick={() =>
                              onOpenContact(firstContact.contact_id, previewContactIds)
                            }
                          >
                            {firstContact.prenom} {firstContact.nom}
                            {extraCount > 0 ? ` +${extraCount}` : ""}
                          </button>
                        ) : (
                          <span className="text-muted-foreground truncate">
                            {firstContact.prenom} {firstContact.nom}
                            {extraCount > 0 ? ` +${extraCount}` : ""}
                          </span>
                        )}
                      </>
                    ) : null}
                  </div>
                </div>
                <div className="shrink-0 ml-auto flex items-center gap-1.5">
                  {isArbitrageAutoTask(tache) ? (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-8 px-2.5 text-xs shrink-0 gap-1"
                      title="Générer la fiche conseil arbitrage"
                      disabled={ficheBusy || pendingPick != null}
                      onClick={(e) => {
                        e.stopPropagation();
                        void startFicheConseil(tache);
                      }}
                    >
                      <FileText className="h-3.5 w-3.5" />
                      Fiche Conseil
                    </Button>
                  ) : null}
                  <Select
                    onValueChange={(v) => {
                      void handlePostpone(tache, parseInt(v, 10));
                    }}
                  >
                    <SelectTrigger
                      className="h-8 w-[7.25rem] text-xs bg-background"
                      title="Reporter"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <Clock className="h-3.5 w-3.5 mr-1 shrink-0" />
                      <SelectValue placeholder="Reporter" />
                    </SelectTrigger>
                    <SelectContent align="end">
                      {TACHE_POSTPONE_OPTIONS.map((opt) => (
                        <SelectItem key={opt.id} value={String(opt.days)}>
                          {opt.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </li>
            );
          })}
        </ul>
      )}
      {arbitrageDialog}
      <ArbitrageFicheTemplatePickDialog
        open={pendingPick !== null}
        onOpenChange={(open) => {
          if (!open) setPendingPick(null);
        }}
        templates={pendingPick?.templates ?? []}
        onConfirm={confirmTemplatePick}
      />
      <TacheForm
        open={formOpen}
        onOpenChange={setFormOpen}
        tache={editing}
        onSuccess={() => void load()}
      />
    </DashboardPanel>
  );
}
