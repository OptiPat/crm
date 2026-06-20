import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { CheckCircle2, Circle, Loader2, Play, RefreshCw } from "lucide-react";
import {
  getScpiCampaignDashboard,
  triggerScpiN8nWorkflow,
  type ScpiCampaignDashboard,
} from "@/lib/api/tauri-scpi-campaign";
import { getLocalApiSettings, type LocalApiSettings } from "@/lib/api/tauri-local-api";
import { formatEtiquetteSendDatetime } from "@/lib/etiquettes/etiquette-email-preview";
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
  onRefreshQueue,
}: {
  staleReadyCount?: number;
  onRefreshQueue?: () => void | Promise<void>;
}) {
  const [dashboard, setDashboard] = useState<ScpiCampaignDashboard | null>(null);
  const [apiSettings, setApiSettings] = useState<LocalApiSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [triggering, setTriggering] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
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
  }, [load]);

  const last = dashboard?.lastPrepare;
  const webhookConfigured = Boolean(apiSettings?.scpiN8nWebhookUrl?.trim());
  const prepareDone = Boolean(last);
  const readyLive = dashboard?.readyCount ?? 0;
  const sentCount = dashboard?.sentSincePrepare ?? 0;
  /** Terminé quand la file Prêts du batch est vide (envoyés, retirés ou déjà envoyés avant re-prepare). */
  const sendDone = prepareDone && readyLive === 0;

  const handleTrigger = async () => {
    setTriggering(true);
    try {
      const msg = await triggerScpiN8nWorkflow();
      toast.success(msg, {
        description:
          "n8n s'exécute en arrière-plan — pas besoin de garder l'interface ouverte. Actualisez la file quand le workflow est terminé.",
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

  if (loading && !dashboard) {
    return (
      <div className="rounded-xl border bg-muted/20 px-4 py-3 text-sm text-muted-foreground flex items-center gap-2">
        <Loader2 className="h-4 w-4 animate-spin shrink-0" />
        Campagne SCPI — chargement…
      </div>
    );
  }

  return (
    <div className="rounded-xl border bg-muted/20 px-4 py-4 space-y-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-sm font-medium">Campagne bulletins SCPI</p>
          {last ? (
            <p className="text-xs text-muted-foreground mt-0.5">
              {last.periode} — dernière préparation{" "}
              {formatEtiquetteSendDatetime(last.preparedAt)}
            </p>
          ) : (
            <p className="text-xs text-muted-foreground mt-0.5">
              Aucune préparation enregistrée — lancez le workflow n8n (PDF → résumés → prepare).
            </p>
          )}
        </div>
        <div className="flex gap-2 shrink-0">
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
              Lancer workflow n8n
            </Button>
          ) : (
            <Button type="button" size="sm" variant="secondary" disabled title="Configurez l'URL webhook dans Paramètres → Intégrations">
              Lancer workflow n8n
            </Button>
          )}
        </div>
      </div>

      <ol className="space-y-2 text-sm">
        <li className="flex items-start gap-2">
          <StepIcon done={false} />
          <span className="text-muted-foreground">
            <strong className="text-foreground font-normal">1. PDF</strong> — déposer les
            bulletins dans le dossier surveillé par n8n (hors CRM).
          </span>
        </li>
        <li className="flex items-start gap-2">
          <StepIcon done={prepareDone} />
          <span>
            <strong className="font-normal">2. n8n → prepare CRM</strong>
            {last
              ? ` — ${last.bulletinsCount} bulletin(s), ${last.contactsMatched} contact(s) ciblé(s), ${last.contactsQueued} en file Prêts.`
              : " — en attente du POST prepare."}
          </span>
        </li>
        <li className="flex items-start gap-2">
          <StepIcon done={sendDone} />
          <span>
            <strong className="font-normal">3. Envoi Gmail</strong>
            {prepareDone
              ? ` — ${sentCount} envoyé(s)${readyLive > 0 ? ` · ${readyLive} encore en file` : ""}.`
              : " — Suivi → Envois → Prêts à envoyer."}
          </span>
        </li>
      </ol>

      {staleReadyCount > 0 ? (
        <p className="text-xs text-amber-800 dark:text-amber-200 flex flex-wrap items-center gap-2">
          <Badge variant="outline" className="border-amber-300 text-amber-900 bg-amber-50">
            Régénérer via n8n
          </Badge>
          {staleReadyCount} ligne(s) en file avec un digest préparé avant la dernière mise à jour
          CRM — relancez n8n prepare (pas un renvoi mail tel quel).
        </p>
      ) : null}

      {!webhookConfigured ? (
        <p className="text-xs text-muted-foreground">
          Pour activer le bouton : Paramètres → Intégrations → URL webhook production du workflow
          SCPI (nœud Webhook en tête de workflow, workflow <strong>activé</strong>).
        </p>
      ) : (
        <p className="text-xs text-muted-foreground">
          n8n doit être <strong>démarré</strong> et le workflow <strong>activé</strong>.
          Le CRM doit rester <strong>ouvert et déverrouillé</strong> (API locale port{" "}
          {apiSettings?.port ?? 3001}) — c&apos;est n8n qui appelle le prepare en fin de parcours.
          PDF dans <code className="text-[11px]">a-traiter</code> uniquement (pas les .md déjà
          générés).
        </p>
      )}
    </div>
  );
}
