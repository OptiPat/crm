import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
import { ScpiCampaignChecklist } from "@/components/etiquettes/ScpiCampaignChecklist";
import { ScpiReadyDigestAccordion } from "@/components/etiquettes/ScpiReadyDigestAccordion";
import { EtiquetteBatchSendDialog } from "@/components/etiquettes/EtiquetteBatchSendDialog";
import { EtiquetteEnvoisSelectionBar } from "@/components/etiquettes/EtiquetteEnvoisSelectionBar";
import {
  DEFAULT_EMAIL_RELANCE_FALLBACK_DELAI_JOURS,
  isTemplateEmailRelanceEnabledForQueue,
} from "@/lib/emails/template-email-relance";
import {
  getEnvoisSnapshot,
  markEmailCampaignResponse,
  dismissEmailCampaignFollowup,
  cancelPendingEmailCampaign,
  restorePendingEmailCampaign,
  dismissCancelledPendingEmailCampaign,
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
  getCampaignTemplateSendBlockReason,
  isCampaignTemplateSendBlocked,
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
  ScpiReadyCampaignBar,
} from "@/components/etiquettes/etiquette-envois-ui";
import {
  notifyRelationChanged,
  subscribeEtiquettesChanged,
  subscribeRelationChangedDebounced,
} from "@/lib/etiquettes/etiquette-events";
import { subscribeContactsChanged } from "@/lib/contacts/contact-events";
import {
  beginRefreshGeneration,
  isRefreshGenerationCurrent,
} from "@/lib/refresh-generation";
import { createDebouncedEnvoisReload } from "@/lib/etiquettes/etiquette-envois-reload";
import {
  getEnvoisBulkRemoveLabel,
  runEnvoisBulkRemove,
  type EnvoisBulkRemoveAction,
} from "@/lib/etiquettes/etiquette-envois-bulk";
import { consumeEnvoisContactFocus } from "@/lib/navigation/suivi-navigation";
import {
  buildSentQueueItem,
} from "@/lib/etiquettes/etiquette-queue-incremental";
import {
  getEnvoisTabInitialState,
  setEnvoisQueueCache,
} from "@/lib/etiquettes/etiquette-envois-cache";
import {
  getEtiquetteQueueItemKey,
  isSameEtiquetteQueueItem,
} from "@/lib/etiquettes/etiquette-queue-item-key";
import {
  isEtiquetteEmailSendActive,
  isEtiquetteQueueItemBatchLocked,
  subscribeEtiquetteEmailSendActivity,
} from "@/lib/etiquettes/etiquette-email-send-runner";
import { runFullEtiquettesRecalc } from "@/lib/etiquettes/sync-etiquettes-auto";
import { isScpiDigestStale } from "@/lib/emails/scpi-digest-stale";
import { isScpiBulletinQueueItem } from "@/lib/emails/scpi-bulletin-preview-vars";
import { filterReadyByScpiBatch } from "@/lib/emails/scpi-envois-filters";
import { useScpiCampaignDashboard } from "@/hooks/useScpiCampaignDashboard";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

interface EtiquetteEnvoisTabProps {
  onOpenContact?: (contactId: number) => void;
  onQueueChanged?: () => void;
}

