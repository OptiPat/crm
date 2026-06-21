import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { ArrowRight, Loader2, Mail } from "lucide-react";
import { useEmailCampaignsDashboard } from "@/hooks/useEmailCampaignsDashboard";
import {
  buildEmailCampaignRows,
  formatCampaignPreparedAt,
} from "@/lib/emails/email-campaigns-dashboard";
import { navigateToSuivi } from "@/lib/navigation/suivi-navigation";
import { DashboardPanel } from "./dashboard-ui";
import { cn } from "@/lib/utils";

export function ScpiCampaignPreview({
  onNavigate,
  currentPage,
}: {
  onNavigate?: (page: string) => void;
  currentPage?: string;
}) {
  const [refreshKey, setRefreshKey] = useState(0);
  const { scpi, stellium, loading } = useEmailCampaignsDashboard(refreshKey);

  const rows = useMemo(
    () => buildEmailCampaignRows(scpi, stellium),
    [scpi, stellium]
  );

  const hasActiveReady = rows.some((r) => r.active);

  if (loading && rows.length === 0) {
    return (
      <DashboardPanel title="Campagnes email" description="Chargement…" className="h-full">
        <div className="py-8 flex justify-center text-muted-foreground">
          <Loader2 className="h-6 w-6 animate-spin" />
        </div>
      </DashboardPanel>
    );
  }

  if (rows.length === 0) {
    return null;
  }

  return (
    <DashboardPanel
      title="Campagnes email"
      description="SCPI trimestrielles et perf Stellium AV/PER"
      className="h-full"
      action={
        onNavigate && hasActiveReady ? (
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
      <div className="space-y-3 py-1">
        <div className="overflow-x-auto rounded-lg border border-border/60">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border/60 bg-muted/30 text-left text-xs text-muted-foreground">
                <th className="px-3 py-2 font-medium">Campagne</th>
                <th className="px-3 py-2 font-medium">Période</th>
                <th className="px-3 py-2 font-medium hidden sm:table-cell">Prepare</th>
                <th className="px-3 py-2 font-medium text-right">Prêts</th>
                <th className="px-3 py-2 font-medium text-right">Envoyés</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr
                  key={row.kind}
                  className={cn(
                    "border-b border-border/40 last:border-0",
                    row.active && "bg-violet-50/50 dark:bg-violet-950/20"
                  )}
                >
                  <td className="px-3 py-2.5">
                    <div className="flex items-center gap-2 min-w-0">
                      <Mail
                        className={cn(
                          "h-4 w-4 shrink-0",
                          row.kind === "scpi" ? "text-violet-700" : "text-amber-700"
                        )}
                        aria-hidden
                      />
                      <span className="font-medium text-foreground truncate">{row.label}</span>
                    </div>
                  </td>
                  <td className="px-3 py-2.5 text-muted-foreground whitespace-nowrap">
                    {row.periode}
                  </td>
                  <td className="px-3 py-2.5 text-muted-foreground text-xs hidden sm:table-cell whitespace-nowrap">
                    {formatCampaignPreparedAt(row.preparedAt)}
                  </td>
                  <td className="px-3 py-2.5 text-right tabular-nums">
                    {row.readyCount > 0 ? (
                      <strong className="text-foreground">{row.readyCount}</strong>
                    ) : (
                      <span className="text-muted-foreground">0</span>
                    )}
                  </td>
                  <td className="px-3 py-2.5 text-right tabular-nums text-muted-foreground">
                    {row.sentCount}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="text-xs text-muted-foreground">
          Prêts = file Suivi → Envois. Perf Stellium : prepare depuis Investissements ou Modèles
          email.
        </p>
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
