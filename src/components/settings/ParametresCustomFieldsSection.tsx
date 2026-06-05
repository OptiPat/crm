import { useCallback, useEffect, useState } from "react";
import { SettingsPanel } from "@/components/settings/parametres-ui";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
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
import { CustomFieldDefDialog } from "@/components/settings/CustomFieldDefDialog";
import {
  getCustomFieldDefs,
  deleteCustomFieldDef,
  CUSTOM_FIELD_TYPE_LABELS,
  type CustomFieldDef,
} from "@/lib/api/tauri-custom-fields";
import { notifyCustomFieldsChanged } from "@/lib/custom-fields/custom-field-events";
import { Plus, Pencil, Trash2, ListPlus } from "lucide-react";
import { toast } from "sonner";

export function ParametresCustomFieldsSection() {
  const [defs, setDefs] = useState<CustomFieldDef[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<CustomFieldDef | null>(null);
  const [toDelete, setToDelete] = useState<CustomFieldDef | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    getCustomFieldDefs("contact")
      .then(setDefs)
      .catch((error) => {
        console.error("Erreur chargement champs personnalisés:", error);
        toast.error("Impossible de charger les champs");
      })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const handleSuccess = () => {
    load();
    notifyCustomFieldsChanged();
  };

  const handleDelete = async () => {
    if (!toDelete) return;
    try {
      await deleteCustomFieldDef(toDelete.id);
      toast.success("Champ supprimé");
      handleSuccess();
    } catch (error) {
      console.error("Erreur suppression champ:", error);
      toast.error("Erreur lors de la suppression");
    } finally {
      setToDelete(null);
    }
  };

  return (
    <SettingsPanel
      title="Champs personnalisés"
      description="Ajoutez vos propres champs aux fiches contact (numéro client, RIB, centres d'intérêt…)."
      action={
        <Button
          size="sm"
          onClick={() => {
            setEditing(null);
            setDialogOpen(true);
          }}
        >
          <Plus className="h-4 w-4 mr-1.5" />
          Ajouter
        </Button>
      }
    >
      {loading ? (
        <p className="text-sm text-muted-foreground py-8 text-center">Chargement…</p>
      ) : defs.length === 0 ? (
        <div className="flex flex-col items-center gap-3 py-10 text-center text-muted-foreground border border-dashed rounded-lg">
          <ListPlus className="h-8 w-8 opacity-50" />
          <p className="text-sm">
            Aucun champ personnalisé. Ajoutez-en un pour enrichir vos fiches contact.
          </p>
        </div>
      ) : (
        <ul className="divide-y rounded-lg border">
          {defs.map((def) => (
            <li key={def.id} className="flex items-center gap-3 px-4 py-3">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="font-medium truncate">{def.label}</span>
                  {!def.actif && (
                    <Badge variant="secondary" className="font-normal text-[11px]">
                      Inactif
                    </Badge>
                  )}
                </div>
                <p className="text-xs text-muted-foreground">
                  {CUSTOM_FIELD_TYPE_LABELS[def.field_type]} · clé {def.field_key}
                </p>
              </div>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                onClick={() => {
                  setEditing(def);
                  setDialogOpen(true);
                }}
                title="Modifier"
              >
                <Pencil className="h-4 w-4" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 text-destructive hover:text-destructive"
                onClick={() => setToDelete(def)}
                title="Supprimer"
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </li>
          ))}
        </ul>
      )}

      <CustomFieldDefDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        field={editing}
        onSuccess={handleSuccess}
      />

      <AlertDialog open={!!toDelete} onOpenChange={(o) => !o && setToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Supprimer ce champ ?</AlertDialogTitle>
            <AlertDialogDescription>
              Le champ « {toDelete?.label} » et toutes les valeurs saisies sur les fiches
              seront définitivement supprimés.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuler</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                void handleDelete();
              }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Supprimer
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </SettingsPanel>
  );
}
