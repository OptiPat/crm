import { useEffect, useState, useCallback } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  getAllEtiquettes,
  getEtiquettesByContact,
  attribuerEtiquette,
  retirerEtiquette,
  getContrastColor,
  type Etiquette,
} from "@/lib/api/tauri-etiquettes";
import { notifyEtiquettesChanged } from "@/lib/etiquettes/etiquette-events";
import { cn } from "@/lib/utils";
import { Check } from "lucide-react";
import { toast } from "sonner";

interface EtiquetteQuickPickDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  contactId: number;
  /** Appelé après chaque modification d'étiquette. */
  onChanged?: () => void;
}

/**
 * Pose / retire rapidement une étiquette sur un contact (clic = bascule).
 * Réutilisable hors de la fiche contact (ex. enchaînement depuis une tâche).
 */
export function EtiquetteQuickPickDialog({
  open,
  onOpenChange,
  contactId,
  onChanged,
}: EtiquetteQuickPickDialogProps) {
  const [etiquettes, setEtiquettes] = useState<Etiquette[]>([]);
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [busyId, setBusyId] = useState<number | null>(null);

  const load = useCallback(async () => {
    try {
      const [all, current] = await Promise.all([
        getAllEtiquettes(),
        getEtiquettesByContact(contactId),
      ]);
      setEtiquettes(all.filter((e) => e.actif !== false));
      setSelectedIds(current.map((c) => c.etiquette_id));
    } catch (error) {
      console.error("Erreur chargement étiquettes:", error);
    }
  }, [contactId]);

  useEffect(() => {
    if (open) void load();
  }, [open, load]);

  const toggle = async (etiquette: Etiquette) => {
    const isSelected = selectedIds.includes(etiquette.id);
    setBusyId(etiquette.id);
    try {
      if (isSelected) {
        await retirerEtiquette(contactId, etiquette.id);
      } else {
        await attribuerEtiquette(contactId, etiquette.id, "MANUEL");
        toast.success(`Étiquette « ${etiquette.nom} » posée`);
      }
      await load();
      notifyEtiquettesChanged();
      onChanged?.();
    } catch (error) {
      toast.error(`Erreur : ${String(error)}`);
    } finally {
      setBusyId(null);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Poser une étiquette</DialogTitle>
          <DialogDescription>
            Cliquez pour poser ou retirer une étiquette sur ce contact.
          </DialogDescription>
        </DialogHeader>

        {etiquettes.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">
            Aucune étiquette disponible.
          </p>
        ) : (
          <div className="flex max-h-72 flex-wrap gap-2 overflow-y-auto py-1">
            {etiquettes.map((etiquette) => {
              const isSelected = selectedIds.includes(etiquette.id);
              return (
                <button
                  key={etiquette.id}
                  type="button"
                  disabled={busyId === etiquette.id}
                  onClick={() => void toggle(etiquette)}
                  className={cn(
                    "inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-medium transition-opacity",
                    isSelected ? "opacity-100" : "opacity-50 hover:opacity-80"
                  )}
                  style={{
                    backgroundColor: etiquette.couleur,
                    color: getContrastColor(etiquette.couleur),
                  }}
                >
                  {isSelected && <Check className="h-3 w-3" />}
                  {etiquette.nom}
                </button>
              );
            })}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
