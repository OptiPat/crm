import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { ChevronDown, ChevronRight, Users2 } from "lucide-react";
import type { Contact } from "@/lib/api/tauri-contacts";
import type { Foyer } from "@/lib/api/tauri-foyers";
import type { ContactEtiquetteDetails } from "@/lib/api/tauri-etiquettes";
import { cn } from "@/lib/utils";
import { ContactListRow } from "./ContactListRow";

type FoyerGroup = {
  foyer: Foyer | null;
  contacts: Contact[];
};

export function FoyerGroupCard({
  group,
  isFilleulTab,
  patrimoines,
  patrimoinesAvecMoi,
  etiquettesParContact,
  onViewContact,
  selectedContactId,
  defaultCollapsed = false,
}: {
  group: FoyerGroup;
  isFilleulTab: boolean;
  patrimoines: Record<string, number>;
  patrimoinesAvecMoi: Record<string, number>;
  etiquettesParContact: Record<number, ContactEtiquetteDetails[]>;
  onViewContact: (contact: Contact) => void;
  selectedContactId?: number;
  defaultCollapsed?: boolean;
}) {
  const [collapsed, setCollapsed] = useState(defaultCollapsed);
  const foyerPatrimoine = group.foyer ? patrimoines[`foyer_${group.foyer.id}`] || 0 : 0;
  const contactsPatrimoine = group.contacts.reduce(
    (sum, c) => sum + (patrimoines[`contact_${c.id}`] || 0),
    0
  );
  const totalPatrimoine = foyerPatrimoine + contactsPatrimoine;

  if (!group.foyer) {
    return (
      <div className="space-y-2">
        {group.contacts.map((contact) => (
          <ContactListRow
            key={contact.id}
            contact={contact}
            isFilleulTab={isFilleulTab}
            patrimoines={patrimoines}
            patrimoinesAvecMoi={patrimoinesAvecMoi}
            etiquettesParContact={etiquettesParContact}
            onView={onViewContact}
            selected={selectedContactId === contact.id}
            showNonRattache
          />
        ))}
      </div>
    );
  }

  return (
    <div className="border border-border/70 rounded-xl overflow-hidden">
      <button
        type="button"
        className="w-full flex items-center justify-between gap-3 bg-muted/40 px-4 py-3 hover:bg-muted/60 transition-colors text-left"
        onClick={() => setCollapsed((c) => !c)}
        aria-expanded={!collapsed}
      >
        <div className="flex items-center gap-3 min-w-0">
          {collapsed ? (
            <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
          ) : (
            <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
          )}
          <Users2 className="h-5 w-5 text-primary shrink-0" />
          <span className="font-semibold truncate">{group.foyer.nom}</span>
          <Badge variant="secondary" className="shrink-0">
            {group.contacts.length} membre{group.contacts.length > 1 ? "s" : ""}
          </Badge>
        </div>
        {!isFilleulTab && totalPatrimoine > 0 && (
          <span className="text-sm font-medium text-primary tabular-nums shrink-0">
            {totalPatrimoine.toLocaleString("fr-FR")} €
          </span>
        )}
      </button>
      <div
        className={cn(
          "divide-y divide-border/60",
          collapsed && "hidden"
        )}
      >
        {group.contacts.map((contact) => (
          <ContactListRow
            key={contact.id}
            contact={contact}
            isFilleulTab={isFilleulTab}
            patrimoines={patrimoines}
            patrimoinesAvecMoi={patrimoinesAvecMoi}
            etiquettesParContact={etiquettesParContact}
            onView={onViewContact}
            selected={selectedContactId === contact.id}
            variant="plain"
            showFoyerRole
            nameSize="md"
          />
        ))}
      </div>
    </div>
  );
}
