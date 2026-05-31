import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  MessageSquare,
  Plus,
  History,
  AlertCircle,
  Send,
  ArrowRight,
} from "lucide-react";
import {
  deleteInteraction,
  type Interaction,
  type InteractionWithContact,
} from "@/lib/api/tauri-interactions";
import {
  getContactRelationStatus,
  type ContactPendingEmail,
  type ContactRelationStatus,
} from "@/lib/api/tauri-contact-relation";
import type { EtiquetteEmailQueueStatus } from "@/lib/api/tauri-etiquettes";
import { subscribeRelationChanged } from "@/lib/etiquettes/etiquette-events";
import { getTypeAlerteLabel } from "@/lib/alertes/alerte-labels";
import { navigateToSuivi } from "@/lib/navigation/suivi-navigation";
import { navigateToInteractions } from "@/lib/navigation/interactions-navigation";
import {
  loadContactRelationTimeline,
  type ContactRelationTimelineItem,
} from "@/lib/interactions/contact-relation-timeline";
import { ContactGmailHistoryPanel } from "@/components/interactions/ContactGmailHistoryPanel";
import { ContactRelationTimelineRow } from "@/components/interactions/ContactRelationTimelineRow";
import { InteractionForm } from "./InteractionForm";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

interface ContactInteractionsPanelProps {
  contactId: number;
  contactEmail?: string | null;
  dateDernierContact?: number | null;
  dateDernierContactFilleul?: number | null;
  onContactUpdated?: () => void;
  onNavigate?: (page: string) => void;
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

function envoisSubTabForPending(
  pending: ContactPendingEmail
): EtiquetteEmailQueueStatus {
  if (pending.queue_status === "followup") return "followup";
  if (pending.queue_status === "incomplete") return "incomplete";
  if (pending.queue_status === "sent") return "sent";
  return "ready";
}

function pendingEmailActionLabel(pending: ContactPendingEmail): string {
  switch (pending.queue_status) {
    case "ready":
      return "Ouvrir Envois — prêt à envoyer";
    case "followup":
      return "Ouvrir Envois — à relancer";
    case "incomplete":
      return "Ouvrir Envois — à compléter";
    case "sent":
      return "Ouvrir Envois — en attente de réponse";
    default:
      return "Ouvrir Suivi → Envois";
  }
}

function pendingEmailSummary(pending: ContactPendingEmail): string {
  const status =
    pending.queue_status === "ready"
      ? "email prêt à envoyer"
      : pending.queue_status === "followup"
        ? "relance à envisager"
        : pending.queue_status === "sent"
          ? "en attente de réponse client"
          : "configuration ou date à compléter";
  return `Campagne « ${pending.etiquette_nom} » — ${status}`;
}

function RelationActionLink({
  variant,
  icon: Icon,
  title,
  actionLabel,
  onClick,
}: {
  variant: "alert" | "email";
  icon: typeof AlertCircle;
  title: string;
  actionLabel: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "w-full flex items-start gap-3 rounded-lg border px-3 py-2.5 text-left text-sm transition-colors group",
        variant === "alert"
          ? "border-orange-200 bg-orange-50/80 hover:bg-orange-100/90 text-orange-950"
          : "border-blue-200 bg-blue-50/80 hover:bg-blue-100/90 text-blue-950"
      )}
    >
      <Icon className="h-4 w-4 shrink-0 mt-0.5" />
      <span className="flex-1 min-w-0">
        <span className="block leading-snug">{title}</span>
        <span
          className={cn(
            "inline-flex items-center gap-1 mt-1 text-xs font-medium",
            variant === "alert" ? "text-orange-800" : "text-blue-800"
          )}
        >
          {actionLabel}
          <ArrowRight className="h-3.5 w-3.5 group-hover:translate-x-0.5 transition-transform" />
        </span>
      </span>
    </button>
  );
}

