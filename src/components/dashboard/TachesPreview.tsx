import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { ArrowRight, ListTodo } from "lucide-react";
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
import { TacheForm } from "@/components/taches/TacheForm";
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

  const openTache = (tache: Tache) => {
    setEditing(tache);
    setFormOpen(true);
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
        <p className="text-sm text-muted-foreground py-6 text-center">Aucune tâche en attente</p>
      ) : (
        <ul className="space-y-2">
          {visibles.map((tache) => {
            const state = echeanceState(tache.date_echeance, tache.statut);
            const firstContact = tache.contacts?.[0] ?? null;
            const extraCount = (tache.contacts?.length ?? 0) - 1;
            return (
              <li
                key={tache.id}
                className="flex items-center gap-3 p-3 rounded-xl border border-border/70 bg-background/80 hover:bg-accent/50 transition-colors"
              >
                <Checkbox
                  checked={false}
                  onCheckedChange={() => void handleDone(tache)}
                  onClick={(e) => e.stopPropagation()}
                  aria-label="Marquer comme faite"
                />
                <button
                  type="button"
                  className="flex-1 min-w-0 text-left"
                  onClick={() => openTache(tache)}
                >
                  <p className="font-medium text-sm text-foreground truncate">
                    {tache.titre}
                  </p>
                  <div className="flex flex-wrap items-center gap-x-2 text-xs mt-0.5">
                    <span className={cn(ECHEANCE_TONE_CLASS[state])}>
                      {echeanceLabel(tache.date_echeance, tache.statut)}
                    </span>
                    {firstContact && (
                      <span className="text-muted-foreground truncate">
                        · {firstContact.prenom} {firstContact.nom}
                        {extraCount > 0 ? ` +${extraCount}` : ""}
                      </span>
                    )}
                  </div>
                </button>
                {firstContact && onOpenContact ? (
                  <button
                    type="button"
                    className="text-xs text-muted-foreground hover:text-foreground shrink-0 max-w-[5rem] truncate"
                    title={`Ouvrir ${firstContact.prenom} ${firstContact.nom}`}
                    onClick={() => onOpenContact(firstContact.contact_id)}
                  >
                    {firstContact.prenom} {firstContact.nom.charAt(0)}.
                    {extraCount > 0 ? ` +${extraCount}` : ""}
                  </button>
                ) : null}
                <ListTodo className="h-4 w-4 text-muted-foreground/40 shrink-0" />
              </li>
            );
          })}
        </ul>
      )}
      <TacheForm
        open={formOpen}
        onOpenChange={setFormOpen}
        tache={editing}
        onSuccess={() => void load()}
      />
    </DashboardPanel>
  );
}
