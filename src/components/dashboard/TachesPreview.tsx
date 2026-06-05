import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { ArrowRight, CheckCircle2, ListTodo } from "lucide-react";
import {
  getAllTaches,
  setTacheStatut,
  type Tache,
} from "@/lib/api/tauri-taches";
import { subscribeTachesChanged } from "@/lib/taches/tache-events";
import {
  ECHEANCE_TONE_CLASS,
  echeanceLabel,
  echeanceState,
} from "@/lib/taches/tache-display";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";
import { DashboardPanel } from "./dashboard-ui";

interface TachesPreviewProps {
  onNavigate?: (page: string) => void;
  onOpenContact?: (contactId: number) => void;
}

const MAX_PREVIEW = 5;

export function TachesPreview({ onNavigate, onOpenContact }: TachesPreviewProps) {
  const [taches, setTaches] = useState<Tache[]>([]);
  const [loading, setLoading] = useState(true);

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

  useEffect(() => {
    void load();
    return subscribeTachesChanged(() => void load());
  }, [load]);

  const visibles = taches.slice(0, MAX_PREVIEW);

  const handleDone = async (tache: Tache) => {
    try {
      await setTacheStatut(tache.id, "FAIT");
    } catch (error) {
      console.error(error);
    }
  };

  const description = loading
    ? "Chargement…"
    : taches.length > 0
      ? `${taches.length} tâche${taches.length > 1 ? "s" : ""} à faire`
      : "Rien à faire pour le moment";

  return (
    <DashboardPanel
      title="Tâches à faire"
      description={description}
      className="h-full"
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
        <div className="py-12 flex flex-col items-center justify-center text-center">
          <div className="inline-flex p-3 rounded-full bg-emerald-50 mb-3">
            <CheckCircle2 className="h-8 w-8 text-emerald-600" />
          </div>
          <p className="font-medium text-foreground">Aucune tâche en attente</p>
          <p className="text-sm text-muted-foreground mt-1 max-w-xs">
            Ajoutez un rappel depuis une fiche contact ou la page Tâches.
          </p>
        </div>
      ) : (
        <ul className="space-y-2">
          {visibles.map((tache) => {
            const state = echeanceState(tache.date_echeance, tache.statut);
            const firstContact = tache.contacts?.[0] ?? null;
            const extraCount = (tache.contacts?.length ?? 0) - 1;
            return (
              <li
                key={tache.id}
                className="flex items-center gap-3 p-3 rounded-xl border border-border/70 bg-background/80"
              >
                <Checkbox
                  checked={false}
                  onCheckedChange={() => void handleDone(tache)}
                  aria-label="Marquer comme faite"
                />
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-sm text-foreground truncate">
                    {tache.titre}
                  </p>
                  <div className="flex flex-wrap items-center gap-x-2 text-xs mt-0.5">
                    <span className={cn(ECHEANCE_TONE_CLASS[state])}>
                      {echeanceLabel(tache.date_echeance, tache.statut)}
                    </span>
                    {firstContact && (
                      <button
                        type="button"
                        className="text-muted-foreground hover:text-foreground truncate"
                        onClick={() => onOpenContact?.(firstContact.contact_id)}
                      >
                        · {firstContact.prenom} {firstContact.nom}
                        {extraCount > 0 ? ` +${extraCount}` : ""}
                      </button>
                    )}
                  </div>
                </div>
                <ListTodo className="h-4 w-4 text-muted-foreground/40 shrink-0" />
              </li>
            );
          })}
        </ul>
      )}
    </DashboardPanel>
  );
}
