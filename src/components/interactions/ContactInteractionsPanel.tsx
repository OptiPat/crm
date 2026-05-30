import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  MessageSquare,
  Plus,
  Trash2,
  Pencil,
  Phone,
  Mail,
  Calendar,
  FileText,
  History,
  AlertCircle,
  Send,
} from "lucide-react";
import {
  getInteractionsByContact,
  deleteInteraction,
  INTERACTION_TYPES,
  type Interaction,
  type InteractionWithContact,
} from "@/lib/api/tauri-interactions";
import { getContactRelationStatus, type ContactRelationStatus } from "@/lib/api/tauri-contact-relation";
import { subscribeRelationChanged } from "@/lib/etiquettes/etiquette-events";
import { InteractionForm } from "./InteractionForm";
import { toast } from "sonner";

const TYPE_ICONS: Record<string, typeof Phone> = {
  APPEL: Phone,
  EMAIL: Mail,
  RDV: Calendar,
  NOTE: FileText,
  AUTRE: FileText,
};

interface ContactInteractionsPanelProps {
  contactId: number;
  dateDernierContact?: number | null;
  dateDernierContactFilleul?: number | null;
  onContactUpdated?: () => void;
}

function getTypeLabel(value: string): string {
  return INTERACTION_TYPES.find((t) => t.value === value)?.label || value;
}