export function ContactInteractionsPanel({
  contactId,
  contactEmail,
  dateDernierContact,
  dateDernierContactFilleul,
  onContactUpdated,
  onNavigate,
}: ContactInteractionsPanelProps) {
  const [timeline, setTimeline] = useState<ContactRelationTimelineItem[]>([]);
  const [relationStatus, setRelationStatus] = useState<ContactRelationStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<InteractionWithContact | null>(null);

  const load = async () => {
    try {
      setLoading(true);
      const [items, status] = await Promise.all([
        loadContactRelationTimeline(contactId),
        getContactRelationStatus(contactId),
      ]);
      setTimeline(items);
      setRelationStatus(status);
    } catch (error) {
      console.error(error);
      setTimeline([]);
      setRelationStatus(null);
      toast.error("Impossible de charger la relation client");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (contactId) void load();
  }, [contactId]);

  useEffect(() => {
    return subscribeRelationChanged((changedContactId) => {
      if (changedContactId != null && changedContactId !== contactId) return;
      void load();
      onContactUpdated?.();
    });
  }, [contactId, onContactUpdated]);

  const goToSuiviAlertes = () => {
    if (!onNavigate) {
      toast.info("Ouvrez l'écran Suivi depuis le menu latéral.");
      return;
    }
    navigateToSuivi(onNavigate, "alertes", undefined, contactId, "contacts");
  };

  const goToSuiviEnvois = (subTab: EtiquetteEmailQueueStatus) => {
    if (!onNavigate) {
      toast.info("Ouvrez l'écran Suivi → Envois depuis le menu latéral.");
      return;
    }
    navigateToSuivi(onNavigate, "envois", subTab, contactId, "contacts");
  };

  const goToHistorique = () => {
    if (!onNavigate) {
      toast.info("Ouvrez Relation client → Historique des échanges depuis le menu.");
      return;
    }
    navigateToInteractions(onNavigate, contactId, "contacts");
  };

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
  const firstAlerte = relationStatus?.open_alertes[0];

  return (
    <>
      <ContactGmailHistoryPanel contactId={contactId} contactEmail={contactEmail} />
      <Card className="border-primary/15 shadow-sm">
        <CardHeader className="pb-3">
          <div className="flex items-start justify-between gap-3">
            <div>
              <CardTitle className="text-lg flex items-center gap-2">
                <History className="h-5 w-5 text-primary" />
                Relation client
                {!loading && timeline.length > 0 && (
                  <span className="text-sm font-normal text-muted-foreground">
                    ({timeline.length} échange{timeline.length > 1 ? "s" : ""})
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
                {!dernierClient && !dernierFilleul && !loading && timeline.length === 0 && (
                  <span>
                    Appels, emails campagne et notes — aligné avec Historique des échanges
                  </span>
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
                <RelationActionLink
                  variant="alert"
                  icon={AlertCircle}
                  title={
                    relationStatus.open_alertes.length > 1
                      ? `${relationStatus.open_alertes.length} alertes ouvertes${
                          firstAlerte
                            ? ` — ${getTypeAlerteLabel(firstAlerte.type_alerte)}`
                            : ""
                        }`
                      : firstAlerte
                        ? `Alerte : ${getTypeAlerteLabel(firstAlerte.type_alerte)}`
                        : "1 alerte ouverte"
                  }
                  actionLabel="Traiter dans Suivi → Alertes"
                  onClick={goToSuiviAlertes}
                />
              )}
              {relationStatus.pending_email && (
                <RelationActionLink
                  variant="email"
                  icon={Send}
                  title={pendingEmailSummary(relationStatus.pending_email)}
                  actionLabel={pendingEmailActionLabel(relationStatus.pending_email)}
                  onClick={() =>
                    goToSuiviEnvois(envoisSubTabForPending(relationStatus.pending_email!))
                  }
                />
              )}
            </div>
          )}
          {loading ? (
            <p className="text-sm text-muted-foreground py-2">Chargement de l&apos;historique…</p>
          ) : timeline.length === 0 ? (
            <div className="rounded-lg border border-dashed border-border bg-muted/30 px-4 py-6 text-center">
              <MessageSquare className="h-8 w-8 mx-auto text-muted-foreground/50 mb-2" />
              <p className="text-sm font-medium">Aucun échange enregistré</p>
              <p className="text-xs text-muted-foreground mt-1 mb-3">
                Les envois campagne apparaissent ici après envoi depuis Suivi → Envois.
              </p>
              <div className="flex flex-wrap justify-center gap-2">
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
                {onNavigate && relationStatus && relationStatus.open_alertes.length > 0 && (
                  <Button size="sm" variant="ghost" onClick={goToSuiviAlertes}>
                    Voir l&apos;alerte
                    <ArrowRight className="h-4 w-4 ml-1" />
                  </Button>
                )}
              </div>
            </div>
          ) : (
            <ul className="space-y-2 relative before:absolute before:left-[1.35rem] before:top-3 before:bottom-3 before:w-px before:bg-border/80">
              {timeline.map((item) => (
                <ContactRelationTimelineRow
                  key={item.key}
                  item={item}
                  onEdit={
                    item.kind === "manual"
                      ? (interaction) => {
                          setEditing(toEditRow(interaction));
                          setShowForm(true);
                        }
                      : undefined
                  }
                  onDelete={item.kind === "manual" ? handleDelete : undefined}
                  onOpenHistorique={
                    item.kind === "email" && onNavigate ? goToHistorique : undefined
                  }
                />
              ))}
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
