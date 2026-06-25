import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  CheckCircle2,
  ChevronDown,
  Circle,
  Copy,
  HelpCircle,
  Loader2,
  Play,
  RefreshCw,
  Send,
} from "lucide-react";
import {
  getScpiCampaignDashboard,
  triggerScpiN8nWorkflow,
  type ScpiCampaignDashboard,
} from "@/lib/api/tauri-scpi-campaign";
import { getLocalApiSettings, type LocalApiSettings } from "@/lib/api/tauri-local-api";
import { formatEtiquetteSendDatetime } from "@/lib/etiquettes/etiquette-email-preview";
import { SCPI_PDF_DROP_FOLDER } from "@/lib/emails/scpi-envois-filters";
import { ScpiTrimestreGuideDialog } from "@/components/etiquettes/ScpiTrimestreGuideDialog";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

function StepIcon({ done }: { done: boolean }) {
  return done ? (
    <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" aria-hidden />
  ) : (
    <Circle className="h-4 w-4 text-muted-foreground shrink-0" aria-hidden />
  );
}

export function ScpiCampaignChecklist({
  staleReadyCount = 0,
  refreshKey = 0,
  onRefreshQueue,
  onNavigateToIncomplete,
  onNavigateToReady,
  onSendRemaining,
}: {
  staleReadyCount?: number;
  /** Incrémenté après chaque mutation de file → recharge le dashboard. */
  refreshKey?: number;
  onRefreshQueue?: () => void | Promise<void>;
  onNavigateToIncomplete?: () => void;
  onNavigateToReady?: () => void;
  onSendRemaining?: () => void;
}) {
  const [dashboard, setDashboard] = useState<ScpiCampaignDashboard | null>(null);
  const [apiSettings, setApiSettings] = useState<LocalApiSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [triggering, setTriggering] = useState(false);
  const [collapsed, setCollapsed] = useState(true);
  const [guideOpen, setGuideOpen] = useState(false);

  const load = useCallback(async () => {
    try {
      const [dash, settings] = await Promise.all([
        getScpiCampaignDashboard(),
        getLocalApiSettings(),
      ]);
      setDashboard(dash);
      setApiSettings(settings);
    } catch (error) {
      console.error(error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load, refreshKey]);

  const last = dashboard?.lastPrepare;
  const webhookConfigured = Boolean(apiSettings?.scpiN8nWebhookUrl?.trim());
  const prepareDone = Boolean(last);
  const readyLive = dashboard?.readyCount ?? 0;
  const sentCount = dashboard?.sentSincePrepare ?? 0;
  const sendDone = prepareDone && readyLive === 0;
  const campaignActive = prepareDone && readyLive > 0;

  const handleTrigger = async () => {
    setTriggering(true);
    try {
      const msg = await triggerScpiN8nWorkflow();
      toast.success(msg, {
        description:
          "n8n s'exécute en arrière-plan. Actualisez la file quand le workflow est terminé.",
        duration: 8000,
      });
      await load();
      await onRefreshQueue?.();
    } catch (error) {
      console.error(error);
      toast.error(
        error instanceof Error ? error.message : "Impossible de lancer le workflow n8n."
      );
    } finally {
      setTriggering(false);
    }
  };

  const copyDropFolder = async () => {
    try {
      await navigator.clipboard.writeText(SCPI_PDF_DROP_FOLDER);
      toast.success("Chemin copié.");
    } catch {
      toast.error("Copie impossible.");
    }
  };

  if (loading && !dashboard) {
    return (
      <div className="rounded-xl border bg-muted/20 px-4 py-3 text-sm text-muted-foreground flex items-center gap-2">
        <Loader2 className="h-4 w-4 animate-spin shrink-0" />
        Campagne SCPI — chargement…
      </div>
    );
  }

  return (
    <>
      <div
        className={cn(
          "rounded-xl border bg-muted/20 overflow-hidden",
          campaignActive && "border-violet-200/80 ring-1 ring-violet-100/80"
        )}
      >
        <div
          className={cn(
            "sticky top-0 z-10 bg-muted/95 backdrop-blur-sm border-b border-border/40 px-4 py-3",
            !collapsed && "border-b"
          )}
        >
          <div className="flex flex-wrap items-start justify-between gap-3">
            <button
              type="button"
              className="flex items-start gap-2 text-left min-w-0"
              onClick={() => setCollapsed((v) => !v)}
            >
              <ChevronDown
                className={cn(
                  "h-4 w-4 shrink-0 mt-0.5 text-muted-foreground transition-transform",
                  collapsed && "-rotate-90"
                )}
              />
              <div>
                <p className="text-sm font-medium">Campagne bulletins SCPI</p>
                {last ? (
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {last.periode} — prepare{" "}
                    {formatEtiquetteSendDatetime(last.preparedAt)}
                    {readyLive > 0 ? ` · ${readyLive} en file` : sendDone ? " · terminée" : ""}
                  </p>
                ) : (
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Aucune préparation — PDF → n8n → prepare CRM
                  </p>
                )}
              </div>
            </button>
            <div className="flex flex-wrap gap-2 shrink-0">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                title="Guide trimestre"
                onClick={() => setGuideOpen(true)}
              >
                <HelpCircle className="h-4 w-4" />
              </Button>
              <Button type="button" variant="ghost" size="sm" onClick={() => void load()}>
                <RefreshCw className="h-4 w-4 mr-1" />
                Actualiser
              </Button>
              {webhookConfigured ? (
                <Button
                  type="button"
                  size="sm"
                  disabled={triggering}
                  onClick={() => void handleTrigger()}
                >
                  {triggering ? (
                    <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                  ) : (
                    <Play className="h-4 w-4 mr-1" />
                  )}
                  n8n
                </Button>
              ) : null}
              {campaignActive && onSendRemaining ? (
                <Button type="button" size="sm" onClick={onSendRemaining}>
                  <Send className="h-4 w-4 mr-1" />
                  Envoyer ({readyLive})
                </Button>
              ) : null}
            </div>
          </div>
        </div>

        {!collapsed && (
          <div className="px-4 py-4 space-y-3">
            <ol className="space-y-2 text-sm">
              <li className="flex items-start gap-2">
                <StepIcon done={false} />
                <span className="text-muted-foreground">
                  <strong className="text-foreground font-normal">1. PDF</strong> —{" "}
                  <button
                    type="button"
                    className="text-primary underline"
                    onClick={() => void copyDropFolder()}
                  >
                    {SCPI_PDF_DROP_FOLDER}
                  </button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6 ml-1 align-middle"
                    title="Copier le chemin"
                    onClick={() => void copyDropFolder()}
                  >
                    <Copy className="h-3.5 w-3.5" />
                  </Button>
                </span>
              </li>
              <li className="flex items-start gap-2">
                <StepIcon done={prepareDone} />
                <span>
                  <strong className="font-normal">2. n8n → prepare CRM</strong>
                  {last ? (
                    <>
                      {" "}
                      — {last.bulletinsCount} bulletin(s), {last.contactsMatched} contact(s),{" "}
                      <strong>{last.contactsQueued}</strong> en file Prêts
                      {last.contactsNoEmail > 0 ? (
                        <>
                          {" · "}
                          <button
                            type="button"
                            className="text-amber-800 underline"
                            onClick={onNavigateToIncomplete}
                          >
                            {last.contactsNoEmail} sans email
                          </button>
                        </>
                      ) : null}
                      {last.contactsSkippedAlreadySent > 0 ? (
                        <> · {last.contactsSkippedAlreadySent} déjà envoyés ce trimestre</>
                      ) : null}
                      .
                    </>
                  ) : (
                    " — en attente du POST prepare."
                  )}
                </span>
              </li>
              <li className="flex items-start gap-2">
                <StepIcon done={sendDone} />
                <span>
                  <strong className="font-normal">3. Envoi Gmail</strong>
                  {prepareDone ? (
                    <>
                      {" "}
                      — {sentCount} envoyé(s)
                      {readyLive > 0 ? (
                        <>
                          {" · "}
                          <button
                            type="button"
                            className="text-primary underline"
                            onClick={onNavigateToReady}
                          >
                            {readyLive} encore en file
                          </button>
                        </>
                      ) : null}
                      . Historique : onglet <strong>Journal</strong>.
                    </>
                  ) : (
                    " — Suivi → Envois → Prêts à envoyer."
                  )}
                </span>
              </li>
            </ol>

            {staleReadyCount > 0 ? (
              <p className="text-xs text-amber-800 dark:text-amber-200 flex flex-wrap items-center gap-2">
                <Badge variant="outline" className="border-amber-300 text-amber-900 bg-amber-50">
                  Régénérer via n8n
                </Badge>
                {staleReadyCount} ligne(s) avec digest obsolète — relancez n8n prepare.
              </p>
            ) : null}

            <p className="text-xs text-muted-foreground">
              Un nouveau prepare remet en file les contacts retirés (✕). n8n doit être démarré,
              workflow activé, CRM ouvert (API port {apiSettings?.port ?? 3001}).
            </p>
          </div>
        )}
      </div>

      <ScpiTrimestreGuideDialog
        open={guideOpen}
        onOpenChange={setGuideOpen}
        onCopyDropFolder={() => void copyDropFolder()}
      />
    </>
  );
}
