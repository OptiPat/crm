import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { UserPlus } from "lucide-react";
import { type Contact, getAllContacts } from "@/lib/api/tauri-contacts";
import type { FamilleGroup } from "@/lib/familles/famille-types";
import { addContactToFamille } from "@/lib/familles/famille-members";
import { ListSearchField } from "@/components/layout/ListSearchField";
import { contactMatchesSearch } from "@/lib/search-utils";
import { toast } from "sonner";

interface FamilleAddMemberModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  famille: FamilleGroup;
  existingMemberIds: number[];
  onSuccess: () => void;
}

export function FamilleAddMemberModal({
  open,
  onOpenChange,
  famille,
  existingMemberIds,
  onSuccess,
}: FamilleAddMemberModalProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [candidates, setCandidates] = useState<Contact[]>([]);
  const [linkingId, setLinkingId] = useState<number | null>(null);

  const memberIds = new Set(existingMemberIds);

  useEffect(() => {
    if (!open) return;
    setSearchQuery("");
    void (async () => {
      try {
        const all = await getAllContacts();
        setCandidates(
          all.filter(
            (c) =>
              c.id &&
              !memberIds.has(c.id) &&
              c.famille_id == null &&
              !c.famille_regroupement_exclu
          )
        );
      } catch (error) {
        console.error("Erreur chargement contacts:", error);
        toast.error("Impossible de charger les contacts");
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- recharge à l'ouverture
  }, [open, existingMemberIds.join(",")]);

  const filtered = candidates.filter((c) => contactMatchesSearch(searchQuery, c));

  const handleAdd = async (contact: Contact) => {
    if (!contact.id || linkingId != null || !famille.familleId) return;

    setLinkingId(contact.id);
    try {
      await addContactToFamille(contact, famille.familleId);
      setCandidates((prev) => prev.filter((c) => c.id !== contact.id));
      toast.success(`${contact.prenom} ${contact.nom} ajouté à la famille`);
      onSuccess();
    } catch (error) {
      console.error("Erreur ajout membre famille:", error);
      toast.error("Erreur lors de l'ajout");
    } finally {
      setLinkingId(null);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <UserPlus className="h-5 w-5" />
            Ajouter un membre
          </DialogTitle>
          <DialogDescription>
            Rattacher un contact à la famille <strong>{famille.nom}</strong>.
          </DialogDescription>
        </DialogHeader>

        <ListSearchField
          value={searchQuery}
          onChange={setSearchQuery}
          placeholder="Nom, prénom, email…"
          className="w-full shrink-0"
        />

        <div className="min-h-0 flex-1 overflow-y-auto space-y-2 py-1">
          {filtered.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">
              {searchQuery
                ? "Aucun contact ne correspond"
                : "Tous les contacts éligibles sont déjà dans une famille"}
            </p>
          ) : (
            filtered.map((contact) => (
              <div
                key={contact.id}
                className="flex items-center justify-between gap-2 rounded-lg border border-border/60 px-3 py-2"
              >
                <span className="text-sm font-medium">
                  {contact.prenom} {contact.nom}
                </span>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={linkingId != null}
                  onClick={() => void handleAdd(contact)}
                >
                  Ajouter
                </Button>
              </div>
            ))
          )}
        </div>

        <DialogFooter className="shrink-0">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Fermer
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
