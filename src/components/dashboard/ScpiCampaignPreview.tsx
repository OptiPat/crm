import { useState } from "react";
import { Button } from "@/components/ui/button";
import { ArrowRight, FileText, Loader2 } from "lucide-react";
import { useScpiCampaignDashboard } from "@/hooks/useScpiCampaignDashboard";
import { navigateToSuivi } from "@/lib/navigation/suivi-navigation";
import { DashboardPanel } from "./dashboard-ui";
import { formatEtiquetteSendDatetime } from "@/lib/etiquettes/etiquette-email-preview";

export function ScpiCampaignPreview({
  onNavigate,
  currentPage,
}: {
  onNavigate?: (page: string) => void;
  currentPage?: string;
}) {
  const [refreshKey, setRefreshKey] = useState(0);
  const { dashboard, loading } = useScpiCampaignDashboard(refreshKey);

  const last = dashboard?.lastPrepare;
  const ready = dashboard?.readyCount ?? 0;
  const sent = dashboard?.sentSincePrepare ?? 0;

  if (loading && !dashboard) {
    return (
      <DashboardPanel title="Campagne SCPI" description="Chargement…" className="h-full">
        <div className="py-8 flex justify-center text-muted-foreground">
          <Loader2 className="h-6 w-6 animate-spin" />
        </div>
      </DashboardPanel>
    );
  }

  if (!last && ready === 0) {
    return null;
  }

  const active = ready > 0;
  const description = last
    ? `${last.periode} — prepare ${formatEtiquetteSendDatetime(last.preparedAt)}`
    : "Campagne trimestrielle";

  return (
    <DashboardPanel
      title="Campagne bulletins SCPI"
      description={description}
      className="h-full"
      action={
        onNavigate && active ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="gap-1"
            onClick={() => navigateToSuivi(onNavigate, "envois", "ready", undefined, currentPage)}
          >
            Envois
            <ArrowRight className="h-4 w-4" />
          </Button>
        ) : undefined
      }
    >
      <div className="space-y-3 py-2">
        <div className="flex items-start gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-violet-50 shrink-0">
            <FileText className="h-5 w-5 text-violet-700" />
          </span>
          <div className="text-sm">
            {active ? (
              <p>
                <strong className="text-foreground">{ready}</strong> bulletin
                {ready > 1 ? "s" : ""} en file Prêts
              </p>
            ) : (
              <p className="text-muted-foreground">File Prêts vide pour ce batch.</p>
            )}
            {sent > 0 ? (
              <p className="text-xs text-muted-foreground mt-1">
                {sent} envoyé{sent > 1 ? "s" : ""} depuis le prepare
              </p>
            ) : null}
          </div>
        </div>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="text-xs h-8"
          onClick={() => setRefreshKey((k) => k + 1)}
        >
          Actualiser
        </Button>
      </div>
    </DashboardPanel>
  );
}
