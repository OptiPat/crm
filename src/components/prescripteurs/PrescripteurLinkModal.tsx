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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Search, UserPlus } from "lucide-react";
import {
  type Contact,
  getAllContacts,
  updateContact,
} from "@/lib/api/tauri-contacts";
import { contactToUpdatePayload } from "@/lib/contacts/contact-form-utils";
import { contactMatchesSearch } from "@/lib/search-utils";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";

interface PrescripteurLinkModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  prescripteur: Contact;
  onSuccess: () => void;
}

export function PrescripteurLinkModal({
  open,
  onOpenChange,
  prescripteur,
  onSuccess,
}: PrescripteurLinkModalProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [linkingId, setLinkingId] = useState<number | null>(null);
  const [linkedThisSession, setLinkedThisSession] = useState(0);

  const loadContacts = async () => {
    const all = await getAllContacts();
    setContacts(all.filter((c) => c.id !== prescripteur.id));
  };

  useEffect(() => {
    if (!open) return;
    setSearchQuery("");
    setLinkedThisSession(0);
    void loadContacts().catch((error) => {
      console.error("Erreur chargement contacts:", error);
      toast.error("Impossible de charger les contacts");
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- chargement à l'ouverture / changement de prescripteur
  }, [open, prescripteur.id]);

  const filteredContacts =
    searchQuery.trim().length >= 2
      ? contacts.filter((c) => contactMatchesSearch(searchQuery, c))
      : [];

  const handleLink = async (contact: Contact) => {
    if (contact.prescripteur_id === prescripteur.id) {
      toast.info("Ce contact est déjà recommandé par ce prescripteur");
      return;
    }

    if (contact.prescripteur_id && contact.prescripteur_id !== prescripteur.id) {
      const other = contacts.find((c) => c.id === contact.prescripteur_id);
      const otherName = other
        ? `${other.prenom} ${other.nom}`.trim()
        : "un autre prescripteur";
      if (
        !confirm(
          `${contact.prenom} ${contact.nom} est déjà lié à ${otherName}.\n\nRemplacer par ${prescripteur.prenom} ${prescripteur.nom} ?`
        )
      ) {
        return;
      }
    }

    setLinkingId(contact.id);
    try {
      const updated = await updateContact(
        contact.id,
        contactToUpdatePayload(contact, { prescripteur_id: prescripteur.id })
      );
      setContacts((prev) =>
        prev.map((c) => (c.id === updated.id ? updated : c))
      );
      setLinkedThisSession((n) => n + 1);
      toast.success(
        `${contact.prenom} ${contact.nom} lié — vous pouvez en ajouter d'autres`
      );
      onSuccess();
    } catch (error) {
      console.error("Erreur liaison prescripteur:", error);
      toast.error("Erreur lors du rattachement au prescripteur");
    } finally {
      setLinkingId(null);
    }
  };

  const prescripteurLabel = `${prescripteur.prenom} ${prescripteur.nom}`.trim();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Lier un contact existant</DialogTitle>
          <DialogDescription>
            Ces contacts seront recommandés par <strong>{prescripteurLabel}</strong> et
            apparaîtront sous sa branche dans l&apos;arbre. Liez-en plusieurs si besoin,
            puis Fermer.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2 shrink-0">
          <Label htmlFor="prescripteur-link-search">Recherche</Label>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              id="prescripteur-link-search"
              placeholder="Nom, prénom, email…"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9"
            />
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto space-y-2 py-1">
          {filteredContacts.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">
              {searchQuery.trim().length < 2
                ? "Saisissez au moins 2 caractères pour rechercher"
                : "Aucun contact trouvé"}
            </p>
          ) : (
            filteredContacts.map((contact) => {
              const alreadyLinked = contact.prescripteur_id === prescripteur.id;
              const currentPrescripteur = contact.prescripteur_id
                ? contacts.find((c) => c.id === contact.prescripteur_id)
                : null;

              return (
                <div
                  key={contact.id}
                  className="flex items-start justify-between gap-3 p-3 border rounded-lg hover:bg-accent/40 transition-colors"
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
                    <div className="flex flex-wrap gap-1.5 mt-1.5">
                      {contact.categorie && contact.categorie !== "AUCUN" && (
                        <Badge variant="outline" className="text-[10px]">
                          {contact.categorie}
                        </Badge>
                      )}
                      {alreadyLinked ? (
                        <Badge className="text-[10px] bg-violet-50 text-violet-700 border-violet-200">
                          Déjà recommandé ici
                        </Badge>
                      ) : currentPrescripteur ? (
                        <Badge variant="secondary" className="text-[10px]">
                          Prescripteur : {currentPrescripteur.prenom}{" "}
                          {currentPrescripteur.nom}
                        </Badge>
                      ) : null}
                    </div>
                  </div>
                  <Button
                    type="button"
                    size="sm"
                    variant={alreadyLinked ? "outline" : "default"}
                    className="shrink-0 gap-1"
                    disabled={linkingId != null || alreadyLinked}
                    onClick={() => void handleLink(contact)}
                  >
                    <UserPlus className="h-3.5 w-3.5" />
                    {linkingId === contact.id
                      ? "…"
                      : alreadyLinked
                        ? "Lié"
                        : "Lier"}
                  </Button>
                </div>
              );
            })
          )}
        </div>

        <DialogFooter className="shrink-0 sm:justify-between">
          {linkedThisSession > 0 ? (
            <p className="text-xs text-muted-foreground sm:mr-auto">
              {linkedThisSession} contact{linkedThisSession > 1 ? "s" : ""} lié
              {linkedThisSession > 1 ? "s" : ""} cette session
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
      </DialogContent>
    </Dialog>
  );
}
