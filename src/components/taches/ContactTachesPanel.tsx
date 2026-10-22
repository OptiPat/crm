import { useCallback, useEffect, useState } from "react";
import { Plus, ListTodo } from "lucide-react";
import { Button } from "@/components/ui/button";
import { TacheForm } from "@/components/taches/TacheForm";
import { TacheItem } from "@/components/taches/TacheItem";
import { getTachesByContact, deleteTache, type Tache } from "@/lib/api/tauri-taches";
import { subscribeTachesChanged } from "@/lib/taches/tache-events";
import { useArbitrageTacheDone } from "@/hooks/useArbitrageTacheDone";
import { toast } from "sonner";
import { userErrorMessage } from "@/lib/api/invoke-error";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

interface ContactTachesPanelProps {
  contactId: number;
  nestedSheet?: boolean;
  onNestedFormOpenChange?: (open: boolean) => void;
}

export function ContactTachesPanel({
  contactId,
  nestedSheet = false,
  onNestedFormOpenChange,
}: ContactTachesPanelProps) {
  const [taches, setTaches] = useState<Tache[]>([]);
  const [loading, setLoading] = useState(true);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Tache | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Tache | null>(null);

  useEffect(() => {
    onNestedFormOpenChange?.(formOpen);
  }, [formOpen, onNestedFormOpenChange]);

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

  const { tryComplete, dialog: arbitrageDialog } = useArbitrageTacheDone(() => void load());

  const handleToggle = (tache: Tache) => {
    void tryComplete(tache);
  };

  const handleDelete = (tache: Tache) => {
    setDeleteTarget(tache);
  };

  const confirmDelete = async () => {
    const tache = deleteTarget;
    setDeleteTarget(null);
    if (!tache) return;
    try {
      await deleteTache(tache.id);
      toast.success("Tâche supprimée");
    } catch (error) {
      console.error("Erreur suppression tâche:", error);
      toast.error(userErrorMessage(error, "Impossible de supprimer la tâche."));
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
              onDelete={(x) => handleDelete(x as Tache)}
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
                  onDelete={(x) => handleDelete(x as Tache)}
                />
              ))}
            </>
          )}
        </div>
      )}

      {arbitrageDialog}

      <AlertDialog
        open={deleteTarget != null}
        onOpenChange={(next) => {
          if (!next) setDeleteTarget(null);
        }}
      >
        <AlertDialogContent stacked={nestedSheet}>
          <AlertDialogHeader>
            <AlertDialogTitle>Supprimer cette tâche ?</AlertDialogTitle>
            <AlertDialogDescription>
              La tâche <strong>« {deleteTarget?.titre?.trim() || "sans titre"} »</strong> sera
              définitivement supprimée.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuler</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => void confirmDelete()}
            >
              Supprimer
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>


      <TacheForm
        open={formOpen}
        onOpenChange={setFormOpen}
        tache={editing}
        fixedContactId={contactId}
        onSuccess={() => void load()}
        nestedSheet={nestedSheet}
      />
    </div>
  );
}
