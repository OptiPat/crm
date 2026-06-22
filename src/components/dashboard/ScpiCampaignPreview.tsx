import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { ArrowRight, ChevronDown, Loader2, Mail } from "lucide-react";
import { useEmailCampaignsDashboard } from "@/hooks/useEmailCampaignsDashboard";
import {
  buildEmailCampaignRows,
  formatCampaignPreparedAt,
} from "@/lib/emails/email-campaigns-dashboard";
import {
  loadDashboardSectionOpen,
  saveDashboardSectionOpen,
} from "@/lib/dashboard/dashboard-page-preferences";
import { navigateToSuivi } from "@/lib/navigation/suivi-navigation";
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
  const readyTotal = rows.reduce((sum, row) => sum + row.readyCount, 0);

  const [collapsed, setCollapsed] = useState(
    () => !loadDashboardSectionOpen("campagnes_email", hasActiveReady)
  );

  const toggleCollapsed = () => {
    setCollapsed((value) => {
      const next = !value;
      saveDashboardSectionOpen("campagnes_email", !next);
      return next;
    });
  };

  if (loading && rows.length === 0) {
    return (
      <div className="rounded-2xl border border-border/70 bg-card shadow-sm px-5 py-3.5 text-sm text-muted-foreground flex items-center gap-2">
        <Loader2 className="h-4 w-4 animate-spin shrink-0" />
        Campagnes email — chargement…
      </div>
    );
  }

  if (rows.length === 0) {
    return null;
  }

  const summaryHint =
    readyTotal > 0
      ? `${readyTotal} prêt${readyTotal > 1 ? "s" : ""} en file`
      : "Aucun envoi en attente";

  return (
    <div
      className={cn(
        "rounded-2xl border border-border/70 bg-card shadow-sm overflow-hidden",
        hasActiveReady && "ring-1 ring-violet-100/80 border-violet-200/60"
      )}
    >
      <div
        className={cn(
          "px-5 py-3.5 shrink-0",
          !collapsed && "border-b border-border/50"
        )}
      >
        <div className="flex flex-wrap items-center justify-between gap-3">
          <button
            type="button"
            className="flex items-start gap-2 text-left min-w-0"
            onClick={toggleCollapsed}
            aria-expanded={!collapsed}
          >
            <ChevronDown
              className={cn(
                "h-4 w-4 shrink-0 mt-0.5 text-muted-foreground transition-transform",
                collapsed && "-rotate-90"
              )}
              aria-hidden
            />
            <div className="min-w-0">
              <h3 className="font-serif text-base font-semibold text-foreground tracking-tight">
                Campagnes email
              </h3>
              <p className="text-xs text-muted-foreground mt-0.5">
                SCPI trimestrielles et perf Stellium AV/PER · {summaryHint}
              </p>
            </div>
          </button>
          <div className="flex flex-wrap gap-2 shrink-0">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="text-xs h-8"
              onClick={() => setRefreshKey((k) => k + 1)}
            >
              Actualiser
            </Button>
            {onNavigate && hasActiveReady ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="gap-1"
                onClick={() =>
                  navigateToSuivi(onNavigate, "envois", "ready", undefined, currentPage)
                }
              >
                Envois
                <ArrowRight className="h-4 w-4" />
              </Button>
            ) : null}
          </div>
        </div>
      </div>

      {!collapsed ? (
        <div className="p-4 sm:p-5 space-y-3">
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
            Prêts = file Suivi → Envois (campagnes SCPI et Perf Stellium regroupées en haut de
            l&apos;onglet).
          </p>
        </div>
      ) : null}
    </div>
  );
}
