import { useCallback, useEffect, useMemo, useState } from "react";
import { Plus, ListTodo } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { TacheForm } from "@/components/taches/TacheForm";
import { TacheItem } from "@/components/taches/TacheItem";
import {
  getAllTaches,
  setTacheStatut,
  deleteTache,
  type TacheWithContact,
} from "@/lib/api/tauri-taches";
import { subscribeTachesChanged } from "@/lib/taches/tache-events";
import { requestOpenContact } from "@/lib/navigation/app-navigation";
import { toast } from "sonner";

type StatutFilter = "ACTIVES" | "FAITES" | "TOUTES";

interface TachesProps {
  onNavigate?: (page: string) => void;
}

export function Taches({ onNavigate }: TachesProps) {
  const [taches, setTaches] = useState<TacheWithContact[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<StatutFilter>("ACTIVES");
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<TacheWithContact | null>(null);

  const load = useCallback(async () => {
    try {
      setTaches(await getAllTaches());
    } catch (error) {
      console.error("Erreur chargement tâches:", error);
      toast.error("Impossible de charger les tâches");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
    return subscribeTachesChanged(() => void load());
  }, [load]);

  const filtered = useMemo(() => {
    if (filter === "ACTIVES") return taches.filter((t) => t.statut !== "FAIT");
    if (filter === "FAITES") return taches.filter((t) => t.statut === "FAIT");
    return taches;
  }, [taches, filter]);

  const activesCount = useMemo(
    () => taches.filter((t) => t.statut !== "FAIT").length,
    [taches]
  );

  const handleToggle = async (tache: TacheWithContact) => {
    try {
      await setTacheStatut(tache.id, tache.statut === "FAIT" ? "A_FAIRE" : "FAIT");
    } catch (error) {
      toast.error(`Erreur : ${String(error)}`);
    }
  };

  const handleDelete = async (tache: TacheWithContact) => {
    if (!window.confirm(`Supprimer la tâche « ${tache.titre} » ?`)) return;
    try {
      await deleteTache(tache.id);
    } catch (error) {
      toast.error(`Erreur : ${String(error)}`);
    }
  };

  const openContact = (contactId: number) => {
    requestOpenContact(contactId, {
      currentPage: "taches",
      setCurrentPage: onNavigate,
    });
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-serif font-bold text-primary">
            <ListTodo className="h-6 w-6" />
            Tâches & rappels
          </h1>
          <p className="text-sm text-muted-foreground">
            {activesCount} tâche{activesCount !== 1 ? "s" : ""} à faire
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Select value={filter} onValueChange={(v) => setFilter(v as StatutFilter)}>
            <SelectTrigger className="w-[160px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ACTIVES">À faire</SelectItem>
              <SelectItem value="FAITES">Faites</SelectItem>
              <SelectItem value="TOUTES">Toutes</SelectItem>
            </SelectContent>
          </Select>
          <Button
            type="button"
            onClick={() => {
              setEditing(null);
              setFormOpen(true);
            }}
          >
            <Plus className="h-4 w-4 mr-1" />
            Nouvelle tâche
          </Button>
        </div>
      </div>

      {loading ? (
        <p className="text-sm text-muted-foreground">Chargement…</p>
      ) : filtered.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border p-10 text-center">
          <ListTodo className="mx-auto h-8 w-8 text-muted-foreground" />
          <p className="mt-2 text-sm text-muted-foreground">
            {filter === "ACTIVES"
              ? "Aucune tâche à faire. Tout est à jour."
              : "Aucune tâche."}
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map((t) => (
            <TacheItem
              key={t.id}
              tache={t}
              showContact
              onToggle={(x) => void handleToggle(x as TacheWithContact)}
              onEdit={(x) => {
                setEditing(x as TacheWithContact);
                setFormOpen(true);
              }}
              onDelete={(x) => void handleDelete(x as TacheWithContact)}
              onOpenContact={openContact}
            />
          ))}
        </div>
      )}

      <TacheForm
        open={formOpen}
        onOpenChange={setFormOpen}
        tache={editing}
        onSuccess={() => void load()}
      />
    </div>
  );
}
