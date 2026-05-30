import type { ReactNode } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Users2 } from "lucide-react";
import type { Contact } from "@/lib/api/tauri-contacts";
import { getContactCategorieBadgeClass } from "@/lib/contacts/contact-category-display";
import type { ContactEtiquetteDetails } from "@/lib/api/tauri-etiquettes";
import type { FoyerFlatRow } from "@/lib/foyers/foyer-list-rows";

type FoyerFlatRowRendererProps = {
  row: FoyerFlatRow;
  isFilleulTab: boolean;
  patrimoines: Record<string, number>;
  patrimoinesAvecMoi: Record<string, number>;
  etiquettesParContact: Record<number, ContactEtiquetteDetails[]>;
  getCategorieLabel: (categorie: string) => string | null;
  onViewContact: (contact: Contact) => void;
  renderEtiquettes: (contactId: number) => ReactNode;
  renderMeta: (contact: Contact, withSeparator: boolean) => ReactNode;
};

function contactHasEtiquettes(
  contactId: number | undefined,
  map: Record<number, ContactEtiquetteDetails[]>
): boolean {
  return !!(contactId && (map[contactId]?.length ?? 0) > 0);
}

export function FoyerFlatRowRenderer({
  row,
  isFilleulTab,
  patrimoines,
  patrimoinesAvecMoi,
  getCategorieLabel,
  onViewContact,
  etiquettesParContact,
  renderEtiquettes,
  renderMeta,
}: FoyerFlatRowRendererProps) {
  if (row.kind === "header") {
    if (!row.foyer) return null;
    return (
      <div className="bg-muted/50 p-4 border-b border-border">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Users2 className="h-5 w-5 text-primary" />
            <h3 className="font-semibold text-lg">{row.foyer.nom}</h3>
            <Badge variant="secondary">
              {row.memberCount} membre{row.memberCount > 1 ? "s" : ""}
            </Badge>
          </div>
          {!isFilleulTab && row.totalPatrimoine > 0 && (
            <span className="text-sm font-medium text-primary">
              {row.totalPatrimoine.toLocaleString("fr-FR")} €
            </span>
          )}
        </div>
      </div>
    );
  }

  const contact = row.contact;
  const contactPatrimoine = patrimoines[`contact_${contact.id}`] || 0;
  const contactPatrimoineAvecMoi = patrimoinesAvecMoi[`contact_${contact.id}`] || 0;
  const hasEtiquettes = contactHasEtiquettes(contact.id, etiquettesParContact);

  return (
    <div
      role="button"
      tabIndex={0}
      className={`p-4 hover:bg-muted/70 transition-colors cursor-pointer ${
        row.inFoyer ? "" : "border border-border rounded-lg"
      }`}
      onClick={() => onViewContact(contact)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onViewContact(contact);
        }
      }}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-3 mb-1 flex-wrap">
            <h4 className={row.inFoyer ? "font-semibold" : "font-semibold text-lg"}>
              {contact.prenom} {contact.nom}
            </h4>
            {!row.inFoyer && (
              <Badge variant="outline" className="text-xs text-muted-foreground">
                Non rattaché
              </Badge>
            )}
            {row.inFoyer && contact.role_foyer && (
              <Badge variant="outline" className="text-xs">
                {contact.role_foyer === "DECLARANT_1"
                  ? "Déclarant 1"
                  : contact.role_foyer === "DECLARANT_2"
                    ? "Déclarant 2"
                    : contact.role_foyer === "ENFANT"
                      ? "Enfant"
                      : "Autre"}
              </Badge>
            )}
            {!isFilleulTab && contact.categorie !== "AUCUN" && (
              <Badge
                className={getContactCategorieBadgeClass(
                  contact.categorie,
                  contact.filleul_categorie
                )}
              >
                {getCategorieLabel(contact.categorie)}
              </Badge>
            )}
            {isFilleulTab && contact.filleul_categorie && (
              <Badge
                className={
                  contact.filleul_categorie === "FILLEUL_DESINSCRIT"
                    ? "bg-red-100 text-red-800"
                    : "bg-emerald-100 text-emerald-800"
                }
              >
                {contact.filleul_categorie === "FILLEUL" && "✅ Filleul inscrit"}
                {contact.filleul_categorie === "PROSPECT_FILLEUL" && "🟡 Prospect filleul"}
                {contact.filleul_categorie === "SUSPECT_FILLEUL" && "🟠 Suspect filleul"}
                {contact.filleul_categorie === "FILLEUL_DESINSCRIT" && "❌ Filleul désinscrit"}
              </Badge>
            )}
            {!isFilleulTab && contactPatrimoine > 0 && (
              <span className="text-xs text-muted-foreground">
                {contactPatrimoineAvecMoi.toLocaleString("fr-FR")} € avec moi
                {contactPatrimoine > contactPatrimoineAvecMoi && (
                  <span className="text-gray-400 ml-1">
                    ({contactPatrimoine.toLocaleString("fr-FR")} € total)
                  </span>
                )}
                {contact.foyer_id &&
                  (patrimoinesAvecMoi[`foyer_${contact.foyer_id}`] || 0) > 0 && (
                    <span
                      className="text-blue-600 ml-1"
                      title="Patrimoine commun dans le foyer"
                    >
                      🏠
                    </span>
                  )}
              </span>
            )}
            {!isFilleulTab &&
              contactPatrimoine === 0 &&
              contact.foyer_id &&
              (patrimoinesAvecMoi[`foyer_${contact.foyer_id}`] || 0) > 0 && (
                <span
                  className="text-xs text-blue-600"
                  title="Patrimoine commun dans le foyer"
                >
                  🏠 {(patrimoinesAvecMoi[`foyer_${contact.foyer_id}`] || 0).toLocaleString(
                    "fr-FR"
                  )}{" "}
                  € <span className="text-blue-400">(foyer)</span>
                </span>
              )}
          </div>
          {contact.id && renderEtiquettes(contact.id)}
          {renderMeta(contact, hasEtiquettes)}
        </div>
        <Button
          variant="outline"
          size="sm"
          className="shrink-0"
          onClick={(e) => {
            e.stopPropagation();
            onViewContact(contact);
          }}
        >
          Voir détails
        </Button>
      </div>
    </div>
  );
}
