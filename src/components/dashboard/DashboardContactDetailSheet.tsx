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
import { List, Pin } from "lucide-react";
import { toast } from "sonner";
import { STACKED_CONTACT_SHEET_Z } from "@/lib/ui/stacked-sheet-layers";
import { PortalLayerProvider } from "@/lib/ui/portal-layer-context";
import { preventStackedSheetOutsideDismiss } from "@/lib/ui/radix-outside-interaction";

interface DashboardContactDetailSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  contact: Contact | null;
  onContactRefreshed?: (contact: Contact) => void;
  onNavigate?: (page: string) => void;
  onUpdate?: () => void;
  /** Pas de 2ᵉ overlay — la liste KPI garde le fond sombre unique. */
  hideOverlay?: boolean;
  /** Ferme la fiche et réaffiche la liste (volet liste reste ouvert). */
  onBackToList?: () => void;
  /** Affiche le bouton « Épingler » (liste + fiche côte à côte). */
  onPin?: () => void;
}

function contactDisplayName(contact: Contact): string {
  return [contact.prenom, contact.nom].filter(Boolean).join(" ") || "Contact";
}

export function DashboardContactDetailSheet({
  open,
  onOpenChange,
  contact,
  onContactRefreshed,
  onNavigate,
  onUpdate,
  hideOverlay = false,
  onBackToList,
  onPin,
}: DashboardContactDetailSheetProps) {
  if (!contact) return null;

  const label = contactDisplayName(contact);

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
    <Sheet open={open} onOpenChange={onOpenChange} modal={!hideOverlay && !onPin}>
      <SheetContent
        side="right"
        hideOverlay={hideOverlay}
        className={`${STACKED_CONTACT_SHEET_Z} flex h-svh max-h-svh min-h-0 w-full flex-col gap-0 overflow-hidden p-0 sm:max-w-2xl lg:max-w-3xl [&>button.absolute]:hidden`}
        onInteractOutside={hideOverlay ? preventStackedSheetOutsideDismiss : undefined}
        onPointerDownOutside={hideOverlay ? preventStackedSheetOutsideDismiss : undefined}
      >
        <SheetHeader className="sr-only">
          <SheetTitle>Fiche contact — {label}</SheetTitle>
          <SheetDescription>Consultation et modification du contact</SheetDescription>
        </SheetHeader>
        <PortalLayerProvider layer="stacked">
          <div className="flex min-h-0 flex-1 flex-col overflow-hidden px-4 pb-2 pt-4">
            {onPin ? (
              <div className="mb-2 flex shrink-0 justify-end">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="gap-1.5"
                  onClick={onPin}
                  title="Épingler la fiche à droite de la liste"
                >
                  <Pin className="h-4 w-4" aria-hidden />
                  Épingler
                </Button>
              </div>
            ) : null}
            <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
              <ContactDetail
              key={contact.id}
              embedded
              open
              contact={contact}
              nestedInvestissementSheet
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
          </div>
        </PortalLayerProvider>
        {onBackToList ? (
          <div className="shrink-0 border-t bg-background px-4 py-3">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="w-full gap-1.5 text-muted-foreground"
              onClick={() => onBackToList()}
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
