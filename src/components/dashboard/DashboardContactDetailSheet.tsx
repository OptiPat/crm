import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { ContactDetail } from "@/components/contacts/ContactDetail";
import { deleteContact, type Contact } from "@/lib/api/tauri-contacts";
import { ChevronLeft, ChevronRight, List } from "lucide-react";
import { toast } from "sonner";

interface DashboardContactDetailSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  contact: Contact | null;
  contactIds?: number[];
  onSelectContactId?: (contactId: number) => void;
  onContactRefreshed?: (contact: Contact) => void;
  onNavigate?: (page: string) => void;
  onUpdate?: () => void;
}

function contactDisplayName(contact: Contact): string {
  return [contact.prenom, contact.nom].filter(Boolean).join(" ") || "Contact";
}

export function DashboardContactDetailSheet({
  open,
  onOpenChange,
  contact,
  contactIds = [],
  onSelectContactId,
  onContactRefreshed,
  onNavigate,
  onUpdate,
}: DashboardContactDetailSheetProps) {
  if (!contact) return null;

  const label = contactDisplayName(contact);
  const currentIndex =
    contact.id != null ? contactIds.findIndex((id) => id === contact.id) : -1;
  const showListNav = contactIds.length > 1 && currentIndex >= 0;

  const handleDelete = async (id: number) => {
    try {
      await deleteContact(id);
      onOpenChange(false);
      onUpdate?.();
      toast.success("Contact supprimé");
    } catch (error) {
      console.error("Erreur suppression contact:", error);
      toast.error("Impossible de supprimer le contact");
    }
  };

  const handleNavigate = (page: string) => {
    onOpenChange(false);
    onNavigate?.(page);
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="flex w-full flex-col gap-0 overflow-hidden p-0 sm:max-w-2xl lg:max-w-3xl [&>button.absolute]:hidden"
      >
        <SheetHeader className="sr-only">
          <SheetTitle>Fiche contact — {label}</SheetTitle>
          <SheetDescription>Consultation et modification du contact</SheetDescription>
        </SheetHeader>
        <div className="flex min-h-0 flex-1 flex-col p-4 pb-2">
          <ContactDetail
            key={contact.id}
            embedded
            open
            contact={contact}
            onOpenChange={onOpenChange}
            onDelete={handleDelete}
            onUpdate={onUpdate}
            onContactRefreshed={onContactRefreshed}
            onNavigate={handleNavigate}
            onOpenContact={(linked) => {
              if (linked.id) onContactRefreshed?.(linked);
            }}
          />
        </div>
        {showListNav ? (
          <div className="shrink-0 border-t bg-background px-4 py-3 space-y-2">
            <div className="flex items-center justify-between gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="gap-1"
                disabled={currentIndex <= 0}
                onClick={() => onSelectContactId?.(contactIds[currentIndex - 1]!)}
              >
                <ChevronLeft className="h-4 w-4" aria-hidden />
                Précédent
              </Button>
              <span className="text-xs text-muted-foreground tabular-nums">
                {currentIndex + 1} / {contactIds.length}
              </span>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="gap-1"
                disabled={currentIndex >= contactIds.length - 1}
                onClick={() => onSelectContactId?.(contactIds[currentIndex + 1]!)}
              >
                Suivant
                <ChevronRight className="h-4 w-4" aria-hidden />
              </Button>
            </div>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="w-full gap-1.5 text-muted-foreground"
              onClick={() => onOpenChange(false)}
            >
              <List className="h-4 w-4" aria-hidden />
              Retour à la liste
            </Button>
          </div>
        ) : null}
      </SheetContent>
    </Sheet>
  );
}
