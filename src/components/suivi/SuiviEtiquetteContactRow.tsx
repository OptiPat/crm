import { Button } from "@/components/ui/button";
import type { Contact } from "@/lib/api/tauri-contacts";
import { getClientLabel, getFilleulLabel } from "@/lib/contacts/contact-form-utils";
import { ExternalLink, Mail, X } from "lucide-react";

export function SuiviEtiquetteContactRow({
  contact,
  onOpenContact,
  onOpenEnvois,
  onRetirerEtiquette,
}: {
  contact: Contact;
  onOpenContact?: (contactId: number) => void;
  onOpenEnvois?: (contactId: number) => void;
  onRetirerEtiquette?: (contactId: number) => void;
}) {
  const meta = [
    getFilleulLabel(contact.filleul_categorie),
    getClientLabel(contact.categorie),
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <div className="flex items-center justify-between gap-3 p-3 border border-border rounded-lg hover:bg-muted/50">
      <div className="min-w-0">
        <p className="font-medium truncate">
          {contact.prenom} {contact.nom}
        </p>
        <p className="text-sm text-muted-foreground truncate">
          {meta || contact.categorie}
          {contact.email && ` • ${contact.email}`}
        </p>
      </div>
      <div className="flex items-center gap-1 shrink-0">
        {onOpenContact && contact.id != null && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="gap-1"
            title="Ouvrir la fiche contact"
            onClick={() => onOpenContact(contact.id!)}
          >
            <ExternalLink className="h-4 w-4" />
            <span className="hidden sm:inline">Fiche</span>
          </Button>
        )}
        {contact.id != null && onOpenEnvois && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="gap-1"
            title="Ouvrir dans la file d'envoi"
            onClick={() => onOpenEnvois(contact.id!)}
          >
            <Mail className="h-4 w-4" />
            <span className="hidden sm:inline">Envois</span>
          </Button>
        )}
        {contact.id != null && onRetirerEtiquette && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="text-muted-foreground hover:text-destructive"
            title="Retirer l'étiquette"
            onClick={() => onRetirerEtiquette(contact.id!)}
          >
            <X className="h-4 w-4" />
          </Button>
        )}
      </div>
    </div>
  );
}
