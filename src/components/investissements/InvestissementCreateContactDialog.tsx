import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ContactPersonSearch } from "@/components/contacts/ContactPersonSearch";
import { getAllContacts, type Contact } from "@/lib/api/tauri-contacts";

type InvestissementCreateContactDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (contactId: number) => void;
  onGoToContacts?: () => void;
};

export function InvestissementCreateContactDialog({
  open,
  onOpenChange,
  onConfirm,
  onGoToContacts,
}: InvestissementCreateContactDialogProps) {
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [contactId, setContactId] = useState<number | undefined>();
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open) {
      setContactId(undefined);
      return;
    }
    let cancelled = false;
    setLoading(true);
    void getAllContacts()
      .then((data) => {
        if (!cancelled) setContacts(data);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open]);

  const handleConfirm = () => {
    if (contactId == null) return;
    onConfirm(contactId);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Nouveau placement</DialogTitle>
          <DialogDescription>
            Choisissez le client concerné, puis saisissez le placement sur sa fiche
            patrimoine.
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <p className="text-sm text-muted-foreground py-4 text-center">
            Chargement des contacts…
          </p>
        ) : contacts.length === 0 ? (
          <div className="space-y-3 py-2 text-center">
            <p className="text-sm text-muted-foreground">
              Aucun contact enregistré. Créez d&apos;abord une fiche client.
            </p>
            {onGoToContacts && (
              <Button type="button" variant="outline" onClick={onGoToContacts}>
                Aller aux Contacts
              </Button>
            )}
          </div>
        ) : (
          <ContactPersonSearch
            label="Client"
            hint="Recherche par nom ou prénom"
            placeholder="Sélectionner un client…"
            contacts={contacts}
            value={contactId}
            onChange={setContactId}
          />
        )}

        <DialogFooter className="gap-2 sm:gap-0">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Annuler
          </Button>
          <Button
            type="button"
            disabled={contactId == null || loading}
            onClick={handleConfirm}
          >
            Continuer
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
