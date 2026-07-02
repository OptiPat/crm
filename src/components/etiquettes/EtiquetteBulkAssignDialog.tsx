import { useCallback, useEffect, useMemo, useState } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ContactMultiSelect } from "@/components/contacts/ContactMultiSelect";
import { getAllContacts, type Contact } from "@/lib/api/tauri-contacts";
import { attribuerEtiquetteBulk } from "@/lib/api/tauri-etiquettes";
import {
  bulkAssignResultMessage,
  filterContactsForBulkAssign,
} from "@/lib/etiquettes/etiquette-bulk-assign";
import { notifyEtiquettesChanged } from "@/lib/etiquettes/etiquette-events";

interface EtiquetteBulkAssignDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  etiquetteId: number;
  etiquetteNom: string;
  /** Contacts déjà porteurs de l'étiquette (ids). */
  alreadyTaggedIds: number[];
  onAssigned?: () => void;
}

export function EtiquetteBulkAssignDialog({
  open,
  onOpenChange,
  etiquetteId,
  etiquetteNom,
  alreadyTaggedIds,
  onAssigned,
}: EtiquetteBulkAssignDialogProps) {
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [selectedIds, setSelectedIds] = useState<number[]>([]);

  const taggedSet = useMemo(() => new Set(alreadyTaggedIds), [alreadyTaggedIds]);

  const assignableContacts = useMemo(
    () => filterContactsForBulkAssign(contacts, taggedSet),
    [contacts, taggedSet]
  );

  const loadContacts = useCallback(async () => {
    setLoading(true);
    try {
      const rows = await getAllContacts();
      setContacts(rows.filter((c) => c.id != null));
    } catch {
      toast.error("Impossible de charger les contacts");
      setContacts([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!open) {
      setSelectedIds([]);
      return;
    }
    void loadContacts();
  }, [open, loadContacts]);

  const handleAssign = async () => {
    if (selectedIds.length === 0) {
      toast.error("Sélectionnez au moins un contact.");
      return;
    }
    setSaving(true);
    try {
      const result = await attribuerEtiquetteBulk(selectedIds, etiquetteId);
      notifyEtiquettesChanged();
      toast.success(bulkAssignResultMessage(result.assigned, result.skipped));
      onAssigned?.();
      onOpenChange(false);
    } catch (error) {
      toast.error(`Attribution impossible : ${String(error)}`);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Ajouter des contacts</DialogTitle>
          <DialogDescription>
            Taguer plusieurs contacts sur « {etiquetteNom} » en une fois (attribution manuelle).
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <p className="text-sm text-muted-foreground flex items-center gap-2 py-6 justify-center">
            <Loader2 className="h-4 w-4 animate-spin" />
            Chargement des contacts…
          </p>
        ) : contacts.length === 0 ? (
          <p className="text-sm text-muted-foreground py-4">
            Aucun contact dans le CRM.
          </p>
        ) : assignableContacts.length === 0 ? (
          <p className="text-sm text-muted-foreground py-4">
            Tous vos contacts portent déjà cette étiquette.
          </p>
        ) : (
          <ContactMultiSelect
            label="Contacts à taguer"
            hint={`${assignableContacts.length} contact${assignableContacts.length > 1 ? "s" : ""} disponible${assignableContacts.length > 1 ? "s" : ""}`}
            placeholder="Rechercher et sélectionner…"
            contacts={assignableContacts}
            value={selectedIds}
            onChange={setSelectedIds}
          />
        )}

        <DialogFooter className="gap-2 sm:gap-0">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Annuler
          </Button>
          <Button
            type="button"
            disabled={loading || saving || selectedIds.length === 0}
            onClick={() => void handleAssign()}
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Taguer"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
