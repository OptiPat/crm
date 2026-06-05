import { useCallback, useEffect, useState } from "react";
import { Plus, ListTodo } from "lucide-react";
import { Button } from "@/components/ui/button";
import { TacheForm } from "@/components/taches/TacheForm";
import { TacheItem } from "@/components/taches/TacheItem";
import {
  getTachesByContact,
  setTacheStatut,
  deleteTache,
  type Tache,
} from "@/lib/api/tauri-taches";
import { subscribeTachesChanged } from "@/lib/taches/tache-events";
import { toast } from "sonner";

interface ContactTachesPanelProps {
  contactId: number;
}

export function ContactTachesPanel({ contactId }: ContactTachesPanelProps) {
  const [taches, setTaches] = useState<Tache[]>([]);
  const [loading, setLoading] = useState(true);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Tache | null>(null);

  const load = useCallback(async () => {
    try {
      setTaches(await getTachesByContact(contactId));
    } catch (error) {
      console.error("Erreur chargement tâches:", error);
    } finally {
      setLoading(false);
    }
  }, [contactId]);

  useEffect(() => {
    void load();
    return subscribeTachesChanged(() => void load());
  }, [load]);

  const handleToggle = async (tache: Tache) => {
    try {
      await setTacheStatut(tache.id, tache.statut === "FAIT" ? "A_FAIRE" : "FAIT");
    } catch (error) {
      toast.error(`Erreur : ${String(error)}`);
    }
  };

  const handleDelete = async (tache: Tache) => {
    if (!window.confirm(`Supprimer la tâche « ${tache.titre} » ?`)) return;
    try {
      await deleteTache(tache.id);
    } catch (error) {
      toast.error(`Erreur : ${String(error)}`);
    }
  };

  const aFaire = taches.filter((t) => t.statut !== "FAIT");
  const faites = taches.filter((t) => t.statut === "FAIT");

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="flex items-center gap-2 text-sm font-semibold">
          <ListTodo className="h-4 w-4" />
          Tâches & rappels
        </h3>
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={() => {
            setEditing(null);
            setFormOpen(true);
          }}
        >
          <Plus className="h-4 w-4 mr-1" />
          Ajouter
        </Button>
      </div>

      {loading ? (
        <p className="text-sm text-muted-foreground">Chargement…</p>
      ) : taches.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Aucune tâche pour ce contact.
        </p>
      ) : (
        <div className="space-y-2">
          {aFaire.map((t) => (
            <TacheItem
              key={t.id}
              tache={t}
              onToggle={(x) => void handleToggle(x as Tache)}
              onEdit={(x) => {
                setEditing(x as Tache);
                setFormOpen(true);
              }}
              onDelete={(x) => void handleDelete(x as Tache)}
            />
          ))}
          {faites.length > 0 && (
            <>
              <p className="pt-2 text-xs font-medium text-muted-foreground">
                Faites ({faites.length})
              </p>
              {faites.map((t) => (
                <TacheItem
                  key={t.id}
                  tache={t}
                  onToggle={(x) => void handleToggle(x as Tache)}
                  onEdit={(x) => {
                    setEditing(x as Tache);
                    setFormOpen(true);
                  }}
                  onDelete={(x) => void handleDelete(x as Tache)}
                />
              ))}
            </>
          )}
        </div>
      )}

      <TacheForm
        open={formOpen}
        onOpenChange={setFormOpen}
        tache={editing}
        fixedContactId={contactId}
        onSuccess={() => void load()}
      />
    </div>
  );
}