function formatTs(ts: number | null | undefined): string | null {
  if (!ts) return null;
  try {
    return new Date(ts * 1000).toLocaleDateString("fr-FR", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
  } catch {
    return null;
  }
}

function formatInteractionDate(ts: number): string {
  try {
    return new Date(ts * 1000).toLocaleString("fr-FR", {
      dateStyle: "medium",
      timeStyle: "short",
    });
  } catch {
    return "—";
  }
}

export function ContactInteractionsPanel({
  contactId,
  dateDernierContact,
  dateDernierContactFilleul,
  onContactUpdated,
}: ContactInteractionsPanelProps) {
  const [items, setItems] = useState<Interaction[]>([]);
  const [relationStatus, setRelationStatus] = useState<ContactRelationStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<InteractionWithContact | null>(null);

  const load = async () => {
    try {
      setLoading(true);
      const [interactions, status] = await Promise.all([
        getInteractionsByContact(contactId),
        getContactRelationStatus(contactId),
      ]);
      setItems(interactions);
      setRelationStatus(status);
    } catch (error) {
      console.error(error);
      setItems([]);
      setRelationStatus(null);
      toast.error("Impossible de charger la relation client");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (contactId) load();
  }, [contactId]);

  useEffect(() => {
    return subscribeRelationChanged((changedContactId) => {
      if (changedContactId != null && changedContactId !== contactId) return;
      void load();
      onContactUpdated?.();
    });
  }, [contactId, onContactUpdated]);

  const handleDelete = async (id: number) => {
    if (!confirm("Supprimer cette interaction ?")) return;
    try {
      await deleteInteraction(id);
      await load();
      onContactUpdated?.();
    } catch (error) {
      toast.error(`Erreur : ${String(error)}`);
    }
  };

  const toEditRow = (item: Interaction): InteractionWithContact => ({
    id: item.id,
    contact_id: item.contact_id,
    contact_nom: "",
    contact_prenom: "",
    type_interaction: item.type_interaction,
    sujet: item.sujet,
    contenu: item.contenu,
    date_interaction: item.date_interaction,
    created_at: item.created_at,
  });

  const handleSuccess = async () => {
    await load();
    onContactUpdated?.();
  };

  const dernierClient = formatTs(dateDernierContact);
  const dernierFilleul = formatTs(dateDernierContactFilleul);

  return (
    <>
      <Card className="border-primary/15 shadow-sm">
        <CardHeader className="pb-3">
          <div className="flex items-start justify-between gap-3">
            <div>
              <CardTitle className="text-lg flex items-center gap-2">
                <History className="h-5 w-5 text-primary" />
                Relation client
                {!loading && items.length > 0 && (
                  <span className="text-sm font-normal text-muted-foreground">
                    ({items.length} échange{items.length > 1 ? "s" : ""})
                  </span>
                )}
              </CardTitle>
              <CardDescription className="mt-1.5 space-y-0.5">
                {dernierClient && (
                  <span className="block">
                    Dernier contact client : <strong>{dernierClient}</strong>
                  </span>
                )}
                {dernierFilleul && (
                  <span className="block">
                    Dernier contact filleul : <strong>{dernierFilleul}</strong>
                  </span>
                )}
                {!dernierClient && !dernierFilleul && !loading && items.length === 0 && (
                  <span>Appels, emails, rendez-vous et notes liés à ce contact</span>
                )}
              </CardDescription>
            </div>
            <Button
              size="sm"
              className="gap-1 shrink-0"
              onClick={() => {
                setEditing(null);
                setShowForm(true);
              }}
            >
              <Plus className="h-4 w-4" />
              Noter un échange
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {!loading && relationStatus && (
            <div className="space-y-2 mb-4">
              {relationStatus.open_alertes.length > 0 && (
                <div className="flex items-start gap-2 rounded-lg border border-orange-200 bg-orange-50 px-3 py-2 text-sm text-orange-900">
                  <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
                  <span>
                    {relationStatus.open_alertes.length}{" "}
                    {relationStatus.open_alertes.length > 1 ? "alertes ouvertes" : "alerte ouverte"}{" "}
                    — voir Suivi &amp; alertes
                  </span>
                </div>
              )}
              {relationStatus.pending_email && (
                <div className="flex items-start gap-2 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-sm text-blue-900">
                  <Send className="h-4 w-4 shrink-0 mt-0.5" />
                  <span>
                    Campagne « {relationStatus.pending_email.etiquette_nom} » —{" "}
                    {relationStatus.pending_email.queue_status === "ready"
                      ? "email prêt à envoyer"
                      : relationStatus.pending_email.queue_status === "followup"
                        ? "relance à envisager"
                        : "configuration ou date à compléter"}{" "}
                    (Suivi → Envois)
                  </span>
                </div>
              )}
            </div>
          )}
          {loading ? (
            <p className="text-sm text-muted-foreground py-2">Chargement de l&apos;historique…</p>
          ) : items.length === 0 ? (
            <div className="rounded-lg border border-dashed border-border bg-muted/30 px-4 py-6 text-center">
              <MessageSquare className="h-8 w-8 mx-auto text-muted-foreground/50 mb-2" />
              <p className="text-sm font-medium">Aucun échange enregistré</p>
              <p className="text-xs text-muted-foreground mt-1 mb-3">
                Notez un appel, un email ou un rendez-vous pour garder la trace ici.
              </p>
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  setEditing(null);
                  setShowForm(true);
                }}
              >
                <Plus className="h-4 w-4 mr-1" />
                Premier échange
              </Button>
            </div>
          ) : (
            <ul className="space-y-2 relative before:absolute before:left-[1.35rem] before:top-3 before:bottom-3 before:w-px before:bg-border/80">
              {items.map((item) => {
                const Icon = TYPE_ICONS[item.type_interaction] || FileText;
                return (
                  <li
                    key={item.id}
                    className="relative flex items-start justify-between gap-2 p-3 pl-1 border border-border/80 rounded-lg bg-card hover:bg-accent/40 transition-colors text-sm"
                  >
                    <div className="flex gap-3 min-w-0">
                      <span className="p-2 rounded-lg bg-primary/5 shrink-0 h-fit">
                        <Icon className="h-4 w-4 text-primary" />
                      </span>
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2 mb-0.5">
                          <Badge variant="outline" className="text-xs">
                            {getTypeLabel(item.type_interaction)}
                          </Badge>
                          <span className="text-xs text-muted-foreground tabular-nums">
                            {formatInteractionDate(item.date_interaction)}
                          </span>
                        </div>
                        {item.sujet && <p className="font-medium">{item.sujet}</p>}
                        {item.contenu && (
                          <p className="text-muted-foreground mt-1 whitespace-pre-wrap">
                            {item.contenu}
                          </p>
                        )}
                      </div>
                    </div>
                    <div className="flex shrink-0 gap-0.5">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        onClick={() => {
                          setEditing(toEditRow(item));
                          setShowForm(true);
                        }}
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-destructive"
                        onClick={() => handleDelete(item.id)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>

      <InteractionForm
        open={showForm}
        onOpenChange={setShowForm}
        interaction={editing}
        defaultContactId={contactId}
        onSuccess={handleSuccess}
      />
    </>
  );
}
