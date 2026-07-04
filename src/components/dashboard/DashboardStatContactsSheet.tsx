import { useEffect, useRef, useState } from "react";
import { ChevronRight } from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import type { DashboardStatContact } from "@/lib/api/tauri-dashboard";
import {
  CONTACT_DISPLAY_CATEGORY_LABELS,
  getDisplayCategorieBadgeClass,
} from "@/lib/contacts/contact-category-display";
import { getFilleulLabel } from "@/lib/contacts/contact-form-utils";
import { formatCalendarDateFr } from "@/lib/dates/calendar-date";
import type { DashboardDrillDownOpenContact } from "@/lib/dashboard/dashboard-drill-down";
import { cn } from "@/lib/utils";
import { ContactInitialsAvatar } from "./dashboard-ui";

interface DashboardStatContactsSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  loadContacts: () => Promise<DashboardStatContact[]>;
  refreshSignal?: number;
  activeContactId?: number | null;
  onOpenContact?: DashboardDrillDownOpenContact;
  /** Fiche contact ouverte — bloque la fermeture accidentelle du volet liste. */
  stackedContactOpen?: boolean;
}

function contactCategoryLabel(contact: DashboardStatContact): string {
  if (contact.filleul_categorie) {
    return getFilleulLabel(contact.filleul_categorie) ?? contact.filleul_categorie;
  }
  return (
    CONTACT_DISPLAY_CATEGORY_LABELS[
      contact.categorie as keyof typeof CONTACT_DISPLAY_CATEGORY_LABELS
    ] ?? contact.categorie
  );
}

function contactSubtitle(contact: DashboardStatContact): string | null {
  if (contact.date_r1) {
    return `R1 : ${formatCalendarDateFr(contact.date_r1)}`;
  }
  if (contact.date_invitation_filleul) {
    return `Invitation : ${formatCalendarDateFr(contact.date_invitation_filleul)}`;
  }
  return null;
}

export function DashboardStatContactsSheet({
  open,
  onOpenChange,
  title,
  description,
  loadContacts,
  refreshSignal,
  activeContactId,
  onOpenContact,
  stackedContactOpen = false,
}: DashboardStatContactsSheetProps) {
  const [contacts, setContacts] = useState<DashboardStatContact[]>([]);
  const [loading, setLoading] = useState(false);
  const loadSeqRef = useRef(0);

  useEffect(() => {
    if (!open) return;

    const seq = ++loadSeqRef.current;
    setLoading(true);

    void (async () => {
      try {
        const rows = await loadContacts();
        if (loadSeqRef.current !== seq) return;
        setContacts(rows);
      } catch (error) {
        if (loadSeqRef.current !== seq) return;
        console.error("Erreur chargement contacts dashboard:", error);
        setContacts([]);
      } finally {
        if (loadSeqRef.current === seq) {
          setLoading(false);
        }
      }
    })();

    return () => {
      loadSeqRef.current += 1;
    };
  }, [open, loadContacts, refreshSignal]);

  const handleOpenContact = (contactId: number) => {
    onOpenContact?.(contactId);
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange} modal={false}>
      <SheetContent
        side="right"
        hideOverlay
        className="z-50 flex h-svh max-h-svh min-h-0 flex-col gap-0 overflow-hidden p-0 sm:max-w-md"
        onInteractOutside={(event) => {
          if (stackedContactOpen) event.preventDefault();
        }}
        onEscapeKeyDown={(event) => {
          if (stackedContactOpen) event.preventDefault();
        }}
      >
        <SheetHeader className="shrink-0 space-y-1 px-6 pb-4 pt-6">
          <SheetTitle className="font-serif pr-8">{title}</SheetTitle>
          {description ? <SheetDescription>{description}</SheetDescription> : null}
        </SheetHeader>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-6 pb-6">
          {loading ? (
            <p className="text-sm text-muted-foreground py-8 text-center">Chargement…</p>
          ) : contacts.length === 0 ? (
            <p className="text-sm text-muted-foreground py-8 text-center">Aucun contact</p>
          ) : (
            <ul className="space-y-2">
              {contacts.map((contact) => {
                const subtitle = contactSubtitle(contact);
                const interactive = Boolean(onOpenContact);
                return (
                  <li key={contact.contact_id}>
                    <button
                      type="button"
                      className={cn(
                        "w-full flex items-center gap-3 rounded-lg border px-3 py-2.5 text-left transition-colors",
                        activeContactId === contact.contact_id
                          ? "border-primary/50 bg-primary/5"
                          : "border-border/60 bg-background",
                        interactive && "hover:bg-muted/40 cursor-pointer"
                      )}
                      onClick={() => handleOpenContact(contact.contact_id)}
                      disabled={!interactive}
                    >
                      <ContactInitialsAvatar
                        prenom={contact.prenom}
                        nom={contact.nom}
                        className="h-9 w-9 shrink-0"
                      />
                      <div className="min-w-0 flex-1">
                        <p className="font-medium truncate">
                          {[contact.prenom, contact.nom].filter(Boolean).join(" ")}
                        </p>
                        {subtitle ? (
                          <p className="text-xs text-muted-foreground truncate">{subtitle}</p>
                        ) : null}
                        <span
                          className={cn(
                            "inline-flex mt-1 text-[10px] font-medium px-1.5 py-0.5 rounded",
                            getDisplayCategorieBadgeClass(
                              contact.filleul_categorie ?? contact.categorie
                            )
                          )}
                        >
                          {contactCategoryLabel(contact)}
                        </span>
                      </div>
                      {interactive ? (
                        <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" aria-hidden />
                      ) : null}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
