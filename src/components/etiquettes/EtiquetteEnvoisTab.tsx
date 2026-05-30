import { useCallback, useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
} from "lucide-react";
import {
  getEtiquetteEmailQueue,
  markEmailCampaignResponse,
  dismissEmailCampaignFollowup,
  prepareEmailCampaignRelance,
  getContrastColor,
  type EtiquetteEmailQueueItem,
} from "@/lib/api/tauri-etiquettes";
import { getCgpConfig, type CgpConfig } from "@/lib/api/tauri-settings";
import { syncEmailCampaignResponses } from "@/lib/api/tauri-email";
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
import { notifyRelationChanged } from "@/lib/etiquettes/etiquette-events";
import { useAppAutoRefresh } from "@/hooks/useAppAutoRefresh";
import { consumeEnvoisContactFocus } from "@/lib/navigation/suivi-navigation";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

interface EtiquetteEnvoisTabProps {
  onOpenContact?: (contactId: number) => void;
  onQueueChanged?: () => void;
}

export function EtiquetteEnvoisTab({ onOpenContact, onQueueChanged }: EtiquetteEnvoisTabProps) {
  const [ready, setReady] = useState<EtiquetteEmailQueueItem[]>([]);
  const [incomplete, setIncomplete] = useState<EtiquetteEmailQueueItem[]>([]);
  const [sent, setSent] = useState<EtiquetteEmailQueueItem[]>([]);
  const [followup, setFollowup] = useState<EtiquetteEmailQueueItem[]>([]);
  const [cgpConfig, setCgpConfig] = useState<CgpConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [subTab, setSubTab] = useState<
    "ready" | "incomplete" | "sent" | "followup"
  >("ready");
  const [confirmItem, setConfirmItem] = useState<EtiquetteEmailQueueItem | null>(null);
  const [emailStatus, setEmailStatus] = useState<EmailConnectionStatus | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [highlightContactId, setHighlightContactId] = useState<number | null>(null);
  const [highlightRowKey, setHighlightRowKey] = useState<number | null>(null);

  const runAutoSync = useCallback(async () => {
    if (emailStatus?.provider !== "google" || !emailStatus.connected) return;
    try {
      setSyncing(true);
      const r = await syncEmailCampaignResponses();
      if (r.mail_detected > 0 || r.rdv_detected > 0) {
        const parts: string[] = [];
        if (r.mail_detected > 0) parts.push(`${r.mail_detected} réponse(s) mail`);
        if (r.rdv_detected > 0) parts.push(`${r.rdv_detected} RDV Agenda`);
        toast.success(`Détection auto : ${parts.join(", ")}`);
        notifyRelationChanged();
      }
      if (r.errors.length > 0) {
        toast.warning(r.errors[0]);
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (!msg.includes("reconnectez") && !msg.includes("Connectez Google")) {
        console.warn("sync email:", msg);
      }
    } finally {
      setSyncing(false);
    }
  }, [emailStatus?.provider, emailStatus?.connected]);

  useEffect(() => {
    const raw = sessionStorage.getItem("crm_nav_suivi_envois_subtab");
    if (
      raw === "ready" ||
      raw === "incomplete" ||
      raw === "sent" ||
      raw === "followup"
    ) {
      setSubTab(raw);
      sessionStorage.removeItem("crm_nav_suivi_envois_subtab");
    }
    const focusId = consumeEnvoisContactFocus();
    if (focusId != null) setHighlightContactId(focusId);
  }, []);

  const loadQueue = useCallback(async () => {
    try {
      setLoading(true);
      const [cgp, r, i, s, f, emailConn] = await Promise.all([
        getCgpConfig(),
        getEtiquetteEmailQueue("ready"),
        getEtiquetteEmailQueue("incomplete"),
        getEtiquetteEmailQueue("sent"),
        getEtiquetteEmailQueue("followup"),
        getEmailConnectionStatus(),
      ]);
      setCgpConfig(cgp);
      setReady(r);
      setIncomplete(i);
      setSent(s);
      setFollowup(f);
      setEmailStatus(emailConn);
      if (emailConn.provider === "google" && emailConn.connected) {
        try {
          const r = await syncEmailCampaignResponses();
          if (r.mail_detected > 0 || r.rdv_detected > 0) {
            const parts: string[] = [];
            if (r.mail_detected > 0) parts.push(`${r.mail_detected} réponse(s) mail`);
            if (r.rdv_detected > 0) parts.push(`${r.rdv_detected} RDV Agenda`);
            toast.success(`Détection auto : ${parts.join(", ")}`);
            notifyRelationChanged();
            const [r2, i2, s2, f2] = await Promise.all([
              getEtiquetteEmailQueue("ready"),
              getEtiquetteEmailQueue("incomplete"),
              getEtiquetteEmailQueue("sent"),
              getEtiquetteEmailQueue("followup"),
            ]);
            setReady(r2);
            setIncomplete(i2);
            setSent(s2);
            setFollowup(f2);
          }
        } catch (syncErr) {
          const msg = syncErr instanceof Error ? syncErr.message : String(syncErr);
          if (msg.includes("reconnectez") || msg.includes("Agenda")) {
            toast.warning(msg);
          }
        }
      }
      onQueueChanged?.();
    } catch (error) {
      console.error("Error loading email queue:", error);
      toast.error("Erreur lors du chargement de la file d'envoi");
    } finally {
      setLoading(false);
    }
  }, [onQueueChanged]);

  useEffect(() => {
    void loadQueue();
  }, [loadQueue]);

  useAppAutoRefresh(() => loadQueue());

  useEffect(() => {
    if (highlightContactId == null || loading) return;
    const buckets: Array<{
      mode: typeof subTab;
      items: EtiquetteEmailQueueItem[];
    }> = [
      { mode: "ready", items: ready },
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
  }, [highlightContactId, loading, ready, incomplete, sent, followup]);

  useEffect(() => {
    if (emailStatus?.provider !== "google" || !emailStatus.connected) return;
    const syncAndReload = async () => {
      await runAutoSync();
      await loadQueue();
    };
    const id = window.setInterval(() => {
      if (!document.hidden) void syncAndReload();
    }, 180_000);
    return () => window.clearInterval(id);
  }, [emailStatus?.provider, emailStatus?.connected, runAutoSync, loadQueue]);

  const openConfirm = (item: EtiquetteEmailQueueItem) => {
    setConfirmItem(item);
  };

  const suiviJours = cgpConfig?.email_suivi_delai_jours ?? 5;

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

  const handlePrepareRelance = async (item: EtiquetteEmailQueueItem) => {
    try {
      await prepareEmailCampaignRelance(item.contact_etiquette_id);
      toast.success("Contact remis dans « Prêts à envoyer » pour une relance");
      setSubTab("ready");
      await loadQueue();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erreur");
    }
  };

  const renderList = (
    items: EtiquetteEmailQueueItem[],
    options: { mode: "ready" | "incomplete" | "sent" | "followup" }
  ) => {
    if (loading) {
      return (
        <div className="text-center py-8 text-muted-foreground">Chargement...</div>
      );
    }
    if (items.length === 0) {
      const empty =
        options.mode === "ready"
          ? "Aucun email prêt. Sur une étiquette : activer « Campagne email », choisir un template, date d'envoi passée ou aujourd'hui, étiquette active, puis recalculer. Les contacts doivent avoir un email en fiche."
          : options.mode === "incomplete"
            ? "Aucun contact en attente. Soit aucune campagne email n'est configurée, soit tout est déjà dans « Prêts » / « Envoyés »."
            : options.mode === "followup"
              ? `Aucune relance à proposer (${suiviJours} jours sans retour enregistré).`
              : "Aucun envoi récent enregistré.";
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
              <div className="space-y-1 min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium">
                    {item.contact_prenom} {item.contact_nom}
                  </span>
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
                    Aucun retour enregistré depuis {suiviJours} jours (mail ou RDV).
                  </p>
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
                  <Button size="sm" onClick={() => openConfirm(item)}>
                    <Send className="h-4 w-4 mr-1" />
                    Confirmer et envoyer
                  </Button>
                )}
                {options.mode === "followup" && (
                  <>
                    <Button
                      size="sm"
                      onClick={() => void handlePrepareRelance(item)}
                    >
                      <RotateCcw className="h-4 w-4 mr-1" />
                      Relancer
                    </Button>
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
      <p className="text-sm text-muted-foreground bg-muted/50 border rounded-lg px-4 py-3">
        Les envois passent par cette application : gardez le <strong>CRM ouvert</strong>, configurez
        votre boîte dans Paramètres → Email, puis confirmez chaque message ici. La file se remplit
        même CRM fermé ; l&apos;envoi réel nécessite l&apos;app lancée.
      </p>
      {emailStatus && !emailStatus.connected && (
        <p className="text-sm text-amber-900 bg-amber-50 border border-amber-200 rounded-lg px-4 py-3 flex items-start gap-2">
          <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
          <span>
            Aucune boîte connectée (OAuth ou SMTP). Configurez l&apos;envoi dans{" "}
            <strong>Paramètres → Email</strong> avant d&apos;envoyer depuis cette file.
          </span>
        </p>
      )}
      {emailStatus?.connected && emailStatus.method === "oauth" && (
        <p className="text-sm text-green-900 bg-green-50 border border-green-200 rounded-lg px-4 py-3">
          Boîte active : {emailStatus.provider === "google" ? "Google" : "Microsoft"} —{" "}
          {emailStatus.email ?? ""}
        </p>
      )}
      {emailStatus?.connected && emailStatus.method === "smtp" && (
        <p className="text-sm text-amber-900 bg-amber-50 border border-amber-200 rounded-lg px-4 py-3 flex items-start gap-2">
          <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
          <span>
            Boîte active : <strong>ancienne config SMTP</strong> (pas Gmail OAuth). Paramètres → Email →{" "}
            <strong>Supprimer l&apos;ancienne config SMTP</strong>, puis <strong>Connecter Google</strong>.
          </span>
        </p>
      )}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Mail className="h-5 w-5" />
              File d&apos;envoi
            </CardTitle>
            <CardDescription>
              Les emails ne partent qu&apos;après votre confirmation, un contact à la fois.
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
                Vérifier réponses
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
            </TabsList>
            <TabsContent value="ready" className="mt-4">
              {renderList(ready, { mode: "ready" })}
            </TabsContent>
            <TabsContent value="incomplete" className="mt-4">
              {renderList(incomplete, { mode: "incomplete" })}
            </TabsContent>
            <TabsContent value="sent" className="mt-4">
              {renderList(sent, { mode: "sent" })}
            </TabsContent>
            <TabsContent value="followup" className="mt-4">
              <p className="text-xs text-muted-foreground mb-3">
                Délai : {suiviJours} jours (Paramètres → Profil). Avec Google connecté, le CRM
                détecte les réponses mail et les RDV Agenda (bouton « Vérifier réponses » ou à
                l&apos;actualisation). Reconnectez Google si l&apos;accès Agenda est refusé.
              </p>
              {renderList(followup, { mode: "followup" })}
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>

      <EtiquetteEmailSendDialog
        item={confirmItem}
        open={!!confirmItem}
        onOpenChange={(o) => !o && setConfirmItem(null)}
        cgpConfig={cgpConfig}
        onSent={() => void loadQueue()}
      />
    </div>
  );
}
