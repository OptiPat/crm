import type { ReactNode } from "react";
import { Badge } from "@/components/ui/badge";
import { Users2 } from "lucide-react";
import type { Contact } from "@/lib/api/tauri-contacts";
import type { ContactEtiquetteDetails } from "@/lib/api/tauri-etiquettes";
import type { FoyerFlatRow } from "@/lib/foyers/foyer-list-rows";
import { ContactListRow } from "./ContactListRow";

type FoyerFlatRowRendererProps = {
  row: FoyerFlatRow;
  isFilleulTab: boolean;
  patrimoines: Record<string, number>;
  patrimoinesAvecMoi: Record<string, number>;
  etiquettesParContact: Record<number, ContactEtiquetteDetails[]>;
  onViewContact: (contact: Contact) => void;
  selectedContactId?: number;
  renderEtiquettes?: (contactId: number) => ReactNode;
  renderMeta?: (contact: Contact, withSeparator: boolean) => ReactNode;
};

/** @deprecated renderEtiquettes/renderMeta conservés pour compat VirtualizedFoyerContactList */
export function FoyerFlatRowRenderer({
  row,
  isFilleulTab,
  patrimoines,
  patrimoinesAvecMoi,
  etiquettesParContact,
  onViewContact,
  selectedContactId,
}: FoyerFlatRowRendererProps) {
  if (row.kind === "header") {
    if (!row.foyer) return null;
    return (
      <div className="bg-muted/50 px-4 py-3 border-b border-border">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <Users2 className="h-5 w-5 text-primary shrink-0" />
            <h3 className="font-semibold truncate">{row.foyer.nom}</h3>
            <Badge variant="secondary" className="shrink-0">
              {row.memberCount} membre{row.memberCount > 1 ? "s" : ""}
            </Badge>
          </div>
          {!isFilleulTab && row.totalPatrimoine > 0 && (
            <span className="text-sm font-medium text-primary tabular-nums shrink-0">
              {row.totalPatrimoine.toLocaleString("fr-FR")} €
            </span>
          )}
        </div>
      </div>
    );
  }

  const contact = row.contact;
  return (
    <ContactListRow
      contact={contact}
      isFilleulTab={isFilleulTab}
      patrimoines={patrimoines}
      patrimoinesAvecMoi={patrimoinesAvecMoi}
      etiquettesParContact={etiquettesParContact}
      onView={onViewContact}
      selected={selectedContactId === contact.id}
      variant="plain"
      showNonRattache={!row.inFoyer}
      showFoyerRole={row.inFoyer}
      nameSize={row.inFoyer ? "md" : "lg"}
    />
  );
}
