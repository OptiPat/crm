import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  CheckCircle2,
  ChevronDown,
  Circle,
  FileUp,
  Loader2,
  RefreshCw,
} from "lucide-react";
import { StelliumContratsImportDialog } from "@/components/investissements/StelliumContratsImportDialog";
import {
  discoverStelliumPerfCampaignPrepareInput,
  discoverResponseToPrepareInput,
  getStelliumPerfCampaignDashboard,
  type DiscoverStelliumPerfCampaignPrepareResponse,
  type StelliumPerfCampaignDashboard,
} from "@/lib/api/tauri-stellium-perf-campaign";
import { StelliumPerfPrepareCampaignButton } from "@/components/emails/StelliumPerfPrepareCampaignButton";
import { formatEtiquetteSendDatetime } from "@/lib/etiquettes/etiquette-email-preview";
import { cn } from "@/lib/utils";

function StepIcon({ done }: { done: boolean }) {
  return done ? (
    <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" aria-hidden />
  ) : (
    <Circle className="h-4 w-4 text-muted-foreground shrink-0" aria-hidden />
  );
}

export function StelliumPerfCampaignPanel({
  refreshKey = 0,
  onRefreshQueue,
  onNavigateToIncomplete,
  onNavigateToReady,
  onOpenTemplatesEmail,
  onOpenInvestissements,
}: {
  refreshKey?: number;
  onRefreshQueue?: () => void | Promise<void>;
  onNavigateToIncomplete?: () => void;
  onNavigateToReady?: () => void;
  onOpenTemplatesEmail?: () => void;
  onOpenInvestissements?: () => void;
}) {
  const [dashboard, setDashboard] = useState<StelliumPerfCampaignDashboard | null>(null);
  const [releve, setReleve] = useState<DiscoverStelliumPerfCampaignPrepareResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [collapsed, setCollapsed] = useState(true);
  const [showImport, setShowImport] = useState(false);
  const [investissementsVersion, setInvestissementsVersion] = useState(0);

  const load = useCallback(async () => {
    try {
      const [dash, discovered] = await Promise.all([
        getStelliumPerfCampaignDashboard(),
        discoverStelliumPerfCampaignPrepareInput().catch(() => null),
      ]);
      setDashboard(dash);
      setReleve(discovered);
    } catch (error) {
      console.error(error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load, refreshKey]);

  const handlePrepared = async () => {
    await load();
    await onRefreshQueue?.();
  };

  const handleImportApplied = async () => {
    setInvestissementsVersion((v) => v + 1);
    await load();
    await onRefreshQueue?.();
  };

  const last = dashboard?.lastPrepare;
  const prepareDone = Boolean(last);
  const readyLive = dashboard?.readyCount ?? 0;
  const sentCount = dashboard?.sentSincePrepare ?? 0;
  const sendDone = prepareDone && readyLive === 0;
  const campaignActive = prepareDone && readyLive > 0;
  const importReady = Boolean(releve?.contractCount);

  const releveHint = loading
    ? "Chargement…"
    : releve
      ? `${releve.periode} · ${releve.contractCount} contrat${releve.contractCount > 1 ? "s" : ""} éligibles`
      : "Aucun relevé — importez le fichier Contrats Stellium";

  if (loading && !dashboard) {
    return (
      <div className="rounded-xl border bg-muted/20 px-4 py-3 text-sm text-muted-foreground flex items-center gap-2">
        <Loader2 className="h-4 w-4 animate-spin shrink-0" />
        Campagne Perf Stellium — chargement…
      </div>
    );
  }

  return (
    <div
      className={cn(
        "rounded-xl border bg-muted/20 overflow-hidden",
        campaignActive && "border-amber-200/80 ring-1 ring-amber-100/80"
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
              <p className="text-sm font-medium">Perf Stellium AV/PER</p>
              {last ? (
                <p className="text-xs text-muted-foreground mt-0.5">
                  {last.periode} — prepare {formatEtiquetteSendDatetime(last.preparedAt)}
                  {readyLive > 0 ? ` · ${readyLive} en file` : sendDone ? " · terminée" : ""}
                </p>
              ) : (
                <p className="text-xs text-muted-foreground mt-0.5 truncate">{releveHint}</p>
              )}
            </div>
          </button>
          <div className="flex flex-wrap items-center gap-2 shrink-0 ml-auto">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setShowImport(true)}
            >
              <FileUp className="h-4 w-4 mr-1" />
              Import Stellium
            </Button>
            <Button type="button" variant="ghost" size="sm" onClick={() => void load()}>
              <RefreshCw className="h-4 w-4 mr-1" />
              Actualiser
            </Button>
            <StelliumPerfPrepareCampaignButton
              size="sm"
              variant="default"
              disabled={!loading && releve == null}
              label="Préparer"
              importInput={releve ? discoverResponseToPrepareInput(releve) : null}
              onPrepared={() => void handlePrepared()}
            />
          </div>
        </div>
      </div>

      {!collapsed && (
        <div className="px-4 py-4 space-y-3">
          <ol className="space-y-2 text-sm">
            <li className="flex items-start gap-2">
              <StepIcon done={importReady} />
              <span className="text-muted-foreground">
                <strong className="text-foreground font-normal">1. Import encours</strong>
                {importReady ? (
                  <> — {releveHint}.</>
                ) : (
                  <>
                    {" "}
                    —{" "}
                    <button
                      type="button"
                      className="text-primary underline"
                      onClick={() => setShowImport(true)}
                    >
                      Importer le fichier Contrats Stellium
                    </button>
                    {onOpenInvestissements ? (
                      <>
                        {" "}
                        (ou{" "}
                        <button
                          type="button"
                          className="text-primary underline"
                          onClick={onOpenInvestissements}
                        >
                          page Investissements
                        </button>
                        ).
                      </>
                    ) : (
                      "."
                    )}
                  </>
                )}
              </span>
            </li>
            <li className="flex items-start gap-2">
              <StepIcon done={prepareDone} />
              <span>
                <strong className="font-normal">2. Préparer CRM</strong>
                {last ? (
                  <>
                    {" "}
                    — {last.contractCount} contrat(s), {last.contactsMatched} contact(s),{" "}
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
                      <> · {last.contactsSkippedAlreadySent} déjà envoyés ce mois</>
                    ) : null}
                    .
                  </>
                ) : (
                  " — importez un relevé puis cliquez Préparer."
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
                  " — file Prêts ci-dessous."
                )}
              </span>
            </li>
          </ol>

          <p className="text-xs text-muted-foreground leading-relaxed">
            Mise en forme du mail : modèle{" "}
            <strong className="text-foreground">Performance AV/PER Stellium</strong>
            {onOpenTemplatesEmail ? (
              <>
                {" "}
                (
                <button
                  type="button"
                  className="text-primary underline"
                  onClick={onOpenTemplatesEmail}
                >
                  Modèles email
                </button>
                ) — variables{" "}
              </>
            ) : (
              " — variables "
            )}
            <code className="text-[11px]">{`{{encours}}`}</code>,{" "}
            <code className="text-[11px]">{`{{nets}}`}</code>,{" "}
            <code className="text-[11px]">{`{{releve_date_label}}`}</code>. Enregistrez le modèle
            avant de préparer.
          </p>
        </div>
      )}

      <StelliumContratsImportDialog
        open={showImport}
        onOpenChange={setShowImport}
        investissementsVersion={investissementsVersion}
        onApplied={() => void handleImportApplied()}
        onPrepared={() => void handlePrepared()}
      />
    </div>
  );
}
