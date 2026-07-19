import { Badge } from "@/components/ui/badge";
import { ChevronRight, Cloud, CloudOff, Home } from "lucide-react";
import type { Contact } from "@/lib/api/tauri-contacts";
import type { ContactEtiquetteDetails } from "@/lib/api/tauri-etiquettes";
import {
  getClientRoleBadgeClass,
  getFilleulRoleBadgeClass,
} from "@/lib/contacts/contact-category-display";
import { isClientActif } from "@/lib/contacts/contact-form-utils";
import {
  getClientCategorieLabel,
  getFilleulCategorieBadgeClass,
  getFilleulCategorieLabel,
  getFoyerRoleLabel,
} from "@/lib/contacts/contact-list-labels";
import { getContactPriorite } from "@/lib/contacts/contact-priority";
import { resolveSuiviRowDisplay } from "@/lib/contacts/contact-row-suivi-display";
import { cn } from "@/lib/utils";
import { ContactInitialsAvatar } from "./contacts-ui";
import { ContactRowEtiquettes } from "./ContactRowEtiquettes";
import { ContactRowMeta } from "./ContactRowMeta";

export type ContactListRowProps = {
  contact: Contact;
  isFilleulTab: boolean;
  patrimoines: Record<string, number>;
  patrimoinesAvecMoi: Record<string, number>;
  etiquettesParContact: Record<number, ContactEtiquetteDetails[]>;
  onView: (contact: Contact) => void;
  selected?: boolean;
  variant?: "card" | "plain";
  showNonRattache?: boolean;
  showFoyerRole?: boolean;
  nameSize?: "md" | "lg";
  onedriveLinkState?: "linked" | "missing" | null;
};

export function ContactListRow({
  contact,
  isFilleulTab,
  patrimoines,
  patrimoinesAvecMoi,
  etiquettesParContact,
  onView,
  selected = false,
  variant = "card",
  showNonRattache = false,
  showFoyerRole = false,
  nameSize = "lg",
  onedriveLinkState = null,
}: ContactListRowProps) {
  const priorite = getContactPriorite(contact, isFilleulTab);
  const contactEtiquettes =
    contact.id != null ? etiquettesParContact[contact.id] : undefined;
  const { showPrioriteLabel, etiquettesForRow } = resolveSuiviRowDisplay(
    priorite,
    contactEtiquettes
  );
  const hasEtiquettes = etiquettesForRow.length > 0;
  const contactPatrimoine = patrimoines[`contact_${contact.id}`] || 0;
  const contactPatrimoineAvecMoi = patrimoinesAvecMoi[`contact_${contact.id}`] || 0;
  const foyerAvecMoi =
    contact.foyer_id != null
      ? patrimoinesAvecMoi[`foyer_${contact.foyer_id}`] || 0
      : 0;

  const patrimoineBlock = !isFilleulTab && (
    <>
      {contactPatrimoine > 0 && (
        <span
          className={cn(
            "font-medium text-primary",
            nameSize === "md" ? "text-xs text-muted-foreground" : "text-sm"
          )}
        >
          {contactPatrimoineAvecMoi.toLocaleString("fr-FR")} € avec moi
          {contactPatrimoine > contactPatrimoineAvecMoi && (
            <span className="text-muted-foreground/80 ml-1 font-normal">
              ({contactPatrimoine.toLocaleString("fr-FR")} € total)
            </span>
          )}
          {foyerAvecMoi > 0 && (
            <Home
              className="inline h-3.5 w-3.5 ml-1 text-blue-600"
              aria-label="Patrimoine foyer"
            />
          )}
        </span>
      )}
      {contactPatrimoine === 0 && foyerAvecMoi > 0 && (
        <span
          className={cn("text-blue-700", nameSize === "md" ? "text-xs" : "text-sm")}
          title="Patrimoine commun dans le foyer"
        >
          <Home className="inline h-3.5 w-3.5 mr-0.5" />
          {foyerAvecMoi.toLocaleString("fr-FR")} € (foyer)
        </span>
      )}
    </>
  );

  return (
    <div
      role="button"
      tabIndex={0}
      className={cn(
        "flex items-start gap-3 p-4 transition-colors cursor-pointer group",
        priorite.rowClass,
        variant === "card"
          ? "border border-border/70 rounded-xl hover:bg-muted/50 hover:border-primary/25 hover:shadow-sm"
          : "hover:bg-muted/60",
        variant === "plain" && !priorite.rowClass && "border-l-4 border-l-transparent",
        selected && "ring-2 ring-primary/50 border-primary/40 bg-primary/5"
      )}
      onClick={() => onView(contact)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onView(contact);
        }
      }}
    >
      <ContactInitialsAvatar prenom={contact.prenom} nom={contact.nom} />
      <div className="flex-1 min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <p
            className={cn(
              "font-semibold text-foreground truncate",
              nameSize === "lg" ? "text-lg" : "text-base"
            )}
          >
            {contact.prenom} {contact.nom}
          </p>
          {showPrioriteLabel && (
            <span
              className="inline-flex items-center gap-1 text-[10px] font-medium text-muted-foreground"
              title={priorite.label}
            >
              <span className={cn("h-2 w-2 rounded-full shrink-0", priorite.dotClass)} />
              {priorite.label}
            </span>
          )}
          {showNonRattache && (
            <Badge variant="outline" className="text-xs text-muted-foreground">
              Non rattaché
            </Badge>
          )}
          {showFoyerRole && contact.role_foyer && (
            <Badge variant="outline" className="text-xs">
              {getFoyerRoleLabel(contact.role_foyer)}
            </Badge>
          )}
          {!isFilleulTab && isClientActif(contact.categorie) && (
            <Badge className={getClientRoleBadgeClass(contact.categorie)}>
              {getClientCategorieLabel(contact.categorie)}
            </Badge>
          )}
          {!isFilleulTab && contact.filleul_categorie && (
            <Badge className={getFilleulRoleBadgeClass(contact.filleul_categorie)}>
              {getFilleulCategorieLabel(contact.filleul_categorie)}
            </Badge>
          )}
          {isFilleulTab && contact.filleul_categorie && (
            <Badge className={getFilleulCategorieBadgeClass(contact.filleul_categorie)}>
              {getFilleulCategorieLabel(contact.filleul_categorie)}
            </Badge>
          )}
          {onedriveLinkState === "linked" ? (
            <Badge
              variant="outline"
              className="text-xs gap-1 text-sky-700 border-sky-200 bg-sky-50"
              title="Dossier OneDrive relié"
            >
              <Cloud className="h-3 w-3" />
              OneDrive
            </Badge>
          ) : null}
          {onedriveLinkState === "missing" ? (
            <Badge
              variant="outline"
              className="text-xs gap-1 text-amber-800 border-amber-200 bg-amber-50"
              title="Dossier OneDrive non relié"
            >
              <CloudOff className="h-3 w-3" />
              OneDrive
            </Badge>
          ) : null}
          {patrimoineBlock}
        </div>
        {contact.id && (
          <ContactRowEtiquettes
            contactId={contact.id}
            etiquettesParContact={etiquettesParContact}
            etiquettes={etiquettesForRow}
          />
        )}
        <ContactRowMeta
          contact={contact}
          isFilleulTab={isFilleulTab}
          withSeparator={hasEtiquettes}
        />
      </div>
      <ChevronRight className="h-5 w-5 text-muted-foreground/50 shrink-0 mt-2 group-hover:text-primary group-hover:translate-x-0.5 transition-all" />
    </div>
  );
}
