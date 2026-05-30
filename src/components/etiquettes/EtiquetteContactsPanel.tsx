import { useCallback, useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Users, X, ExternalLink } from "lucide-react";
import {
  getContactsByEtiquette,
  retirerEtiquette,
  getContrastColor,
  type EtiquetteWithCount,
} from "@/lib/api/tauri-etiquettes";
import { notifyEtiquettesChanged } from "@/lib/etiquettes/etiquette-events";
import { getClientLabel, getFilleulLabel } from "@/lib/contacts/contact-form-utils";
import type { Contact } from "@/lib/api/tauri-contacts";
import { toast } from "sonner";

interface EtiquetteContactsPanelProps {
  etiquette: EtiquetteWithCount;
  onClose: () => void;
  onOpenContact?: (contactId: number) => void;
  onContactsChanged?: () => void;
}

export function EtiquetteContactsPanel({
  etiquette,
  onClose,
  onOpenContact,
  onContactsChanged,
}: EtiquetteContactsPanelProps) {
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [loading, setLoading] = useState(true);

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
    void loadContacts();
  }, [loadContacts]);

  const handleRetirer = async (contactId: number) => {
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
    <Card className="border-primary/30">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-2">
          <div>
            <CardTitle className="text-lg flex items-center gap-2 flex-wrap">
              <Users className="h-5 w-5 shrink-0" />
              <span
                className="inline-flex items-center px-2.5 py-1 rounded-full text-sm font-medium"
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
                : `${contacts.length} contact${contacts.length > 1 ? "s" : ""}`}
            </CardDescription>
          </div>
          <Button variant="ghost" size="icon" onClick={onClose} aria-label="Fermer">
            <X className="h-4 w-4" />
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {loading ? (
          <p className="text-sm text-muted-foreground text-center py-6">Chargement…</p>
        ) : contacts.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-6">
            Aucun contact avec cette étiquette
          </p>
        ) : (
          <div className="space-y-2 max-h-[min(50vh,420px)] overflow-y-auto">
            {contacts.map((contact) => (
              <div
                key={contact.id}
                className="flex items-center justify-between gap-2 p-3 border border-border rounded-lg hover:bg-muted/50"
              >
                <div className="min-w-0">
                  <p className="font-medium truncate">
                    {contact.prenom} {contact.nom}
                  </p>
                  <p className="text-sm text-muted-foreground truncate">
                    {[
                      getFilleulLabel(contact.filleul_categorie),
                      getClientLabel(contact.categorie),
                    ]
                      .filter(Boolean)
                      .join(" · ") || contact.categorie}
                    {contact.email ? ` · ${contact.email}` : ""}
                  </p>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  {onOpenContact && contact.id && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="gap-1"
                      onClick={() => onOpenContact(contact.id!)}
                    >
                      <ExternalLink className="h-4 w-4" />
                      Fiche
                    </Button>
                  )}
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-muted-foreground hover:text-destructive"
                    onClick={() => contact.id && void handleRetirer(contact.id)}
                    title="Retirer l'étiquette"
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
