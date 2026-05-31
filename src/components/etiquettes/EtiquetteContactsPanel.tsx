import { useCallback, useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Users, X, ChevronRight, Search } from "lucide-react";
import {
  getContactsByEtiquette,
  retirerEtiquette,
  getContrastColor,
  type EtiquetteWithCount,
} from "@/lib/api/tauri-etiquettes";
import { notifyEtiquettesChanged } from "@/lib/etiquettes/etiquette-events";
import { getClientLabel, getFilleulLabel } from "@/lib/contacts/contact-form-utils";
import type { Contact } from "@/lib/api/tauri-contacts";
import { textMatchesSearch } from "@/lib/search-utils";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

interface EtiquetteContactsPanelProps {
  etiquette: EtiquetteWithCount;
  onClose: () => void;
  onOpenContact?: (contactId: number, label: string) => void;
  onContactsChanged?: () => void;
  className?: string;
}

export function EtiquetteContactsPanel({
  etiquette,
  onClose,
  onOpenContact,
  onContactsChanged,
  className,
}: EtiquetteContactsPanelProps) {
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");

  const loadContacts = useCallback(async () => {
    setLoading(true);
    try {
      setContacts(await getContactsByEtiquette(etiquette.id));
    } catch {
      setContacts([]);
      toast.error("Impossible de charger les contacts");
    } finally {
      setLoading(false);
    }
  }, [etiquette.id]);

  useEffect(() => {
    setSearchQuery("");
    void loadContacts();
  }, [loadContacts]);

  const filteredContacts = useMemo(
    () =>
      contacts.filter((c) =>
        textMatchesSearch(
          searchQuery,
          c.nom,
          c.prenom,
          c.email,
          c.telephone,
          getClientLabel(c.categorie),
          getFilleulLabel(c.filleul_categorie)
        )
      ),
    [contacts, searchQuery]
  );

  const handleRetirer = async (contactId: number, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await retirerEtiquette(contactId, etiquette.id);
      toast.success("Étiquette retirée");
      await loadContacts();
      notifyEtiquettesChanged();
      onContactsChanged?.();
    } catch {
      toast.error("Erreur lors du retrait");
    }
  };

  return (
    <Card
      className={cn(
        "border-primary/25 shadow-sm flex flex-col min-h-0",
        className
      )}
    >
      <CardHeader className="pb-3 shrink-0">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <CardTitle className="text-lg flex items-center gap-2 flex-wrap">
              <Users className="h-5 w-5 shrink-0 text-primary" />
              <span
                className="inline-flex items-center px-2.5 py-1 rounded-full text-sm font-medium truncate max-w-full"
                style={{
                  backgroundColor: etiquette.couleur,
                  color: getContrastColor(etiquette.couleur),
                }}
              >
                {etiquette.nom}
              </span>
            </CardTitle>
            <CardDescription className="mt-1">
              {loading
                ? "Chargement…"
                : `${filteredContacts.length} contact${filteredContacts.length > 1 ? "s" : ""}${
                    searchQuery && filteredContacts.length !== contacts.length
                      ? ` sur ${contacts.length}`
                      : ""
                  }`}
            </CardDescription>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={onClose}
            aria-label="Fermer"
            className="shrink-0"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
        {contacts.length > 3 && (
          <div className="relative pt-2">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Filtrer les contacts…"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9 h-9"
            />
          </div>
        )}
      </CardHeader>
      <CardContent className="flex-1 min-h-0 overflow-y-auto pt-0">
        {loading ? (
          <p className="text-sm text-muted-foreground text-center py-8">Chargement…</p>
        ) : contacts.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-8">
            Aucun contact avec cette étiquette
          </p>
        ) : filteredContacts.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-8">
            Aucun contact pour cette recherche
          </p>
        ) : (
          <div className="space-y-2">
            {filteredContacts.map((contact) => {
              const label = `${contact.prenom} ${contact.nom}`.trim();
              const subtitle = [
                getFilleulLabel(contact.filleul_categorie),
                getClientLabel(contact.categorie),
              ]
                .filter(Boolean)
                .join(" · ");

              return (
                <div
                  key={contact.id}
                  role={onOpenContact && contact.id ? "button" : undefined}
                  tabIndex={onOpenContact && contact.id ? 0 : undefined}
                  onClick={() => {
                    if (onOpenContact && contact.id) {
                      onOpenContact(contact.id, label);
                    }
                  }}
                  onKeyDown={(e) => {
                    if (
                      onOpenContact &&
                      contact.id &&
                      (e.key === "Enter" || e.key === " ")
                    ) {
                      e.preventDefault();
                      onOpenContact(contact.id, label);
                    }
                  }}
                  className={cn(
                    "flex items-center justify-between gap-2 p-3 border border-border/80 rounded-lg transition-colors",
                    onOpenContact &&
                      contact.id &&
                      "cursor-pointer hover:bg-accent/50 hover:border-primary/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
                  )}
                >
                  <div className="min-w-0 flex-1">
                    <p className="font-medium truncate">{label}</p>
                    <p className="text-sm text-muted-foreground truncate">
                      {subtitle || contact.categorie}
                      {contact.email ? ` · ${contact.email}` : ""}
                    </p>
                  </div>
                  <div
                    className="flex items-center gap-1 shrink-0"
                    onClick={(e) => e.stopPropagation()}
                    onKeyDown={(e) => e.stopPropagation()}
                  >
                    {onOpenContact && contact.id && (
                      <ChevronRight className="h-4 w-4 text-muted-foreground hidden sm:block" />
                    )}
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-muted-foreground hover:text-destructive"
                      onClick={(e) => contact.id && void handleRetirer(contact.id, e)}
                      title="Retirer l'étiquette"
                      aria-label="Retirer l'étiquette"
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
