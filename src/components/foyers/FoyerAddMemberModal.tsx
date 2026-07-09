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
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { UserPlus } from "lucide-react";
import { type Contact, getAllContacts } from "@/lib/api/tauri-contacts";
import type { Foyer } from "@/lib/api/tauri-foyers";
import { linkContactToFoyer } from "@/lib/foyers/foyer-utils";
import { ListSearchField } from "@/components/layout/ListSearchField";
import { contactMatchesSearch } from "@/lib/search-utils";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { STACKED_NESTED_SHEET_Z } from "@/lib/ui/stacked-sheet-layers";
import { PortalLayerProvider } from "@/lib/ui/portal-layer-context";

interface FoyerAddMemberModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  foyer: Foyer;
  currentContact: Contact;
  existingMemberIds: number[];
  onSuccess: () => void;
  nestedSheet?: boolean;
}

export function FoyerAddMemberModal({
  open,
  onOpenChange,
  foyer,
  currentContact,
  existingMemberIds,
  onSuccess,
  nestedSheet = false,
}: FoyerAddMemberModalProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [candidates, setCandidates] = useState<Contact[]>([]);
  const [selectedRole, setSelectedRole] = useState("DECLARANT_2");
  const [linkingId, setLinkingId] = useState<number | null>(null);
  const [addedCount, setAddedCount] = useState(0);

  const memberIds = new Set([
    currentContact.id,
    ...existingMemberIds,
  ]);

  useEffect(() => {
    if (!open) return;
    setSearchQuery("");
    setSelectedRole("DECLARANT_2");
    setAddedCount(0);
    void (async () => {
      try {
        const all = await getAllContacts();
        setCandidates(
          all.filter((c) => c.id && !memberIds.has(c.id) && !c.foyer_id)
        );
      } catch (error) {
        console.error("Erreur chargement contacts:", error);
        toast.error("Impossible de charger les contacts");
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- recharge à l'ouverture ; dépend du contenu (join) des membres, pas de l'identité du Set
  }, [open, currentContact.id, existingMemberIds.join(",")]);

  const filtered = candidates.filter((c) => contactMatchesSearch(searchQuery, c));

  const handleAdd = async (contact: Contact) => {
    if (!contact.id || linkingId != null) return;

    if (contact.foyer_id && contact.foyer_id !== foyer.id) {
      toast.error(
        `${contact.prenom} ${contact.nom} appartient déjà à un autre foyer`
      );
      return;
    }

    setLinkingId(contact.id);
    try {
      await linkContactToFoyer(contact, foyer.id, selectedRole);
      setCandidates((prev) => prev.filter((c) => c.id !== contact.id));
      setAddedCount((n) => n + 1);
      toast.success(`${contact.prenom} ${contact.nom} ajouté au foyer`);
      onSuccess();
    } catch (error) {
      console.error("Erreur ajout membre foyer:", error);
      toast.error("Erreur lors de l'ajout au foyer");
    } finally {
      setLinkingId(null);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange} modal={!nestedSheet}>
      <DialogContent
        hideOverlay={nestedSheet}
        className={cn(
          "max-w-lg max-h-[85vh] flex flex-col",
          nestedSheet && STACKED_NESTED_SHEET_Z
        )}
      >
        <PortalLayerProvider layer={nestedSheet ? "nested" : "default"}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <UserPlus className="h-5 w-5" />
            Ajouter un membre au foyer
          </DialogTitle>
          <DialogDescription>
            Rattacher un contact à <strong>{foyer.nom}</strong>. La fenêtre reste
            ouverte pour en ajouter plusieurs.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 shrink-0">
          <div className="space-y-2">
            <Label>Rôle par défaut des nouveaux membres</Label>
            <Select value={selectedRole} onValueChange={setSelectedRole}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="DECLARANT_1">Déclarant 1</SelectItem>
                <SelectItem value="DECLARANT_2">Déclarant 2</SelectItem>
                <SelectItem value="ENFANT">Enfant</SelectItem>
                <SelectItem value="AUTRE">Autre membre</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <ListSearchField
            value={searchQuery}
            onChange={setSearchQuery}
            placeholder="Nom, prénom, email…"
            className="w-full"
          />
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto space-y-2 py-1">
          {filtered.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">
              {searchQuery
                ? "Aucun contact sans foyer ne correspond"
                : candidates.length === 0
                  ? "Tous les contacts éligibles sont déjà dans un foyer"
                  : "Saisissez un nom pour rechercher"}
            </p>
          ) : (
            filtered.map((contact) => (
              <div
                key={contact.id}
                className="flex items-start justify-between gap-3 p-3 border rounded-lg hover:bg-accent/40"
              >
                <div className="min-w-0">
                  <p className="font-medium">
                    {contact.prenom} {contact.nom}
                  </p>
                  {contact.email && (
                    <p className="text-sm text-muted-foreground truncate">
                      {contact.email}
                    </p>
                  )}
                  {contact.categorie && contact.categorie !== "AUCUN" && (
                    <Badge variant="outline" className="text-[10px] mt-1.5">
                      {contact.categorie}
                    </Badge>
                  )}
                </div>
                <Button
                  type="button"
                  size="sm"
                  className="shrink-0 gap-1"
                  disabled={linkingId != null}
                  onClick={() => void handleAdd(contact)}
                >
                  <UserPlus className="h-3.5 w-3.5" />
                  {linkingId === contact.id ? "…" : "Ajouter"}
                </Button>
              </div>
            ))
          )}
        </div>

        <DialogFooter className="shrink-0 sm:justify-between">
          {addedCount > 0 ? (
            <p className="text-xs text-muted-foreground sm:mr-auto">
              {addedCount} membre{addedCount > 1 ? "s" : ""} ajouté
              {addedCount > 1 ? "s" : ""}
            </p>
          ) : (
            <span />
          )}
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={linkingId != null}
          >
            Fermer
          </Button>
        </DialogFooter>
        </PortalLayerProvider>
      </DialogContent>
    </Dialog>
  );
}
