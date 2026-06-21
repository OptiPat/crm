import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Users } from "lucide-react";
import { type Contact, getAllContacts } from "@/lib/api/tauri-contacts";
import { createFamilleWithMembers } from "@/lib/familles/famille-members";
import { ListSearchField } from "@/components/layout/ListSearchField";
import { contactMatchesSearch } from "@/lib/search-utils";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";

interface FamilleCreateModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: (familleId: number) => void;
}

export function FamilleCreateModal({
  open,
  onOpenChange,
  onSuccess,
}: FamilleCreateModalProps) {
  const [nom, setNom] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setNom("");
    setSearchQuery("");
    setSelectedIds(new Set());
    void (async () => {
      try {
        const all = await getAllContacts();
        setContacts(all.filter((c) => c.id && c.famille_id == null));
      } catch (error) {
        console.error("Erreur chargement contacts:", error);
        toast.error("Impossible de charger les contacts");
      }
    })();
  }, [open]);

  const filtered = useMemo(
    () => contacts.filter((c) => contactMatchesSearch(searchQuery, c)),
    [contacts, searchQuery]
  );

  const toggleMember = (id: number) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleCreate = async () => {
    const trimmedNom = nom.trim();
    if (!trimmedNom) {
      toast.error("Indiquez un nom de famille");
      return;
    }
    if (selectedIds.size < 2) {
      toast.error("Sélectionnez au moins 2 membres");
      return;
    }

    setSaving(true);
    try {
      const byId = new Map(contacts.map((c) => [c.id!, c]));
      const familleId = await createFamilleWithMembers(trimmedNom, [...selectedIds], byId);
      toast.success(`Famille « ${trimmedNom} » créée`);
      onOpenChange(false);
      onSuccess(familleId);
    } catch (error) {
      console.error("Erreur création famille:", error);
      toast.error("Impossible de créer la famille");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Users className="h-5 w-5" />
            Créer une famille
          </DialogTitle>
          <DialogDescription>
            Choisissez les membres à regrouper (ex. frère et sœur, sans la mère).
            Les homonymes non sélectionnés ne seront pas inclus.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 shrink-0">
          <div className="space-y-2">
            <Label htmlFor="famille-nom">Nom de la famille</Label>
            <Input
              id="famille-nom"
              value={nom}
              onChange={(e) => setNom(e.target.value)}
              placeholder="Ex. Dupont"
            />
          </div>
          <ListSearchField
            value={searchQuery}
            onChange={setSearchQuery}
            placeholder="Rechercher un contact…"
            className="w-full"
          />
          <p className="text-xs text-muted-foreground">
            {selectedIds.size} membre{selectedIds.size > 1 ? "s" : ""} sélectionné
            {selectedIds.size > 1 ? "s" : ""} (minimum 2)
          </p>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto space-y-1 py-1">
          {filtered.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">
              {searchQuery
                ? "Aucun contact éligible ne correspond"
                : "Aucun contact sans famille manuelle"}
            </p>
          ) : (
            filtered.map((contact) => (
              <label
                key={contact.id}
                className="flex items-center gap-3 rounded-lg border border-border/60 px-3 py-2.5 cursor-pointer hover:bg-muted/40"
              >
                <Checkbox
                  checked={selectedIds.has(contact.id!)}
                  onCheckedChange={() => toggleMember(contact.id!)}
                />
                <span className="text-sm font-medium">
                  {contact.prenom} {contact.nom}
                </span>
              </label>
            ))
          )}
        </div>

        <DialogFooter className="shrink-0">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Annuler
          </Button>
          <Button onClick={() => void handleCreate()} disabled={saving}>
            Créer
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
