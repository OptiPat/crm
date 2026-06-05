import { useCallback, useEffect, useRef, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  MessageSquare,
  Plus,
  History,
  AlertCircle,
  Send,
  ArrowRight,
  RefreshCw,
  Loader2,
  Search,
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
import { subscribeTachesChanged } from "@/lib/taches/tache-events";
import { subscribeInvestissementsChanged } from "@/lib/investissements/investissement-events";
import { getTypeAlerteLabel } from "@/lib/alertes/alerte-labels";
import { navigateToSuivi } from "@/lib/navigation/suivi-navigation";
import { navigateToInteractions } from "@/lib/navigation/interactions-navigation";
import {
  filterRelationTimeline,
  loadContactRelationTimeline,
  relationTimelineMatchesSearch,
  type ContactRelationTimelineItem,
  type RelationTimelineFilter,
} from "@/lib/interactions/contact-relation-timeline";
import {
  getContactMailSyncState,
  SETTING_CONTACT_MAIL_AUTO_SYNC,
  syncContactGmailMessages,
  type ContactMailSyncProgress,
} from "@/lib/api/tauri-contact-gmail";
import { getEmailConnectionStatus } from "@/lib/api/tauri-email-oauth";
import { getSetting } from "@/lib/api/tauri-settings";
import { ContactRelationTimelineRow } from "@/components/interactions/ContactRelationTimelineRow";
import { groupRelationTimelineByYearMonth } from "@/lib/interactions/relation-timeline-groups";
import { InteractionForm } from "./InteractionForm";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

interface ContactInteractionsPanelProps {
  contactId: number;
  contactEmail?: string | null;
  /** Onglet Relation actif — sync auto éventuelle */
  relationTabActive?: boolean;
  dateDernierContact?: number | null;
  dateDernierContactFilleul?: number | null;
  onContactUpdated?: () => void;
  onNavigate?: (page: string) => void;
}

const FILTER_LABELS: { id: RelationTimelineFilter; label: string }[] = [
  { id: "all", label: "Tout" },
  { id: "crm", label: "CRM" },
  { id: "mailbox", label: "Boîte mail" },
];

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
  if (pending.queue_status === "scheduled") return "scheduled";
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
    case "scheduled":
      return "Ouvrir Envois — planifié";
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
          : pending.queue_status === "scheduled"
            ? "envoi planifié"
            : "configuration à compléter";
  const kind =
    pending.queue_row_kind === "template" ? "Modèle" : "Étiquette";
  return `${kind} « ${pending.etiquette_nom} » — ${status}`;
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
  relationTabActive = false,
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
  const [filter, setFilter] = useState<RelationTimelineFilter>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [syncing, setSyncing] = useState(false);
  const [syncProgress, setSyncProgress] = useState<ContactMailSyncProgress | null>(null);
  const [mailProvider, setMailProvider] = useState<"google" | "microsoft" | null>(null);
  const mailConnected = mailProvider === "google" || mailProvider === "microsoft";
  const [lastSyncLabel, setLastSyncLabel] = useState<string | null>(null);
  /** Dernière sync auto par contact (évite spam, permet re-sync à la réouverture de l’onglet). */
  const lastAutoSyncRef = useRef<Map<number, number>>(new Map());
  const syncLockRef = useRef(false);
  const AUTO_RESYNC_MS = 15 * 60 * 1000;

  useEffect(() => {
    setSyncing(false);
    setSyncProgress(null);
  }, [contactId]);

  const load = useCallback(async () => {
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
  }, [contactId]);

  useEffect(() => {
    if (contactId) void load();
  }, [contactId, load]);

  useEffect(() => {
    getEmailConnectionStatus()
      .then((s) => {
        if (s.connected && (s.provider === "google" || s.provider === "microsoft")) {
          setMailProvider(s.provider);
        } else {
          setMailProvider(null);
        }
      })
      .catch(() => setMailProvider(null));
    getContactMailSyncState(contactId)
      .then((st) => {
        if (!st?.last_sync_at) {
          setLastSyncLabel(null);
          return;
        }
        setLastSyncLabel(
          new Date(st.last_sync_at * 1000).toLocaleString("fr-FR", {
            dateStyle: "short",
            timeStyle: "short",
          })
        );
      })
      .catch(() => setLastSyncLabel(null));
  }, [contactId, syncing]);

  useEffect(() => {
    const unlisten = listen<ContactMailSyncProgress>("contact-mail-sync-progress", (ev) => {
      if (ev.payload.contactId !== contactId) return;
      setSyncProgress(ev.payload);
      if (ev.payload.done) {
        setSyncing(false);
        if (ev.payload.error) toast.error(ev.payload.error);
      }
    });
    return () => {
      void unlisten.then((fn) => fn());
    };
  }, [contactId]);

  const runMailSync = useCallback(
    async (untilComplete: boolean) => {
      if (syncLockRef.current) return;
      if (!contactEmail?.trim()) {
        toast.error("Ajoutez une adresse email au contact.");
        return;
      }
      if (!mailConnected) {
        toast.error("Connectez Google ou Microsoft dans Paramètres → Email.");
        return;
      }
      syncLockRef.current = true;
      setSyncing(true);
      setSyncProgress({
        contactId,
        scanned: 0,
        imported: 0,
        skipped: 0,
        phase: "listing",
        done: false,
        error: null,
      });
      try {
        let totalImported = 0;
        let rounds = 0;
        let complete = false;
        const maxRounds = untilComplete ? 80 : 1;
        while (rounds < maxRounds && !complete) {
          const result = await syncContactGmailMessages(contactId);
          totalImported += result.imported;
          complete = result.complete;
          rounds += 1;
          if (complete) break;
          if (!untilComplete) break;
          if (result.imported === 0 && result.scanned === 0) break;
          await new Promise((r) => setTimeout(r, 500));
        }
        await load();
        if (totalImported === 0 && complete) {
          toast.info("Boîte mail à jour (5 dernières années).");
        } else if (totalImported > 0) {
          toast.success(
            `${totalImported} message${totalImported > 1 ? "s" : ""} importé${totalImported > 1 ? "s" : ""}${
              complete ? "" : " — la sync continue au prochain passage"
            }`
          );
        } else if (untilComplete && !complete) {
          toast.info("Import en pause — relancez Sync Gmail ou rouvrez l’onglet Relation.");
        }
      } catch (error) {
        toast.error(String(error));
      } finally {
        syncLockRef.current = false;
        setSyncing(false);
      }
    },
    [contactId, contactEmail, mailConnected, load]
  );

  useEffect(() => {
    if (!relationTabActive || !contactEmail?.trim() || !mailConnected) return;
    let cancelled = false;
    void (async () => {
      const auto = await getSetting(SETTING_CONTACT_MAIL_AUTO_SYNC);
      if (cancelled || auto !== "1") return;
      const last = lastAutoSyncRef.current.get(contactId) ?? 0;
      if (Date.now() - last < AUTO_RESYNC_MS) return;
      lastAutoSyncRef.current.set(contactId, Date.now());
      await runMailSync(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [relationTabActive, contactId, contactEmail, mailConnected, runMailSync]);

  useEffect(() => {
    return subscribeRelationChanged((changedContactId) => {
      if (changedContactId != null && changedContactId !== contactId) return;
      void load();
      onContactUpdated?.();
    });
  }, [contactId, onContactUpdated]);

  useEffect(() => {
    const unsubTaches = subscribeTachesChanged(() => void load());
    const unsubInvest = subscribeInvestissementsChanged(() => void load());
    return () => {
      unsubTaches();
      unsubInvest();
    };
  }, [load]);

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

  const filteredTimeline = filterRelationTimeline(timeline, filter).filter((item) =>
    relationTimelineMatchesSearch(item, searchQuery)
  );
  const timelineByYear = groupRelationTimelineByYearMonth(filteredTimeline);

  const progressPct =
    syncProgress && syncProgress.scanned > 0
      ? Math.min(
          100,
          Math.round(
            ((syncProgress.imported + syncProgress.skipped) / syncProgress.scanned) * 100
          )
        )
      : null;

  const phaseLabel =
    syncProgress?.phase === "listing"
      ? "Liste des messages…"
      : syncProgress?.phase === "importing"
        ? "Import des métadonnées…"
        : syncProgress?.phase === "done"
          ? "Terminé"
          : null;

  return (
    <>
      <Card className="border-primary/15 shadow-sm">
        <CardHeader className="pb-3">
          <div className="flex items-start justify-between gap-3">
            <div>
              <CardTitle className="text-lg flex items-center gap-2">
                <History className="h-5 w-5 text-primary" />
                Relation client
                {!loading && filteredTimeline.length > 0 && (
                  <span className="text-sm font-normal text-muted-foreground">
                    ({filteredTimeline.length} affiché{filteredTimeline.length > 1 ? "s" : ""}
                    {filter !== "all" || searchQuery.trim()
                      ? ` / ${timeline.length} au total`
                      : ""}
                    )
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
                    Campagnes, notes, investissements, documents, tâches et boîte mail —
                    historique complet
                  </span>
                )}
                {lastSyncLabel && (
                  <span className="block text-xs">
                    Dernière sync boîte mail : <strong>{lastSyncLabel}</strong>
                  </span>
                )}
              </CardDescription>
            </div>
            <div className="flex flex-col items-end gap-2 shrink-0">
              <Button
                size="sm"
                variant="outline"
                className="gap-1"
            disabled={syncing || !contactEmail?.trim() || !mailConnected}
            title={
              !contactEmail?.trim()
                ? "Email du contact requis"
                : !mailConnected
                  ? "Connectez Google ou Microsoft dans Paramètres → Email"
                  : "Import complet (5 ans), reprise automatique jusqu’à la fin"
            }
            onClick={() => void runMailSync(true)}
              >
                {syncing ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <RefreshCw className="h-4 w-4" />
                )}
                Sync boîte mail
              </Button>
              <Button
                size="sm"
                className="gap-1"
                onClick={() => {
                  setEditing(null);
                  setShowForm(true);
                }}
              >
                <Plus className="h-4 w-4" />
                Noter un échange
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap items-center gap-2 mb-3">
            {FILTER_LABELS.map((f) => (
              <Button
                key={f.id}
                type="button"
                size="sm"
                variant={filter === f.id ? "default" : "outline"}
                className="h-8"
                onClick={() => setFilter(f.id)}
              >
                {f.label}
              </Button>
            ))}
            <div className="relative flex-1 min-w-[160px] max-w-xs ml-auto">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                placeholder="Rechercher…"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="h-8 pl-8 text-sm"
              />
            </div>
          </div>
          {syncing && (
            <div className="mb-4 rounded-md border bg-muted/30 px-3 py-2 text-xs">
              <p className="text-muted-foreground mb-1">
                Synchronisation boîte mail… {phaseLabel ?? "en cours"}
                {syncProgress && syncProgress.scanned > 0 && (
                  <>
                    {" "}
                    — {syncProgress.scanned} analysé{syncProgress.scanned > 1 ? "s" : ""},{" "}
                    {syncProgress.imported} importé{syncProgress.imported > 1 ? "s" : ""}
                    {syncProgress.skipped > 0
                      ? `, ${syncProgress.skipped} ignoré${syncProgress.skipped > 1 ? "s" : ""}`
                      : ""}
                  </>
                )}
              </p>
              {progressPct != null && (
                <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                  <div
                    className="h-full bg-primary transition-all duration-300"
                    style={{ width: `${progressPct}%` }}
                  />
                </div>
              )}
            </div>
          )}
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
          ) : filteredTimeline.length === 0 ? (
            <div className="rounded-lg border border-dashed border-border bg-muted/30 px-4 py-6 text-center">
              <MessageSquare className="h-8 w-8 mx-auto text-muted-foreground/50 mb-2" />
              <p className="text-sm font-medium">
                {timeline.length > 0
                  ? "Aucun échange pour ce filtre"
                  : "Aucun échange enregistré"}
              </p>
              <p className="text-xs text-muted-foreground mt-1 mb-3">
                {searchQuery.trim()
                  ? "Aucun résultat pour cette recherche."
                  : filter !== "all"
                    ? "Changez le filtre Tout / CRM / Boîte mail."
                    : "Les envois campagne apparaissent après envoi ; synchronisez Gmail pour la boîte mail."}
              </p>
              {(filter !== "all" || searchQuery.trim()) && timeline.length > 0 && (
                <Button
                  size="sm"
                  variant="outline"
                  className="mb-2"
                  onClick={() => {
                    setFilter("all");
                    setSearchQuery("");
                  }}
                >
                  Réinitialiser filtres
                </Button>
              )}
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
            <div className="space-y-4">
              {timelineByYear.map((yearGroup) => (
                <details key={yearGroup.year} open className="group">
                  <summary className="cursor-pointer list-none flex items-center gap-2 rounded-md bg-muted/40 px-3 py-2 text-sm font-semibold hover:bg-muted/60 [&::-webkit-details-marker]:hidden">
                    <History className="h-4 w-4 text-primary shrink-0" />
                    {yearGroup.year}
                    <span className="text-muted-foreground font-normal text-xs">
                      ({yearGroup.months.reduce((n, m) => n + m.items.length, 0)} échange
                      {yearGroup.months.reduce((n, m) => n + m.items.length, 0) > 1 ? "s" : ""})
                    </span>
                  </summary>
                  <div className="mt-3 space-y-4 pl-1">
                    {yearGroup.months.map((month) => (
                      <div key={month.key}>
                        <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2 px-1">
                          {month.label} {yearGroup.year}
                        </h4>
                        <ul className="space-y-2 relative before:absolute before:left-[1.35rem] before:top-3 before:bottom-3 before:w-px before:bg-border/80">
                          {month.items.map((item) => (
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
                      </div>
                    ))}
                  </div>
                </details>
              ))}
            </div>
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
