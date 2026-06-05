import { useCallback, useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Mail,
  Send,
  AlertTriangle,
  RefreshCw,
  ExternalLink,
  MessageSquare,
  CalendarCheck,
  X,
  RotateCcw,
  History,
} from "lucide-react";
import { EmailSendLogTab } from "@/components/etiquettes/EmailSendLogTab";
import { EtiquetteBatchSendDialog } from "@/components/etiquettes/EtiquetteBatchSendDialog";
import {
  DEFAULT_EMAIL_RELANCE_FALLBACK_DELAI_JOURS,
  isTemplateEmailRelanceEnabledForQueue,
} from "@/lib/emails/template-email-relance";
import {
  getEtiquetteEmailQueue,
  markEmailCampaignResponse,
  dismissEmailCampaignFollowup,
  cancelPendingEmailCampaign,
  prepareEmailCampaignRelance,
  getContrastColor,
  type EtiquetteEmailQueueItem,
} from "@/lib/api/tauri-etiquettes";
import { getCgpConfig, type CgpConfig } from "@/lib/api/tauri-settings";
import { runRelationAutoSync } from "@/lib/emails/relation-auto-sync";
import {
  getEmailConnectionStatus,
  type EmailConnectionStatus,
} from "@/lib/api/tauri-email-oauth";
import {
  formatEtiquetteSendDatetime,
  getIncompleteQueueLabel,
  hasContactActivityAfterEmailSend,
  renderEtiquetteEmailPreview,
} from "@/lib/etiquettes/etiquette-email-preview";
import { EtiquetteEmailSendDialog } from "@/components/etiquettes/EtiquetteEmailSendDialog";
import { ContactRegistreBadge } from "@/components/contacts/ContactRegistreSwitch";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  EnvoisEmailConnectionBanner,
  EnvoisQueueHelp,
  EnvoisQueueStats,
} from "@/components/etiquettes/etiquette-envois-ui";
import {
  notifyRelationChanged,
  subscribeEtiquettesChanged,
  subscribeRelationChanged,
} from "@/lib/etiquettes/etiquette-events";
import { useEventAutoRefresh } from "@/hooks/useEventAutoRefresh";
import { subscribeContactsChanged } from "@/lib/contacts/contact-events";
import { consumeEnvoisContactFocus } from "@/lib/navigation/suivi-navigation";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

interface EtiquetteEnvoisTabProps {
  onOpenContact?: (contactId: number) => void;
  onQueueChanged?: () => void;
}