export function EtiquetteEnvoisTab({ onOpenContact, onQueueChanged }: EtiquetteEnvoisTabProps) {
  const [initialState] = useState(() => getEnvoisTabInitialState());
  const [ready, setReady] = useState(initialState.ready);
  const [scheduled, setScheduled] = useState(initialState.scheduled);
  const [incomplete, setIncomplete] = useState(initialState.incomplete);
  const [cancelled, setCancelled] = useState(initialState.cancelled);
  const [sent, setSent] = useState(initialState.sent);
  const [followup, setFollowup] = useState(initialState.followup);
  const [cgpConfig, setCgpConfig] = useState<CgpConfig | null>(initialState.cgpConfig);
  const [loading, setLoading] = useState(initialState.loading);
  const [backgroundRefreshing, setBackgroundRefreshing] = useState(false);
  const [subTab, setSubTab] = useState<
    | "ready"
    | "scheduled"
    | "incomplete"
    | "cancelled"
    | "sent"
    | "followup"
    | "journal"
  >("ready");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [batchOpen, setBatchOpen] = useState(false);
  const [confirmItem, setConfirmItem] = useState<EtiquetteEmailQueueItem | null>(null);
  const [cancelConfirmItem, setCancelConfirmItem] =
    useState<EtiquetteEmailQueueItem | null>(null);
  const [dismissConfirmItem, setDismissConfirmItem] =
    useState<EtiquetteEmailQueueItem | null>(null);
  const [bulkConfirm, setBulkConfirm] = useState<{
    action: EnvoisBulkRemoveAction;
    items: EtiquetteEmailQueueItem[];
  } | null>(null);
  const [cancelling, setCancelling] = useState(false);
  const [dismissing, setDismissing] = useState(false);
  const [bulkRemoving, setBulkRemoving] = useState(false);
  const [relancing, setRelancing] = useState(false);
  const [emailStatus, setEmailStatus] = useState<EmailConnectionStatus | null>(
    initialState.emailStatus
  );
  const [syncing, setSyncing] = useState(false);
  const [highlightContactId, setHighlightContactId] = useState<number | null>(null);
  const [highlightRowKey, setHighlightRowKey] = useState<string | null>(null);
  const [batchSendRunning, setBatchSendRunning] = useState(false);
  const [, setSendUiPulse] = useState(0);
  const [dashboardRefreshKey, setDashboardRefreshKey] = useState(0);
  const [scpiReadyOnly, setScpiReadyOnly] = useState(false);
  const [journalScpiOnly, setJournalScpiOnly] = useState(false);
  const queueRefreshGenRef = useRef(0);
  const { dashboard: scpiDashboard } = useScpiCampaignDashboard(dashboardRefreshKey);

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
      raw === "cancelled" ||
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
    const token = beginRefreshGeneration(queueRefreshGenRef);
    try {
      if (!silent) setLoading(true);
      else setBackgroundRefreshing(true);
      const [cgp, snap, emailConn] = await Promise.all([
        getCgpConfig(),
        getEnvoisSnapshot(null),
        getEmailConnectionStatus(),
      ]);
      if (!isRefreshGenerationCurrent(queueRefreshGenRef, token)) return;
      setCgpConfig(cgp);
      setReady(snap.ready);
      setScheduled(snap.scheduled ?? []);
      setIncomplete(snap.incomplete ?? []);
      setCancelled(snap.cancelled ?? []);
      setSent(snap.sent ?? []);
      setFollowup(snap.followup ?? []);
      setEmailStatus(emailConn);
      setEnvoisQueueCache({
        ready: snap.ready,
        scheduled: snap.scheduled ?? [],
        incomplete: snap.incomplete ?? [],
        cancelled: snap.cancelled ?? [],
        sent: snap.sent ?? [],
        followup: snap.followup ?? [],
        cgpConfig: cgp,
        emailStatus: emailConn,
      });
      onQueueChanged?.();
      setDashboardRefreshKey((k) => k + 1);
    } catch (error) {
      if (!isRefreshGenerationCurrent(queueRefreshGenRef, token)) return;
      console.error("Error loading email queue:", error);
      toast.error("Erreur lors du chargement de la file d'envoi");
    } finally {
      if (!silent) setLoading(false);
      else setBackgroundRefreshing(false);
    }
  }, [onQueueChanged]);

  const scpiStaleReadyCount = useMemo(
    () =>
      ready.filter(
        (item) =>
          isScpiBulletinQueueItem(item) &&
          isScpiDigestStale(item.campaign_variables)
      ).length,
    [ready]
  );

  const scpiBatchPeriod = scpiDashboard?.lastPrepare?.periode ?? null;
  const scpiReadyLive = scpiDashboard?.readyCount ?? 0;

  const scpiBatchReadyItems = useMemo(
    () => filterReadyByScpiBatch(ready, scpiBatchPeriod),
    [ready, scpiBatchPeriod]
  );

  useEffect(() => {
    if (scpiReadyLive === 0 && scpiBatchReadyItems.length === 0 && scpiReadyOnly) {
      setScpiReadyOnly(false);
    }
  }, [scpiReadyLive, scpiBatchReadyItems.length, scpiReadyOnly]);

  const readyDisplayed = useMemo(() => {
    if (!scpiReadyOnly) return ready;
    return scpiBatchReadyItems;
  }, [ready, scpiReadyOnly, scpiBatchReadyItems]);

  const prepareScpiBatchSend = () => {
    setSubTab("ready");
    setScpiReadyOnly(true);
    setSelectedIds(new Set(scpiBatchReadyItems.map((i) => getEtiquetteQueueItemKey(i))));
    if (scpiBatchReadyItems.length === 0) {
      toast.info("Aucun bulletin SCPI en file pour ce trimestre.");
      return;
    }
    const blocked = scpiBatchReadyItems.find((i) => isCampaignTemplateSendBlocked(i));
    if (blocked) {
      toast.warning(
        getCampaignTemplateSendBlockReason(blocked) ??
          "Envoi SCPI bloqué — relancez n8n prepare."
      );
      return;
    }
    setBatchOpen(true);
  };

  useEffect(() => {
    return subscribeEtiquetteEmailSendActivity((activity) => {
      setBatchSendRunning(activity.batchRunning);
      setSendUiPulse((n) => n + 1);
    });
  }, []);

  useEffect(() => {
    void loadQueue({ silent: initialState.hasCache });
  }, [loadQueue, initialState.hasCache]);

  useEffect(() => {
    const scheduleReload = createDebouncedEnvoisReload(() => {
      void loadQueue({ silent: true });
    });

    const unsubs = [
      subscribeContactsChanged(scheduleReload),
      subscribeEtiquettesChanged(scheduleReload),
      subscribeRelationChangedDebounced((detail) => {
        if (detail.skipQueueReload) return;
        scheduleReload();
      }),
    ];

    return () => {
      for (const unsub of unsubs) unsub();
    };
  }, [loadQueue]);

  useEffect(() => {
    let timeout: number | null = null;
    const onWake = () => {
      if (document.hidden) return;
      if (timeout != null) window.clearTimeout(timeout);
      timeout = window.setTimeout(() => {
        timeout = null;
        void loadQueue({ silent: true });
      }, 300);
    };
    document.addEventListener("visibilitychange", onWake);
    window.addEventListener("focus", onWake);
    return () => {
      document.removeEventListener("visibilitychange", onWake);
      window.removeEventListener("focus", onWake);
      if (timeout != null) window.clearTimeout(timeout);
    };
  }, [loadQueue]);

  const applyLocalEmailSent = useCallback(
    (item: EtiquetteEmailQueueItem, subject: string, sentAtSec: number) => {
      const sentItem = buildSentQueueItem(item, sentAtSec, subject);
      setReady((prev) => prev.filter((row) => !isSameEtiquetteQueueItem(row, item)));
      setScheduled((prev) => prev.filter((row) => !isSameEtiquetteQueueItem(row, item)));
      setSent((prev) => [sentItem, ...prev.filter((row) => !isSameEtiquetteQueueItem(row, item))]);
      setSelectedIds((prev) => {
        const next = new Set(prev);
        next.delete(getEtiquetteQueueItemKey(item));
        return next;
      });
      onQueueChanged?.();
      setDashboardRefreshKey((k) => k + 1);
    },
    [onQueueChanged]
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
      { mode: "cancelled", items: cancelled },
      { mode: "followup", items: followup },
      { mode: "sent", items: sent },
    ];
    for (const { mode, items } of buckets) {
      const match = items.find((i) => i.contact_id === highlightContactId);
      if (match) {
        setSubTab(mode);
        setHighlightRowKey(getEtiquetteQueueItemKey(match));
        window.setTimeout(() => {
          document
            .getElementById(`envoi-row-${getEtiquetteQueueItemKey(match)}`)
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
  }, [
    highlightContactId,
    loading,
    ready,
    scheduled,
    incomplete,
    cancelled,
    sent,
    followup,
  ]);

  const openConfirm = (item: EtiquetteEmailQueueItem) => {
    if (isEtiquetteQueueItemBatchLocked(item)) {
      toast.warning("Cet envoi fait partie d'une salve en cours.");
      return;
    }
    setConfirmItem(item);
  };

  useEffect(() => {
    setSelectedIds(new Set());
  }, [subTab]);

  const toggleSelected = (key: string, checked: boolean) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (checked) next.add(key);
      else next.delete(key);
      return next;
    });
  };

  const selectedReadyItems = readyDisplayed.filter((i) =>
    selectedIds.has(getEtiquetteQueueItemKey(i))
  );
  const selectedReadySendBlocked = selectedReadyItems.some((i) =>
    isCampaignTemplateSendBlocked(i)
  );
  const selectedReadySendBlockReason = selectedReadyItems
    .map((i) => getCampaignTemplateSendBlockReason(i))
    .find(Boolean);
  const selectedFollowupRelanceItems = followup.filter(
    (i) =>
      selectedIds.has(getEtiquetteQueueItemKey(i)) &&
      isTemplateEmailRelanceEnabledForQueue(i.template_variables)
  );

  const openBulkRemove = (
    action: EnvoisBulkRemoveAction,
    items: EtiquetteEmailQueueItem[]
  ) => {
    const selected = items.filter((i) => selectedIds.has(getEtiquetteQueueItemKey(i)));
    if (selected.length === 0) return;
    setBulkConfirm({ action, items: selected });
  };

  const handleBulkRemoveConfirmed = async () => {
    if (!bulkConfirm) return;
    try {
      setBulkRemoving(true);
      const { succeeded, failed } = await runEnvoisBulkRemove(
        bulkConfirm.action,
        bulkConfirm.items
      );
      setBulkConfirm(null);
      setSelectedIds(new Set());
      if (failed === 0) {
        toast.success(
          bulkConfirm.action === "cancel"
            ? `${succeeded} envoi${succeeded > 1 ? "s" : ""} retiré${succeeded > 1 ? "s" : ""} de la file`
            : bulkConfirm.action === "dismiss"
              ? `${succeeded} envoi${succeeded > 1 ? "s" : ""} retiré${succeeded > 1 ? "s" : ""} définitivement`
              : `Suivi ignoré pour ${succeeded} envoi${succeeded > 1 ? "s" : ""}`
        );
      } else {
        toast.warning(`${succeeded} OK, ${failed} en erreur`);
      }
      await loadQueue({ silent: true });
      onQueueChanged?.();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erreur");
    } finally {
      setBulkRemoving(false);
    }
  };

  const modeSupportsSelection = (
    mode: "ready" | "scheduled" | "incomplete" | "cancelled" | "sent" | "followup"
  ) =>
    mode === "ready" ||
    mode === "scheduled" ||
    mode === "incomplete" ||
    mode === "cancelled" ||
    mode === "followup";

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
      await dismissEmailCampaignFollowup(
        item.contact_etiquette_id,
        item.queue_row_kind ?? "etiquette"
      );
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
      await cancelPendingEmailCampaign(
        item.contact_etiquette_id,
        item.queue_row_kind ?? "etiquette"
      );
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

  const handleRestorePending = async (item: EtiquetteEmailQueueItem) => {
    try {
      await restorePendingEmailCampaign(
        item.contact_etiquette_id,
        item.queue_row_kind ?? "etiquette"
      );
      toast.success("Contact remis dans « Prêts à envoyer »");
      setSubTab("ready");
      await loadQueue();
      onQueueChanged?.();
    } catch (e) {
      const msg =
        e instanceof Error ? e.message : typeof e === "string" ? e : "Erreur";
      toast.error(msg.includes("Failed to") ? msg.replace(/^Failed to [^:]+: /, "") : msg);
    }
  };

  const handleDismissCancelledConfirmed = async () => {
    const item = dismissConfirmItem;
    if (!item) return;
    try {
      setDismissing(true);
      await dismissCancelledPendingEmailCampaign(
        item.contact_etiquette_id,
        item.queue_row_kind ?? "etiquette"
      );
      setDismissConfirmItem(null);
      toast.success("Envoi retiré de la liste — ne sera plus reproposé");
      await loadQueue({ silent: true });
      onQueueChanged?.();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erreur");
    } finally {
      setDismissing(false);
    }
  };

  const handlePrepareRelance = async (items: EtiquetteEmailQueueItem[]) => {
    if (items.length === 0) return;
    try {
      setRelancing(true);
      let ok = 0;
      let failed = 0;
      const succeededKeys: string[] = [];
      for (const item of items) {
        try {
          await prepareEmailCampaignRelance(
            item.contact_etiquette_id,
            item.queue_row_kind ?? "etiquette"
          );
          ok += 1;
          succeededKeys.push(getEtiquetteQueueItemKey(item));
        } catch {
          failed += 1;
        }
      }
      if (failed === 0) {
        toast.success(
          ok === 1
            ? "Relance préparée — visible dans Prêts à envoyer"
            : `${ok} relances préparées — visibles dans Prêts à envoyer`
        );
      } else {
        toast.warning(`${ok} relance${ok > 1 ? "s" : ""} OK, ${failed} en erreur`);
      }
      if (succeededKeys.length > 0) {
        setSelectedIds((prev) => {
          const next = new Set(prev);
          for (const key of succeededKeys) next.delete(key);
          return next;
        });
      }
      await loadQueue();
      onQueueChanged?.();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erreur");
    } finally {
      setRelancing(false);
    }
  };

  const renderList = (
    items: EtiquetteEmailQueueItem[],
    options: {
      mode: "ready" | "scheduled" | "incomplete" | "cancelled" | "sent" | "followup";
    }
  ) => {
    if (loading) {
      return (
        <div className="text-center py-8 text-muted-foreground">Chargement...</div>
      );
    }
    if (items.length === 0) {
      if (options.mode === "sent" && scpiDashboard?.lastPrepare) {
        return (
          <div className="text-center py-8 space-y-3">
            <p className="text-muted-foreground text-sm max-w-md mx-auto">
              Les bulletins SCPI ({scpiDashboard.lastPrepare.periode}) ne passent pas par
              « Envoyés » — ils sont tracés dans le{" "}
              <strong>Journal</strong> ({scpiDashboard.sentSincePrepare} envoyé
              {scpiDashboard.sentSincePrepare > 1 ? "s" : ""} pour ce batch).
            </p>
            <Button type="button" variant="outline" size="sm" onClick={() => setSubTab("journal")}>
              Ouvrir le Journal
            </Button>
          </div>
        );
      }
      const empty =
        options.mode === "ready"
          ? "Rien à envoyer pour le moment. Utilisez « Vérifier maintenant », consultez l'onglet Planifiés, et vérifiez la campagne sur l'étiquette (onglet Email) ainsi que l'email en fiche contact."
          : options.mode === "scheduled"
            ? "Aucun envoi planifié pour le moment."
            : options.mode === "incomplete"
              ? "Aucun blocage — parfait. Email manquant, modèle ou date manquante apparaîtront ici."
              : options.mode === "cancelled"
                ? "Aucun envoi retiré de la file. Le bouton ✕ sur Prêts à envoyer ou À compléter place le contact ici."
                : options.mode === "followup"
              ? `Aucune relance suggérée (délai selon chaque modèle, repli ${DEFAULT_EMAIL_RELANCE_FALLBACK_DELAI_JOURS} j).`
              : "Aucun envoi en attente de réponse client.";
      return <div className="text-center py-8 text-muted-foreground">{empty}</div>;
    }

    return (
      <div className="space-y-3">
        {items.map((item) => {
          const rowKey = getEtiquetteQueueItemKey(item);
          const preview =
            options.mode === "ready"
              ? renderEtiquetteEmailPreview(item, cgpConfig)
              : null;
          const scpiSendBlockReason =
            options.mode === "ready" ? getCampaignTemplateSendBlockReason(item) : null;
          const scpiDigestStale =
            options.mode === "ready" &&
            isScpiBulletinQueueItem(item) &&
            isScpiDigestStale(item.campaign_variables);
          const batchLocked =
            options.mode === "ready" &&
            isEtiquetteQueueItemBatchLocked(item);

          return (
            <div
              id={`envoi-row-${rowKey}`}
              key={rowKey}
              className={cn(
                "p-4 border rounded-lg bg-card flex flex-col sm:flex-row sm:items-center gap-3 justify-between",
                highlightRowKey === rowKey && "ring-2 ring-primary/40",
                batchLocked && "opacity-60"
              )}
            >
              {modeSupportsSelection(options.mode) && (
                <Checkbox
                  checked={selectedIds.has(rowKey)}
                  disabled={
                    (options.mode === "ready" && (batchLocked || batchSendRunning)) ||
                    bulkRemoving
                  }
                  onCheckedChange={(v) => toggleSelected(rowKey, v === true)}
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
                ) : options.mode === "cancelled" ? (
                  <p className="text-sm text-amber-700">
                    Retiré de la file (✕) — étiquette et alerte conservées.
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
                {scpiDigestStale ? (
                  <Badge
                    variant="outline"
                    className="text-xs border-amber-300 text-amber-900 bg-amber-50"
                    title="Digest préparé avant une mise à jour CRM ou du modèle — relancez n8n prepare, ne renvoyez pas tel quel."
                  >
                    Régénérer via n8n
                  </Badge>
                ) : null}
                {options.mode === "ready" && preview && (
                  <>
                    <p className="text-xs text-muted-foreground truncate">
                      Objet : {preview.subject}
                    </p>
                    {isScpiBulletinQueueItem(item) ? (
                      <ScpiReadyDigestAccordion item={item} />
                    ) : null}
                    {scpiSendBlockReason ? (
                      <p className="text-xs text-amber-800 dark:text-amber-200">
                        {scpiSendBlockReason}
                      </p>
                    ) : null}
                  </>
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
                    <Button
                      size="sm"
                      disabled={batchLocked || scpiSendBlockReason != null}
                      title={scpiSendBlockReason ?? undefined}
                      onClick={() => openConfirm(item)}
                    >
                      <Send className="h-4 w-4 mr-1" />
                      Confirmer et envoyer
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={batchLocked}
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
                      disabled={relancing}
                      onClick={() => void handlePrepareRelance([item])}
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
                {options.mode === "incomplete" && (
                  <>
                    {(item.queue_issue === "NO_EMAIL" || item.queue_issue === "OTHER") && (
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
                    <Button
                      size="sm"
                      variant="ghost"
                      title="Retirer de la file"
                      onClick={() => setCancelConfirmItem(item)}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </>
                )}
                {options.mode === "cancelled" && (
                  <>
                    <Button size="sm" onClick={() => void handleRestorePending(item)}>
                      <RotateCcw className="h-4 w-4 mr-1" />
                      Remettre en file
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      title="Ne plus proposer cet envoi"
                      onClick={() => setDismissConfirmItem(item)}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </>
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
      {backgroundRefreshing ? (
        <p className="text-xs text-muted-foreground flex items-center gap-1.5">
          <RefreshCw className="h-3 w-3 animate-spin shrink-0" />
          Mise à jour de la file…
        </p>
      ) : null}
      {emailStatus && (
        <EnvoisEmailConnectionBanner
          connected={emailStatus.connected}
          provider={emailStatus.provider}
          email={emailStatus.email}
        />
      )}
      <ScpiCampaignChecklist
        staleReadyCount={scpiStaleReadyCount}
        refreshKey={dashboardRefreshKey}
        onRefreshQueue={() => loadQueue({ silent: true })}
        onNavigateToIncomplete={() => setSubTab("incomplete")}
        onNavigateToReady={() => setSubTab("ready")}
        onSendRemaining={prepareScpiBatchSend}
      />
      <EnvoisQueueStats
        ready={ready.length}
        scheduled={scheduled.length}
        incomplete={incomplete.length}
        cancelled={cancelled.length}
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
            <Button
              variant="outline"
              size="sm"
              disabled={loading || syncing}
              onClick={async () => {
                try {
                  setSyncing(true);
                  const assigned = await runFullEtiquettesRecalc();
                  if (emailStatus?.provider === "google" && emailStatus.connected) {
                    await runAutoSync();
                  }
                  await loadQueue({ silent: true });
                  if (assigned > 0) {
                    toast.success(
                      `${assigned} nouvelle(s) attribution(s) — file actualisée`
                    );
                  } else {
                    toast.success("File d'envoi actualisée");
                  }
                } catch (error) {
                  console.error("Error refreshing email queue:", error);
                  toast.error("Impossible d'actualiser la file d'envoi");
                } finally {
                  setSyncing(false);
                }
              }}
            >
              <RefreshCw className={`h-4 w-4 mr-1 ${syncing ? "animate-spin" : ""}`} />
              Vérifier maintenant
            </Button>
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
              <TabsTrigger value="cancelled" className="gap-2">
                Retirés
                {cancelled.length > 0 && (
                  <Badge variant="secondary" className="bg-slate-200">
                    {cancelled.length}
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
              {scpiBatchPeriod && scpiReadyLive > 0 && (
                <ScpiReadyCampaignBar
                  periode={scpiBatchPeriod}
                  batchCount={scpiBatchReadyItems.length}
                  otherReadyCount={Math.max(0, ready.length - scpiBatchReadyItems.length)}
                  filtered={scpiReadyOnly}
                  onToggleFilter={() => setScpiReadyOnly((v) => !v)}
                  onSelectBatch={prepareScpiBatchSend}
                />
              )}
              {readyDisplayed.length > 0 && (
                <EtiquetteEnvoisSelectionBar
                  items={readyDisplayed}
                  selectedIds={selectedIds}
                  onSelectedIdsChange={setSelectedIds}
                  selectDisabled={batchSendRunning}
                  selectAllLabel={
                    scpiReadyOnly
                      ? "Cocher toute la liste affichée"
                      : "Tout sélectionner"
                  }
                  removeDisabled={bulkRemoving || batchSendRunning}
                  removeLabel={getEnvoisBulkRemoveLabel("cancel")}
                  onRemoveSelection={() => openBulkRemove("cancel", ready)}
                  trailing={
                    <Button
                      size="sm"
                      disabled={
                        selectedReadyItems.length === 0 ||
                        selectedReadySendBlocked ||
                        loading ||
                        batchSendRunning ||
                        isEtiquetteEmailSendActive()
                      }
                      title={
                        selectedReadySendBlockReason ??
                        (selectedReadySendBlocked
                          ? "Sélection avec envoi SCPI bloqué — relancez n8n prepare"
                          : undefined)
                      }
                      onClick={() => setBatchOpen(true)}
                    >
                      <Send className="h-4 w-4 mr-1" />
                      Envoyer la sélection ({selectedReadyItems.length})
                    </Button>
                  }
                />
              )}
              {renderList(readyDisplayed, { mode: "ready" })}
            </TabsContent>
            <TabsContent value="scheduled" className="mt-4 space-y-3">
              <p className="text-xs text-muted-foreground">
                Dates futures des campagnes — passage automatique dans Prêts à envoyer.
              </p>
              {scheduled.length > 0 && (
                <EtiquetteEnvoisSelectionBar
                  items={scheduled}
                  selectedIds={selectedIds}
                  onSelectedIdsChange={setSelectedIds}
                  removeDisabled={bulkRemoving}
                  removeLabel={getEnvoisBulkRemoveLabel("cancel")}
                  onRemoveSelection={() => openBulkRemove("cancel", scheduled)}
                />
              )}
              {renderList(scheduled, { mode: "scheduled" })}
            </TabsContent>
            <TabsContent value="incomplete" className="mt-4 space-y-3">
              {incomplete.length > 0 && (
                <EtiquetteEnvoisSelectionBar
                  items={incomplete}
                  selectedIds={selectedIds}
                  onSelectedIdsChange={setSelectedIds}
                  removeDisabled={bulkRemoving}
                  removeLabel={getEnvoisBulkRemoveLabel("cancel")}
                  onRemoveSelection={() => openBulkRemove("cancel", incomplete)}
                />
              )}
              {renderList(incomplete, { mode: "incomplete" })}
            </TabsContent>
            <TabsContent value="cancelled" className="mt-4 space-y-3">
              <p className="text-xs text-muted-foreground">
                Retirés avec ✕ depuis Prêts à envoyer ou À compléter. <strong>Remettre en file</strong> pour
                repasser en Prêts. <strong>✕ ici</strong> = ne plus proposer cet envoi (liste
                propre, étiquette et alerte conservées).
              </p>
              {cancelled.length > 0 && (
                <EtiquetteEnvoisSelectionBar
                  items={cancelled}
                  selectedIds={selectedIds}
                  onSelectedIdsChange={setSelectedIds}
                  removeDisabled={bulkRemoving}
                  removeLabel={getEnvoisBulkRemoveLabel("dismiss")}
                  onRemoveSelection={() => openBulkRemove("dismiss", cancelled)}
                />
              )}
              {renderList(cancelled, { mode: "cancelled" })}
            </TabsContent>
            <TabsContent value="sent" className="mt-4">
              {renderList(sent, { mode: "sent" })}
            </TabsContent>
            <TabsContent value="followup" className="mt-4 space-y-3">
              <p className="text-xs text-muted-foreground">
                Délai et horaire définis sur chaque modèle (Templates → onglet Relance). Google
                connecté : détection mail + Agenda automatique en arrière-plan (toutes les 3 min).
              </p>
              {followup.length > 0 && (
                <EtiquetteEnvoisSelectionBar
                  items={followup}
                  selectedIds={selectedIds}
                  onSelectedIdsChange={setSelectedIds}
                  removeDisabled={bulkRemoving || relancing}
                  removeLabel={getEnvoisBulkRemoveLabel("dismissFollowup")}
                  onRemoveSelection={() => openBulkRemove("dismissFollowup", followup)}
                  trailing={
                    <Button
                      size="sm"
                      disabled={
                        selectedFollowupRelanceItems.length === 0 || loading || relancing
                      }
                      onClick={() => void handlePrepareRelance(selectedFollowupRelanceItems)}
                    >
                      <RotateCcw className="h-4 w-4 mr-1" />
                      Relancer la sélection ({selectedFollowupRelanceItems.length})
                    </Button>
                  }
                />
              )}
              {renderList(followup, { mode: "followup" })}
            </TabsContent>
            <TabsContent value="journal" className="mt-4">
              <p className="text-xs text-muted-foreground mb-3">
                Historique de tous les envois (individuels et groupés) avec statut et horodatage.
                Les bulletins SCPI trimestriels sont listés ici.
              </p>
              <EmailSendLogTab
                scpiOnly={journalScpiOnly}
                scpiPeriod={scpiBatchPeriod}
                onScpiOnlyChange={setJournalScpiOnly}
              />
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>

      <EtiquetteEmailSendDialog
        item={confirmItem}
        open={!!confirmItem}
        onOpenChange={(o) => !o && setConfirmItem(null)}
        cgpConfig={cgpConfig}
        onSent={(meta) => {
          if (confirmItem && meta) {
            applyLocalEmailSent(confirmItem, meta.subject, meta.sentAtSec);
          } else if (!meta) {
            void loadQueue({ silent: true });
          }
        }}
      />

      <EtiquetteBatchSendDialog
        items={selectedReadyItems}
        open={batchOpen}
        onOpenChange={setBatchOpen}
        cgpConfig={cgpConfig}
        onItemSent={applyLocalEmailSent}
        onDone={() => {
          setSelectedIds(new Set());
          onQueueChanged?.();
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
                {cancelConfirmItem &&
                  (cancelConfirmItem.queue_issue === "NO_EMAIL" ||
                    cancelConfirmItem.queue_issue === "NO_TEMPLATE" ||
                    cancelConfirmItem.queue_issue === "NO_DATE" ||
                    cancelConfirmItem.queue_issue === "OTHER") && (
                    <p>{getIncompleteQueueLabel(cancelConfirmItem.queue_issue)}</p>
                  )}
                {cancelConfirmItem &&
                  cgpConfig &&
                  cancelConfirmItem.queue_issue !== "NO_EMAIL" &&
                  cancelConfirmItem.queue_issue !== "NO_TEMPLATE" &&
                  cancelConfirmItem.queue_issue !== "NO_DATE" &&
                  cancelConfirmItem.queue_issue !== "OTHER" && (
                    <p>
                      Objet :{" "}
                      {renderEtiquetteEmailPreview(cancelConfirmItem, cgpConfig).subject}
                    </p>
                  )}
                <p>
                  Le contact passera dans l&apos;onglet <strong>Retirés</strong>. Vous pourrez le
                  remettre en file ou le retirer définitivement de cette liste.
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
              {cancelling ? "Retrait…" : "Mettre dans Retirés"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={!!bulkConfirm}
        onOpenChange={(open) => {
          if (!open && !bulkRemoving) setBulkConfirm(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {bulkConfirm
                ? getEnvoisBulkRemoveLabel(bulkConfirm.action)
                : "Confirmer"}
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2 text-sm text-muted-foreground">
                <p>
                  {bulkConfirm?.items.length ?? 0} envoi
                  {(bulkConfirm?.items.length ?? 0) > 1 ? "s" : ""} sélectionné
                  {(bulkConfirm?.items.length ?? 0) > 1 ? "s" : ""}.
                </p>
                {bulkConfirm?.action === "cancel" && (
                  <p>
                    Les contacts passeront dans l&apos;onglet <strong>Retirés</strong>. Vous
                    pourrez les remettre en file un par un ou en masse plus tard.
                  </p>
                )}
                {bulkConfirm?.action === "dismiss" && (
                  <p>
                    Ces envois ne seront plus proposés dans la file (étiquettes et alertes
                    conservées).
                  </p>
                )}
                {bulkConfirm?.action === "dismissFollowup" && (
                  <p>Le suivi relance sera ignoré pour ces envois.</p>
                )}
                <ul className="max-h-40 overflow-y-auto text-xs space-y-1 border rounded-md p-2 bg-muted/30">
                  {bulkConfirm?.items.map((item) => (
                    <li key={getEtiquetteQueueItemKey(item)}>
                      {item.contact_prenom} {item.contact_nom} — {item.etiquette_nom}
                    </li>
                  ))}
                </ul>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={bulkRemoving}>Annuler</AlertDialogCancel>
            <AlertDialogAction
              disabled={bulkRemoving}
              onClick={(e) => {
                e.preventDefault();
                void handleBulkRemoveConfirmed();
              }}
            >
              {bulkRemoving ? "Traitement…" : "Confirmer"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={!!dismissConfirmItem}
        onOpenChange={(open) => {
          if (!open && !dismissing) setDismissConfirmItem(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Ne plus proposer cet envoi ?</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2 text-sm text-muted-foreground">
                <p>
                  <strong className="text-foreground">
                    {dismissConfirmItem?.contact_prenom} {dismissConfirmItem?.contact_nom}
                  </strong>
                  {" — "}
                  {dismissConfirmItem?.etiquette_nom}
                </p>
                <p>
                  Le contact disparaît de <strong>Retirés</strong> et ne reviendra plus dans la
                  file pour cet envoi. L&apos;étiquette et l&apos;alerte de suivi restent. Un
                  nouvel envoi pourra être proposé plus tard si la règle auto se réapplique (ex.
                  après mise à jour de la date de dernier contact).
                </p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={dismissing}>Annuler</AlertDialogCancel>
            <AlertDialogAction
              disabled={dismissing}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={(e) => {
                e.preventDefault();
                void handleDismissCancelledConfirmed();
              }}
            >
              {dismissing ? "Retrait…" : "Ne plus proposer"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
