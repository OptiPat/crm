import { Mail, Phone } from "lucide-react";
import type { Contact } from "@/lib/api/tauri-contacts";
import { formatCalendarDateFr } from "@/lib/dates/calendar-date";
import { cn } from "@/lib/utils";

export function ContactRowMeta({
  contact,
  isFilleulTab,
  withSeparator,
}: {
  contact: Contact;
  isFilleulTab: boolean;
  withSeparator: boolean;
}) {
  const dateToUse = isFilleulTab
    ? contact.date_dernier_contact_filleul
    : contact.date_dernier_contact;

  let dernierContact: string | null = null;
  if (dateToUse) {
    dernierContact = formatCalendarDateFr(dateToUse);
  }

  if (!contact.email && !contact.telephone && !dernierContact) return null;

  return (
    <div
      className={cn(
        "flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-muted-foreground",
        withSeparator
          ? "mt-3 pt-3 border-t border-border/50"
          : "mt-1"
      )}
    >
      {contact.email && (
        <div className="flex items-center gap-1.5 min-w-0 max-w-full">
          <Mail className="h-4 w-4 shrink-0" />
          <span className="truncate">{contact.email}</span>
        </div>
      )}
      {contact.telephone && (
        <div className="flex items-center gap-1.5 shrink-0">
          <Phone className="h-4 w-4 shrink-0" />
          {contact.telephone}
        </div>
      )}
      {dernierContact && (
        <span className="text-xs shrink-0">Dernier contact : {dernierContact}</span>
      )}
    </div>
  );
}