export function EtiquetteEnvoisTab({ onOpenContact, onQueueChanged }: EtiquetteEnvoisTabProps) {
  const [ready, setReady] = useState<EtiquetteEmailQueueItem[]>([]);
  const [scheduled, setScheduled] = useState<EtiquetteEmailQueueItem[]>([]);
  const [incomplete, setIncomplete] = useState<EtiquetteEmailQueueItem[]>([]);
  const [sent, setSent] = useState<EtiquetteEmailQueueItem[]>([]);
  const [followup, setFollowup] = useState<EtiquetteEmailQueueItem[]>([]);
  const [cgpConfig, setCgpConfig] = useState<CgpConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [subTab, setSubTab] = useState<
    "ready" | "scheduled" | "incomplete" | "sent" | "followup" | "journal"
  >("ready");
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [batchOpen, setBatchOpen] = useState(false);
  const [confirmItem, setConfirmItem] = useState<EtiquetteEmailQueueItem | null>(null);
  const [cancelConfirmItem, setCancelConfirmItem] =
    useState<EtiquetteEmailQueueItem | null>(null);
  const [cancelling, setCancelling] = useState(false);
  const [emailStatus, setEmailStatus] = useState<EmailConnectionStatus | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [highlightContactId, setHighlightContactId] = useState<number | null>(null);
  const [highlightRowKey, setHighlightRowKey] = useState<number | null>(null);

  const runAutoSync = useCallback(async () => {
    if (emailStatus?.provider !== "google" || !emailStatus.connected) return;
    try {
      setSyncing(true);
      const r = await runRelationAutoSync();
      if (r.skipped) return;
      const parts: string[] = [];
      if (r.mail_detected > 0) parts.push(`${r.mail_detected} réponse(s) mail`);
      if (r.rdv_campaign_detected > 0) {
        parts.push(`${r.rdv_campaign_detected} RDV campagne`);
      }
      if (r.calendar_accepted > 0) {
        parts.push(`${r.calendar_accepted} RDV confirmé(s)`);
      }
      if (parts.length > 0) {
        toast.success(`Détection : ${parts.join(", ")}`);
      }
      if (r.errors.length > 0) {
        toast.warning(r.errors[0]);
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (!msg.includes("reconnectez") && !msg.includes("Connectez Google")) {
        console.warn("sync relation:", msg);
      }
    } finally {
      setSyncing(false);
    }
  }, [emailStatus?.provider, emailStatus?.connected]);

  useEffect(() => {
    const raw = sessionStorage.getItem("crm_nav_suivi_envois_subtab");
    if (
      raw === "ready" ||
      raw === "scheduled" ||
      raw === "incomplete" ||
      raw === "sent" ||
      raw === "followup" ||
      raw === "journal"
    ) {
      setSubTab(raw);
      sessionStorage.removeItem("crm_nav_suivi_envois_subtab");
    }
    const focusId = consumeEnvoisContactFocus();
    if (focusId != null) setHighlightContactId(focusId);
  }, []);

  const loadQueue = useCallback(async (options?: { silent?: boolean }) => {
    const silent = options?.silent ?? false;
    try {
      if (!silent) setLoading(true);
      const [cgp, r, sch, i, s, f, emailConn] = await Promise.all([
        getCgpConfig(),
        getEtiquetteEmailQueue("ready"),
        getEtiquetteEmailQueue("scheduled"),
        getEtiquetteEmailQueue("incomplete"),
        getEtiquetteEmailQueue("sent"),
        getEtiquetteEmailQueue("followup"),
        getEmailConnectionStatus(),
      ]);
      setCgpConfig(cgp);
      setReady(r);
      setScheduled(sch);
      setIncomplete(i);
      setSent(s);
      setFollowup(f);
      setEmailStatus(emailConn);
      onQueueChanged?.();
    } catch (error) {
      console.error("Error loading email queue:", error);
      toast.error("Erreur lors du chargement de la file d'envoi");
    } finally {
      if (!silent) setLoading(false);
    }
  }, [onQueueChanged]);

  useEffect(() => {
    void loadQueue();
  }, [loadQueue]);

  useEventAutoRefresh(
    () => loadQueue({ silent: true }),
    subscribeRelationChanged,
    subscribeEtiquettesChanged,
    subscribeContactsChanged
  );

  useEffect(() => {
    if (highlightContactId == null || loading) return;
    const buckets: Array<{
      mode: typeof subTab;
      items: EtiquetteEmailQueueItem[];
    }> = [
      { mode: "ready", items: ready },
      { mode: "scheduled", items: scheduled },
      { mode: "incomplete", items: incomplete },
      { mode: "followup", items: followup },
      { mode: "sent", items: sent },
    ];
    for (const { mode, items } of buckets) {
      const match = items.find((i) => i.contact_id === highlightContactId);
      if (match) {
        setSubTab(mode);
        setHighlightRowKey(match.contact_etiquette_id);
        window.setTimeout(() => {
          document
            .getElementById(`envoi-contact-${match.contact_etiquette_id}`)
            ?.scrollIntoView({ behavior: "smooth", block: "center" });
        }, 150);
        if (mode === "ready") {
          setConfirmItem(match);
        }
        window.setTimeout(() => setHighlightRowKey(null), 4000);
        break;
      }
    }
    setHighlightContactId(null);
  }, [highlightContactId, loading, ready, scheduled, incomplete, sent, followup]);

  const openConfirm = (item: EtiquetteEmailQueueItem) => {
    setConfirmItem(item);
  };

  const toggleSelected = (id: number, checked: boolean) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  };

  const selectedReadyItems = ready.filter((i) => selectedIds.has(i.contact_etiquette_id));
  const allReadySelected = ready.length > 0 && selectedReadyItems.length === ready.length;

  const handleMarkResponse = async (
    item: EtiquetteEmailQueueItem,
    responseType: "mail" | "rdv" | "autre"
  ) => {
    try {
      await markEmailCampaignResponse(item.contact_etiquette_id, responseType);
      toast.success("Retour client enregistré");
      notifyRelationChanged(item.contact_id);
      await loadQueue();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erreur");
    }
  };

  const handleDismissFollowup = async (item: EtiquetteEmailQueueItem) => {
    try {
      await dismissEmailCampaignFollowup(item.contact_etiquette_id);
      toast.success("Relance masquée pour cet envoi");
      await loadQueue();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erreur");
    }
  };

  const handleCancelPendingConfirmed = async () => {
    const item = cancelConfirmItem;
    if (!item) return;
    try {
      setCancelling(true);
      await cancelPendingEmailCampaign(item.contact_etiquette_id);
      setCancelConfirmItem(null);
      toast.success("Envoi retiré de la file");
      await loadQueue({ silent: true });
      onQueueChanged?.();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erreur");
    } finally {
      setCancelling(false);
    }
  };

  const handlePrepareRelance = async (item: EtiquetteEmailQueueItem) => {
    try {
      await prepareEmailCampaignRelance(item.contact_etiquette_id);
      toast.success("Contact remis dans « Prêts à envoyer » avec le template de relance");
      setSubTab("ready");
      await loadQueue();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erreur");
    }
  };

  const renderList = (
    items: EtiquetteEmailQueueItem[],
    options: { mode: "ready" | "scheduled" | "incomplete" | "sent" | "followup" }
  ) => {
    if (loading) {
      return (
        <div className="text-center py-8 text-muted-foreground">Chargement...</div>
      );
    }
    if (items.length === 0) {
      const empty =
        options.mode === "ready"
          ? "Rien à envoyer pour le moment. Vérifiez la campagne sur l'étiquette (onglet Email), recalculez les étiquettes, et que chaque contact a un email en fiche."
          : options.mode === "scheduled"
            ? "Aucun envoi planifié pour le moment."
            : options.mode === "incomplete"
              ? "Aucun blocage — parfait. Email manquant, modèle ou date manquante apparaîtront ici."
              : options.mode === "followup"
              ? `Aucune relance suggérée (délai selon chaque modèle, repli ${DEFAULT_EMAIL_RELANCE_FALLBACK_DELAI_JOURS} j).`
              : "Aucun envoi en attente de réponse client.";
      return <div className="text-center py-8 text-muted-foreground">{empty}</div>;
    }

    return (
      <div className="space-y-3">
        {items.map((item) => {
          const preview =
            options.mode === "ready" && cgpConfig
              ? renderEtiquetteEmailPreview(item, cgpConfig)
              : null;

          return (
            <div
              id={`envoi-contact-${item.contact_etiquette_id}`}
              key={item.contact_etiquette_id}
              className={cn(
                "p-4 border rounded-lg bg-card flex flex-col sm:flex-row sm:items-center gap-3 justify-between",
                highlightRowKey === item.contact_etiquette_id && "ring-2 ring-primary/40"
              )}
            >
              {options.mode === "ready" && (
                <Checkbox
                  checked={selectedIds.has(item.contact_etiquette_id)}
                  onCheckedChange={(v) =>
                    toggleSelected(item.contact_etiquette_id, v === true)
                  }
                  className="shrink-0"
                  aria-label={`Sélectionner ${item.contact_prenom} ${item.contact_nom}`}
                />
              )}
              <div className="space-y-1 min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium">
                    {item.contact_prenom} {item.contact_nom}
                  </span>
                  <ContactRegistreBadge registre={item.contact_registre} />
                  <span
                    className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium"
                    style={{
                      backgroundColor: item.etiquette_couleur,
                      color: getContrastColor(item.etiquette_couleur),
                    }}
                  >
                    {item.etiquette_nom}
                  </span>
                </div>
                {options.mode === "incomplete" ? (
                  <p className="text-sm text-amber-700 flex items-center gap-1">
                    <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                    {getIncompleteQueueLabel(item.queue_issue)}
                  </p>
                ) : options.mode === "scheduled" ? (
                  <p className="text-sm text-muted-foreground">
                    Passera dans Prêts à envoyer à la date prévue — rien à faire.
                  </p>
                ) : (
                  <p className="text-sm text-muted-foreground truncate">
                    {item.contact_email ?? "—"}
                  </p>
                )}
                <p className="text-xs text-muted-foreground">
                  {options.mode === "sent" || options.mode === "followup"
                    ? `Envoyé le ${formatEtiquetteSendDatetime(item.email_date_envoi)}`
                    : `Prévu le ${formatEtiquetteSendDatetime(item.email_date_prevue)}`}
                </p>
                {(options.mode === "followup" ||
                  options.mode === "sent") &&
                  hasContactActivityAfterEmailSend(item) && (
                    <p className="text-xs text-blue-700">
                      Dernier contact fiche mis à jour après l&apos;envoi — à vérifier
                      avant relance.
                    </p>
                  )}
                {options.mode === "followup" && (
                  <p className="text-xs text-amber-800">
                    Aucun retour enregistré — relance selon le délai du modèle (onglet Relance).
                  </p>
                )}
                {options.mode === "ready" && item.email_is_relance && (
                  <Badge variant="secondary" className="text-xs bg-orange-100 text-orange-900">
                    Relance (2e email)
                  </Badge>
                )}
                {options.mode === "ready" && preview && (
                  <p className="text-xs text-muted-foreground truncate">
                    Objet : {preview.subject}
                  </p>
                )}
                {options.mode === "sent" && item.template_sujet && (
                  <p className="text-xs text-muted-foreground truncate">
                    Objet : {item.template_sujet}
                  </p>
                )}
              </div>
              <div className="flex gap-2 shrink-0">
                {options.mode === "ready" && (
                  <>
                    <Button size="sm" onClick={() => openConfirm(item)}>
                      <Send className="h-4 w-4 mr-1" />
                      Confirmer et envoyer
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      title="Ignorer cet envoi"
                      onClick={() => setCancelConfirmItem(item)}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </>
                )}
                {options.mode === "followup" && (
                  <>
                    {isTemplateEmailRelanceEnabledForQueue(item.template_variables) ? (
                    <Button
                      size="sm"
                      onClick={() => void handlePrepareRelance(item)}
                    >
                      <RotateCcw className="h-4 w-4 mr-1" />
                      Relancer
                    </Button>
                    ) : (
                      <span className="text-xs text-muted-foreground self-center">
                        Relance désactivée sur ce modèle
                      </span>
                    )}
                    <Button
                      size="sm"
                      variant="outline"
                      title="Réponse par email"
                      onClick={() => void handleMarkResponse(item, "mail")}
                    >
                      <MessageSquare className="h-4 w-4" />
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      title="RDV pris (Agenda)"
                      onClick={() => void handleMarkResponse(item, "rdv")}
                    >
                      <CalendarCheck className="h-4 w-4" />
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      title="Ignorer le suivi"
                      onClick={() => void handleDismissFollowup(item)}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </>
                )}
                {options.mode === "incomplete" &&
                  (item.queue_issue === "NO_EMAIL" || item.queue_issue === "OTHER") && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      if (onOpenContact) {
                        onOpenContact(item.contact_id);
                      } else {
                        toast.info(
                          `Ajoutez l'email de ${item.contact_prenom} ${item.contact_nom} depuis l'onglet Contacts.`
                        );
                      }
                    }}
                  >
                    <ExternalLink className="h-4 w-4 mr-1" />
                    Compléter la fiche
                  </Button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    );
  };

  return (
    <div className="space-y-4">
      <EnvoisQueueHelp />
      {emailStatus && (
        <EnvoisEmailConnectionBanner
          connected={emailStatus.connected}
          provider={emailStatus.provider}
          email={emailStatus.email}
        />
      )}
      <EnvoisQueueStats
        ready={ready.length}
        scheduled={scheduled.length}
        incomplete={incomplete.length}
        sent={sent.length}
        followup={followup.length}
        active={subTab}
        onSelect={setSubTab}
      />
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Mail className="h-5 w-5" />
              File d&apos;envoi
            </CardTitle>
            <CardDescription>
              Envoi individuel ou groupé — chaque envoi est tracé dans le journal.
            </CardDescription>
          </div>
          <div className="flex gap-2">
            {emailStatus?.provider === "google" && emailStatus.connected && (
              <Button
                variant="outline"
                size="sm"
                disabled={loading || syncing}
                onClick={async () => {
                  await runAutoSync();
                  await loadQueue();
                }}
              >
                <RefreshCw className={`h-4 w-4 mr-1 ${syncing ? "animate-spin" : ""}`} />
                Vérifier maintenant
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent>
          <Tabs value={subTab} onValueChange={(v) => setSubTab(v as typeof subTab)}>
            <TabsList>
              <TabsTrigger value="ready" className="gap-2">
                Prêts à envoyer
                {ready.length > 0 && (
                  <Badge variant="secondary">{ready.length}</Badge>
                )}
              </TabsTrigger>
              <TabsTrigger value="scheduled" className="gap-2">
                Planifiés
                {scheduled.length > 0 && (
                  <Badge variant="outline">{scheduled.length}</Badge>
                )}
              </TabsTrigger>
              <TabsTrigger value="incomplete" className="gap-2">
                À compléter
                {incomplete.length > 0 && (
                  <Badge variant="secondary" className="bg-amber-100">
                    {incomplete.length}
                  </Badge>
                )}
              </TabsTrigger>
              <TabsTrigger value="sent" className="gap-2">
                Envoyés
                {sent.length > 0 && (
                  <Badge variant="outline">{sent.length}</Badge>
                )}
              </TabsTrigger>
              <TabsTrigger value="followup" className="gap-2">
                À relancer
                {followup.length > 0 && (
                  <Badge variant="secondary" className="bg-orange-100">
                    {followup.length}
                  </Badge>
                )}
              </TabsTrigger>
              <TabsTrigger value="journal" className="gap-2">
                <History className="h-4 w-4" />
                Journal
              </TabsTrigger>
            </TabsList>
            <TabsContent value="ready" className="mt-4 space-y-3">
              {ready.length > 0 && (
                <div className="flex flex-wrap items-center gap-2">
                  <Checkbox
                    checked={allReadySelected}
                    onCheckedChange={(v) => {
                      if (v === true) {
                        setSelectedIds(new Set(ready.map((i) => i.contact_etiquette_id)));
                      } else {
                        setSelectedIds(new Set());
                      }
                    }}
                  />
                  <span className="text-sm text-muted-foreground">Tout sélectionner</span>
                  <Button
                    size="sm"
                    className="ml-auto"
                    disabled={selectedReadyItems.length === 0 || loading}
                    onClick={() => setBatchOpen(true)}
                  >
                    <Send className="h-4 w-4 mr-1" />
                    Envoyer la sélection ({selectedReadyItems.length})
                  </Button>
                </div>
              )}
              {renderList(ready, { mode: "ready" })}
            </TabsContent>
            <TabsContent value="scheduled" className="mt-4">
              <p className="text-xs text-muted-foreground mb-3">
                Dates futures des campagnes — passage automatique dans Prêts à envoyer.
              </p>
              {renderList(scheduled, { mode: "scheduled" })}
            </TabsContent>
            <TabsContent value="incomplete" className="mt-4">
              {renderList(incomplete, { mode: "incomplete" })}
            </TabsContent>
            <TabsContent value="sent" className="mt-4">
              {renderList(sent, { mode: "sent" })}
            </TabsContent>
            <TabsContent value="followup" className="mt-4">
              <p className="text-xs text-muted-foreground mb-3">
                Délai et horaire définis sur chaque modèle (Templates → onglet Relance). Google
                connecté : détection mail + Agenda automatique en arrière-plan (toutes les 2 min).
              </p>
              {renderList(followup, { mode: "followup" })}
            </TabsContent>
            <TabsContent value="journal" className="mt-4">
              <p className="text-xs text-muted-foreground mb-3">
                Historique de tous les envois (individuels et groupés) avec statut et horodatage.
              </p>
              <EmailSendLogTab />
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>

      <EtiquetteEmailSendDialog
        item={confirmItem}
        open={!!confirmItem}
        onOpenChange={(o) => !o && setConfirmItem(null)}
        cgpConfig={cgpConfig}
        onSent={() => {
          setSelectedIds(new Set());
          void loadQueue();
        }}
      />

      <EtiquetteBatchSendDialog
        items={selectedReadyItems}
        open={batchOpen}
        onOpenChange={setBatchOpen}
        cgpConfig={cgpConfig}
        onDone={() => {
          setSelectedIds(new Set());
          void loadQueue();
        }}
      />

      <AlertDialog
        open={!!cancelConfirmItem}
        onOpenChange={(open) => {
          if (!open && !cancelling) setCancelConfirmItem(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Ignorer cet envoi ?</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2 text-sm text-muted-foreground">
                <p>
                  <strong className="text-foreground">
                    {cancelConfirmItem?.contact_prenom} {cancelConfirmItem?.contact_nom}
                  </strong>
                  {" — "}
                  {cancelConfirmItem?.etiquette_nom}
                </p>
                {cancelConfirmItem && cgpConfig && (
                  <p>
                    Objet :{" "}
                    {renderEtiquetteEmailPreview(cancelConfirmItem, cgpConfig).subject}
                  </p>
                )}
                <p>
                  L&apos;email ne sera pas envoyé et ne reviendra pas dans la file pour ce
                  contact.
                </p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={cancelling}>Annuler</AlertDialogCancel>
            <AlertDialogAction
              disabled={cancelling}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={(e) => {
                e.preventDefault();
                void handleCancelPendingConfirmed();
              }}
            >
              {cancelling ? "Retrait…" : "Ignorer cet envoi"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
